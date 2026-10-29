# fix-rep-il

State (2026-10-29): Win M "Vs replacement" on the Team tab / Rankings with a team, Season (Total/Mix) basis. Branch `fix-rep-il` from origin/main (includes PR #58), worktree `C:/Users/Fefe/Documents/FantasyBBall-reprep`, committed locally, UNPUSHED, no reviewer pass yet. 512 unit tests pass; not checked in a browser.

Bug: with full Active slots the IL player shares the worst Active player's slot (PR #58), so his own contribution is tiny and `moduleSetup` picked him as the "worst" counted player. Own players were then scored as their full contribution minus ~0, candidates as a swap into the IL slot, so own players sat far above everyone else (Rankings screenshot: Maxey +9.7 Win M above Jokic +7.6).

Fix (user's design, 2026-10-29): the k IL players pair with the k worst Active players (`Team.ilPairs`, the same pairing `tabPlays` uses, ordered by `Matchup.nightValue`). Each pair is one fictional player, so entries = the N-k other counted players + k pairs (a pair's contribution = team minus team without both). Replacement level = the lowest entry (usually the (N-k)th real player, unless a pair is lowest). Own players outside it: contribution minus the replacement's. A candidate replaces the whole entry (`su.grp`, `swapScore`). Members of a pair that is the replacement: scored against the next lowest entry (`su.nextRef`). A single real replacement shows 0 as before. Per game, plain ctx, Matchup Analyzer (never sets `teamTab`; IL stays 0 there until return dates exist, user) and an IL player with open Active slots are unchanged.

Files: `src/team_core.js` (`ilPairs`, `tabPlays` uses it), `src/team_win.js` (`moduleSetup`, `swapScore`, `moduleRow`), tests in `team_win.test.js` (new pair test, two swaps use `su.grp`) and `team_view.test.js` (apply test). Pages rebuilt.

Open: several IL players wrap onto the same Active player when IL > Active (edge, untested). Not yet checked: the Trade Analyzer / Trade finder on Season rules use `tabView` but not `moduleSetup` rep (verify none depends on `su.worst` being a single key). Run `src/tests/browser/team_page.mjs` and `rankings_team_parity.mjs` (need Playwright).

Next: 1. Reviewer subagent on the branch diff (hard area, effort high). 2. Browser checks above and look at Rankings sorted by Win M with a team loaded. 3. On the user's "push": push, PR (say Win M numbers on Team/Rankings change). No ledger row: bug fix; add one in the ledger worktree if the user wants it recorded.
