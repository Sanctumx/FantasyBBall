# kmatch-fit

State (2026-10-29): `K_MATCH` is back to 0.72 (commit a951bd5, test first, pages rebuilt). Reason: the .78 raised earlier the same day came from #157 line P, which measured the Team tab's forecaster; `K_MATCH` is used only on the fractional-games path of `matchup_core.scoreSegments` (later weeks, preseason lines, `Engine.pairMatchup`, gVar 1.87).

#158 re-fit BUILT and RUN: `src/calib_kmatch.js` (pure helpers `pfGames`, `pooled`, `verdict` tested in `src/tests/engine/calib_kmatch.test.js`; rules fixed in the file header), `src/run_calib_kmatch.bat`. Seeds 81-100, 4 seasons, 9 s on this PC. Result: pooled k .71 +-.05 (2025-26 .76, 2024-25 .62, 2023-24 .83, 2022-23 .64); Brier(.78) - Brier(.72) +.0001. Rules: INCONCLUSIVE, but the data sit on .72 (the calib_pair fit), 1.4 SE below .78. Nothing to change in the app. Output `src/results_calib_kmatch.txt`, `calib_kmatch.json` (untracked). In a frozen-roster, preseason-line sim the week-w forecast does not depend on the checkpoint, so the fit is per season over all weeks, not per lag (the analyst planned lag 1; no difference here).

Not done: the analyst has not judged the result; the ledger (row 158 Done not adopted + write-up) is not updated; the optional live PF arm on the real LOFB league was not built.

Next: ledger row 158 (landed on the user's word), then idea: the in-season model scoring in prize equity (brainstorm with the user first).
