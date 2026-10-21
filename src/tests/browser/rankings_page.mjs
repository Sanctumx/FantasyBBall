// Rankings page check: sources, sorting, owners and Hide taken from the Settings league (mocked Fantrax API), phone width.
// Needs playwright and the repo root served on :8765 (python -m http.server 8765). REPO=<repo root>.
import { chromium } from 'playwright';
import fs from 'fs';
const REPO = process.env.REPO || '.';
const fx = n => JSON.parse(fs.readFileSync(REPO + '/src/tests/fixtures/' + n, 'utf8'));
const FXL = fx('fx_league.json'), FXR = fx('fx_rosters.json'), FXP = fx('fx_players.json');
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const store = lg => JSON.stringify({ v: 1, settings: { teams: 14, roster: 12, scoring: 'h2h', cats: 9, asb: 'merged', poStart: 18, poFmt: '2-2-2', ilSpots: 3 }, league: lg, note: '' });

const b = await chromium.launch();
async function open(seed, width) {
  const ctx = await b.newContext({ viewport: { width: width || 1400, height: 900 } });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route(/api\/fantrax/, r => {
    const w = new URL(r.request().url()).searchParams.get('what');
    const body = w === 'league' ? FXL : w === 'rosters' ? FXR : w === 'players' ? FXP : {};
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, seed);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/rankings.html'); await p.waitForTimeout(1500);
  return { p, errs, ctx };
}
const rows = p => p.$$eval('#tbl tbody tr', t => t.length);
const names = p => p.$$eval('#tbl tbody tr td:nth-child(2)', t => t.map(e => e.textContent));

// 1. no league: season table, no Owner column, Hide taken disabled, pool size in the note
{ const { p, errs, ctx } = await open({});
  ok(await p.$eval('.sitenav a[aria-current="page"]', e => e.textContent) === 'Rankings', 'toolbar marks Rankings');
  ok(await rows(p) > 100, 'season to date lists players');
  ok(!(await p.$('#tbl th[data-k="own"]')), 'no league: no Owner column');
  ok(await p.$eval('#hide', e => e.disabled), 'no league: Hide taken disabled');
  ok(/top 168 players/.test(await p.$eval('#note', e => e.textContent)), 'note names the pool size 14 x 12');
  ok(errs.length === 0, '1: no page errors ' + errs.join('; '));
  // 2. projections and sorting
  await p.selectOption('#src', 'avg'); await p.waitForTimeout(500);
  ok(await rows(p) === 234, 'projections list all 234 players');
  const top = (await names(p))[0];
  await p.click('#tbl th[data-k="n"]'); await p.waitForTimeout(100);
  const asc = await names(p); ok(asc[0].localeCompare(asc[asc.length - 1]) <= 0, 'Player header sorts A to Z (' + asc[0] + ')');
  await p.click('#tbl th[data-k="z"]'); await p.waitForTimeout(100);
  ok((await names(p))[0] === top, 'Zscore header sorts best first (' + top + ')');
  await p.selectOption('#stats', 'raw'); await p.waitForTimeout(100);
  ok(/^\.\d{3}$/.test(await p.$eval('#tbl tbody tr:first-child td:nth-child(10)', e => e.textContent)), 'Raw shows FG% as .xxx');
  await p.selectOption('#type', 'h2h'); await p.waitForTimeout(500);
  // playoff games column and Playoff boost
  const poCol = () => p.$$eval('#tbl tbody tr td:nth-child(5)', t => t.map(e => +e.textContent));
  ok(await p.$('#tbl th[data-k="po"]') !== null && (await poCol()).every(n => n > 5 && n < 40), 'Playoff games column lists games for every player');
  ok(!(await p.$eval('#poboost', e => e.offsetParent !== null)), 'Playoff boost control is hidden for now');
  await p.click('#tbl th[data-k="po"]'); await p.waitForTimeout(100);
  const pc = await poCol(); ok(pc[0] >= pc[pc.length - 1], 'Playoff games header sorts most first');
  ok(errs.length === 0, '2: no page errors ' + errs.join('; '));
  await ctx.close(); }

// 2b. list controls: position filter, find, Show, Zscore -1, punt weights
{ const { p, errs, ctx } = await open({});
  await p.selectOption('#src', 'avg'); await p.waitForTimeout(500);
  const col = i => p.$$eval('#tbl tbody tr td:nth-child(' + i + ')', t => t.map(e => e.textContent));
  const z = async () => parseFloat((await col(7))[0].replace('−', '-'));
  const z0 = await z();
  await p.check('#pf-C'); await p.waitForTimeout(200);
  const pos = await col(4); ok(pos.length > 5 && pos.every(x => x.split('/').includes('C')), 'position filter C keeps only centers (' + pos.length + ')');
  await p.uncheck('#pf-C');
  await p.fill('#q', 'jokic'); await p.waitForTimeout(200);
  ok(await rows(p) === 1 && /Jokic/.test((await names(p))[0]), 'Find player jokic gives one row'); await p.fill('#q', ''); await p.waitForTimeout(100);
  await p.selectOption('#show', '50'); await p.waitForTimeout(200);
  ok(await rows(p) === 50, 'Show Top 50 lists 50'); await p.selectOption('#show', '0');
  await p.selectOption('#zdrop', '1,0'); await p.waitForTimeout(300);
  ok(await z() >= z0 - 1e-9 && /−1 100% Zscore/.test(await p.$eval('#tbl th[data-k="z"]', e => e.textContent)), 'Zscore -1 100% raises the top Zscore and labels the header');
  await p.selectOption('#zdrop', '0,0');
  await p.selectOption('#cw-3', '0'); await p.waitForTimeout(300);
  ok(await p.$eval('#tbl th[data-k="3"]', e => e.className) === 'punted' && Math.abs(await z() - z0) > 1e-6, 'punting PTS strikes the header and changes Zscore');
  // Win C / Win M right after Zscore, Replacement vs Average player
  const heads = await p.$$eval('#tbl thead th', t => t.map(e => e.textContent.replace(/[▲▼ ]/g, '')));
  ok(heads[7] === 'WinC' && heads[8] === 'WinM' && /Zscore/.test(heads[6]), 'Win C and Win M follow Zscore');
  const wm = async () => (await col(9)).map(x => parseFloat(x.replace('−', '-')));
  const m0 = await wm(); ok(m0.every(isFinite) && m0.some(v => v > 5) && m0.some(v => v < 0), 'Win M values are numbers, best players positive');
  await p.selectOption('#winvs', 'avg'); await p.waitForTimeout(300);
  const m1 = await wm(); ok(Math.abs(m1[0] - m0[0]) > 0.5, 'Average player view changes Win M (' + m0[0] + ' to ' + m1[0] + ')');
  await p.selectOption('#winvs', 'rep');
  await p.click('#tbl th[data-k="winM"]'); await p.waitForTimeout(100);
  const ms = await wm(); ok(ms.every((v, i) => i === 0 || v <= ms[i - 1] + 1e-9), 'Win M header sorts best first');
  await p.click('#tbl th[data-k="z"]'); await p.waitForTimeout(100);
  const ds = await p.$$eval('#tbl tbody tr td:nth-child(9)', t => t.length); ok(ds > 100, 'rows still listed');
  await p.click('#cw-reset'); await p.waitForTimeout(200);
  ok(Math.abs(await z() - z0) < 1e-9, 'Reset restores the weights');
  ok(errs.length === 0, '2b: no page errors ' + errs.join('; '));
  await ctx.close(); }

// 3. league loaded: owners shown (IR marked), Hide taken removes owned players
{ const { p, errs, ctx } = await open({ 'courtside-settings-v1': store({ id: 'lg1', name: 'Mock', teams: [], loadedAt: 1 }) });
  await p.selectOption('#src', 'avg'); await p.waitForTimeout(800);
  ok(!!(await p.$('#tbl th[data-k="own"]')), 'league: Owner column');
  const all = await rows(p), owners = await p.$$eval('#tbl tbody tr td:nth-child(3)', t => t.map(e => e.textContent));
  const taken = owners.filter(o => o && o !== 'Free agent').length;
  ok(taken > 100 && taken < 180, 'owners shown for the rostered players: ' + taken);
  ok(owners.some(o => /\(IR\)/.test(o)), 'IR players show an owner');
  await p.click('#hide'); await p.waitForTimeout(300);
  ok(await rows(p) === all - taken, 'Hide taken removes the owned players: ' + all + ' -> ' + await rows(p));
  ok(errs.length === 0, '3: no page errors ' + errs.join('; '));
  await ctx.close(); }

// 3b. saved team: my players show values, a free agent is measured in place of my weakest
{ const { p, errs, ctx } = await open({ 'courtside-settings-v1': store({ id: 'lg1', name: 'Mock', teams: [], loadedAt: 1 }), 'courtside-leagues-v1': JSON.stringify([{ id: 'lg1', name: 'Mock', myTeam: Object.keys(FXR.rosters || FXR)[0], used: 1 }]) });
  await p.selectOption('#src', 'avg'); await p.waitForTimeout(3500);
  ok(/spot of your weakest player/.test(await p.$eval('#note', e => e.textContent)), 'note says a player takes your weakest spot');
  const own = await p.$$eval('#tbl tbody tr', t => t.map(r => [r.children[2].textContent, r.children[8].textContent]));
  const mineRows = own.filter(([o]) => o !== 'Free agent'), faRows = own.filter(([o]) => o === 'Free agent');
  ok(own.every(([, m]) => m !== '…'), 'all Win cells have filled in');
  ok(faRows.length > 20 && faRows.every(([, m]) => /\d/.test(m)), 'free agents have a Win M');
  ok(errs.length === 0, '3b: no page errors ' + errs.join('; '));
  await ctx.close(); }

// 4. phone width: the page itself does not scroll sideways, the table scrolls inside its panel
{ const { p, ctx } = await open({}, 390);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'phone: no page-wide horizontal scroll');
  ok(await p.$eval('.scroll', e => e.scrollWidth > e.clientWidth), 'phone: table scrolls inside its panel');
  await ctx.close(); }

await b.close();
console.log(fails.length ? fails.length + ' FAILED' : 'all passed'); process.exit(fails.length ? 1 : 0);
