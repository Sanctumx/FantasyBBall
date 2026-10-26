# Release and handoff details

Read by /release and /handoff, and before working in a cloud session. Kept out of CLAUDE.md so it isn't sent
with every request.

## Release and handoff specifics (read by /release and /handoff)

- **Files:** `src/SESSION_HANDOFF.md` (main only), `src/work/<branch>.md` (one per branch), `src/IDEAS.md`, `src/HANDOFF_ARCHIVE.md` (new write-ups at the top of "Entries
  after 2026-10-18").
- **Results metric:** prize equity (`python3 src/prize_equity.py <arm>:<baseline> ...`).
- **Mirror the handoff:** none. The repo copy is the only one (the claude.ai Project copy was dropped, 2026-10-20).
- **Handoff also tracks:** board artifact version (claude.ai/artifact/YK93XaPAdsvaxwQadmvUNz), math doc revision,
  deployment notes.
- **Build check** (only if `src/engine.js`, `src/app.html` or `src/league.html` changed since the last push): the build
  command above, the unit tests, a Playwright smoke test with no page errors, then publish
  `src/courtside-draft-board.html` to the board artifact if it isn't current. Never publish `app.html`.
- **Deploy:** merging to main deploys the Cloudflare Worker `courtside-basketball`, the only host (the Netlify site
  was deleted, 2026-10-20).
- **Never during /release or /handoff:** use the user's computer.

## Reading the handoff and branch notes

- **"read handoff":** run `git branch --show-current` and `git rev-parse --show-toplevel`. Read main's `src/SESSION_HANDOFF.md`
  (short) plus `src/work/<current branch>.md`: from the working tree, else `git show <branch>:src/work/<branch>.md`, else
  `git show main:src/work/<branch>.md`. On main, with no notes file, or in an unknown folder: show the Workstreams table and
  ask which task. Don't read other notes files, and don't create a worktree just to read.
- **/handoff on a branch:** write only that branch's notes file (State / Decisions / Next / PC commands), plus IDEAS.md and the
  archive as usual. Never edit `SESSION_HANDOFF.md` on a branch and never push; if the branch is unmerged and unpushed, ask
  the user whether to push. **On main:** update the Workstreams table rows. When a branch merges, its row becomes done and
  its notes file stays; done rows move to the archive later.
- **Enforced** by the PreToolUse hook `.claude/hooks/before-edit.mjs`: an Edit/Write of the handoff off main is blocked (override once with `ALLOW_HANDOFF_EDIT=1`; bash edits are not caught).
- **New branch:** create its notes file in the first commit, even three lines. Name it exactly like the branch.
- **Worktrees:** at most two (the main checkout plus one task). Finishing a task removes its worktree after `git status -sb`
  confirms the branch is pushed (or the user accepts it staying local). Keep branches until their PR merges.
- **Resuming a branch cut before this rule:** `git checkout $(git merge-base HEAD origin/main) -- src/SESSION_HANDOFF.md`
  (drops its handoff edits after moving them into its notes file), then merge `origin/main`.

## In Claude Code cloud sessions

- `gh pr …` commands fail (GraphQL is blocked). Use the REST API:
  - open: `gh api repos/Sanctumx/FantasyBBall/pulls -f title=… -f head=<branch> -f base=main -F body=@pr.md`
  - merge: `gh api -X PUT repos/Sanctumx/FantasyBBall/pulls/<n>/merge -f merge_method=merge`
- Remote branches can't be deleted from the session; GitHub deletes a PR's branch when it merges ("Automatically
  delete head branches" is on). Don't try to delete them.
