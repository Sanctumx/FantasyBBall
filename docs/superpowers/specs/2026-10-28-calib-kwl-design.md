# #156 k by weeks left, nested n0, longer windows, 2022-23 fold (design)

Approved by the user 2026-10-28 (checkpoints every 2 weeks, 2022-23 confirmation only, probit form printed only). Gates are fixed here before any result.

## Question

#145 showed the STD blend lines beat preseason lines held-out, but the fitted Win shrink k still climbs with checkpoint (pooled k_M .45/.45/.50/.59 at weeks 4/8/12/16; E-ROS-k .39-.52). Working hypothesis: the model's variance is fixed while the uncertainty it should carry shrinks with weeks left, so k is a function of weeks left. #145 also leaked: a training season's k used its own held-out n0. And the STD vs last-30-days result (rule I) leaves open longer windows (60, 90 days).

## Design

`node calib_ros.js 20 2025-26,2024-25,2023-24,2022-23 61 kwl` (seeds 61-80; 1-20 #139, 21-40 #150, 41-60 #145). Frozen rosters, whole games, as in #145.

- Checkpoints: the start of every second week, 2, 4, ..., 22 (days 14-154 in 0-based week starts; 11 checkpoints, 24 down to 4 weeks left). Week 24 has too few outcome weeks for the week bootstrap.
- Line sources: W (preseason), STD, L30, L60, L90. Each window gets its own fitted n0.
- Nested n0: for held-out season T, a training season A is forecast with the n0 fitted on the seasons other than A and T. 2022-23 is in every n0 pool and in no primary k fit (its lines are weaker: 95 of 260 players keep the prior-season line, so it is a sign check only).
- Forms of k, with t = days played / 175:
  - K0 one constant (control);
  - K1 k = a + b t (2x2 least squares on the same objective as `fitK`);
  - Kck one k per checkpoint (the overfit ceiling);
  - P1 probit shrink Phi(Phi^-1(p) (a + b t)), printed only, not gated.
- Scored leave-one-season-out on the 3 primary seasons, for matchup k_M and category k_C, on W and on the window M picks.
- Diagnostic: k by lag (outcome week minus checkpoint), to separate "nearer weeks are easier" from "lines hold more data".

## Gates (SE is the larger of the week and seed bootstraps, paired)

- **K** (k by weeks left works), judged on the window M picks; all must hold: K1 beats K0 on held-out matchup Brier by >= 1 SE in each of the 3 folds; b > 0 and >= 2 SE in every training fold; in at least 2 of 3 held-out seasons the spread of per-checkpoint k* / predicted k is smaller under K1 than K0; on 2022-23, d < 0 using k fitted on the 3 primary seasons. K_C is the same test for k_C.
- **L** (shape): Kck is chosen over K1 only if it beats K1 by >= 2 SE in every fold.
- **M** (window): each of L30/L60/L90 vs STD only at checkpoints where they differ. A window replaces STD only if >= 1 SE better on held-out matchup Brier in all 3 seasons and has lower player counting loss there; if several pass, the best pooled d wins; otherwise STD.
- **O** (#157, k by lag; fixed 2026-10-28 after the #156 result, before the re-run; same seeds 61-80, judged on the window M picks, matchup): forms fitted on the training seasons from cell sums per (outcome week, checkpoint, seed) (`src/calib_lag.js`): K0 one k, K1 a + b t, KL one k per lag bucket (0-1 / 2-3 / 4-7 / 8-11 / 12+), KLt KL + b t, KLs a + b ln(1 + lag) (printed only). Adopt k(lag) only if the t term of KLt has |b| < 2 SE in every training fold AND KL beats K1 by >= 1 SE on held-out matchup Brier in every fold; the 2022-23 KL vs K1 d < 0 is reported apart and the shipping decision still waits on fresh seeds after #146. If the SE of b is over twice K1's the line says "b unidentified" (lag and t are collinear: the 12+ bucket exists only at early checkpoints).
- **P** (printed, not gated): lag 0-1 k per season, held-out. The Team tab's Win M is this week's matchup, so this is the k it needs (shipped 0.60, #156 pooled .74-.80).
- **N** (level): if the in-sample a at mid-season varies across seasons by more than .10, the k level is flagged uncertain and is the user's call whatever K says.

## What each result means

- K pass: candidate k(t) = a + b t in `win_k.js`, pooled over the 3 seasons. The STD version ships only with a blend-lines decision and after #146 (moving rosters). The W (preseason lines) version could ship alone (user call).
- K fails but b significant: the climb is real, too small to change Brier; keep one k.
- b not significant: close #156 as No.

## Build

Tests first: `calib_blend.test.js` (window L60/L90, per-window sums), `calib_ros_stats.test.js` (`fitKLin`, per-checkpoint k table, `kLinSE`), new `calib_kwl.test.js` (fold plan never lets n0 see A or T; 2022-23 never in a primary k fit; P1 a=1 b=0 is identity). Then `calib_blend.js`, `calib_ros_stats.js`, new `calib_kwl.js`, `calib_ros.js` kwl mode, `PSRC['2022-23']='hs'`, `run_calib_kwl.bat` (one updating ETA line, auto-close, no pause; output `results_calib_kwl.txt`, `calib_kwl.json`). `win_k.js` changes only after the gates pass and the user approves.

## Risks

A k off by .07 costs about .0002 Brier (near the SE); season scatter in k (.37-.60) is larger than the climb; frozen rosters make far weeks look worse than in the app (the lag diagnostic shows how much); three window comparisons (guard: all-seasons rule).
