# Working on this repo

Project state, decisions and the user's standing rules live in `src/SESSION_HANDOFF.md`. Read it first, with your branch's notes as in `docs/release-handoff.md`; this file only
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

- **Blocked** (`settings.json` deny rules): reading `src/logs*.csv`, `src/bt_daily.json`, `src/bt_data.json`, backtest
  results `src/bt_*_*.json`, `src/data/*.xls*`, and the built pages `index.html`, `league.html`, `inseason.html`,
  `settings.html`, `rankings.html`, `team.html`, `math.html`; editing the built pages by hand is blocked too (rebuild them instead).
  Scripts still read them; to inspect one, run a short node or python snippet that prints only what you need.
- **Asks first:** `git push`, `gh pr merge` and the merge API call prompt the user every time (`permissions.ask`).
- **Path rules** (`.claude/rules/`): engine/backtest rules and board/page rules load only when matching files are opened.
- **Test hook** (`after-edit.mjs`): after an edit to tested code it runs the unit tests (~3 s); after an edit to the
  handoff it warns past 150 lines. Fix what it reports before moving on.
- **Context hooks** (`context-warn.mjs`, `context-stop.mjs`): once the conversation passes about 60K tokens (stop past
  120K) the user and you get a warning. Finish the current task, start no further plan tasks, run `/handoff`, then tell the
  user to `/clear`. If a turn ends past 60K with no handoff recorded, the Stop hook makes you run it once. They measure the
  start-up cost from the session log; `CTX_BASELINE` overrides it. If checking by hand, read **Messages** in `/context`,
  not the total (the app starts around 95K).
- **Status line** (`statusline.mjs`, terminal only): model, context %, plan usage, cache state, branch, and a hint when
  to `/handoff` and `/clear`.

## Model routing

The main session runs on **Sonnet at medium effort** (`.claude/settings.json`; in the Claude app, keep the picker on
Sonnet). Judgment work goes to subagents pinned to their own model and effort in `.claude/agents/`, so the main session
never switches model and its cache stays warm. If the session is on Opus and the user hasn't said it's deliberate,
mention it once (the VS Code picker overrides `settings.json`).

| Work | Who does it | Model · effort |
| --- | --- | --- |
| Building: UI, pages, Fantrax sync, Worker, collector, docs, builds, carrying out plans | Main session | Sonnet · medium |
| Planning anything bigger than a small fix, and any change in a hard area | `planner` subagent | Opus · medium (dispatch with effort high for a hard area) |
| Designing backtests and judging their results | `analyst` subagent | Opus · high |
| Searching the repo, `IDEAS.md` and results (`src/` has 800+ files; don't read them in the main session) | `explorer` subagent | Haiku · low |
| Reviewing a finished branch (dispatch it with model sonnet if the branch only changes docs, config or wording) | `reviewer` subagent | Opus · medium (dispatch with effort high for a hard area) |

**How a planned task runs:** the main session (often with the explorer) gathers the task, the relevant files and any
related `IDEAS.md` rows, briefs the planner with all of it (the planner doesn't see this conversation), shows the user the
plan it returns, and builds it once approved. If the plan needs a decision, ask the user before building.

**Escalation, only when needed:** a bug Sonnet has failed to fix twice, or a long stretch of edits inside a hard area,
may need Opus in the main session. Tell the user, since only they can switch (`/model opus`, then `/model sonnet`
after). For one hard question, `ultrathink` in that prompt deepens one turn without changing settings.

**Hard areas** (mistakes are subtle and nothing crashes): `src/engine.js` (win chances, variances, Model pick, availability),
`src/backtest.js` / `bt_real.js` / `stream_sim.js`, `prize_equity.py`, and anything that changes what the Model pick sees.

## Superpowers skills

They work alongside the routing above; this file takes precedence over them. Size the process to the task:

| Task | Process |
| --- | --- |
| Small fix, UI tweak, copy or docs change | Just do it: test first where there's a test, and verify before saying done. No brainstorming, plan file or worktree. |
| Medium task (a few files, clear goal) | The `planner` subagent's short plan in the chat, approved by the user; then test-first and verification. |
| Big feature, or anything that changes what the Model pick sees | Full flow: brainstorming (main session, it needs the user), then the `planner` drafts the writing-plans document from that skill's format and the main session saves it, then executing-plans inline, then one review. |

- **Skill budget** (overrides using-superpowers' "invoke at 1% chance"): for small and medium tasks don't load
  test-driven-development or executing-plans; the test-first rule below is enough. Load them only for a big feature.
  Never run writing-plans or executing-plans as subagents.
- **Executing:** inline by default. Use subagent-driven-development only for truly independent tasks, and give every
  subagent an explicit model, as that skill requires.
- **Reviewing:** one review per branch. When a skill asks for a code review, run the `reviewer` subagent with that
  skill's template.
- **Skills and connectors:** unused claude.ai skills are off in `settings.json` (`skillOverrides`) and connectors are off
  (`disableClaudeAiConnectors`; a `true` anywhere wins, so `/mcp` can't turn one back on). To use one, edit those lines
  (Claude Code reloads the file mid-session).
- **Worktrees:** fine to use; the after-edit hook tests the checkout being edited.

## The user's working rules

- Push, merge or deploy only when the user says "push" or types /release (the ask prompt above is the backstop).
- Keep running plan tasks back to back unless something needs the user's input; the exception is the context limit
  above (user, 2026-10-20).
- Using the user's computer (copying files there, staging results back) is allowed without asking each time (user,
  2026-10-18) until the user withdraws it. The user still starts PC backtest runs themselves.
- Every improvement to the workflow (CLAUDE.md, skills, subagents, settings, hooks) is also generalized for other
  projects where possible: the general version goes in `Sanctumx/Claude-Workflow` (templates under `template/`, rules
  in `template/GUIDELINES.md`) and in the shared skills (user, 2026-10-20).

## How changes get made (feature branch → pull request → merge)

1. **Branch.** Start every change from an up-to-date main on its own branch:
   `git fetch origin && git checkout -b <short-name> origin/main`.
   Automated jobs commit to main on GitHub, so always start from (and rebase onto) `origin/main`.
2. **Design first for anything bigger than a small fix,** sized as in "Superpowers skills": a medium task gets the
   planner's plan in the chat; a big feature gets a design in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`,
   approved by the user, then a plan in `docs/superpowers/plans/`.
3. **Test first.** Write the failing test, watch it fail, then make it pass.
   - Unit tests: `node --test 'src/tests/*.test.js'` from the repo root.
   - Browser checks: `src/tests/browser/*.mjs`. They need Playwright, run from a folder where it is installed, with the
     repo root served by `python3 -m http.server 8765`.
4. **Build.** The site serves the repo root, so built pages are committed:
   `cd src && python3 gen.py && python3 build_site.py && cp site/index.html ../index.html && cp site/league.html ../league.html && cp site/inseason.html ../inseason.html && cp site/settings.html ../settings.html && cp site/rankings.html ../rankings.html && cp site/team.html ../team.html`.
5. **Commit** in small steps with a type prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`. Record ideas and results in
   `src/IDEAS.md` (and the archive), and current-state changes in `src/SESSION_HANDOFF.md` on main (keep it under ~150 lines); a branch writes `src/work/<branch>.md` instead.
6. **Review.** Before merging a feature, the `reviewer` subagent reads the whole branch diff. Fix what matters, each fix with a
   test that failed first.
7. **Pull request.** `git push -u origin <branch>`, then open a PR against main with a summary, the tests run and the
   decisions made. The PR is the record of what changed and why.
8. **Merge = deploy.** Only when the user says push. Use a merge commit, which keeps the step-by-step history.
   Cloudflare deploys main within a couple of minutes. Then `git checkout main && git pull` locally and delete the local
   branch (GitHub deletes the remote one).
   A small fix the user asks to push right away may go straight to main, after the tests pass and
   `git fetch && git rebase origin/main`.
9. **/release** updates the handoff, ledger and archive, then commits and pushes.
   **/handoff** does the same recording without pushing (commits locally on a feature branch, leaves main uncommitted);
   use it before `/clear` when the work isn't ready to ship.

## Release and handoff specifics

The specifics /release and /handoff need (files, build check, deploy, what never to do) and the cloud-session
`gh` workarounds are in `docs/release-handoff.md`. Read it when running either skill or working in a cloud session.
