# team-list-owner

State (2026-11-02): branch off main after PR #72 (inseason-pe) merged; main folder is on this branch. Not pushed.

Done: `TV.moduleView` (src/team_view.js) now labels and filters a player I swapped out under the team that receives him in the previewed trade (`TeamWin.received`), not "Sent out"/Free agents. A pure drop with nobody coming in still shows "Sent out". Test in src/tests/team/team_view.test.js; built pages committed (e6c1eca). Added (uncommitted at the time of this note) a Team-tab-context test in src/tests/team/team_win.test.js: with `teamTab: true` and `tabState`, a chips swap puts my player on the opponent's side and the opponent's match chance differs from the "he just lost a player" case.

Open, not reproduced: user reports that on the Team tab, swapping Trae Young for Scottie Barnes (Send out + Bring in chips, then Apply) inflates Win M because the opponent loses Barnes and my Young "goes FA". By the code and tests the swap pairs correctly (`applySwap` records `state.moves`, `TeamWin.trade` hands the player over, `TV.apply` keeps the record). Only a send-out and a bring-in done as separate steps skip the pairing (`applySwap` records a move only when both lists are non-empty), but the user did both chips then Apply. Ideas to check with the real league: Young or Barnes on IR/injured (IL slot handling in `trade` and `oppState`), Barnes' owner missing from `ctx.roster`, a non-Average Source (`TeamView.sourceCtx` rebuilds ctx), the 2-slot/limit logic in `TV.apply` (max), and the Win M "Change" column of the list (`moduleRow`) vs the Old vs New cards. Reproduce in the browser on the user's league before changing the engine side (Team-tab numbers, not the Model pick).

Known: `src/tests/team/trade_weeks.test.js` "about 2 ms per trade" fails under load in the full run (4.3-4.7 ms), passes alone. The Playwright `team_page.mjs` crashes at "dropping a list row on a group header" (`select.slot[data-key]` missing), also on origin/main: not caused by this branch, not logged in the ledger. Port 8765 may be held by another session's `serve-local.mjs`; run browser checks on another port (copy the test, change the port).

Next:
1. Ask the user for the repro details (is Young on IL? which Source? what does the list show for each?) or reproduce on their league; fix with a test that fails first.
2. Land the Team-tab context test (commit), then push and merge only on the user's word.
3. Log the Team drag-test failure in the ledger (ledger worktree).
