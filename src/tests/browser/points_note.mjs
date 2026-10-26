// #137 PR 1 check: with Scoring set to points, Draft, League, Matchup, Trade and Rankings say points aren't supported yet
// and show no numbers; with a category scoring they work as before. A saved draft loaded with "Switch settings?" keeps the
// typed point values. Needs playwright and the repo root served on :8765 (python -m http.server 8765).
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8765;
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const PHRASE = "aren't supported on this tab yet";

const league = { id: 'abc123xyz', name: 'Mock League', teams: [], loadedAt: null };
const store = (scoring, extra) => ({ 'courtside-settings-v1': JSON.stringify({ v: 1, settings: Object.assign({ teams: 12, roster: 13, scoring, cats: 9, pointVals: { to: -1 } }, extra), league, note: '' }) });

const b = await chromium.launch();
async function open(seed, page) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route(/api\/fantrax/, r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }));
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, seed);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:' + PORT + '/' + page); await p.waitForTimeout(1500);
  return { p, errs, ctx };
}
const text = p => p.evaluate(() => document.body.innerText);

// points: every tab shows the note and no player rows
for (const [page, rows] of [['index.html', '#tbody tr'], ['league.html', '#body:not([hidden]) table tr'], ['inseason.html', '#body:not([hidden]) table tr'], ['rankings.html', '#tbl tr']]) {
  const { p, errs, ctx } = await open(store('points'), page);
  ok((await text(p)).includes(PHRASE), page + ': points shows the not-supported note');
  ok(await p.$$eval(rows, r => r.length) === 0, page + ': points shows no rows');
  ok(errs.length === 0, page + ': no page errors ' + errs.join('; '));
  await ctx.close();
}
// categories: Draft and Rankings still have rows and no note
for (const [page, rows] of [['index.html', '#tbody tr'], ['rankings.html', '#tbl tbody tr']]) {
  const { p, errs, ctx } = await open({}, page);
  ok(!(await text(p)).includes(PHRASE) && await p.$$eval(rows, r => r.length) > 10, page + ': a category league still shows its table');
  ok(errs.length === 0, page + ': no page errors ' + errs.join('; '));
  await ctx.close();
}
// a saved h2h draft (12 teams) loaded through "Switch settings?" keeps the typed point values
{ const draft = { name: 'D', savedAt: 1, cfg: { teams: 12, roster: 13, slot: 5, order: 'snake', scoring: 'h2h', cats: 9 }, picks: [], log: [], owner: [], extra: [] };
  const seed = Object.assign(store('h2h', { teams: 14 }), { 'courtside-saved-drafts-v1': JSON.stringify([draft]) });
  const { p, errs, ctx } = await open(seed, 'index.html');
  await p.click('[data-load="D"]'); await p.click('[data-load="D"]'); await p.waitForTimeout(500);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('courtside-settings-v1')));
  ok(st.settings.teams === 12 && st.settings.pointVals && st.settings.pointVals.to === -1, 'loading a saved draft keeps the point values: ' + JSON.stringify([st.settings.teams, st.settings.pointVals && st.settings.pointVals.to]));
  ok(errs.length === 0, 'saved draft load: no page errors ' + errs.join('; '));
  await ctx.close(); }

await b.close();
console.log(fails.length ? 'FAILED: ' + fails.length : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
