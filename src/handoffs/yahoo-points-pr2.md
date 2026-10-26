# yahoo-points-pr2 (#137 points leagues, PR 2)

Branch `yahoo-points-pr2`, worktree `../FantasyBBall-137b`, cut from origin/main after PR #30 and #31 merged (2026-10-26). Plan Tasks 5-13 in `docs/superpowers/plans/2026-10-26-points-leagues.md`.

## State

Built and committed, not pushed, no PR yet (reviewer fixes applied): Rankings and Team tabs in points mode.
- `src/points_core.js` (FP of a line, variance with measured stat correlations, `engineView` = one FP total in category slot `FP_SLOT` 3 so `Engine.evaluate` runs unchanged, Win M = 100 x gainC[FP_SLOT]), `src/points_fit.js` (the correlation fit from logs3.csv), `Points.table` (Per game / Season / Mix), `Rankings.winStart` with `o.points`.
- `engine.js` only gained exports and an output-neutral refactor (`simDraws` / `draftSims`, `p.gUse`, `PROJ_SD`, `VARS`, `perGameVar`); `engine_golden.json` is untouched and `category_golden.json` (new) pins Rankings tables, `buildContext` outputs and the Team matrix / module scores in categories.
- Team: `TeamWin` takes `opts.points` (engine view cached per point values; the opponent memo and `team_view` keys carry the values), gain / module rows have `c` and `dCat` null in points, `pointsPerWeek`, matrix `ppw`; `Matchup.makeCtx({nightOf})` so a crowded night goes to the better points player (Matchup Analyzer never sets it).
- Pages: Rankings (Pts/g, Pts, Pts (mix); no Zscore type / drop / Stats / weights / Win C; Win M and Edge kept), Team (Pts/g column, Win M, Points / wk card and matrix row; Z view and weights hidden). Draft, League, Matchup, Trade still show the "not supported yet" note (text now ends "Rankings and Team work in points leagues.").
- 352 unit tests and every browser check pass (run on :8767). Board artifact: `engine.*.js` changed hash but its output did not; no republish needed.
- Reviewer (effort high) reported 2026-10-26: no must-fix; six should-fix items, listed in Next 1.

## Decisions (user, 2026-10-26)

D1 Team roster bottom row keeps "Team average (per slot)" with the points average; the team sum shows as the Points / wk card. D2 Rankings Playoff boost stays in points mode (control is hidden at present anyway). Questions (2)/(3) of PR 1 unanswered: PR 2 combines projection error with the measured stat correlations. Win M is not calibrated on real weeks (new ledger row, analyst). Rankings Mix handled in points: z = fpg x (g + G0)/2 with G0 the mean g of the top teams x roster by Season points.

## Next

1. Reviewer should-fix items: all six done (commit 4d9c5dc, pages rebuilt, 356 unit tests and the browser checks pass; the Rankings speed check is timing-flaky). pgVar passes statsOf values; Mix is scaled by gp/g so it stays on the Season scale; the Rankings note and playoff-boost wording follow points; new tests cover the scorer cache, a shared ctx across weights, and scoring switches on Rankings and Team (pending swap survives a point-value change). Nothing more from the review.
2. Ledger: done and committed in the ledger worktree (`../FantasyBBall-ledger`, commit 5fda80b: IDEAS #137 row edited, new Open row #143, archive entry 137b, handoff line), NOT landed. If the reviewer fixes change the story, amend those there; land with `node .claude/scripts/ledger.mjs land` only on the user's "push".
3. On "push": `git push -u origin yahoo-points-pr2`, PR against main (summary, tests, decisions), merge only on the user's word. Then Yahoo link (part 2) when Yahoo approves the API app.

## PC commands

Second server for browser checks: `python -m http.server 8767` in the worktree; copy `src/tests/browser/*.mjs` to a Playwright folder with `sed 's/8765/8767/g'` (not PowerShell). `node --test src/tests/*.test.js`.
