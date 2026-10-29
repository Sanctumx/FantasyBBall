# League tab on the Team-tab rules

Branch `league-team-rules`. Size: a project (changes what a shipped page shows).

## Intent

The League tab should be, stats-wise, the Team tab for every team: the same lineup rules, the same Win numbers, the same
sources. Today the two tabs disagree about the same team because the League tab runs its own engine (`League.computeLeague`,
`src/league_core.js` 36-93). The user (2026-10-29): "the League tab, stats-wise, should be the same as the team tab"; "the
stats represented on the screen are correct" (keep what is shown); "League tab should also be able to toggle between
projections and season stats"; "full source" (the whole Team-tab Source list).

## Goals

- Every team on the League tab is scored by the Team-tab rules: IL kept (counted on seasonal bases), Plays % lineups,
  shrunk Win numbers via `TeamWin`, Zscore type and category weights as on the Team tab.
- The League tab gets the Team tab's Source select with the same options (Season to date; Last week / 2 weeks / month;
  Projections Average / BBM / Hashtag), same code (`R.loadBox`, `R.windowSource`), same caveat that box-score Win numbers are
  uncalibrated and that a player with no game in the source keeps his projection line.
- The four sections stay as they are: H2H matrix, category profile, team-vs-team matrix (Raw / Week / Z / Rank), team stats
  table, plus the `basis` select (per game vs season totals).
- For one team, the League row equals what the Team tab shows for that team under the same Source, basis and options.

## Non-goals

- No change to the Team tab or the backtest engine. No new Win math.
- No new League sections or layout.

## Anti-goals

- A second copy of the Team-tab rules that can drift (rules out patching `computeLeague` in place).
- Silently different numbers between tabs for the same team.

## Constraints

- The built pages are committed: rebuild with `node .claude/scripts/build.mjs`; template is `src/league.html`.
- Test first (`node --test src/tests/`); a league-vs-team equality test is the key one. Browser check needs Playwright.
- The League page numbers will change on release (shrinkage, IL, Plays %). Say so in the PR.

## Approaches

- **A. League calls the Team tab's shared code per team (chosen by the user).** `Team.tabState` + `TeamView.rows` per team,
  `TeamWin.leagueWin` for the matrix, `TeamView.sourceCtx(..., {teamTab:true, basis})`, an adapter into the shapes
  `league.html` renders. One set of rules; the adapter must be exact.
- B. Patch `computeLeague` (IL, Plays %, shrink, source arg). Smaller diff but duplicates the rules; rejected.
- C. Extract a new shared module and rewrite the Team tab too. Cleanest end state, more risk right after shipping the
  Team tab; rejected.

## Decisions

User: approach A; full Source list; the shown stats stay.

My calls (flagged, change if wrong):
- Source defaults to Projections (Average), as on the Team tab.
- League Zscore and Rank stats stay cross-team z-scores and ranks, recomputed over the new team lines (turnovers negated as
  now); the Team-tab Zscore type applies at player level inside the team lines only.
- `sourceFromRosters` passes IR through (stops dropping it); the League tab shows IL players as IL like the Team tab.
- Season-total basis uses the Team tab's `total` basis; per game uses `pergame` (`basisOf`).

## Left to the builder

- The adapter's exact shapes, how the per-team context is built efficiently (14 teams; Plays % cost), caching of box-score
  loads, and the fixtures for the equality test.
- Open for the builder to check: how League handles a team whose Fantrax roster has IL players on a non-seasonal basis.

## Builder-check answers (user, 2026-10-29)

- Equality test (raw line plus `P[i][j]` equal to the Team tab): yes. Include a team with full active slots plus an IL player (PR #58 rule).
- Non-seasonal bases: League shows a note on the tab about seasonal vs per game (IL counts only on seasonal bases).
- `TeamWin.leagueWin` is extended to expose per-category and per-match probabilities (hard area: planner at effort high).
- The old `proj` select is replaced by Source: yes.
- Zscore type dropdown (Normal, H2H-adjusted, Roto-adjusted) goes on the team stats module of the League tab; no weights control.

My calls (user did not know the questions; change if wrong):
- Open roster spots: drop the average-pick filler the old engine added; a team is scored on the players it has (as the Team tab does). Drop the "N of M roster spots filled" count.
- Players missing from the projections (`src.extra`, waiver-level lines): follow whatever `Team.tabState` does for the Team tab.
- Scoring formats: keep the Standings/rank ordering for H2H each category, H2H most, and Roto, derived from the new win numbers.
- The header text "N on IR left out" goes away; IL players are listed and counted like on the Team tab.
