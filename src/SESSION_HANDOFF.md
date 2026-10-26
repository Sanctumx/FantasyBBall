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
  league store `league_store.js`. `Engine.pairMatchup` is the only engine change (pinned by `engine_golden.test.js`). ESPN
  actuals refresh hourly in game windows (#111). Decisions in force: Win M = vs this week's opponent in the Matchup Analyzer,
  vs remaining regular-season matchups (periods 1-15) in the Trade Analyzer (projected playoffs later, #101); chances use
  gVar 1.87 and shrink toward 0.5 (k 0.72 matchup, 0.82 categories); players without projections use ESPN actuals or a
  waiver-level line.

## Open items (details in IDEAS.md)

1. Draft research: **4b** consensus vs Fantrax ADP gap; **45b** fit Draft field f on the 2026 LOFB draft; **77b** why
   Standard-Zscore drafting is weakest; **48b** title backtest per projection source; **15a** read opponents' punts;
   **15c** rookie upside. Parked: **62**, **33**, **15b**.
2. **#93** move backtest result files into `src/results/`.
3. User side: on the PC run `cd ~/Documents/FantasyBBall; git restore netlify.toml; git pull`; edit or delete the stale
   claude.ai Project instructions.
4. Workflow, merged 2026-10-21 (FantasyBBall #22, Claude-Workflow #1; estimated ~20% less usage): context limits 60K / 120K
   Messages, planner and reviewer at Opus medium (high for hard areas), skill budget rule and unused claude.ai skills and
   connectors off in `settings.json`, handoff budget 8 KB checked by the hook, release/handoff details in
   `docs/release-handoff.md`. Check `/skills` in a fresh session that `skillOverrides` hides the synced skills. Check the
   weekly usage after a few days; if handoffs feel too frequent try 80K / 150K. The two leftover template items are merged (Claude-Workflow #2, 2026-10-22).
5. In-season open: #98 tune
   perceived-value weights, #101 projected playoffs, #102 multi-week plan, #103 week-to-date actuals; refit shrink k.
6. #112 done: per game = mean of the active players per-game lines (branch fix-112-per-game-average, not yet merged).
7. **After Rankings (user, 2026-10-21):** #114 projected weekly stats dashboard in the Matchup Analyzer; #115 combine known
   game stats with projections; (#116 done).
8. **#136** done 2026-10-25: `src/collect/espn_fetch.mjs` retries the ESPN collectors with backoff (429/403/5xx/network, 3
   retries) and `espn_stats` pauses 500 ms between pages.

## Next session starts with

Two PC runs are waiting on the user: #141 (below) and **#139** (`srcun_calib_ros.bat` on branch `calib-ros`, committed locally, not pushed; shows one updating "Estimated time remaining" line and closes itself; results are in `src/results_calib_ros.txt`). Standing rule (user, 2026-10-26): every new bat file shows only that one updating ETA line and auto-closes (no pause). `run_plays_rank.bat` still has the old style; offer to convert it. When results arrive, the `analyst` judges them. Otherwise start the Team tab work below.

**Plays % by roster rank (#141, built behind a flag, 2026-10-26; #140 measured it):** branch `plays-rank` (pushed, worktree `../FantasyBBall-141`, not merged). `cfg.playsRank` in `Engine.evaluate` scales each team's 11th / 12th best entries (by `boardRaw`, real and typical) by 0.985 / 0.96 (variance by f²); Gain and the `rep` baseline are ranked among my other entries (`sumRanked`). Off by default: golden file unchanged, Model pick unchanged at picks 0/29/70 with it on (golden `plays` block), `team_win` / Team tab unaffected. Arm 65 in `bt_real.js` = arm 23 + flag; opponents don't inherit (`oppPlaysRank`). Tests: `engine_plays_rank.test.js`. **Waiting on the user's backtest** (user runs backtests on the PC, always): double-click `FantasyBBall-141\srcun_plays_rank.bat` (parity 2024-25 seeds 145-147, then 4 seasons x seeds 145-160), result in `src/results_plays_rank.txt`. Next: have the `analyst` judge it (parity = inside ~2 SE, no season below -2.5 SE; backtest cap is any-10, slightly kinder than the engine's factors); if it holds turn the flag on in `app.html` MODEL cfg, `rankings_core.js:15`, `league_core.js:97` (user chose: every 12-man evaluate, absolute ranks 11th 0.985, 12th and beyond 0.96), rebuild, run `perf.js` (<5% slower), reviewer, PR.

**Team tab (#131, branch team-core, released 2026-10-26 with the logo wordmark; unreviewed since #138; spec docs/superpowers/specs/2026-10-25-team-tab-design.md, archive 131-131g and 138).** 2026-10-26 (#138): Win C / Win M now come from `Engine.evaluate` (no shrink, `Engine.entryVec` + one entry per team) with Plays % games for every team; Vs average = team - average player + him (average = Plays %-weighted mean line, games = total / 12; user spec). 272 unit + 78 browser checks pass; code and rebuilt pages committed on team-core. **Not started (the #141 work came first); next, in order (user decisions 2026-10-26):** (1) D3 swap: a candidate from an opponent leaves that team and that opponent receives the player I send out (for Vs average the average player; for a typed swap the sent-out players, into the vacated slots); (2) Rankings Vs average from the same TeamWin code when a league is loaded (D2; Vs replacement and the no-league path unchanged; adapter in `rankings_core.js`, `rankings.html` needs SCHED_DAYS and L; test: same roster gives the same Vs average on both tabs); (3) the user's other requests: toggle per-game / season stats on the Team tab, auto-fill the top 12 into Active (decide by what: recommend Win M or Zscore, and how it treats Reserve / IL); (4) browser check, reviewer pass, then the PR (push only when the user says). **#139** built on branch `calib-ros` (not merged): on the PC double-click `srcun_calib_ros.bat`, then have the `analyst` judge `results_calib_ros.txt` (Verdict block; SHIP means add the caller-side k in `team_win.js`); the Team tab shows absolute Win M unshrunk until then, say so in How it works. **#137** (Yahoo / points leagues) is being brainstormed in a separate chat in a worktree off origin/main; no code yet. Browser check: copy src/tests/browser/team_page.mjs to the Playwright folder (`$TEMP/claude/.../17acf9ec-.../scratchpad/pw`), `REPO=C:/Users/Fefe/Documents/FantasyBBall node team_page.mjs`, repo root served on :8765 (`python -m http.server 8765`). Run unit tests as `node --test src/tests/*.test.js`. Tab overhaul, the rest: Rankings left of Draft, a collapsible How it works panel on every tab, hover tooltips like the Draft tab. #116 and #112 are merged. Best adds/plan on remaining games.

## This PC

- `python3` isn't installed: use `python`. Bash heredocs with apostrophes break: use the Write tool for files.
- Build: `cd src && python gen.py && python build_site.py && cp site/{index,league,inseason,settings,rankings,team}.html ..`
- Browser checks: Playwright (`npm i playwright@1.48.2` + `npx playwright install chromium` in a scratch folder, or an
  earlier session's scratchpad `pw/`); copy `src/tests/browser/*.mjs` there, `REPO=<repo root> node X.mjs`, repo root
  served on :8765 (`python -m http.server 8765`).
- GitHub CLI logged in as Sanctumx (`C:\Program Files\GitHub CLI`, add to PATH in the Bash tool); `gh workflow run` needs
  the id from `gh workflow list`.
