// Task 5 check: the Draft board gives identical output before and after it reads league settings from the shared store.
// draft_baseline.json was recorded from the build before Task 5 (BASELINE=record rewrites it). Needs playwright and the
// repo root served on :8765. Seeds: A fresh visit, B an existing user (old board keys, custom league), C the store wins
// over stale board keys. B and C must give the same output as A/B did before the change.
import { chromium } from 'playwright';
import fs from 'fs';
const REPO = process.env.REPO || '.';
const BASE = REPO + '/src/tests/browser/draft_baseline.json';
const PLAYERS = JSON.parse(fs.readFileSync(REPO + '/src/players.json', 'utf8'));
const byAdp = PLAYERS.map((p, i) => [p.ftx || 999, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };

const custom = { teams: 12, roster: 13, slot: 5, order: 'snake', scoring: 'h2h', cats: 8, ilSpots: 2, field: 'average', poStart: 17, poFmt: '1-2-2', asb: 'separate', proj: 'avg', basis: 'pergame', luSplit: false, luC: 1, luG: 3, luF: 3, luU: 3 };
const picks = new Array(12 * 13).fill(null); byAdp.slice(0, 20).forEach((id, k) => { picks[k] = id; });
const board = { cfg: custom, picks, log: [...Array(20).keys()], owner: [], fx: null, extra: [] };
const seeds = {
  A: {},
  B: { 'courtside-board-v1': JSON.stringify(board) },
};

const b = await chromium.launch();
async function snap(seed, label) {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, seed);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1500);
  const t = sel => p.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim());
  const out = { clock: await t('#clock'), mine: await t('#mine'), rows: await p.$$eval('#tbody tr', r => r.slice(0, 10).map(x => x.innerText.replace(/\s+/g, ' ').trim())) };
  ok(errs.length === 0, label + ': no page errors ' + errs.join('; '));
  await ctx.close(); return out;
}
const got = { A: await snap(seeds.A, 'A fresh'), B: await snap(seeds.B, 'B existing user') };
if (process.env.BASELINE === 'record') { fs.writeFileSync(BASE, JSON.stringify(got, null, 1)); console.log('baseline recorded'); }
else {
  const want = JSON.parse(fs.readFileSync(BASE, 'utf8'));
  for (const k of ['A', 'B']) for (const f of ['clock', 'mine', 'rows']) ok(JSON.stringify(got[k][f]) === JSON.stringify(want[k][f]), k + ' ' + f + ' identical to baseline');
  // C: the store wins over stale board keys (teams 10 in the store, 12 in the board)
  const store = { v: 1, settings: Object.assign({}, custom, { teams: 10 }), league: null, note: '' };
  const c = await snap({ 'courtside-board-v1': JSON.stringify(board), 'courtside-settings-v1': JSON.stringify(store) }, 'C store wins');
  ok(/of 10 teams/i.test(c.mine) && c.mine !== want.B.mine, 'C: Your team shows 10 teams (store used): ' + c.mine.slice(0, 70));
}
// D: Settings changes in another tab while Draft is open; E: loading a saved draft with other league settings asks first
{ const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  const saves = [{ name: 'Mock 10', savedAt: 5, cfg: Object.assign({}, custom, { teams: 10, roster: 13, slot: 3, cats: 9 }), picks: new Array(130).fill(null), log: [], owner: [], extra: [] }];
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } },
    { 'courtside-board-v1': JSON.stringify(board), 'courtside-saved-drafts-v1': JSON.stringify(saves) });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1200);
  ok(/12 teams/.test(await p.textContent('#lg-sum')) && !!(await p.$('#lg-sum a[href="settings.html"]')), 'League summary line with Settings link: ' + await p.textContent('#lg-sum'));
  ok(!(await p.$('#s-teams')) && !(await p.$('#s-roster')) && !!(await p.$('#s-slot')) && !!(await p.$('#s-field')), 'setup keeps only slot, order and field');
  const q = await ctx.newPage(); await q.goto('http://localhost:8765/settings.html'); await q.waitForTimeout(500);
  await q.selectOption('#s-teams', '11'); await p.waitForTimeout(500);
  ok(/11 teams/.test(await p.textContent('#lg-sum')) && /of 11 teams/i.test(await p.textContent('#mine')), 'Draft follows a Settings change live');
  await p.click('button[data-load="Mock 10"]');
  ok((await p.textContent('#sv-msg')).includes('other league settings'), 'saved draft with other settings asks first: ' + await p.textContent('#sv-msg'));
  ok(/11 teams/.test(await p.textContent('#lg-sum')), 'nothing changed before the confirm');
  await p.click('button[data-load="Mock 10"]'); await p.waitForTimeout(400);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('courtside-settings-v1')));
  ok(st.settings.teams === 10 && st.settings.cats === 9 && /10 teams/.test(await p.textContent('#lg-sum')), 'confirm switches Settings to the draft: teams ' + st.settings.teams);
  ok(errs.length === 0, 'D/E: no page errors ' + errs.join('; '));
  await ctx.close(); }

await b.close();
console.log(fails.length ? 'FAILED: ' + fails.length : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
