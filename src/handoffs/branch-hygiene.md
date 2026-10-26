# branch-hygiene (follow-ups from the PR #39 review)

Branch `branch-hygiene` from origin/main (2026-10-26), worktree `FantasyBBall-hygiene`. Committed locally, not pushed, not reviewed.

## State

- `.claude/scripts/branches.mjs`: idle time uses the committer date (a rebase no longer looks idle); a merged or landed branch is flagged STALE only if no worktree has it or it is idle over 7 days (a branch just cut from main is spared); a main checkout on a detached HEAD gets the warning.
- `.claude/hooks/before-bash.mjs`: also blocks `python3 <<EOF` (no dash), `cat <<EOF > f`, `Path.write_text`/`write_bytes` patch scripts, and `cd` after a newline, `&` or `|`; read-only heredocs that only transform text (`.replace(`, `re.sub`) pass; on a commit only the `-m` / `--message` argument is ignored, so `git commit -m x; bash -c "sed -i ..."` is blocked.
- Left as is: a `cd` or `sed -i` inside quotes on a non-commit line (e.g. `echo "x; cd y"`) is still blocked (false positive, kept to avoid failing open on `bash -c "..."`).
- Tests: `branches_script.test.js`, `before_bash_hook.test.js`.

## Next

1. Ask the user to push, then PR (docs/config/scripts only: reviewer on sonnet or skip).
2. After merge: remove the worktree (`git worktree remove`) and the local branch.
