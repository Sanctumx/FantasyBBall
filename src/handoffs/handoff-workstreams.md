# handoff-workstreams (this restructure)

Branch `handoff-workstreams`, worktree `../FantasyBBall-handoff` (temporary; remove after merge).

## State

Built 2026-10-26 (design in archive, "Parallel sessions workflow"): `src/work` renamed `src/handoffs`; `.claude/scripts/branches.mjs` (SessionStart hook) and `.claude/scripts/ledger.mjs` (setup | next | land) with tests; the PreToolUse hook and `.githooks/pre-commit` guard the handoff, IDEAS and archive (allowed on main, ledger, this branch); an ask rule on `ledger.mjs land`; docs/release-handoff.md "Parallel sessions"; CLAUDE.md lines 3, 17, 111; the main handoff has a "Branches in flight" pointer instead of a table. Main merged into this branch (handoff/archive conflicts resolved to main's version, then edited). The Yahoo paragraph moved to `yahoo-points-137.md`; IDEAS row 142 set to Adopted.

## Next

1. `reviewer` (sonnet, docs/config/scripts), fix findings test-first. 2. Ask the user to push and merge. 3. After the merge: `node .claude/scripts/ledger.mjs setup`; `git config core.hooksPath .githooks` is already set on this PC. 4. Migrate the other branches (list from `branches.mjs`): calib-ros (restore its three shared files to the merge-base, merge main, land its IDEAS 139 result and archive through the ledger, renumber its 142-144 follow-ups with `ledger.mjs next`), plays-rank, fix-136-espn-retry (cherry says landed: ask before deleting), data-hashtag-1025 (its "#137 Hashtag" clashes with Yahoo's 137). 5. yahoo-points-137 when its session wraps up. 6. Remove the `../FantasyBBall-handoff` worktree. 7. Add the general version to Sanctumx/Claude-Workflow (no local clone yet: template/ scripts, hooks, settings and a GUIDELINES.md section) and tell the user the skill wording to paste (handoff step 3: "if the project specifics define a ledger worktree, record shared files there and write only the topic notes on the branch"; release: "land the ledger as the specifics say").
