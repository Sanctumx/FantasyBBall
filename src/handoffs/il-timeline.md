# il-timeline

State (2026-10-29): branch `il-timeline` stacked on `fix-roster-rep` (worktree `C:/Users/Fefe/Documents/FantasyBBall-iltimeline`), UNPUSHED, no reviewer pass. 519 unit tests pass. Not checked on the real league yet.

Done (user decisions 2026-10-29, planner design): the IL pairs are gone. An IL player is out for the first `nOut` games of his team's window, then plays at the league-wide typical availability (`Team.ilReturn`, `Team.typicalAvail`); his total stays avail x GL. His projected games carry both the current absence and the generic chance of missing games later, so only the part above a typical player's goes up front. `tabPlays` makes one `rosterGames` call over Active + IL (best value first), so the cover plays until the return and the worst player then loses nights. When active + IL exceed `maxPlayers` the Reserve players go first, then the lowest-value counted players are dropped from the first return on. `ilPairs`, `full`, `grp`/`nextRef` and the `wt` field are removed. Vs replacement: the replacement is the lowest counted non-IL player who plays (`moduleSetup`). Vs average: `avgOwn` gives the average player the games the slot allows (soloGames x share), as a candidate gets (reverses #138's "keeps his games").

Deviation from the agreed plan (D2): no outside free-agent stand-in was built; a 0% player is simply never the replacement, so he reads below 0. Ask the user if the stand-in is still wanted.

Hazards for other branches: every seasonal Team-tab / Rankings Win number with an IL player changes, as do the Trade Analyzer, trade finder, `calib_live` and #163 on `inseason-pe` (`ipe_trade_core.js` calls `TeamWin.leagueWin`): re-run or pin #163 after this merges. Model pick / backtests are untouched (`engine.js`, `backtest.js`, `bt_real.js`, `stream_sim.js` do not import `team_core` / `team_win`).

Not done: check on the real league (Murray/Champagnie via `pw-tools` diag); help text still says "worst counted player" (team.html 161,167,168,236,523; rankings.html 96,333); rebuild the pages (`node .claude/scripts/build.mjs`); browser checks; reviewer; a ledger row for return dates (no source yet).

Next: 1. Real-league check. 2. Build + browser checks. 3. Reviewer (effort high). 4. On "push": push, PR (after fix-roster-rep's).
