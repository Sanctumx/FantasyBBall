// Fantrax answers cached in the browser (2026-10-26): a second visit draws before Fantrax answers, a changed roster redraws,
// a failed refresh keeps the saved view. Team and League pages. Needs playwright and the repo root served on :8765.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = process.env.REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fx = n => fs.readFileSync(path.join(REPO, 'src/tests/fixtures', n), 'utf8');
const FX = { league: fx('fx_league.json'), rosters: fx('fx_rosters.json'), standings: fx('fx_standings.json'), players: fx('fx_players.json') };
const ESPN = fx('espn_2025_26.json');
const NOW = Date.UTC(2026, 9, 21, 12);
const LID = 'abc123', TEAMS = Object.keys(JSON.parse(FX.league).teamInfo);
const SEED = { 'courtside-settings-v1': JSON.stringify({ v: 1, settings: { teams: 14, roster: 12, scoring: 'h2h', cats: 9, asb: 'merged', poStart: 18, poFmt: '2-2-2', ilSpots: 3 }, league: { id: LID, name: 'Home', teams: [], loadedAt: 1 }, note: '' }),
  'courtside-leagues-v1': JSON.stringify([{ id: LID, name: 'Home', myTeam: TEAMS[0], used: 1 }]) };
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const trimmed = (() => { const r = JSON.parse(FX.rosters); r.rosters[TEAMS[0]].rosterItems = r.rosters[TEAMS[0]].rosterItems.slice(0, -1); return JSON.stringify(r); })();

const b = await chromium.launch();
const net = { delay: 0, rosters: FX.rosters, status: 200 };
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
await ctx.route(/api\/fantrax/, async r => {
  const what = new URL(r.request().url()).searchParams.get('what');
  if (net.delay) await new Promise(res => setTimeout(res, net.delay));
  if (net.status !== 200) return r.fulfill({ status: net.status, body: '{}', contentType: 'application/json' });
  r.fulfill({ body: what === 'rosters' ? net.rosters : FX[what] || '{}', contentType: 'application/json' });
});
await ctx.route(/stats\/espn\.json/, r => r.fulfill({ body: ESPN, contentType: 'application/json' }));
await ctx.addInitScript(t => { Date.now = () => t; }, NOW);
await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, SEED);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const rows = () => p.$$eval('#roster tbody tr[data-key]', r => r.length);
const shown = () => p.waitForSelector('#body:not([hidden])', { timeout: 20000 });
const scored = () => p.waitForFunction(() => document.getElementById('rost-meta').textContent === '' && document.querySelectorAll('#roster tbody tr[data-key]').length > 0 && !/…/.test(document.getElementById('roster').textContent), null, { timeout: 60000 });

// ---- Team ----
await p.goto('http://localhost:8765/team.html'); await shown(); await scored();
const n0 = await rows();
ok(n0 >= 10, 'first visit (empty cache) draws the roster: ' + n0 + ' rows');
const keys = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('courtside-fx-v1:')).sort());
ok(keys.join() === ['league', 'players', 'rosters'].map(w => 'courtside-fx-v1:' + w + ':' + (w === 'players' ? '' : LID)).sort().join(), 'the three answers are saved: ' + keys.join(' '));

net.delay = 2500; net.rosters = trimmed;
const t0 = Date.now(); await p.reload(); await shown(); const dt = Date.now() - t0;
ok(dt < 1800, 'second visit draws before the 2.5 s Fantrax answer (' + dt + ' ms)');
ok(/checking Fantrax/.test(await p.textContent('#fresh')), 'the freshness line says it is checking');
await scored(); ok((await rows()) === n0, 'it first shows the saved roster (' + n0 + ' rows)');
await p.waitForFunction(n => document.querySelectorAll('#roster tbody tr[data-key]').length === n, n0 - 1, { timeout: 10000 }).then(() => ok(true, 'the changed roster redraws (' + (n0 - 1) + ' rows)')).catch(() => ok(false, 'the changed roster redraws'));
ok(/fetched at/.test(await p.textContent('#fresh')) && !/checking/.test(await p.textContent('#fresh')), 'the line reads "fetched at" once the answer is in');

net.delay = 0; net.status = 500;
await p.reload(); await shown(); await scored();
await p.waitForFunction(() => /refresh/.test(document.getElementById('msg').textContent), null, { timeout: 10000 }).then(() => ok(true, 'a failed refresh says so'), () => ok(false, 'a failed refresh says so'));
ok(!(await p.$eval('#body', e => e.hidden)) && (await rows()) === n0 - 1, 'a failed refresh keeps the saved roster on screen');
ok(errs.length === 0, 'Team: no page errors ' + errs.join('; '));

// ---- League ----
net.status = 200; net.delay = 0; net.rosters = FX.rosters;
await p.goto('http://localhost:8765/league.html'); await shown();
net.delay = 2500;
const t1 = Date.now(); await p.reload(); await shown(); const dl = Date.now() - t1;
ok(dl < 1800, 'League: second visit draws before the 2.5 s Fantrax answer (' + dl + ' ms)');
await p.waitForFunction(() => document.getElementById('msg').textContent === '', null, { timeout: 15000 }).then(() => ok(true, 'League: the "checking" note clears when the answer is in'), () => ok(false, 'League: the "checking" note clears'));
ok(errs.length === 0, 'League: no page errors ' + errs.join('; '));

await b.close();
console.log(fails.length ? fails.length + ' FAILED' : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
