# Rankings tab implementation plan (condensed)

Spec: `docs/superpowers/specs/2026-10-21-rankings-tab-design.md`. Planner's full plan (2026-10-21) is condensed here; ask the planner subagent to re-expand a task if needed.

## User rulings (2026-10-21)
- D1 drafted-pool base: Projections source = board's preseason ADP; actual sources = the Settings league's rosters (fallback ADP, unrostered ESPN-only players undrafted ADP 400, when no league). To confirm before stage 2.
- D2 weights: fixed defaults (x1, TO x0.5), no weights control.
- D3/D4: Rankings second in toolbar (Draft | Rankings | League | Matchup | Trade | Settings); default Source = Season to date (label ESPN season, e.g. 2025-26, until 2026-27 games exist).
- D5: ship stage 1 alone once reviewed (on "push").
- Not approved: planner's idea to add `Read(/rankings.html)` to `.claude/settings.json` deny; ask the user first.

## Stage 1 (branch `rankings-tab`): box-score collector #113
1. Fixtures (`src/tests/fixtures/make_espn_box.mjs`, `espn_scoreboard.json`, `espn_summary.json`), `COLS`, `finalGames(scoreboard, season, day)` (season.year, season.type 2, competition type STD, completed), `parseBox(summary)` (by keys; skip didNotPlay; null unless 2 teams x >= 5 players).
2. `etDay`, `daysBack`, `monthOf`, `mergeMonth` (never rewrites a saved game; null if nothing new), `missingGames`.
3. `run({season, dates, outDir, now, fetchJson, log, pauseMs})`, CLI (`--season`, `--dates`/`$BOX_DATES`, `--out`); idempotent; failed summary retried next run.
4. `collect-stats.yml`: `dates` dispatch input, step `Collect box scores`, one commit of `stats/`; README, IDEAS #113, archive, handoff.
Box file `stats/box-YYYY-MM.json`: `{season, month, updatedAt, cols, names:{id:name}, games:{id:{d, teams:{ABBR:[[espnId, ...cols]]}}}}`; `d` = New York date. ESPN facts: Cup final (CC) and All-Star count as season.type 2, so require STD; play-in is type 5; scoreboard `dates=` is the New York day.

## Stage 2 (branch `rankings-page` from origin/main): page on Projections + Season to date
5. `src/rankings_core.js`: `cfgFor`, `projSource`, `table` (board-identical Zscore, test vs `InPlayers.zscoreOf`), `zDisplay`, `playoffMults`.
6. `seasonSource(espn, PLAYERS)`. 7. `ownersOf` (IR included; `buildPool` gains `eid`). 8. `src/rankings.html`, gen.py, build_site.py, `TOOLBAR_HTML`, tests, `src/tests/browser/rankings_page.mjs`.
## Stage 3: windows
9. `windowSource` (calendar days, New York dates, sums of box lines, FG%/FT% from summed makes/attempts, latest team). 10. page wiring (Last week 7 / 2 weeks 14 / month 30, empty-window message).
## Stage 4
11. How it works text in `app.html`, full checks, board artifact republish, docs, review, PR on "push".

Hard-area notes: actual sources send `gp x 80 / max gp` games to the engine (display unscaled gp); keep player input order fixed; never average percentages.
