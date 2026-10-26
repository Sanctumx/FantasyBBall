# Session handoff — Courtside Draft Kit (Fantasy BBall)

_Last updated: 2026-10-22_ · Current state only, about 60 lines / 6 KB. Replace lines instead of appending; trim by moving
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

**Points leagues (#137 part 1), worktree `C:\Users\Fefe\Documents\FantasyBBall-137`, branch `yahoo-points-137` (off origin/main, 3 docs commits, not pushed; `team-core` is a separate checkout).** Design approved and plan written (user, 2026-10-26): `docs/superpowers/specs/2026-10-26-points-leagues-design.md`, `docs/superpowers/plans/2026-10-26-points-leagues.md`; archive 137. The user chose **native** execution (executing-plans inline, then one reviewer at effort high). Answers to the plan's six decisions: (1) scoring is per league, so keep the point values with the other league settings and don't compute across leagues; (2) and (3) the user didn't follow the question, so use the plan's recommendations (the "not supported yet" notes on Draft, League, Matchup, Trade and Rankings in PR 1; projection error combined with the measured stat correlations) and tell the user plainly in the PR text; (4) ship without the Win M calibration; (5) do not hide Rankings Basis "Mix" (the plan hides it: handle Mix in points mode instead, e.g. as the engine's mix of games); (6) PR 2 waits until `team-core` (#131) has merged. **PR 1 is built and verified (Tasks 1-3 plus 4 test fixes: toolbar order and per-game size expectations in `league_page`, `inseason_page`, `league_sort`, all stale on main too; 205/211 unit tests pass, the 6 failures are the known context-hook tests; every browser check passes). Next: `reviewer` at effort high on the branch diff, fix what matters test-first, then PR only on "push" (state decisions 2-5 plainly in the PR text). PR 2 (Rankings and Team in points) waits for `team-core` (#131) to merge. Second server for browser checks: `python -m http.server 8767` in the worktree, tests with 8765 replaced, Playwright in an earlier session scratchpad `pw/`.** Yahoo link (#137 part 2) waits for Yahoo to approve an API app: the user applied 2026-10-26 (read-only, personal use, may open to friends later; client ID and secret go in Worker secrets, never the repo).

Older notes (PR #24 summary, the tab-overhaul brainstorm, the shrink-k refit step): archive "Handoff lines trimmed 2026-10-26". The Team tab (#131) is on branch `team-core` in the main checkout.
Left open: IR players count every future team game in the Trade Analyzer; games-played variance cap has no dedicated test;
Playoff boost hidden, Win uses Draft field Easy, traded player's games use his preseason team, likelihood bias is a guess
(#98); IR on the League tab (#109); week-status leftovers in archive 118b; best adds search tries only the top 20 adds against
drops 2-5; `matchup_core` addPlan day list still runs to per.end (an extra empty day). Offered, unanswered: a "Team games left"
column. 126 leftovers: `ftx` of the 234 BBM rows not refreshed from the Fantrax snapshot; Hashtag-only rows carry Hashtag ADP, BBM rows BBM ADP.
Note: 6 context-hook tests fail when run inside a long session (not code).

## This PC

- `python3` isn't installed: use `python`. Bash heredocs with apostrophes break: use the Write tool for files.
- Build: `cd src && python gen.py && python build_site.py && cp site/{index,league,inseason,settings,rankings}.html ..`
- Browser checks: Playwright (`npm i playwright@1.48.2` + `npx playwright install chromium` in a scratch folder, or an
  earlier session's scratchpad `pw/`); copy `src/tests/browser/*.mjs` there, `REPO=<repo root> node X.mjs`, repo root
  served on :8765 (`python -m http.server 8765`).
- GitHub CLI logged in as Sanctumx (`C:\Program Files\GitHub CLI`, add to PATH in the Bash tool); `gh workflow run` needs
  the id from `gh workflow list`.
