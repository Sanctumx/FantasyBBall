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

## Workstreams

How to read this and the notes files: `docs/release-handoff.md` § Reading the handoff and branch notes. Branches never edit this file; each keeps `src/work/<branch>.md`.

| # | Branch | Worktree | State | Notes file |
| --- | --- | --- | --- | --- |
| 142 tab speed | fx-cache-assets | main checkout | committed, unpushed, review next | `src/work/fx-cache-assets.md` (on the branch, not yet written) |
| 137 points leagues | yahoo-points-137 | ../FantasyBBall-137 | open PR #30 | `src/work/yahoo-points-137.md` (on the branch, not yet written) |
| 131/138 Team tab next | team-tab-next | none | not started | `src/work/team-tab-next.md` |
| 139 shrink calibration (+142-144 follow-ups) | calib-ros | none | unmerged, local only | `src/work/calib-ros.md` |
| 141 Plays % by rank | plays-rank | none | done, Rejected, pushed, unmerged | `src/work/plays-rank.md` |
| 136 ESPN retry | fix-136-espn-retry | none | unmerged, local only | `src/work/fix-136-espn-retry.md` |
| Hashtag 1025 data | data-hashtag-1025 | none | unmerged, local only | `src/work/data-hashtag-1025.md` |
| handoff restructure | handoff-workstreams | ../FantasyBBall-handoff | unmerged | `src/work/handoff-workstreams.md` |

**Next, in order:** (1) finish and PR `fx-cache-assets` (review first); (2) review `calib-ros` (the 0.6 / 0.75 shrink is in code but not on main) and PR it; (3) Team tab next steps (`team-tab-next.md`, D3 swap first). Pushing needs the user's word. The idea-number collision (#142 twice) is noted in `calib-ros.md`.

## This PC

- `python3` isn't installed: use `python`. Bash heredocs with apostrophes break: use the Write tool for files.
- Build: `cd src && python gen.py && python build_site.py && cp site/{index,league,inseason,settings,rankings,team}.html ..`
- Browser checks: Playwright (`npm i playwright@1.48.2` + `npx playwright install chromium` in a scratch folder, or an
  earlier session's scratchpad `pw/`); copy `src/tests/browser/*.mjs` there, `REPO=<repo root> node X.mjs`, repo root
  served on :8765 (`python -m http.server 8765`).
- GitHub CLI logged in as Sanctumx (`C:\Program Files\GitHub CLI`, add to PATH in the Bash tool); `gh workflow run` needs
  the id from `gh workflow list`.
