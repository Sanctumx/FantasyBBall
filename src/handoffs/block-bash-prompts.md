# block-bash-prompts (the no-permission-prompt rule, enforced; branch hygiene)

Branch `block-bash-prompts` from origin/main (2026-10-26). PR #39 open (first two commits pushed); later commits local until the user says push.

## State

- `.claude/hooks/before-bash.mjs` (PreToolUse, Bash): blocks a `cd` prefix, in-place `sed`, `cat > f <<EOF` and interpreter heredocs that write; read-only snippets pass; `ALLOW_BASH_PATTERNS=1` overrides. For `git commit` commands the quoted message and heredoc body are ignored, so a message may name a blocked pattern (a chained `cd` after it is still blocked). A PR body written as a heredoc is still blocked: use `gh pr create --body-file`.
- `.claude/scripts/branches.mjs` (session-start report): flags STALE branches (merged or landed; more than 20 behind main and idle over 7 days; no handoff file) and warns when the main checkout is on a branch other than main (another session may switch it under you; use one worktree per branch).
- Tests: `before_bash_hook.test.js`, `branches_script.test.js`; 363 unit tests pass.
- `/fewer-permission-prompts` scan (50 sessions) found nothing safe to add to the allowlist.

## Next

1. Ask the user to push (PR #39 gets the later commits), then merge. After the merge every branch picks the hook up by rebasing onto origin/main.
2. Delete the merged branches and their worktrees (allow-rules, handoff-workstreams, wrangler-previews, yahoo-points-137); the user decides on the other stale-looking ones.
3. The user's rule: generalize workflow changes into `Sanctumx/Claude-Workflow` (template + GUIDELINES); not done, ask first.
4. Handoff rule to add to CLAUDE.md or the handoff skill: a branch's note covers only that branch (state, Next, hazards it created); other branches are read from `branches.mjs`.
