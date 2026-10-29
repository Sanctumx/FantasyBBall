// Trade screen core (idea 163): the Team tab's own forecaster (TeamWin.leagueWin, Trade.evaluateTrade) on a league built from the backtest data.
// Needs bt_data.json's players already adjusted the way ipe_run.js does (games_fit); the caller applies that before requiring this file.
const DATA = require('./bt_data.json'), DAILY = require('./bt_daily.json'), SCHED = require('./bt_sched.json');
const M = require('./matchup_core.js');

const DAY_MS = 864e5, LAST_REG = 17;
const t0 = season => Date.parse(SCHED[season].start + 'T00:00:00Z');

// team game tip-offs (seconds) from the weekly game counts, spread over each week at noon UTC
function gameDays(season) {
  const S = SCHED[season], games = {};
  Object.keys(S.games).forEach(team => {
    games[team] = [];
    S.games[team].forEach((c, k) => { for (let i = 0; i < c; i++) games[team].push((t0(season) + (7 * k + Math.floor((i + 0.5) * 7 / c)) * DAY_MS + DAY_MS / 2) / 1000); });
  });
  return { games };
}

// per-game line of the rows [day, fgm, fga, ftm, fta, tpm, pts, reb, ast, stl, blk, tov, min] before `cut`
function actualOf(rows, cut) {
  const r = rows.filter(x => x[0] < cut), n = r.length;
  if (!n) return null;
  const s = i => r.reduce((a, x) => a + x[i], 0), fga = s(2), fta = s(4);
  return { gp: n, min: s(12) / n, line: { fgp: fga ? s(1) / fga : 0, fga: fga / n, ftp: fta ? s(3) / fta : 0, fta: fta / n, tpm: s(5) / n, pts: s(6) / n, reb: s(7) / n, ast: s(8) / n, stl: s(9) / n, blk: s(10) / n, to: s(11) / n } };
}

// The league at the start of week w (0-based) with every team's core on its roster. Games count only from the checkpoint on; actual stats
// are the games before it. Team ids are the slot numbers as strings.
function simCtx(season, w, cores, me) {
  const daily = DAILY[season].daily, nweeks = SCHED[season].nweeks;
  const periods = Array.from({ length: nweeks }, (_, k) => ({ n: k + 1, start: t0(season) + 7 * k * DAY_MS, end: t0(season) + 7 * (k + 1) * DAY_MS }));
  const L = { teams: cores.map((_, t) => ({ id: String(t) })), periods, matchups: [], lastRegular: LAST_REG, maxActive: 10, maxPlayers: 10 };
  const owner = {}, rows = {};
  cores.forEach((c, t) => { rows[String(t)] = c.map(pid => ({ fid: String(pid), slot: 'ACTIVE' })); c.forEach(pid => { owner[String(pid)] = String(t); }); });
  const list = DATA[season].players.map(p => {
    const key = String(p.pid);
    return { key, n: p.n, t: p.t, g: p.g, pos: p.p, line: { fgp: p.fgp, fga: p.fga, ftp: p.ftp, fta: p.fta, tpm: p.tpm, pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk, to: p.to },
      adp: p.adp, src: 'proj', owner: owner[key] || null, slot: key in owner ? 'ACTIVE' : null, fxStatus: key in owner ? 'T' : null, actual: actualOf(daily[key] || [], 7 * w) };
  });
  const ctx = M.makeCtx({ L, pool: { players: list, byKey: new Map(list.map(p => [p.key, p])) }, DAYS: gameDays(season), rosters: rows, me: String(me), nowMs: periods[w].start });
  ctx.teamTab = true; ctx.basis = 'total';   // the Team tab's seasonal rules, as calib_live.js divisionCtx
  ctx._season = season;
  return ctx;
}

// ---- offers ----
const InPlayers = require('./inseason_players.js'), Trade = require('./trade_core.js');
const BAND = 0.5, CHECKPOINTS = [3, 7, 11];
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const played = (season, key, w) => (DAILY[season].daily[key] || []).some(r => r[0] >= 7 * w - 7 && r[0] < 7 * w);
const subsets = (a, k) => k === 1 ? a.map(x => [x]) : a.flatMap((x, i) => a.slice(i + 1).map(y => [x, y]));

// What the other managers propose to me at the checkpoint: 1-for-1 and 2-for-2 swaps whose value (valueZ) is within BAND, of players who played in
// the last 7 days. Each swap is weighted by how likely its proposer finds it fair (Trade's likelihood without the Win M term, so only the perceived
// values count); K are drawn, from distinct opponents. -> [{ other, give, get, weight }] with keys as strings (give: mine, get: theirs)
function offers(ctx, seed, K) {
  const me = ctx.me, w = Math.round((ctx.nowMs - ctx.L.periods[0].start) / (7 * DAY_MS)), r = rng(seed), season = ctx._season;
  const z = new Map(), pv = new Map(), info = k => {
    if (!z.has(k)) { const p = ctx.pool.byKey.get(k); z.set(k, InPlayers.valueZ(p.line, p.g, ctx.ref)); pv.set(k, Trade.perceived(ctx, p).pv); }
  };
  const sum = (m, ks) => ks.reduce((s, k) => { info(k); return s + m.get(k); }, 0);
  const ok = k => played(season, k, w);
  const mine = ctx.roster[me].filter(ok), cand = [];
  Object.keys(ctx.roster).filter(t => t !== me).forEach(t => {
    const theirs = ctx.roster[t].filter(ok);
    for (const n of [1, 2]) for (const give of subsets(mine, n)) for (const get of subsets(theirs, n)) {
      if (Math.abs(sum(z, get) - sum(z, give)) > BAND) continue;
      const gapB = sum(pv, give) - sum(pv, get);   // what the proposer receives minus what he gives
      cand.push({ other: t, give, get, weight: 1 / (1 + Math.exp(-(Trade.TRADE_W.slope * gapB + Trade.TRADE_W.bias))) });
    }
  });
  const out = [], used = new Set();
  while (out.length < K) {
    const pool = cand.filter(c => !used.has(c.other)), tot = pool.reduce((s, c) => s + c.weight, 0);
    if (!pool.length || !(tot > 0)) break;
    let u = r() * tot, pick = pool[pool.length - 1];
    for (const c of pool) { u -= c.weight; if (u < 0) { pick = c; break; } }
    used.add(pick.other); out.push(pick);
  }
  return out;
}

// ---- rules ----
// each returns the value an offer is ranked by; rules 'winM' and 'z' accept only a positive gain, the controls take their top-ranked offer whatever it is
const zGain = (ctx, o) => {
  const f = k => { const p = ctx.pool.byKey.get(k); return InPlayers.valueZ(p.line, p.g, ctx.ref); };
  return o.get.reduce((s, k) => s + f(k), 0) - o.give.reduce((s, k) => s + f(k), 0);
};
function choose(ctx, offs, rule, r) {
  if (!offs.length) return null;
  const scored = offs.map(o => Object.assign({}, o, { zGain: zGain(ctx, o) }));
  if (rule === 'winM') scored.forEach(o => { o.dA = Trade.evaluateTrade(ctx, { a: ctx.me, b: o.other, aGets: o.get, bGets: o.give }).dA; });
  const best = (key, sign) => scored.reduce((b, o) => (sign * o[key] > sign * b[key] ? o : b));
  if (rule === 'winM') { const b = best('dA', 1); return b.dA > 0 ? b : null; }
  if (rule === 'z') { const b = best('zGain', 1); return b.zGain > 0 ? b : null; }
  if (rule === 'antiZ') return best('zGain', -1);
  if (rule === 'random') return scored[Math.floor(r() * scored.length)];
  throw new Error('unknown rule ' + rule);
}

// Walk the checkpoints: the offers are drawn on the league as the earlier accepted trades left it. -> { trades (for scoreLeague's opts.trades), log }
// cores: stream_sim.initialCores; opts: rule, seed, me (0-based slot), checkpoints, K
function planTrades(season, cores, { rule, seed, me, checkpoints = CHECKPOINTS, K = 3 }) {
  let cur = cores.map(c => c.slice()); const trades = [], log = [];
  for (const w of checkpoints) {
    const ctx = simCtx(season, w, cur, me), s = seed * 1000 + me * 50 + w, offs = offers(ctx, s, K);
    const orig = new Map(cur.flat().map(p => [String(p), p]));
    const pick = choose(ctx, offs, rule, rng(s + 1));
    log.push({ w, offers: offs.length, pick });
    if (!pick) continue;
    const o = +pick.other, give = pick.give.map(k => orig.get(k)), get = pick.get.map(k => orig.get(k));
    trades.push({ w, me, other: o, give, get });
    cur[me] = cur[me].filter(p => !give.includes(p)).concat(get); cur[o] = cur[o].filter(p => !get.includes(p)).concat(give);
  }
  return { trades, log };
}

module.exports = { simCtx, offers, choose, planTrades, zGain, CHECKPOINTS };
