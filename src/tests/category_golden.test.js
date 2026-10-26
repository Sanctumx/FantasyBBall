// Rankings, the engine context and the Team tab's win numbers in categories are pinned (2026-10-26): points mode (#137) must not
// move them. Regenerate the fixture only on purpose (node src/tests/fixtures/make_category_golden.js).
const test = require('node:test'), assert = require('node:assert');
const { compute } = require('./fixtures/make_category_golden.js'), golden = require('./fixtures/category_golden.json');

function same(a, b, path) {
  if (typeof a === 'number' && typeof b === 'number') return assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b)), path + ': ' + a + ' vs ' + b);
  if (Array.isArray(a) && Array.isArray(b)) { assert.strictEqual(a.length, b.length, path + ' length'); return a.forEach((x, i) => same(x, b[i], path + '[' + i + ']')); }
  if (a && b && typeof a === 'object' && typeof b === 'object') { assert.deepStrictEqual(Object.keys(a).sort(), Object.keys(b).sort(), path + ' keys'); return Object.keys(a).forEach(k => same(a[k], b[k], path + '.' + k)); }
  assert.strictEqual(a, b, path);
}

const now = compute();
test('Rankings tables, win starts and the engine context match the pinned category output', () => same(now.rankings, golden.rankings, 'rankings'));
test('Team win numbers match the pinned category output', t => {
  if (now.playersHash !== golden.playersHash) return t.skip('src/players.json changed: regenerate category_golden.json on purpose');
  assert.strictEqual(now.teamError, undefined);
  same(now.team, golden.team, 'team');
});
