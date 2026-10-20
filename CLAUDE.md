# Working on this repo

Project state, decisions and the user's standing rules live in `src/SESSION_HANDOFF.md`. Read it first; this file only
covers how changes get made.

Every idea tried or planned has one line in `src/IDEAS.md`; full write-ups are in `src/HANDOFF_ARCHIVE.md`. Search them
(with the `explorer` subagent) when a task needs them; don't read them whole.

## Ideas and experiments

- Before proposing or testing an idea, have `explorer` search `src/IDEAS.md` for related keywords (e.g. "scarcity", "punt",
  "ADP"). If it was Rejected, say so and re-test only if something changed (new data, different format, a bug in the old
  test); old-world results (items before 50) are the usual reason to re-test.
- After a test or a shipped feature: edit its row in place (status and the deciding numbers in prize equity), add the
  write-up to the top of "Entries after 2026-10-18" in the archive, and update the handoff if the current model, defaults or
  open items changed.
- New ideas get the next number in `IDEAS.md` with status Open. Never delete rows.

## Keeping context lean (`.claude/`)

- **Blocked from reading** (`settings.json` deny rules): `src/logs*.csv`, `src/bt_daily.json`, `src/bt_data.json`,
  backtest result files `src/bt_*_*.json`, `src/data/*.xlsx`, and the built pages `index.html`, `league.html`,
  `math.html` (which also blocks editing them by hand). Scripts still read them; to inspect one, run a short node or
  python snippet that prints only what you need.
- **Path rules** (`.claude/rules/`): engine and backtest rules, and board/page rules, load only when matching files are
  opened.
- **Hook** (`.claude/hooks/after-edit.mjs`): after an edit to tested code it runs the unit tests (~3 s) and reports
  failures; after an edit to the handoff it warns past 150 lines. Fix what it reports before moving on.
- **Status line** (`.claude/statusline.mjs`): model and effort, context %, 5-hour plan usage, cache state, branch,
  and a hint when it's time to `/handoff` and `/clear` (cues in `Sanctumx/Claude-Workflow` `template/GUIDELINES.md`).

## Model routing

The project model is `opusplan` (`.claude/settings.json`): Opus at high effort in plan mode, Sonnet at medium effort
everywhere else.

- **Plan mode (Opus)** for anything bigger than a small fix and any change in a hard area. Plan at the start of a task:
  each plan-mode toggle is a model switch and re-reads the whole conversation uncached.
- **Outside plan mode (Sonnet):** UI, pages, Fantrax sync, Worker, collector, docs, builds, and carrying out plans.
- **`/model opus`** for a long stretch of edits inside a hard area, or a bug Sonnet has failed to fix twice; tell the
  user when that's needed, since only they can switch. `/model opusplan` afterwards.
- **Searching and reading:** the `explorer` subagent (Haiku, low effort). `src/` has 800+ files, mostly backtest
  results; don't read them in the main session.
- **Backtests:** the `analyst` subagent (Opus, high effort) designs each test and judges its results; the main session
  writes the arms, handles files and runs the scoring.
- **Review:** the `reviewer` subagent (Sonnet, high effort). If the branch touches a hard area, run it on Opus.
- **One hard question:** `ultrathink` in that prompt deepens one turn without changing settings.

**Hard areas** (mistakes are subtle and nothing crashes): `src/engine.js` (win chances, variances, Model pick, availability),
`src/backtest.js` / `bt_real.js` / `stream_sim.js`, `prize_equity.py`, and anything that changes what the Model pick sees.

## The user's working rules

- Push, merge or deploy only when the user says "push" or types /release.
- Using the user's computer (copying files there, staging results back) is allowed without asking each time (user,
  2026-10-18) until the user withdraws it. The user still starts PC backtest runs themselves.
- Every improvement to the workflow (CLAUDE.md, skills, subagents, settings, hooks) is also generalized for other
  projects where possible: the general version goes in `Sanctumx/Claude-Workflow` (templates under `template/`, rules
  in `template/GUIDELINES.md`) and in the shared skills (user, 2026-10-20).

## How changes get made (feature branch → pull request → merge)

1. **Branch.** Start every change from an up-to-date main on its own branch:
   `git fetch origin && git checkout -b <short-name> origin/main`.
   Automated jobs commit to main on GitHub, so always start from (and rebase onto) `origin/main`.
2. **Design first for anything bigger than a small fix.** Write a short design in
   `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and get the user's approval, then a plan in `docs/superpowers/plans/`.
3. **Test first.** Write the failing test, watch it fail, then make it pass.
   - Unit tests: `node --test 'src/tests/*.test.js'` from the repo root.
   - Browser checks: `src/tests/browser/*.mjs`. They need Playwright, run from a folder where it is installed, with the
     repo root served by `python3 -m http.server 8765`.
4. **Build.** The site serves the repo root, so built pages are committed:
   `cd src && python3 gen.py && python3 build_site.py && cp site/index.html ../index.html && cp site/league.html ../league.html`.
5. **Commit** in small steps with a type prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`. Record ideas and results in
   `src/IDEAS.md` (and the archive), and current-state changes in `src/SESSION_HANDOFF.md` (keep it under ~150 lines).
6. **Review.** Before merging a feature, the `reviewer` subagent reads the whole branch diff. Fix what matters, each fix with a
   test that failed first.
7. **Pull request.** `git push -u origin <branch>`, then open a PR against main with a summary, the tests run and the
   decisions made. The PR is the record of what changed and why.
8. **Merge = deploy.** Only when the user says push. Use a merge commit, which keeps the step-by-step history.
   Cloudflare deploys main within a couple of minutes. Then `git checkout main && git pull` locally and delete the local
   branch (GitHub deletes the remote one).
   A small fix the user asks to push right away may go straight to main, after the tests pass and
   `git fetch && git rebase origin/main`.
9. **/release** updates the handoff (and mirrors it to the claude.ai project), then commits and pushes.
   **/handoff** does the same recording without pushing (commits locally on a feature branch, leaves main uncommitted);
   use it before `/clear` when the work isn't ready to ship.

## Release and handoff specifics (read by /release and /handoff)

- **Files:** `src/SESSION_HANDOFF.md`, `src/IDEAS.md`, `src/HANDOFF_ARCHIVE.md` (new write-ups at the top of "Entries
  after 2026-10-18").
- **Results metric:** prize equity (`python3 src/prize_equity.py <arm>:<baseline> ...`).
- **Mirror the handoff:** `Projects` `project_write`, path `claude/SESSION_HANDOFF.md`, `local_path` = the absolute path
  of `src/SESSION_HANDOFF.md`. Don't touch the old top-level `SESSION_HANDOFF.md`.
- **Handoff also tracks:** board artifact version (claude.ai/artifact/YK93XaPAdsvaxwQadmvUNz), math doc revision,
  deployment notes.
- **Build check** (only if `src/engine.js`, `src/app.html` or `src/league.html` changed since the last push): the build
  command above, the unit tests, a Playwright smoke test with no page errors, then publish
  `src/courtside-draft-board.html` to the board artifact if it isn't current. Never publish `app.html`.
- **Deploy:** merging to main deploys the Cloudflare Worker `courtside-basketball`. Never add `[netlify]` unless the user
  asks for Netlify.
- **Never during /release or /handoff:** use the user's computer.

## In Claude Code cloud sessions

- `gh pr …` commands fail (GraphQL is blocked). Use the REST API:
  - open: `gh api repos/Sanctumx/FantasyBBall/pulls -f title=… -f head=<branch> -f base=main -F body=@pr.md`
  - merge: `gh api -X PUT repos/Sanctumx/FantasyBBall/pulls/<n>/merge -f merge_method=merge`
- Remote branches can't be deleted from the session; GitHub deletes a PR's branch when it merges ("Automatically
  delete head branches" is on). Don't try to delete them.
