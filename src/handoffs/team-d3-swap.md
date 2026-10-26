# team-d3-swap (Team tab D3 + Source switch + Rankings Vs average = D2; one PR)

Branch `team-d3-swap`, worktree `C:/Users/Fefe/Documents/FantasyBBall-d3`. Pushed earlier (4 commits); the merge of origin/main and steps 3-4 are local only. The user wants ONE PR with all of it (2026-10-26). 416 unit tests pass. Browser checks run with the Playwright folder `$TEMP/claude/c--Users-Fefe-Documents-FantasyBBall/17acf9ec-.../scratchpad/pw` (copy `src/tests/browser/*.mjs` there, `REPO=<worktree> node X.mjs`, worktree served on :8765 with `python -m http.server 8765 --directory <worktree>`; kill stale servers on 8765 first).

## Done

- **D3** (35c62d3, ed956a8, reviewed): a candidate from an opponent leaves that team and the team receives the player I send out (`TeamWin.trade` replays `state.moves`; `received`; scorer key and Vs average see it). Unfixed, unchecked: `oppState` keeps the received order while the cache key sorts it.
- **Merge with main** (f59f376, 2026-10-26, after PR #37): `oppTeam` / `matrixOf` carry `recv` on top of the points view (`e.w`, `Pts.key`) and the shrink; `received` stays in the API next to `leagueWin` / `tradeState`.
- **Sources** (steps 1-2): `rankings_core` `SOURCES`, `WINDAYS`, `sourceRows`, `loadBox`, `matchRows`, `sourcePool`; `TeamView.sourceCtx`.
- **Team tab Source switch** (e1bc49e): `#src` after Your team, `ui.src` in `courtside-team-v1` (default `avg`), box files load only when a box-score source is picked, one ctx per source (`ctxs`, dropped on team / points / Fantrax change; the scorer is keyed by ctx so switching back reuses jobs), `zmap` keyed by pool key from the source's own table with the projection Zscore for players with no game (`lineFb`), "proj" marker in the roster table, freshness names the source and window dates plus an "uncalibrated" warning, How it works "Source" paragraph. Swaps, chips and the Changes log stay. Browser check in `team_page.mjs`.
- **Rankings D2** (5423ba5, 12919a4): the page uses the TEAM bundle and `SCHED_DAYS`, loads `stats/espn.json`; with Win vs Average player, a league and a team picked, `d2For` builds the pool (`InP.buildPool`), `TV.sourceCtx` and a `TV.moduleJob` (baseline avg) over `matchRows(...).byKey`, steps 30 ms at a time and redraws about every 250 ms; the maps replace winStart's `avg` (no `shrink` passed: TeamWin already shrinks, so no double shrink). Players with no Fantrax match show "—"; a job with no rows (no games left) falls back to winStart's average. Cache key: `dataVer`, source, team, point values, cats. Browser check `rankings_team_parity.mjs` (same source + team -> same Win M on both tabs, sources avg and w7). Help text in `rankings.html` and `app.html` updated.

## Review (done 2026-10-26, effort high; nothing fixed yet; 416 unit tests pass, browser checks not run by the reviewer)

- **MUST** `team.html` `srcWin` / `srcRows` (~346): an empty box-score window is cached for good when `box` is still null (changing Your team, a storage event with new point values, or an unchanged Fantrax answer while the box files load). Scenario: pick Last week, change Your team before the box files finish: every player shows proj and "No games in the box-score files yet" until reload. Fix: don't cache window rows while `box === null`, or have `srcCtx` wait on `needBox()`. Test first.
- **SHOULD** `team_win.js` `matrix()` (~113) leaves out `trade().gone` but `avgCandidate` / `avgOwn` use it, and `TeamView.signature(state, ctx)` keys only on `received`. Scenario: bring in opponent X's player A with nothing out, then swap A out for a free agent: matrix puts A back on X, the avg rows keep him off; the signature equals "just the free agent in", so the scorer can serve the wrong job (avg dM -5.118 vs -5.138). Fix: exclude `gone` in `matrix()` and put `gone` into `signature`.
- **SHOULD** `rankings.html` `d2For`: `buildPool` / `sourceCtx` run in `draw()` and `d2.job.step` has no try/catch; a throw breaks the table or leaves "… N players still scoring" forever. Wrap both, set `d2.failed = true`, `draw()` (falls back to winStart's average), as the Team tab does (team.html ~522).
- **Nits:** `d2note` has a leading space and no trailing one, and the text after it ("season-long ... against simulated league teams", "no roster is used") contradicts D2 while it is active; help text says "already shrunk" but points leagues are never shrunk (app.html, rankings.html tooltip); proj tooltip "No game in this source" is wrong for BBM / Hashtag fallbacks (no row in that projection); `mkZ` reruns `R.table` for the source and for avg on every source switch and `mkCtx` (~90 ms each): cache per source and settings.
- Fine: `oppTeam` memo key and api, no double shrink, dC / dM units, d2 key and `d2.seq`, Team tab source-change guard and points path, TEAM bundle coverage.

## Next

1. Fix the review findings above test-first (MUST first), rebuild with `node .claude/scripts/build.mjs`.
2. Rebuild, run unit + browser (`team_page`, `inseason_page`, `rankings_page` [known: 302 vs 303], `rankings_team_parity`), push and open the PR only on the user's word.
3. Then team-tab-next step 3: per-game / season toggle and auto-fill the top 12.

## Hazards / housekeeping

- Ledger: no IDEAS row for the Team tab or sources; add through the ledger worktree if wanted (landing is a push).
- Rankings Win vs Average: points mode passes `points: pw()` to the module job (untested in the browser); Win M there is uncalibrated.
- `git stash` still holds "stale handoff note (pre-merge)" from `yahoo-points-137`.
- Built-asset line-ending noise: after a rebuild `git checkout --` the asset files whose name did not change.
