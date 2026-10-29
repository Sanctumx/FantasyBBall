// League Dashboard on the Team-tab rules (league-team-rules, 2026-10-29), run against the local server on :8765.
// Needs playwright and the repo root on :8765 (python -m http.server 8765). REPO=<repo root> overrides the fixtures location.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = process.env.REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PORT = process.env.PORT || 8765;
const fx = n => fs.readFileSync(path.join(REPO, 'src/tests/fixtures', n), 'utf8');
const FX = { league: fx('fx_league.json'), rosters: fx('fx_rosters.json'), standings: fx('fx_standings.json'), players: fx('fx_players.json') };
const ESPN = fx('espn_2025_26.json');
const NOW = Date.UTC(2026, 9, 21, 12);
const LID = 'abc123', INFO = JSON.parse(FX.league).teamInfo, TEAMS = Object.keys(INFO), N = TEAMS.length;
const SEED = (my = TEAMS[0]) => ({
  'courtside-settings-v1': JSON.stringify({ v: 1, settings: { teams: N, roster: 12, scoring: 'h2h', cats: 9, asb: 'merged', poStart: 18, poFmt: '2-2-2', ilSpots: 3 }, league: { id: LID, name: 'Home', teams: [], loadedAt: 1 }, note: '' }),
  'courtside-leagues-v1': JSON.stringify([{ id: LID, name: 'Home', myTeam: my, used: 1 }]) });
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };

const b = await chromium.launch();
async function page(seed, opts = {}) {
  const ctx = await b.newContext({ viewport: opts.vp || { width: 1500, height: 1000 }, colorScheme: opts.dark ? 'dark' : 'light' });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route(/stats\/espn\.json/, r => r.fulfill({ body: ESPN, contentType: 'application/json' }));
  let calls = 0;
  await ctx.route(/api\/fantrax/, r => { calls++; (opts.fx || ((q) => q.fulfill({ body: FX[new URL(q.request().url()).searchParams.get('what')] || '{}', contentType: 'application/json' })))(r, calls); });
  await ctx.addInitScript(t => { Date.now = () => t; }, NOW);
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, seed);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:' + PORT + '/league.html'); await p.waitForTimeout(opts.wait || 1500);
  if (!opts.noWait) await p.waitForSelector('#body:not([hidden])', { timeout: 20000 }).catch(() => {});
  return { p, errs, ctx, calls: () => calls };
}

{ const { p, errs, ctx } = await page(SEED());
  ok(errs.length === 0, 'loads without errors ' + errs.join('; '));
  ok(!!(await p.$('#src')) && (await p.$eval('#src', s => s.value)) === 'avg' && !(await p.$('#proj')), 'Source select replaces Projections; default Average');
  ok(/Home/.test(await p.textContent('#lgname')), 'league name shown: ' + await p.textContent('#lgname'));
  ok(await p.$$eval('.sitenav a', l => l.map(a => a.textContent).join('|')) === 'Rankings|Team|Draft|League|Matchup|Trade|Settings', 'toolbar Rankings | Team | Draft | League | Matchup | Trade | Settings');
  const mx = await p.$$eval('#mx tbody tr', rows => rows.map(r => [...r.querySelectorAll('td.v')].map(td => td.textContent)));
  ok(mx.length === N && mx.every(r => r.length === N), 'matrix ' + N + ' × ' + N + ' (' + mx.length + ')');
  ok(new RegExp(INFO[TEAMS[0]].name + ' \\(you\\)').test(await p.textContent('#focusName')), 'focus team is the saved league team: ' + await p.textContent('#focusName'));
  const first = await p.$eval('#mx tbody tr.me td.l', e => e.textContent);
  const myRow = await p.$$eval('#mx tbody tr.me td.v', tds => tds.map(td => td.textContent));
  const h2h = await p.$$eval('#h2h tbody tr', rows => rows.map(r => [r.dataset.t, r.querySelector('td.m').textContent]));
  ok(h2h.length === N - 1 && h2h.every(([t, v]) => myRow[+t] === v), 'focus row matches matrix row (' + first + ')');
  ok((await p.$$eval('#prof tbody tr', r => r.length)) === 9, 'profile has 9 categories');
  ok(new RegExp('^' + N + ' teams · H2H each category · 9-cat').test(await p.textContent('#fmt')), 'format line: ' + await p.textContent('#fmt'));
  ok(/ on IL/.test(await p.textContent('#fmt')) && !/left out/.test(await p.textContent('#fmt')), 'IL players are listed, not left out: ' + await p.textContent('#fmt'));
  ok(/IL players count at their availability/.test(await p.textContent('#note')) && /uncalibrated/.test(await p.textContent('#note')), 'note under the controls (Total): ' + await p.textContent('#note'));
  await p.selectOption('#basis', 'pergame'); await p.waitForTimeout(500);
  ok(/IL players do not count/.test(await p.textContent('#note')), 'note changes on Per game');
  await p.selectOption('#basis', 'total'); await p.waitForTimeout(500);
  await p.click('#tsv button[data-v="rank"]'); await p.waitForTimeout(200);
  const ranks = await p.$$eval('#ts tbody tr', rows => rows.map(r => [...r.querySelectorAll('td.v')].map(td => +td.textContent)));
  ok(ranks[0].length === 9 && ranks[0].every((_, c) => ranks.map(r => r[c]).sort((a, b) => a - b).join() === Array.from({ length: N }, (_, i) => i + 1).join()), 'rank view: 1..' + N + ' per column');
  ok(!(await p.isVisible('#ztype')), 'Zscore type select hidden outside the Zscore view');
  await p.click('#tsv button[data-v="z"]'); await p.waitForTimeout(200);
  ok(await p.isVisible('#ztype'), 'Zscore type select shown in the Zscore view');
  const z1 = await p.textContent('#ts');
  await p.selectOption('#ztype', 'adj'); await p.waitForTimeout(500);
  ok((await p.textContent('#ts')) !== z1 && errs.length === 0, 'Roto-adjusted Zscore changes the Zscore view');
  await p.click('#mxv button[data-v="cat"]'); await p.waitForTimeout(200);
  ok(await p.isVisible('#mxc'), 'category select shown in category view');
  await p.selectOption('#team', '3'); await p.waitForTimeout(500);
  ok(/\(you\)/.test(await p.textContent('#focusName')) && !new RegExp(INFO[TEAMS[0]].name + ' \\(you\\)').test(await p.textContent('#focusName')), 'team picker changes the team');
  await p.reload(); await p.waitForTimeout(1500);
  ok(await p.$eval('#team', s => s.value) === '3', 'remembers the team per league');
  const st = await p.evaluate(() => ({ s: localStorage.getItem('courtside-settings-v1'), l: localStorage.getItem('courtside-leagues-v1') }));
  ok(st.s === SEED()['courtside-settings-v1'] && st.l === SEED()['courtside-leagues-v1'], 'Settings and saved leagues untouched');
  ok(errs.length === 0, 'no page errors after the walk-through ' + errs.join('; '));
  await ctx.close(); }

// a recent-games source loads the box-score files and redraws
{ const { p, errs, ctx } = await page(SEED());
  const before = await p.textContent('#mx');
  await p.selectOption('#src', 'bbm'); await p.waitForTimeout(1200);
  ok(errs.length === 0 && (await p.$$eval('#mx tbody tr', r => r.length)) === N, 'switching to BBM redraws without errors ' + errs.join('; '));
  ok((await p.textContent('#mx')) !== before, 'BBM numbers differ from the Average');
  await p.selectOption('#src', 'w14'); await p.waitForTimeout(2500);
  ok(errs.length === 0 && (await p.$$eval('#mx tbody tr', r => r.length)) === N && /recent games/.test(await p.textContent('#note')), 'Last 2 weeks redraws, note says recent games ' + errs.join('; '));
  await ctx.close(); }

{ const { p, errs, ctx } = await page(SEED(), { vp: { width: 390, height: 900 }, dark: true });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways page scroll at 390 px');
  const cc = await p.evaluate(() => { const td = document.querySelector('#ts tbody td.l'); const cs = getComputedStyle(td); return [cs.color, getComputedStyle(document.body).backgroundColor]; });
  ok(cc[0] !== cc[1] && !/rgb\(0, 0, 0\)|rgb\(21, 25, 27\)/.test(cc[0]), 'dark: text readable (' + cc + ')');
  ok(errs.length === 0, 'phone/dark no errors');
  await ctx.close(); }

// no league loaded: the prompt, no request
{ const { p, errs, ctx, calls } = await page({}, { noWait: true });
  ok(!!(await p.$('#msg a[href="settings.html"]')) && /Load a league in/.test(await p.textContent('#msg')) && calls() === 0 && errs.length === 0, 'no league: prompt with Settings link, no request');
  ok(await p.$eval('#body', e => e.hidden), 'no league: dashboard hidden');
  await ctx.close(); }

// busy answer, then the league loads on the retry timer
{ const ok200 = q => q.fulfill({ body: FX[new URL(q.request().url()).searchParams.get('what')] || '{}', contentType: 'application/json' });
  const fx = (r, n) => { if (n <= 1) return r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Fantrax is busy (too many requests). The board will retry on its own.' }) }); return ok200(r); };
  const { p, errs, ctx } = await page(SEED(), { fx, wait: 1500, noWait: true });
  ok(/busy/i.test(await p.textContent('#msg')), 'Fantrax busy message (' + await p.textContent('#msg') + ')');
  await p.waitForTimeout(11000);
  ok((await p.$$eval('#mx tbody tr', r => r.length)) === N, 'league loads after retry');
  ok(errs.length === 0, 'retry timer path no errors ' + errs.join('; '));
  await ctx.close(); }

// a failed load hides the page; Retry loads it
{ let up = false;
  const fx = r => up ? r.fulfill({ body: FX[new URL(r.request().url()).searchParams.get('what')] || '{}', contentType: 'application/json' }) : r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'League ID should be letters and numbers.' }) });
  const { p, errs, ctx } = await page(SEED(), { fx, noWait: true });
  ok(await p.$eval('#body', e => e.hidden) && (await p.textContent('#fmt')) === '' && /letters and numbers/.test(await p.textContent('#msg')), 'failed load hides the dashboard and says why');
  ok(await p.isVisible('#retry'), 'Retry button shown after a failed load');
  up = true; await p.click('#retry'); await p.waitForSelector('#body:not([hidden])', { timeout: 20000 }).catch(() => {});
  ok((await p.$$eval('#mx tbody tr', r => r.length)) === N && !(await p.isVisible('#retry')), 'Retry loads the league and hides the button');
  ok(errs.length === 0, 'retry path no errors ' + errs.join('; '));
  await ctx.close(); }

await b.close();
console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
