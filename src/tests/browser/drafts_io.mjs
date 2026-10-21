// Draft Kit saved drafts: export to a file and import it back (2026-10-18). Needs playwright and the repo root on :8765.
import { chromium } from 'playwright';
import fs from 'fs';
const PLAYERS = JSON.parse(fs.readFileSync((process.env.REPO || '/root/FantasyBBall') + '/src/players.json', 'utf8'));
const byAdp = PLAYERS.map((p, i) => [p.ftx || 999, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const cfg = { teams: 14, roster: 12, slot: 5, order: '3rr', scoring: 'h2h', cats: 9, ilSpots: 3, field: 'easy', poStart: 18, asb: 'merged', proj: 'avg' };
const saved = [{ name: 'Mock A', savedAt: 1700000000000, cfg, picks: byAdp.slice(0, 30), log: [], owner: [], fx: null, extra: [] }];
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
await ctx.addInitScript(s => { if (!sessionStorage.getItem('s')) { localStorage.clear(); localStorage.setItem('courtside-saved-drafts-v1', s); sessionStorage.setItem('s', '1'); } }, JSON.stringify(saved));
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1500);
const saves = () => p.evaluate(() => JSON.parse(localStorage.getItem('courtside-saved-drafts-v1') || '[]'));

// export one
let [dl] = await Promise.all([p.waitForEvent('download'), p.click('button[data-exp="Mock A"]')]);
ok(dl.suggestedFilename() === 'mock-a.courtside.json', 'file name ' + dl.suggestedFilename());
const file = '/tmp/claude-0/-home-claude/1c032382-e8b8-5b19-a5f5-2e39a1326f15/scratchpad/mock-a.json'; await dl.saveAs(file);
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
ok(j.app === 'courtside-draft-kit' && j.drafts.length === 1 && j.drafts[0].picks.length === 30, 'export holds the draft');
ok(j.drafts[0].pickNames[0].n === PLAYERS[byAdp[0]].n, 'export carries player names');
// import the same file: nothing new
await p.setInputFiles('#sv-file', file); await p.waitForTimeout(300);
ok((await saves()).length === 1 && /already saved/.test(await p.textContent('#sv-msg')), 'same file again adds nothing');
// delete then import: comes back identical
await p.evaluate(() => localStorage.setItem('courtside-saved-drafts-v1', '[]'));
await p.setInputFiles('#sv-file', file); await p.waitForTimeout(300);
let s = await saves(); ok(s.length === 1 && s[0].name === 'Mock A' && JSON.stringify(s[0].picks) === JSON.stringify(saved[0].picks), 'imported draft matches');
ok(await p.isVisible('button[data-load="Mock A"]'), 'shows in the list');
// a file from an older player list: ids shifted by one, names still right
const old = JSON.parse(JSON.stringify(j)); old.drafts[0].name = 'Old list'; old.drafts[0].picks = old.drafts[0].picks.map(id => id + 1);
fs.writeFileSync(file.replace('mock-a', 'old'), JSON.stringify(old));
await p.setInputFiles('#sv-file', file.replace('mock-a', 'old')); await p.waitForTimeout(300);
s = await saves(); const o = s.find(d => d.name === 'Old list');
ok(o && JSON.stringify(o.picks) === JSON.stringify(saved[0].picks), 'picks re-matched by name');
// same name, different draft: kept as a copy
const other = JSON.parse(JSON.stringify(j)); other.drafts[0].picks = other.drafts[0].picks.slice(0, 10); other.drafts[0].pickNames = other.drafts[0].pickNames.slice(0, 10);
fs.writeFileSync(file.replace('mock-a', 'other'), JSON.stringify(other));
await p.setInputFiles('#sv-file', file.replace('mock-a', 'other')); await p.waitForTimeout(300);
ok((await saves()).some(d => d.name === 'Mock A (2)'), 'name clash saved as "Mock A (2)"');
// export all, bad file
[dl] = await Promise.all([p.waitForEvent('download'), p.click('#sv-export-all')]);
await dl.saveAs(file); ok(JSON.parse(fs.readFileSync(file, 'utf8')).drafts.length === 3, 'export all holds every draft');
fs.writeFileSync(file, 'nope'); await p.setInputFiles('#sv-file', file); await p.waitForTimeout(300);
ok(/not JSON/.test(await p.textContent('#sv-msg')) && (await saves()).length === 3, 'bad file: message, nothing changes');
// load the imported one
await p.click('button[data-load="Old list"]'); await p.waitForTimeout(300);
if (/Replace\?/.test(await p.textContent('button[data-load="Old list"]'))) await p.click('button[data-load="Old list"]');
await p.waitForTimeout(500);
ok(JSON.parse(await p.evaluate(() => localStorage.getItem('courtside-board-v1'))).picks.filter(v => v != null).length === 30, 'imported draft loads on the board');
ok(errs.length === 0, 'no page errors ' + errs.join('; '));
await b.close();
console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
