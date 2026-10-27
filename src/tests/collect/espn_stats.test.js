// ESPN actual-stats collector (2026-10-20)
const test = require('node:test'), assert = require('node:assert');
const page = require('../fixtures/espn_page.json');
const load = () => import('../../collect/espn_stats.mjs');
const near = (a, b) => Math.abs(a - b) < 1e-3;

test('parses per-game rows by label', async () => {
  const r = (await load()).parseByAthlete(page);
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual([r[0].id, r[0].n, r[0].t, r[0].gp], ['3945274', 'Luka Doncic', 'LAL', 64]);
  assert.ok(near(r[0].pts, 33.484) && near(r[0].fga, 22.766) && near(r[0].stl, 1.641) && near(r[0].to, 3.984) && near(r[0].tpm, 3.969) && near(r[0].reb, 7.734));
});

test('label order does not matter', async () => {
  const { parseByAthlete } = await load();
  const rev = JSON.parse(JSON.stringify(page));
  rev.categories.forEach(c => c.names.reverse());
  rev.athletes.forEach(a => a.categories.forEach(c => c.values.reverse()));
  assert.deepStrictEqual(parseByAthlete(rev), parseByAthlete(page));
});

test('refuses another season or an empty page', async () => {
  const { shouldWrite } = await load();
  assert.strictEqual(page.requestedSeason.year, 2026);
  assert.strictEqual(shouldWrite(page, 2027), false);   // ESPN answered with last season
  assert.strictEqual(shouldWrite(page, 2026), true);
  assert.strictEqual(shouldWrite(Object.assign({}, page, { athletes: [] }), 2026), false);
  assert.strictEqual(shouldWrite(null, 2026), false);
});

test('players without a team keep an empty team code', async () => {
  const { parseByAthlete } = await load();
  const x = JSON.parse(JSON.stringify(page)); delete x.athletes[1].athlete.teamShortName;
  assert.strictEqual(parseByAthlete(x)[1].t, '');
});

// hourly collection (2026-10-21): write only when the players' numbers changed
test('sameStats ignores player order and fetchedAt, sees a changed number, a missing file or another season', async () => {
  const { sameStats, parseByAthlete } = await load();
  const players = parseByAthlete(page), prev = { season: 2026, fetchedAt: 'x', players };
  assert.strictEqual(sameStats(prev, players.slice().reverse(), 2026), true);
  const bumped = players.map((p, i) => i ? p : Object.assign({}, p, { gp: p.gp + 1 }));
  assert.strictEqual(sameStats(prev, bumped, 2026), false);
  assert.strictEqual(sameStats(prev, players.slice(1), 2026), false);
  assert.strictEqual(sameStats(null, players, 2026), false);
  assert.strictEqual(sameStats(prev, players, 2027), false);
});

test('nextFile returns the new file only when ESPN has the season and the numbers moved', async () => {
  const { nextFile, parseByAthlete } = await load();
  const players = parseByAthlete(page), now = new Date('2026-10-22T03:07:00Z');
  const first = nextFile(null, page, players, 2026, now);
  assert.deepStrictEqual([first.season, first.label, first.fetchedAt, first.players.length], [2026, page.requestedSeason.displayName, '2026-10-22T03:07:00.000Z', 3]);
  assert.strictEqual(nextFile(first, page, players.slice().reverse(), 2026, now), null);   // nothing moved
  assert.strictEqual(nextFile(null, page, players, 2027, now), null);                       // ESPN answered with last season
  const moved = players.map((p, i) => i ? p : Object.assign({}, p, { pts: p.pts + 0.1 }));
  assert.ok(nextFile(first, page, moved, 2026, now));
});
