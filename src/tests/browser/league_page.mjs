// League Dashboard (current rosters of the league loaded in Settings), run against the local server on :8765.
// Needs playwright (run from a folder where it is installed; copy league_mock.mjs next to this file) and the repo root on :8765.
import { chromium } from 'playwright';
import { mockLeague } from './league_mock.mjs';
const REPO = process.env.REPO || '/root/FantasyBBall';
const M = mockLeague(REPO);
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };

const b = await chromium.launch();
async function page(seed, opts = {}) {
  const ctx = await b.newContext({ viewport: opts.vp || { width: 1500, height: 1000 }, colorScheme: opts.dark ? 'dark' : 'light' });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  let calls = 0;
  await ctx.route(/api\/fantrax/, r => { calls++; (opts.fx || M.route)(r, calls); });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, seed);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/league.html'); await p.waitForTimeout(opts.wait || 1500);
  return { p, errs, ctx, calls: () => calls };
}

{ const { p, errs, ctx } = await page(M.seed());
  ok(errs.length === 0, 'loads without errors ' + errs.join('; '));
  ok(!(await p.$('#src')) && /Home/.test(await p.textContent('#lgname')), 'no league picker; league name shown: ' + await p.textContent('#lgname'));
  ok(await p.$$eval('.sitenav a', l => l.map(a => a.textContent).join('|')) === 'Rankings|Draft|League|Matchup|Trade|Settings', 'toolbar Rankings | Draft | League | Matchup | Trade | Settings');
  const mx = await p.$$eval('#mx tbody tr', rows => rows.map(r => [...r.querySelectorAll('td.v')].map(td => td.textContent)));
  ok(mx.length === 14 && mx.every(r => r.length === 14), 'matrix 14 × 14 (' + mx.length + ')');
  ok(/Club 0 \(you\)/.test(await p.textContent('#focusName')), 'focus team is the saved league team: ' + await p.textContent('#focusName'));
  const h2h = await p.$$eval('#h2h tbody tr', rows => rows.map(r => [r.dataset.t, r.querySelector('td.m').textContent]));
  ok(h2h.length === 13 && h2h.every(([t, v]) => mx[0][+t] === v), 'focus row matches matrix row');
  ok((await p.$$eval('#prof tbody tr', r => r.length)) === 9, 'profile has 9 categories');
  ok(/14 teams .* 168 of 168 roster spots filled/.test(await p.textContent('#fmt')), 'format line: ' + await p.textContent('#fmt'));
  await p.click('#tsv button[data-v="rank"]'); await p.waitForTimeout(200);
  const ranks = await p.$$eval('#ts tbody tr', rows => rows.map(r => [...r.querySelectorAll('td.v')].map(td => +td.textContent)));
  ok(ranks[0].length === 9 && ranks[0].every((_, c) => ranks.map(r => r[c]).sort((a, b) => a - b).join() === Array.from({ length: 14 }, (_, i) => i + 1).join()), 'rank view: 1..14 per column');
  await p.click('#mxv button[data-v="cat"]'); await p.waitForTimeout(200);
  ok(await p.isVisible('#mxc'), 'category select shown in category view');
  await p.selectOption('#team', '3'); await p.waitForTimeout(500);
  ok(/Club 3 \(you\)/.test(await p.textContent('#focusName')), 'team picker changes the team');
  await p.reload(); await p.waitForTimeout(1200);
  ok(await p.$eval('#team', s => s.value) === '3', 'remembers the team per league');
  const st = await p.evaluate(() => ({ s: localStorage.getItem('courtside-settings-v1'), l: localStorage.getItem('courtside-leagues-v1') }));
  ok(st.s === M.seed()['courtside-settings-v1'] && st.l === M.seed()['courtside-leagues-v1'], 'Settings and saved leagues untouched');
  await ctx.close(); }

{ const { p, errs, ctx } = await page(M.seed(), { vp: { width: 390, height: 900 }, dark: true });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways page scroll at 390 px');
  const cc = await p.evaluate(() => { const td = document.querySelector('#ts tbody td.l'); const cs = getComputedStyle(td); return [cs.color, getComputedStyle(document.body).backgroundColor]; });
  ok(cc[0] !== cc[1] && !/rgb\(0, 0, 0\)|rgb\(21, 25, 27\)/.test(cc[0]), 'dark: text readable (' + cc + ')');
  ok(errs.length === 0, 'phone/dark no errors');
  await ctx.close(); }

// no league loaded: the prompt, no request
{ const { p, errs, ctx, calls } = await page({});
  ok(!!(await p.$('#msg a[href="settings.html"]')) && /Load a league in/.test(await p.textContent('#msg')) && calls() === 0 && errs.length === 0, 'no league: prompt with Settings link, no request');
  ok(await p.$eval('#body', e => e.hidden), 'no league: dashboard hidden');
  await ctx.close(); }

// IR players are left out and noted
{ const L = mockLeague(REPO); const first = L.rosters.rosters.t0.rosterItems; first[first.length - 1].status = 'INJURED_RESERVE';
  const { p, errs, ctx } = await page(L.seed(), { fx: L.route });
  ok(/167 of 168 roster spots filled · 1 on IR left out/.test(await p.textContent('#fmt')), 'IR note: ' + await p.textContent('#fmt'));
  ok(errs.length === 0, 'IR path no errors ' + errs.join('; '));
  await ctx.close(); }

// busy answer, then the league loads on the retry timer
{ const fx = (r, n) => { if (n <= 1) return r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Fantrax is busy (too many requests). The board will retry on its own.' }) }); return M.route(r); };
  const { p, errs, ctx } = await page(M.seed(), { fx, wait: 1500 });
  ok(/busy/i.test(await p.textContent('#msg')), 'Fantrax busy message (' + await p.textContent('#msg') + ')');
  await p.waitForTimeout(11000);
  ok((await p.$$eval('#mx tbody tr', r => r.length)) === 14 && /Club 0/.test(await p.textContent('#mx')), 'league loads after retry');
  ok(errs.length === 0, 'retry timer path no errors ' + errs.join('; '));
  await ctx.close(); }

// a failed load hides the page; Retry loads it
{ let up = false;
  const fx = r => up ? M.route(r) : r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'League ID should be letters and numbers.' }) });
  const { p, errs, ctx } = await page(M.seed(), { fx });
  ok(await p.$eval('#body', e => e.hidden) && (await p.textContent('#fmt')) === '' && /letters and numbers/.test(await p.textContent('#msg')), 'failed load hides the dashboard and says why');
  ok(await p.isVisible('#retry'), 'Retry button shown after a failed load');
  up = true; await p.click('#retry'); await p.waitForTimeout(1500);
  ok(/Club 0/.test(await p.textContent('#mx')) && !(await p.isVisible('#retry')), 'Retry loads the league and hides the button');
  ok(errs.length === 0, 'retry path no errors ' + errs.join('; '));
  await ctx.close(); }

await b.close();
console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
