# team-tab-next (Team tab #131 follow-ups; branch not created yet)

Start it with `git checkout -b team-tab-next origin/main`. Moved here unchanged from the main handoff, 2026-10-26.

## State

**Team tab (#131, branch team-core, released 2026-10-26 with the logo wordmark; unreviewed since #138; spec docs/superpowers/specs/2026-10-25-team-tab-design.md, archive 131-131g and 138).** 2026-10-26 (#138): Win C / Win M now come from `Engine.evaluate` (no shrink, `Engine.entryVec` + one entry per team) with Plays % games for every team; Vs average = team - average player + him (average = Plays %-weighted mean line, games = total / 12; user spec). 272 unit + 78 browser checks pass; code and rebuilt pages committed on team-core. The shrink (#139, 0.6 / 0.75, `WinK.SHRINK` in `src/win_k.js`) merged 2026-10-26 (PR #37, with the Trade Analyzer on `TeamWin.leagueWin`, #147); follow-ups #144-#146 and #149 (IL on the Team tab) are in `IDEAS.md`.

## Next, in order (user decisions 2026-10-26)

1. D3 swap: a candidate from an opponent leaves that team and that opponent receives the player I send out (for Vs average the average player; for a typed swap the sent-out players, into the vacated slots).
2. Rankings Vs average from the same TeamWin code when a league is loaded (D2; Vs replacement and the no-league path unchanged; adapter in `rankings_core.js`, `rankings.html` needs SCHED_DAYS and L; test: same roster gives the same Vs average on both tabs). It must use `TeamWin` so it inherits the shrink k. **Hazard:** Rankings `winStart(..., { shrink })` already scales Win columns by `WinK.SHRINK`; the league path through `TeamWin` must not also take `o.shrink`, or the shrink is applied twice.
3. The user's other requests: toggle per-game / season stats on the Team tab, auto-fill the top 12 into Active (decide by what: recommend Win M or Zscore, and how it treats Reserve / IL).
4. Browser check, reviewer pass, then the PR (push only when the user says).

## Other open

- **#137** (Yahoo / points leagues): own branch `yahoo-points-137`, see `yahoo-points-137.md` if present, PR #30.
- Tab overhaul, the rest: Rankings left of Draft, a collapsible How it works panel on every tab, hover tooltips like the Draft tab. #116 and #112 are merged. Best adds/plan on remaining games.

## PC commands

- Browser check: copy `src/tests/browser/team_page.mjs` to the Playwright folder (`$TEMP/claude/.../17acf9ec-.../scratchpad/pw`), `REPO=C:/Users/Fefe/Documents/FantasyBBall node team_page.mjs`, repo root served on :8765 (`python -m http.server 8765`).
- Unit tests: `node --test src/tests/*.test.js`.

On resume: `git checkout $(git merge-base HEAD origin/main) -- src/SESSION_HANDOFF.md`, then merge origin/main.
