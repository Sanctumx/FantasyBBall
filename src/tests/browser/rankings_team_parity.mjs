// Rankings Win vs Average player = the Team tab's Vs average (D2, 2026-10-26): same source + same team -> the same Win M per player.
// Needs playwright and the repo root served on :8765 (python -m http.server 8765). REPO=<repo root> overrides the fixtures location.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = process.env.REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fx = n => fs.readFileSync(path.join(REPO, 'src/tests/fixtures', n), 'utf8');
const FX = { league: fx('fx_league.json'), rosters: fx('fx_rosters.json'), standings: fx('fx_standings.json'), players: fx('fx_players.json') };
const ESPN = fx('espn_2025_26.json');
const LID = 'abc123', TEAMS = Object.keys(JSON.parse(FX.league).teamInfo);
const SEED = (extra = {}) => Object.assign({
  'courtside-settings-v1': JSON.stringify({ v: 1, settings: { teams: 14, roster: 12, scoring: 'h2h', cats: 9, asb: 'merged', poStart: 18, poFmt: '2-2-2', ilSpots: 3 }, league: { id: LID, name: 'Home', teams: [], loadedAt: 1 }, note: '' }),
  'courtside-leagues-v1': JSON.stringify([{ id: LID, name: 'Home', myTeam: TEAMS[0], used: 1 }]) }, extra);
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const b = await chromium.launch();
async function open(page, seed) {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route(/api\/fantrax/, r => r.fulfill({ body: FX[new URL(r.request().url()).searchParams.get('what')] || '{}', contentType: 'application/json' }));
  await ctx.route(/stats\/espn\.json/, r => r.fulfill({ body: ESPN, contentType: 'application/json' }));
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, seed);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/' + page); return { p, errs, ctx };
}
const num = t => parseFloat(String(t).replace('−', '-'));

// Same settings -> same results (2026-10-26): with a team loaded Rankings scores Win like the Team tab, in both Vs modes and on both bases
// (Rankings Per game = Team Per game, Rankings Season = Team Rest of season). The Team tab is at its default state (no Reserve moves).
for (const [src, vs, basis] of [['avg', 'avg', 'pergame'], ['w7', 'avg', 'pergame'], ['avg', 'rep', 'pergame'], ['w7', 'rep', 'pergame'], ['avg', 'avg', 'total'], ['avg', 'rep', 'total']]) {
  const tag = src + '/' + vs + '/' + basis;
  // Team tab: the list vs average or replacement, the Win M change of the first rows
  const t = await open('team.html', SEED({ 'courtside-team-v1': JSON.stringify({ src, listVs: vs, view: basis === 'total' ? 'ros' : 'game' }) }));
  await t.p.waitForSelector('#body:not([hidden])', { timeout: 30000 });
  await t.p.waitForFunction(() => document.querySelectorAll('#ltable tr.lrow').length > 0 && !/Scoring/.test(document.getElementById('lmeta').textContent), null, { timeout: 120000 });
  const team = await t.p.$$eval('#ltable tr.lrow', r => r.slice(0, 6).map(x => [x.querySelector('td.l').childNodes[0].textContent, x.lastElementChild.textContent]));
  ok(team.length >= 5, tag + ': Team list has rows (' + team.length + ')');
  // Rankings: the same source, Win vs the same baseline, the same basis, the same team
  const r = await open('rankings.html', SEED({ 'courtside-rankings-v1': JSON.stringify({ src, winvs: vs, basis, order: 'z' }) }));
  await r.p.waitForFunction(() => /all scored/.test(document.getElementById('note').textContent), null, { timeout: 120000 });
  const wmCol = await r.p.$$eval('#tbl thead th', h => h.findIndex(x => x.dataset.k === 'winM') + 1);
  let n = 0;
  for (const [name, wm] of team) {
    await r.p.fill('#q', name); await r.p.waitForTimeout(150);
    const cell = await r.p.$$eval('#tbl tbody tr', (rows, c) => rows.filter(x => x.children[2] && true).map(x => [x.querySelector('td.l').textContent, x.children[c - 1].textContent]), wmCol);
    const hit = cell.find(x => x[0] === name);
    if (hit) { n++; ok(Math.abs(num(hit[1]) - num(wm)) < 0.051, tag + ': ' + name + ' Win M on Rankings (' + hit[1] + ') = Team list (' + wm + ')'); }
  }
  ok(n >= 3, tag + ': at least 3 of the Team list players were found on Rankings (' + n + ')');
  ok(t.errs.length === 0 && r.errs.length === 0, tag + ': no page errors ' + t.errs.concat(r.errs).join('; '));
  await t.ctx.close(); await r.ctx.close();
}
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nall passed');
process.exit(fails.length ? 1 : 0);
