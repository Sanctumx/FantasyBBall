# Rankings tab: player rankings for the season

Date: 2026-10-21 · Status: draft for the user's approval · IDEAS #110 (needs #113)

## Why

The Draft list ranks players on preseason projections. During the season the user wants the same list built on what players
have actually done (this season, last week, last 2 weeks, last month) or on projections, with the league's rosters shown so
free agents are easy to find. Reference: basketballmonster.com/playerrankings.aspx, in our layout.

## Goals

- A sixth toolbar page, **Rankings** (`rankings.html`), a sortable table of players with Zscore and the nine categories.
- **Source** dropdown: Actuals: Season to date / Last week / Last 2 weeks / Last month; or Projections: Average / BBM / Hashtag.
- **Stats** dropdown (Raw / Zscore-style display) instead of several views; **Zscore type**, **Zscore** (Normal / ...), **Basis**
  (Per game / Season / Mix) and Playoff boost as on the board, defaults = the Draft list's defaults.
- **Hide taken** button: uses the Settings league's current rosters; each row shows its owner; taken players hide when on.
- No hiding or flagging of low-games players (use Projections for that).
- League categories, 8/9-cat and weights come from Settings, as on the other tabs.

## Non-goals

- No change to the engine, Win C / Win M or the Model pick, so no backtest.
- No trade, waiver or lineup advice here (those stay in Matchup / Trade).
- No player pages, charts or news.

## Data

- **Season to date:** `stats/espn.json` (season averages, hourly via #111). Already collected.
- **Windows (last week / 2 weeks / month):** not derivable from season averages. Needs the **box-score collector (#113)**:
  after each final game save every player's line (ESPN `summary?event=ID` boxscore; MIN PTS FG 3PT FT REB AST TO STL BLK;
  ids match `espn.json`) into monthly files (`stats/box-YYYY-MM.json`, about 2 MB per season). Extends the hourly run.
  A window is the sum of lines over its dates, divided by games for per game.
- **Projections:** `Shared.projOf` as on the board (Average / BBM / Hashtag).
- **Rosters / owners:** the Settings league via `League.sourceFromRosters` (non-IR players; IR owners are not shown, #109).

## Calculation

- Per-game lines for any source go through `Engine.prepPlayers` + `Engine.buildContext`, the pattern already in
  `inseason_players.js` (`projLines` / `zTable` / `zscoreOf`). The Zscore compares players **within the same window** (a
  last-week Zscore is relative to last-week lines), by the same rule as the board.
- Season basis for a window = per game times the games the player played in it; Mix as on the board.
- Players below a window's data (no games) show a dash and sort last; they are not hidden.
- No new numbers in the engine: Rankings only calls existing functions.

## Page

- Template `src/rankings.html`; `gen.py` and `build_site.py` write `rankings.html` and add it to `TOOLBAR_HTML` in `shared.js`;
  root copy line in CLAUDE.md; shared league store injected like the other pages.
- Columns: #, Player, Team, Pos, owner (when a league is loaded), Zscore, nine categories, Games. Sortable headers, as on League.
- Controls remembered in the browser (like `ui` on League). Mobile: horizontal scroll inside the table, 16 px gutters.
- Hover tooltips are one short line; the explanation goes in How it works (`app.html` copy).

## Stages

1. **#113 box-score collector** (collector + tests + workflow; data starts when games start).
2. **Rankings page on Projections and Season-to-date** (no new data needed): table, controls, Hide taken, owners.
3. **Windows** (needs a few days of box scores): last week / 2 weeks / month.
4. How it works text, browser test (`src/tests/browser/rankings_page.mjs`), release.

Stages 2-3 are independent of the Matchup work queued after this (#114, #115), which will reuse the box-score files.

## Anti-goals

- Never recompute a number differently from the board for the same source and settings (pinned by a test comparing
  Rankings' Projections / Average Zscore to the board's).
- Never write to the league store.

## Open questions for the user

1. Windows by **calendar days** (7 / 14 / 30 days back) or by **the player's last N games**? (Plan: calendar days.)
2. Mix basis on a window: keep the board's meaning (blend of per-game and season games), or drop Mix for windows? (Plan: keep.)
3. Should the IR players of the Settings league show an owner? (Plan: no, as on League, #109.)
4. Build order: stage 1 collector first (data accrues while the page is built), as above. OK?
