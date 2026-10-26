# Team tab design (#131)

Status: draft for user approval, 2026-10-25 (updated: punt weights, games left, player list module). Decisions are the user's (archive entry 131).

## Purpose

A Team tab between Rankings and Draft with two jobs: (a) see all my stats, (b) test trade targets and lineup changes on my
team. Everything on it is a preview; it never changes the saved league or Fantrax.

## Layout

- **Roster table**, one row per player, grouped by slot: Active, Bench, IL, Reserve. Columns: the usual stats (dropdowns
  below), Win C / Win M contribution as on the other tabs, and a **Plays %** column filled for every slot.
- **Team totals / averages** row under the table. Bench players count in the averages in proportion to Plays % (a player who
  plays 40% of his team's remaining games adds 0.4 of a game per game). Reserve players count for nothing.
- **Matchup matrix vs every opponent**: one row per category plus a **Win M row** (and a Win C row), one column per other
  team in the league, each cell the win chance of my previewed team against that team. Win M is no longer a dropdown
  choice. There is no opponent dropdown; the matrix recomputes as the preview roster changes.
- **How it works** panel and Draft-style tooltips, as on the other tabs (#133).

## Z scores and category weights (punt)

- Each player row shows per-category Z scores and a total Z (the existing Zscore).
- **Punting is a weight, not on/off**: each category has a weight from 0 to 1 (default 1, 0 = full punt), set with a slider
  or number box above the table. The total Z is the weighted sum of the category Zs; the weights also re-sort the player
  list module below. A reset button returns all weights to 1.
- Weights are a preview lens on the Z total and on the Win M list ranking (win chance in each category is weighted by it
  when summed into the module's Win M value). They never change the real Win C / Win M numbers in the roster table or
  matrix, which always count every category fully. (Open question for the user: should weights also drive the table's Win
  columns? Default here is no.)

## Games left column

A **Games left** (GL) column on every row: projected remaining team games in the regular season (periods from the current
one on, from the schedule the Trade Analyzer already uses). It is the team's games only and does **not** account for Plays %
(user, 2026-10-25); Plays % stays its own column. The rest-of-season stat view multiplies per-game lines by GL x Plays %.
Totals and averages use per-game lines as above.

## Player list module (right side)

A panel to the right of the roster table: **every available player** (my roster, other teams, waivers, and Reserve) sorted by
Win M, highest first, each row showing name, team, slot or owner, Win M, and the change in my team Win M.

- A dropdown sets what Win M is measured against:
  - **Vs replacement**: the worst player on my team (lowest Win M contribution among Active and Bench) is dropped for him.
  - **Vs average player**: he replaces a player with my team's average line (average per-game stats of my Active players).
- Default: vs replacement. The list recomputes when the dropdown, the category weights or the preview roster change.
- Clicking or dragging a row onto the roster table adds him to the preview (a swap-in); the same swap rules apply.
- Filters: owner (all / free agents / one team) and a name search; shows the top 50 with a "show more" control.

## Slots and drag and drop

- Slots: Active, Bench, IL, Reserve. Drag a player between any two. Moving one out of IL adds him to the calculations
  (IL players are normally left out); moving one into Reserve removes his stats from all totals, Win C and Win M while he
  stays on the roster.
- Swaps: any number of players in and out (2-for-1, 3-for-2). Incoming players can be another team's player or a waiver
  pickup. A reset button restores the saved roster. Nothing is written back.
- **Typing instead of dragging:** a "Send out" box and a "Bring in" box, each with type-ahead name search (accent- and
  case-insensitive, partial names). Send out searches my roster; Bring in searches every player (other teams, waivers).
  Pick several in each box (chips with an x to remove), then press Apply swap; incoming players land in Bench by default and
  can then be dragged to another slot. Enter picks the top match. The player list module's search box uses the same matcher.

## Plays % (how often a player actually plays)

Over the **remaining regular-season schedule** (periods from the current one on, as in the Trade Analyzer):

- For each remaining day, take the real team games that day for my non-IL, non-Reserve players.
- If more players than the league's active limit (10) have a game, only the best per-game players play that day
  (`matchup_core` already applies this: whole-window mode, `maxActive`, ranking by `valueOf`). The rest sit.
- Plays % = days he plays / his team's remaining games. Active players are normally near 100%; bench players get the share
  left over. Shown for every slot (IL and Reserve show what he would get if moved to the active/bench group).
- This is reused logic, not new engine code. If a small export is needed from `matchup_core` it must not change existing
  outputs (`engine_golden.test.js` and the matchup tests pin them).

## Data and code

- Reads the shared league store (`league_store.js`) like the other tabs; `computeLeague` and `matchup_core` give totals,
  Win C/M and the matrix. A new `team_core.js` (pure, unit-tested) holds the preview roster state and Plays % per slot;
  `team.html` is generated like the other pages. `TOOLBAR_HTML` in `src/shared.js` gets the tab and the reorder.
- Preview state lives in memory (optionally `sessionStorage`), not in the saved league.

## Tests

- Unit: Plays % on a hand-built schedule (11 players, one night with 12 games: the two worst sit); bench averages scale with
  Plays %; Reserve contributes zero; IL to active adds a player; swap 2-for-1 changes totals as expected.
- Browser: type a partial name in Send out / Bring in, pick chips, Apply swap changes the roster and totals; then
  drag a player between slots, totals and the Win M row update; reset restores; the saved league is untouched.
- Unit: weights of 1 reproduce today's Zscore exactly; weight 0 removes a category; 0.5 halves it. Games left sums the
  hand-built schedule; the module's vs-replacement baseline is the lowest-Win M Active/Bench player, vs-average uses the
  mean line of Active players.
- Existing golden and matchup tests stay green.

## Out of scope

Writing lineups to Fantrax, saving previews, multi-week planning (#102), projected playoffs (#101).

## Open at build time

Exact stat-view list; whether the Plays % of IL/Reserve rows is shown dimmed; mobile layout of the drag targets.
