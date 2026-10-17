// Title-style scoring of a simulated league (2026-10-17). From stream_sim's weekTot[team][week][11]:
// regular season = weeks 1-17 (all-play H2H most categories, which ranks teams with less schedule luck than a real
// schedule); the top 8 make the playoffs; rounds of 1-2-2 weeks (weeks 18, 19-20, 21-22) on summed totals, most
// categories wins, ties go to the higher seed; bracket 1v8, 4v5, 2v7, 3v6.
const cats = s => [s[1] ? s[0] / s[1] : 0, s[3] ? s[2] / s[3] : 0, s[4], s[5], s[6], s[7], s[8], s[9], -s[10]];
function beats(a, b) { let wa = 0, wb = 0; for (let c = 0; c < 9; c++) { if (a[c] > b[c]) wa++; else if (a[c] < b[c]) wb++; } return wa > wb ? 1 : wa < wb ? -1 : 0; }
function titleScore(weekTot, opts = {}) {
  const N = weekTot.length, RS = opts.rsWeeks ?? 17, PO = opts.poTeams ?? 8, rounds = opts.rounds ?? [[17], [18, 19], [20, 21]];
  const sum = (t, ws) => { const a = new Array(11).fill(0); ws.forEach(w => weekTot[t][w] && weekTot[t][w].forEach((x, c) => { a[c] += x; })); return cats(a); };
  const rs = new Array(N).fill(0); let gw = 0;
  for (let w = 0; w < RS; w++) {
    if (weekTot.every(t => !t[w] || t[w][5] === 0)) continue; gw++;
    const cs = weekTot.map(t => cats(t[w]));
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (a !== b) { const r = beats(cs[a], cs[b]); rs[a] += r > 0 ? 1 : r === 0 ? 0.5 : 0; }
  }
  const rsRate = rs.map(x => x / (gw * (N - 1)));
  const seed = [...Array(N).keys()].sort((a, b) => rsRate[b] - rsRate[a]);
  const made = new Array(N).fill(0); seed.slice(0, PO).forEach(t => { made[t] = 1; });
  // playoff-weeks all-play for every team (strength when it counts, regardless of bracket luck)
  const poW = rounds.flat(), poAll = new Array(N).fill(0);
  { const cs = [...Array(N).keys()].map(t => sum(t, poW));
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (a !== b) { const r = beats(cs[a], cs[b]); poAll[a] += r > 0 ? 1 : r === 0 ? 0.5 : 0; } }
  let alive = [0, 7, 3, 4, 1, 6, 2, 5].map(i => seed[i]);   // bracket order
  const roundsWon = new Array(N).fill(0);
  for (const ws of rounds) {
    const next = [];
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i], b = alive[i + 1], r = beats(sum(a, ws), sum(b, ws));
      const w = r > 0 ? a : r < 0 ? b : (seed.indexOf(a) < seed.indexOf(b) ? a : b); next.push(w); roundsWon[w]++;
    }
    alive = next;
  }
  const title = new Array(N).fill(0); title[alive[0]] = 1;
  return { rsRate, made, poAll: poAll.map(x => x / (N - 1)), roundsWon, title };
}
module.exports = { titleScore };
