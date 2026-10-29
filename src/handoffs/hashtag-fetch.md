# hashtag-fetch

State (2026-10-29): daily Hashtag projections fetch BUILT and verified, 6 local commits on `hashtag-fetch` (worktree `C:/Users/Fefe/Documents/FantasyBBall-hashtag`), **not pushed, not merged**.

- `src/collect/hashtag_fetch.mjs login | discover | fetch [--no-merge]`: Playwright (installed in `C:/Users/Fefe/Documents/pw-tools`, `PW_DIR` overrides) with the user's premium session saved in `.auth/hashtag.json` (git-ignored). `fetch` sets Show = All, reads `#ContentPlaceHolder1_GridView1` (no export button exists), checks login, columns and >= 300 rows, writes `src/data/hashtag_<date>.xlsx` (same 17 columns as the manual files) and runs `hashtag.py`. Temp JSON is read as UTF-8 (cp1252 double-encoded accented names and failed the duplicate-names test).
- `src/collect/hashtag_daily.ps1 [-DryRun]`: pull main (ff-only), fetch, build (`.claude/scripts/build.mjs`), `node --test src/tests/`, commit and push to main. Guards: only from a clean checkout on main (`HASHTAG_PUSH_BRANCH` overrides for tests), only when every changed file matches the data / built-page list, no force push, one rebase retry, hard reset of its own checkout after a failure. Log: `src/hashtag_fetch.log`.
- Windows scheduled task "Hashtag projections", daily 08:00, StartWhenAvailable, currently pointing at THIS worktree's script, so it fetches but never pushes (branch is not main).
- Dry run on this branch passes: build, 510 tests, "would commit 11 files". The real push path is untested.

Decision (user, 2026-10-29): fetch once a day and auto-push each new fetch. Ask before the first merge to main (Cloudflare deploys main).

Next:
1. When the user says push: merge `hashtag-fetch` to main (PR, merge commit). Then `git worktree add C:/Users/Fefe/Documents/FantasyBBall-auto main` (a dedicated checkout: the job hard-resets it), repoint the task with `Set-ScheduledTask`/re-register to `-File C:\Users\Fefe\Documents\FantasyBBall-auto\src\collect\hashtag_daily.ps1`, copy `.auth/hashtag.json` there (git-ignored, not in the new checkout), run the task once and check the log and the deployed site.
2. Reviewer items not done (2026-10-29): a dry run leaves the tree modified (next real run skips the push), no skip-commit when the projections are identical, no notification on failure (marker file or toast), fetch date is UTC while the schedule is local, numeric columns convert only if every value parses (dtypes not asserted), `git clean` of `src/data/hashtag_*.xlsx` in Clean would delete an unpushed hand download (the automation checkout is its own). Fixed: stuck-rebase path (now reset to origin/main and retry next run), push only when not ahead of origin, explicit staging, FG%/FT% form and stat-cell and row-drop checks, `allow_nan=False`.
3. Optional: a unit test for the table-to-xlsx step, move Playwright into the repo's tooling, and a note in `docs/release-handoff.md`.

Hazards: the login expires at some point (log says "Not logged in", fix with `login`); the manual `hashtag_2026-10-25.xlsx` has U+FFFD in some names, fetched files do not; a daily commit adds ~40 KB xlsx; the task's runs in this worktree leave `src/players.json` and the xlsx modified (use `git checkout -- src/players.json src/data` before switching work); never run `git reset --hard` here with uncommitted edits (lost twice this session).
