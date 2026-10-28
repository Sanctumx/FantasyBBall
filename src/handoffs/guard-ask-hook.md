# guard-ask-hook

State: `.claude/hooks/guard-ask.mjs` (PreToolUse, Bash|PowerShell) answers `ask` for push, merge and delete, because the bare `Bash` allow beat `permissions.ask`. Tests in `src/tests/tooling/guard_ask_hook.test.js`; stale `cd` cases removed from the before-bash tests. Same hook, settings entry and a GUIDELINES line are on `Sanctumx/Claude-Workflow` branch `guard-ask-hook` (local clone under `$TEMP/claude/cw`, not pushed).

Next: on "push", push both branches and merge. Check in a fresh session that `git push` now prompts.

Hazard: keep the hook's regex list in step with `permissions.ask` in `.claude/settings.json`.
