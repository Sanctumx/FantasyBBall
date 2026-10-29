# #144 Early-season availability for the Team tab forecast (design)

Designed by the analyst 2026-10-29; gates fixed here before any result. Decision D1 (assumed, the user can overrule): the games-played rate applies to the **Total and Mix** availability bases only; Per game keeps its meaning ("peak non-injury", `team_core.js:15`) and is not redefined.

## Question

The harness stands in for the real Fantrax IR slot with a 14-day rule: no daily row in days 7*w0-14..7*w0-1 means 0 forecast games (`calib_ros.js:9,72-74`). Early in the season that rule is crude (week 2 has 7 days of data). The app's own rule is `team_core.js:13` (counted slots) and `:17-21` (`avail`): on Per game availability is 1 and an IL-slot player gets 0 games; on Total it is min(1, g/82); Mix is halfway. Does a shrunk games-played rate beat both on early checkpoints?

Candidate for `avail()`: `a = (gp + n0 * min(1, g/82)) / (tg + n0)`, gp = `pp.actual.gp` (`inseason_players.js:57`), tg = the player's NBA team games so far, n0 fitted.

## Design

`node --max-old-space-size=4096 calib_ros.js 20 2025-26,2024-25,2023-24,2022-23 81 avail` (seeds 81-100; 1-80 used, #146 used none). New mode `avail` built like `blend` / `kwl`.

- Checkpoints CKS = [1, 2, 3, 7, 11, 15] = starts of weeks 2, 3, 4, 8, 12, 16.
- Seasons: 2025-26, 2024-25, 2023-24 primary, leave-one-season-out; 2022-23 sign check only.
- Arms (whole games x availability, each with its own fitted k): **W** control (the stand-in, i.e. Per game); **G0** g/82 for everyone, no stand-in (Total); **R** candidate: shrunk rate, no stand-in; **RIL** printed only (R with the stand-in kept); **R0** printed only (raw rate, n0 = 0).
- gp counts daily rows with day <= 7*w0-1 (all rows have minutes > 0, so a DNP is never counted). Check first that week w covers days 7w..7w+6 against `bt_sched`.
- n0 fit: player level, grid 0-82, target = games played after the checkpoint / team games after it, weighted by team games, nested (`calib_kwl.js` nestedPool) so the n0 used for a held-out season never sees it.
- k per arm fitted on the training seasons over all checkpoints; also print Brier at an early-only k and at the shipped .60 / .75.
- SE: `S.diffSE` (`calib_ros_stats.js`), paired, the larger of the outcome-week and draft-seed bootstraps.

## Gates

- **A1** (early, Per game only, matters only if the user redefines Per game): R beats W on held-out matchup Brier by >= 2 SE, pooled over weeks 2/3/4, in each primary season; category d <= 0 in each.
- **A2** (early, Total basis, the gate that changes `avail()`): R beats G0 by >= 1 SE, weeks 2/3/4, in each primary season.
- **A3** (no harm): at weeks 8/12/16 pooled, R minus W and R minus G0 is below +1 SE in each season, matchup and category.
- **A4** (calibration): at the early checkpoints R's held-out matchup slope is no further from 1 than W's, and its reliability bins pass (`binsOk`, |p - obs| <= .05 for bins with n >= 200).
- **A5** (confirm): 2022-23 d < 0 early using k from the 3 primary seasons; and the live replay (`calib_live.js`: add arm A-rate with real IR slots and moves, Total basis, add period 3 to CHECKPOINTS) needs d <= 0 at periods 2-4 (sign test only, wide SE).
- Printed, not gated: per-checkpoint d, RIL vs R, R0 vs R, player-level RMSE of rest-of-season availability (stand-in vs raw vs shrunk), fitted n0, number of traded players whose tg is slightly wrong.

## What each result means

- A2, A3, A4, A5 all pass: ship the rate in `avail()` on Total / Mix only (a change to what the Team tab shows; not a Model pick change, so prize equity is not the metric). Needs the user's word.
- Anything fails: record Rejected with the numbers; the effect is expected to be tiny (#150's g/82 effect was about .0017), so read per season, not pooled.

## Risks

Harness stand-in vs real IR slots (the live arm is the faithful check); frozen rosters inflate the stand-in's error; week-2 noise (R0 is expected to lose there); k drift .34 at week 4 to .68 at week 16 means a pooled k mis-shrinks early checkpoints for every arm (hence the early-only k print).
