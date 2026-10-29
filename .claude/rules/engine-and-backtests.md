---
paths:
  - "src/engine.js"
  - "src/backtest.js"
  - "src/stream_sim.js"
  - "src/bt_*.js"
  - "src/*.py"
---

# Engine and backtest rules

This is a hard area: the `planner` subagent plans the change first, and the reviewer runs on Opus.

- The Model pick always runs on `MODEL_CFG` (Season, Average projections, Playoff boost Off); display settings never
  change it (IDEAS #75).
- Backtest before changing anything the Model pick uses: paired drafts against arm 23, ± SE, split by season, and a
  confirmation on fresh seeds. The `analyst` subagent designs the test and judges the results.
- Report results in prize equity (`python3 src/prize_equity.py <arm>:<baseline> ...`).
- Category weights never affect Win.
- Don't add settings that backtests show do nothing.
- Results from the old backtest world (IDEAS items before 50) are not evidence for the current board.
- When the engine changes something a backtest mirrors, check parity (identical drafts on a few seeds) and that arm 23
  still reproduces.
- Large data and result files (`logs*.csv`, `bt_daily.json`, `bt_data.json`, `results/bt_*_*.json`, `data/*.xls*`) are blocked
  from reading. Inspect them with a short node or python snippet that prints only what you need.
