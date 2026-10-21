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
- **Board artifact:** claude.ai/artifact/YK93XaPAdsvaxwQadmvUNz (last noted v144; read it before republishing).
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
5. In-season: republish `courtside-draft-board.html` to the board artifact (engine.js changed). Open: #98 tune
   perceived-value weights, #101 projected playoffs, #102 multi-week plan, #103 week-to-date actuals; refit shrink k.
6. **#112** League Dashboard "Projected": per game = team's average value, per week = week totals, per season = season totals.
   `league_core.js` computeLeague + `league.html` profile.
7. **After Rankings (user, 2026-10-21):** #114 projected weekly stats dashboard in the Matchup Analyzer; #115 combine known
   game stats with projections; #116 dropdown capping team slots the waiver add plan uses.

## Next session starts with

`main` has the Rankings tab and perf cache (PR #21 merged 2026-10-21). Branch `matchup-week-status` (unpushed, tests green:
179 unit, Matchup/League/Rankings/Settings browser checks) holds the Matchup week status (idea 118, archive 118b): Current /
Projected category table, whole-team table, Win M on remaining games. Also built there (idea 119, archive 119): Matchup games left are whole games per player; players with no box line or no minutes in their team's last 3 boxed games are out for the week ("out" in the team table); whole-games shrink k .83 matchup / .85 cats; Trade Analyzer unchanged (fractional g/82). Check name matching on real box scores once games exist. Note: 6 context-hook tests fail when run inside a long session (not code). Next: on "push", PR and merge it (engine.js changed:
republish `courtside-draft-board.html`). Then #112, #116, and Best adds/plan on remaining games. Left open: Playoff boost
hidden, Win uses Draft field Easy, traded player's games use his preseason team, likelihood bias is a guess (#98); IR on the
League tab (#109); week-status leftovers in archive 118b. Awaiting the user: why Games left is not whole (expected games =
projected games/82 per team game, capped by the 10-slot day limit); offered an extra "Team games left" column with the
scheduled whole number.

## This PC

- `python3` isn't installed: use `python`. Bash heredocs with apostrophes break: use the Write tool for files.
- Build: `cd src && python gen.py && python build_site.py && cp site/{index,league,inseason,settings,rankings}.html ..`
- Browser checks: Playwright (`npm i playwright@1.48.2` + `npx playwright install chromium` in a scratch folder, or an
  earlier session's scratchpad `pw/`); copy `src/tests/browser/*.mjs` there, `REPO=<repo root> node X.mjs`, repo root
  served on :8765 (`python -m http.server 8765`).
- GitHub CLI logged in as Sanctumx (`C:\Program Files\GitHub CLI`, add to PATH in the Bash tool); `gh workflow run` needs
  the id from `gh workflow list`.
