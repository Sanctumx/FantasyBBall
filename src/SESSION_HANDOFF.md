# Session handoff — Courtside Draft Kit (Fantasy BBall)

_Last updated: 2026-10-26_ · Current state only, about 60 lines / 6 KB. Replace lines instead of appending; trim by moving
text (stable reference → `src/MODEL.md`, finished detail → archive), never by deleting it.
Every idea ever tried: `src/IDEAS.md` (one line each, search it). Full write-ups: `src/HANDOFF_ARCHIVE.md` (search `^N\.`).
How work gets done and the user's standing rules: `CLAUDE.md`. Model, defaults, architecture, backtest world: `src/MODEL.md`.
Results are in prize equity; items before that quote title equity (`equity.py`).

## What this is

A live snake-draft board for 9-cat / 8-cat H2H fantasy basketball, built on BBM + Hashtag 2026-27 projections (averaged) and
Fantrax ADP, plus a League Dashboard, in-season tools and a Rankings tab. It ranks players by Zscore, Win C, Win M,
availability (There at / Lasts to), Edge and a Model pick; it never punts. Shared with friends via Cloudflare.

## Current state

- **Live:** Cloudflare Worker `courtside-basketball` deploys every push to main; serves the pages and `/api/fantrax`.
- **Board artifact:** claude.ai/artifact/YK93XaPAdsvaxwQadmvUNz (v166, republished 2026-10-21 after PR #24; read it first).
  Publish `courtside-draft-board.html`, **never `app.html`**.
- **Math doc:** claude.ai/code/artifact/2d4059a8-f9ad-465d-bfa7-41ef6990e7a8 (rev 159). The board links to `math.html`:
  export the doc tab as HTML, then `python3 build_math.py <export.html> <katex folder>`.
- **Header (2026-10-26):** every page header reads logo + "Courtside" + the page name in smaller dim text (`.wm`/`.pg` in each template; the Draft board keeps "Courtside Draft Kit").
- **Works:** board, Fantrax live sync, saved drafts/leagues, League Dashboard, ADP/draft collector (every 6 h), Rankings tab
  (#110, PR #21, 2026-10-21; detail in archive 110b/110d).
- **In-season tools + Settings tab (95-109, released 2026-10-21):** Matchup and Trade Analyzers (`inseason.html`), shared
  store `league_store.js`; Win M, shrink and no-projection decisions in force: archive "Handoff lines trimmed 2026-10-26".

- **Tab speed (#142, released 2026-10-26):** `src/fx_cache.js` caches Fantrax answers; pages link hashed `assets/` files. Detail and leftovers: archive "Handoff lines trimmed 2026-10-27".

## Open items (details in IDEAS.md)

1. Draft research: **4b** consensus vs Fantrax ADP gap; **45b** fit Draft field f on the 2026 LOFB draft; **77b** why
   Standard-Zscore drafting is weakest; **48b** title backtest per projection source; **15a** read opponents' punts;
   **15c** rookie upside. Parked: **62**, **33**, **15b**.
2. **#93** move backtest result files into `src/results/`.
3. User side: on the PC run `cd ~/Documents/FantasyBBall; git restore netlify.toml; git pull`; edit or delete the stale
   claude.ai Project instructions.
4. Workflow (merged 2026-10-21): still to check that `/skills` hides the synced skills, and weekly usage (try 80K / 150K
   context limits if handoffs feel too frequent). Detail: archive "Handoff lines trimmed 2026-10-26".
5. In-season open: #98 tune
   perceived-value weights, #101 projected playoffs, #102 multi-week plan, #103 week-to-date actuals; refit shrink k.
6. #112 done: per game = mean of the active players per-game lines (branch fix-112-per-game-average, not yet merged).
7. **After Rankings (user, 2026-10-21):** #114 projected weekly stats dashboard in the Matchup Analyzer; #115 combine known
   game stats with projections; (#116 done).
8. **#136** done 2026-10-25: `src/collect/espn_fetch.mjs` retries the ESPN collectors with backoff (429/403/5xx/network, 3
   retries) and `espn_stats` pauses 500 ms between pages.

## Branches in flight

Run `node .claude/scripts/branches.mjs` (every branch, ahead/behind main, pushed, landed, worktree, its Next line); notes are
`src/handoffs/<branch>.md`. Shared records (this file, IDEAS, archive) change only in the ledger worktree: `docs/release-handoff.md`, "Parallel sessions".
Pushing needs the user's word. Merged 2026-10-26/27 (list in the archive): team-tab-next (PR #46), tests-subfolders (#148, PR #47; tests are in `src/tests/{engine,league,team,collect,tooling}`), Claude-Workflow PR #8. No open PRs. `fold-test` is another session's branch.

**Permissions (user, 2026-10-27):** prompts only before a final push, a final merge (and `wrangler deploy`), and before using the user's PC for a test (the last is a rule for Claude, ask in chat; memory `permission-policy`). `.claude/settings.json` allows all tools and keeps ask rules for `git push` / `gh pr merge` / `gh api *merge*` / `wrangler deploy` (Bash and PowerShell); verified: a push dry-run and the merge prompted. `branches.mjs` adds sibling worktrees to `additionalDirectories` in the untracked `.claude/settings.local.json`, which also holds `C:\Users\Fefe` and `Read(//c/Users/Fefe/**)` so searches outside the project don't prompt. Run one step per Bash call (a chained `git -C <other worktree>` command prompted). `node --test 'src/tests/*.test.js'` fails here: use `node --test src/tests/`.

**Next session starts with:** 1. On the user's word: push branch `ir-finder-bias` (#153 built, reviewed, 2 commits, notes `src/handoffs/ir-finder-bias.md`), open the PR, merge. Ruling: the IR fill stays, from the receiving team's worst non-IR player, plus the roster-cap drop; M2/M3 pass, M1 fails (see the #153 row); optional follow-ups listed there. 2. #150 (needs a PC run, ask the user first): see its IDEAS row; after it keep winM x k.match constant.

## This PC

- `python3` isn't installed: use `python`. Bash heredocs with apostrophes break: use the Write tool for files.
- Build: `cd src && python gen.py && python build_site.py && rm -rf ../assets && cp -r site/assets ../assets && cp site/{index,league,inseason,settings,rankings,team}.html ..`
- Unit tests: `node --test src/tests/` (subfolders since #148). Playwright folder of an earlier session: `$TEMP/claude/.../17acf9ec-.../scratchpad/pw`.
- Browser checks: Playwright (`npm i playwright@1.48.2` + `npx playwright install chromium` in a scratch folder, or an
  earlier session's scratchpad `pw/`); copy `src/tests/browser/*.mjs` there, `REPO=<repo root> node X.mjs`, repo root
  served on :8765 (`python -m http.server 8765`).
- GitHub CLI logged in as Sanctumx (`C:\Program Files\GitHub CLI`, add to PATH in the Bash tool); `gh workflow run` needs
  the id from `gh workflow list`.
