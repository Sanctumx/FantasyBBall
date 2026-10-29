# results-dir

State (2026-10-29): idea 93 built, not pushed. Three commits: `src/results_path.js` + 44 `bt_*.js` writers wrapped in `resultPath()` + summary scripts and `prize_equity.py` / `equity.py` / `strat_equity.py` reading `results/` first then `src/`; the rename of 723 `src/bt_*_*.json` into `src/results/`; docs, deny rule `Read(/src/results/**)`. 460 tests pass (`src/tests/tooling/results_dir.test.js` new). Summaries (real_sum, real_sum2, each_sum, tow_sum, cur_sum, equity, prize_equity, strat_equity) print byte-identical output before and after; one `bt_real.js` smoke run wrote into `src/results/`.

Reviewer (sonnet) run on the branch; findings below if any.

Next: push + PR + merge only on the user's word. After merge: PC `git pull` before the next bat run (a run from an older checkout writes into `src/`, still read by the fallback). Set row 93 Done through the ledger (real count 723, not 225). Drop the `src/` fallback and the old deny rule once fold-test and calib-ros-150 have merged.
