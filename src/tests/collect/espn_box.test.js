// Box-score collector (#113, 2026-10-21); fixtures from live 2025-26 ESPN data (make_espn_box.mjs)
const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const sb = require('../fixtures/espn_scoreboard.json'), sum = require('../fixtures/espn_summary.json');
const load = () => import('../../collect/espn_box.mjs');
const clone = o => JSON.parse(JSON.stringify(o));

test('finalGames keeps completed standard regular-season games of the season only', async () => {
  const { finalGames } = await load();
  assert.deepStrictEqual(finalGames(sb, 2026, '20260310'), [{ id: '401810791', d: '2026-03-10' }]);   // not the live game, Cup final, All-Star or play-in
  assert.deepStrictEqual(finalGames(sb, 2027, '20260310'), []);
  assert.deepStrictEqual(finalGames({}, 2026, '20260310'), []);
});

test('parseBox reads every player who played, by key, in COLS order', async () => {
  const { parseBox, COLS } = await load();
  assert.deepStrictEqual(COLS, ['min', 'fgm', 'fga', 'ftm', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to']);
  const b = parseBox(sum);
  assert.deepStrictEqual(Object.keys(b.teams).sort(), ['MEM', 'PHI']);
  assert.deepStrictEqual([b.teams.MEM.length, b.teams.PHI.length], [10, 10]);
  assert.deepStrictEqual(b.teams.PHI.find(r => r[0] === '4870562'), ['4870562', 34, 4, 7, 3, 6, 0, 11, 6, 1, 0, 0, 1]);
  assert.deepStrictEqual(b.teams.MEM.find(r => r[0] === '4595400'), ['4595400', 21, 4, 6, 2, 3, 1, 11, 6, 0, 2, 1, 2]);
  assert.ok(!b.teams.MEM.some(r => r[0] === '3906665') && !('3906665' in b.names));   // Brandon Clarke did not play
  assert.strictEqual(b.names['4870562'], 'Dominick Barlow');
});

test('parseBox team sums equal ESPN team totals', async () => {
  const { parseBox, COLS } = await load();
  const b = parseBox(sum), s = (t, k) => b.teams[t].reduce((a, r) => a + r[1 + COLS.indexOf(k)], 0);
  assert.deepStrictEqual([s('PHI', 'pts'), s('MEM', 'pts'), s('PHI', 'fgm'), s('PHI', 'fga'), s('MEM', 'reb')], [139, 129, 45, 86, 44]);
});

test('parseBox ignores key order and reads a non-number as 0', async () => {
  const { parseBox } = await load();
  const rev = clone(sum);
  rev.boxscore.players.forEach(t => { const s = t.statistics[0]; s.keys.reverse(); s.totals.reverse(); s.athletes.forEach(a => a.stats.reverse()); });
  assert.deepStrictEqual(parseBox(rev), parseBox(sum));
  const odd = clone(sum); odd.boxscore.players[1].statistics[0].athletes.find(a => a.athlete.id === '4870562').stats[0] = '--';
  assert.strictEqual(parseBox(odd).teams.PHI.find(r => r[0] === '4870562')[1], 0);
});

test('parseBox returns null for an incomplete box', async () => {
  const { parseBox } = await load();
  const one = clone(sum); one.boxscore.players.pop();
  const thin = clone(sum); thin.boxscore.players[0].statistics[0].athletes = thin.boxscore.players[0].statistics[0].athletes.slice(0, 3);
  assert.deepStrictEqual([parseBox(one), parseBox(thin), parseBox({}), parseBox(null)], [null, null, null, null]);
});

test('parseBox returns null when a column is missing or the players do not add up to the team totals', async () => {
  const { parseBox } = await load();
  const renamed = clone(sum); renamed.boxscore.players[0].statistics[0].keys[0] = 'mins';
  const stale = clone(sum); stale.boxscore.players[1].statistics[0].totals[1] = '140';
  const noTotals = clone(sum); noTotals.boxscore.players.forEach(t => { delete t.statistics[0].totals; });
  assert.deepStrictEqual([parseBox(renamed), parseBox(stale)], [null, null]);
  assert.ok(parseBox(noTotals));
});

test('etDay and daysBack use New York dates across daylight saving', async () => {
  const { etDay, daysBack } = await load();
  assert.strictEqual(etDay(new Date('2026-10-28T03:59:00Z')), '20261027');   // EDT, UTC-4
  assert.strictEqual(etDay(new Date('2026-11-02T04:30:00Z')), '20261101');   // EST, UTC-5
  assert.strictEqual(etDay(new Date('2026-11-02T05:30:00Z')), '20261102');
  assert.deepStrictEqual(daysBack(new Date('2026-11-02T04:30:00Z'), 3), ['20261101', '20261031', '20261030']);
});

test('mergeMonth adds only new games of its month and returns null when nothing is new', async () => {
  const { mergeMonth, monthOf, parseBox, COLS } = await load();
  const box = parseBox(sum), t1 = new Date('2026-03-11T08:07:00Z'), t2 = new Date('2026-03-11T09:07:00Z');
  assert.strictEqual(monthOf('2026-10-31'), '2026-10');
  const a = mergeMonth(null, 2026, '2026-03', [{ id: '401810791', d: '2026-03-10', box }], t1);
  assert.deepStrictEqual([a.season, a.month, a.updatedAt, a.cols, Object.keys(a.games)], [2026, '2026-03', '2026-03-11T08:07:00.000Z', COLS, ['401810791']]);
  assert.deepStrictEqual(a.games['401810791'], { d: '2026-03-10', teams: box.teams });
  assert.strictEqual(a.names['4870562'], 'Dominick Barlow');
  assert.strictEqual(mergeMonth(a, 2026, '2026-03', [{ id: '401810791', d: '2026-03-10', box }], t2), null);   // already saved
  assert.strictEqual(mergeMonth(a, 2026, '2026-03', [{ id: '401810900', d: '2026-04-01', box }], t2), null);   // another month
  const changed = clone(box); changed.teams.PHI[0][7] = 99;
  const b = mergeMonth(a, 2026, '2026-03', [{ id: '401810791', d: '2026-03-10', box: changed }, { id: '401810799', d: '2026-03-10', box }], t2);
  assert.deepStrictEqual([Object.keys(b.games), b.updatedAt], [['401810791', '401810799'], '2026-03-11T09:07:00.000Z']);
  assert.deepStrictEqual(b.games['401810791'], a.games['401810791']);   // a saved game is never rewritten
});

test('missingGames skips games already saved in their month file', async () => {
  const { missingGames } = await load();
  const files = { '2026-03': { games: { '401810791': {} } }, '2026-04': null };
  assert.deepStrictEqual(missingGames(files, [{ id: '401810791', d: '2026-03-10' }, { id: '401810799', d: '2026-03-10' }, { id: '401811000', d: '2026-04-01' }]),
    [{ id: '401810799', d: '2026-03-10' }, { id: '401811000', d: '2026-04-01' }]);
});

const fake = (o = {}) => { const calls = []; return { calls, fetchJson: async url => { calls.push(url);
  if (/scoreboard/.test(url)) { if (o.sbFail && o.sbFail(url)) throw new Error('ESPN answered HTTP 503'); return clone(sb); }
  if (/summary\?event=401810791$/.test(url)) { if (o.sumFail) throw new Error('ESPN answered HTTP 500'); return clone(sum); }
  throw new Error('unexpected ' + url); } }; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'box-'));
const opts = (dir, f, extra) => Object.assign({ season: 2026, dates: ['20260310'], outDir: dir, now: new Date('2026-03-11T08:07:00Z'), fetchJson: f.fetchJson, log: () => {}, pauseMs: 0 }, extra);

test('run saves new finals once; a second run fetches and writes nothing', async () => {
  const { run } = await load(); const dir = tmp(), f1 = fake();
  assert.deepStrictEqual(await run(opts(dir, f1)), { added: 1, written: ['box-2026-03.json'] });
  assert.strictEqual(f1.calls.filter(u => /summary/.test(u)).length, 1);   // the live game is not fetched
  const file = path.join(dir, 'box-2026-03.json'), bytes = fs.readFileSync(file, 'utf8');
  assert.deepStrictEqual(Object.keys(JSON.parse(bytes).games), ['401810791']);
  const f2 = fake();
  assert.deepStrictEqual(await run(opts(dir, f2, { now: new Date('2026-03-11T09:07:00Z') })), { added: 0, written: [] });
  assert.strictEqual(f2.calls.filter(u => /summary/.test(u)).length, 0);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), bytes);
});

test('a failed summary is left for the next run; one failed day is skipped; all days failing throws', async () => {
  const { run } = await load(); const logs = [];
  assert.deepStrictEqual(await run(opts(tmp(), fake({ sumFail: true }), { log: m => logs.push(m) })), { added: 0, written: [] });
  assert.ok(logs.some(m => /401810791/.test(m)));
  assert.strictEqual((await run(opts(tmp(), fake({ sbFail: u => /20260309/.test(u) }), { dates: ['20260310', '20260309'] }))).added, 1);
  await assert.rejects(run(opts(tmp(), fake({ sbFail: () => true }))), /scoreboard unreachable/);
});

test('run rejects a date range, warns on another season year, and files games by their own day across months', async () => {
  const { run } = await load(); const logs = [];
  await assert.rejects(run(opts(tmp(), fake(), { dates: ['20260310-20260315'] })), /YYYYMMDD/);
  await run(opts(tmp(), fake(), { season: 2027, log: m => logs.push(m) }));
  assert.ok(logs.some(m => /another season year/.test(m)));
  const game = (id, date) => { const e = clone(sb.events[0]); e.id = id; e.date = date; return { events: [e] }; };
  const get = async url => /scoreboard\?dates=20261031/.test(url) ? game('1', '2026-11-01T02:00Z') : /scoreboard/.test(url) ? game('2', '2026-11-01T23:00Z') : clone(sum);
  const dir = tmp(), r = await run(opts(dir, { fetchJson: get }, { dates: ['20261031', '20261101'] }));
  assert.deepStrictEqual(r.written.sort(), ['box-2026-10.json', 'box-2026-11.json']);
  assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'box-2026-10.json'), 'utf8')).games), ['1']);
});
