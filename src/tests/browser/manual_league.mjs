// Manual league check: paste a Yahoo Starting Rosters page in Settings, then every tab draws it with no Fantrax answer.
// Needs playwright (run from a folder where it is installed) and the repo root served on :8765 (python -m http.server 8765).
// REPO=<repo root> node manual_league.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const REPO = process.env.REPO || process.cwd();
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const YAHOO = fs.readFileSync(path.join(REPO, 'src/tests/fixtures/yahoo_starting_rosters.txt'), 'utf8');

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 }, acceptDownloads: true });
await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
let fxCalls = 0; await ctx.route(/api\/fantrax/, r => { fxCalls++; r.abort(); });
const errs = []; const page = async url => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(url + ': ' + e.message)); await p.goto('http://localhost:8765/' + url); await p.waitForTimeout(900); return p; };
const store = p => p.evaluate(() => ({ s: JSON.parse(localStorage.getItem('courtside-settings-v1') || 'null'), l: JSON.parse(localStorage.getItem('courtside-leagues-v1') || '[]'), m: JSON.parse(localStorage.getItem('courtside-manual-v1') || '{}') }));

// 1. create from a pasted page
const s = await page('settings.html');
await s.fill('#mn-name', 'Yahoo 50157'); await s.fill('#mn-text', YAHOO); await s.click('#mn-create'); await s.waitForTimeout(400);
ok(/Created "Yahoo 50157": 2 teams, 19 players/.test(await s.textContent('#mn-note')), 'create note: ' + await s.textContent('#mn-note'));
let st = await store(s); const id = st.s.league.id;
ok(/^m-/.test(id) && st.s.league.teams.length === 2 && st.l[0].manual === true && st.m[id].teams[0].players.length === 15, 'stored: league, saved record, manual copy');
ok(await s.$eval('#lg-sel', e => e.options[e.selectedIndex].text) === 'Yahoo 50157 (manual)', 'saved list labels it manual');
ok(await s.$eval('#s-roster', e => e.value) === '13' && await s.$eval('#s-il', e => e.value) === '2', 'roster 13, IL 2 from the paste');
await s.selectOption('#fx-team', 't2'); await s.selectOption('#s-scoring', 'roto'); await s.waitForTimeout(200);
st = await store(s); ok(st.m[id].myTeam === 't2' && st.m[id].settings.scoring === 'roto' && st.l[0].myTeam === 't2', 'your team and scoring kept with the league');

// 2. a bad paste is refused
await s.fill('#mn-text', 'hello'); await s.click('#mn-create'); await s.waitForTimeout(200);
ok(/Found 0 teams/.test(await s.textContent('#mn-note')) && (await store(s)).l.length === 1, 'bad paste refused, nothing saved');

// 3. every tab draws it with Fantrax unreachable
for (const url of ['team.html', 'rankings.html', 'league.html', 'inseason.html']) {
  const p = await page(url); const t = await p.evaluate(() => document.body.innerText);
  ok(/Los Laguneros|Droppin/.test(t), url + ' shows the manual teams');
  ok(!/Couldn.t reach|didn.t answer|Load a league/.test(t), url + ' shows no sync error');
  await p.close();
}
{ const d = await page('index.html'); ok(await d.$eval('#fx-import', e => e.disabled) && /manual/.test(await d.textContent('#fx-lg')), 'Draft board: import draft is off for a manual league'); await d.close(); }
ok(fxCalls === 0, 'no Fantrax call for a manual league (' + fxCalls + ')');

// 4. export, forget, import (replace / keep both)
const [dl] = await Promise.all([s.waitForEvent('download'), s.click('#mn-export')]);
const file = path.join(process.env.TEMP || '/tmp', 'ml.json'); await dl.saveAs(file);
ok(dl.suggestedFilename() === 'yahoo-50157.courtside-league.json', 'file name ' + dl.suggestedFilename());
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
ok(data.kind === 'league' && data.version === 1 && data.league.id === id && data.league.myTeam === 't2', 'file content');
await s.click('#lg-del'); await s.click('#lg-del'); await s.waitForTimeout(200);
ok(Object.keys((await store(s)).m).length === 0, 'forget removes the manual copy');
await s.setInputFiles('#mn-file', file); await s.waitForTimeout(500);
st = await store(s); ok(st.m[id] && st.s.league.id === id && /Imported/.test(await s.textContent('#mn-note')), 'import brings it back');
s.once('dialog', d => d.dismiss()); await s.setInputFiles('#mn-file', file); await s.waitForTimeout(500);
st = await store(s); ok(Object.keys(st.m).length === 2 && st.l.some(x => x.name === 'Yahoo 50157 (2)'), 'keep both makes a copy');
s.once('dialog', d => d.accept()); await s.setInputFiles('#mn-file', file); await s.waitForTimeout(500);
ok(Object.keys((await store(s)).m).length === 2, 'replace keeps two leagues');
fs.writeFileSync(file, '{"nope":1}'); await s.setInputFiles('#mn-file', file); await s.waitForTimeout(300);
ok(/not a Courtside league/.test(await s.textContent('#mn-note')), 'a wrong file is refused');

// 5. update rosters of the selected league
await s.selectOption('#lg-sel', id); await s.fill('#mn-text', YAHOO.replace('Davion Mitchell', 'Davion Mitchel')); await s.click('#mn-update'); await s.waitForTimeout(400);
st = await store(s); ok(st.m[id].teams[1].players[0].n === 'Davion Mitchel' && st.m[id].myTeam === 't2' && st.m[id].name === 'Yahoo 50157', 'update replaces rosters, keeps name and your team');

ok(errs.length === 0, 'no page errors ' + errs.join('; '));
await b.close(); console.log(fails.length ? fails.length + ' FAILED' : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
