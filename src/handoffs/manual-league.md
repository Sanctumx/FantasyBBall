# manual-league (save leagues by hand, for Yahoo)

Branch `manual-league` from origin/main, not pushed, not reviewed. Unit tests and `manual_league.mjs` plus the Settings, Team, League, Matchup, Rankings, draft and cache browser checks pass.

## Done 2026-10-26
- `src/league_store.js`: manual leagues. `parseYahooRosters` reads a pasted Yahoo "Starting Rosters" page (all teams, slots, bench, IL), `parseSlotList`, `makeManual`, `manualAnswers(ML, SCHED)` (Fantrax-shaped league/rosters/standings/players plus an estimated round-robin schedule), `saveManual`/`manualLeague`/`forgetLeague` cascade, `exportLeague`/`parseLeagueImport`/`copyLeague`, `manualHook`. Stored in `courtside-manual-v1`; the saved-league record gets `manual:true`.
- `src/fx_cache.js`: `create({ manual })` answers from the hook, never stores, works offline.
- Settings: "Manual league" panel (paste, Create, Update rosters of selected, Export file, Import file with replace / keep both).
- Team, Rankings, League, Matchup/Trade pass `manualHook`; `team.html` and `inseason.html` now include `SCHED`. Draft board's Import draft is off for a manual league.
- Decisions taken from the planner's defaults: estimated schedule (A), no W-L records (B), unmatched names kept as waiver-level (C).

## Next
1. A `reviewer` (Opus, effort high) was dispatched on the branch diff and had not reported when this was written: re-run it if its report is lost, then fix findings test-first.
2. Not done: players cannot be edited one by one (re-paste with "Update rosters"), Matchup/Trade do not yet say the schedule is estimated, no "not in the projections" count at paste time. Yahoo position eligibility is not passed on (projection positions are used).
3. The user has not answered decisions A/B/C; the defaults above are in force. Their Yahoo league is /nba/50157; the full 10-team paste worked only as a 2-team fixture (`src/tests/fixtures/yahoo_starting_rosters.txt`), so try the real paste in Settings.
4. `src/tests/rankings_core.test.js` has uncommitted edits from another session in this checkout; not mine, left alone.
5. Ledger: claim an IDEAS row (`ledger.mjs next`) for manual leagues; push only when the user says.
