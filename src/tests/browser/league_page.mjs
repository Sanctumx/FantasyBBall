// Task 5 check: the League page (run against the local server on :8765)
// Needs playwright (run from a folder where it is installed) and the repo root served on :8765 (python3 -m http.server 8765).
import { chromium } from 'playwright';
import fs from 'fs';
const PLAYERS = JSON.parse(fs.readFileSync('/root/FantasyBBall/src/players.json', 'utf8'));
const byAdp = PLAYERS.map((p, i) => [p.ftx || 999, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const cfg = { teams: 14, roster: 12, slot: 1, order: '3rr', scoring: 'h2h', cats: 9, ilSpots: 3, field: 'easy', poStart: 18, asb: 'merged', proj: 'avg', basis: 'pergame' };
const boardState = { cfg, picks: byAdp.slice(0, 168), log: [], owner: [], fx: null, extra: [] };
const saved = [{ name: 'Mock 10', savedAt: 5, cfg: Object.assign({}, cfg, { teams: 10, roster: 13, slot: 3, cats: 8 }), picks: byAdp.slice(0, 130), owner: [], extra: [] }];
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };

const b = await chromium.launch();
async function page(seed, opts = {}) {
  const ctx = await b.newContext({ viewport: opts.vp || { width: 1500, height: 1000 }, colorScheme: opts.dark ? 'dark' : 'light' });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  if (opts.fx) await ctx.route(/api\/fantrax/, opts.fx);
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, seed);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/league.html'); await p.waitForTimeout(opts.wait || 1500);
  return { p, errs, ctx };
}
const seed = { 'courtside-board-v1': JSON.stringify(boardState), 'courtside-saved-drafts-v1': JSON.stringify(saved) };

{ const { p, errs, ctx } = await page(seed);
  ok(errs.length === 0, 'loads without errors ' + errs.join('; '));
  const opts = await p.$$eval('#src option', o => o.map(x => x.value));
  ok(opts.length === 2 && opts[0] === 'board' && opts[1] === 'saved:Mock 10', 'source list = board + saved (' + opts + ')');
  ok(await p.$$eval('.sitenav a', l => l.map(a => a.textContent).join('|')) === 'Draft Kit|League', 'toolbar Draft Kit | League');
  const mx = await p.$$eval('#mx tbody tr', rows => rows.map(r => [...r.querySelectorAll('td.v')].map(td => td.textContent)));
  ok(mx.length === 14 && mx.every(r => r.length === 14), 'matrix 14 × 14 (' + mx.length + ')');
  const h2h = await p.$$eval('#h2h tbody tr', rows => rows.map(r => [r.dataset.t, r.querySelector('td.m').textContent]));
  ok(h2h.length === 13 && h2h.every(([t, v]) => mx[0][+t] === v), 'focus row matches matrix row');
  ok((await p.$$eval('#prof tbody tr', r => r.length)) === 9, 'profile has 9 categories');
  await p.click('#tsv button[data-v="rank"]'); await p.waitForTimeout(200);
  const ranks = await p.$$eval('#ts tbody tr', rows => rows.map(r => [...r.querySelectorAll('td.v')].map(td => +td.textContent)));
  ok(ranks[0].length === 9 && ranks[0].every((_, c) => ranks.map(r => r[c]).sort((a, b) => a - b).join() === Array.from({ length: 14 }, (_, i) => i + 1).join()), 'rank view: 1..14 per column');
  await p.click('#mxv button[data-v="cat"]'); await p.waitForTimeout(200);
  ok(await p.isVisible('#mxc'), 'category select shown in category view');
  await p.selectOption('#src', 'saved:Mock 10'); await p.waitForTimeout(800);
  const mx2 = await p.$$eval('#mx tbody tr', rows => rows.map(r => r.querySelectorAll('td.v').length));
  ok(mx2.length === 10 && mx2.every(n => n === 10), 'saved 10-team draft re-renders 10 × 10');
  ok((await p.$$eval('#ts thead th', t => t.map(x => x.textContent))).indexOf('TO') < 0, '8-cat: no TO column');
  ok(/130 of 130|of 130 picks/.test(await p.textContent('#fmt')), 'format line shows picks (' + await p.textContent('#fmt') + ')');
  await p.reload(); await p.waitForTimeout(1200);
  ok(await p.$eval('#src', s => s.value) === 'saved:Mock 10', 'remembers the chosen source');
  const store = await p.evaluate(() => ({ b: localStorage.getItem('courtside-board-v1'), s: localStorage.getItem('courtside-saved-drafts-v1') }));
  ok(store.b === seed['courtside-board-v1'] && store.s === seed['courtside-saved-drafts-v1'], 'board storage untouched');
  await ctx.close(); }

{ const { p, errs, ctx } = await page(seed, { vp: { width: 390, height: 900 }, dark: true });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways page scroll at 390 px');
  const cc = await p.evaluate(() => { const td = document.querySelector('#ts tbody td.l'); const cs = getComputedStyle(td); return [cs.color, getComputedStyle(document.body).backgroundColor]; });
  ok(cc[0] !== cc[1] && !/rgb\(0, 0, 0\)|rgb\(21, 25, 27\)/.test(cc[0]), 'dark: text readable (' + cc + ')');
  ok(errs.length === 0, 'phone/dark no errors');
  await ctx.close(); }

{ const { p, errs, ctx } = await page({});
  ok(/saved draft|Draft Kit/i.test(await p.textContent('#msg')) && errs.length === 0, 'empty state message');
  await ctx.close(); }

{ let n = 0; const order = Array.from({ length: 14 }, (_, i) => 't' + i);
  const fx = r => { const w = new URL(r.request().url()).searchParams.get('what'); n++;
    if (w === 'league' && n <= 1) return r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Fantrax is busy (too many requests). The board will retry on its own.' }) });
    if (w === 'league') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ leagueName: 'Home', teamInfo: Object.fromEntries(order.map((t, i) => [t, { id: t, name: 'Club ' + i }])) }) });
    if (w === 'draft') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ draftOrder: order, draftPicks: [{ round: 1, pick: 1, pickInRound: 1, teamId: 't0', playerId: 'p1' }] }) });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ p1: { name: 'Jokic, Nikola', team: 'DEN' } }) }); };
  const { p, errs, ctx } = await page({ 'courtside-leagues-v1': JSON.stringify([{ id: 'abc123', name: 'Home', myTeam: 't0', used: 1 }]) }, { fx, wait: 1500 });
  ok(/busy/i.test(await p.textContent('#msg')), 'Fantrax busy message (' + await p.textContent('#msg') + ')');
  await p.waitForTimeout(11000);
  ok((await p.$$eval('#mx tbody tr', r => r.length)) === 14 && /Club 0/.test(await p.textContent('#mx')), 'Fantrax league loads after retry');
  ok(errs.length === 0, 'Fantrax path no errors ' + errs.join('; '));
  await ctx.close(); }

{ let up = false; const order = Array.from({ length: 14 }, (_, i) => 't' + i);
  const fx = r => { const w = new URL(r.request().url()).searchParams.get('what');
    if (!up) return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'League ID should be letters and numbers.' }) });
    if (w === 'league') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ leagueName: 'Home', teamInfo: Object.fromEntries(order.map((t, i) => [t, { id: t, name: 'Club ' + i }])) }) });
    if (w === 'draft') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ draftOrder: order, draftPicks: [{ round: 1, pick: 1, pickInRound: 1, teamId: 't0', playerId: 'p1' }] }) });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ p1: { name: 'Jokic, Nikola', team: 'DEN' } }) }); };
  const s2 = Object.assign({}, seed, { 'courtside-leagues-v1': JSON.stringify([{ id: 'zz9', name: 'Broken', myTeam: null, used: 1 }]) });
  const { p, errs, ctx } = await page(s2, { fx: r => (up || new URL(r.request().url()).searchParams.get('what')) ? fx(r) : fx(r) });
  ok((await p.$$eval('#mx tbody tr', r => r.length)) === 14, 'board draft shown first');
  up = false; await p.route(/api\/fantrax/, r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'League ID should be letters and numbers.' }) }));
  await p.selectOption('#src', 'fx:zz9'); await p.waitForTimeout(800);
  ok(await p.$eval('#body', e => e.hidden) && (await p.textContent('#fmt')) === '', 'failed Fantrax load hides the previous league');
  ok(await p.isVisible('#retry'), 'Retry button shown after a failed load');
  await p.unroute(/api\/fantrax/); up = true;
  await p.route(/api\/fantrax/, fx);
  await p.click('#retry'); await p.waitForTimeout(1500);
  ok(/Club 0/.test(await p.textContent('#mx')) && !(await p.isVisible('#retry')), 'Retry loads the league and hides the button');
  ok(errs.length === 0, 'retry path no errors ' + errs.join('; '));
  await ctx.close(); }

await b.close();
console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
