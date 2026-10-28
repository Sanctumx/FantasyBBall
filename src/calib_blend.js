// Blend of in-season stats into the preseason lines (#145, 2026-10-28; design: docs/superpowers/specs/2026-10-28-calib-blend-design.md). Pure.
// A line is the engine's per-game line { m, g, pts, tpm, reb, ast, stl, blk, to, fga, fta, fgp, ftp }. Daily rows (bt_daily.json) are
// [day, fgm, fga, ftm, fta, fg3m, pts, reb, ast, stl, blk, tov, min]. Checkpoint w0 (0-based start of week w0) cuts at day 7 * w0: STD uses days
// < cut, L30 days cut - 30 .. cut - 1. Minutes m' = (m n0.g + sum min) / (n0.g + gp); each counting rate (per minute) r' = (r_pre n0.min + sum stat)
// / (n0.min + sum min) and the per-game stat is r' m'; FG% / FT% = (pct n0.fg + sum made) / (n0.fg + sum attempts). Infinity keeps the preseason value.
const GRIDS = {
  g: [0, 5, 10, 15, 20, 30, 40, 60, 82, Infinity],
  min: [0, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, Infinity],
  a: [0, 50, 100, 200, 300, 500, 750, 1000, 1500, Infinity]
};
const COUNT = ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'], ATT = ['fga', 'fta'];
const COL = { tpm: 5, pts: 6, reb: 7, ast: 8, stl: 9, blk: 10, to: 11 };
const MIN_COL = 12;

// sums of the rows with day in [lo, hi]
function aggregate(rows, lo, hi) {
  const a = { gp: 0, min: 0, fgm: 0, fga: 0, ftm: 0, fta: 0, s: { tpm: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0 } };
  for (const r of rows || []) {
    if (r[0] < lo || r[0] > hi) continue;
    if (r[MIN_COL] == null) throw new Error('bt_daily.json has no minutes column: run mk_daily.py');
    if (!(r[MIN_COL] > 0)) continue;   // a 0-minute row is not a game
    a.gp++; a.min += r[MIN_COL]; a.fgm += r[1]; a.fga += r[2]; a.ftm += r[3]; a.fta += r[4];
    for (const k of COUNT) a.s[k] += r[COL[k]];
  }
  return a;
}
const window = (w0, win) => [win === 'L30' ? 7 * w0 - 30 : -Infinity, 7 * w0 - 1];

function blendAgg(line, a, n0) {
  const out = Object.assign({}, line);
  if (!a.gp || a.min <= 0) return out;
  const noRate = n0.g === Infinity && n0.min === Infinity, noPct = n0.fg === Infinity && n0.ft === Infinity;
  if (noRate && noPct) return out;
  const m = line.m, m2 = n0.g === Infinity ? m : (m * n0.g + a.min) / (n0.g + a.gp);
  if (!noRate) {
    out.m = m2;
    const rate = (pre, obs) => (n0.min === Infinity ? pre : (pre * n0.min + obs) / (n0.min + a.min));
    for (const k of COUNT) out[k] = rate(m > 0 ? line[k] / m : 0, a.s[k]) * m2;
    out.fga = rate(m > 0 ? line.fga / m : 0, a.fga) * m2;
    out.fta = rate(m > 0 ? line.fta / m : 0, a.fta) * m2;
  }
  if (n0.fg !== Infinity && n0.fg + a.fga > 0) out.fgp = (line.fgp * n0.fg + a.fgm) / (n0.fg + a.fga);
  if (n0.ft !== Infinity && n0.ft + a.fta > 0) out.ftp = (line.ftp * n0.ft + a.ftm) / (n0.ft + a.fta);
  return out;
}
function blendLine(line, rows, w0, win, n0) { const [lo, hi] = window(w0, win); return blendAgg(line, aggregate(rows, lo, hi), n0); }

// one player at one checkpoint: the preseason line, both windows' sums and the rest-of-season actuals (days >= cut)
function makeSample(line, rows, w0) {
  const cut = 7 * w0, rest = aggregate(rows, cut, Infinity), pg = {};
  for (const k of COUNT.concat(ATT)) pg[k] = rest.gp ? (k === 'fga' ? rest.fga : k === 'fta' ? rest.fta : rest.s[k]) / rest.gp : 0;
  pg.m = rest.gp ? rest.min / rest.gp : 0;
  return { line, w0, std: aggregate(rows, ...window(w0, 'STD')), l30: aggregate(rows, ...window(w0, 'L30')), rest, pg,
    fgp: rest.fga ? rest.fgm / rest.fga : 0, ftp: rest.fta ? rest.ftm / rest.fta : 0 };
}

const wsd = (xs, ws) => { const W = ws.reduce((s, w) => s + w, 0), m = xs.reduce((s, x, i) => s + ws[i] * x, 0) / W; return Math.sqrt(xs.reduce((s, x, i) => s + ws[i] * (x - m) ** 2, 0) / W) || 1; };
// the engine-category spread (per game) that scales each stat in the loss
function spreads(S) {
  const ws = S.map(s => s.rest.gp), sp = {};
  for (const k of COUNT) sp[k] = wsd(S.map(s => s.pg[k]), ws);
  sp.fg = wsd(S.map(s => (s.line.fgp - 0.46) * s.line.fga), ws); sp.ft = wsd(S.map(s => (s.line.ftp - 0.78) * s.line.fta), ws);
  return sp;
}
const agg = (s, win) => (win === 'L30' ? s.l30 : s.std);

// weighted squared error of the blended per-game lines vs rest-of-season per game; fam: 'count' (minutes and rates) | 'fg' | 'ft'
function loss(S, n0, win, sp, fam) {
  let L = 0, W = 0;
  for (const s of S) {
    if (!s.rest.gp) continue;
    const b = blendAgg(s.line, agg(s, win), n0), w = s.rest.gp;
    if (fam === 'count') { let e = 0; for (const k of COUNT) e += ((b[k] - s.pg[k]) / sp[k]) ** 2; L += w * e; W += w; }
    else { const att = fam === 'fg' ? s.pg.fga : s.pg.fta, act = fam === 'fg' ? s.fgp : s.ftp; if (!att) continue; L += w * (((fam === 'fg' ? b.fgp : b.ftp) - act) * att / sp[fam]) ** 2; W += w; }
  }
  return L / W;
}
// n0 by coordinate descent (g, min, g, min, then fg and ft each on their own); curves are loss vs n0 at the last pass, edge lists families that
// landed on the first or last finite grid value (extend the grid if so)
function fitN0(S, opts = {}) {
  const gr = Object.assign({}, GRIDS, opts.grids), win = (opts && opts.win) || 'STD', sp = spreads(S), n0 = { g: Infinity, min: Infinity, fg: Infinity, ft: Infinity }, curves = {};
  const best = (key, grid, fam) => { let bv = grid[0], bl = Infinity; const cv = []; for (const v of grid) { const l = loss(S, Object.assign({}, n0, { [key]: v }), win, sp, fam); cv.push([v, l]); if (l < bl) { bl = l; bv = v; } } n0[key] = bv; curves[key] = cv; };
  for (let pass = 0; pass < 2; pass++) { best('g', gr.g, 'count'); best('min', gr.min, 'count'); }
  best('fg', gr.a, 'fg'); best('ft', gr.a, 'ft');
  const edge = Object.keys(n0).filter(k => { const g = gr[k === 'fg' || k === 'ft' ? 'a' : k], fin = g.filter(Number.isFinite); return n0[k] === fin[0] || n0[k] === fin[fin.length - 1]; });
  return { n0, curves, edge, base: { count: loss(S, { g: Infinity, min: Infinity, fg: Infinity, ft: Infinity }, win, sp, 'count') } };
}
// bySeason: { season: [sample] }; fit on every other season, STD and L30 separately
function fitHoldout(bySeason, hold, opts = {}) {
  const S = [].concat(...Object.keys(bySeason).filter(s => s !== hold).map(s => bySeason[s]));
  return fitN0(S, opts);
}
// held-out weighted player RMSE by stat for a source: 'PRE' (preseason), 'STD' or 'L30' with its n0
function rmse(S, win, n0) {
  const out = {}, tot = {}; let W = 0;
  const keys = COUNT.concat(['fga', 'fta']);
  keys.forEach(k => { out[k] = 0; });
  out.fgp = 0; out.ftp = 0; let wf = 0, wt = 0;
  for (const s of S) {
    if (!s.rest.gp) continue;
    const b = win === 'PRE' ? s.line : blendAgg(s.line, agg(s, win), n0), w = s.rest.gp; W += w;
    for (const k of keys) out[k] += w * (b[k] - s.pg[k]) ** 2;
    if (s.pg.fga) { out.fgp += w * ((b.fgp - s.fgp) * s.pg.fga) ** 2; wf += w; }
    if (s.pg.fta) { out.ftp += w * ((b.ftp - s.ftp) * s.pg.fta) ** 2; wt += w; }
  }
  keys.forEach(k => { out[k] = Math.sqrt(out[k] / W); });
  out.fgp = Math.sqrt(out.fgp / (wf || 1)); out.ftp = Math.sqrt(out.ftp / (wt || 1));
  return out;
}
module.exports = { GRIDS, aggregate, blendAgg, blendLine, makeSample, spreads, loss, fitN0, fitHoldout, rmse };
