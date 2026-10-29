// Fold plan, probit shrink and gates K-N of #156 (2026-10-28; design: docs/superpowers/specs/2026-10-28-calib-kwl-design.md). Pure.
// Nested n0: the n0 behind a training season A's forecasts is fitted on the seasons other than A and the held-out T (the #145 leak is gone).
const nestedPool = (all, A, T) => all.filter(s => s !== A && s !== T);
// one fold per primary season (k fitted on the other primary seasons) plus the confirmation season (k fitted on all primary seasons)
function foldPlan(primary, confirm) {
  const plan = primary.map(T => { const train = primary.filter(s => s !== T); return { test: T, train, nTrainBuilds: train.length, confirm: false }; });
  plan.push({ test: confirm, train: primary.slice(), nTrainBuilds: primary.length, confirm: true });
  return plan;
}

// normal cdf (Abramowitz and Stegun 7.1.26, odd in x) and its inverse by bisection, so the pair is exactly consistent
function normCdf(x) {
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 + 0.5 * erf : 0.5 - 0.5 * erf;
}
function normInv(p) { let lo = -9, hi = 9; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (normCdf(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
// P1: p' = Phi(Phi^-1(p) s); z = Phi^-1(p) can be cached per row
const probitShrink = (p, s) => normCdf(normInv(p) * s);

// spread (max - min) of k* / predicted k over checkpoints
function ratioSpread(kStar, kPred) { const r = kStar.map((k, i) => k / kPred[i]); return Math.max(...r) - Math.min(...r); }

// ---- gates (each fold: { dK1: K1 vs K0 d+se on the held-out season, train: { b, seB } of K1 on the training seasons, spreadK0, spreadK1, dCk: Kck vs K1 }) ----
const se1 = x => x.d <= -x.se, se2 = x => x.d <= -2 * x.se;
function gateK(folds, conf) {
  const brier = folds.every(f => se1(f.dK1)), slope = folds.every(f => f.train.b > 0 && f.train.b >= 2 * f.train.seB), spread = folds.filter(f => f.spreadK1 < f.spreadK0).length >= 2, confOk = conf.d < 0;
  return { pass: brier && slope && spread && confOk, brier, slope, spread, conf: confOk };
}
const gateL = folds => ({ pass: folds.every(f => se2(f.dCk)) });
// folds[i].dW[w] = { d: window w vs STD (d + se, held-out k, only at checkpoints where they differ), player: lower player counting loss there }
function gateM(folds) {
  const names = Object.keys(folds[0].dW), ok = names.filter(w => folds.every(f => se1(f.dW[w].d) && f.dW[w].player));
  const pooled = w => folds.reduce((s, f) => s + f.dW[w].d.d, 0) / folds.length;
  const pick = ok.length ? ok.sort((a, b) => pooled(a) - pooled(b))[0] : 'STD';
  return { pick, passing: ok };
}
// #157 gate O. folds[i] = { bT: { b, seB } of KLt on the training seasons, dKL: { d, se } KL vs K1 held-out, k1SeB?: seB of K1's b }; conf = KL vs K1 on the
// confirmation season. pass: |b| < 2 SE and KL beats K1 by >= 1 SE in every fold; conf (d < 0) is reported apart. unidentified: b's SE over twice K1's.
function gateO(folds, conf) {
  const slope = folds.every(f => Math.abs(f.bT.b) < 2 * f.bT.seB), brier = folds.every(f => se1(f.dKL)), unidentified = folds.some(f => f.k1SeB != null && f.bT.seB > 2 * f.k1SeB);
  return { pass: slope && brier, slope, brier, conf: conf.d < 0, unidentified };
}
function gateN(levels) { const range = Math.max(...levels) - Math.min(...levels); return { range, uncertain: range > 0.10 }; }

module.exports = { nestedPool, foldPlan, normCdf, normInv, probitShrink, ratioSpread, gateK, gateL, gateM, gateN, gateO };
