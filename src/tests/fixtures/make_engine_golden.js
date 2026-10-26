// Pins what the draft engine returns today, so adding Engine.pairMatchup can be shown not to change the Model pick
// (2026-10-20). `node src/tests/fixtures/make_engine_golden.js` rewrites engine_golden.json; engine_golden.test.js
// recomputes it with compute() and compares. Only regenerate this file on purpose, when the draft engine itself changes.
const E = require('../../engine.js'), Shared = require('../../shared.js'), L = require('../../league_core.js'), PLAYERS = require('./golden_players.json');

const CFG = { teams: 14, roster: 12, slot: 1, order: '3rr', scoring: 'h2h', cats: 9, basis: 'total', ilSpots: 3, field: 'average', fieldZ: 'std',
  puntMode: 'off', puntLock: '', catW: [1, 1, 1, 1, 1, 1, 1, 1, 0.5], adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'off', zdrop: 0 };
const LEAGUE_CFG = { teams: 14, roster: 12, slot: 1, order: '3rr', scoring: 'h2h', cats: 9, basis: 'pergame', ilSpots: 3, field: 'easy', fieldZ: 'std',
  puntMode: 'off', puntLock: '', catW: [1, 1, 1, 1, 1, 1, 1, 1, 0.5], adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'light', zdrop: 0, poStart: 18, asb: 'merged', proj: 'avg' };
const arr = a => Array.from(a);

function compute() {
  const out = { draft: {}, plays: {}, league: null };
  const byAdp = PLAYERS.map((p, i) => [p.ftx || 999, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  for (const k of [0, 29, 70]) {
    const P = E.prepPlayers(PLAYERS.map(r => Object.assign({}, r, Shared.projOf(r, 'avg'))));
    const slot = E.teamAt(k, 14, '3rr'), cfg = Object.assign({}, CFG, { slot: slot + 1 });
    const ctx = E.buildContext(P, cfg);
    const picks = Array.from({ length: 168 }, (_, j) => j < k ? byAdp[j] : null);
    let myIdx = 0; for (let j = 0; j < k; j++) if (E.teamAt(j, 14, '3rr') === slot) myIdx++;
    const res = E.slidePick(P, ctx, cfg, { picks }, myIdx, E.evaluate(P, ctx, cfg, { picks }));
    out.draft[k] = {
      modelPick: res.modelPick, slide: { w: res.slide.w, cands: res.slide.cands },
      standings: res.standings, myChance: arr(res.myChance), myMatch: res.myMatch,
      rows: P.map(p => [p.id, p.gain, p.gainM, p.thereAt == null ? null : p.thereAt])
    };
    // same state with the Plays % by roster rank factor on (#141)
    const cfgP = Object.assign({}, cfg, { playsRank: true });
    const resP = E.slidePick(P, ctx, cfgP, { picks }, myIdx, E.evaluate(P, ctx, cfgP, { picks }));
    out.plays[k] = { modelPick: resP.modelPick, myMatch: resP.myMatch, rows: P.map(p => [p.id, p.gain, p.gainM]) };
  }
  const picks = byAdp.slice(0, 168);
  const R = L.computeLeague(PLAYERS, { cfg: Object.assign({}, LEAGUE_CFG), picks, owner: [], extra: [], names: null }, 'avg');
  out.league = { match: R.match, expCats: R.expCats };
  return JSON.parse(JSON.stringify(out));
}
module.exports = { compute };
if (require.main === module) {
  require('fs').writeFileSync(require('path').join(__dirname, 'engine_golden.json'), JSON.stringify(compute()));
  console.log('wrote engine_golden.json');
}
