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

## #147 built (2026-10-26, same branch)

Decisions (user, 2026-10-26): opponents weighted equally (not by schedule) until playoff odds are in; IL players left out of a trade as on the Team tab; `TRADE_W.winM` rescaled by the measured factor.
- `src/win_k.js` holds the one `SHRINK` 0.6 / 0.75 (`TeamWin.SHRINK` is the same object); bundled in Team, Rankings and In-season (`gen.py`).
- `TeamWin.leagueWin(ctx, R, opts)` = one `Engine.evaluate` over all N team forecasts (`tradeState` puts an incoming player in the slot the outgoing one left, Active first; IL counts for nothing). Trade `rosWinM` / `evaluateTrade(ctx, trade, opts)` read it: `{ mean, opps: [{ opp, p }] }` (was `periods`); dA, dB are exactly k times the unshrunk values; KR_* and the `ros` argument are gone from `matchup_core` (the Matchup Analyzer keeps its weekly k).
- Rankings: `winStart(..., { shrink })` scales Win C by k.cat and Win M by k.match (categories only; order and Edge unchanged); `rankings.html` passes `WinK.SHRINK`.
- `winM` 0.1 -> 0.07: old (origin/main) dB = 0.672 x new dB over the 2145 one-for-one candidates (scratch `fit_winm.js`). New dB is more spread (sd 4.5 vs 3.4); rank correlation of dA old vs new 0.94, but only 8 of the top 25 by dA x likelihood are shared. The likelihood guard test cap went 60% -> 70% (a win-win offer sits at 68%). `CAND_VER` v3 drops saved candidates.
- Not done: the Trade page still scores 9 categories (no `cats` / `points` passed); Draft tab and Model pick untouched (needs a preseason check and a paired backtest with the analyst). Browser `rankings_page.mjs` "projections list all 302 players" fails on main too (303 players now), unrelated.
- Hazard: when D2 (Rankings Vs average through TeamWin, team-tab-next) lands its league path must not also take `o.shrink` (double shrink).

## Review of #147 (done 2026-10-26, effort high; nothing fixed yet)

Fine: memo and cache keys, pairwise chances, Rankings k scale, bundle order, speed (~0.7 s per give), engine / Draft / golden untouched.
- **MUST, needs the user's decision:** IL players dominate the trade finder. `tradeState` (`team_win.js`) counts an IL player for nothing, but `tradeCandidates` still offers my IL players as gives, so giving one costs 0 Win M while the other team sees his full value: 24 of the top 25 rows give an IL player (main: 13), top likelihood 84% (the 70% cap in `trade_finder.test.js` only holds because that test searches `roster.slice(0,4)`). Options: (a) count a traded IL player as reserve with his Plays % games; (b) drop IL players from the finder's gives and targets. Add a test that searches every give.
- **MUST:** help text is stale: `src/app.html:352` and `src/team.html:152` still say Trade Win M averages the real matchups and differs from the Team tab; `src/app.html:354/358` (Rankings help) don't say the Win columns are shrunk.
- **Should:** `tradeState` gives freed slots in `fids` order but the `leagueWin` memo key sorts fids, so a 2-for-2 in a different order can reuse the wrong slots: sort the incoming players first. An IL-for-healthy swap grows the counted roster by one (reserve). Revisit the 70% cap after the IL fix (back to 60% if it fits).

## #147 review fixes (done 2026-10-26, committed, not pushed; 405 unit tests pass, pages rebuilt)

The user dropped option (a) for a stronger rule: **an IL player counts as healthy** (Hashtag projected games already include the time he misses). Done:
- `tradeState` (`team_win.js`): IL players (kept or incoming) take Active slots with their projected games, the Reserve refills the rest; incoming players are sorted so slots do not depend on `fids` order. Applies to every team in `leagueWin`.
- `perceived` (`trade_core.js`): an IL player's season value = g games of his line + (82 - g) games of his owner's worst non-IL player (`InPlayers.valueZFill`); healthy players unchanged. The top-25 list no longer fills with IL targets (likelihood 34-48%).
- Stale help text fixed (`app.html`, `team.html`). `trade_finder.test.js` likelihood test now searches every give with the cap test median < 50%, max < 70% (the old median < 30% only held on the first four gives; with IL included it still passes).
- Team tab NOT changed: `matrix`, `oppState`, `playerWin` still leave IL out (idea #149, in the ledger, Open). So `leagueWin` equals `matrix` only without IL players (the test builds a ctx with IL set to reserve).

## Next

1. Wait for the user's "merge"/"push": push, PR, merge, then `ledger.mjs land` (ledger holds the #139 row, archive 139, #144-#146, #149; update the #147 row to Partly done: Trade and Rankings built, IL counted as healthy, Draft open). Run the browser checks (Team, Matchup, Trade) before the PR; `rankings_page.mjs` fails on main too (302 vs 303 players).
2. Rankings Vs average (D2) must use `TeamWin` so it inherits the k (see `team-tab-next.md`); do not shrink twice.
