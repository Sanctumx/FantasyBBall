# yahoo-points-137 (#137 points leagues)

Branch `yahoo-points-137`, worktree `../FantasyBBall-137`. Seeded 2026-10-26 from main's old handoff; the branch's own session should replace this file with its notes.

## State

**Points leagues (#137 part 1): PR 1 is open as https://github.com/Sanctumx/FantasyBBall/pull/30 (branch `yahoo-points-137`, worktree `C:\Users\Fefe\Documents\FantasyBBall-137`), waiting for the user to say merge; it has main merged in (rebase kept conflicting on the docs).** Built: point values in the league store, Settings Points option with a box per stat, scoring and point values kept per saved league and restored on Load (user, 2026-10-26), "not supported yet" notes on Draft, League, Matchup, Trade, Team and Rankings that follow a scoring change from another tab. Reviewer (effort high) found nothing must-fix; its should-fix items are done. 278 unit tests and every browser check pass (the Rankings speed check is timing-flaky). Spec and plan: `docs/superpowers/specs/2026-10-26-points-leagues-design.md`, `docs/superpowers/plans/2026-10-26-points-leagues.md`; archive 137. Decisions: (2) and (3) the user didn't follow the question, so the plan's recommendations stand (stated in the PR text; PR 2 combines projection error with the measured stat correlations); (4) ship without the Win M calibration; (5) do not hide Rankings Basis "Mix", handle it in points mode in PR 2. **Next: once PR 1 is merged (only on the user's word), start PR 2 (Tasks 5-13: Rankings and Team in points) from a new branch off origin/main; the Team tab is already on main. Second server for browser checks: `python -m http.server 8767` in a worktree, tests with 8765 replaced by sed (not PowerShell, it mangles characters), Playwright in an earlier session scratchpad `pw/`.** Yahoo link (#137 part 2) waits for Yahoo to approve an API app: the user applied 2026-10-26 (read-only, personal use, may open to friends later; client ID and secret go in Worker secrets, never the repo).

## Next

Once PR 1 is merged (only on the user's word), start PR 2 (Tasks 5-13: Rankings and Team in points) from a new branch off origin/main.
