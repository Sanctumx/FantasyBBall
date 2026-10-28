# Branch ir-finder-bias (#153)

State: built, tests pass (452), browser `inseason_page.mjs` all pass (private port), pages rebuilt. Reviewed. Released on the user's /release (2026-10-28).

What changed (`src/trade_core.js`, `src/inseason.html`):
- `perceived(ctx, pp, fillOwner)`: an IR player's missing games are filled by the worst non-IR player of the team that holds him after the trade (user, 2026-10-27: "in a trade it swaps"); `evaluateTrade` values both sides' players with B's fill. The worst-line fill stays (analyst's "drop the fill" was refused).
- `evaluateTrade` roster cap: a side left with more non-IR players than `max(L.maxPlayers, its current non-IR count)` drops its lowest-value ones; returns `drops`; the Analyzer shows "Roster limit 12: <team> drops <player> (lowest value)". `CAND_VER` v3 -> v4 (the #151 bump never landed).

Numbers (fixture league, 2145 `tradeCandidates(ctx,'any')` rows, scratch dump before/after): M2 top-25 IR gives 25 -> 4, 10 distinct gives (pass); M3 clean rows identical (pass); M1 IR-give likelihood median/max 0.237/0.772 -> 0.180/0.763 vs clean 0.037/0.263 (FAIL: threshold not met, the fill is kept); IR-give rows with dA > 0: 150/165 -> 26/165; dB changed in 263 rows; slope old dB on new dB 0.977 (winM not refit).

Next: none once merged; delete this note after the merge. The #153 row and archive entry are in the ledger (M1 fail, fill kept).
