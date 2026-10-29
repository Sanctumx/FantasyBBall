// The run of calib_live.js (#146): wiring of live_data/ into rows, the fits and the verdict lines Q, Q_C, R. Pure helpers and their tests are in calib_live.js.
const fs = require('fs'), path = require('path');
const IL = require('./inseason_league.js'), TW = require('./team_win.js'), CB = require('./calib_blend.js'), S = require('./calib_ros_stats.js'), CL = require('./calib_live.js');

const AVAIL = process.argv.includes('avail');   // #144: arms A (Total, g / 82) and R (Total, shrunk games-played rate) only, n0 from calib_avail.json
const DIR = process.env.LIVE_DIR || path.join(__dirname, 'live_data'), J = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const info = J('league_info.json'), draft = J('draft.json'), PROJ = J('proj.json'), BOX = J('box.json'), IDM = J('id_map.json'), WAIVER = PROJ._waiver;
const DAYS = CL.gameSeconds(J('games.json')), L = Object.assign(IL.parseLeague(info), { lastRegular: CL.LAST_REG });
const N0_STD = { g: 10, min: 750, fg: 500, ft: 200 };   // the season-to-date blend's n0 fitted on the other seasons (#156, 2024-25 fold)
const ARMS = AVAIL ? ['A', 'R'] : ['A', 'B', 'C', 'S', 'N'], LKEYS = ['fgp', 'fga', 'ftp', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to', 'm'];
const lineOf = p => Object.fromEntries(LKEYS.map(k => [k, p[k]]));
const OUT = []; const log = s => { OUT.push(s); };
const f2 = x => x.toFixed(2), f4 = x => (x < 0 ? '' : ' ') + x.toFixed(4);

// ---- outcomes (the table of period p must be period p) ----
const body = J('standings/p1.json'), tables = body.responses[0].data.tableList;
tables.slice(0, CL.LAST_REG).forEach((t, i) => { if (t.caption !== 'Scoring Period ' + (i + 1)) throw new Error('standings table ' + i + ' is ' + t.caption); });
const OUTC = CL.parseOutcomes(body);

// ---- divisions, rosters ----
const divOf = {}, DIVS = {};
Object.keys(info.teamInfo).forEach(t => { divOf[t] = info.teamInfo[t].division; (DIVS[divOf[t]] = DIVS[divOf[t]] || []).push(t); });
if (Object.keys(DIVS).length !== 10) throw new Error('divisions: ' + Object.keys(DIVS).length);
// SMOKE=1: two late checkpoints and two divisions, to see the wiring work (numbers meaningless)
const SMOKE = !!process.env.SMOKE, CPS = SMOKE ? (AVAIL ? [2, 16] : [14, 16]) : AVAIL ? [2, 3, 4, 6, 8, 10, 12, 14, 16] : CL.CHECKPOINTS, DIVN = Object.keys(DIVS).sort().slice(0, SMOKE ? 2 : 10);
const rosterCache = new Map();
const ROSTER = day => { if (!rosterCache.has(day)) rosterCache.set(day, IL.parseRosters(J('rosters/d' + Math.min(day, 146) + '.json'))); return rosterCache.get(day); };
const DRAFT = {}; draft.draftPicks.forEach(p => { (DRAFT[p.teamId] = DRAFT[p.teamId] || []).push({ fid: p.playerId, slot: 'ACTIVE' }); });
const pick = (rows, teams) => Object.fromEntries(teams.map(t => [t, rows[t]]));

// ---- players at a checkpoint: projection (or the app's no-projection rule), team on that day ----
const plCache = new Map();
function teamAt(box, cut) { let t = box.length ? box[0][13] : ''; box.forEach(r => { if (r[0] < cut) t = r[13]; }); return IL.toProjTeam(t) || t; }
function actualLine(box, cut) {
  const g = box.filter(r => r[0] < cut && r[12] > 0); if (!g.length) return null;
  const s = i => g.reduce((a, r) => a + r[i], 0), n = g.length;
  return { fgp: s(2) ? s(1) / s(2) : 0, fga: s(2) / n, ftp: s(4) ? s(3) / s(4) : 0, fta: s(4) / n, tpm: s(5) / n, pts: s(6) / n, reb: s(7) / n, ast: s(8) / n, stl: s(9) / n, blk: s(10) / n, to: s(11) / n, m: s(12) / n };
}
// #144 N0_RATE: the games-played n0 fitted on the other seasons for 2024-25 (calib_avail.json, or the N0 variable in a smoke run)
const N0_RATE = !AVAIL ? null : process.env.N0 != null ? +process.env.N0 : JSON.parse(fs.readFileSync('calib_avail.json', 'utf8')).n0['2024-25'];
if (AVAIL && !Number.isFinite(N0_RATE) && N0_RATE !== Infinity) throw new Error('no n0 for 2024-25: run calib_ros.js ... avail first (calib_avail.json) or set N0');
function player(fid, cut, mode) {
  const k = fid + '|' + cut + '|' + mode; if (plCache.has(k)) return plCache.get(k);
  const pr = PROJ[fid], box = BOX[fid] || [], act = pr ? null : actualLine(box, cut), t = teamAt(box, cut), g0 = pr ? pr.g : WAIVER.g;
  // mode 'rate': g becomes the one whose Total availability (min(1, g / 82)) is the shrunk games-played rate; the line stays the preseason one
  const g = mode === 'rate' ? CL.rateG(g0, CB.aggregate(box, -Infinity, cut - 1).gp, CL.teamGamesBefore(DAYS.games[t], cut), N0_RATE) : g0;
  const p = { key: fid, n: (IDM[fid] || {}).name || fid, t, pos: '', mpg: null, actual: null, pid: null,
    src: pr ? 'proj' : act ? 'actual' : 'waiver', line: pr ? (mode === 'std' ? CL.stdLine(lineOf(pr), box, cut, N0_STD) : lineOf(pr)) : act || lineOf(WAIVER), g, adp: pr ? pr.adp : null };
  plCache.set(k, p); return p;
}
const fidsOf = rowsList => [...new Set([].concat(...rowsList.map(r => [].concat(...Object.values(r).map(x => x.map(y => y.fid))))))];

// ---- the run ----
const T0 = Date.now(), cols = CL.newCols(ARMS), per = n => L.periods[n - 1], dayOf = n => CL.rosterDay(per(n));
const churn = {}, srcCount = [], lagOf = (q, c) => q - c;
let step = 0; const STEPS = CPS.length * DIVN.length * 2;
const eta = () => { step++; const el = (Date.now() - T0) / 1000, left = Math.round(el / step * (STEPS - step)); process.stdout.write('\rEstimated time remaining: ' + Math.floor(left / 60) + ' min ' + String(left % 60).padStart(2, '0') + ' s   '); };
CPS.forEach((c, ci) => {
  const cut = dayOf(c) - 1, qs = CL.outcomePeriods(c), ctxs = [];
  // pass 1: one ctx per division (preseason lines) and the pooled N = 120 engine from every owned player of the checkpoint
  DIVN.forEach(dv => {
    const teams = DIVS[dv], rowsC = pick(ROSTER(dayOf(c)), teams), rowsQ = Object.fromEntries(qs.map(q => [q, pick(ROSTER(dayOf(q)), teams)]));
    const fids = fidsOf([rowsC, pick(DRAFT, teams)].concat(qs.map(q => rowsQ[q])));
    const ctx = CL.divisionCtx({ L, players: fids.map(f => player(f, cut, 'pre')), rows: rowsC, DAYS, nowMs: per(c).start });
    ctxs.push({ dv, teams, rowsC, rowsQ, fids, ctx });
    const own = fidsOf([rowsC]), cnt = { proj: 0, actual: 0, waiver: 0 }; own.forEach(f => { cnt[player(f, cut, 'pre').src]++; }); srcCount.push(Object.assign({ c }, cnt));
    qs.forEach(q => { const have = new Set(rowsC && fidsOf([rowsC])), now = fidsOf([rowsQ[q]]); const z = churn[lagOf(q, c)] = churn[lagOf(q, c)] || [0, 0]; z[0] += now.filter(f => !have.has(f)).length; z[1] += now.length; });
    eta();
  });
  const seen = new Set(), pooled = []; ctxs.forEach(x => x.ctx.pool.players.forEach(p => { if (p.owner && !seen.has(p.key)) { seen.add(p.key); pooled.push(p); } }));
  const eN = AVAIL ? null : TW.engCtxFrom(pooled.sort((a, b) => (a.adp == null ? 1e9 : a.adp) - (b.adp == null ? 1e9 : b.adp)).map(p => Object.assign({}, p.line, { g: p.g })), 120, L.maxActive, 9);
  // pass 2: the arms' forecasts and the outcome rows
  ctxs.forEach((x, d) => {
    const { teams, rowsC, rowsQ, fids, ctx } = x, e = CL.engineFor(ctx), W = TW.weeksLeft(ctx);
    let fc;
    if (AVAIL) {   // same engine context and rosters as A; only the availability of each player differs
      const ctxR = CL.divisionCtx({ L, players: fids.map(f => player(f, cut, 'rate')), rows: rowsC, DAYS, nowMs: per(c).start });
      fc = { A: CL.forecast(ctx, e, rowsC, W), R: CL.forecast(ctxR, e, rowsC, W) };
    } else {
      const ctxS = CL.divisionCtx({ L, players: fids.map(f => player(f, cut, 'std')), rows: rowsC, DAYS, nowMs: per(c).start });
      fc = { A: CL.forecast(ctx, e, rowsC, W), C: CL.forecast(ctx, e, pick(DRAFT, teams), W), S: CL.forecast(ctxS, CL.engineFor(ctxS), rowsC, W), N: CL.forecast(ctx, eN, rowsC, W) };
    }
    const idx = Object.fromEntries(Object.keys(ctx.roster).map((t, i) => [t, i]));
    qs.forEach(q => {
      if (!AVAIL) fc.B = CL.forecast(ctx, e, rowsQ[q], W);
      OUTC[q].filter(o => o.a in idx && o.b in idx).forEach(o => CL.pushRows(cols, fc, idx[o.a], idx[o.b], o, { wk: q, sd: DIVN.indexOf(x.dv), ck: ci }));
    });
    eta();
  });
});
process.stdout.write('\n');
const D = CL.finish(cols), M = { kind: 'M' }, C = { kind: 'C' };

// ---- #144 report (gate A5, live half: R minus A at periods 2, 3, 4, d <= 0 in each; sign test only, the SE is wide) ----
if (AVAIL) {
  const kA = { kM: S.fitK(D, 'A', M), kC: S.fitK(D, 'A', C) }, kR = { kM: S.fitK(D, 'R', M), kC: S.fitK(D, 'R', C) }, aA = { src: 'A', kM: kA.kM, kC: kA.kC }, aR = { src: 'R', kM: kR.kM, kC: kR.kC };
  const sA = { src: 'A', kM: CL.SHIPPED.match, kC: CL.SHIPPED.cat }, sR = { src: 'R', kM: CL.SHIPPED.match, kC: CL.SHIPPED.cat };
  log(`#144 live availability  ${new Date().toISOString().slice(0, 10)}  LOFB 2024-25, ${DIVN.length} divisions x 12 teams, checkpoints (start of period) ${CPS.join(', ')}, n0 ${N0_RATE}  rows ${D.n}${SMOKE ? '  [SMOKE: numbers meaningless]' : ''}`);
  log('Arms: A live rosters, Total basis, availability g / 82 (IL slots count at it) | R the same with the shrunk games-played rate (gp and team games before the checkpoint). Same engine context and rosters; each arm has its own in-sample k.');
  log(`k* A match ${f2(kA.kM)} cat ${f2(kA.kC)} | R match ${f2(kR.kM)} cat ${f2(kR.kC)}`);
  const pm = (a, b, o) => { const d = S.diffSE(D, a, b, o); return `${f4(d.d)} +-${d.se.toFixed(4)}`; }, early = CPS.map((c, ci) => ci).filter(ci => CPS[ci] <= 4);
  const dEarly = early.map(ci => S.diffSE(D, aR, aA, { kind: 'M', ck: ci }));
  early.forEach((ci, i) => log(`period ${CPS[ci]}: R minus A matchup ${f4(dEarly[i].d)} +-${dEarly[i].se.toFixed(4)} (fitted k) | shipped k ${pm(sR, sA, { kind: 'M', ck: ci })} | cats ${pm(aR, aA, { kind: 'C', ck: ci })}`));
  log(`all checkpoints: R minus A matchup ${pm(aR, aA, M)} | cats ${pm(aR, aA, C)} | late (period >= 6) matchup ${pm(aR, aA, { kind: 'M', f: i => CPS[D.ck[i]] >= 6 })}`);
  const a5 = require('./calib_avail.js').gateA5Live(dEarly);
  const V = [`A5 live half (R minus A matchup at periods 2-4, d <= 0 in each): ${a5 ? 'PASS' : 'FAIL'}  (` + early.map((ci, i) => `p${CPS[ci]} ${dEarly[i].d.toFixed(4)}+-${dEarly[i].se.toFixed(4)}`).join(', ') + ')'];
  V.forEach(log);
  fs.writeFileSync(SMOKE ? 'results_calib_live_avail_smoke.txt' : 'results_calib_live_avail.txt', OUT.join('\n') + '\n');
  fs.writeFileSync(SMOKE ? 'calib_live_avail_smoke.json' : 'calib_live_avail.json', JSON.stringify({ rows: D.n, n0: N0_RATE, cps: CPS, kA, kR, dEarly, verdict: V }));
  if (SMOKE) console.log(OUT.join('\n'));
  process.exit(0);
}

// ---- report ----
const sumSrc = srcCount.reduce((a, s) => ({ proj: a.proj + s.proj, actual: a.actual + s.actual, waiver: a.waiver + s.waiver }), { proj: 0, actual: 0, waiver: 0 }), nOwn = sumSrc.proj + sumSrc.actual + sumSrc.waiver;
log(`#146 live-roster k  ${new Date().toISOString().slice(0, 10)}  LOFB 2024-25, ${DIVN.length} divisions x 12 teams, checkpoints (start of period) ${CPS.join(', ')}, outcomes periods c..${CL.LAST_REG}  rows ${D.n}`);
log(`Arms: A live rosters + app preseason lines | B oracle (each outcome period's first-day roster) | C frozen draft rosters | S A with the season-to-date blend lines (n0 g ${N0_STD.g}, min ${N0_STD.min}, fg ${N0_STD.fg}, ft ${N0_STD.ft}) | N A with the engine context at N = 120`);
log(`Roster players at the checkpoints by line source: projection ${(100 * sumSrc.proj / nOwn).toFixed(1)}%, actual-to-date ${(100 * sumSrc.actual / nOwn).toFixed(1)}%, waiver level ${(100 * sumSrc.waiver / nOwn).toFixed(1)}%`);
log('Churn (share of the roster at the first day of an outcome period that was not on the checkpoint roster), by periods after the checkpoint: ' + Object.keys(churn).map(l => `${l}: ${(100 * churn[l][0] / churn[l][1]).toFixed(0)}%`).join('  '));
const K = {}, arm = {};
log('\nk* by arm (shrink toward 50%; shipped .60 match / .75 category; backtest .43 / .65)');
ARMS.forEach(a => {
  const m = S.kSE(D, a, M), c = S.kSE(D, a, C); K[a] = { m, c };
  arm[a] = { m: { brierRaw: S.brier(D, { src: a, kM: 1, kC: 1 }, M), brierShipped: S.brier(D, { src: a, kM: CL.SHIPPED.match, kC: 1 }, M), brierFit: S.brier(D, { src: a, kM: m.k, kC: 1 }, M) }, c: { brierRaw: S.brier(D, { src: a, kM: 1, kC: 1 }, C), brierShipped: S.brier(D, { src: a, kM: 1, kC: CL.SHIPPED.cat }, C), brierFit: S.brier(D, { src: a, kM: 1, kC: c.k }, C) } };
  log(`${a}  match k ${f2(m.k)} +-${f2(m.se)} (period ${f2(m.seWeek)}, division ${f2(m.seSeed)}) Brier raw ${f4(arm[a].m.brierRaw)} at .60 ${f4(arm[a].m.brierShipped)} at k* ${f4(arm[a].m.brierFit)} | category k ${f2(c.k)} +-${f2(c.se)} Brier raw ${f4(arm[a].c.brierRaw)} at .75 ${f4(arm[a].c.brierShipped)} at k* ${f4(arm[a].c.brierFit)}`);
});
const byDivK = (a, o) => DIVN.map((_, d) => S.fitK(D, a, Object.assign({ f: i => D.sd[i] === d }, o)));
const dM = byDivK('A', M), dC = byDivK('A', C);
log('\nk* by division, arm A: match ' + dM.map(f2).join(' ') + ' | category ' + dC.map(f2).join(' '));
const q = CL.decide({ k: K.A.m.k, se: K.A.m.se, byDiv: dM, shipped: CL.SHIPPED.match }), qc = CL.decide({ k: K.A.c.k, se: K.A.c.se, byDiv: dC, shipped: CL.SHIPPED.cat });
const rM = CL.kDiffSE(D, 'A', 'B', M), rC = CL.kDiffSE(D, 'A', 'B', C), mvM = CL.decideDiff(rM), mvC = CL.decideDiff(rC);
const V = [
  `Q    live match k (arm A) ${f2(K.A.m.k)} +-${f2(K.A.m.se)}, rounded ${q.k.toFixed(2)} vs shipped .60: ${q.ship ? 'SHIP ' + q.k.toFixed(2) : 'KEEP .60'}  (2 SE bar and ${q.agree} of 10 divisions on the same side; the rule needs 8)`,
  `Q_C  live category k (arm A) ${f2(K.A.c.k)} +-${f2(K.A.c.se)}, rounded ${qc.k.toFixed(2)} vs shipped .75: ${qc.ship ? 'SHIP ' + qc.k.toFixed(2) : 'KEEP .75'}  (${qc.agree} of 10 divisions on the same side)`,
  `R    moves matter, match k_B - k_A ${f4(rM.d)} +-${rM.se.toFixed(4)} (period ${rM.seWeek.toFixed(4)}, division ${rM.seDiv.toFixed(4)}): ${mvM.moves ? 'YES' : 'no / inconclusive'} (${mvM.agree} of 10 divisions agree); category ${f4(rC.d)} +-${rC.se.toFixed(4)}: ${mvC.moves ? 'YES' : 'no / inconclusive'} (${mvC.agree} of 10)`
];
// printed, not gated
const lagB = [[0, 1], [2, 3], [4, 7], [8, 16]];
log('\nk* of arm A by checkpoint (period), match: ' + CPS.map((c, ci) => `${c}: ${f2(S.fitK(D, 'A', { kind: 'M', ck: ci }))}`).join('  '));
log('k* of arm A by lag (outcome period - checkpoint), match: ' + lagB.map(([a, b]) => `${a}-${b}: ${f2(S.fitK(D, 'A', { kind: 'M', f: i => { const lag = D.wk[i] - CPS[D.ck[i]]; return lag >= a && lag <= b; } }))}`).join('  '));
log(`k* without the two-week period 16: arm A match ${f2(S.fitK(D, 'A', { kind: 'M', f: i => D.wk[i] !== 16 }))}, category ${f2(S.fitK(D, 'A', { kind: 'C', f: i => D.wk[i] !== 16 }))}`);
log(`Frozen draft arm C against the backtest: match ${f2(K.C.m.k)} vs .43, category ${f2(K.C.c.k)} vs .65`);
log(`Season-to-date lines (S) vs preseason lines (A), match Brier at each arm's k*: ${f4(arm.S.m.brierFit)} vs ${f4(arm.A.m.brierFit)}; engine N = 120 (N) vs N = 12 (A): k ${f2(K.N.m.k)} vs ${f2(K.A.m.k)}`);
log('\n== Verdict (rules fixed in docs/superpowers/specs/2026-10-29-live-roster-k-design.md before any result; the analyst judges)');
V.forEach(log);
fs.writeFileSync(SMOKE ? 'results_calib_live_smoke.txt' : 'results_calib_live.txt', OUT.join('\n') + '\n');
fs.writeFileSync(SMOKE ? 'calib_live_smoke.json' : 'calib_live.json', JSON.stringify({ rows: D.n, k: K, arm, byDiv: { dM, dC }, churn, srcCount, verdict: V }));
if (SMOKE) console.log(OUT.join('\n'));   // a real run keeps the console to the one ETA line; the report is in results_calib_live.txt
process.exit(0);
