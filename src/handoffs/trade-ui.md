# trade-ui

State (2026-10-29): branch off origin/main, worktree `C:/Users/Fefe/Documents/FantasyBBall-tradeui`, committed locally, NOT pushed. Source select (PR #64) is already merged.

Done: (1) Trades tab "Hide injured" checkbox (`ui.hideInj`, display filter only: IR slot or `ctx.out`; hides rows, Sell/Buy lists, the Your player and builder type-ahead lists). (2) Basis select moved up beside Source and now sets the Win M rules (`ui.basis`, default Season = what Win M always used; the old `ui.zb` default Per game is dropped on load). `Trade.tradeCandidates(ctx, key, wopts)` and `evaluateTrade(..., wopts)` take `{basis}`; candidate cache keys and the saved-candidate signature include the basis; the Sell/Buy cache key now includes source and basis (it ignored the source before). Tests: unit 544 pass, `src/tests/browser/inseason_page.mjs` all pass (port is hardcoded 8765 in that file; another process holds it here, run a sed copy on another port).

Next:
1. Speed (user asked 2026-10-29): switching Source/Basis re-runs the whole ~2,100-trade search per player and only 3 combinations are kept (`CAND_KEY` store in `inseason.html`, `st.order.length > 3`). Options, best first: (a) idle background pre-compute of the other bases/sources, raise the 3-combination limit (watch the localStorage size); (b) Web Worker pool across cores, same results; (c) a cheap pre-filter of targets (changes which rows exist, needs a check that the best trades survive); (d) server pre-compute is weak (daily, per-league rosters). Plan with the `planner`; nothing measured yet.
2. Merge needs the user's "push"; rebuild pages first if main moved. Restore the line-ending-only asset diffs after a build (`git checkout -- assets/<unchanged files>`).
