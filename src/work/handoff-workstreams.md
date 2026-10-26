# handoff-workstreams (this restructure)

Branch `handoff-workstreams`, worktree `../FantasyBBall-handoff` (temporary; remove after merge).

## State

Docs only. One notes file per branch in `src/work/<branch>.md`; branches never edit `src/SESSION_HANDOFF.md`; main's handoff has a Workstreams table; the read/handoff/worktree rules are in `docs/release-handoff.md` § "Reading the handoff and branch notes". The "Next session starts with" paragraphs that used to be in the handoff moved to `team-tab-next.md`, `plays-rank.md` and `calib-ros.md` unchanged.

Also built: PreToolUse hook `.claude/hooks/before-edit.mjs` (tests `src/tests/before_edit_hook.test.js`, 4 pass) blocking handoff edits off main. It only takes effect in a checkout once this branch is merged (worktrees read hooks from the main checkout via `$CLAUDE_PROJECT_DIR`).

## Not done (deliberately)

- `fx-cache-assets` and `yahoo-points-137` were **not** touched: another chat is active on them. Each still carries its own edits to `src/SESSION_HANDOFF.md` and will conflict when merged. Fix when each is wrapped up: move its "Next session starts with" text into `src/work/<branch>.md`, then `git checkout $(git merge-base HEAD origin/main) -- src/SESSION_HANDOFF.md`, merge `origin/main`.
- IDEAS.md and the archive still get edited on branches (number collisions: #142 is used twice).
- General version for `Sanctumx/Claude-Workflow` (user's rule): not done, no local clone.

## Next

Review, then (ask the user) push and merge. Then clean up the two branches above.
