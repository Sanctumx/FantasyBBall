# Courtside Draft Kit: working on this repo

Ground truth for the model, the backtests and every decision so far is `src/SESSION_HANDOFF.md`. Read it first.

## The user's standing rules

- Push, merge or deploy only when the user says "push" or types /release.
- Ask before using the user's computer (copying files there, staging results). The user starts PC backtest runs themselves.
- Report backtest results in prize equity (60/30/5 prizes, title-equivalents per 100 seasons), never title equity.
- No Netlify unless asked; the live site is the Cloudflare Worker.
- Saved board settings are the user's: defaults (DEF in `src/app.html`) apply only on a first visit, and an update never changes a saved setting.
- The Model pick always uses the settings that tested best (Season, Average projections, Playoff boost Off). Display settings never change it.

## How changes get made (feature branch → pull request → merge)

1. **Branch.** Start every change from an up-to-date main on its own branch:
   `git fetch origin && git checkout -b <short-name> origin/main`.
   The daily ADP collector commits to main on GitHub, so always start from (and rebase onto) `origin/main`.
2. **Design first for anything bigger than a small fix.** New pages or model changes get a short design in
   `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, approved by the user. Then a plan goes in
   `docs/superpowers/plans/`.
3. **Test first.** Unit tests live in `src/tests/*.test.js`; run them with `node --test 'src/tests/*.test.js'` from the repo root.
   Browser checks live in `src/tests/browser/*.mjs`. They need Playwright: run them from a folder where it is installed,
   with the repo root served by `python3 -m http.server 8765`. Backtests run on the user's PC (see the handoff).
4. **Build.** The site serves the repo root, so built pages are committed:
   `cd src && python3 gen.py && python3 build_site.py && cp site/index.html ../index.html && cp site/league.html ../league.html`.
   `math.html` is rebuilt from the Math doc with `src/build_math.py` (see its header).
5. **Commit** in small steps with a type prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`. Add an item to
   `src/SESSION_HANDOFF.md` for each change worth knowing later.
6. **Review.** Before merging a feature, one fresh reviewer reads the whole branch diff. Fix what matters, each fix with a
   test that failed first.
7. **Pull request.** `git push -u origin <branch>`, then
   `gh pr create --base main --title "<what changed>" --body "<summary, tests run, decisions made>"`.
   The PR is the record of what changed and why.
   In Claude Code cloud sessions `gh pr …` commands fail (GraphQL is blocked); use the REST API instead:
   `gh api repos/Sanctumx/FantasyBBall/pulls -f title=… -f head=<branch> -f base=main -F body=@pr.md`.
8. **Merge = deploy.** Only when the user says push: `gh pr merge <n> --merge --delete-branch`
   (REST: `gh api -X PUT repos/Sanctumx/FantasyBBall/pulls/<n>/merge -f merge_method=merge`, then
   `git push origin --delete <branch>`; cloud sessions can't delete remote branches, so the user presses
   "Delete branch" on the merged PR's page). A merge commit keeps
   the step-by-step history. Cloudflare deploys main within a couple of minutes. Then
   `git checkout main && git pull` locally.
   Small fixes the user asks to push right away may go straight to main, after the tests pass and a
   `git fetch && git rebase origin/main`.
9. **/release** updates the handoff (and mirrors it to the claude.ai project), then commits and pushes.

## Layout

- `src/app.html`: the Draft Kit page. `src/league.html`: the League page. Both are templates that `gen.py` fills with data,
  `src/engine.js`, `src/shared.js` and (League) `src/league_core.js`.
- `src/engine.js`: the model (team forecasts, win chances, Model pick). `src/backtest.js`, `src/bt_real.js`: backtests.
- `worker/index.js`: the Cloudflare Worker (static assets + Fantrax relay at `/api/fantrax`, with caching and stale fallback).
- `.assetsignore`: keeps everything but the built pages private on the site.
