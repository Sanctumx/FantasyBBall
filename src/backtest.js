const E = require('./engine.js');
const DATA = require('./bt_data.json');
const SCHED = require('./bt_sched.json');
// fantasy playoffs in the backtest seasons: calendar weeks 18-23 (index 17-22), rounds of 2 weeks (All-Star week merged into round 1)
const PO_WEEKS = [17, 18, 19, 20, 21, 22];
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const N = 14, R = 12, TOTAL = N * R;
const ctxCache = {};
// Real preseason projections (2026-10-17, bt_proj.py → bt_proj.json): cfgExtra.proj 'bbm' | 'hs' | 'avg' replaces each
// matched player's projection (unmatched keep the prior-season line); cfgExtra.realAdp uses the real preseason ADP as the
// market (players without one go after everyone who has one). cfgExtra.oppProj: the projections the opponents and the
// market see (default: the same as the board's), so the board's source can change while the rest of the league stays fixed.
let PROJ = null; try { PROJ = require('./bt_proj.json'); } catch (e) {}
// cfgExtra.adpBlend = w (2026-10-17, adp_fit.py → adp_blend.json): the board's per-game volume scaled so each player's season
// value = (1 − w)·projected + w·ADP-implied. Board only: opponents and the market keep the unblended projections.
let BLEND = null; try { BLEND = require('./adp_blend.json'); } catch (e) {}
let KINJ = null; try { KINJ = require('./known_inj.json'); } catch (e) {}
const VOL = ['m', 'pts', 'tpm', 'reb', 'ast', 'stl', 'blk', 'fga', 'fta', 'to'];
const PK = ['g', 'm', 'pts', 'tpm', 'reb', 'ast', 'stl', 'blk', 'fga', 'fta', 'to'];
function projApply(p, season, x) {
  const e = PROJ && PROJ[season] && PROJ[season][String(p.pid)]; if (!e) return p;
  const o = Object.assign({}, p);
  let st = null;
  if (x.proj === 'avg') { if (e.bbm && e.hs) { st = {}; PK.forEach(k => { st[k] = (e.bbm[k] + e.hs[k]) / 2; }); st.fgp = st.fga ? (e.bbm.fgp * e.bbm.fga + e.hs.fgp * e.hs.fga) / 2 / st.fga : e.bbm.fgp; st.ftp = st.fta ? (e.bbm.ftp * e.bbm.fta + e.hs.ftp * e.hs.fta) / 2 / st.fta : e.bbm.ftp; } else st = e.bbm || e.hs || null; }
  else if (x.proj) st = e[x.proj] || null;
  if (st) { PK.concat(['fgp', 'ftp']).forEach(k => { o[k] = st[k]; }); o.g = Math.max(1, Math.min(82, o.g)); }
  // known preseason injury (known_inj.json: out 5+ opening games) with a real projection of 10-69 games: kg = the games the
  // projection leaves out (82 − g), as BBM's injury notes imply. Used only when cfg.knownW > 0 (IL stash tests, 2026-10-17).
  if (st && KINJ && KINJ[season] && KINJ[season][String(p.pid)] && o.g >= 10 && o.g < 70) o.kg = 82 - o.g;
  if (x.adpBlend) { const sc = BLEND && BLEND[season] && BLEND[season][String(x.adpBlend)]; const f = sc && sc[String(p.pid)]; if (f) VOL.forEach(k => { o[k] *= f; }); }
  if (x.realAdp) { o.adp = o.ftx = e.adp != null ? e.adp : 250 + p.ftx; }
  return o;
}
function setup(season, cfgExtra) {
  const key = season + JSON.stringify(cfgExtra);
  if (ctxCache[key]) return ctxCache[key];
  const P = E.prepPlayers(DATA[season].players.map(p => projApply(p, season, cfgExtra || {})));
  // fast: skip page-only work and run punt-plan Gain passes on the top 40 (2026-10-16: identical rosters in 72/72 test drafts, 3.4x faster)
  const cfg = Object.assign({ fast: true, teams: N, roster: R, slot: 1, order: 'snake', scoring: 'most', cats: 9, adpSrc: 'ftx', basis: 'mix', orderBy: 'gainM', catW: [1,1,1,1,1,1,1,1,1], scarZ: 'off', scarP: 'off', zdrop: 0 }, cfgExtra);
  const ctx = E.buildContext(P, cfg);
  // each player's playoff edge from his team's real games in the playoff weeks (as the page does from the NBA schedule)
  const G = SCHED[season].games, teamPo = t => G[t] ? PO_WEEKS.reduce((s, w) => s + G[t][w], 0) : null;
  const avg = Object.keys(G).reduce((s, t) => s + teamPo(t), 0) / Object.keys(G).length;
  P.forEach(p => { const g = teamPo(p.t); p.poEdge = g != null ? g / avg - 1 : 0; });
  return ctxCache[key] = { P, cfg, ctx };
}
// cfg.posScar (backtests, 2026-10-17): position "wait cost". For each role (G = PG/SG, F = SF/PF, C) the drop in the best
// Win M available from now to my next pick (expected, from each player's chance to last), minus the same drop over all
// players. A player who fills a role my roster still needs (G 3, F 3, C 2 eligible players, for PG SG G / SF PF F / C C)
// gets λ × the largest such extra drop among his roles. Positions from p.p ('PG/SG').
const ROLE = { G: ['PG', 'SG'], F: ['SF', 'PF'], C: ['C'] }, ROLE_NEED = { G: 3, F: 3, C: 2 };
const roleOf = p => { const ps = String(p.p || '').split('/'); return Object.keys(ROLE).filter(r => ROLE[r].some(x => ps.includes(x))); };
function expBest(list) { let e = 0, none = 1; for (const p of list) { const a = p.lastsTo == null ? 0 : p.lastsTo; e += none * a * p.gainM; none *= 1 - a; } return e; }
function posScarPick(P, av, picks, k, me, lam) {
  const mine = picks.slice(0, k).map((id, j) => (id != null && E.teamAt(j, N, 'snake') === me ? P[id] : null)).filter(Boolean);
  const byV = av.slice().sort((a, b) => b.gainM - a.gainM);
  const drop = list => (list.length ? list[0].gainM - expBest(list) : 0), dAll = drop(byV), extra = {};
  for (const r in ROLE) {
    const have = mine.filter(p => roleOf(p).includes(r)).length;
    extra[r] = have >= ROLE_NEED[r] ? 0 : Math.max(0, drop(byV.filter(p => roleOf(p).includes(r))) - dAll);
  }
  let best = null, bs = -Infinity;
  for (const p of av) { const sc = p.gainM + lam * Math.max(0, ...roleOf(p).map(r => extra[r])); if (sc > bs) { bs = sc; best = p.id; } }
  return best;
}
// cfg.look2 = K (backtests, 2026-10-17): two-pick joint look-ahead. For the K best players by Win M now, the board
// re-runs with him added to your roster and values your next pick as the expected Win M of the best player likely still
// there (each with his chance of lasting); it takes the player with the best Win M now + that next-pick value, so the
// next pick is valued for the roster it will actually join (overlap and complements), not the current one.
function look2Pick(P, ctx, cfg, picks, k, av, K) {
  if (cfg.look2Engine) return E.lookAhead2(P, ctx, cfg, { picks }, K, null).modelPick;
  const cands = av.slice().sort((a, b) => b.gainM - a.gainM).slice(0, K).map(p => ({ id: p.id, now: p.gainM }));
  let best = cands[0].id, bs = -Infinity;
  for (const c of cands) {
    const pk = picks.slice(); pk[k] = c.id;
    const res = E.evaluate(P, ctx, cfg, { picks: pk });
    const left = P.filter(p => p.id !== c.id && !pk.includes(p.id)).sort((a, b) => b.gainM - a.gainM).slice(0, 30);
    let mass = 1, nxt = 0; for (const o of left) { const q = o.thereAt == null ? 1 : o.thereAt; nxt += mass * q * o.gainM; mass *= 1 - q; if (mass < 1e-4) break; }
    const sc = c.now + nxt; if (sc > bs) { bs = sc; best = c.id; }
  }
  return best;
}
// sl.value 'blend': value = mean of standardized soft Zscore and standardized Win C (sl.wc = Win C share, default 0.5).
// sl.fit 'look2': fit = Win M + the look-ahead's next-pick value (minus its average), computed for the 4 best by Win M
// and the 4 best by value; only those candidates are scored. Needs P, ctx, cfg, picks, k (passed via sl._ctx).
function slidePick(av, myRound, sl) {
  if (sl.value === 'blend' || sl.value === 'wincOnly' || sl.fit === 'look2') return slidePick2(av, myRound, sl);
  const w = Math.pow(myRound / (R - 1), sl.p == null ? 1 : sl.p), a1 = sl.alpha || 0, a2 = sl.alpha2 || 0;
  const val = sl.value === 'winc' ? (p => p.gain) : (p => { const z = p.boardC.slice(0, 9).map((x, c) => x); const srt = z.slice().sort((x, y) => x - y); return p.board - a1 * Math.min(0, srt[0]) - a2 * Math.min(0, srt[1]); });   // sl.value 'winc': Win C as the value side
  const pool = new Set([...av].sort((a, b) => b.gainM - a.gainM).slice(0, 40).concat([...av].sort((a, b) => val(b) - val(a)).slice(0, 40)));
  const P2 = [...pool], V = P2.map(val), F = P2.map(p => p.gainM);
  const std = A => { const m = A.reduce((x, y) => x + y, 0) / A.length, s = Math.sqrt(A.reduce((x, y) => x + (y - m) ** 2, 0) / A.length) || 1; return A.map(x => (x - m) / s); };
  const zv = std(V), zf = std(F); let best = P2[0].id, bs = -Infinity;
  P2.forEach((p, i) => { const sc = (1 - w) * zv[i] + w * zf[i]; if (sc > bs) { bs = sc; best = p.id; } });
  return best;
}
function slidePick2(av, myRound, sl) {
  // shape: w = w0 + (1 − w0)·t^p, capped at sl.cap; or a logistic switch at round sl.mid (0-based) with steepness sl.k
  const t = myRound / (R - 1);
  let w = sl.mid != null ? 1 / (1 + Math.exp(-sl.k * (myRound - sl.mid))) : (sl.w0 || 0) + (1 - (sl.w0 || 0)) * Math.pow(t, sl.p == null ? 1 : sl.p);
  if (sl.cap != null) w = Math.min(sl.cap, w);
  const a1 = sl.alpha == null ? 0.5 : sl.alpha, wc = sl.wc == null ? 0.5 : sl.wc;
  // sl.zval 'auto': Zscore under each of Auto's punt plans (punted categories count zero), averaged with Auto's current plan
  // weights for this roster; otherwise soft −1 (worst category's negative z counts at 1 − alpha)
  const strat = sl.zval === 'auto' && sl._ctx && sl._ctx.res && sl._ctx.res.strategies ? sl._ctx.res.strategies.filter(S => S.w != null && S.w > 1e-6) : null;
  const wsum = strat ? strat.reduce((a, S) => a + S.w, 0) : 0;
  const soft = strat && wsum > 0
    ? (p => strat.reduce((a, S) => a + S.w * (p.board - S.punt.reduce((b, c) => b + p.boardC[c], 0)), 0) / wsum)
    : sl.toW != null   // sl.toW (2026-10-17): TO weighted inside soft −1 (worst category judged on weighted z)
      ? (p => { const z = p.boardC.slice(0, 9).map((x, c) => c === 8 ? x * sl.toW : x); return z.reduce((a, b) => a + b, 0) - a1 * Math.min(0, Math.min(...z)); })
      : sl.zTrue   // sl.zTrue (2026-10-18): soft −1 on the true Zscore (engine p.zCl: mean/sd over the top N × R players)
        ? (p => { const z = Array.from(p.zCl.bc).slice(0, 9), srt = z.slice().sort((x, y) => x - y); return p.zCl.z[0] - a1 * Math.min(0, srt[0]); })
        : sl.zH      // sl.zH (2026-10-18): soft −1 on the H2H-adjusted Zscore (engine p.zH: season gap + weekly noise)
        ? (p => { const z = Array.from(p.zH.bc).slice(0, 9), srt = z.slice().sort((x, y) => x - y); return p.zH.z0 - a1 * Math.min(0, srt[0]); })
        : (p => { const q = sl._ctx && sl._ctx.Pv ? sl._ctx.Pv[p.id] : p, srt = q.boardC.slice(0, 9).slice().sort((x, y) => x - y); return q.board - a1 * Math.min(0, srt[0]); });
  const ms = A => { const m = A.reduce((x, y) => x + y, 0) / A.length, s = Math.sqrt(A.reduce((x, y) => x + (y - m) ** 2, 0) / A.length) || 1; return [m, s]; };
  // sl.fitC (2026-10-18): what the fit side (and the look-ahead's next pick) maximizes. Default Win M; 'c' = Win C (the
  // regular season ranks by share of categories won); 'mix' = Win C and Win M at equal weight, each scaled by its spread
  // over the 40 best available now.
  const byM = [...av].sort((a, b) => b.gainM - a.gainM);
  const gF = sl.fitC === 'c' ? (p => p.gain) : sl.fitC === 'mix'
    ? (() => { const t = byM.slice(0, 40), s1 = ms(t.map(p => p.gain))[1], s2 = ms(t.map(p => p.gainM))[1]; return p => 0.5 * p.gain / s1 + 0.5 * p.gainM / s2; })()
    : (p => p.gainM);
  const byF = [...av].sort((a, b) => gF(b) - gF(a)), byS = [...av].sort((a, b) => soft(b) - soft(a)), byC = [...av].sort((a, b) => b.gain - a.gain);
  const P2 = [...new Set(byF.slice(0, 40).concat(byS.slice(0, 40), byC.slice(0, 40)))];
  const S = P2.map(soft), C = P2.map(p => p.gain), F = P2.map(gF), [mS, sS] = ms(S), [mC, sC] = ms(C), [mF, sF] = ms(F);
  // sl.value: 'blend' = 50/50 soft −1 Zscore + Win C; 'wincOnly' = Win C alone (2026-10-17); otherwise soft −1 Zscore alone
  let V = P2.map((p, i) => sl.value === 'blend' ? (1 - wc) * (S[i] - mS) / sS + wc * (C[i] - mC) / sC : sl.value === 'wincOnly' ? (C[i] - mC) / sC : (S[i] - mS) / sS);
  const [mV, sV] = ms(V); V = V.map(v => (v - mV) / sV);
  let cand = P2.map((p, i) => i), fit = F.map(f => (f - mF) / sF);
  if (sl.fit === 'look2') {
    const { P, ctx, cfg, picks, k } = sl._ctx, order = (A) => cand.slice().sort((x, y) => A[y] - A[x]);
    const top = [...new Set(order(F).slice(0, 4).concat(order(V).slice(0, 4)))];
    const nxt = {};
    for (const i of top) {
      const pk = picks.slice(); pk[k] = P2[i].id; E.evaluate(P, ctx, cfg, { picks: pk });
      const t2 = new Set(pk.filter(v => v != null)), left = P.filter(p => !t2.has(p.id)).sort((a, b) => gF(b) - gF(a)).slice(0, 30);
      let mass = 1, e = 0; for (const o of left) { const q = o.thereAt == null ? 1 : o.thereAt; e += mass * q * gF(o); mass *= 1 - q; if (mass < 1e-4) break; }
      nxt[i] = e;
    }
    E.evaluate(P, ctx, cfg, { picks });   // restore every player's numbers to the real state
    const mN = top.reduce((a, i) => a + nxt[i], 0) / top.length;
    cand = top; fit = F.map((f, i) => nxt[i] != null ? (f + nxt[i] - mN - mF) / sF : (f - mF) / sF);
  }
  let best = P2[cand[0]].id, bs = -Infinity;
  for (const i of cand) { const sc = (1 - w) * V[i] + w * fit[i]; if (sc > bs) { bs = sc; best = P2[i].id; } }
  return best;
}
// cfg.upside = λ (backtests, 2026-10-17): late-round upside. Each player has an upside score u (his predicted outcome
// spread, set with setUpside); at overall pick k the board adds λ × k/(last pick) × (Win M scale) × clamp((u − mean u)/sd u, 0, 2),
// so the bonus is 0 at pick 1 and largest at the last pick. Win M scale = mean Win M of the 10 best available.
let UPSIDE = null; function setUpside(m) { UPSIDE = m; }
function upsidePick(av, k, lam) {
  const top = av.slice().sort((a, b) => b.gainM - a.gainM), gs = top.slice(0, 10).reduce((a, p) => a + Math.max(0, p.gainM), 0) / 10;
  const us = av.map(p => (UPSIDE && UPSIDE[p.pid] != null ? UPSIDE[p.pid] : null)).filter(x => x != null);
  const mu = us.reduce((a, b) => a + b, 0) / (us.length || 1), sd = Math.sqrt(us.reduce((a, b) => a + (b - mu) ** 2, 0) / (us.length || 1)) || 1;
  const w = k / (TOTAL - 1); let best = null, bs = -Infinity;
  for (const p of av) { const u = UPSIDE && UPSIDE[p.pid] != null ? Math.min(2, Math.max(0, (UPSIDE[p.pid] - mu) / sd)) : 0;   /* bonus only, capped at 2 sd */ const sc = p.gainM + lam * w * gs * u; if (sc > bs) { bs = sc; best = p.id; } }
  return best;
}
function draft(season, slot, seed, cfgExtra, opp) {
  const { P, ctx } = setup(season, cfgExtra), P0 = P, ctx0 = ctx;
  const cfg = Object.assign({}, setup(season, cfgExtra).cfg, { slot });
  // the league's world: opponents and the market use cfgExtra.oppProj when it differs from the board's projections
  const WO = cfgExtra && ((cfgExtra.oppProj !== undefined && cfgExtra.oppProj !== cfgExtra.proj) || cfgExtra.adpBlend) ? setup(season, Object.assign({}, cfgExtra, { proj: cfgExtra.oppProj !== undefined ? cfgExtra.oppProj : cfgExtra.proj, adpBlend: undefined })) : null;
  const PO = WO ? WO.P : P, ctxO = WO ? WO.ctx : ctx, ORD = cfg.order || 'snake';
  const r = rng(seed * 7919 + slot);
  // opp.trueSd ('v1' | 'v2'): opponents' real draft scatter, independent of the spread the board assumes (cfg.sdModel)
  const sdTrue = opp && opp.trueSd ? (p => E.adpSd(p, cfg.adpSrc, opp.trueSd)) : (p => p.sd);
  const T = PO.map(p => p.adpUse + gauss(r) * sdTrue(p));
  const picks = new Array(TOTAL).fill(null), taken = new Set();
  // opponents who punt: opp = { n, gamma }; each gets a single punt or a top-8 synergy pair, fixed from pick 1
  const oppPunt = new Array(N).fill(null);
  if (opp && opp.n) {
    const ro = rng(seed * 104729 + slot * 7 + opp.n);
    const others = [...Array(N).keys()].filter(t => t !== slot - 1).sort(() => ro() - 0.5).slice(0, opp.n);
    const opts = [...Array(9).keys()].map(c => [c]).concat(ctxO.synPairs.slice(0, 8).map(([a, b2]) => [a, b2]));
    others.forEach(t => { oppPunt[t] = opts[Math.floor(ro() * opts.length)]; });
  }
  const gamma = opp && opp.gamma != null ? opp.gamma : 3;
  // opponents who draft with this board (Gain M, Punt Off): opp.model = how many
  const oppModel = new Array(N).fill(false);
  if (opp && opp.model) { const rm = rng(seed * 7727 + slot * 13 + opp.model); [...Array(N).keys()].filter(t => t !== slot - 1).sort(() => rm() - 0.5).slice(0, opp.model).forEach(t => { oppModel[t] = true; }); }
  // opp.mix (2026-10-17): a league of opponent types on separate teams, { model, punt, sharp, sharpW }.
  // model = drafts with this board (Win M, Auto unless opp.modelPunt), punt = a fixed single punt or top-8 synergy pair,
  // sharp = ranks players by a blend of their value rank (Zscore) and ADP, the rest draft from ADP.
  const oppSharp = new Array(N).fill(false);
  let zr = null; const oppSloppyT = new Array(N).fill(null);
  if (opp && opp.mix) {
    const rx = rng(seed * 31337 + slot * 17), others = [...Array(N).keys()].filter(t => t !== slot - 1).sort(() => rx() - 0.5);
    const m = opp.mix; let i = 0;
    for (let j = 0; j < (m.model || 0); j++) oppModel[others[i++]] = true;
    const opts = [...Array(9).keys()].map(c => [c]).concat(ctxO.synPairs.slice(0, 8).map(([a, b2]) => [a, b2]));
    for (let j = 0; j < (m.punt || 0); j++) oppPunt[others[i++]] = opts[Math.floor(rx() * opts.length)];
    for (let j = 0; j < (m.sharp || 0); j++) oppSharp[others[i++]] = true;
    // m.sloppy (2026-10-17): that many of the remaining ADP drafters are sloppy: each draws his own draft slots with the
    // real-draft spread × m.sloppyK (default 2.5), from a separate random stream so every other draw is unchanged
    for (let j = 0; j < (m.sloppy || 0); j++) { const t2 = others[i++], rs = rng(seed * 6007 + slot * 31 + t2), kk = m.sloppyK || 2.5; oppSloppyT[t2] = PO.map(p => p.adpUse + gauss(rs) * sdTrue(p) * kk); }
    // opp.stdField (2026-10-18): sharp drafters rank by the Standard Zscore with TO ×0.5 (engine p.fieldV), as real Zscore
    // drafters reading BBM/Hashtag likely do; default: the board's team-spread Zscore (boardRaw)
    const fvOpp = opp.stdField ? (p => p.fieldV) : (p => p.boardRaw);
    const order = PO.slice().sort((a, b2) => fvOpp(b2) - fvOpp(a)); zr = new Float64Array(PO.length);
    order.forEach((p, k2) => { zr[p.id] = k2 + 1 + gauss(rx) * (1 + 0.1 * k2); });
  }
  const sharpW = opp && opp.mix && opp.mix.sharpW != null ? opp.mix.sharpW : 0.5;
  if (opp && opp.report) Object.assign(opp.report, { oppPunt: oppPunt.slice(), oppModel: oppModel.slice(), oppSharp: oppSharp.slice() });
  // opp.strat (2026-10-18): one strategy per team, for a league of drafting strategies; 'board' = this board's Model pick
  // drafting for that team, 'z' = best Standard Zscore with TO ×0.5 (p.fieldV), 'h2h' = best H2H-Adjusted Zscore with TO ×0.5,
  // 'adp' = the ADP drafters' board T (real-draft scatter around ADP). The `slot` team must be a 'board' team.
  const strat = opp && opp.strat, cfgMain = cfg, cfgFor = t => t === slot - 1 ? cfgMain : Object.assign({}, cfgMain, { slot: t + 1 });
  const h2hV = p => { let v = 0; for (let c = 0; c < 9; c++) v += p.zH.bc[c] * (c === 8 ? 0.5 : 1); return v; };
  for (let k = 0; k < TOTAL; k++) {
    const t = E.teamAt(k, N, ORD);
    let id;
    if (strat && t !== slot - 1 && strat[t] !== 'board') {
      const av = PO.filter(p => !taken.has(p.id)), s0 = strat[t];
      if (s0 === 'z') id = av.reduce((b2, p) => (p.fieldV > b2.fieldV ? p : b2), av[0]).id;
      else if (s0 === 'h2h') id = av.reduce((b2, p) => (h2hV(p) > h2hV(b2) ? p : b2), av[0]).id;
      else id = av.reduce((b2, p) => (T[p.id] < T[b2.id] ? p : b2), av[0]).id;
    } else if (t === slot - 1 || (strat && strat[t] === 'board')) {
      const cfg = cfgFor(t);
      // cfg.stash = { last, w } (2026-10-17): IL stashes. In your last `last` picks the board credits back w × the games a
      // known-injured player misses (knownW), since 3 IL spots hold him while he is out and the title is decided in the
      // playoff weeks when he is back. Earlier picks use the normal board.
      const stashOn = cfg.stash && Math.floor(k / N) >= R - cfg.stash.last;
      const SM = stashOn ? setup(season, Object.assign({}, cfgExtra, { stash: undefined, knownW: cfg.stash.w })) : null;
      const P = SM ? SM.P : P0, ctx = SM ? SM.ctx : ctx0;
      // cfg.poBoost: playoff boost strength; cfg.poSurv: scale it by the chance this pick survives to the playoffs
      const lam = E.PO_STRENGTH[cfg.poBoost] || 0, roundsLeft = R - 1 - Math.floor(k / N);
      P.forEach(p => { p.poMult = E.playoffMult(p.poEdge, lam, cfg.poSurv ? E.playoffSurvival(roundsLeft) : null); });
      // punt variants (2026-10-17): cfg.tauSched = [τ at your 1st pick, τ floor, picks to reach it] (commitment that firms up);
      // cfg.oppPunt = { from, thr }: from your pick index `from`, lock a punt of your weakest category once its win chance
      // (no-punt forecast, vs an average opponent) is below thr; it stays locked for the rest of the draft
      { const mr = Math.floor(k / N);
        if (cfg.tauSched) { const [t0, t1, n] = cfg.tauSched; cfg.puntTau = Math.max(t1, t0 - (t0 - t1) * mr / n); }
        if (cfg.oppPunt && !cfg._oppLock && mr >= cfg.oppPunt.from) {
          const r0 = E.evaluate(P, ctx, Object.assign({}, cfg, { puntMode: 'off', puntLock: 'none' }), { picks });
          const sn = r0.strategies && r0.strategies.find(x => x.id === 'none');
          if (sn) { let c = -1, lo = 1; sn.catP.slice(0, cfg.cats === 9 ? 9 : 8).forEach((q, i) => { if (q < lo) { lo = q; c = i; } }); if (lo < cfg.oppPunt.thr) cfg._oppLock = 'p' + c; }
        }
        if (cfg._oppLock) cfg.puntLock = cfg._oppLock; }
      const res = E.evaluate(P, ctx, cfg, { picks });
      if (opp && opp.onMyPick) opp.onMyPick(res, k);   // diagnostics hook (e.g. punt weights per pick)
      const av = P.filter(p => !taken.has(p.id));
      // cfg.pickBy 'model': take the board's Model pick (Gain M × chance he's there, plus look-ahead); default: highest Gain M
      // cfg.earlyBy = { by: 'gain' | 'z', rounds: n } (backtests, 2026-10-17): in your first n picks take the top player by
      // Win C ('gain') or Zscore ('z', p.board) instead of the Model pick
      const myRound = Math.floor(k / N);
      // cfg.slide = { alpha, alpha2, p } (backtests, 2026-10-17): score = (1 − w)·value + w·fit, w = (my pick / my last pick)^p.
      // value = Zscore with the worst category's negative z added back at share alpha (alpha2: second worst too);
      // fit = Win M. Both standardized over the 40 best available by either.
      if (cfg.slideEngine) { const r2 = E.slidePick(P, ctx, cfg, { picks }, myRound, res); id = r2.modelPick; }
      // cfg.slide.valueMissW (2026-10-18): the value side's Zscore uses its own basis (share of missed games that counts),
      // separate from the fit side's (cfgExtra.missW); Pv = the players under that basis, matched by id
      else if (cfg.slide) { const Pv = cfg.slide.valueMissW != null ? setup(season, Object.assign({}, cfgExtra, { missW: cfg.slide.valueMissW, slide: Object.assign({}, cfg.slide, { valueMissW: undefined }) })).P : null;
        id = slidePick(av, myRound, Object.assign({}, cfg.slide, { _ctx: { P, ctx, cfg, picks, k, res, Pv } })); }
      else if (cfg.earlyBy && myRound < cfg.earlyBy.rounds) { const key = cfg.earlyBy.by === 'z' ? 'board' : 'gain'; id = av.reduce((b, p) => (p[key] > b[key] ? p : b), av[0]).id; }
      else if (cfg.look2) id = look2Pick(P, ctx, cfg, picks, k, av, cfg.look2);
      else if (cfg.upside != null) id = upsidePick(av, k, cfg.upside);
      else if (cfg.posScar) id = posScarPick(P, av, picks, k, slot - 1, cfg.posScar);
      else if (cfg.pickBy === 'model' && res && res.modelPick != null && !taken.has(res.modelPick)) id = res.modelPick;
      else id = av.reduce((b, p) => (p.gainM > b.gainM ? p : b), av[0]).id;
    } else if (oppModel[t]) {
      P.forEach(p => { p.poMult = 1; });
      const ocfg = Object.assign({}, cfg, { slot: t + 1, puntMode: opp.modelPunt || (opp.mix ? 'auto' : 'off'), puntLock: '', poBoost: 'off', playsRank: cfg.oppPlaysRank || false, fieldZ: opp.stdField ? 'std' : undefined });   // kit users read the league's field the same way whatever the board arm
      if (WO) PO.forEach(p => { p.poMult = 1; });
      E.evaluate(PO, ctxO, ocfg, { picks });
      const av = P.filter(p => !taken.has(p.id));
      const avO = WO ? PO.filter(p => !taken.has(p.id)) : av;
      id = avO.reduce((b2, p) => (p.gainM > b2.gainM ? p : b2), avO[0]).id;
    } else if (oppSharp[t]) {
      let best = -1, bt = Infinity;
      for (const p of PO) if (!taken.has(p.id)) { const sc = (1 - sharpW) * T[p.id] + sharpW * zr[p.id]; if (sc < bt) { bt = sc; best = p.id; } }
      id = best;
    } else {
      let best = -1, bt = Infinity;
      const pc = oppPunt[t], TT = oppSloppyT[t] || T;
      for (const p of PO) if (!taken.has(p.id)) { const sc = pc ? TT[p.id] + gamma * pc.reduce((s, c) => s + p.boardC[c], 0) : TT[p.id]; if (sc < bt) { bt = sc; best = p.id; } }
      id = best;
    }
    picks[k] = id; taken.add(id);
  }
  const rosters = Array.from({ length: N }, () => []);
  picks.forEach((id, k) => rosters[E.teamAt(k, N, ORD)].push(P[id].pid));
  rosters.picks = picks;
  return rosters;
}
// all-play H2H most categories on actual weekly stats; returns each team's matchup win rate
function score(season, rosters) {
  const { weekly, nweeks } = DATA[season];
  const tot = rosters.map(ro => { const w = Array.from({ length: nweeks }, () => new Array(11).fill(0)); ro.forEach(pid => { const pw = weekly[String(pid)] || {}; for (const k in pw) for (let c = 0; c < 11; c++) w[k][c] += pw[k][c]; }); return w; });
  const cats = s => [s[1] ? s[0] / s[1] : 0, s[3] ? s[2] / s[3] : 0, s[4], s[5], s[6], s[7], s[8], s[9], -s[10]];
  const wins = new Array(N).fill(0); let games = 0;
  for (let w = 0; w < nweeks; w++) {
    const cs = tot.map(t => cats(t[w]));
    if (tot.every(t => t[w][5] === 0)) continue;
    games++;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (a !== b) {
      let wa = 0, wb = 0; for (let c = 0; c < 9; c++) { if (cs[a][c] > cs[b][c]) wa++; else if (cs[a][c] < cs[b][c]) wb++; }
      wins[a] += wa > wb ? 1 : wa === wb ? 0.5 : 0;
    }
  }
  return wins.map(x => x / (games * (N - 1)));
}
module.exports = { draft, score, setup, oppInfo: null, PO_WEEKS, setUpside };
if (require.main === module) {
  const t = Date.now();
  for (const mode of [{ puntMode: 'off' }, { puntMode: 'auto' }]) {
    const ro = draft('2025-26', 7, 1, mode); const s = score('2025-26', ro);
    console.log(JSON.stringify(mode), 'my win rate', s[6].toFixed(3), 'avg', (s.reduce((a, b) => a + b) / N).toFixed(3), 'ms', Date.now() - t);
  }
}
