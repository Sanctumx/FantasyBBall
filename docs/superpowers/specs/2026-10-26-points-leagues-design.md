# Points leagues (IDEAS #137, part 1) — design

_2026-10-26. Status: draft for the user's approval._

## Intent and why

A friend of the user plays in a Yahoo weekly head-to-head **points** league. The kit is category-only. Yahoo's API now needs
an approved developer app (weeks of waiting, unconfirmed), so the Yahoo link (#137 part 2) waits. Points scoring needs no
Yahoo access and also serves Fantrax points leagues, so it comes first. The friend types in their league's point values and
rosters by hand, the same manual path the kit already supports.

## Goals

- **Settings tab:** Scoring gets a fourth option, "points". It reveals one box per stat the projections have: points,
  rebounds, assists, steals, blocks, turnovers, 3-pointers made, field goals made and attempted, free throws made and
  attempted. Values may be negative and may be decimals. Unscored stats stay 0. The values save with the league settings,
  per saved league. The 8-cat / 9-cat choice is hidden in points mode.
- **Points only (Rankings and Team tabs):** in points mode the one number is a player's projected fantasy points. With
  the per-game view it is points per game; with the season view it is points per game × games (the season / rest-of-season
  total the tab already shows). Players rank by it, and the Team tab sums it over the roster. There is no Zscore, no Vs
  replacement, no Vs average, no Win C and no Win M in points mode (user, 2026-10-26); those columns and cards are hidden,
  not computed.
- Two pull requests: (1) Settings, store and validation, nothing downstream reads them yet; (2) points in Rankings and
  Team.

## Non-goals

- The Yahoo link, OAuth, and automatic loading of league settings or rosters (#137 part 2).
- Offensive / defensive rebounds, double-doubles, triple-doubles, personal fouls: not in the projections, no boxes yet.
- Season-long total-points (non-head-to-head) leagues: a later small addition; the valuation is the same.
- The Draft tab's Model pick (hard area; needs a backtest). Until then Draft in points mode shows a "not supported yet"
  note and does not silently fall back to categories.
- Any win chance, Vs replacement or Vs average in points mode (user: points only).
- The Matchup and Trade Analyzers in points mode (follow-up unless the planner finds it free).

## Anti-goals

- Points mode must not change anything for category leagues: `engine_golden.test.js` and the existing tests stay green.
- No silent category numbers shown for a points league.

## Constraints

- Defaults go in `LeagueStore.LEAGUE_DEF` only; `migrate()` never changes a saved setting (IDEAS #79). Old saved leagues keep
  working with no points values.
- Edit templates in `src/`, never the built pages; rebuild with the command in `CLAUDE.md`.
- Hover tooltips are one line; the longer explanation goes in the tab's How it works.
- Test first. Settings and store changes are small-to-medium; the Win M work is in a hard area (engine) and gets the
  `planner` at effort high and the `reviewer` at effort high.

## Approaches considered

1. **Settings only.** Safe but delivers nothing the friend can use.
2. **Settings, then valuation in Rankings and Team (chosen by the user).** Usable for in-season decisions, keeps the
   hard-to-verify Draft Model pick out of scope. Two PRs.
3. **Everything at once, including the Draft board.** Rejected: the Model pick needs a backtest and points-mode draft
   scarcity is a separate design.

## Decisions made with the user

- Part 1 is points scoring with hand-entered values; Yahoo comes later (user, 2026-10-26).
- Weekly head-to-head is the assumed format; the friend's exact format is unconfirmed.
- Approach 2. Season view = points per game × games; per-game view = points per game (user).

## My calls (check these)

- All point boxes start at 0, so nothing scores until real values are typed in.
- Draft tab shows a "not supported yet" note in points mode.
- Switching Scoring away from points keeps the typed values (they only apply while Scoring is points).
- The projections carry per-game points, rebounds, assists, steals, blocks, turnovers, 3PM, FGA, FG%, FTA, FT% and games
  (`engine.js` `prepPlayers`); FGM and FTM are derived as FG% × FGA and FT% × FTA. Games come from the same season and
  rest-of-season fields the tabs already use.
- On the Team tab, Active slots are filled by highest points and position eligibility is ignored in points mode, unless the
  builder finds the tab already handles it otherwise.

## Left to the builder

- The `settings` field names and the `normalize` ranges for the point values.
- Which Rankings columns (Zscore, Win C, Edge) are replaced, hidden or relabeled in points mode.
- How the Team tab's swap panel, Changes list and Old vs New cards show a points change (instead of category and Win
  numbers), or whether they are hidden in points mode.
