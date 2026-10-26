# team-d3-swap (Team tab D3, step 1 of `team-tab-next.md`)

Branch `team-d3-swap` from origin/main, commit 35c62d3, not pushed, not reviewed. 330 unit tests and `team_page.mjs` pass.

## Done 2026-10-26

D3: in a previewed trade a candidate from an opponent leaves that team and the team receives the player I send out.
- `src/team_core.js`: `state.moves` records each swap `{ out, in }` (`initState` starts it empty, `moveSlot` keeps it, `applySwap` adds one only when both sides are non-empty).
- `src/team_win.js`: `received(ctx, state)` -> `{ teamId: [{ key, slot }] }`. One opponent among the incoming players gets every outgoing one (first fill the vacated slots in order, the rest go to the reserve); incoming players from several opponents pair with outgoing ones in order, extras go to nobody. Free agents send nothing, a vacated IL slot becomes reserve, a player back on my roster is not received. `oppState` / `oppTeam` take it (cache key includes the received keys); `matrix` passes it and widens `exclude`.
- Applies to typed / dragged swaps and to the 'rep' list's worst-player swap (`swapScore`, no code change). **Vs average is unchanged** (user: it is only a different way to measure a player's Win M; candidate leaves, nothing goes back).
- Decisions taken from the planner's defaults, not asked: several opponents in one Apply pair in chip order; one opponent plus free agents sends all outgoing players to that opponent; IL slot -> opponent's reserve.
- How it works text on the Team tab has the new sentence; pages rebuilt (7 asset files showed line-ending noise only, reverted).
- No browser assertion for the opponent row (fixtures can't pick a rostered opponent player reliably); unit tests cover it.

## Next

1. `reviewer` on the branch diff (hard-ish area: wrong numbers don't crash; give it effort high), fix findings test-first.
2. Then `team-tab-next.md` step 2: Rankings Vs average from the same TeamWin code when a league is loaded (D2); step 3: per-game / season toggle and auto-fill top 12; step 4 browser check, PR (push only when the user says).
3. Ledger: no IDEAS row exists for the Team tab (131/138 are feature numbers); add one through the ledger worktree if wanted. The ledger worktree has an unlanded commit 523cf1e (#142 recorded as released); landing is a push.

## Housekeeping

- `git stash` still holds "stale handoff note (pre-merge)" from `yahoo-points-137`.
- Shift+Tab "accept edits" doesn't auto-approve Bash; allow rules in `.claude/settings.json` do. The user may name commands to add.
