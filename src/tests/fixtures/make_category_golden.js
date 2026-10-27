// Pins what Rankings, the engine context and the Team tab's win numbers return in categories (2026-10-26), so adding points
// mode (#137) can be shown not to move them. `node src/tests/fixtures/make_category_golden.js` rewrites category_golden.json;
// category_golden.test.js recomputes it with compute() and compares. Only regenerate on purpose.
// The Team part reads src/players.json, so the file also stores a hash of that input; a projection refresh skips that part.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const E = require('../../engine.js'), R = require('../../rankings_core.js'), GOLD = require('./golden_players.json');

const arr = a => Array.from(a);
const rows = R.projSource(GOLD, 'avg');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');

function rankings() {
  const out = { table: {}, winStart: {}, ctx: {} };
  for (const type of R.TYPES) for (const basis of ['pergame', 'total', 'mix']) for (const cats of [9, 8]) {
    const t = R.table(rows, { teams: 14, roster: 12, type, basis, cats });
    out.table[type + '/' + basis + '/' + cats] = t.map(r => [r.pid, r.z, r.inPool, arr(r.cats || [])]);
  }
  const byAdp = rows.slice().sort((a, b) => (a.adp == null ? 999 : a.adp) - (b.adp == null ? 999 : b.adp)).map(r => r.pid);
  const lists = Array.from({ length: 14 }, (_, t) => byAdp.slice(0, 168).filter((_, j) => j % 14 === t).slice(0, 12));
  for (const withLists of [false, true]) {
    const tab = R.table(rows, { teams: 14, roster: 12, type: 'classic', basis: 'pergame', cats: 9 });
    const ws = R.winStart(rows, tab, Object.assign({ teams: 14, roster: 12, basis: 'pergame', cats: 9 }, withLists ? { lists } : {}));
    while (ws.step() != null);
    out.winStart[withLists ? 'lists' : 'none'] = { rep: [...ws.rep.entries()], avg: [...ws.avg.entries()], hasAvg: ws.hasAvg };
  }
  // Rankings with no team loaded keeps winStart on the other bases too (2026-10-26, before Rankings follows the Team tab with a team)
  for (const basis of ['total', 'mix']) {
    const tab = R.table(rows, { teams: 14, roster: 12, type: 'classic', basis, cats: 9 });
    const ws = R.winStart(rows, tab, { teams: 14, roster: 12, basis, cats: 9 });
    while (ws.step() != null);
    out.winStart['none/' + basis] = { rep: [...ws.rep.entries()], avg: [...ws.avg.entries()], hasAvg: ws.hasAvg };
  }
  // the engine context and per-player vectors, for every basis, cats and IL spots
  for (const basis of ['total', 'pergame', 'mix']) for (const cats of [9, 8]) for (const ilSpots of [0, 3]) {
    const cfg = R.cfgFor({ teams: 14, roster: 12, cats, ilSpots, basis });
    const P = E.prepPlayers(rows.map(r => Object.assign({}, r.line, { g: r.g, ftx: r.ftx })));
    const ctx = E.buildContext(P, cfg);
    out.ctx[basis + '/' + cats + '/' + ilSpots] = {
      players: P.slice(0, 150).map(p => [arr(p.x), arr(p.pv), p.wv == null ? null : arr(p.wv), p.fieldV, p.board, p.zH && p.zH.z0 != null ? p.zH.z0 : null]),
      idioNoise: arr(ctx.idioNoise), loadS: arr(ctx.loadS), h2hNoise: arr(ctx.h2hNoise), gapSd: ctx.gapSd, avgX: arr(ctx.avgX), teamSd: ctx.teamSd,
      sdH: ctx.sdH, pgRepl: ctx.pgRepl, G0: ctx.G0
    };
  }
  return out;
}

function team() {
  const I = require('../../inseason_league.js'), T = require('../../team_core.js'), W = require('../../team_win.js'), M = require('../../matchup_core.js'), Pl = require('../../inseason_players.js');
  const fx = n => require('./' + n), PLAYERS = require('../../players.json');
  const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json')), me = L.teams[0].id;
  const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
  const last = L.periods.find(p => p.n === L.lastRegular), teamsAll = [...new Set(pool.players.map(p => p.t).filter(Boolean))];
  const games = {}; teamsAll.forEach(t => { games[t] = []; for (let s = last.start / 1000 + 3600; s < last.end / 1000; s += 2 * 86400) games[t].push(s); });
  const ctx = M.makeCtx({ L, pool, DAYS: { games }, rosters: ROS, me, nowMs: last.start });
  const st = T.initState(ROS[me]), m = W.matrix(ctx, st);
  const other = L.teams[1].id, cands = ROS[other].map(x => x.fid).slice(0, 6);
  const o = { teams: m.teams.map(t => [t.id, t.match, arr(t.cat), t.winC]), mean: [m.mean.match, arr(m.mean.cat), m.mean.winC] };
  for (const baseline of ['rep', 'avg']) o['scores_' + baseline] = W.moduleScores(ctx, st, { candidates: cands, baseline }).map(r => JSON.parse(JSON.stringify(r)));
  // the Trade Analyzer's forecaster and the plain Plays % (2026-10-26, before the Reserve/IL/Team-tab flag): none of these may move
  const Tr = require('../../trade_core.js'), R0 = ctx.roster, swapped = JSON.parse(JSON.stringify(R0));
  swapped[me][0] = R0[other][0]; swapped[other][0] = R0[me][0];
  const lw = W.leagueWin(ctx, null), lws = W.leagueWin(ctx, swapped);
  o.leagueWin = lw && { ids: lw.ids, P: lw.P };
  o.leagueWinSwap = lws && { ids: lws.ids, P: lws.P };
  o.rosWinM = [Tr.rosWinM(ctx, R0, me), Tr.rosWinM(ctx, swapped, me)];
  o.playsPct = T.playsPct(ctx, st);
  const moved = st.order.slice(0, 2).reduce((s, k) => T.moveSlot(s, k, 'reserve'), st);
  o.playsPctMoved = T.playsPct(ctx, moved);
  return o;
}

function compute() {
  const out = { playersHash: sha('../../players.json'), rankings: rankings(), team: null };
  try { out.team = team(); } catch (e) { out.teamError = String(e && e.stack); }
  return JSON.parse(JSON.stringify(out, (k, v) => typeof v === 'number' && !isFinite(v) ? String(v) : v));
}
module.exports = { compute };
if (require.main === module) {
  fs.writeFileSync(path.join(__dirname, 'category_golden.json'), JSON.stringify(compute()));
  console.log('wrote category_golden.json');
}
