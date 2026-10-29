# #145 blend backtest: design and decision rules (2026-10-28)

Written before any result. User approved (2026-10-28): frozen rosters, rebuild `bt_daily.json` with a minutes column. Planner plan + analyst gates.
Nothing ships from this test; wiring a blend into the app is a separate decision.

## Question
Does blending actual in-season stats into the preseason lines make the Team tab's Win M / Win C better calibrated, and does the fitted k stop climbing from week 4 to 16 (#150: .34 -> .68, probably an artifact of frozen preseason lines)?

## Arms (whole games, frozen rosters, seeds 41-60, seasons 2025-26 / 2024-25 / 2023-24)
- **E-ROS-k** control: preseason lines. **STD-k**: season-to-date blend. **L30-k**: last-30-days blend. Unshrunk versions printed, not gated.
- Blend at checkpoint w0 (weeks 4/8/12/16) uses days <= 7*w0-1 (L30: days 7*w0-30 .. 7*w0-1). Everything else as E-ROS: games, 14-day IL stand-in, preseason engine context, projVar.
- Minutes: m' = (m*n0_g + sum min) / (n0_g + gp). Counting stats: rate r' = (r_pre*n0_min + sum stat) / (n0_min + sum min), per game = r' * m'. FG%/FT%: weighted by attempts with n0_a (FG and FT fitted separately). No rows before the checkpoint = preseason line exactly.

## n0 fit (out of sample)
- Grids (each includes 0 and infinity; extend if the fit lands on an edge): n0_g 0,5,10,15,20,30,40,60,82,inf; n0_min 0,100,200,300,500,750,1000,1500,2000,3000,inf; n0_a 0,50,100,200,300,500,750,1000,1500,inf.
- Loss: player-level squared error of the blended per-game line vs actual rest-of-season per game, weighted by remaining games played; counting stats divided by the engine category spread; FG%/FT% scored as (p - actual) x attempts per game. One n0 per family across checkpoints (print each checkpoint's best as diagnostic). Separate n0 for STD and L30.
- Leave-one-season-out: n0 and k_M/k_C fitted on the other seasons only; E-ROS-k gets the same leave-one-season-out k. 2022-23 (HS-matched 165 players only) may join the n0 fit pool, never a G fold; confirmation fold if inconclusive.

## Verdict lines
- SE everywhere = max of outcome-week bootstrap and draft-seed bootstrap, paired (`diffSE` is week-only today: change it).
- **G**: blend arm beats E-ROS-k on held-out matchup Brier by >= 2 SE in each of the 3 seasons, and cats d <= 0 in every season. No multiplicity allowance.
- **H** (judged on STD unless I picks L30): pooled-checkpoint k_M (each checkpoint fitted on all 3 seasons) spread <= .15 and <= half of E-ROS-k's in this run; range of the three single-season in-sample k_M <= .10. If the bootstrap SE of a pooled checkpoint k* > .05, H is "uninformative", not fail.
- **I**: L30 over STD only if >= 1 SE better (paired) on held-out matchup Brier in all 3 seasons; else STD.
- **J**: G pass + H fail: open a k-by-weeks-left row. G pass + H pass: user call on putting the blend in the app's lines with one pooled k.
- **Real effect**: G passes, held-out player RMSE improves at every checkpoint in every season, cats d <= 0. **Noise**: within +-1 SE in >= 2 seasons or sign flips. **Suspicious**: Brier improves but player RMSE doesn't. **Inconclusive**: d < 0 in all 3 seasons but only 1-2 pass 2 SE (confirm on 2022-23).

## Tests first (`src/tests/engine/calib_blend.test.js`)
No look-ahead (deleting rows from day 7*w0 on changes nothing); no rows = preseason line exactly; n0 = 0 gives observed rates, n0 = 1e9 gives preseason; L30 drops older rows; percentages weighted by attempts; fitN0 never sees the held-out season; blend with n0 = inf reproduces E-ROS forecasts bit for bit; L30 = STD at week 4 (21 days fit in 30).

## Output to print
Each fold's n0 per family and window with the loss curve vs inf; held-out weighted player RMSE by stat, checkpoint, source; held-out matchup and cats d +- SE (week SE, seed SE, max) by season and checkpoint; leave-one-season-out k per fold and arm; single-season and pooled-checkpoint k* with bootstrap SE; slopes and bins; survivor counts (no rows before / after the checkpoint); sanity checks above. Check that no 0-minute DNP row counts as a game once minutes exist.

## Files
New `src/calib_blend.js` (pure `blendLine`, `fitN0`), `src/run_calib_blend.bat` (seeds 41-60, one ETA line, no pause); edit `src/calib_ros.js` (sources, leave-one-season-out verdict over all 3 seasons) and `src/mk_daily.py` (append minutes as column 13; indices used by `stream_sim.js` / `calib_pair.js` unchanged). Out of scope: moving rosters (#146), games rate (#144), projection-error variance, any change to the shipped k.
