# fix-136-espn-retry (#136 ESPN collector retries)

Branch `fix-136-espn-retry`: 2 commits (head 03f850c), **local only, not pushed, not merged**. Worktree removed 2026-10-26.

## State

`src/collect/espn_fetch.mjs` retries the ESPN collectors with backoff (429/403/5xx/network, 3 retries) and `espn_stats` pauses 500 ms between pages. Main's handoff calls #136 done, but the code is only on this branch, so the live collectors do not have it yet.

## Next

Check it is not superseded on main, then (ask the user) push and PR. The branch was cut before the Team tab merged, so a diff against main looks like deletions; merge or rebase onto `origin/main` first.

On resume: `git checkout $(git merge-base HEAD origin/main) -- src/SESSION_HANDOFF.md`, then merge origin/main.
