# Live-roster k on the real LOFB league (idea 146) — design

Date: 2026-10-29. Branch: calib-ros-150 (spec only; nothing built). Status: written, not yet approved by the user.

## Intent

The Team, Rankings and Trade pages pull Win C / Win M toward 50% with `WinK.SHRINK` (.60 match, .75 category, `src/win_k.js`). The backtest fits k at .43 / .65, but it freezes draft rosters and uses preseason lines, so the live app is probably less overconfident. The shipped .60 is a judgment call (user, 2026-10-26). Real roster history exists for a 120-team league, so we can measure the live k instead of guessing.

## Goals

1. **Live k**: fit k for the exact forecast the app shows (rest of season, Active players, season-equivalent totals) against the real weekly results of 120 teams that really made moves. This decides whether `WinK.SHRINK` changes.
2. **Move effect**: separate how much of the gap to the backtest comes from roster moves and how much from line quality.

## Non-goals

- No change to the Model pick, the engine, or anything prize equity sees (display only, like #147).
- No waiver-rule simulation, no streaming-policy value (the in-season prize-equity request is separate).
- No change to the Matchup Analyzer's weekly k (`K_MATCH` .72, `K_CAT` .82); line P of #157 (lag 0-1 k .77-.84) already speaks to it.

## Anti-goal

A k tuned to one season and shipped as settled. This is one season (2024-25); the result is evidence for a level, not a final fit.

## Data (all public Fantrax endpoints, league `3j4mzn4ym0uezl91`, "LOFB Bowl 9 Cat Red", 2024-25)

Verified on 2026-10-29 by fetching (curl, no login). Files go to the scratchpad or `src/` (untracked) — not committed.

| Need | Call | Found |
| --- | --- | --- |
| Draft | `fxea/general/getDraftResults?leagueId=...` | 1,920 picks, 10 divisions x 12 teams, snake |
| Schedule, teams, divisions | `fxea/general/getLeagueInfo?leagueId=...` | 19 periods, 120 pairings per period, `teamInfo` with division |
| Rosters on any past day | `fxea/general/getTeamRosters?leagueId=...&period=N` (N = day 1..146) | `rosterItems` with `id`, `position`, `status` ACTIVE / RESERVE; checked N = 10, 60, 146 |
| Weekly results | POST `fxpa/req?leagueId=...` body `{"msgs":[{"method":"getStandings","data":{"leagueId":"...","view":"SCHEDULE","period":"1"}}]}` | `tableList` of 19 tables; rows hold team, category W/L/T, nine category totals, `matchupId` `teamA_teamB` |
| Transactions (cross-check, optional) | user's CSV downloads: `Downloads\Fantrax-Transaction-History-Claims+Drops-LOFB Bowl 9 Cat Red (1).csv` (all 120 teams, 4,321 claims) | median 29 claims per team, max 122 |

Not yet verified: that every period 1-19 and all 10 divisions return in the `fxpa` call (only period 1 pulled, and not checked against the screen); that the daily roster call keeps working at scale (146 calls; throttle). Player ids are Fantrax ids; matching them to our names is open (user, 2026-10-29: the ids can also be found through the team profile pages on Fantrax; also Fantrax `getPlayerIds`, or the league's `playerInfo`). Projections for 2024-25: `src/data/proj_2024-25_kit.xlsx` (coverage of the ~1,900 drafted players unchecked). In-season lines for players outside the 164 in `bt_daily.json` need box scores (`mk_daily.py` source): the biggest open data item.

## Approaches

1. **Real-league replay (chosen).** Roster on the checkpoint day, forecast the weeks ahead, score against real results; plus an oracle arm. Measures what the live app actually does. Cost: data wiring (ids, lines for ~1,900 players).
2. **Backtest with a simulated waiver rule.** Rejected: `bt_daily.json` has no free agents (164 pids per season), and the answer would depend on the invented rule.
3. **Churn-only measurement** (fraction of team value from players not on the roster at checkpoint). Cheap, but it does not give k. Kept as a free by-product report, not the test.

User chose scope 2026-10-29: live-style fit plus the oracle-roster arm on all 120 teams, frozen-draft arm only if it falls out cheap.

## Arms

All forecast at checkpoints every 2 weeks (as #156), per team pair in the same division, using the app's own forecast (Active players, rest of season, `Engine.evaluate` via `team_win.js`), then score every later period's real result.

- **A live**: rosters (Active) as on the checkpoint day, lines as the app would have them then (projections blended with season-to-date, the #145 STD blend).
- **B oracle**: same lines, but each outcome week's roster as held that week (daily rosters from the API). A minus B isolates roster moves.
- **C frozen draft** (optional): draft rosters, preseason lines; the bridge to the .43.

Fit k per arm and category type (match, category) by the same OLS / Brier fit as `calib_ros_stats.js`. Standard errors by division (10 independent leagues) and by period.

## Decision rule (fixed before any result is read)

- **Ship a new live k** (rest-of-season Win in Team, Rankings, Trade) only if arm A's k, rounded to .05, differs from .60 by more than 2 SE and the sign agrees in at least 8 of 10 divisions. Otherwise keep .60 / .75. A k for categories is judged separately.
- **Moves matter** only if k_B - k_A exceeds 2 SE (paired by division) with the same sign in at least 8 of 10 divisions; report the size either way.
- If the 2-SE bar is not reached the verdict is inconclusive, not "no effect".
- Analyst judges the result (Opus, high), as for #156 / #157.

## Constraints and risks

- Same-player duplicates across divisions (`ACROSS_DIVISIONS`): fine, divisions are scored separately.
- Opponent lineups also moved; arm A uses opponents' checkpoint rosters too.
- Daily ACTIVE / RESERVE status reflects the manager's real lineup choices, which the app does not model (it takes Active as given); note, do not correct.
- One season only. If the league's 2023-24 / 2022-23 history exists, a second season confirms; ask the user.

## Left to the builder

Id mapping, line source for non-drafted players, caching and throttling of the fetches, file layout (suggest `src/calib_live.js`, outputs `results_calib_live.txt`, `calib_live.json` untracked), tests first (`src/tests/engine/`), a PC run bat in the user's style (one ETA line, closes itself, no pause). Tests, build and the ledger row 146 update follow the CLAUDE.md flow; plan via the `planner` subagent (hard area: what the live forecast sees).
