# yahoo-points-pr2 (#137 points leagues, PR 2)

Branch `yahoo-points-pr2`, worktree `../FantasyBBall-137b`, cut from origin/main after PR #30 and #31 merged (2026-10-26). Plan Tasks 5-13 in `docs/superpowers/plans/2026-10-26-points-leagues.md`.

## State

Built and committed, not pushed, no PR yet: Rankings and Team tabs in points mode.
- `src/points_core.js` (FP of a line, variance with measured stat correlations, `engineView` = one FP total in category slot `FP_SLOT` 3 so `Engine.evaluate` runs unchanged, Win M = 100 x gainC[FP_SLOT]), `src/points_fit.js` (the correlation fit from logs3.csv), `Points.table` (Per game / Season / Mix), `Rankings.winStart` with `o.points`.
- `engine.js` only gained exports and an output-neutral refactor (`simDraws` / `draftSims`, `p.gUse`, `PROJ_SD`, `VARS`, `perGameVar`); `engine_golden.json` is untouched and `category_golden.json` (new) pins Rankings tables, `buildContext` outputs and the Team matrix / module scores in categories.
- Team: `TeamWin` takes `opts.points` (engine view cached per point values; the opponent memo and `team_view` keys carry the values), gain / module rows have `c` and `dCat` null in points, `pointsPerWeek`, matrix `ppw`; `Matchup.makeCtx({nightOf})` so a crowded night goes to the better points player (Matchup Analyzer never sets it).
- Pages: Rankings (Pts/g, Pts, Pts (mix); no Zscore type / drop / Stats / weights / Win C; Win M and Edge kept), Team (Pts/g column, Win M, Points / wk card and matrix row; Z view and weights hidden). Draft, League, Matchup, Trade still show the "not supported yet" note (text now ends "Rankings and Team work in points leagues.").
- 352 unit tests and every browser check pass (run on :8767). Board artifact: `engine.*.js` changed hash but its output did not; no republish needed.
- Reviewer (effort high) was dispatched on the finished branch; see Next for what is left.

## Decisions (user, 2026-10-26)

D1 Team roster bottom row keeps "Team average (per slot)" with the points average; the team sum shows as the Points / wk card. D2 Rankings Playoff boost stays in points mode (control is hidden at present anyway). Questions (2)/(3) of PR 1 unanswered: PR 2 combines projection error with the measured stat correlations. Win M is not calibrated on real weeks (new ledger row, analyst). Rankings Mix handled in points: z = fpg x (g + G0)/2 with G0 the mean g of the top teams x roster by Season points.

## Next

1. Fix what the reviewer reports (each fix with a test that failed first); rebuild with the full command (assets/ included).
2. Ledger (not done yet, ledger worktree): edit IDEAS #137 in place, add the new Open row for the points Win M calibration (`node .claude/scripts/ledger.mjs next`), archive entry at the top of "Entries after 2026-10-18", handoff line; land only on the user's "push".
3. On "push": `git push -u origin yahoo-points-pr2`, PR against main (summary, tests, decisions), merge only on the user's word. Then Yahoo link (part 2) when Yahoo approves the API app.

## PC commands

Second server for browser checks: `python -m http.server 8767` in the worktree; copy `src/tests/browser/*.mjs` to a Playwright folder with `sed 's/8765/8767/g'` (not PowerShell). `node --test src/tests/*.test.js`.
