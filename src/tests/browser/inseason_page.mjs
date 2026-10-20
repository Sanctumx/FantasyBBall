// In-Season page: Weekly Matchup Analyzer (2026-10-20). Needs playwright and the repo root served on :8765 (python -m http.server 8765).
// REPO=<repo root> overrides the location of the fixtures when this file is run from another folder.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = process.env.REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fx = n => fs.readFileSync(path.join(REPO, 'src/tests/fixtures', n), 'utf8');
const FX = { league: fx('fx_league.json'), rosters: fx('fx_rosters.json'), standings: fx('fx_standings.json'), players: fx('fx_players.json') };
const ESPN = fx('espn_2025_26.json');
const NOW = Date.UTC(2026, 9, 21, 12);
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };

const b = await chromium.launch();
async function open(opts = {}) {
  const ctx = await b.newContext({ viewport: opts.vp || { width: 1500, height: 1000 }, colorScheme: opts.dark ? 'dark' : 'light' });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route(/api\/fantrax/, r => {
    const what = new URL(r.request().url()).searchParams.get('what');
    r.fulfill({ body: FX[what] || '{}', contentType: 'application/json' });
  });
  await ctx.route(/stats\/espn\.json/, r => opts.noStats ? r.fulfill({ status: 404, body: 'nope' }) : r.fulfill({ body: ESPN, contentType: 'application/json' }));
  await ctx.addInitScript(t => { Date.now = () => t; }, NOW);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/inseason.html'); await p.waitForSelector('#body:not([hidden])', { timeout: 15000 }).catch(() => {});
  return { p, errs, ctx };
}

{ const { p, errs, ctx } = await open();
  ok(errs.length === 0, 'loads without errors ' + errs.join('; '));
  ok(/^In-Season/.test(await p.title()), 'title says In-Season');
  ok(await p.$$eval('.sitenav a', l => l.map(a => a.textContent).join('|')) === 'Draft Kit|League Dashboard|In-Season', 'toolbar Draft Kit | League Dashboard | In-Season');
  ok((await p.$$eval('#team option', o => o.length)) === 14, 'team select has 14 options');
  const wk = await p.$$eval('#week option', o => o.map(x => x.value));
  ok(wk[0] === '1' && wk.length === 15 && wk[14] === '15' && await p.$eval('#week', s => s.value) === '1', 'week select lists the regular periods 1-15 with 1 selected (' + wk.length + ')');
  ok((await p.$$eval('#cats tbody tr', r => r.length)) === 9, 'matchup table has 9 category rows');
  const wm = parseFloat(await p.textContent('#winm'));
  ok(wm > 0 && wm < 100, 'Win M KPI between 0 and 100 (' + wm + ')');
  const fresh = await p.textContent('#fresh');
  ok(/2025-26/.test(fresh) && /last season/.test(fresh), 'freshness strip names 2025-26 and last season');
  ok(/Rosters fetched/.test(fresh) && /Projections/.test(fresh), 'freshness strip shows rosters and projections');
  ok(/\d+ players without projections/.test(await p.textContent('#nomatch-sum')) && (await p.textContent('#nomatch-list')).includes('Aday Mara'), 'unmatched count shown and lists Aday Mara');
  const drops = await p.$$eval('#adds tbody td.drop', t => t.map(x => x.textContent));
  ok(drops.length >= 1 && new Set(drops).size === 1, 'Simple adds: at least one row, one Drop for all (' + drops.length + ' rows, ' + drops[0] + ')');
  ok(await p.$eval('#addsleft', i => i.value) === '4', 'Adds left defaults to 4');
  ok((await p.$$eval('#plan-moves li', l => l.length)) >= 1, 'plan has moves');
  await p.fill('#addsleft', '0'); await p.dispatchEvent('#addsleft', 'change'); await p.waitForTimeout(200);
  ok((await p.$$eval('#plan-moves li', l => l.length)) === 0, 'Adds left 0 empties the plan');
  await p.selectOption('#week', '5'); await p.waitForTimeout(300);
  ok(/current week only/.test(await p.textContent('#plan-note')), 'week 5 shows the current-week-only note');
  ok((await p.$$eval('#cats tbody tr', r => r.length)) === 9, 'week 5 still projects the matchup');
  const other = await p.$eval('#team', s => s.options[3].value);
  await p.selectOption('#team', other); await p.waitForTimeout(300);
  await p.reload(); await p.waitForSelector('#body:not([hidden])');
  ok(await p.$eval('#team', s => s.value) === other, 'team choice survives a reload');
  ok(await p.$eval('#week', s => s.value) === '5', 'week choice survives a reload');
  ok(errs.length === 0, 'no page errors after interaction ' + errs.join('; '));
  await ctx.close(); }

{ const { p, errs, ctx } = await open();
  await p.click('#tabs button[data-v="trades"]'); await p.waitForTimeout(800);
  ok(await p.isVisible('#tab-trades') && !(await p.isVisible('#tab-matchup')), 'Trades tab shows, Matchup hides');
  ok(!(await p.isVisible('#week')), 'Trades tab has no week dropdown');
  ok((await p.$$eval('#give option', o => o.length)) >= 10, 'finder lists my players');
  const hdr = await p.$$eval('#finder thead th', t => t.map(x => x.textContent).join('|'));
  ok(hdr === 'Target|Team|Likelihood of trade|+Win M you|+Win M them|Total Win M|Buy Low', 'finder header (' + hdr + ')');
  const rows = await p.$$eval('#finder tbody tr', r => r.length);
  ok(rows >= 1, 'finder has rows (' + rows + ')');
  const col = async i => (await p.$$eval('#finder tbody tr', (r, i) => r.map(x => parseFloat(x.children[i].textContent.replace('−', '-'))), i));
  await p.click('#finder thead th:nth-child(3)'); await p.waitForTimeout(100);
  let l1 = await col(2); ok(l1.every((v, i) => i === 0 || l1[i - 1] >= v), 'click Likelihood sorts best first');
  await p.click('#finder thead th:nth-child(3)'); await p.waitForTimeout(100);
  l1 = await col(2); ok(l1.every((v, i) => i === 0 || l1[i - 1] <= v), 'second click reverses');
  ok((await p.$$eval('#sell .tl, #buy .tl', d => d.length)) >= 1, 'Sell High / Buy Low lists show items');
  ok(/40% current \+ 30% projection \+ 30% ADP/.test(await p.textContent('#weights')), 'weights line');
  ok((await p.$$eval('#ta option', o => o.length)) === 14 && (await p.$$eval('#tb option', o => o.length)) === 13, 'Team A 14 options, Team B 13 without Team A');
  ok(await p.$eval('#ta', s => s.selectedOptions[0].textContent.includes('(you)')), 'Team A defaults to me');
  ok((await p.$$eval('#bt tr', r => r.length)) === 0, 'builder table empty at start');
  // type-ahead offers only the other team's roster
  const dlA = await p.$$eval('#dl-a option', o => o.map(x => x.value)), dlB = await p.$$eval('#dl-b option', o => o.map(x => x.value));
  ok(dlA.length >= 10 && dlB.length >= 10 && !dlA.some(v => dlB.includes(v)), 'type-ahead lists differ per side (' + dlA.length + ', ' + dlB.length + ')');
  await p.fill('#in-a', dlA[0]); await p.dispatchEvent('#in-a', 'change');
  ok((await p.$$eval('#dl-a option', o => o.length)) === dlA.length - 1 && (await p.$$eval('#list-a li', l => l.length)) === 1, 'picked player leaves the type-ahead and shows as a chip');
  await p.fill('#in-b', dlB[0]); await p.dispatchEvent('#in-b', 'change');
  ok(/./.test(await p.textContent('#sum')) && (await p.$$eval('#sum .kpi', k => k.length)) === 4, 'summary strip: +Win M each team, Total, Likelihood');
  ok(!(await p.textContent('#multi')).trim(), 'even trade has no caveat');
  await p.fill('#in-b', dlB[1]); await p.dispatchEvent('#in-b', 'change');
  ok(/Uneven trade/.test(await p.textContent('#multi')), 'two for one shows the multi-player caveat');
  const bt = await p.$$eval('#bt tbody tr', r => r.map(x => [x.className, x.children.length, [...x.querySelectorAll('.chip')].some(c => /color-mix/.test(c.getAttribute('style') || ''))]));
  ok(bt.some(r => r[0] === 'avg') && bt.some(r => r[0] === 'tot'), 'Average and Total rows');
  ok(bt.filter(r => r[1] === 10).length >= 3 && bt.some(r => r[2]), 'per-player rows have 9 category cells with green/red chips');
  await p.click('#statv button[data-v="cur"]'); await p.waitForTimeout(100);
  ok((await p.$$eval('#bt tbody tr', r => r.length)) === bt.length, 'Projection | Current toggle keeps the rows');
  await p.click('#reset'); await p.waitForTimeout(100);
  ok((await p.$$eval('#list-a li, #list-b li', l => l.length)) === 0 && !(await p.textContent('#sum')).trim(), 'Reset Trade empties both sides and the summary');
  await p.click('#finder tbody tr'); await p.waitForTimeout(300);
  ok((await p.$$eval('#list-a li', l => l.length)) === 1 && (await p.$$eval('#list-b li', l => l.length)) === 1 && (await p.$$eval('#sum .kpi', k => k.length)) === 4, 'clicking a finder row loads that trade into the builder');
  await p.reload(); await p.waitForSelector('#body:not([hidden])');
  ok(await p.isVisible('#tab-trades'), 'tab choice survives a reload');
  ok(errs.length === 0, 'no page errors on the Trades tab ' + errs.join('; '));
  await ctx.close(); }

{ const { p, errs, ctx } = await open({ noStats: true });
  ok(/No actual stats/.test(await p.textContent('#fresh')), 'missing stats file shows the no-actual-stats note');
  ok(errs.length === 0, 'no errors without stats ' + errs.join('; '));
  await ctx.close(); }

{ const { p, errs, ctx } = await open({ vp: { width: 390, height: 900 }, dark: true });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways page scroll at 390 px');
  const cc = await p.evaluate(() => [getComputedStyle(document.querySelector('#cats td.l')).color, getComputedStyle(document.body).backgroundColor]);
  ok(cc[0] !== cc[1], 'dark: text readable (' + cc + ')');
  ok(errs.length === 0, 'phone/dark no errors');
  await ctx.close(); }

await b.close();
console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
