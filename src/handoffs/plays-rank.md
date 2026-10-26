# plays-rank (#140 measured, #141 rank-based Plays %)

Status: **Rejected** (2026-10-26). Branch `plays-rank` is pushed and stays unmerged; merging it is optional (code is off by default).

## State

The draft Model pick fills unfilled slots with a typical player at that pick (Gaussian window around the j-th best available by adpE, `engine.js:445-463`), not the end-of-draft average (that is only the Gain baseline `rep`). Plays % by roster rank (10 of 12 cap): ranks 1-10 play 99.5-100%, 11th 97.6-99.2%, 12th 94.3-97.9%, ~0.2% of team games (#80 confirmed). `stream_sim.js` has an opt-in `opts.rankLog`.

## Decisions

- #141 = `cfg.playsRank` in `Engine.evaluate` (slots 11/12 scaled 0.985 / 0.96), arm 65 in `bt_real.js`. Paired backtest vs arm 23 (4 seasons, seeds 145-160, n 320): prize equity -0.2 ± 0.1, actual prize -0.8 ± 0.5. No gain, so **not added to the Model pick** (user, 2026-10-26).
- Raw results saved in `C:\Users\Fefe\Documents\courtside-backtest\saved-2026-10-26\plays-rank\`. Write-up: archive 141.

## Next

Nothing. If the flag is ever wanted: turn on in `app.html` MODEL cfg, `rankings_core.js:15`, `league_core.js:97`, rebuild, run `perf.js`, reviewer, PR.

On resume: `git checkout $(git merge-base HEAD origin/main) -- src/SESSION_HANDOFF.md`, then merge origin/main.
