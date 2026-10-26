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
  ok(((await totalRow(p)).length) === 1, 'one team average row');
  const m = await matrixText(p);
  ok((await p.$$eval('#matrix tbody tr', r => r.length)) === 10 && /Win M/.test(m) && !/Win C/.test(m), 'matrix: 9 category rows and Win M');
  ok((await p.$$eval('#matrix thead th', r => r.length)) === 15, 'matrix: a column per other team plus the average (' + (await p.$$eval('#matrix thead th', r => r.length)) + ')');
  ok(/%/.test(await p.textContent('#matrix tbody tr:last-child')), 'Win M row shows percentages');
  ok(errs.length === 0, 'loads without errors ' + errs.join('; '));
  before.keys = ks; before.win = await winCol(p); before.tot = await totalRow(p); before.z = await col(p, 3 + 9 + 2); before.ls = await p.evaluate(() => localStorage.getItem('courtside-settings-v1') + localStorage.getItem('courtside-leagues-v1'));

  // Plays % box: scales player stats, never the team rows
  const pts0 = await col(p, 3 + 5), plays = (await col(p, 3)).map(t => parseFloat(t));
  await p.check('#adj'); await p.waitForTimeout(200);
  const pts1 = await col(p, 3 + 5);
  ok(pts0.some((v, i) => v !== pts1[i]) && (await totalRow(p)).join() === before.tot.join(), 'the Plays % box changes player stats and leaves team rows alone');
  const i0 = plays.findIndex(v => v > 0 && v < 100);
  ok(i0 < 0 || parseFloat(pts1[i0]) < parseFloat(pts0[i0]), 'a player below 100% shows lower stats with the box checked');
  await p.uncheck('#adj'); await p.waitForTimeout(100);
  ok((await col(p, 3 + 5)).join() === pts0.join(), 'unchecking restores per-game stats');
  // rest of season view
  await p.click('#view button[data-v="ros"]'); await p.waitForTimeout(100);
  ok(Math.max(...(await col(p, 3 + 5)).map(parseFloat)) > 100, 'Rest of season multiplies by games left');
  await p.click('#view button[data-v="game"]');
  // dimmed Plays % for IL / Reserve rows
  ok((await p.$$eval('#roster tr.hypo td.dim', t => t.length)) > 0, 'IL / Reserve Plays % cells use the dim class');

  // weights change Z and the order, never the Win numbers
  await p.click('details.wts summary');
  await p.$eval('#wgrid input[data-c="3"]', i => { i.value = '0'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(150);
  const z1 = await col(p, 3 + 9 + 2);
  ok(z1.join() !== before.z.join(), 'a weight of 0 changes the Z column');
  ok((await winCol(p)).join() === before.win.join() && (await matrixText(p)) === m, 'weights leave Win C / Win M and the matrix alone');
  await p.click('#wreset'); await p.waitForTimeout(100);
  ok((await col(p, 3 + 9 + 2)).join() === before.z.join(), 'Reset weights restores Z');

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

  // moving players: the slot select, drag onto a group header, the over-limit warning
  const grp = async slot => p.$eval('tr.grp[data-slot="' + slot + '"] td', e => e.textContent);
  const nActive = async () => +(/\((\d+)/.exec(await grp('active')) || [])[1];
  ok((await p.$$eval('tr.grp', g => g.length)) === 3, 'the three slot headers show (Active, Reserve, IL; no Bench)');
  const a0 = await nActive(), benchBefore = await grp('reserve');
  const mv = await p.$eval('tr[data-key] select.slot', s => { const o = [...s.options].find(x => x.value !== s.value); return { key: s.dataset.key, to: o.value, from: s.value }; });
  await p.selectOption('select.slot[data-key="' + mv.key + '"]', mv.to); await scored(p);
  ok((await p.$eval('select.slot[data-key="' + mv.key + '"]', s => s.value)) === mv.to, 'the slot select moves the player');
  ok((await p.$$eval('select.slot', s => s.every(x => x.title && x.getAttribute('aria-label')))), 'every slot select has a tooltip and a label');
  await p.click('#reset'); await scored(p);
  ok(await nActive() === a0 && (await grp('reserve')) === benchBefore, 'Reset restores the slot counts');
  const benchKey = await p.$eval('tr[data-key] select.slot option[value="reserve"]:checked', o => o.parentElement.dataset.key).catch(() => null);
  if (benchKey) {
    await p.dragAndDrop('tr[data-key="' + benchKey + '"]', 'tr.grp[data-slot="active"]'); await scored(p);
    ok((await p.$eval('select.slot[data-key="' + benchKey + '"]', s => s.value)) === 'active' && await nActive() === a0 + 1, 'dragging a row onto a group header moves it');
  }
  for (const k of await p.$$eval('select.slot', s => s.map(x => x.dataset.key))) { await p.selectOption('select.slot[data-key="' + k + '"]', 'active'); }
  ok(/\d+ \/ 12/.test(await grp('active')) && !/over the limit/.test(await grp('active')), 'Active out of the 12 roster spots: no warning at exactly 12');
  ok((await p.$$eval('tr.grp td', t => t.every(x => x.title))), 'every group header has a tooltip');
  await p.click('#reset'); await scored(p);
  ok(await p.evaluate(() => localStorage.getItem('courtside-settings-v1') + localStorage.getItem('courtside-leagues-v1')) === before.ls, 'the saved league is untouched');
  ok(errs.length === 0, 'no page errors after swaps ' + errs.join('; '));

  // the Changes list: every move or swap adds an entry; Undo goes back one; Clear empties the list and keeps the roster
  ok(await p.$eval('#logbox', e => e.hidden), 'no Changes list before any change');
  await p.selectOption('select.slot[data-key="' + mv.key + '"]', mv.to); await scored(p);
  ok((await p.$$eval('#log li', l => l.length)) === 1 && !(await p.$eval('#logbox', e => e.hidden)), 'a slot move adds an entry to the Changes list');
  await p.selectOption('select.slot[data-key="' + mv.key + '"]', mv.from); await scored(p);
  ok((await p.$$eval('#log li', l => l.length)) === 2, 'a second change adds a second entry');
  await p.click('#undo'); await scored(p);
  ok((await p.$$eval('#log li', l => l.length)) === 1 && (await p.$eval('select.slot[data-key="' + mv.key + '"]', s => s.value)) === mv.to, 'Undo removes the last entry and restores the roster before it');
  await p.click('#logclear');
  ok(await p.$eval('#logbox', e => e.hidden) && (await p.$eval('select.slot[data-key="' + mv.key + '"]', s => s.value)) === mv.to, 'Clear empties the list and leaves the roster');
  await p.selectOption('select.slot[data-key="' + mv.key + '"]', mv.from); await scored(p);
  await p.click('#reset'); await scored(p);
  ok(await p.$eval('#logbox', e => e.hidden), 'Reset roster clears the list');

  // headers: Zscore, MPG after Plays %, click any header to sort inside each slot group
  const heads = await p.$$eval('#roster thead th', t => t.map(x => x.textContent.replace(/ [▲▼]$/, '')));
  ok(heads.includes('Zscore') && !heads.includes('Z') && heads[3] === 'MPG', 'headers: Zscore, and MPG right after Plays % (' + heads.slice(0, 5).join('|') + ')');
  ok((await p.$$eval('#zview button', b => b.map(x => x.textContent))).includes('Zscore'), 'the Stats | Zscore toggle is renamed');
  ok((await col(p, 4)).some(t => /^\d+\.\d$/.test(t)), 'MPG shows minutes per game');
  const inGroups = (ci) => p.$$eval('#roster tbody tr', (trs, ci) => { const out = {}; let g = null; trs.forEach(tr => { if (tr.classList.contains('grp')) { g = tr.dataset.slot; out[g] = []; } else if (tr.dataset.key && g) out[g].push(parseFloat(tr.children[ci < 0 ? tr.children.length + ci : ci].textContent.replace('−', '-'))); }); return out; }, ci);
  const sorted = (a, dir) => a.every((v, i) => i === 0 || isNaN(v) || isNaN(a[i - 1]) || (dir === 'desc' ? a[i - 1] >= v : a[i - 1] <= v));
  await p.click('#roster th[data-col="wm"]'); await scored(p);
  ok(Object.values(await inGroups(-1)).every(a => sorted(a, 'desc')) && await p.$eval('#roster th[data-col="wm"]', h => h.getAttribute('aria-sort')) === 'descending', 'clicking Win M sorts each group high to low');
  await p.click('#roster th[data-col="wm"]'); await scored(p);
  ok(Object.values(await inGroups(-1)).every(a => sorted(a, 'asc')), 'a second click sorts low to high');
  await p.click('#roster th[data-col="wm"]'); await scored(p);
  ok((await keys(p)).join() === before.keys.join(), 'a third click clears the sort (roster order)');
  await p.click('#roster th[data-col="mpg"]'); await scored(p);
  ok(Object.values(await inGroups(3)).every(a => sorted(a, 'desc')), 'clicking MPG sorts each group high to low');
  await p.click('#roster th[data-col="mpg"]'); await p.click('#roster th[data-col="mpg"]'); await scored(p);
  ok(errs.length === 0, 'no page errors after sorting ' + errs.join('; '));

  // How it works is this tab's own
  await p.click('#how-open'); await p.waitForTimeout(100);
  const how = await p.textContent('#how');
  ok(/Plays %/.test(how) && /average week|An average week/.test(how) && !/Model pick/.test(how), 'How it works text is specific to the Team tab');
  await ctx.close(); }

// the player list (#131 PR 4b): scoring, filters, click to add, drag to swap, weights re-sort, layout
const listReady = p => p.waitForFunction(() => /players/.test(document.getElementById('lmeta').textContent) && document.querySelectorAll('#ltable tbody tr[data-key]').length > 0, null, { timeout: 90000 });
const lkeys = p => p.$$eval('#ltable tbody tr[data-key]', r => r.map(x => x.dataset.key));
const lchg = p => p.$$eval('#ltable tbody tr[data-key] td:last-child', t => t.map(e => parseFloat(e.textContent.replace('−', '-'))));
{ const { p, errs, ctx } = await open();
  await scored(p); await listReady(p);
  const rows0 = await lkeys(p), chg0 = await lchg(p);
  ok(rows0.length > 150 && !(await p.$('#lmore')), 'the list shows every player at once (' + rows0.length + '), no Show more');
  ok(+/(\d+) players/.exec(await p.textContent('#lmeta'))[1] === rows0.length, 'the count in the list header equals the rows shown');
  ok(chg0.every((v, i) => i === 0 || chg0[i - 1] >= v - 1e-9), 'the Change column never rises down the list');
  ok(await p.$eval('#lvs', s => s.value) === 'rep', 'the list defaults to vs replacement');
  // roster first: its Win cells fill without waiting for the list
  const cards = await p.textContent('#cards');
  ok(/Team Zscore/.test(cards) && /Win C/.test(cards) && /Win M/.test(cards) && /was/.test(cards), 'Old vs New cards sit in the swap panel');
  // vs average changes the numbers and persists
  await p.selectOption('#lvs', 'avg'); await listReady(p); await p.waitForFunction(() => !/Scoring/.test(document.getElementById('lmeta').textContent), null, { timeout: 90000 });
  ok((await lchg(p)).join() !== chg0.join(), 'vs average changes the list numbers');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('courtside-team-v1')).listVs) === 'avg', 'the dropdown is remembered');
  ok((await winCol(p)).join() === before.win.join(), 'the roster table stays vs average (unchanged by the list dropdown)');
  await p.selectOption('#lvs', 'rep'); await p.waitForFunction(() => !/Scoring/.test(document.getElementById('lmeta').textContent), null, { timeout: 90000 });
  // owner filter and search
  await p.selectOption('#lown', 'fa'); await p.waitForTimeout(100);
  ok((await p.$$eval('#ltable tbody tr[data-key] td:nth-child(2)', t => t.every(e => /Free agent|Sent out/.test(e.textContent)))), 'the Free agents filter shows only free agents');
  await p.selectOption('#lown', 'me'); await p.waitForTimeout(100);
  ok((await lkeys(p)).length > 0 && (await p.$$eval('#ltable tbody tr[data-key] td:nth-child(2)', t => t.every(e => /^You/.test(e.textContent)))), 'My roster filter shows only my players');
  await p.selectOption('#lown', 'all');
  const nm = await p.$eval('#ltable tbody tr[data-key] td.l', e => e.firstChild.textContent);
  await p.fill('#lq', nm.slice(0, 5).toUpperCase()); await p.waitForTimeout(100);
  const sk = await lkeys(p);
  ok(sk.length >= 1 && sk.length < rows0.length && sk.includes(rows0[0]), 'search narrows the list');
  await p.fill('#lq', '');
  // a weight of 0 re-sorts the list but leaves each player's change alone
  const byKey = async () => Object.fromEntries((await lkeys(p)).map((k, i) => [k, i])), chgMap = async () => { const k = await lkeys(p), c = await lchg(p); return Object.fromEntries(k.map((x, i) => [x, c[i]])); };
  await p.selectOption('#lown', 'all'); await p.waitForTimeout(100);
  const order0 = (await lkeys(p)).join(), map0 = await chgMap();
  await p.click('details.wts summary');
  await p.$eval('#wgrid input[data-c="3"]', i => { i.value = '0'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(200);
  const map1 = await chgMap();
  ok((await lkeys(p)).join() !== order0, 'a weight of 0 re-orders the list');
  ok(Object.keys(map1).filter(k => k in map0).every(k => map1[k] === map0[k]), 'the real change per player is unchanged by weights');
  await p.click('#wreset'); await p.waitForTimeout(200);
  ok((await lkeys(p)).join() === order0, 'Reset weights restores the list order');
  // click: a free agent / other team's player goes to Bring in, mine to Send out
  await p.click('#ltable tbody tr[data-key]:not([data-own="1"])'); await p.waitForTimeout(50);
  ok((await p.$$eval('#in-chips li', l => l.length)) === 1, 'clicking a list row adds him to the Bring in chips');
  await p.selectOption('#lown', 'me'); await p.click('#ltable tbody tr[data-key]'); await p.waitForTimeout(50);
  ok((await p.$$eval('#out-chips li', l => l.length)) === 1, 'clicking one of my players adds him to Send out');
  await p.selectOption('#lown', 'all');
  // drag onto a roster row: 1-for-1 into that slot, same roster size
  const inKey = rows0.find(k => !before.keys.includes(k)), target = before.keys[0];
  const slotOf = k => p.$eval('select.slot[data-key="' + k + '"]', s => s.value);
  const t0 = await slotOf(target);
  await p.dragAndDrop('#ltable tr[data-key="' + inKey + '"]', '#roster tr[data-key="' + target + '"]'); await scored(p);
  ok((await keys(p)).length === before.keys.length && !(await keys(p)).includes(target) && (await slotOf(inKey)) === t0, 'dragging a list row onto a roster row swaps him into that slot (same roster size)');
  await listReady(p);
  await p.click('#reset'); await scored(p);
  // drag onto a group header: he joins that group
  await p.dragAndDrop('#ltable tr[data-key="' + inKey + '"]', 'tr.grp[data-slot="reserve"]'); await scored(p);
  ok((await keys(p)).length === before.keys.length + 1 && (await slotOf(inKey)) === 'reserve', 'dropping a list row on a group header brings him in without sending anyone out');
  await p.dragAndDrop('#ltable tr[data-key="' + inKey + '"]', 'tr.grp[data-slot="active"]'); await scored(p);
  for (const k of await p.$$eval('select.slot', s => s.map(x => x.dataset.key))) { await p.selectOption('select.slot[data-key="' + k + '"]', 'active'); await scored(p); }
  const gt = await p.$eval('tr.grp[data-slot="active"] td', e => e.textContent);
  ok(/over the limit/.test(gt) && /13 \/ 12/.test(gt), 'Active over the roster limit (13 / 12) shows the warning');
  await p.click('#reset'); await scored(p);
  ok(errs.length === 0, 'list: no page errors ' + errs.join('; '));
  await ctx.close(); }
// layout: list right of the roster at 1440 px, below it at 1200 px
for (const [w, side] of [[1440, true], [1200, false]]) {
  const { p, errs, ctx } = await open({ vp: { width: w, height: 900 } }); await scored(p);
  const pos = await p.evaluate(() => { const a = document.getElementById('roster').getBoundingClientRect(), l = document.getElementById('list').getBoundingClientRect(); return { rightOf: l.left >= a.right - 1, below: l.top >= a.bottom - 1 }; });
  ok(side ? pos.rightOf : pos.below, 'width ' + w + ': the list sits ' + (side ? 'right of' : 'below') + ' the roster');
  ok(errs.length === 0, 'width ' + w + ': no page errors');
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
