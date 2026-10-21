# Session handoff — Courtside Draft Kit (Fantasy BBall)

_Last updated: 2026-10-21_ · Current state only, about 60 lines / 6 KB. Replace lines instead of appending; trim by moving
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
   weekly usage after a few days; if handoffs feel too frequent try 80K / 150K. Still to add to `Sanctumx/Claude-Workflow`:
   (a) the "keep running plan tasks; past the context limit finish, record, stop" rule in `template/CLAUDE.md`'s working
   rules; (d) the after-edit hook's Windows glob fix and the heredoc note.
5. In-season open: #98 tune
   perceived-value weights, #101 projected playoffs, #102 multi-week plan, #103 week-to-date actuals; refit shrink k.
6. #112 done: per game = mean of the active players per-game lines (branch fix-112-per-game-average, not yet merged).
7. **After Rankings (user, 2026-10-21):** #114 projected weekly stats dashboard in the Matchup Analyzer; #115 combine known
   game stats with projections; (#116 done).

## Next session starts with

**Merged to main (PR #24, 2026-10-21; Cloudflare deploys it):** ideas 122-129 (Waiver adds panel, Team schedule, keep list,
Hashtag refresh, 68 Hashtag-only players, box-score scoring of adds, Fantrax period dates, review fixes: saved extras carry
`base`, a save without one counts as 234 players). 192 unit tests pass. Board artifact republished (v166). First step:
refit
the shrink k for Trade Analyzer future weeks (analyst designs a PM-ros arm in `calib_pair.js`, the user runs it on the PC);
#130 done and released (Rankings: MPG, Order by, my players highlighted). **Next: the tab overhaul #131-134 (user, 2026-10-21): Rankings left of Draft, new Team tab between them (all players with projected/real stats, average totals, Win C/M, swap a player, matchup/category matrix), a collapsible How it works panel on every tab, hover tooltips redone like the Draft tab, compact tabs that fill the space. Big feature: brainstorming with the user, then planner.** #116 and #112 are merged. Best adds/plan on remaining games.
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
