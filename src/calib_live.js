// Live-roster k on the real LOFB 2024-25 league (#146, 2026-10-29; design: docs/superpowers/specs/2026-10-29-live-roster-k-design.md).
// Usage (from src/): node --max-old-space-size=4096 calib_live.js  -> results_calib_live.txt, calib_live.json   (data: live_data/, see prep_live.py)
// Forecasts are the Team tab's own (TeamWin.tabState -> side -> teamVec -> evalVecs, Engine.evaluate), unshrunk, one engine context per division of
// 12 teams (the 10 divisions draft the same pool, so a player can sit in several divisions). They are scored against every later regular period's
// real matchups (periods 1-17; each team plays two opponents a period; 9 category rows + 1 match row per matchup).
// Arms: A live (the roster on the checkpoint day, the app's preseason lines), B oracle (A's lines, each outcome period's own first-day roster),
// C frozen draft rosters (the bridge to the backtest's .43 / .65), S (A's rosters with the season-to-date blend lines), N (A with the engine context at N = 120).
const fs = require('fs'), path = require('path');
const IL = require('./inseason_league.js'), M = require('./matchup_core.js'), T = require('./team_core.js'), TW = require('./team_win.js'), CB = require('./calib_blend.js'), S = require('./calib_ros_stats.js');

const FIRST_DAY = '2024-10-22', LAST_REG = 17, SHIPPED = { match: 0.6, cat: 0.75 };
const CHECKPOINTS = [2, 4, 6, 8, 10, 12, 14, 16];   // forecasts at the start of these periods, scored on periods c .. 17
const outcomePeriods = c => Array.from({ length: LAST_REG - c + 1 }, (_, i) => c + i);
const dayNo = d => Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(FIRST_DAY + 'T00:00:00Z')) / 864e5);
// the 1-based Fantrax roster day on which a period starts (days start at 19:00 ET on their date, as the periods do)
const rosterDay = per => dayNo(IL.nyDay(per.start)) + 1;

// ---- outcomes ----
const CAT_OF = { 'FG%': 0, 'FT%': 1, '3PTM': 2, PTS: 3, REB: 4, AST: 5, ST: 6, BLK: 7, TO: 8 };
const num = c => parseFloat(c.toolTip != null ? c.toolTip : c.content);
// the getStandings SCHEDULE answer -> { period: [{ a, b, cat[9], match }] } (a's result against b; 1 win, .5 tie, 0 loss), one entry per matchupId, periods 1..maxPeriod
function parseOutcomes(body, maxPeriod) {
  const tables = body.responses[0].data.tableList, out = {};
  for (let p = 1; p <= Math.min(maxPeriod == null ? LAST_REG : maxPeriod, tables.length); p++) {
    const t = tables[p - 1], names = t.header.cells.map(c => c.shortName), by = new Map();
    t.rows.forEach(r => { if (!by.has(r.matchupId)) by.set(r.matchupId, {}); by.get(r.matchupId)[r.fixedCells[0].teamId] = r; });
    out[p] = [...by.entries()].map(([id, rows]) => {
      const [a, b] = id.split('_'), ra = rows[a], rb = rows[b];
      if (!ra || !rb) throw new Error('matchup without both rows: period ' + p + ' ' + id);
      const cat = new Array(9).fill(0);
      names.forEach((nm, k) => { if (nm in CAT_OF) { const c = CAT_OF[nm], x = num(ra.cells[k]), y = num(rb.cells[k]); cat[c] = x === y ? 0.5 : (c === 8 ? x < y : x > y) ? 1 : 0; } });
      const w = num(ra.cells[0]), l = num(ra.cells[1]);
      return { a, b, cat, match: w > l ? 1 : w < l ? 0 : 0.5 };
    });
  }
  return out;
}

// ---- lines and games ----
// a preseason line blended with the games before day `cut` (days since 2024-10-22), the #145 season-to-date blend; rows are [day, fgm, fga, ftm, fta, fg3m, pts, reb, ast, stl, blk, tov, min]
const stdLine = (line, rows, cut, n0) => CB.blendAgg(line, CB.aggregate(rows, -Infinity, cut - 1), n0);
// { team: [dates] } -> the DAYS the Team tab reads: tip-off seconds, 20:00 ET of each date (the local day, UTC - 6 h, then reads the date)
function gameSeconds(byTeam) {
  const games = {};
  Object.keys(byTeam).forEach(t => { const k = IL.toProjTeam(t) || t; games[k] = byTeam[t].map(d => Date.parse(d + 'T00:00:00Z') / 1000 + 86400 + 1800).sort((x, y) => x - y); });
  return { games };
}

// #144: a team's games on dates before day `cut` (days since FIRST_DAY, the box rows' day numbers); secs are gameSeconds' (date 00:00 UTC + 1 day + 30 min)
const teamGamesBefore = (secs, cut) => (secs || []).filter(s => Math.round((s - 86400 - 1800 - Date.parse(FIRST_DAY + 'T00:00:00Z') / 1000) / 86400) < cut).length;
// #144: the g that the Total basis (avail = min(1, g / 82)) turns into the shrunk games-played rate of CalibAvail.rate
const rateG = (g, gp, tg, n0) => 82 * require('./calib_avail.js').rate(gp, tg, g, n0);

// ---- the Team tab's forecast on one division ----
// players: [{ key, n, t, g, line, adp, src, ... }] (everyone who may be on a roster); rows: { team: [{ fid, slot: ACTIVE | RESERVE | IR }] } at the checkpoint
function divisionCtx({ L, players, rows, DAYS, nowMs }) {
  const owner = {}, slot = {};
  Object.keys(rows).forEach(t => rows[t].forEach(x => { owner[x.fid] = t; slot[x.fid] = x.slot; }));
  const list = players.map(p => Object.assign({}, p, { owner: owner[p.key] || null, slot: slot[p.key] || null, fxStatus: p.key in owner ? 'T' : null })), byKey = new Map(list.map(p => [p.key, p]));
  Object.keys(owner).forEach(f => { if (!byKey.has(f)) throw new Error('rostered player not in the pool: ' + f); });
  const ctx = M.makeCtx({ L, pool: { players: list, byKey }, DAYS, rosters: rows, me: Object.keys(rows)[0], nowMs });
  ctx.teamTab = true; ctx.basis = 'total';   // the Team tab's seasonal rules (TeamWin.leagueWin's default basis)
  return ctx;
}
// the engine context of a ctx, as TeamWin's engCtx builds it (rostered players first, then by ADP), N teams of R players
function engineFor(ctx, N) {
  const adp = p => (p.adp == null ? 1e9 : p.adp), list = ctx.pool.players.filter(p => p.g > 0).sort((a, b) => (a.owner ? 0 : 1) - (b.owner ? 0 : 1) || adp(a) - adp(b));
  return TW.engCtxFrom(list.map(p => Object.assign({}, p.line, { g: p.g })), N || Object.keys(ctx.roster).length, ctx.L.maxActive, 9);
}
// every team's forecast for the rosters `rows` ({ team: [{ fid, slot }] }), W weeks left; ids follow ctx.roster
function forecast(ctx, e, rows, W) {
  const ids = Object.keys(ctx.roster), out = TW.evalVecs(e, ids.map(t => TW.teamVec(e, TW.side(ctx, T.tabState(rows[t]), W))));
  return { ids, match: (i, j) => out.pairProb(out.teams[i], out.teams[j]), cat: (i, j, c) => out.catProb(out.teams[i], out.teams[j], c) };
}

// ---- rows ----
const newCols = arms => ({ p: Object.fromEntries(arms.map(a => [a, []])), y: [], wk: [], sd: [], cat: [], ck: [] });
function pushRows(cols, fc, i, j, out, meta) {
  const add = (c, y, f) => { Object.keys(cols.p).forEach(a => cols.p[a].push(f(fc[a]))); cols.y.push(y); cols.wk.push(meta.wk); cols.sd.push(meta.sd); cols.cat.push(c); cols.ck.push(meta.ck); };
  for (let c = 0; c < 9; c++) add(c, out.cat[c], f => f.cat(i, j, c));
  add(9, out.match, f => f.match(i, j));
}
function finish(cols) {
  const D = { n: cols.y.length, y: Float32Array.from(cols.y), wk: Uint8Array.from(cols.wk), sd: Uint8Array.from(cols.sd), cat: Uint8Array.from(cols.cat), ck: Uint8Array.from(cols.ck), p: {} };
  Object.keys(cols.p).forEach(a => { D.p[a] = Float32Array.from(cols.p[a]); });
  return D;
}

// ---- k differences and the decision rules (fixed in the design before any result) ----
const sdOf = ds => { const m = ds.reduce((s, x) => s + x, 0) / ds.length; return Math.sqrt(ds.reduce((s, x) => s + (x - m) ** 2, 0) / (ds.length - 1)); };
// k_b - k_a on the same rows; SE = the larger of the outcome-period and the division cluster bootstraps; byDiv = the difference inside each division
function kDiffSE(D, a, b, o) {
  const pa = D.p[a], pb = D.p[b], ok = i => (o.kind === 'M' ? D.cat[i] === 9 : D.cat[i] < 9) && (!o.f || o.f(i));
  const sums = key => {
    const C = new Float64Array(4 * 256);
    for (let i = 0; i < D.n; i++) if (ok(i)) { const y = D.y[i] - 0.5, da = pa[i] - 0.5, db = pb[i] - 0.5, c = 4 * key[i]; C[c] += da * y; C[c + 1] += da * da; C[c + 2] += db * y; C[c + 3] += db * db; }
    return C;
  };
  const dk = s => s[2] / s[3] - s[0] / s[1], boot = key => {
    const C = sums(key), cl = []; for (let c = 0; c < 256; c++) if (C[4 * c + 1] > 0) cl.push(C.subarray(4 * c, 4 * c + 4));
    let r = 31; const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }, ds = [];
    for (let t = 0; t < 500; t++) { const s = [0, 0, 0, 0]; for (let j = 0; j < cl.length; j++) { const q = cl[Math.floor(rnd() * cl.length)]; for (let m = 0; m < 4; m++) s[m] += q[m]; } ds.push(dk(s)); }
    const tot = [0, 0, 0, 0]; cl.forEach(q => { for (let m = 0; m < 4; m++) tot[m] += q[m]; });
    return { d: dk(tot), se: sdOf(ds) };
  };
  const w = boot(D.wk), s = boot(D.sd), byC = sums(D.sd), byDiv = [];
  for (let c = 0; c < 256; c++) if (byC[4 * c + 1] > 0) byDiv.push(dk(byC.subarray(4 * c, 4 * c + 4)));
  return { d: w.d, se: Math.max(w.se, s.se), seWeek: w.se, seDiv: s.se, byDiv };
}
const round05 = x => Math.round(x * 20) / 20;
// ship a new live k only if the rounded k differs from the shipped one by more than 2 SE and at least 8 of 10 divisions are on the same side
function decide({ k, se, byDiv, shipped }) {
  const kr = round05(k), side = Math.sign(k - shipped), agree = byDiv.filter(x => Math.sign(x - shipped) === side && side !== 0).length;
  return { ship: Math.abs(kr - shipped) > 1e-9 && Math.abs(kr - shipped) > 2 * se + 1e-9 && agree >= 8, k: kr, agree };
}
// the oracle gap: k_B - k_A beyond 2 SE with the same sign in at least 8 of 10 divisions
function decideDiff({ d, se, byDiv }) {
  const agree = byDiv.filter(x => Math.sign(x) === Math.sign(d) && d !== 0).length;
  return { moves: Math.abs(d) > 2 * se + 1e-9 && agree >= 8, agree };
}

module.exports = { FIRST_DAY, LAST_REG, SHIPPED, CHECKPOINTS, outcomePeriods, rosterDay, parseOutcomes, stdLine, gameSeconds, divisionCtx, engineFor, forecast, newCols, pushRows, finish, kDiffSE, round05, decide, decideDiff, teamGamesBefore, rateG };
if (require.main === module) require('./calib_live_main.js');
