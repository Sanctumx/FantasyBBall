# Settings Tab Implementation Plan

> Execute inline (superpowers:executing-plans), task by task, tests first. Spec:
> `docs/superpowers/specs/2026-10-20-settings-tab-design.md`. Drafted by the planner (Opus), condensed here.

**Goal:** `settings.html` holds the league settings and the Fantrax league in one shared store (`src/league_store.js`, global
`LeagueStore`). Draft, League, Matchup and Trade read it and have no league setup of their own. Engine untouched.

**Rulings (user, 2026-10-20):** (a) League Dashboard analyzes the loaded league's current Fantrax rosters, not a draft.
(b) Load overwrites the settings it fetches, with a one-line note. (c) Draft is separate: Load never touches picks, log or slot;
slot, order, draft field and saved drafts stay on Draft; Draft gets an "Import draft from league" button. (d) Team picker on every
tab, not shared, remembered per tab keyed by league id. (e) Settings is the fifth toolbar link; Draft loses `#setup` league fields
and `#sync`; League and Matchup/Trade lose `#src`; `DEFAULT_LEAGUE` goes; tabs show a "Load a league in Settings" prompt until a
league is loaded; Draft works on defaults. Decisions: saved draft with other league settings asks first, then switches Settings
to them; shrinking teams/roster drops extra picks (as today) with a warning line in Settings; League leaves IR players out (counting
IR is tabled, #109); auto-sync resumes on Draft while the draft's league is the one in Settings; the board artifact runs on default
league settings.

**Facts:** Fantrax public league data has no scoring, categories, IL or league name: Load fills teams, roster size and lineup slots
only. The Worker serves the repo root, so no page list to edit. Build (this PC has no `python3`):
`cd src && python gen.py && python build_site.py && cp site/index.html ../index.html && cp site/league.html ../league.html && cp site/inseason.html ../inseason.html && cp site/settings.html ../settings.html`.
Unit tests: `node --test src/tests/` (pass the directory). Browser checks: copy `src/tests/browser/X.mjs` into the Playwright folder,
`REPO=<repo root> node X.mjs`, repo root served on :8765; last line `ALL PASS`.

## Tasks

0. **Branch** `settings-tab` (done), IDEAS rows 108/109 (done), config edits (done).
1. **Store core** `src/league_store.js` + `src/tests/league_store.test.js`. `KEYS {settings:'courtside-settings-v1', board, leagues, inseason}`;
   `LEAGUE_DEF {teams14, roster12, scoring'h2h', cats9, asb'merged', poStart18, poFmt'2-2-2', ilSpots3, luSplit true, luC2, luG3, luF3,
   luGC0, luFC0, luU2}`; `LEAGUE_KEYS` = its keys + `luFx`; `LU_MAX`, `SLOT_OK`, `slotElig`, `slotName`, `lineupSlots` moved from
   app.html 525-554; `normalize(s)` (league keys only; invalid value becomes the default; luFx kept only if valid); `load(get)` ->
   `{settings, league:{id,name,teams:[{id,name,record?}],loadedAt}|null, note, migrated}` (never writes; migrates from board cfg league
   keys, board fx, inseason leagueId, newest saved league; settings key wins once written; corrupt JSON gives defaults);
   `save(set,state)` writes `{v:1,settings,league,note}`; `local` safe wrappers; `savedLeagues/rememberLeague/renameLeague/forgetLeague/
   defaultTeam` ported from app.html 884-925 (custom name kept, myTeam kept when null passed); `pickTeam(remembered,ids,fallback)`;
   `NO_LEAGUE_HTML = 'Load a league in <a href="settings.html">Settings</a> to use this tab.'`.
2. **Fantrax/schedule helpers** in the same module + `league_store_fx.test.js`: `fxSlots(league)` (app.html 530-543);
   `applyFantrax(settings, league) -> {settings, changes, note}` (teams from teamInfo clamp 4-20, roster from
   rosterInfo.maxTotalPlayers clamp 8-25, lineup via fxSlots as app.html 938-942; note `Updated from Fantrax: Teams a → b · Roster size a → b ·
   Lineup <slotNames>.` or `Settings already match Fantrax.`); `teamsOf(league, standings)`; `weekPlan`, `playoffRounds`, `clampPoStart`,
   `withAsb` (app.html 625-637, 664-665, 715); `fxDraftPlan(draft, teams, roster, league) -> {order, items:[{k,t,fid}], skipped, error}`
   (k from pickInRound or pick; error `Settings say N teams; this league's draft has M. Load the league again in Settings.`).
3. **Toolbar + build wiring + empty page:** `TOOLBAR_HTML` fifth link `['settings','settings.html','Settings']`; `gen.py` writes
   `courtside-settings.html` and injects `/*__STORE__*/` (league_store.js) into all four pages; `build_site.py` writes `site/settings.html`;
   CLAUDE.md build line and blocked list; create `src/settings.html` from league.html's head/style.
4. **Settings page:** panels "Fantrax league" (`#fx-form #fx-league #fx-load #lg-row #lg-sel #lg-name #lg-go #lg-ren #lg-del #fx-team #fx-off
   #fx-status #fx-text #fx-note`) and "League settings" (`#s-teams #s-roster #s-scoring #s-cats #s-asb #s-po #s-pofmt #s-il #s-lupos #s-luc
   #s-lug #s-luf #s-lugc #s-lufc #s-luu #lu-fx #poHint`, options copied from app.html 363-385). Load: parse id (app.html 1006-1008), fetch
   league/rosters/standings with fxGet/backoff/nohost (app.html 837-863), `applyFantrax`, set league, save, `rememberLeague`. Failed Load
   (e.g. 429) leaves state unchanged. Deleting the active league unloads it. Warning line when the board has more picks than the new size.
   Browser check `settings_page.mjs`: migration seed, Load note exact text, board string byte-identical, team default, persistence, 429, unload.
5. **Draft reads the store:** `#setup` keeps only `s-slot s-order s-field` plus `#lg-sum` ("League: N teams · … · Edit in Settings");
   `DEF = Object.assign({non-league keys}, LeagueStore.LEAGUE_DEF)`; `cfg = migrate(Object.assign({}, DEF, saved.cfg, LS.settings), saved.cfg)`;
   `storage` event re-reads the store live; saved-draft Load with other league settings asks first, then writes them to the store.
   **Record a baseline first** (clock, Your team, Model pick, top 10) before editing; check `draft_settings.mjs` proves identical output.
6. **Draft's Fantrax draft panel:** `#sync` becomes "Fantrax draft" with `#fx-import` ("Import draft from league"), `#fx-team`, `#fx-auto`,
   `#fx-now`, `#fx-off` ("Stop syncing"); no league in the store disables Import and links to Settings; `fxImport()` uses `fxDraftPlan`;
   team-count mismatch shows the error; auto-sync resumes only if the draft's `fx.leagueId` equals the store's league; draft's team choice
   stays in board `fx.myTeam`, never writes saved-league myTeam.
7. **League core:** `League.sourceFromRosters(league, rosters, standings, fxPlayers, PLAYERS, settings, myTeam) -> {cfg, picks, owner, extra,
   names, ids, ir}` (teams by standings rank then name; IR players excluded and listed; R = max(settings.roster, largest non-IR count);
   open spots keep their team as owner); remove `listSources/sourceFromStore/sourceFromFantrax` (keep matching code as private `matchFx`).
   Parity test: rosters equal to a full draft give the same matrix and ranks as that draft.
8. **League tab:** remove `#src`, add `#lgname`; `load()` fetches league/rosters/standings/players (keep retry, nohost, loadSeq); `ui.teamBy
   {leagueId: team}`; no league shows `NO_LEAGUE_HTML`; rewrite `league_page.mjs`, update `league_sort.mjs`, delete `league_vs_board.mjs`,
   update `league_how.mjs` labels.
9. **Matchup/Trade:** remove `#src`, `DEFAULT_LEAGUE`, `fillSources`; league id from the store; `ui.teamBy {matchup:{id:team}, trades:{id:team}}`
   (old `ui.team` copied into both then dropped); `teamFor(tab) = pickTeam(ui.teamBy[tab][id], ids, defaultTeam(get,id))`; empty storage shows
   `NO_LEAGUE_HTML` and makes no request; update `inseason_page.mjs`.
10. **How it works + records:** app.html 331-354 text (Settings and Fantrax, League Dashboard on current rosters, Limits, In-season tools); IDEAS
    108 to Adopted, archive write-up, handoff (architecture, defaults). Run all unit and browser checks, smoke all five pages, then the `reviewer`
    subagent (Opus) on the branch diff.

**Review focus:** Draft open while Settings changes (storage event); 429 during Load keeps old state; removing the active league; remembered team
no longer in the league; an existing user who never opens Settings (migration on first load of any page; corrupt storage). Hard-area check: league
keys missing from `LEAGUE_KEYS` or overlay order could silently change Draft's `cfg`; task 5's baseline parity check catches both.

**Out of scope:** Fantrax scoring/cats/IL/playoff start; analyzing a saved draft on League; counting IR on League (#109); Matchup/Trade for 8-cat
or roto scoring; any engine or backtest change.
