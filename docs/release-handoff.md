# Release and handoff details

Read by /release and /handoff, and before working in a cloud session. Kept out of CLAUDE.md so it isn't sent
with every request.

## Release and handoff specifics (read by /release and /handoff)

- **Files:** `src/SESSION_HANDOFF.md`, `src/IDEAS.md`, `src/HANDOFF_ARCHIVE.md` (new write-ups at the top of "Entries
  after 2026-10-18"), all via the ledger worktree; `src/handoffs/<branch>.md` (one per branch). See "Parallel sessions".
- **Results metric:** prize equity (`python3 src/prize_equity.py <arm>:<baseline> ...`).
- **Mirror the handoff:** none. The repo copy is the only one (the claude.ai Project copy was dropped, 2026-10-20).
- **Handoff also tracks:** board artifact version (claude.ai/artifact/YK93XaPAdsvaxwQadmvUNz), math doc revision,
  deployment notes.
- **Build check** (only if `src/engine.js`, `src/app.html` or `src/league.html` changed since the last push): the build
  command above, the unit tests, a Playwright smoke test with no page errors, then publish
  `src/courtside-draft-board.html` to the board artifact if it isn't current. Never publish `app.html`.
- **Hashed script files:** the build writes `assets/<name>.<hash>.js` at the repo root; commit the whole `assets/` folder
  with the pages (the build command deletes and recopies it, so old hashes disappear). After a deploy, check with
  `curl -I <site>/assets/<file>` (immutable) and `curl -I <site>/team.html` (must not be immutable).
- **Deploy:** merging to main deploys the Cloudflare Worker `courtside-basketball`, the only host (the Netlify site
  was deleted, 2026-10-20).
- **Handoff report ends with a paste message** (user, 2026-10-26): after the "Next session starts with" line, give a fenced block
  (about 8 lines) to paste into the fresh chat after `/clear`: the first step, the branch or worktree, what is waiting on the
  user, and to run `node .claude/scripts/branches.mjs` and read the handoff first.
- **Never during /release or /handoff:** use the user's computer.

## Parallel sessions (several areas at once)

One area = one branch = one worktree = one Claude session. Shared records are kept off the branches so they cannot diverge.

- **Shared records:** `src/SESSION_HANDOFF.md` (global state only), `src/IDEAS.md`, `src/HANDOFF_ARCHIVE.md`. They change on main only,
  in the **ledger worktree** (`../FantasyBBall-ledger`, branch `ledger`). Never edit them on a feature branch: the
  PreToolUse hook (`.claude/hooks/before-edit.mjs`) and the pre-commit hook (`.githooks/pre-commit`) refuse it
  (override once: `ALLOW_HANDOFF_EDIT=1`; enable the commit hook once per clone: `git config core.hooksPath .githooks`).
- **Branch notes:** each branch keeps `src/handoffs/<branch>.md` (State / Decisions / Next / PC commands), named exactly like the
  branch, created in its first commit. It travels with the branch.
- **"read handoff":** run `node .claude/scripts/branches.mjs` (a SessionStart hook does this too: every branch, ahead/behind main,
  pushed or not, landed, worktree, and its Next line), read main's `src/SESSION_HANDOFF.md`, then
  `src/handoffs/<current branch>.md` (working tree, else `git show <branch>:<file>`). Don't read other branches' notes unless the user asks.
- **Recording something shared** (idea row, archive entry, a change to global state): `node .claude/scripts/ledger.mjs setup` once,
  edit in the ledger worktree, commit `docs: ...` there, then `node .claude/scripts/ledger.mjs land`. Land checks that only the
  three shared files changed, rebases on `origin/main` and pushes `ledger:main` (fast-forward only). It is a push: run it only
  when the user says "push" or on /release (an ask rule prompts too). Until landed, `branches.mjs` shows "ledger has N commits".
- **New idea numbers:** `node .claude/scripts/ledger.mjs next` prints the next free number. Land the row right away: the push
  claims the number. A rejected push means someone took it; renumber and land again.
- **/handoff on a branch:** write the branch's notes file, and put IDEAS rows and archive entries through the ledger worktree (commit there;
  land with /release or when the user says push). Never push the branch itself without the user's word.
- **/release:** commit and PR the branch as in CLAUDE.md, then land the ledger.
- **A finished branch:** its row in the handoff is not needed (the script reads git); keep the notes file until the branch merges.
- **Worktrees:** the main checkout, the ledger, and one per active area. After a branch merges, remove its worktree
  (`git worktree remove`, `git worktree prune`) once `git status -sb` shows it pushed or the user accepts it staying local.
- **Resuming a branch cut before this rule:** `git checkout $(git merge-base HEAD origin/main) -- src/SESSION_HANDOFF.md src/IDEAS.md src/HANDOFF_ARCHIVE.md`
  (after moving its edits into its notes file and the ledger), then merge `origin/main`.

## In Claude Code cloud sessions

- `gh pr …` commands fail (GraphQL is blocked). Use the REST API:
  - open: `gh api repos/Sanctumx/FantasyBBall/pulls -f title=… -f head=<branch> -f base=main -F body=@pr.md`
  - merge: `gh api -X PUT repos/Sanctumx/FantasyBBall/pulls/<n>/merge -f merge_method=merge`
- Remote branches can't be deleted from the session; GitHub deletes a PR's branch when it merges ("Automatically
  delete head branches" is on). Don't try to delete them.
