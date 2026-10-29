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
7. **After Rankings (user, 2026-10-21):** #114 projected weekly stats dashboard in the Matchup Analyzer; #115 combine known
   game stats with projections; (#116 done).
(#112 and #136 done: moved to the archive, "Handoff lines trimmed 2026-10-29".)

## Branches in flight

Run `node .claude/scripts/branches.mjs` (every branch, ahead/behind main, pushed, landed, worktree, its Next line); notes are
`src/handoffs/<branch>.md`. Shared records (this file, IDEAS, archive) change only in the ledger worktree: `docs/release-handoff.md`, "Parallel sessions".
Pushing needs the user's word. Merged 2026-10-26/27 (list in the archive): team-tab-next (PR #46), tests-subfolders (#148, PR #47; tests are in `src/tests/{engine,league,team,collect,tooling}`), Claude-Workflow PR #8. No open PRs. `fold-test` is another session's branch.

**Permissions (user, 2026-10-28):** prompts only on push, merge and delete, in any worktree; ask in chat before using the user's PC for a test (memory `permission-policy`). Detail: archive "Handoff lines trimmed 2026-10-29". Use `node --test src/tests/`.

**Calibration (2026-10-29, PRs #52, #54, #55 merged):** ideas 145-158 are all run and read; nothing changed the app's k. Matchup Analyzer `K_MATCH` is **0.72** (an earlier .78 was reverted: #157 line P and #146's live .55 measure the Team-tab forecaster, not the Analyzer's; #158 re-fit on the right forecaster gave pooled .71 +-.05, archive 158b). Team / Rankings / Trade keep `WinK.SHRINK` .60 / .75. The guard hook (PR #51) is in. Open calibration rows: 159 (variance instead of k), 160 (match-from-category step), 158 optional live check. Known unfixed review points on the calib scripts: season-merged bootstrap clustering in `calib_ros.js` kwlMain / `calib_lag.js` (fix before gate O is reused), division SE ~5% low.

**#165 IL timeline merged 2026-10-29** (PRs 60, 61). `inseason-pe` merged with main; the #163 full trade run (seeds 291-370) was started on the user's PC 16:30 on 2026-10-29: read results per `src/handoffs/inseason-pe.md` Next 2. **#166 stat congruency** is in branch `stat-congruency` (worktree `FantasyBBall-congruency`, B1 done, user decisions D1-D7 in its notes `src/handoffs/stat-congruency.md`): resume there. Empty folders `FantasyBBall-iltimeline`, `-reprep` could not be deleted (in use by a process).

**Next session starts with:** 1. Item 2 of the user's list: scoring in-season models in prize equity ("check prize equity of different in-season models": weekly add / streaming policies and Win-chance models if they fed decisions). Big feature: brainstorm with the user first (superpowers:brainstorming), then the `planner`. Facts found: no in-season policy has a prize-equity score; `prize_equity.py` reads `bt_real_*.json` rows (me, made, rounds, title); `stream_sim.js` / `bt_stream.js` give weekly rates only, so a season simulator (bt_real / title_score path) must run the policy and emit rows under a new arm, then `prize_equity.py <arm>:23`. Related rows: 6b Rejected, 96, 102, 116, 121, 140, 141. 2. Ledger clearing with the user, row by row (143, 144, 133, 121, 101-102, 98, draft research). 3. #150 needs a PC run (ask first). Permission mode: the user wants as much done without prompts as possible; bundle pushes for one decision.

## This PC

- `python3` isn't installed: use `python`. Bash heredocs with apostrophes break: use the Write tool for files.
- Build: `cd src && python gen.py && python build_site.py && rm -rf ../assets && cp -r site/assets ../assets && cp site/{index,league,inseason,settings,rankings,team}.html ..`
- Unit tests: `node --test src/tests/` (subfolders since #148). Playwright folder of an earlier session: `$TEMP/claude/.../17acf9ec-.../scratchpad/pw`.
- Browser checks: Playwright (`npm i playwright@1.48.2` + `npx playwright install chromium` in a scratch folder, or an
  earlier session's scratchpad `pw/`); copy `src/tests/browser/*.mjs` there, `REPO=<repo root> node X.mjs`, repo root
  served on :8765 (`python -m http.server 8765`).
- GitHub CLI logged in as Sanctumx (`C:\Program Files\GitHub CLI`, add to PATH in the Bash tool); `gh workflow run` needs
  the id from `gh workflow list`.
