# Current model, defaults and architecture

Stable reference, moved out of `SESSION_HANDOFF.md` (2026-10-21) so it isn't read every session. Read it when a task
touches the engine, the Model pick, defaults, backtests or the build. Edit in place when one of these changes.

## Current model (backtested in the user's format with real projections)

- **Zscore** = Σ z_c·W_c vs an average drafted player, scaled by team-total SD from ADP draft sims (ROTO-Adjusted). Zscore
  type Standard / H2H-Adjusted are display only (#63). Weights affect Zscore only, never Win.
- **Win C / Win M:** Φ-based category / matchup win chances, fitted weekly variances, shared weekly-games factor.
- **Model pick (on the clock):** logistic value-to-fit, fit share 1/(1+e^(−2(i−1.5))) by your pick index i (value 95 / 73 /
  27 / 5% at picks 1-4). Value = 50/50 standardized soft −1 Zscore (unweighted, TO ×1, worst category at half) + Win C; fit =
  Win M + two-pick look-ahead over the top 4 by Win M and top 4 by value (#55, #32). Off the clock: Likely pick = Win M ×
  availability.
- **No punting:** Punt always Off; manual punt = ×0 weight (Zscore only).
- **Availability:** adpSd v2 = √((0.42·ADP^0.68)² + (0.05·ADP)²); room's value side = Standard Z with TO ×0.5 (`fieldZ 'std'`,
  #69). Draft field Easy / Average / Strong / Very strong = f 0.08 / 0.31 / 0.46 / 0.62.
- **Games:** Season basis for the Model pick; IL fill 0.47 / 0.70 / 0.79 / 0.81 for 1-4 spots; GPW 3.42, VAR_GAMES 0.82.
- **Scarcity:** concentration + depletion index, information only (#83, #90).

## Defaults (DEF in `src/app.html`, basisV 12)

- League: 14 teams, slot 1, 3RR, roster 12, H2H each category, 9-cat, All-Star merged, playoffs week 18, 2-2-2, Draft field
  Easy, IL 3, lineup PG SG G SF PF F C C U U.
- List: Zscore type Standard, Zscore Normal, Stats Raw, Playoff boost Off, Basis Per game, Projections Average, # order and
  Edge vs Zscore, weights ×1 with TO ×0.5.

## Architecture

- Single self-contained HTML page (vanilla JS) built from a template plus a pure-JS engine; Node for engine and backtests,
  Python for data prep, Playwright for UI checks. Build and test commands are in `CLAUDE.md`; data pipeline in `src/README.md`.
- `src/engine.js` (the engine), `src/app.html` (board template), `src/league.html` + `src/league_core.js` (League Dashboard),
  `src/shared.js` (name matching, projection blend, toolbar), `gen.py` / `build_site.py` (build), `worker/index.js` (Worker),
  `src/collect/` + `.github/workflows/collect-drafts.yml` (collector).
- Data: `players.json` (234 players, BBM + Hashtag `hs` + Fantrax `ftx`), `sched.json`, `logs3.csv` / `logs_early.csv`,
  `bt_proj.json` (real preseason projections 2022-26).
- **Backtests:** `bt_real.js` with arms; baseline arm 23. World: seasons 2022-26, real projections and ADP, 14 teams, 3RR,
  each category, 3 IL, field Average; opponents 2 kit users, 2 punters, 4 sharp, 5 ADP; seeds 145-160 (161-176 used by run 35; fresh from 177) × slots
  1/4/7/10/14. PC runs: the user double-clicks a .bat in `C:\Users\Fefe\Documents\courtside-backtest`.
- League facts (user's): Fantrax, 14 teams, 4 adds/week, no games cap, 10 active + 2 bench, 3 IL.

## Points leagues (#137, 2026-10-26; Rankings and Team tabs only)

- FP per game m = sum of weight x stat over pts, reb, ast, stl, blk, to, tpm, fgm, fga, ftm, fta (`points_core.js`; fgm = fgp x fga, ftm = ftp x fta). Season multiplies by games, Mix by the midpoint of the player's games and the top teams x roster players' mean games.
- One FP total goes into category slot 3 (`Points.FP_SLOT`) of copies of the players and the context (`Points.engineView`), and `Engine.evaluate` runs unchanged: Win M = 100 x gainC[FP_SLOT]; a match chance is `catProb` of that slot. With one stat scored, every FP number equals the engine's number for that category (tested to 1e-12).
- Variance: games-played part m^2 x 0.82 and the 12% projection error as in the categories; game-to-game noise uses the engine's per-stat fits (and variance/mean 1.225 fgm, 1.406 fga, 2.004 ftm, 2.182 fta from `points_fit.js`) combined with the measured within-player per-game correlations (logs3.csv, 723 player-seasons; pts-fgm 0.94, ftm-fta 0.94, fgm-fga 0.78, pts-fga 0.75, pts-tpm 0.66). Correlations raise Yahoo-style FP variance about 1.4x and ESPN-style about 1.2x over independent stats. pts = 2 fgm + tpm + ftm exactly, so rho is positive semidefinite, not definite; quadratic forms are clamped at 0.
- Team noise: the engine's 80 simulated ADP drafts (`Engine.draftSims`), same SIGMA_G2 games factor and formulas as `scaleFor`.
- No shrink toward 0.5 (as on the categories' Rankings and Team win numbers). Win M for points is not calibrated on real weeks (IDEAS #143).
