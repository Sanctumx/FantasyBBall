// Rankings core: Zscore on the top X players by H2H-adjusted value within a source (user ruling, 2026-10-21)
const test = require('node:test'), assert = require('node:assert');
const R = require('../rankings_core.js'), PLAYERS = require('../players.json');
const rows = R.projSource(PLAYERS, 'avg');
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

test('projSource lists every player with games and a per-game line', () => {
  assert.strictEqual(rows.length, PLAYERS.length);
  assert.ok(rows[0].g > 0 && rows[0].line.pts > 0 && rows[0].pid === 0);
});

test('pool is the top teams x roster players by H2H value', () => {
  const t = R.table(rows, { teams: 12, roster: 12, type: 'h2h', basis: 'pergame' });
  const pool = t.filter(r => r.inPool), rest = t.filter(r => r.z != null && !r.inPool);
  assert.strictEqual(pool.length, 144);
  assert.ok(Math.min(...pool.map(r => r.z)) >= Math.max(...rest.map(r => r.z)) - 1e-9);
});

test('league size sets the pool', () => {
  assert.strictEqual(R.table(rows, { teams: 10, roster: 12, type: 'h2h', basis: 'pergame' }).filter(r => r.inPool).length, 120);
});

test('Standard type: every category has mean 0 and SD 1 over the pool', () => {
  const t = R.table(rows, { teams: 12, roster: 12, type: 'classic', basis: 'pergame' }), pool = t.filter(r => r.inPool);
  for (let c = 0; c < 9; c++) {
    const m = pool.reduce((s, r) => s + r.cats[c], 0) / pool.length;
    const sd = Math.sqrt(pool.reduce((s, r) => s + (r.cats[c] - m) ** 2, 0) / pool.length);
    assert.ok(near(m, 0, 1e-9) && near(sd, 1, 1e-9), 'cat ' + c + ' ' + m + ' ' + sd);
  }
});

test('Zscore is the weighted sum of the category z (TO x0.5)', () => {
  const t = R.table(rows, { teams: 12, roster: 12, type: 'classic', basis: 'pergame' });
  const W = [1, 1, 1, 1, 1, 1, 1, 1, 0.5];
  t.slice(0, 20).forEach(r => assert.ok(near(r.z, r.cats.reduce((s, v, c) => s + v * W[c], 0), 1e-9)));
});

test('input order does not change a player\'s Zscore', () => {
  const a = R.table(rows, { teams: 12, roster: 12, type: 'h2h', basis: 'total' });
  const b = R.table(rows.slice().reverse(), { teams: 12, roster: 12, type: 'h2h', basis: 'total' });
  const zb = new Map(b.map(r => [r.pid, r.z]));
  a.forEach(r => assert.ok(near(r.z, zb.get(r.pid), 1e-6), 'pid ' + r.pid));
});

test('a player with no games has no Zscore and does not move the others', () => {
  const extra = rows.concat([Object.assign({}, rows[0], { pid: 9999, g: 0 })]);
  const a = R.table(rows, { teams: 12, roster: 12, type: 'h2h', basis: 'total' }), b = R.table(extra, { teams: 12, roster: 12, type: 'h2h', basis: 'total' });
  assert.strictEqual(b.find(r => r.pid === 9999).z, null);
  const zb = new Map(b.map(r => [r.pid, r.z]));
  a.forEach(r => assert.ok(near(r.z, zb.get(r.pid), 1e-9)));
});

test('8-cat leagues ignore turnovers', () => {
  const t = R.table(rows, { teams: 12, roster: 12, type: 'classic', basis: 'pergame', cats: 8 });
  t.slice(0, 20).forEach(r => assert.ok(near(r.z, r.cats.slice(0, 8).reduce((s, v) => s + v, 0), 1e-9)));
});
