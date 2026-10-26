# plays-rank-land (lands the #141 code and tests on main)

Status: built, awaiting review (2026-10-26). User asked that the tests live on main for future use.

## State

Cherry-picks of the `plays-rank` branch (ac28a2b, 58fcc6f, d52ffd4): `cfg.playsRank` in `Engine.evaluate` (slots 11/12 scaled by Plays % from #140), arm 65 in `bt_real.js`, `run_plays_rank.bat`, `src/tests/engine_plays_rank.test.js`. The flag is **off by default**; the golden fixture only gains a `plays` key (no existing value changed). 371 unit tests pass. #141 stays **Rejected** (prize equity -0.2 ± 0.1); this only keeps the code and tests.

Raw backtest results are outside the repo: `C:\Users\Fefe\Documents\courtside-backtest\saved-2026-10-26\plays-rank\` (the archive's "worktree FantasyBBall-141" pointer is stale).

## Next

1. Reviewer (hard area: engine.js), PR, merge once the user says push.
2. After the merge, delete the old `plays-rank` branch (local and remote); its content is on main.
3. In the ledger worktree: add to the #141 archive entry that the code is on main (flag off) and fix the results path.
