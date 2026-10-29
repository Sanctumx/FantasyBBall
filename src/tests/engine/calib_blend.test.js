// Season-to-date / last-30-days blend of the preseason lines (#145, 2026-10-28; design: docs/superpowers/specs/2026-10-28-calib-blend-design.md)
const test = require('node:test'), assert = require('node:assert');
const CB = require('../../calib_blend.js');

// daily row: [day, fgm, fga, ftm, fta, fg3m, pts, reb, ast, stl, blk, tov, min]
const line = { m: 30, g: 70, pts: 20, tpm: 2, reb: 6, ast: 4, stl: 1, blk: 0.5, to: 2, fga: 15, fta: 5, fgp: 0.45, ftp: 0.8 };
const row = (day, o = {}) => [day, o.fgm ?? 8, o.fga ?? 16, o.ftm ?? 4, o.fta ?? 5, o.fg3m ?? 3, o.pts ?? 24, o.reb ?? 5, o.ast ?? 3, o.stl ?? 2, o.blk ?? 1, o.tov ?? 1, o.min ?? 32];
const INF = { g: Infinity, min: Infinity, fg: Infinity, ft: Infinity }, ZERO = { g: 0, min: 0, fg: 0, ft: 0 };
const rows = Array.from({ length: 40 }, (_, i) => row(i * 2, { pts: 10 + i }));

test('n0 = infinity returns the preseason line bit for bit', () => {
  const b = CB.blendLine(line, rows, 8, 'STD', INF);
  for (const k of Object.keys(line)) assert.strictEqual(b[k], line[k], k);
});

test('no rows before the checkpoint returns the preseason line exactly', () => {
  const late = rows.filter(r => r[0] >= 56), b = CB.blendLine(line, late, 8, 'STD', ZERO);   // checkpoint day 56
  for (const k of Object.keys(line)) assert.strictEqual(b[k], line[k], k);
});

test('no look-ahead: rows from the checkpoint day on change nothing', () => {
  const cut = 7 * 8, before = rows.filter(r => r[0] < cut), n0 = { g: 10, min: 300, fg: 100, ft: 100 };
  const a = CB.blendLine(line, rows, 8, 'STD', n0), b = CB.blendLine(line, before, 8, 'STD', n0), c = CB.blendLine(line, before.concat([row(cut, { pts: 99 }), row(cut + 5, { pts: 99 })]), 8, 'STD', n0);
  assert.deepStrictEqual(a, b); assert.deepStrictEqual(a, c);
});

test('n0 = 0 gives the observed rates; a huge n0 gives the preseason line', () => {
  const rs = [row(1, { pts: 30, min: 30 }), row(3, { pts: 10, min: 10 })], z = CB.blendLine(line, rs, 4, 'STD', { g: Infinity, min: 0, fg: 0, ft: 0 });
  assert.ok(Math.abs(z.pts - (40 / 40) * line.m) < 1e-9);          // 40 pts in 40 min = 1 per minute, x 30 mpg
  assert.ok(Math.abs(z.fgp - 16 / 32) < 1e-9 && Math.abs(z.ftp - 8 / 10) < 1e-9);
  const h = CB.blendLine(line, rs, 4, 'STD', { g: 1e12, min: 1e12, fg: 1e12, ft: 1e12 });
  for (const k of Object.keys(line)) assert.ok(Math.abs(h[k] - line[k]) < 1e-6, k);
});

test('minutes blend: m = (m n0 + sum min) / (n0 + games)', () => {
  const rs = [row(1, { min: 40 }), row(2, { min: 20 }), row(3, { min: 36 })], b = CB.blendLine(line, rs, 4, 'STD', { g: 5, min: Infinity, fg: Infinity, ft: Infinity });
  assert.ok(Math.abs(b.m - (30 * 5 + 96) / 8) < 1e-9);
});

test('L30 drops rows older than 30 days; it equals STD at week 4', () => {
  const n0 = { g: 5, min: 200, fg: 50, ft: 50 }, early = [row(0, { pts: 80 }), row(2, { pts: 80 }), row(30, { pts: 12 }), row(40, { pts: 12 })];
  assert.deepStrictEqual(CB.blendLine(line, early, 7, 'L30', n0), CB.blendLine(line, early.slice(2), 7, 'STD', n0));   // cut 49: days 19-48
  const wk4 = rows.filter(r => r[0] < 21);
  assert.deepStrictEqual(CB.blendLine(line, wk4, 3, 'L30', n0), CB.blendLine(line, wk4, 3, 'STD', n0));                  // cut 21: 21 days fit in 30
});

test('L60 and L90 (#156): window is the last N days, equal to STD while the checkpoint is within N days', () => {
  const n0 = { g: 5, min: 200, fg: 50, ft: 50 }, rs = rows.filter(r => r[0] < 112);
  for (const [win, days] of [['L60', 60], ['L90', 90]]) {
    const w0 = 15, cut = 7 * w0, kept = rs.filter(r => r[0] >= cut - days && r[0] < cut);   // cut 105
    assert.deepStrictEqual(CB.blendLine(line, rs, w0, win, n0), CB.blendLine(line, kept, w0, 'STD', n0));
    assert.deepStrictEqual(CB.blendLine(line, rs, 8, win, n0), CB.blendLine(line, rs, 8, 'STD', n0));   // cut 56 <= 60
  }
  assert.notDeepStrictEqual(CB.blendLine(line, rs, 15, 'L60', n0), CB.blendLine(line, rs, 15, 'STD', n0));
});

test('makeSample holds the sums of every window (#156)', () => {
  const s = CB.makeSample(line, rows, 12);
  for (const w of ['STD', 'L30', 'L60', 'L90']) assert.ok(s.w[w] && s.w[w].gp >= 0, w);
  assert.strictEqual(s.w.STD, s.std); assert.strictEqual(s.w.L30, s.l30);
  assert.ok(s.w.L30.gp <= s.w.L60.gp && s.w.L60.gp <= s.w.L90.gp && s.w.L90.gp <= s.w.STD.gp);
});

test('fitOn fits n0 on the named seasons only (#156)', () => {
  const mk = (seed, bias) => { const r = require('../../calib_ros_stats.js').rng(seed); return Array.from({ length: 60 }, () => {
    const rs = Array.from({ length: 20 }, (_, i) => row(i, { pts: 20 + 5 * r() })), rest = Array.from({ length: 20 }, (_, i) => row(30 + i, { pts: 20 + bias + 5 * r() }));
    return CB.makeSample(Object.assign({}, line), rs.concat(rest), 3); }); };
  const grids = { g: [0, 10, Infinity], min: [0, 100, Infinity], a: [0, 100, Infinity] }, by = { a: mk(1, 0), b: mk(2, 0), c: mk(3, 0) };
  const base = CB.fitOn(by, ['a', 'b'], { grids }).n0;
  assert.deepStrictEqual(CB.fitOn({ a: by.a, b: by.b, c: mk(3, 50) }, ['a', 'b'], { grids }).n0, base);
});

test('percentages are weighted by attempts', () => {
  const rs = [row(1, { fgm: 1, fga: 2, ftm: 0, fta: 2 }), row(2, { fgm: 9, fga: 18, ftm: 8, fta: 8 })], b = CB.blendLine(line, rs, 4, 'STD', { g: Infinity, min: Infinity, fg: 0, ft: 0 });
  assert.ok(Math.abs(b.fgp - 10 / 20) < 1e-9 && Math.abs(b.ftp - 8 / 10) < 1e-9);
  const h = CB.blendLine(line, rs, 4, 'STD', { g: Infinity, min: Infinity, fg: 20, ft: 10 });
  assert.ok(Math.abs(h.fgp - (0.45 * 20 + 10) / 40) < 1e-9 && Math.abs(h.ftp - (0.8 * 10 + 8) / 20) < 1e-9);
});

test('fitN0 on a hold-out never sees the held-out season', () => {
  const mk = (seed, bias) => { const r = require('../../calib_ros_stats.js').rng(seed); return Array.from({ length: 60 }, () => {
    const rs = Array.from({ length: 20 }, (_, i) => row(i, { pts: 20 + 5 * r() })), rest = Array.from({ length: 20 }, (_, i) => row(30 + i, { pts: 20 + bias + 5 * r() }));
    return CB.makeSample(Object.assign({}, line), rs.concat(rest), 3, 4); }); };
  const by = { a: mk(1, 0), b: mk(2, 0), c: mk(3, 0) }, base = CB.fitHoldout(by, 'c', { grids: { g: [0, 10, Infinity], min: [0, 100, Infinity], a: [0, 100, Infinity] } });
  const by2 = { a: by.a, b: by.b, c: mk(3, 50) };
  assert.deepStrictEqual(CB.fitHoldout(by2, 'c', { grids: { g: [0, 10, Infinity], min: [0, 100, Infinity], a: [0, 100, Infinity] } }).n0, base.n0);
});

test('fitN0 picks no learning (infinity) when preseason is exact and observed rows are noise', () => {
  const r = require('../../calib_ros_stats.js').rng(7), s = Array.from({ length: 80 }, () => {
    const pre = Object.assign({}, line, { pts: 20 }), rs = Array.from({ length: 15 }, (_, i) => row(i, { pts: 20 + 12 * (r() - 0.5) })), rest = Array.from({ length: 30 }, (_, i) => row(30 + i, { pts: 20 + 12 * (r() - 0.5) }));
    return CB.makeSample(pre, rs.concat(rest), 3, 4); });
  assert.strictEqual(CB.fitN0(s, { grids: { g: [0, 10, Infinity], min: [0, 300, 1e9, Infinity], a: [0, 100, Infinity] } }).n0.min >= 300, true);
});
