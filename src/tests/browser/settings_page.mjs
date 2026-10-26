// Task 4 check: the Settings page (run against the local server on :8765)
// Needs playwright (run from a folder where it is installed) and the repo root served on :8765 (python -m http.server 8765).
import { chromium } from 'playwright';
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };

const teamInfo = {}; for (let i = 1; i <= 10; i++) teamInfo['t' + i] = { id: 't' + i, name: 'Team ' + String.fromCharCode(64 + i) };
const league = { leagueName: 'Mock League', teamInfo, rosterInfo: { maxTotalPlayers: 13, positionConstraints: { PG: { maxActive: 1 }, SG: { maxActive: 1 }, SF: { maxActive: 1 }, PF: { maxActive: 1 }, C: { maxActive: 2 }, G: { maxActive: 1 }, F: { maxActive: 1 }, UTIL: { maxActive: 2 } } } };
const standings = [{ teamId: 't1', points: '5-2' }, { teamId: 't2', points: '4-3' }];
const board = { cfg: { teams: 12, roster: 13, slot: 5, order: 'snake', scoring: 'h2h', cats: 8, ilSpots: 2, field: 'easy', poStart: 17, asb: 'merged' }, picks: [], log: [], owner: [], fx: null, extra: [] };

const b = await chromium.launch();
async function open(seed, fx) {
  const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  let calls = 0;
  await ctx.route(/api\/fantrax/, r => { calls++; fx(r, calls); });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, seed);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/settings.html'); await p.waitForTimeout(500);
  return { p, errs, ctx, calls: () => calls };
}
const answer = (what, body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const okFx = r => { const w = new URL(r.request().url()).searchParams.get('what'); r.fulfill(answer(w, w === 'league' ? league : w === 'standings' ? standings : {})); };
const stored = p => p.evaluate(() => JSON.parse(localStorage.getItem('courtside-settings-v1') || 'null'));

// 1. migration from the old keys, nothing loaded
{ const { p, errs, ctx } = await open({ 'courtside-board-v1': JSON.stringify(board) }, okFx);
  ok(errs.length === 0, 'loads without errors ' + errs.join('; '));
  ok(await p.$$eval('.sitenav a', l => l.map(a => a.textContent).join('|')) === 'Rankings|Draft|League|Matchup|Trade|Settings', 'toolbar has six links');
  ok(await p.$eval('#s-teams', e => e.value) === '12' && await p.$eval('#s-roster', e => e.value) === '13' && await p.$eval('#s-cats', e => e.value) === '8', 'form shows the old board settings');
  const st = await stored(p);
  ok(st && st.v === 1 && st.settings.teams === 12 && st.settings.cats === 8 && st.league === null, 'migrated store written');
  ok(JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem('courtside-board-v1')))) === JSON.stringify(board), 'board string untouched');
  await ctx.close(); }

// 2. Load: fills teams, roster, lineup; exact note; team picker; persistence
{ const { p, errs, ctx } = await open({ 'courtside-board-v1': JSON.stringify(board) }, okFx);
  await p.fill('#fx-league', 'https://www.fantrax.com/fantasy/league/abc123xyz/home'); await p.click('#fx-load'); await p.waitForTimeout(600);
  ok(await p.textContent('#fx-note') === 'Updated from Fantrax: Teams 12 → 10.', 'Load note exact: ' + await p.textContent('#fx-note'));
  ok(await p.$eval('#s-teams', e => e.value) === '10' && await p.$eval('#s-roster', e => e.value) === '13', 'teams 10, roster 13');
  ok(await p.$eval('#s-cats', e => e.value) === '8', 'categories stay as set');
  ok(await p.$$eval('#fx-team option', o => o.length) === 11, 'team picker: choose + 10 teams');
  ok((await p.textContent('#fx-text')).startsWith('Loaded Mock League'), 'status: ' + await p.textContent('#fx-text'));
  await p.selectOption('#fx-team', 't3'); await p.reload(); await p.waitForTimeout(400);
  ok(await p.$eval('#fx-team', e => e.value) === 't3', 'team default remembered after reload');
  const st = await stored(p);
  ok(st.league && st.league.id === 'abc123xyz' && st.league.teams.length === 10, 'league stored');
  ok(await p.$eval('#lg-row', e => !e.hidden), 'saved leagues row shown');
  // manual edits persist, lineup edit drops luFx
  await p.selectOption('#s-luu', '1'); ok(!('luFx' in (await stored(p)).settings), 'own lineup replaces the Fantrax one');
  await p.selectOption('#s-il', '1'); ok((await stored(p)).settings.ilSpots === 1, 'IL edit persisted');
  // unload
  await p.click('#fx-off'); ok((await stored(p)).league === null && await p.$eval('#fx-on', e => e.hidden), 'Unload clears the league');
  ok(errs.length === 0, 'no page errors ' + errs.join('; '));
  await ctx.close(); }

// 3. a 429 during Load keeps the old state
{ const { p, ctx } = await open({ 'courtside-board-v1': JSON.stringify(board) }, r => r.fulfill(answer('x', { error: 'busy' }, 429)));
  await p.fill('#fx-league', 'abc123xyz'); await p.click('#fx-load'); await p.waitForTimeout(500);
  ok((await p.textContent('#fx-text')).startsWith('Fantrax is busy'), '429 shows the busy message: ' + await p.textContent('#fx-text'));
  const st = await stored(p);
  ok(st.league === null && st.settings.teams === 12, 'state unchanged after 429');
  await ctx.close(); }

// 4. removing the active league unloads it; board with extra picks warns
{ const big = Object.assign({}, board, { picks: Array.from({ length: 160 }, (_, i) => i) });
  const { p, ctx } = await open({ 'courtside-board-v1': JSON.stringify(big) }, okFx);
  await p.selectOption('#s-teams', '10');
  ok((await p.textContent('#sz-warn')).includes('beyond this size'), 'size warning: ' + await p.textContent('#sz-warn'));
  await p.fill('#fx-league', 'abc123xyz'); await p.click('#fx-load'); await p.waitForTimeout(600);
  await p.click('#lg-del'); await p.click('#lg-del');
  ok((await stored(p)).league === null && await p.$eval('#lg-row', e => e.hidden), 'Remove of the active league unloads it');
  await ctx.close(); }

// 5. points scoring: a box per stat, bad input reverts with a warning, values survive a Scoring switch and a reload
{ const { p, errs, ctx } = await open({ 'courtside-board-v1': JSON.stringify(board) }, okFx);
  ok(await p.$eval('#pv-row', e => e.hidden), 'point values hidden for a category league');
  await p.selectOption('#s-scoring', 'points');
  ok(await p.$eval('#pv-row', e => !e.hidden) && await p.$eval('#s-cats-lab', e => getComputedStyle(e).display === 'none'), 'Points shows the boxes and hides Categories');
  ok(await p.$$eval('#pv-row input', l => l.length) === 11, 'eleven point boxes');
  await p.fill('#pv-to', '-1.5'); await p.dispatchEvent('#pv-to', 'change'); await p.fill('#pv-reb', '1.25'); await p.dispatchEvent('#pv-reb', 'change');
  let st = await stored(p); ok(st.settings.scoring === 'points' && st.settings.pointVals.to === -1.5 && st.settings.pointVals.reb === 1.25, 'values stored');
  await p.fill('#pv-reb', '150'); await p.dispatchEvent('#pv-reb', 'change');
  ok((await p.textContent('#pv-warn')).length > 0 && await p.$eval('#pv-reb', e => e.value) === '1.25' && (await stored(p)).settings.pointVals.reb === 1.25, 'out of range warns and reverts');
  await p.fill('#pv-reb', ''); await p.dispatchEvent('#pv-reb', 'change');
  ok((await stored(p)).settings.pointVals.reb === 0 && (await p.textContent('#pv-warn')) === '', 'an empty box is 0');
  await p.selectOption('#s-scoring', 'h2h');
  ok(await p.$eval('#pv-row', e => e.hidden) && await p.$eval('#s-cats-lab', e => getComputedStyle(e).display !== 'none') && await p.$eval('#s-cats', e => e.value) === '8', 'switching back shows Categories with its old value');
  ok((await stored(p)).settings.pointVals.to === -1.5, 'the point values are kept while scoring is a category type');
  await p.selectOption('#s-scoring', 'points'); await p.reload(); await p.waitForTimeout(400);
  ok(await p.$eval('#pv-to', e => e.value) === '-1.5', 'values survive a reload');
  ok(errs.length === 0, 'no page errors ' + errs.join('; '));
  await ctx.close(); }

// 4. scoring is per league: loading a category league from the saved list leaves points scoring behind, and back
{ const st0 = { v: 1, settings: Object.assign({}, board.cfg, { scoring: 'points', pointVals: { pts: 1, to: -1 } }), league: { id: 'ptsLg1', name: 'Friend', teams: [], loadedAt: 1 }, note: '' };
  const lgs = [{ id: 'ptsLg1', name: 'Friend', used: 2, scoring: 'points', pointVals: { pts: 1, to: -1 } }, { id: 'catLg2', name: 'Mine', used: 1 }];
  const { p, errs, ctx } = await open({ 'courtside-settings-v1': JSON.stringify(st0), 'courtside-leagues-v1': JSON.stringify(lgs) }, okFx);
  ok(await p.$eval('#s-scoring', e => e.value) === 'points', 'starts on the points league');
  await p.selectOption('#lg-sel', 'catLg2'); await p.click('#lg-go'); await p.waitForTimeout(600);
  ok(await p.$eval('#s-scoring', e => e.value) === 'h2h', 'loading a category league restores its category scoring');
  await p.selectOption('#lg-sel', 'ptsLg1'); await p.click('#lg-go'); await p.waitForTimeout(600);
  ok(await p.$eval('#s-scoring', e => e.value) === 'points' && await p.$eval('#pv-pts', e => e.value) === '1' && await p.$eval('#pv-to', e => e.value) === '-1', 'loading the points league brings back its scoring and point values');
  ok(errs.length === 0, 'no page errors ' + errs.join('; '));
  await ctx.close(); }

await b.close();
console.log(fails.length ? 'FAILED: ' + fails.length : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
