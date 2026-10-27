// The draft engine's outputs are pinned (2026-10-20): the Model pick, standings, gains and the League Dashboard's matchup
// matrix must not move when engine.js gains new functions. Regenerate the fixture only when the draft engine is changed on purpose.
const test = require('node:test'), assert = require('node:assert');
const { compute } = require('../fixtures/make_engine_golden.js'), golden = require('../fixtures/engine_golden.json');

// deep equality with a 1e-12 relative tolerance on numbers (floating point is not bit-identical across runtimes)
function same(a, b, path) {
  if (typeof a === 'number' && typeof b === 'number') return assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b)), path + ': ' + a + ' vs ' + b);
  if (Array.isArray(a) && Array.isArray(b)) { assert.strictEqual(a.length, b.length, path + ' length'); return a.forEach((x, i) => same(x, b[i], path + '[' + i + ']')); }
  if (a && b && typeof a === 'object' && typeof b === 'object') { assert.deepStrictEqual(Object.keys(a).sort(), Object.keys(b).sort(), path + ' keys'); return Object.keys(a).forEach(k => same(a[k], b[k], path + '.' + k)); }
  assert.strictEqual(a, b, path);
}

test('draft engine outputs match the pinned golden file', () => {
  const now = compute();
  assert.deepStrictEqual(Object.keys(now.draft), ['0', '29', '70']);
  for (const k of Object.keys(golden.draft)) assert.strictEqual(now.draft[k].modelPick, golden.draft[k].modelPick, 'Model pick at pick ' + k);
  same(now, golden, 'golden');
});
