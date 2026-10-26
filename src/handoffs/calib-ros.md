# calib-ros (#139 rest-of-season shrink; follow-ups on calibration)

Branch `calib-ros`, worktree `../FantasyBBall-calib` (made 2026-10-26). Local only, not pushed, not merged. Ask the user before pushing.

## State

#139 done on the branch: Win M / Win C on the Team tab are shrunk toward 50% by `TeamWin.SHRINK` 0.6 / 0.75, and the Trade Analyzer uses the same k (`matchup_core`); the Matchup Analyzer keeps its weekly .83/.85 (user, 2026-10-26: seasonal k for seasonal tabs, weekly k for the weekly one). The backtest (20 seeds, 3 seasons, leave-one-season-out) supports about 0.43 match / 0.65 category, so 0.6 / 0.75 is a guess that the live app is less overconfident; live tracking decides. Scripts: `calib_ros.js`, `calib_ros_k.js` (9 s each, run in the main session). Raw outputs saved in `C:\Users\Fefe\Documents\courtside-backtest\saved-2026-10-26\calib-ros\`.

**Merged with origin/main 2026-10-26 (after points PR 2, #36):** `team_win.js` took both sides. `engCtxFrom(lines, N, R, nc, w)` takes the point values and wraps `Points.engineView`; `matrixOf` in points mode returns the single-total chance NOT shrunk (the k was fitted on categories; calibrating points Win M is #143). The points test for one stat now compares with the unshrunk category matrix. `category_golden.json` was regenerated: with `SHRINK` at 1 the new output equalled the old golden exactly, so only the shrink moved it. 361 unit tests pass, pages rebuilt.

## Records still to land (ledger)

The branch's edits to `IDEAS.md`, the archive and `SESSION_HANDOFF.md` were dropped in the merge (those files change only through the ledger worktree). Still to add there: the #139 row (status "Adopted (provisional k)", deciding numbers from `results_calib_ros_k.txt`), archive entry 139, and three Open follow-up rows. Main already uses #142 (faster tab swaps) and #143 (points Win M calibration), so take the next free numbers (`node .claude/scripts/ledger.mjs next`):
- early-season availability for the Team tab forecast (replace the 14-day "no game = IL" stand-in with each player's games-played rate; checkpoints at weeks 2 and 3). Gate: Brier better by >= 2 SE early without hurting weeks 8-16.
- season-so-far blend into projections (n0 per stat family), then k by weeks played, then projection-error variance in place of k.
- moving rosters in `calib_ros`; live tracking of Team tab predictions vs results after ~6 weeks (decides whether the live k sits above the backtest k).
Old text: `git show 18285d0:src/IDEAS.md` and `:src/HANDOFF_ARCHIVE.md`.

## Next

1. Browser check of the Team page (`team_page.mjs` on :8767), then the `reviewer` (effort high: Team numbers), fixes test-first.
2. Records in the ledger worktree (above).
3. Rankings Vs average (D2) must use `TeamWin` so it inherits the k (see `team-tab-next.md`).
4. On "push": push, PR, merge only on the user's word, then `ledger.mjs land`.
