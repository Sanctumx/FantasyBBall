# calib-ros-150

State: idea 150 run and read (2026-10-28, seeds 21-40, 3 seasons; row and archive 150b are in the ledger commit 48636e9, not landed). Line F NO (a k per basis), but rule B fails and the verdict is INCONCLUSIVE: nothing shipped, `win_k.js` unchanged. Pooled k_M .37 / k_C .59; shipped .6 / .75 is above every season fit. The k drift over checkpoints is most likely the test's frozen rosters and preseason lines. `src/calib_ros.js` has arms E-ROS-mix / E-ROS-mix-k, verdict line F and a first-seed argument; `results_calib_ros.txt` and `calib_ros.json` in `src` are the run's output (read them with a snippet, `calib_ros.json` is large).

Next: #145 (blend season-to-date and a 30-day window into the lines, then fit k) is the test that can say whether k moves with the season once lines update. Planner brief in progress; needs a plan approved by the user before building (hard area: what the Model pick sees is not touched, but it is a backtest on the Win model). Land the ledger commit on the user's word.

Open: (a) per-category Brier is still not printed (per-category slopes are, the `cat slopes` line); (b) FG%/FT% constants 0.932 / 1.115 (`engine.js:99,110-111`, five courtside pages carry copies) have no recorded fit: `git log -S "0.932"` will find the commit; (c) idea 155 (shrink in the draft Win model) is Parked by the user.

Hazard: `calib_ros.js` ETA line relies on a literal CR character in the source (do not "fix" it to `\r`). Seeds 1-20 are the #139 seeds, 21-40 the #150 seeds; a #145 run needs fresh ones (41+).
