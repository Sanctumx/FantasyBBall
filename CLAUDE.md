# Working on this repo

Project state, decisions and the user's standing rules live in `src/SESSION_HANDOFF.md`. Read it first; this file only
covers how changes get made.

## The user's working rules

- Push, merge or deploy only when the user says "push" or types /release.
- Ask before using the user's computer.

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
5. **Commit** in small steps with a type prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`. Record anything worth
   knowing later in `src/SESSION_HANDOFF.md`.
6. **Review.** Before merging a feature, one fresh reviewer reads the whole branch diff. Fix what matters, each fix with a
   test that failed first.
7. **Pull request.** `git push -u origin <branch>`, then open a PR against main with a summary, the tests run and the
   decisions made. The PR is the record of what changed and why.
8. **Merge = deploy.** Only when the user says push. Use a merge commit, which keeps the step-by-step history.
   Cloudflare deploys main within a couple of minutes. Then `git checkout main && git pull` locally and delete the branch.
   A small fix the user asks to push right away may go straight to main, after the tests pass and
   `git fetch && git rebase origin/main`.
9. **/release** updates the handoff (and mirrors it to the claude.ai project), then commits and pushes.

## In Claude Code cloud sessions

- `gh pr …` commands fail (GraphQL is blocked). Use the REST API:
  - open: `gh api repos/Sanctumx/FantasyBBall/pulls -f title=… -f head=<branch> -f base=main -F body=@pr.md`
  - merge: `gh api -X PUT repos/Sanctumx/FantasyBBall/pulls/<n>/merge -f merge_method=merge`
- Remote branches can't be deleted from the session; the user presses "Delete branch" on the merged PR's page.
