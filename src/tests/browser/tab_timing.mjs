// Tab-swap timing (2026-10-26): click a toolbar tab and time until the page has drawn its table. Fantrax is mocked with a delay per
// call. Prints a table, not pass/fail. BASE=http://localhost:8765 (default); run it against another build to compare.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = process.env.REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BASE = process.env.BASE || 'http://localhost:8765', DELAY = +(process.env.DELAY || 300), RUNS = +(process.env.RUNS || 3);
const fx = n => fs.readFileSync(path.join(REPO, 'src/tests/fixtures', n), 'utf8');
const FX = { league: fx('fx_league.json'), rosters: fx('fx_rosters.json'), standings: fx('fx_standings.json'), players: fx('fx_players.json') };
const ESPN = fx('espn_2025_26.json'), NOW = Date.UTC(2026, 9, 21, 12);
const LID = 'abc123', TEAMS = Object.keys(JSON.parse(FX.league).teamInfo);
const SEED = { 'courtside-settings-v1': JSON.stringify({ v: 1, settings: { teams: 14, roster: 12, scoring: 'h2h', cats: 9, asb: 'merged', poStart: 18, poFmt: '2-2-2', ilSpots: 3 }, league: { id: LID, name: 'Home', teams: [], loadedAt: 1 }, note: '' }),
  'courtside-leagues-v1': JSON.stringify([{ id: LID, name: 'Home', myTeam: TEAMS[0], used: 1 }]),
  'courtside-rankings-v1': JSON.stringify({ src: 'avg' }) };   // projections, so the table draws without box scores
// what "drawn" means on each page (Rankings: the Owner column, which appears once the league's rosters are in)
const READY = { 'team.html': '#roster tbody tr[data-key]', 'rankings.html': '#tbl th[data-k="own"]', 'league.html': '#body:not([hidden])', 'inseason.html': '#body:not([hidden])' };
const median = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const b = await chromium.launch();
const moves = [['team.html', 'rankings.html'], ['rankings.html', 'team.html'], ['team.html', 'league.html'], ['league.html', 'inseason.html']];
console.log('base ' + BASE + ', Fantrax ' + DELAY + ' ms per call, median of ' + RUNS + '\nfrom -> to           first visit   second visit');
for (const [from, to] of moves) {
  const first = [], second = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
    await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
    await ctx.route(/api\/fantrax/, async r => { await new Promise(res => setTimeout(res, DELAY)); r.fulfill({ body: FX[new URL(r.request().url()).searchParams.get('what')] || '{}', contentType: 'application/json' }); });
    await ctx.route(/stats\/(espn|box)/, r => r.fulfill({ body: r.request().url().includes('espn') ? ESPN : '{}', contentType: 'application/json' }));
    await ctx.addInitScript(t => { Date.now = () => t; }, NOW);
    await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, SEED);
    const p = await ctx.newPage();
    const swap = async () => {
      await p.goto(BASE + '/' + from); await p.waitForSelector(READY[from], { timeout: 60000 });
      const t0 = Date.now(); await p.click('.sitenav a[href^="' + to + '"]'); await p.waitForSelector(READY[to], { timeout: 60000 }); return Date.now() - t0;
    };
    first.push(await swap()); second.push(await swap());   // the second swap meets whatever the first left in the browser
    await ctx.close();
  }
  console.log((from + ' -> ' + to).padEnd(30) + String(median(first)).padStart(6) + ' ms' + String(median(second)).padStart(10) + ' ms');
}
await b.close();
