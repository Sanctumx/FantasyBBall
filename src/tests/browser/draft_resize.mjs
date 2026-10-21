// A board made for 14 teams survives Settings shrinking to 12 and growing back: no crash, no lost picks (review of the Settings tab).
// Needs playwright and the repo root on :8765. REPO=<repo root>.
import { chromium } from 'playwright';
import fs from 'fs';
const REPO = process.env.REPO || '.';
const PLAYERS = JSON.parse(fs.readFileSync(REPO + '/src/players.json', 'utf8'));
const byAdp = PLAYERS.map((p, i) => [p.ftx || 999, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const cfg = n => ({ teams: n, roster: 12, slot: 1, order: '3rr', scoring: 'h2h', cats: 9, ilSpots: 3, field: 'easy', poStart: 18, poFmt: '2-2-2', asb: 'merged', proj: 'avg', basis: 'pergame' });
const store = n => JSON.stringify({ v: 1, settings: cfg(n), league: null, note: '' });
const picks = new Array(168).fill(null); byAdp.slice(0, 160).forEach((id, k) => { picks[k] = id; });
const board = { cfg: cfg(14), picks, log: [...Array(160).keys()], owner: picks.map((_, k) => k % 14), fx: null, extra: [] };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, { 'courtside-board-v1': JSON.stringify(board), 'courtside-settings-v1': store(12) });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1500);
ok(errs.length === 0 && (await p.$$eval('#tbody tr', r => r.length)) > 0, 'a 14-team synced board opens under 12 teams without errors ' + errs.join('; '));
const count = () => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('courtside-board-v1')); return s.picks.filter(v => v != null).length; });
ok(await count() === 144, 'board holds 144 picks at 12 teams (' + await count() + ')');
// live: the open tab follows a Settings change in storage
await p.evaluate(s => { localStorage.setItem('courtside-settings-v1', s); window.dispatchEvent(new StorageEvent('storage', { key: 'courtside-settings-v1' })); }, store(14));
await p.waitForTimeout(500);
ok(errs.length === 0 && await count() === 160, 'back to 14 teams: all 160 picks are back (' + await count() + ') ' + errs.join('; '));
await b.close();
console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
