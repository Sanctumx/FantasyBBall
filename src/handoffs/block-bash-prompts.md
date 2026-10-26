# block-bash-prompts (the no-permission-prompt rule, enforced)

Branch `block-bash-prompts` from origin/main (2026-10-26), committed locally, not pushed, not reviewed.

## State
- `.claude/hooks/before-bash.mjs` (PreToolUse, Bash): blocks a `cd` prefix, in-place `sed`, `cat > f <<EOF` and interpreter heredocs that write; read-only snippets pass; `ALLOW_BASH_PATTERNS=1` overrides. Registered in `.claude/settings.json`; CLAUDE.md "working rules" says it is enforced. Test: `src/tests/before_bash_hook.test.js` (2 tests pass).
- Known quirk: it matches the command text, so a commit message that names a blocked pattern is blocked too (reword it).
- `/fewer-permission-prompts` scan (50 sessions) found nothing safe to add to the allowlist: the prompts came from `cd` prefixes, python / `node -e` / heredoc scripts, `sed -i` and `cp`.

## Next
1. Ask the user to push, then PR (small change: reviewer on sonnet or skip).
2. The user's rule: generalize workflow changes into `Sanctumx/Claude-Workflow` (template + GUIDELINES); not done, ask first.

## Other work this session (records elsewhere)
- Ledger landed on main (#139-#147, including the points-shrink point on #143, #146 plan, Model-pick rule on #147).
- PR #37 `calib-ros` (#139 shrink) open, reviewed, ready; PR #38 `manual-league` open, three reviewer MUSTs fixed (6b9a2ce), SHOULDs still open (see `src/handoffs/manual-league.md` on that branch). Neither merged.
