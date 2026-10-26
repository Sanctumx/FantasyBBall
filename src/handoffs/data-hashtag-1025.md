# data-hashtag-1025 (Hashtag projections HT1025, 2026-10-25)

Branch `data-hashtag-1025`: 3 commits (head ebb4ae6; bb1d6cd is the data), **local only, not pushed, not merged**. Worktree removed 2026-10-26.

## State

Refreshed Hashtag projections from the HT1025 file, plus two docs commits (handoff, Team tab mockup v2 decisions; the mockup is claude.ai/artifact/7Ymxd5kGFUc7ffX4YpV7eD, already folded into the Team tab design).

## Next

Check whether newer projection data on main supersedes it (if so, drop the branch). If not: merge or rebase onto `origin/main`, rebuild, unit tests, then (ask the user) push and PR. Drop its handoff and mockup docs commits' handoff edits (the notes are superseded by `team-tab-next.md`).

On resume: `git checkout $(git merge-base HEAD origin/main) -- src/SESSION_HANDOFF.md`, then merge origin/main.
