# calib-ros (#139 rest-of-season shrink; follow-ups #142-#144 calibration)

Branch `calib-ros`: 7 commits (head 18285d0), **local only, not pushed, not merged**. Ask the user before pushing. Its worktree was removed 2026-10-26; the branch is intact.

## State

#139 done on the branch: Win M / Win C on the Team tab are shrunk toward 50% by `TeamWin.SHRINK` 0.6 / 0.75 (commit 9e43c5a), and the Trade Analyzer uses the same k (`matchup_core`); the Matchup Analyzer keeps its weekly .83/.85 (user, 2026-10-26: seasonal k for seasonal tabs, weekly k for the weekly one). The backtest (20 seeds, 3 seasons, leave-one-season-out) supports about 0.45 / 0.65, so 0.6 / 0.75 is a guess that the live app is less overconfident; live tracking decides (#144). Scripts: `calib_ros.js`, `calib_ros_k.js` (9 s each, run in the main session). Raw outputs saved in `C:\Users\Fefe\Documents\courtside-backtest\saved-2026-10-26\calib-ros\`.

## Further shrink calibration (still to do, user reminder 2026-10-26)

IDEAS.md rows on this branch only (they reach main when it merges):
- **#142** early-season availability for the Team tab forecast (replace the 14-day "no game = IL" stand-in with each player's games-played rate; checkpoints at weeks 2 and 3). Gate: Brier better by >= 2 SE early without hurting weeks 8-16.
- **#143** season-so-far blend into projections (n0 per stat family), then k by weeks played, then projection-error variance in place of k.
- **#144** moving rosters in `calib_ros`; live tracking of Team tab predictions vs results after ~6 weeks (decides whether the live k sits above the backtest k).

**Number collision:** `fx-cache-assets` uses #142 for "tab speed". One side needs renumbering before both merge (the calibration rows are the later ones: make them the next free numbers).

## Next

1. Push (ask the user) and open the PR; reviewer pass first. 2. Rankings Vs average (D2) must use `TeamWin` so it inherits the k (see `team-tab-next.md`). 3. Then #142-#144.

On resume: `git checkout $(git merge-base HEAD origin/main) -- src/SESSION_HANDOFF.md`, then merge origin/main.
