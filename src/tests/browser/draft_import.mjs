// Task 6 check: Draft's "Fantrax draft" panel imports the draft of the league loaded in Settings (mocked Fantrax API).
// Needs playwright and the repo root served on :8765 (python -m http.server 8765). REPO=<repo root>.
import { chromium } from 'playwright';
import fs from 'fs';
const REPO = process.env.REPO || '.';
const PLAYERS = JSON.parse(fs.readFileSync(REPO + '/src/players.json', 'utf8'));
const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };

const two = PLAYERS.filter(p => (p.ftx || 999) < 60 && p.n.split(' ').length === 2).slice(0, 3);
const fxName = p => { const [f, l] = p.n.split(' '); return l + ', ' + f; };
const fxPlayers = {}; two.forEach((p, i) => { fxPlayers['fp' + (i + 1)] = { name: fxName(p), team: p.t, position: p.p }; });
const ids = n => Array.from({ length: n }, (_, i) => 't' + (i + 1));
const leagueOf = n => ({ leagueName: 'Mock League', teamInfo: Object.fromEntries(ids(n).map((id, i) => [id, { id, name: 'Team ' + (i + 1) }])), rosterInfo: { maxTotalPlayers: 13 } });
const draftOf = n => ({ draftState: 'IN_PROGRESS', draftOrder: ids(n), draftPicks: two.map((p, i) => ({ round: 1, pickInRound: i + 1, pick: i + 1, teamId: 't' + (i + 1), playerId: 'fp' + (i + 1) })) });
const settings = (teams) => ({ teams, roster: 13, slot: 1, order: 'snake', scoring: 'h2h', cats: 9, ilSpots: 3, asb: 'merged', poStart: 18, poFmt: '2-2-2', field: 'easy' });
const store = (teams, lg) => JSON.stringify({ v: 1, settings: settings(teams), league: lg === undefined ? { id: 'abc123', name: 'Mock League', teams: [], loadedAt: 1 } : lg, note: '' });

const b = await chromium.launch();
async function open(seed, n) {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.route(/fonts\.g/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  let calls = 0;
  await ctx.route(/api\/fantrax/, r => {
    calls++; const w = new URL(r.request().url()).searchParams.get('what');
    const body = w === 'league' ? leagueOf(n) : w === 'draft' ? draftOf(n) : w === 'players' ? fxPlayers : {};
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, seed);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1200);
  return { p, errs, ctx, calls: () => calls };
}
const text = (p, s) => p.$eval(s, e => e.innerText.replace(/\s+/g, ' ').trim());

// 1. no league loaded: Import is disabled and points to Settings; the old connect form is gone
{ const { p, errs, ctx } = await open({}, 10);
  ok(await p.$eval('#fx-import', e => e.disabled), 'no league: Import disabled');
  ok(!!(await p.$('#fx-lg a[href="settings.html"]')), 'no league: link to Settings');
  ok(!(await p.$('#fx-league')) && !(await p.$('#fx-connect')) && !(await p.$('#lg-row')), 'league ID box, Connect and saved-league row are gone');
  ok(errs.length === 0, '1: no page errors ' + errs.join('; '));
  await ctx.close(); }

// 2. league loaded: Import brings the picks in, leaves Settings untouched, never writes the saved league's team
{ const seed = { 'courtside-settings-v1': store(10), 'courtside-leagues-v1': JSON.stringify([{ id: 'abc123', name: 'Mock League', myTeam: 't2', used: 1 }]) };
  const { p, errs, ctx } = await open(seed, 10);
  ok(!(await p.$eval('#fx-import', e => e.disabled)) && /Mock League/.test(await text(p, '#fx-lg')), 'league loaded: Import enabled, names the league');
  await p.click('#fx-import'); await p.waitForTimeout(1200);
  ok(/3 of 130 picks/.test(await text(p, '#fx-text')), 'status counts 3 of 130 picks: ' + await text(p, '#fx-text'));
  ok(await p.$eval('#fx-team', e => e.value) === 't2', 'team defaults to the saved league team');
  await p.selectOption('#fx-team', 't3'); await p.waitForTimeout(300);
  const lg = await p.evaluate(() => JSON.parse(localStorage.getItem('courtside-leagues-v1')));
  ok(lg[0].myTeam === 't2', 'saved league myTeam not written by Draft: ' + lg[0].myTeam);
  const board = await p.evaluate(() => JSON.parse(localStorage.getItem('courtside-board-v1')));
  ok(board.fx && board.fx.myTeam === 't3' && board.fx.leagueId === 'abc123', 'draft keeps its own team choice in board fx');
  ok(board.picks.filter(v => v != null).length === 3 && board.cfg.teams === 10, 'three picks on the board, teams still 10');
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('courtside-settings-v1')));
  ok(st.settings.teams === 10 && st.settings.roster === 13, 'Settings untouched by Import');
  ok(errs.length === 0, '2: no page errors ' + errs.join('; '));
  // reload: same league, so sync resumes
  const calls0 = (await open(seed, 10)); await calls0.p.waitForTimeout(800);
  await calls0.ctx.close(); await ctx.close(); }

// 3. team count mismatch shows the error and changes nothing
{ const { p, errs, ctx } = await open({ 'courtside-settings-v1': store(12) }, 10);
  await p.click('#fx-import'); await p.waitForTimeout(800);
  const t = await text(p, '#fx-text');
  ok(/Settings say 12 teams; this league's draft has 10/.test(t), 'mismatch error: ' + t);
  ok((await p.evaluate(() => JSON.parse(localStorage.getItem('courtside-board-v1') || '{"picks":[]}'))).picks.every(v => v == null), 'no picks imported');
  ok(errs.length === 0, '3: no page errors ' + errs.join('; '));
  await ctx.close(); }

// 4. a saved draft synced from another league does not reconnect; the same league does
{ const board = fx => JSON.stringify({ cfg: settings(10), picks: new Array(130).fill(null), log: [], owner: [], fx, extra: [] });
  const mk = id => ({ 'courtside-settings-v1': store(10), 'courtside-board-v1': board({ leagueId: id, order: ids(10), names: {}, myTeam: 't1' }) });
  const other = await open(mk('zzz999'), 10);
  ok(other.calls() === 0, 'other league: no Fantrax request on load');
  ok(/isn't the one loaded in Settings/.test(await text(other.p, '#fx-text')), 'other league: status explains: ' + await text(other.p, '#fx-text'));
  await other.ctx.close();
  const same = await open(mk('abc123'), 10); await same.p.waitForTimeout(800);
  ok(same.calls() > 0 && /3 of 130 picks/.test(await text(same.p, '#fx-text')), 'same league: reconnects and syncs: ' + await text(same.p, '#fx-text'));
  ok(same.errs.length === 0 && other.errs.length === 0, '4: no page errors');
  await same.ctx.close(); }

await b.close();
console.log(fails.length ? 'FAILED: ' + fails.length : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
