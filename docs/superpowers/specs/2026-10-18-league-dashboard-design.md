# League dashboard — design (2026-10-18)

## Intent

A post-draft analysis page for the Courtside Draft Kit. After a draft, the user wants to see how every team stacks up:
who beats whom, in which categories, and what each roster projects to. The draft board answers "who do I pick now";
this page answers "how did the draft turn out". Mostly used after the draft; it also works on a draft in progress.

## Goals

- Load a league's rosters from: the draft open on the board, any saved draft, or a saved/connected Fantrax league
  (its draft results).
- **Team focus (top of page):** pick a team (defaults to yours).
  - Head-to-head table: for each opponent, the chance to win the weekly matchup and the chance to win each category.
  - Category profile: per category, the win chance against an average team in this league, the team's raw projected
    total, and its rank among the league's teams; plus overall rank and expected categories won per week.
- **Whole league (below):**
  - Matchup matrix, every team vs every team (row beats column), with a view switch:
    matchup win % · category win % (one category or all) · expected categories won.
  - Team stats table, all teams × categories, with a switch: raw · per week · Zscore · rank.
- A toolbar shared by the board and this page to move between them.

## Non-goals

- Live in-season rosters (trades, adds, drops). The page analyzes rosters as drafted.
- Weekly schedules, games-played limits, trade analysis, editing rosters on this page.
- Changing the Model pick or anything the board computes.

## Anti-goals (a failure even if it works)

- Numbers that disagree with the board for the same rosters and settings: with the board set to Basis Season,
  Playoff boost Off and the same Projections, its Your team panel (rank, expected category wins per week, category win
  chances, matchup win chances) must show the same numbers as this page for that team.
- Writing to the board's saved state or saved drafts. The page only reads them.
- A matrix that forces the whole page to scroll sideways on a phone.

## Decided (by the user)

- Layout B, "Team focus": team-focused section first, league matrix and team stats below.
- Raw projected stats shown alongside the category profile's win chances.
- Its own page, reached from a toolbar.
- Sources: saved drafts and connected leagues.
- Win chances come from the same model as the board (weekly H2H, each category, as the board computes for Your team).
- An unfinished draft fills open picks with a typical player at that pick, as the board does.

## Constraints

- Static site on Cloudflare (Worker serves the repo root; only listed files are public — `.assetsignore` excludes
  `src/`, `*.md`, etc.). The board is `index.html`, built by `src/gen.py` (injects `players.json`, `sched.json`,
  `engine.js` into `src/app.html`) and `src/build_site.py` (adds the HTML head) → `site/index.html` → copied to the root.
- Fantrax access only through the existing Worker relay `/api/fantrax?what=draft|league|players&leagueId=…`
  (cached, rate-limit aware since 2026-10-18). Sync works only on the hosted site.
- Same origin as the board, so it can read the board's `localStorage`: `courtside-board-v1` (current board: cfg,
  picks, owner, fx, extra), `courtside-saved-drafts-v1` (list of {name, cfg, picks, log, owner, fx, extra}),
  `courtside-leagues-v1` (saved Fantrax leagues {id, name, myTeam}).
- Saved boards may hold "extra" players (not in the projections) with ids `PLAYERS.length + index`; Fantrax names may
  differ from projection names (handled on the board by `findListed` / `absorbExtras`).
- Light/dark theme and phone width like the board; reuse its fonts and color tokens.

## Behaviour details

- **Settings used for the math:** league settings (teams, roster, order, scoring, categories, IL spots, draft field,
  All-Star break, playoff weeks) come from the source (the saved cfg, or for a Fantrax league the board's current
  cfg with teams/roster/order taken from the draft). Basis is Season and Playoff boost Off, as the Model pick uses.
  Projections: a selector on the page, defaulting to the board's choice (Average by default).
- **Team names:** Fantrax team names when the source has them (`fx.names`), else "Team 1…N"; the user's team
  (cfg.slot, or the Fantrax team chosen on the board) is marked and selected by default.
- **Category win %** in the matrix: either one chosen category or the average over the scoring categories.
- **Expected categories won:** sum of category win chances in one matchup (out of 9, or 8 in 8-cat).
- **Team stats views:** Raw = projected season totals (FG% and FT% from total makes / attempts); Per week = totals ÷
  regular-season weeks (weeks before the playoffs start, from the source's Playoffs start setting); Zscore = each team's total vs the league's teams (mean / sd across teams); Rank = 1…N
  (TO ranked low = best). Color by rank within each column.
- **Empty states:** no saved drafts and no board draft → say how to make one; a Fantrax league that can't be reached
  → the relay's message and a retry, as on the board.

## Left to the builder

- Code sharing between the board and this page (e.g. a shared script injected by `gen.py` for name matching, the
  toolbar and theme tokens) vs. small duplication.
- Exact toolbar look; it must work on the board without crowding its header.
- Whether the engine exposes a per-pair category win function (`evaluate` returns `teams` with `mu`/`v` and
  `pairProb`; a `catProb(A, B, c)` alongside it is the natural addition).
- Number formatting and color scales, following the board's conventions.

## Calls I made (to confirm while reading)

- Toolbar entries: Draft Kit · League (the board's tab is named Draft Kit; user, 2026-10-18: the math belongs to the board; math.html stays linked from the
  board's How it works, not from the toolbar).
- "Per week" instead of "per game" for team stats, since matchups are weekly.
- Matching the board is checked with the board on the tested settings (Season, Playoff boost Off); with other display
  settings the board's Your team numbers differ by design.
- Projections selectable on the page; Basis and Playoff boost fixed to the tested settings.
- The Fantrax source uses the draft results (rosters as drafted), not current rosters.
