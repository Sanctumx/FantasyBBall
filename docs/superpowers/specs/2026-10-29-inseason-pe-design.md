# In-season models scored in prize equity — design

Date: 2026-10-29. Branch: inseason-pe (spec only; nothing built). Status: written, awaiting the user's approval.

## Intent

The in-season models (Matchup Analyzer win chances, Team/Trade/Rankings shrink k .60/.75, trade evaluation, lineup scores) are judged today by Brier and calibration slope only; rows #156-#158 all record "PE 0". Calibration does not say whether a model changes anything a manager does. The user wants each decision (streaming pickups, trades, weekly lineup) scored in prize equity, and wants any model that does not alter results to be dropped from further tuning (user, 2026-10-29: "if they won't meaningfully alter results then they are not needed").

## Goals

1. For each of the three decisions, measure how often the model's choice differs from a plain baseline and how much expected category-win share is at stake when it does (the **flip screen**).
2. For a decision that clears the gate, run a paired season simulation (model arm vs baseline arm) scored with `prize_equity.py`.
3. Record per decision: matters / does not matter, with numbers, in `IDEAS.md` and the archive.

## Non-goals

- No change to the draft Model pick, the engine, or `prize_equity.py` itself.
- No change to shipped defaults (`K_MATCH`, `WinK.SHRINK`) inside this work; a finding that a default should move becomes a new idea row.
- No new trade or waiver-rule simulator unless the trade screen clears its gate.

## Anti-goals

- A "does not matter" verdict from a screen that could not have seen a small, season-long effect. The gate must be set so it errs toward running the full simulation (see Gate).
- Teaching the baseline to be dumb so the model looks good. The baseline is the rule the app or `stream_sim.js` already uses without the model.

## Constraints (from the code, 2026-10-29)

- `src/stream_sim.js` `scoreLeague` (line 23) picks streamers by z-sum value (`perGameValue`, lines 6-12) and games in the period; it uses **no win chance and no k**. Output `{rates, weekTot, played}`. `bt_real.js` (line 106-108) wraps it: draft, `scoreLeague`, `titleScore`, row `{season, arm, slot, seed, me, made, ...}` that `prize_equity.py` reads. Seasons 2022-23 to 2025-26 from `bt_daily.json` / `bt_data.json` (blocked files: inspect with snippets only).
- No trades and no lineup decisions exist in the backtest, and there is no historical trade data. Trade offers would be synthetic.
- Headless-callable: `src/trade_core.js` (`evaluateTrade`, line 61; UMD), `src/team_win.js`, `src/matchup_core.js` (`scoreSegments`, K_MATCH .72, K_CAT .82), `src/win_k.js`. Lineup: `src/team_view.js` `autoFill` (lines 195-217) is pure; headless status unverified.
- Hard area: anything that changes what the Model pick sees must stay untouched; this work adds scripts and arms only.

## Approaches (chosen: A)

- **A. Flip screen first, full prize equity only where it survives (chosen by the user).** Cheap replay comparison of model choice vs baseline per decision; full paired simulation for survivors. Risk: misses small effects that accumulate; mitigated by the gate.
- B. Full prize-equity simulation for all three. Direct, but needs many seeds for effects near 0.1 title-equivalents and needs a trade simulator that does not exist.
- C. Streaming only, using `stream_sim.js`. Cheapest, but leaves trade and lineup unanswered.

## Design (A)

Each decision gets a **model arm** and a **baseline arm**, defined on the same replayed state.

| Decision | Baseline (existing rule, no win chance) | Model arm (proposal, my call) | Replay state |
| --- | --- | --- | --- |
| Streaming | `stream_sim` rule: best value (z-sum), then games in period | Pick the free agent with the largest gain in expected category wins vs the week's actual opponent, using `matchup_core` with the shipped K_MATCH / K_CAT | Backtest seasons: each team's roster, free-agent pool, and week's opponent from `bt_daily` / `bt_data` |
| Lineup | `autoFill` by plain scores | Lineup that maximizes `matchup_core` win chance vs the actual opponent | Same weeks and rosters |
| Trade | Accept when the plain z-sum value gain > 0 | `trade_core.evaluateTrade` accept/reject | Synthetic offers generated from simulated rosters (1-for-1 and 2-for-2 within a value band); no real history |

**Flip screen metrics per decision:** flip rate (share of decisions where arms differ); for flips, mean difference in expected category-win share (model's forecast vs baseline's, both scored on the actual outcome); the same difference in realized actual category wins with a bootstrap interval across weeks.

**Gate (my proposal, to be fixed in the plan before any run):** run the full prize-equity simulation if the realized mean gain per decision times the number of decisions per team-season, converted to win-rate shift, could reach 0.5 SE of the paired prize-equity estimator at the affordable seed count; otherwise (and only if the interval excludes that size) record "does not matter". An interval that cannot exclude the size is "inconclusive", not "does not matter".

**Full run (survivors only):** new arms in `bt_real.js`-style runs (model arm vs baseline arm, same drafts and seeds), scored by `prize_equity.py` paired against the baseline arm, as #141 did. Results to `src/results/`.

**Outputs:** a script per decision (names left to the builder), unit tests for the pure helpers (decision pickers, gate arithmetic), a results text file, IDEAS rows (next numbers via `ledger.mjs next`), archive write-up, handoff Next line.

## Settled after the builder check (my calls unless marked; the user can overturn them)

- **Replay state is the simulated league, not real history.** Checked: `bt_data.json` holds, per season, 260 players with weekly lines, and `bt_daily.json` per-player daily stat rows; there are no real rosters, free-agent pools or opponent schedules. The state is what the backtest itself builds: `backtest.js draft()` rosters, the unrostered rest of the 260 as the pool, and the opponent from `stream_sim`'s schedule. A decision is one team-week (period rules as `stream_sim`: Mon-Thu / Fri-Sun, 2 open spots, add caps as in `opts`); a lineup decision is one team-week.
- **No leakage.** Both arms see only information a manager has at decision time: preseason lines plus stats to date, the same inputs the `calib_*` forecasters use. Realized week stats only score the outcome.
- **Pilot first.** The plan starts with a small pilot to estimate the paired prize-equity SE per seed and the PC time per run; the gate arithmetic is then fixed from it, before any screen result is read.
- **Trade screen replays rest of season.** It reports flip rate and the model's forecast gap, and also plays both rosters through the rest of the simulated season to get a realized difference. Without the replay it cannot say anything about benefit.
- **Order and independence.** The three screens are independent; streaming goes first (harness exists), then lineup, then trade. A failed gate on one does not skip the others.
- **`team_view.js`:** extracting `autoFill` into a pure module is allowed if a test proves the Team tab's output is unchanged; the built pages are rebuilt, not hand-edited.

## Left to the builder

Script names and layout; seed count; the exact gate arithmetic (within the rule above); how to build synthetic trade offers; whether the lineup screen needs a headless extraction of `autoFill`; the analyst judges the design of the runs and the results.

## Open for the user

- The model-arm definitions above are my proposals; the user has not confirmed them.
- PC runs: any long run needs the user's go-ahead first (standing rule).
