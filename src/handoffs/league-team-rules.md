# league-team-rules

State (2026-10-29): League tab on the Team-tab rules is BUILT, reviewed, the reviewer's seven fixes are made, origin/main merged in (f8f44eb), 543 unit tests pass, pushed with a PR. Worktree `C:/Users/Fefe/Documents/FantasyBBall-leaguerules`. Design: `docs/superpowers/specs/2026-10-29-league-tab-team-rules-design.md`.

What changed for the user: League numbers now come from the Team tab's code per team (shrunk toward 50%, IL counted on Total, Plays % lineups, no average-pick filler); Source select (default Projections Average) and Zscore type on the League tab; H2H / most / Roto standings derived from the new win numbers. `computeLeague` stays for the engine golden only.

Review fixes done: no-weeks message stays (`held` flag in league.html), no compute/memo while box-score files load, teams missing from rosters left out, "This league has no teams yet.", load messages no longer wiped, How-it-works paragraph rewritten (src/app.html), tests added (permuted ids, exact Total line, browser: w14 differs, no weeks, empty league, missing team).

Merge note: the Team golden (`category_golden.json`) was regenerated after merging main (only the `team` part differs from main; Rankings part identical). `inseason-pe` has Team-tab Plays % commits touching `tabPlays`/`team.html`; rebase whichever lands second, rerun the Team golden.

Known: `team_page.mjs` fails a drag-and-drop check (`slotOf` on `06cch`) before this branch too. `league_sort.mjs` / `league_how.mjs` hardcode :8765. `league_mock.mjs` is unused (delete when the user allows).

Next:
1. Ask the user whether League gets its own How-it-works dialog (currently shared text).
2. On "merge": merge commit, then delete the local branch; delete stale merged branches `team-tab-ztype`, `fix-il-slot-share` with the user's say-so.
3. Separate: Rankings bug report (own players on top of Rankings) not investigated; see git log `fd41031`; own branch from main with systematic-debugging.
