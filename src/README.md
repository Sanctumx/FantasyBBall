# Courtside Draft Kit: source, data and backtests

Everything here runs from inside `src/` (scripts use relative paths).

## Build the board
1. Edit `engine.js` (model) and `app.html` (page template with `/*__DATA__*/`, `/*__SCHED__*/`, `/*__ENGINE__*/` placeholders).
2. `python3 gen.py` → `courtside-draft-board.html` (template + players.json + sched.json + engine.js).
3. `python3 build_site.py` → `site/index.html`, `site/league.html`, `site/inseason.html` (full HTML documents). Copy them to the repo root to deploy.
   `gen.py` also builds `courtside-league.html` and `courtside-inseason.html` (the latter adds `inseason_league.js`, `inseason_players.js`, `matchup_core.js`, `trade_core.js` and `sched_days.json`).

## Data
| File | What | Made by |
|---|---|---|
| `players.json` | 234 players: BBM 2026-27 projections, Fantrax ADP (`ftx`), back-to-back rest rate (`b2b`) | `data/BBM_Projections.xls`, then `b2b.py` adds `b2b` (writes `players_b2b.json`; copy over `players.json`) |
| `sched.json` | 2026-27 fantasy weeks, games per team per week, back-to-backs per team per week | `sched_b2b.py <nba-2026-UTC.csv>` adds `b2b` |
| `sched_days.json` | 2026-27 daily tip-off times per team (UTC seconds), for the in-season tools' expected games | `sched_days.py` |
| `stats/espn.json` (repo root) | ESPN per-game season stats for every player, for players without projections and current form | `collect/espn_stats.mjs`, daily by `.github/workflows/collect-stats.yml` |
| `stats/box-YYYY-MM.json` (repo root) | every player's box-score line per completed game (columns min fgm fga ftm fta tpm pts reb ast stl blk to; game date = New York date), for Rankings windows | `collect/espn_box.mjs`, hourly with the stats run in `collect-stats.yml` (`dates` input backfills) |
| `logs3.csv` | NBA player game logs 2023-24 to 2025-26 (one row per player-game) | `pq2csv.mjs` from the Hugging Face dataset `cbratkovics/nba-game-logs` (game_logs_2023-24/24-25/25-26 .parquet) |
| `bt_data.json` | Backtest seasons 2024-25 and 2025-26: prior-season stats as projections, synthetic noisy ADP, weekly actuals | `bt_prep.py` (reads logs3.csv) |
| `bt_daily.json` | Daily player stats for the realistic-league scoring sim | `mk_daily.py` (reads logs3.csv and bt_data.json) |

`pq2csv.mjs` needs the pure-JS parquet reader: `git clone --depth 1 https://github.com/hyparam/hyparquet` inside `src/`, then
`node pq2csv.mjs logs3.csv game_logs_2023-24.parquet game_logs_2024-25.parquet game_logs_2025-26.parquet`.

## Fits and checks
- `fit2.py`: per-game variance fits (used in `engine.js` weekVar) from logs3.csv.
- `calib.js [old|factor]`: calibration of matchup predictions vs actual weekly results (Brier score).
- `syn.js`: punt synergy (category co-weakness correlations).
- `perf.js`: engine speed per pick.

## Backtests (Node; each takes `2024-25` or `2025-26` as the argument, run both in parallel)
- `backtest.js`: `draft(season, slot, seed, cfgExtra, opp)` and simple all-12 scoring. `opp`: `{n, gamma}` punting opponents, `{model}` opponents drafting with the board.
- `stream_sim.js`: `scoreLeague()` realistic scoring: daily 10 active of 12, 2 IL spots, 4 adds/week streaming.
- `bt_run.js` (Auto β/τ grid and locked punts), `bt_run4.js` (strategy sets), `bt_opp.js` (punting opponents), `bt_model2.js` (board-using opponents + Board users setting), `bt_corr.js` (correlation on/off), `bt_lock.js` (re-lock best strategy), `bt_stream.js` (IL fill / streamer baseline under realistic scoring).
- Results are written to `results/bt_*_<season>.json` (via `results_path.js`; summaries also read `src/` for runs from older checkouts); compare configs paired by (season, slot, seed).

See `SESSION_HANDOFF.md` for decisions, constraints and the next steps.
