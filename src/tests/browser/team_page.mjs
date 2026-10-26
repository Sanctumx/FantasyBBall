// Team page (#131 PR 3, 2026-10-25): roster table, Plays % box, weights, typed swap, matrix, reset, phone width.
// Needs playwright and the repo root served on :8765 (python -m http.server 8765). REPO=<repo root> overrides the fixtures location.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = process.env.REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fx = n => fs.readFileSync(path.join(REPO, 'src/tests/fixtures', n), 'utf8');
const FX = { league: fx('fx_league.json'), rosters: fx('fx_rosters.json'), standings: fx('fx_standings.json'), players: fx('fx_players.json') };
const ESPN = fx('espn_2025_26.json');
const NOW = Date.UTC(2026, 9, 21, 12);
const LID = 'abc123', TEAMS = Object.keys(JSON.parse(FX.league).teamInfo);
const SEED = (my = TEAMS[0]) => ({
  'courtside-settings-v1': JSON.stringify({ v: 1, settings: { teams: 14, roster: 12, scoring: 'h2h', cats: 9, asb: 'merged', poStart: 18, poFmt: '2-2-2', ilSpots: 3 }, league: { id: LID, name: 'Home', teams: [], loadedAt: 1 }, note: '' }),
  'courtside-leagues-v1': JSON.stringify([{ id: LID, name: 'Home', myTeam: my, used: 1 }]) });
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };

const b = await chromium.launch();
async function open(opts = {}) {
  const ctx = await b.newContext({ viewport: opts.vp || { width: 1500, height: 1000 } });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route(/api\/fantrax/, r => r.fulfill({ body: FX[new URL(r.request().url()).searchParams.get('what')] || '{}', contentType: 'application/json' }));
  await ctx.route(/stats\/espn\.json/, r => r.fulfill({ body: ESPN, contentType: 'application/json' }));
  await ctx.addInitScript(t => { Date.now = () => t; }, NOW);
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, SEED());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/team.html'); await p.waitForSelector('#body:not([hidden])', { timeout: 20000 }).catch(() => {});
  return { p, errs, ctx };
}
const scored = p => p.waitForFunction(() => document.getElementById('rost-meta').textContent === '' && document.querySelectorAll('#roster tbody tr[data-key]').length > 0 && !/…/.test(document.getElementById('roster').textContent), null, { timeout: 60000 });
const keys = p => p.$$eval('#roster tbody tr[data-key]', r => r.map(x => x.dataset.key));
const col = (p, i) => p.$$eval('#roster tbody tr[data-key] td:nth-child(' + i + ')', t => t.map(e => e.textContent));
const totalRow = p => p.$$eval('#roster tbody tr.tot', r => r.map(x => x.textContent));
const winCol = p => p.$$eval('#roster tbody tr[data-key]', r => r.map(x => x.lastElementChild.textContent + '/' + x.lastElementChild.previousElementSibling.textContent));
const matrixText = p => p.textContent('#matrix');

const before = {};
{ const { p, errs, ctx } = await open();
  ok(/^Team/.test(await p.title()), 'title says Team');
  ok(await p.$$eval('.sitenav a', l => l.map(a => a.textContent).join('|')) === 'Rankings|Team|Draft|League|Matchup|Trade|Settings', 'toolbar Rankings | Team | Draft | League | Matchup | Trade | Settings');
  ok(await p.$eval('.sitenav a[aria-current="page"]', e => e.textContent) === 'Team', 'toolbar marks Team');
  ok(await p.$eval('#team', s => s.value) === TEAMS[0], 'team defaults to the saved league team');
  await scored(p);
  const ks = await keys(p);
  ok(ks.length >= 10, 'roster rows listed (' + ks.length + ')');
  ok((await p.$$eval('#roster tr.grp', r => r.map(x => x.textContent.split(' ')[0]))).join('|').startsWith('Active'), 'rows are grouped, Active first');
  ok(((await totalRow(p)).length) === 2, 'average and total rows are present');
  const m = await matrixText(p);
  ok((await p.$$eval('#matrix tbody tr', r => r.length)) === 11 && /Win M/.test(m) && /Win C/.test(m), 'matrix: 9 category rows, Win C and Win M');
  ok((await p.$$eval('#matrix thead th', r => r.length)) === 15, 'matrix: a column per other team plus the average (' + (await p.$$eval('#matrix thead th', r => r.length)) + ')');
  ok(/%/.test(await p.textContent('#matrix tbody tr:last-child')), 'Win M row shows percentages');
  ok(errs.length === 0, 'loads without errors ' + errs.join('; '));
  before.keys = ks; before.win = await winCol(p); before.tot = await totalRow(p); before.z = await col(p, 3 + 9 + 1); before.ls = await p.evaluate(() => localStorage.getItem('courtside-settings-v1') + localStorage.getItem('courtside-leagues-v1'));

  // Plays % box: scales player stats, never the team rows
  const pts0 = await col(p, 3 + 4), plays = (await col(p, 3)).map(t => parseFloat(t));
  await p.check('#adj'); await p.waitForTimeout(200);
  const pts1 = await col(p, 3 + 4);
  ok(pts0.some((v, i) => v !== pts1[i]) && (await totalRow(p)).join() === before.tot.join(), 'the Plays % box changes player stats and leaves team rows alone');
  const i0 = plays.findIndex(v => v > 0 && v < 100);
  ok(i0 < 0 || parseFloat(pts1[i0]) < parseFloat(pts0[i0]), 'a player below 100% shows lower stats with the box checked');
  await p.uncheck('#adj'); await p.waitForTimeout(100);
  ok((await col(p, 3 + 4)).join() === pts0.join(), 'unchecking restores per-game stats');
  // rest of season view
  await p.click('#view button[data-v="ros"]'); await p.waitForTimeout(100);
  ok(Math.max(...(await col(p, 3 + 4)).map(parseFloat)) > 100, 'Rest of season multiplies by games left');
  await p.click('#view button[data-v="game"]');
  // dimmed Plays % for IL / Reserve rows
  ok((await p.$$eval('#roster tr.hypo td.dim', t => t.length)) >= 0, 'IL / Reserve Plays % cells use the dim class');

  // weights change Z and the order, never the Win numbers
  await p.click('details.wts summary');
  await p.$eval('#wgrid input[data-c="3"]', i => { i.value = '0'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(150);
  const z1 = await col(p, 3 + 9 + 1);
  ok(z1.join() !== before.z.join(), 'a weight of 0 changes the Z column');
  ok((await winCol(p)).join() === before.win.join() && (await matrixText(p)) === m, 'weights leave Win C / Win M and the matrix alone');
  await p.click('#wreset'); await p.waitForTimeout(100);
  ok((await col(p, 3 + 9 + 1)).join() === before.z.join(), 'Reset weights restores Z');

  // typed swap
  const outName = (await p.$$eval('#roster tbody tr[data-key] td.l', t => t.map(e => e.firstChild.textContent)))[0];
  await p.fill('#out-in', outName.slice(0, 4).toUpperCase()); await p.waitForTimeout(100);
  ok((await p.$$eval('#out-sug button', b => b.length)) >= 1, 'Send out suggests from partial text');
  await p.press('#out-in', 'Enter'); await p.waitForTimeout(100);
  ok((await p.$$eval('#out-chips li', l => l.length)) === 1, 'Enter picks the top match as a chip');
  await p.fill('#in-in', 'a'); await p.waitForTimeout(100);
  const inKeysBefore = new Set(before.keys);
  ok((await p.$$eval('#in-sug button', b => b.length)) >= 1, 'Bring in suggests players');
  await p.press('#in-in', 'Enter'); await p.waitForTimeout(100);
  ok((await p.$$eval('#in-chips li', l => l.length)) === 1 && !(await p.$eval('#apply', b => b.disabled)), 'a chip appears and Apply swap enables');
  await p.click('#out-chips button'); await p.waitForTimeout(50);
  ok((await p.$$eval('#out-chips li', l => l.length)) === 0, 'the x removes a chip');
  await p.fill('#out-in', outName.slice(0, 4)); await p.press('#out-in', 'Enter');
  await p.click('#apply');
  await scored(p);
  const ks2 = await keys(p);
  ok(ks2.length === ks.length && ks2.some(k => !inKeysBefore.has(k)) && ks2.length > 0, 'Apply swap moves the rows (same count, one new player)');
  ok((await totalRow(p)).join() !== before.tot.join() || (await winCol(p)).join() !== before.win.join(), 'the swap changes totals or Win numbers');
  ok(((await matrixText(p)) !== m), 'the matrix recomputes after the swap');
  // a second quick swap leaves no stale cells
  await p.click('#reset'); await scored(p);
  ok((await keys(p)).join() === before.keys.join() && (await winCol(p)).join() === before.win.join(), 'Reset restores the saved roster and its Win numbers');
  ok(await p.evaluate(() => localStorage.getItem('courtside-settings-v1') + localStorage.getItem('courtside-leagues-v1')) === before.ls, 'the saved league is untouched');
  ok(errs.length === 0, 'no page errors after swaps ' + errs.join('; '));

  // How it works is this tab's own
  await p.click('#how-open'); await p.waitForTimeout(100);
  const how = await p.textContent('#how');
  ok(/Plays %/.test(how) && /average week|An average week/.test(how) && !/Model pick/.test(how), 'How it works text is specific to the Team tab');
  await ctx.close(); }

// phone width: no horizontal page scroll
{ const { p, errs, ctx } = await open({ vp: { width: 390, height: 800 } });
  await scored(p);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: no horizontal page scroll');
  ok(errs.length === 0, 'phone: no page errors ' + errs.join('; '));
  await ctx.close(); }

await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nall passed');
process.exit(fails.length ? 1 : 0);
