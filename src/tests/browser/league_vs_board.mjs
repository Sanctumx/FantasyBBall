// Task 6 check: with the Draft Kit on Basis Season, Playoff boost Off and Average projections, its Your team panel and the
// League page show the same numbers for the same draft. Needs playwright and the repo root served on :8765.
import { chromium } from 'playwright';
import fs from 'fs';
const PLAYERS = JSON.parse(fs.readFileSync('/root/FantasyBBall/src/players.json', 'utf8'));
const byAdp = PLAYERS.map((p, i) => [p.ftx || 999, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const b = await chromium.launch();
for (const [n, basis] of [[168, 'total'], [100, 'total'], [168, 'pergame']]) {
  const cfg = { teams: 14, roster: 12, slot: 5, order: '3rr', scoring: 'h2h', cats: 9, ilSpots: 3, field: 'easy', poStart: 18, asb: 'merged', proj: 'avg', basis, poBoost: 'off', basisV: 12 };
  const state = JSON.stringify({ cfg, picks: byAdp.slice(0, 168).map((id, k) => k < n ? id : null), log: [], owner: [], fx: null, extra: [] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.addInitScript(([s, bs]) => { if (!sessionStorage.getItem('s')) { localStorage.clear(); localStorage.setItem('courtside-board-v1', s); localStorage.setItem('courtside-league-v1', JSON.stringify({ basis: bs })); sessionStorage.setItem('s', '1'); } }, [state, basis]);
  const kit = await ctx.newPage(); await kit.goto('http://localhost:8765/index.html'); await kit.waitForTimeout(2500);
  const k = await kit.evaluate(() => ({
    rank: document.querySelector('#mineStat .rank b').textContent,
    cats: document.querySelector('#mineStat .score b').textContent,
    chances: [...document.querySelectorAll('#chances > div')].map(d => [d.children[0].textContent, d.children[1].textContent]).filter(x => x[1] !== '—'),
    vs: [...document.querySelectorAll('#vsList li')].map(li => [li.children[0].textContent, li.children[1].textContent]) }));
  const lg = await ctx.newPage(); await lg.goto('http://localhost:8765/league.html'); await lg.waitForTimeout(2500);
  const l = await lg.evaluate(() => ({
    rank: document.querySelector('#kpis .kpi b').textContent,
    cats: document.querySelectorAll('#kpis .kpi b')[1].textContent,
    prof: [...document.querySelectorAll('#prof tbody tr')].map(r => [r.children[0].textContent, r.children[1].textContent]),
    h2h: [...document.querySelectorAll('#h2h tbody tr')].map(r => [r.children[0].textContent, r.children[1].textContent]) }));
  ok(k.rank === l.rank, n + ' picks ' + basis + ': rank ' + k.rank + ' vs ' + l.rank);
  ok((+k.cats).toFixed(1) === l.cats, n + ' picks: categories per week ' + k.cats + ' vs ' + l.cats);
  const pm = Object.fromEntries(l.prof);
  const close = (a, b) => Math.abs(parseFloat(a) - parseFloat(b)) <= 0.51;   // board shows whole percents, the page one decimal
  ok(k.chances.length === 9 && k.chances.every(([c, v]) => close(pm[c], v)), n + ' picks: category win % ' + JSON.stringify(k.chances) + ' vs ' + JSON.stringify(l.prof));
  const hm = Object.fromEntries(l.h2h.map(([t, v]) => [t.replace(/ \(you\)$/, ''), v]));
  ok(k.vs.length === 13 && k.vs.every(([t, v]) => hm[t] != null && close(hm[t], v)), n + ' picks: matchup win % per opponent');
  await ctx.close();
}
await b.close();
console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
