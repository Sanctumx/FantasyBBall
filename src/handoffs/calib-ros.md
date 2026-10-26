# calib-ros (#139 rest-of-season shrink; follow-ups on calibration)

Branch `calib-ros`, worktree `../FantasyBBall-calib` (made 2026-10-26). Local only, not pushed, not merged. Ask the user before pushing.

## State

#139 done on the branch: Win M / Win C on the Team tab are shrunk toward 50% by `TeamWin.SHRINK` 0.6 / 0.75, and the Trade Analyzer uses the same k (`matchup_core`); the Matchup Analyzer keeps its weekly .83/.85 (user, 2026-10-26: seasonal k for seasonal tabs, weekly k for the weekly one). The backtest (20 seeds, 3 seasons, leave-one-season-out) supports about 0.43 match / 0.65 category, so 0.6 / 0.75 is a guess that the live app is less overconfident; live tracking decides. Scripts: `calib_ros.js`, `calib_ros_k.js` (9 s each, run in the main session). Raw outputs saved in `C:\Users\Fefe\Documents\courtside-backtest\saved-2026-10-26\calib-ros\`.

**Merged with origin/main 2026-10-26 (after points PR 2, #36):** `team_win.js` took both sides. `engCtxFrom(lines, N, R, nc, w)` takes the point values and wraps `Points.engineView`; `matrixOf` in points mode returns the single-total chance NOT shrunk (the k was fitted on categories; calibrating points Win M is #143). The points test for one stat now compares with the unshrunk category matrix. `category_golden.json` was regenerated: with `SHRINK` at 1 the new output equalled the old golden exactly, so only the shrink moved it. 361 unit tests pass, pages rebuilt.

## Records

In the ledger worktree (commit c447469, committed, NOT landed): the #139 row (Adopted, provisional k), archive entry 139, and the follow-ups renumbered #144 (early-season availability), #145 (season-so-far blend, k by weeks played), #146 (moving rosters, live tracking). Land with `node .claude/scripts/ledger.mjs land` only on the user's "push".

## Review (done 2026-10-26, effort high)

Must-fix fixed: the new k also hit the Matchup Analyzer's future weeks. `matchup_core` keeps `K_MATCH / K_CAT` 0.72 / 0.82 for later weeks; new `KR_MATCH / KR_CAT` 0.6 / 0.75 apply only when `scoreSegments(..., whole, ros)` gets `ros` (the Trade Analyzer's `rosWinM`). Tests added / updated in `matchup_core.test.js` and `trade_core.test.js`. Team help text now says points leagues are not shrunk. 362 unit tests, Team and Matchup browser checks pass, pages rebuilt. Merge resolution in `team_win.js` judged correct; the shrink never reorders the Team list.

Open from the review (not fixed, decide with the user):
- Trade Analyzer: future weeks now use 0.6 instead of 0.72 while the current week keeps 0.83, so `dA + dB` is not a uniform rescale and trade order can change; `likelihood` uses `TRADE_W.winM * dB` (0.1 set on the old scale), so likelihoods shift. The 0.6 / 0.75 was fitted on the Team tab forecaster, not on `pairMatchup`; check `results[season].k.PM` in `calib_ros.json` before saying the Trade Analyzer "uses the same k".
- `calib_ros_k.js:41-43`: the SE takes the larger of two one-way cluster bootstraps, so it understates the two-way SE; the 2 SE gates are slightly lenient (does not change the shipped k).
- `team_win.test.js` "engCtxFrom / evalVecs" test is loose (0.02); low priority.

## Next

1. Decision (user, 2026-10-26): the Trade Analyzer should run Engine.evaluate (through TeamWin), not pairMatchup, and Team, Rankings and Trade should share one k (TeamWin.SHRINK, display only). Draft only after a preseason check and never where the Model pick reads. Recorded as ledger #147 (Open, in the ledger worktree). Until that lands the interim KR split in matchup_core stands. Plan it with the planner (hard area; analyst for the check).
2. Rankings Vs average (D2) must use `TeamWin` so it inherits the k (see `team-tab-next.md`).
3. On "push": push, PR, merge only on the user's word, then `ledger.mjs land` (ledger commit c447469 holds the #139 row, archive entry and #144-#146).
