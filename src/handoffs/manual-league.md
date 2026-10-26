# manual-league (save leagues by hand, for Yahoo)

Branch `manual-league` from origin/main, not pushed, not reviewed. Unit tests and `manual_league.mjs` plus the Settings, Team, League, Matchup, Rankings, draft and cache browser checks pass.

## Done 2026-10-26
- `src/league_store.js`: manual leagues. `parseYahooRosters` reads a pasted Yahoo "Starting Rosters" page (all teams, slots, bench, IL), `parseSlotList`, `makeManual`, `manualAnswers(ML, SCHED)` (Fantrax-shaped league/rosters/standings/players plus an estimated round-robin schedule), `saveManual`/`manualLeague`/`forgetLeague` cascade, `exportLeague`/`parseLeagueImport`/`copyLeague`, `manualHook`. Stored in `courtside-manual-v1`; the saved-league record gets `manual:true`.
- `src/fx_cache.js`: `create({ manual })` answers from the hook, never stores, works offline.
- Settings: "Manual league" panel (paste, Create, Update rosters of selected, Export file, Import file with replace / keep both).
- Team, Rankings, League, Matchup/Trade pass `manualHook`; `team.html` and `inseason.html` now include `SCHED`. Draft board's Import draft is off for a manual league.
- Decisions taken from the planner's defaults: estimated schedule (A), no W-L records (B), unmatched names kept as waiver-level (C).

## Next
1. Reviewer reported (2026-10-26); fix these test-first in `src/league_store.js` / `settings.html`:
   - MUST: `manualAnswers` has no `rosterInfo.maxTotalActivePlayers` (set it to `settings.luFx.length`) and BN players are `ACTIVE` (keep each player's slot in the parse; BN -> `RESERVE`, NA -> non-active). Without it `parseLeague().maxActive` is undefined: Team averages NaN, nightly cap lost. Test `maxActive === 10`, BN `RESERVE`, finite Team avg.
   - MUST: `parseYahooRosters` lookahead (`k <= j + 4`) runs into the next slot, so an empty slot swallows the next player (`SG` + `(Empty)` + `BN` + Kyrie). Stop at the next slot line; count an empty slot toward starters/bn/il without adding a player.
   - MUST: `manualSchedule` periods end at local midnight, so each week loses its last day (period 2 = 6 days). Copy the Fantrax times (start 19:00 ET, end 18:59:59 ET of the next start's day); test `periodDays(p).length === 7`.
   - SHOULD: `ilSpots` is the most IL players any team has (not capacity), NA players count in no limit, so Import can fail ("16 players; roster holds 15"); Update rosters keeps old roster/ilSpots. `saveManual` reverts a rename on the next `persist()` (make `renameLeague` update ML.name). `manualPid` collides for same-name players (add the team code). `makeManual` clamps teams to 4 for tiny pastes.
   - Reviewer found no problem in fx_cache, forget cascade, import key checks, team-code map, odd team counts, or the Draft import block. Full-suite failures in `rankings_core` come from the other session's uncommitted edits, not this branch.
2. Not done: players cannot be edited one by one (re-paste with "Update rosters"), Matchup/Trade do not yet say the schedule is estimated, no "not in the projections" count at paste time. Yahoo position eligibility is not passed on (projection positions are used).
3. The user has not answered decisions A/B/C; the defaults above are in force. Their Yahoo league is /nba/50157; the full 10-team paste worked only as a 2-team fixture (`src/tests/fixtures/yahoo_starting_rosters.txt`), so try the real paste in Settings.
4. `src/tests/rankings_core.test.js` has uncommitted edits from another session in this checkout; not mine, left alone.
5. Ledger: claim an IDEAS row (`ledger.mjs next`) for manual leagues; push only when the user says.
