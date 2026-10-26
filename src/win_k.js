// The one shrink every Win C / Win M display reads (#139, #147): Team, Rankings and the Trade Analyzer. Display only, never in the Model pick.
// Fitted leave-one-season-out on 3 seasons of rest-of-season forecasts (calib_ros_k.js): pooled k 0.43 match, 0.65 per category; shipped at
// 0.6 / 0.75 (user, 2026-10-26) because the backtest keeps draft rosters and preseason lines, so the live app is likely less overconfident.
(function (root) {
  'use strict';
  const SHRINK = { match: 0.6, cat: 0.75 };
  const shrink = (p, k) => 0.5 + k * (p - 0.5);
  const api = { SHRINK, shrink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WinK = api;
})(typeof self !== 'undefined' ? self : this);
