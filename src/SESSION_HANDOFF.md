# Session handoff — Courtside Draft Kit (Fantasy BBall)

_Last updated: 2026-10-25_ · Current state only, about 60 lines / 6 KB. Replace lines instead of appending; trim by moving
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

PR #24 summary, the shrink-k refit step and the older left-open list: top of "Entries after 2026-10-18" in the archive.
**Next: the tab overhaul #131-134 (user, 2026-10-21). #134 (order), #132 (compact tabs) and #135 (Rankings Edge column) merged 2026-10-22. Team tab (#131; spec docs/superpowers/specs/2026-10-25-team-tab-design.md, plan and D1-D10 in archive 131, latest state archive 131c): building in 4 PRs on branch team-core (not pushed, 261 unit tests and the browser check pass; PR 1-3 reviewed, no must-fix). Built: roster table by slot, GL (team games to the NBA season end x min(1, g/82)), Plays %, per game / rest of season, "Adjust by Plays %" box, weights, Stats | Z view, typed swap, matrix, one average row (stats, Z, Win C, Win M); team total row and matrix Win C row removed (user). **User round 2026-10-25 built (archive 131f: no Bench, Vs average = replaces a fictional average player, whole list, Changes list + Undo, sortable columns, Zscore, MPG; 269 tests + browser check pass, committed c407083 on team-core, not pushed). PR 4a and 4b done (archive 131d, 131e): roster Win C / Win M over an average player; right-side player list with Vs replacement / Vs average, owner filter, search, click to Bring in / Send out, drag to swap or to a group header, and Old vs New cards in the swap panel (user 2026-10-25: Old data is its own module, not a list column). Reviewer pass done and fixed (archive 131g, commit c41f2dd; 271 tests + browser check pass). **Next, the user's three requests (2026-10-25): (1) a toggle to swap the Team tab between per-game and season stats; (2) fill the top 12 players automatically into Active (decide: top 12 by what, presumably Zscore/Win M, and how it interacts with Reserve/IL; ask or recommend); (3) find why the Rankings Win M and the Team tab Win M values differ (check Team K_MATCH/K_CAT shrink, average-week vs season, Plays % games, uncapped share, same average player?) and report before changing.** Then the PR (push only when the user says). Browser check: copy src/tests/browser/team_page.mjs to the Playwright folder, `REPO=C:/Users/Fefe/Documents/FantasyBBall node team_page.mjs`, repo root served on :8765.** Preview locally: stand-in server script in the session scratchpad (wrangler needs Node 22), or `python -m http.server 8765` for the browser checks. Playwright: `$TEMP/.../17acf9ec-.../scratchpad/pw`. Run tests as `node --test src/tests/*.test.js` (the quoted glob finds nothing in Git Bash). New idea #137 (Yahoo link + points leagues, Open) needs a brainstorm after the Team tab. Tab overhaul, the rest: Rankings left of Draft, new Team tab between them (all players with projected/real stats, average totals, Win C/M, swap a player, matchup/category matrix), a collapsible How it works panel on every tab, hover tooltips redone like the Draft tab, compact tabs that fill the space. Big feature: brainstorming with the user, then planner.** #116 and #112 are merged. Best adds/plan on remaining games.

## This PC

- `python3` isn't installed: use `python`. Bash heredocs with apostrophes break: use the Write tool for files.
- Build: `cd src && python gen.py && python build_site.py && cp site/{index,league,inseason,settings,rankings,team}.html ..`
- Browser checks: Playwright (`npm i playwright@1.48.2` + `npx playwright install chromium` in a scratch folder, or an
  earlier session's scratchpad `pw/`); copy `src/tests/browser/*.mjs` there, `REPO=<repo root> node X.mjs`, repo root
  served on :8765 (`python -m http.server 8765`).
- GitHub CLI logged in as Sanctumx (`C:\Program Files\GitHub CLI`, add to PATH in the Bash tool); `gh workflow run` needs
  the id from `gh workflow list`.
