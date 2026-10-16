const E = require('./engine.js');
const DATA = require('./bt_data.json');
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const N = 14, R = 12, TOTAL = N * R;
const ctxCache = {};
function setup(season, cfgExtra) {
  const key = season + JSON.stringify(cfgExtra);
  if (ctxCache[key]) return ctxCache[key];
  const P = E.prepPlayers(DATA[season].players);
  const cfg = Object.assign({ teams: N, roster: R, slot: 1, order: 'snake', scoring: 'most', cats: 9, adpSrc: 'ftx', basis: 'mix', orderBy: 'gainM', catW: [1,1,1,1,1,1,1,1,1], scarZ: 'off', scarP: 'off', zdrop: 0 }, cfgExtra);
  const ctx = E.buildContext(P, cfg);
  return ctxCache[key] = { P, cfg, ctx };
}
function draft(season, slot, seed, cfgExtra, opp) {
  const { P, ctx } = setup(season, cfgExtra);
  const cfg = Object.assign({}, setup(season, cfgExtra).cfg, { slot });
  const r = rng(seed * 7919 + slot);
  const T = P.map(p => p.adpUse + gauss(r) * p.sd);
  const picks = new Array(TOTAL).fill(null), taken = new Set();
  // opponents who punt: opp = { n, gamma }; each gets a single punt or a top-8 synergy pair, fixed from pick 1
  const oppPunt = new Array(N).fill(null);
  if (opp && opp.n) {
    const ro = rng(seed * 104729 + slot * 7 + opp.n);
    const others = [...Array(N).keys()].filter(t => t !== slot - 1).sort(() => ro() - 0.5).slice(0, opp.n);
    const opts = [...Array(9).keys()].map(c => [c]).concat(ctx.synPairs.slice(0, 8).map(([a, b2]) => [a, b2]));
    others.forEach(t => { oppPunt[t] = opts[Math.floor(ro() * opts.length)]; });
  }
  const gamma = opp && opp.gamma != null ? opp.gamma : 3;
  // opponents who draft with this board (Gain M, Punt Off): opp.model = how many
  const oppModel = new Array(N).fill(false);
  if (opp && opp.model) { const rm = rng(seed * 7727 + slot * 13 + opp.model); [...Array(N).keys()].filter(t => t !== slot - 1).sort(() => rm() - 0.5).slice(0, opp.model).forEach(t => { oppModel[t] = true; }); }
  for (let k = 0; k < TOTAL; k++) {
    const t = E.teamAt(k, N, 'snake');
    let id;
    if (t === slot - 1) {
      const res = E.evaluate(P, ctx, cfg, { picks });
      const av = P.filter(p => !taken.has(p.id));
      id = av.reduce((b, p) => (p.gainM > b.gainM ? p : b), av[0]).id;
    } else if (oppModel[t]) {
      const ocfg = Object.assign({}, cfg, { slot: t + 1, puntMode: opp.modelPunt || 'off', puntLock: '' });
      E.evaluate(P, ctx, ocfg, { picks });
      const av = P.filter(p => !taken.has(p.id));
      id = av.reduce((b2, p) => (p.gainM > b2.gainM ? p : b2), av[0]).id;
    } else {
      let best = -1, bt = Infinity;
      const pc = oppPunt[t];
      for (const p of P) if (!taken.has(p.id)) { const sc = pc ? T[p.id] + gamma * pc.reduce((s, c) => s + p.boardC[c], 0) : T[p.id]; if (sc < bt) { bt = sc; best = p.id; } }
      id = best;
    }
    picks[k] = id; taken.add(id);
  }
  const rosters = Array.from({ length: N }, () => []);
  picks.forEach((id, k) => rosters[E.teamAt(k, N, 'snake')].push(P[id].pid));
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
module.exports = { draft, score, setup, oppInfo: null };
if (require.main === module) {
  const t = Date.now();
  for (const mode of [{ puntMode: 'off' }, { puntMode: 'auto' }]) {
    const ro = draft('2025-26', 7, 1, mode); const s = score('2025-26', ro);
    console.log(JSON.stringify(mode), 'my win rate', s[6].toFixed(3), 'avg', (s.reduce((a, b) => a + b) / N).toFixed(3), 'ms', Date.now() - t);
  }
}
