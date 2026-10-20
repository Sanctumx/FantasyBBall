// ESPN actual-stats collector (2026-10-20)
const test = require('node:test'), assert = require('node:assert');
const page = require('./fixtures/espn_page.json');
const load = () => import('../collect/espn_stats.mjs');
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
