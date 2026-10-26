# calib-ros (#139 rest-of-season shrink; follow-ups on calibration)

Branch `calib-ros`, worktree `../FantasyBBall-calib` (made 2026-10-26). Local only, not pushed, not merged. Ask the user before pushing.

## State

#139 done on the branch: Win M / Win C on the Team tab are shrunk toward 50% by `TeamWin.SHRINK` 0.6 / 0.75, and the Trade Analyzer uses the same k (`matchup_core`); the Matchup Analyzer keeps its weekly .83/.85 (user, 2026-10-26: seasonal k for seasonal tabs, weekly k for the weekly one). The backtest (20 seeds, 3 seasons, leave-one-season-out) supports about 0.43 match / 0.65 category, so 0.6 / 0.75 is a guess that the live app is less overconfident; live tracking decides. Scripts: `calib_ros.js`, `calib_ros_k.js` (9 s each, run in the main session). Raw outputs saved in `C:\Users\Fefe\Documents\courtside-backtest\saved-2026-10-26\calib-ros\`.

**Merged with origin/main 2026-10-26 (after points PR 2, #36):** `team_win.js` took both sides. `engCtxFrom(lines, N, R, nc, w)` takes the point values and wraps `Points.engineView`; `matrixOf` in points mode returns the single-total chance NOT shrunk (the k was fitted on categories; calibrating points Win M is #143). The points test for one stat now compares with the unshrunk category matrix. `category_golden.json` was regenerated: with `SHRINK` at 1 the new output equalled the old golden exactly, so only the shrink moved it. 361 unit tests pass, pages rebuilt.

## Records

In the ledger worktree (commit c447469, committed, NOT landed): the #139 row (Adopted, provisional k), archive entry 139, and the follow-ups renumbered #144 (early-season availability), #145 (season-so-far blend, k by weeks played), #146 (moving rosters, live tracking). Land with `node .claude/scripts/ledger.mjs land` only on the user's "push".

## Next

1. Team browser check passed (merged state, :8767). Reviewer (effort high, Team numbers) was dispatched; get its result (re-dispatch if the chat was cleared first).
2. Reviewer result is pending (agent running when this was written); fix findings test-first, amend the ledger if the story changes.
3. Rankings Vs average (D2) must use `TeamWin` so it inherits the k (see `team-tab-next.md`).
4. On "push": push, PR, merge only on the user's word, then `ledger.mjs land`.
