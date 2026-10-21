# Settings tab: set the league once, every tab reads it

Date: 2026-10-20 · Status: draft for the user's approval

## Why

League settings and the Fantrax connect/sync exist only on the Draft page (`src/app.html`). League, Matchup and Trade each
have their own league picker (`#src`), so the user has to sync per tab. The user wants to set the league once and have all
tabs use it.

## Goals

- A **Settings** tab (fifth toolbar link: Draft, League, Matchup, Trade, Settings; its own page `settings.html`) that holds:
  - the league settings now in Draft's `<details id="setup">` (teams, scoring, cats, All-Star, playoffs,
    roster, IL, lineup positions and counts);
  - the Fantrax connect and sync now in `#sync` (league URL/id box, Load, saved-leagues list with rename/delete, connected
    team, auto-sync, Sync now, disconnect, status line).
- **Load** pulls everything: league settings, team names, rosters, standings. Settings stay hand-editable afterwards.
- One shared store for the active league and its settings. Draft, League, Matchup and Trade all read it; none has league
  setup of its own.
- Delete the league-settings module and Fantrax panel from Draft, and the league pickers (`#src`) from League and Matchup/Trade.
- Every tab keeps a **"my team" picker**. It is **not shared**: choosing a team on one tab does not change the others (user).
- Until a league is loaded, League, Matchup and Trade show a "Load a league in Settings" prompt. Matchup's hardcoded
  `DEFAULT_LEAGUE` goes away.

## Non-goals

- No change to the engine, the Model pick, backtests or any number the board shows for the same settings.
- No new Fantrax data beyond what the tabs already fetch.
- No analysis of a saved draft on the League tab through a source picker (the picker goes; see calls below).

## Anti-goals

- A settings change on Settings must never silently differ from what Draft computes: same `DEF`/`migrate()` rules, same
  saved values (a saved setting is never changed by `migrate()`, IDEAS #79).
- Existing users' saved settings, saved leagues and saved drafts must survive (migrate old keys on first load).

## Constraints

- Edit templates in `src/`, never the built root pages; build with the command in `CLAUDE.md`. Add `settings.html` to
  `gen.py`, `build_site.py` and the build command's copy step, and to the Worker's served files if it lists them.
- Toolbar in `src/shared.js` `TOOLBAR_HTML` (labels: Draft, League, Matchup, Trade, Settings).
- Tests first: unit tests for the shared store; browser checks in `src/tests/browser/` (there is none today for the Draft
  page's connect/settings; add one).
- Branch from `matchup-trade-analyzers` (it holds the unpushed In-Season pages this work edits), not `origin/main`.

## Calls made by the writer (not yet confirmed by the user)

- **Saved drafts** (save/load/export/import panel `#drafts`) stay on the Draft tab: they belong to a specific draft.
- **Draft is separate from the league (user).** Loading a league never loads, changes or clears a draft (picks, log, slot).
  Draft-only settings (slot, order, draft field) therefore stay on the Draft tab with the saved drafts. Settings holds the
  league settings only (teams, scoring, categories, All-Star, playoffs, roster, IL, lineup) and Draft reads them from the store.
- **Import a draft from a league (user):** an explicit "Import draft from league" action on the Draft tab pulls the Fantrax
  league's draft picks into the current draft. It is the only way league data enters a draft; Load never does it.
- **Load overwrites the league settings** it fetches, with a one-line note of what changed (default, not yet confirmed).
- Changing the league settings in Settings while a draft is open does not touch the picks (only the league config the
  board computes from).
- The League Dashboard analyzes the loaded league only; its saved-draft and board sources are dropped. (Open for the user:
  keep a way to analyze a saved draft?)
- A per-tab team picker defaults to the Fantrax "my team" found on Load. Each tab remembers its own pick across reloads,
  keyed by league id, and falls back to the default when the league changes.
- Settings owns the Fantrax connection (league id, saved leagues, status). Draft keeps applying live draft picks and its
  10 s auto-sync while the Draft tab is open, reading the connection from the shared store. Polling stops when the user
  leaves the Draft tab.
- Draft works with default settings when no league is loaded. League, Matchup and Trade show the "Load a league" prompt.
  Matchup's demo `DEFAULT_LEAGUE` is removed. Browser tests stub the Fantrax routes, as the current ones do.
- `settings.html` is wired into the Worker/build lists wherever the other pages are; the builder checks for any other
  route or cache list.

## Left to the builder

- Storage layout and migration from `courtside-board-v1` (`cfg`, `fx`, `owner`), `courtside-leagues-v1`,
  `courtside-league-v1`, `courtside-inseason-v1`.
- How Draft's live Fantrax draft sync (picks, 10 s auto-sync) splits between Settings (connection) and Draft (applying picks).
- Layout of the Settings page.
