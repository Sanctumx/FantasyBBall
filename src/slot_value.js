// Slot value for uneven trades (#169): the week weights, the measured slot profile (slot_profile.json, made by slot_profile.js) and the
// switches the analyst sets (gate src/trade_2x1_gate.txt). Display and trade search only, never in the Model pick.
(function (root) {
  'use strict';
  const DAY = 864e5, TeamWin = root.TeamWin || require('./team_win.js');
  const PROFILE = root.SLOT_PROFILE || (typeof require !== 'undefined' ? require('./slot_profile.json') : null);
  const CURVE = { delta: 1, playoff: 1 };   // u_k = delta^(k-k0) for regular periods, x playoff for playoff periods; flat until tuned
  const APPROACH = 2;                       // 2 = week-weighted Win M, 1 = plain rest-of-season (slot term only)
  const SLOT_IN_SORT = false;               // true once the analyst validates the slot value for ordering
  const KEEP_2X1 = 15;                      // per give-pair, how many plain-screened targets get the weighted score
  const sig = (curve, profile) => ['v' + ((profile || PROFILE) || {}).version, curve.delta, curve.playoff, APPROACH, SLOT_IN_SORT].join('|');
  const SIG = sig(CURVE);

  // Per-period weights over the periods that still have time: w_k = phi_k * u_k / sum. -> [{ n, phi, w }]
  function weights(ctx, curve) {
    curve = curve || CURVE;
    const per = TeamWin.periodsLeft(ctx, 'all');
    const raw = per.map((p, i) => p.phi * Math.pow(curve.delta, i) * (p.playoff ? curve.playoff : 1)), tot = raw.reduce((s, x) => s + x, 0);
    return per.map((p, i) => ({ n: p.n, phi: p.phi, w: tot > 0 ? raw[i] / tot : 0 }));
  }

  // The slot value in Win M points per matchup for one period: the profile week at the period's midpoint (a 14-day period reads s14 at its
  // first week, since a two-week matchup is a different contest). Weeks outside the table clamp to the nearest.
  function slotOfPeriod(ctx, per, profile) {
    profile = profile || PROFILE;
    const t0 = ctx.L.periods[0].start, long = per.to - per.from > 8 * DAY, at = long ? per.from : (per.from + per.to) / 2;
    const wk = profile.weeks, w = Math.min(wk[wk.length - 1].w, Math.max(wk[0].w, 1 + Math.floor((at - t0) / (7 * DAY))));
    const row = wk.find(x => x.w === w) || wk.reduce((b, x) => Math.abs(x.w - w) < Math.abs(b.w - w) ? x : b);
    const v = long && row.s14 != null ? row.s14 : row.s;
    return v;
  }

  // S = sum of w_k * s(period k), in Win M points
  function slotTerm(ctx, curve, profile) {
    const per = TeamWin.periodsLeft(ctx, 'all'), w = weights(ctx, curve);
    return w.reduce((s, x, i) => s + x.w * slotOfPeriod(ctx, per[i], profile), 0);
  }

  const api = { PROFILE, CURVE, APPROACH, SLOT_IN_SORT, KEEP_2X1, SIG, sig, weights, slotOfPeriod, slotTerm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SlotValue = api;
})(typeof self !== 'undefined' ? self : this);
