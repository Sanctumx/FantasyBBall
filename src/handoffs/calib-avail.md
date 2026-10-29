# calib-avail

State (2026-10-29): idea 144 (early-season availability). Branch is stacked on calib-ros-150 (PR #52, not merged), worktree `C:/Users/Fefe/Documents/FantasyBBall-avail`. Spec with gates fixed before any result: `docs/superpowers/specs/2026-10-29-early-availability-design.md` (analyst). Build plan returned by the planner, NOT built yet. Assumed decision D1 (user can overrule): the rate applies to Total / Mix only, Per game is not redefined.

Build plan (tests first in `src/tests/engine/calib_avail.test.js`, each must fail first):
1. `rate(gp,tg,g,n0) = min(1,(gp+n0*s)/(tg+n0))`, s = min(1,g/82); n0=0 gives gp/tg (tg=0 falls back to s); n0=Infinity special-cased and `strictEqual` to min(1,g/82); gp>tg clamps to 1.
2. Day/week alignment `tgAt`, `alignCheck` (week w = days 7w..7w+6) against `bt_sched`.
3. `fitN0` (integer grid 0..82, loss sum tgAfter*(a-gpAfter/tgAfter)^2) and `n0For` through `KW.nestedPool`: the held-out season never enters its own n0.
4. `gpAt(rows,w0)` counts days <= 7*w0-1 only, 0-minute rows never; `makeAvailSample`.
5. Gate evaluators A1-A5 on synthetic {d,se} (edges at 1 and 2 SE, A3 strict below, A5 harness strict < and live <=); `binsOk` ignores n<200.
6. `gamesFor(arm,...)`: W = recent?whole:0; G0 = whole*share; R = whole*a; RIL = recent?whole*a:0; R0 = R at n0=0; R at n0=inf === G0 and RIL at n0=inf === old G bit for bit.
7. Wire `calib_ros.js`: `AVAIL` flag near `:18`, `CKS=[1,2,3,7,11,15]` (`:20`), `SRC=['W','G0','R','RIL','R0']` (`:28`), `entries` (`:73-77`) via `CA.gamesFor`, `availMain()` before `:374` copying `kwlMain` (`:306-373`); `TOTAL_BUILDS = 13` keeps the literal-CR ETA line (`:57`); prints alignment, n0 per fold, early/late d with `S.diffSE`, early-only k Brier, RMSE, traded count; with `N0INF=1` a sanity line; writes `results_calib_avail.txt`, `calib_avail.json`.
8. Live arm in `calib_live.js` / `calib_live_main.js` (`rateG`, arm R, `CPS=[2,3,4,6..16]`, n0 from `calib_avail.json`; test in `calib_live.test.js` first), writes `results_calib_live_avail.txt`.
9. `src/run_calib_avail.bat` copied from `run_calib_kwl.bat` (CRLF, no pause): `node --max-old-space-size=8192 calib_ros.js 20 2025-26,2024-25,2023-24,2022-23 81 avail` then `node --max-old-space-size=4096 calib_live.js avail`. Seeds 81-100 only.

Smoke (run from the scratchpad so no results files are overwritten): `N0INF=1 node --max-old-space-size=4096 <repo>/src/calib_ros.js 2 2025-26,2024-25,2023-24,2022-23 81 avail` (~2 min, sanity PASS expected); `node <repo>/src/calib_ros.js 2 2025-26 81` must match W and RIL Brier to 4 dp; then the avail command without N0INF; `SMOKE=1 node calib_live.js avail`. Full PC run ~15 min harness + ~5 min live; ask the user before starting it (memory `permission-policy`).

Pitfalls: literal CR in the ETA line; typed arrays only per build; never read `bt_daily.json`, the logs csv or `results_*.txt` whole. App change (`team_core.js:17-21` `avail()`) is NOT part of the build; it ships only if A2-A5 pass and the user agrees.

Built 2026-10-29 (steps 1-9, all tests pass: 515): `src/calib_avail.js` (pure) + `tests/engine/calib_avail.test.js`; `avail` mode in `calib_ros.js` (`availMain`, results `results_calib_avail.txt` / `calib_avail.json`; `N0INF=1` writes `*_n0inf.*`); live arm in `calib_live.js` (`teamGamesBefore`, `rateG`) and `calib_live_main.js` (`avail` argument; arms A and R only, CPS 2,3,4,6..16 even, n0 from `calib_avail.json` or `N0=`, `LIVE_DIR=` overrides the data folder, writes `results_calib_live_avail.txt`); `src/run_calib_avail.bat` (harness then live, one ETA line, CRLF).
Smoke (scratchpad, 2 seeds): N0INF sanity R == G0 bit for bit PASS in all 4 seasons; W and RIL raw per-checkpoint Brier at n0=inf equal the old E-ROS and E-ROS-g82 at weeks 4/8/12/16 to 4 dp; live arm runs on all 10 divisions (~3 s here). Alignment: day offset 0 matches the schedule far best (591 of 750 team-weeks exact vs <= 429 at +-1/+-2); the ~150 over-count weeks are spread evenly (trades / dual-team rows), not at week edges. The smoke numbers are 2-seed noise, not results.
Decisions I made where the plan was silent: A4 uses each primary season's R early slope vs W's plus R early bins; A5 harness half compares R with G0 (printed vs W as well); live arm gates on fitted-k-per-arm d at periods 2, 3, 4 (shipped-k d printed); `recent` stand-in added to the sample for the RMSE print; "traded" count is the proxy gp > tg.

Next: the PC run (`src/run_calib_avail.bat`, about 15 min harness + 5 min live; the user starts it, ask first). Then the analyst judges A1-A5 from `results_calib_avail.txt` + `results_calib_live_avail.txt`; ledger row 144 through the ledger worktree. Pull the repo on the PC first (the live data folder `src/live_data/` must be there).
