# calib-ros-150

State: idea 150 (fit the Win shrink k per games basis) is staged, not run. `src/calib_ros.js` has arms E-ROS-mix / E-ROS-mix-k (mix = whole games x (1 + min(1, g/82)) / 2, my reading of the Mix basis), verdict line F (#150's shared-k rule across all seasons) and a fourth argument for the first seed. `src/run_calib_ros.bat` runs `calib_ros.js 20 2025-26,2024-25,2023-24 21` (fresh seeds 21-40). 454 unit tests pass; a 1-seed, 2-season smoke run completed (numbers are noise). No new unit test covers the arms; `calib_ros.js` has none.

Next: user runs `src\run_calib_ros.bat` on the PC (about the length of the 10/26 run); copy `results_calib_ros.txt` and `calib_ros.json` back (previous ones are in `Documents\courtside-backtest\saved-2026-10-26\calib-ros\`). Then read line F: YES = one shared k (keep winM x k.match constant per #151 note); NO = one k per basis. Update the #150 row, then ship the k in `win_k.js` if the rule says so.

Open: (a) per-category Brier is still not printed (per-category slopes are, the `cat slopes` line); (b) FG%/FT% constants 0.932 / 1.115 (`engine.js:99,110-111`, five courtside pages carry copies) have no recorded fit: `git log -S "0.932"` will find the commit; (c) idea 155 (shrink in the draft Win model) is Parked by the user.

Hazard: `calib_ros.js` ETA line relies on a literal CR character in the source (do not "fix" it to `\r`). Seeds 1-20 are the #139 seeds; keep 21-40 for #150.
