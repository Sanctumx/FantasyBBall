# tests-subfolders (#148)

Branch `tests-subfolders` from origin/main (2026-10-27), worktree `FantasyBBall-tests`. One commit (3784a8b), reviewed clean, not pushed.

## State

- `src/tests/*.test.js` moved into subfolders: engine, league, team, collect, tooling (moves only, no logic changes).
- Records (IDEAS row, archive entry, handoff) are in the ledger worktree, commit 437edf3, not yet landed on main.

## Next

1. Ask the user to push, then open the PR; merge only on their word.
2. After merge: `node .claude/scripts/ledger.mjs land`, remove the worktree and the local branch.
