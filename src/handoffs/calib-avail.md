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

Next: build steps 1-9 inline (tests first), smoke, then ask the user for the PC run; analyst judges A1-A5 (combines the harness and live files); ledger row 144 through the ledger worktree.
