# inseason-pe

State (2026-10-29): design approved and committed (`docs/superpowers/specs/2026-10-29-inseason-pe-design.md`); planner's plan approved in chat (tasks 0-9, below). Tasks 0-2 done, task 3 built but the pilot has NOT run. Branch commits: ec645a2 hooks, aadc85e ipe_core, 09b7797 ipe_run. 523 unit tests pass.

Ledger rows 161 (streaming), 162 (lineup), 163 (trade) are committed in the ledger worktree (4fbedf1) but NOT landed (landing needs the user's push word). No result is recorded yet; update the rows after the screens.

Decisions (user, 2026-10-29): k tuning is dropped from this work (the shrink is monotone, so k cannot flip a pick, a lineup or a trade sign; tested); model objective = category share against the rest of the league; model arms as in the design. Not answered yet: delta (smallest PE gain worth acting on; planner suggests 0.3 title-equivalents per 100 seasons) and the PC time budget. Local runs are cheap (see below), so no PC run is needed for the pilot or probably the full run; ask before any PC use anyway.

Deviation to tell the user: the model streaming arm uses all-play category share in the playoff weeks too, not the bracket opponent (the hook has no bracket); say so and ask if a playoff-opponent variant is wanted.

What exists:
- `src/stream_sim.js` hooks `opts.me`, `streamPick(ctx)`, `lineupRank(ctx)`, `trades` (team me only; tests `src/tests/engine/stream_sim_hooks.test.js`; output byte-identical without hooks, checked on 12 real draft runs).
- `src/ipe_core.js`: `makeModel(season, {k})` -> `streamPick`, `lineupRank`, `scorePick`; `gateT(se1, n, delta)`, `decide(upper, T)`. Tests `src/tests/engine/ipe_core.test.js`.
- `src/ipe_run.js <season> <s0> <s1> [slots] [arms]`: RUN IT FROM `src/` (a run from the repo root failed with "Cannot find module"). One arm-23 draft per (slot, seed), then arms 66 baseline, 67 placebo (second-best streamer in odd weeks), 68 model streaming, 69 model lineup, on the same rosters. Arm 66 reproduces stored arm 23 exactly (seeds 145-146, slots 4 and 7). `IPE_OUT=<dir>` writes elsewhere (smoke runs). Speed: about 3 s per draft for all four arms. Stored arm 23 seeds in use: 145-176; use 181+ for new runs.
- Observed in one test season (not a result): the model streaming arm changed 26 of 92 picks; `lineupRank` was called once, because the 10-player active cap rarely binds with 12 rostered, so the lineup decision may matter very little (the screen will say).

Next:
1. Run the pilot from `src/`: `for s in 2022-23 2023-24 2024-25 2025-26; do node ipe_run.js $s 181 190 & done; wait` (200 drafts, about 10 min, writes `src/results/bt_real_*_a66..a69_181-190.json`).
2. Before reading any screen result: from those rows get the s.d. of the per-draft paired prize-equity difference (arm 67 vs 66 is the placebo, so its mean should be about 0), time per draft, and beta (slope of prize on `me`); fix `gateT` inputs (n affordable, delta) and write `src/results/ipe_gate.txt`; commit it. The analyst (Opus, high) judges the placebo design and the gate numbers (checkpoint A1).
3. Then screens: `python src/prize_equity.py 68:66 69:66 67:66` is already the full paired PE for streaming and lineup, since ipe_run scores whole seasons (so the "flip screen" can also be read as an exact re-score); add the flip-rate report (`src/ipe_stream.js`) and the trade screen (`src/ipe_trade.js`: synthetic offers at weeks 4, 8, 12, `trade_core.evaluateTrade` vs z-sum, replay with `opts.trades`; needs an adapter like calib_ros's `TeamWin.engCtxFrom`). Analyst checkpoints A2/A3, then records in the ledger worktree (rows 161-163, archive write-up, handoff).
