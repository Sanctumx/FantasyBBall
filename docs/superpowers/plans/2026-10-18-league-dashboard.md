# League Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A post-draft League page (team focus + league matchup matrix + team stats) reached from a Draft Kit · League toolbar.

**Architecture:** Pure league math in `src/league_core.js` on top of the existing engine (`evaluate` → teams' mean/variance, plus a new per-category pair probability). Name matching and projection blending move from `app.html` into `src/shared.js`, injected into both pages by `gen.py`. `src/league.html` is the page template, built like the board into `league.html` at the repo root.

**Tech Stack:** Plain JS (UMD-style like `engine.js`), Python build scripts, `node:test` for unit tests, Playwright (scratchpad install, Chromium at /opt/pw-browsers) for page checks.

**Spec:** `docs/superpowers/specs/2026-10-18-league-dashboard-design.md`

## Global Constraints

- Toolbar entries exactly "Draft Kit" (→ `./`) and "League" (→ `league.html`); no math tab (math.html stays linked from the board's How it works).
- Math uses Basis `total` (Season) and Playoff boost `off`; Projections from a page selector, default = the board's `cfg.proj` (else `avg`).
- League page never writes `courtside-board-v1`, `courtside-saved-drafts-v1` or `courtside-leagues-v1`; its own remembered choices go under `courtside-league-v1`.
- Same fonts, color tokens, light/dark handling and phone-width rules as the board; tables scroll inside their own `overflow-x:auto` box.
- Board behaviour must not change except the toolbar (all existing board checks keep passing).

## Review Focus

- Board left mid-draft (open picks): typical players fill them; page says "N of M picks" and still renders every table.
- Saved draft with a different team count / 8-cat / roto: tables size to `cfg.teams` and the scoring categories (no TO column in 8-cat); roto shows category win % but the matchup view still works.
- Saved draft holding old duplicate "extra" players (e.g. 'Alex Sarr'): picks land on the projected player.
- Fantrax league that is busy or not reachable (or page opened locally without the relay): message + retry, other sources still work.
- No board draft and no saved drafts: an empty state explaining how to make one, no script errors.

---

### Task 1: Engine — per-category pair probability

**Files:**
- Modify: `src/engine.js` (evaluate's `out`, ~line 515)
- Test: `src/tests/engine_pair.test.js`

**Interfaces:**
- Produces: `res.catProb(A, B, c) -> number` (A, B = entries of `res.teams`; same formula as the internal `winP`, so `res.myChance[c]` = mean over opponents of `catProb(me, B, c)`).

- [ ] **Step 1: Write the failing test** — `catProb exists and matches myChance`: build P from `players.json` with `E.prepPlayers`, cfg `{teams:14, roster:12, slot:1, order:'3rr', scoring:'h2h', cats:9, basis:'total', ilSpots:3, field:'average', fieldZ:'std', puntMode:'off', catW:[1,1,1,1,1,1,1,1,0.5]}`, picks = first 168 ids by ADP; assert `|mean_B catProb(me,B,c) − myChance[c]| < 1e-12` for every c, and `catProb(A,B,c) + catProb(B,A,c) ≈ 1` (1e-9).
- [ ] **Step 2: Run** `node --test src/tests/` → FAIL (`catProb is not a function`).
- [ ] **Step 3: Add** `catProb: (A, B, c) => winP(A.mu, A.v, B.mu, B.v, c)` to `out`.
- [ ] **Step 4: Run** `node --test src/tests/` → PASS.
- [ ] **Step 5: Commit** `feat(engine): expose per-category pair probability`.

### Task 2: Shared helpers (names, projections, toolbar)

**Files:**
- Create: `src/shared.js`
- Modify: `src/app.html` (remove its `stripSfx`, `NAME_ALIAS`, `findListed`, `projOf`; call the shared ones; add the toolbar to `<header class="top">`), `src/gen.py` (inject `/*__SHARED__*/` before the page script)
- Test: `src/tests/shared.test.js`

**Interfaces:**
- Produces (global `Shared` in the page, `module.exports` in node):
  - `norm(s) -> string`, `stripSfx(k) -> string` (same rules as the board today)
  - `findListed(P, name, team) -> player|null` (current board logic, `P` passed in; skips `unlisted`)
  - `projOf(raw, proj) -> stats` (`proj` ∈ `'avg'|'bbm'|'hs'`, current board logic)
  - `TOOLBAR_HTML(active) -> string` (`active` ∈ `'kit'|'league'`), `TOOLBAR_CSS` string: a slim bar with the two links, the active one marked `aria-current="page"`.

- [ ] **Step 1: Write failing tests** — `findListed` maps 'Alex Sarr'→'Alexandre Sarr', 'Cameron Johnson'→'Cam Johnson', 'Herbert Jones', 'Luguentz Dort', 'Nikola Jokic'→ itself, 'Real Nobody'→null; `projOf(raw,'avg').fgp` equals made/attempt average for a player with `hs`; `TOOLBAR_HTML('league')` contains `href="league.html"` with `aria-current` and the text `Draft Kit`.
- [ ] **Step 2: Run** `node --test src/tests/` → FAIL (module missing).
- [ ] **Step 3: Implement `src/shared.js`** by moving the board's functions (signatures above); wire `app.html` to `Shared.*`; `gen.py` replaces `/*__SHARED__*/` with the file.
- [ ] **Step 4: Run** `node --test src/tests/` → PASS; rebuild (`python3 gen.py && python3 build_site.py && cp site/index.html ../index.html`); in Playwright, the board loads with no page errors, shows the toolbar, and the earlier `dup.mjs` Fantrax-alias check still passes.
- [ ] **Step 5: Commit** `refactor: shared name/projection helpers; Draft Kit · League toolbar on the board`.

### Task 3: League math

**Files:**
- Create: `src/league_core.js`
- Test: `src/tests/league_core.test.js`

**Interfaces:**
- Consumes: `Engine` (prepPlayers, buildContext, evaluate, CATS, TO), `Shared.projOf`, `Shared.findListed`, `res.catProb` (Task 1).
- Produces: `computeLeague(PLAYERS, src, proj) -> L` where `src = {cfg, picks, owner, extra, names}` (names: array of N display names or null) and
  `L = { N, nc, cats:[indices], me, names:[N], picked, total, match:[N][N] (null diagonal), cat:[N][N][9], expCats:[N][N], standings:[{rank, catsPerWeek, matchAvg}], raw:[N][9], perWeek:[N][9], z:[N][9], rank:[N][9], profile(t) -> [{c, win, raw, rank}] }`.
  Settings forced: `basis:'total'`, `poBoost:'off'`, `proj` as given. Extras absorbed like the board (`PLAYERS.length + i` ids; a matched extra maps to the projected player). Raw totals count drafted players only (counting stats = Σ per-game × games with Season basis; FG%/FT% = Σ makes ÷ Σ attempts); win chances include the engine's typical player at open picks; `picked` reports how many picks are filled. Per week = raw ÷ (`cfg.poStart` − 1). Rank 1 = best (TO: fewest). Z = (team − mean of teams) ÷ sd of teams, TO sign flipped.

- [ ] **Step 1: Write failing tests** with a full 168-pick draft (first 168 by ADP, default cfg from Task 1):
  - `match[i][j] + match[j][i] ≈ 1` (1e-9); diagonal null.
  - `expCats[i][j] = Σ_c cat[i][j][c]` over scoring cats; 8-cat cfg → `cats.length === 8` and no TO.
  - Agreement with the board: for `me`, `standings[me].catsPerWeek ≈ res.standings[me].cats * nc` and mean_j `match[me][j] ≈` mean of `res.myMatch[].p` (1e-9), using the same cfg the board would use with Basis Season / Boost Off.
  - `rank` columns are permutations of 1..N; TO rank 1 has the smallest raw TO.
  - Half-filled draft (first 84 picks): `picked === 84`, all matrices finite.
  - Extra 'Alex Sarr' at id `PLAYERS.length` in picks → counted as Alexandre Sarr.
- [ ] **Step 2: Run** `node --test src/tests/` → FAIL.
- [ ] **Step 3: Implement `computeLeague`** (one `buildContext` + one `evaluate`; pair loops over `res.teams` with `res.pairProb` and `res.catProb`).
- [ ] **Step 4: Run** `node --test src/tests/` → PASS.
- [ ] **Step 5: Commit** `feat: league math for the League page`.

### Task 4: Sources (board, saved drafts, Fantrax)

**Files:**
- Modify: `src/league_core.js`
- Test: `src/tests/league_sources.test.js`

**Interfaces:**
- Produces:
  - `listSources(store) -> [{id, kind:'board'|'saved'|'fantrax', label}]` where `store` = an object with `getItem(key)` (localStorage in the page); board entry only if `courtside-board-v1` has picks; one per saved draft (label = its name); one per saved league (label = its name).
  - `sourceFromStore(store, id) -> src` for `board`/`saved` (cfg via defaults merged like the board; names from `fx.names`/`fx.order` when present; `me` from `cfg.slot`).
  - `sourceFromFantrax(league, draft, fxPlayers, PLAYERS, baseCfg, myTeam) -> src` (teams/roster/order from the draft as the board's `fxApply` does; picks via `Shared.findListed`; unknown players become extras; `owner` from `teamId`; names from `teamInfo`).

- [ ] **Step 1: Write failing tests** — fake store with a board state (3 picks), two saved drafts and one league → 4 sources in order board, saved…, fantrax; `sourceFromStore(...,'saved:Mock 2').cfg.teams` equals the saved value; `sourceFromFantrax` with 14 teams, picks `['Sarr, Alex', 'Jokic, Nikola', 'Nobody, Real']` → picks map to Alexandre Sarr, Jokic and an extra; names from `teamInfo`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: League page sources`.

### Task 5: League page

**Files:**
- Create: `src/league.html`
- Modify: `src/gen.py` (also writes `courtside-league.html` from `league.html` with DATA/SCHED/ENGINE/SHARED/LEAGUE injected), `src/build_site.py` (wraps it into `site/league.html` with the same head, title "League · Courtside Draft Kit"), build command copies `site/league.html` to `../league.html`
- Test: `scratchpad/league_page.mjs` (Playwright)

**Interfaces:**
- Consumes: `computeLeague`, `listSources`, `sourceFromStore`, `sourceFromFantrax`, `Shared.TOOLBAR_HTML('league')`, the relay `api/fantrax?what=league|draft|players&leagueId=`.
- Produces: element ids the checks use: `#src`, `#team`, `#proj`, `#h2h`, `#prof`, `#kpis`, `#mxv` (buttons `data-v="match|cat|exp"`), `#mxc`, `#mx`, `#tsv` (buttons `data-v="raw|week|z|rank"`), `#ts`, `#msg`.

Layout and copy follow the approved mockup (artifact "League Dashboard Mockups" v4): toolbar; control panel (League, Team in focus, Projections, format line "14 teams · 3RR · H2H each category · 9-cat · 168 of 168 picks"); two-column top (Team vs each team | Category profile with rank, categories won per week, matchup wins); Matchup matrix with view switch and category select (category select shown only in Category win % view); Team stats with view switch. Cells colored green/red by value (win % around 50; stats by rank within column). Remembers last source/team/projections/views in `courtside-league-v1` (try/catch). Fantrax sources load with the board's backoff behaviour (busy → "Retrying in N s").

- [ ] **Step 1: Write the Playwright check** — with a seeded board state (168 picks) and one saved draft: page loads without errors; `#src` lists 2 sources; `#mx` has 14 body rows × 14 team cells; each `#h2h` row's first number equals `#mx` row of the focused team; switching `#tsv` to Rank shows only 1–14 in each column; switching source to the saved draft re-renders; at 390px wide `document.documentElement.scrollWidth <= innerWidth`; dark scheme renders without unreadable text (spot-check computed color ≠ background). Empty store → `#msg` shows the empty state and no errors. Mocked relay (route `api/fantrax`) with 429 then success → message then tables.
- [ ] **Step 2: Run** `node scratchpad/league_page.mjs` → FAIL (no page).
- [ ] **Step 3: Build `src/league.html`** and the build changes.
- [ ] **Step 4: Rebuild and run the check** → all lines pass; `node --test src/tests/` still passes.
- [ ] **Step 5: Commit** `feat: League page (team focus, matchup matrix, team stats)`.

### Task 6: Board agreement, docs, handoff

**Files:**
- Modify: `src/app.html` (How it works: one paragraph "League page"), `src/SESSION_HANDOFF.md` (new item), `docs/...` none
- Test: `scratchpad/league_vs_board.mjs`

- [ ] **Step 1: Write the check** — same seeded draft on the board with Basis Season, Playoff boost Off, Projections Average: the board's Your team rank, categories per week (2 decimals), each category win % and each opponent's matchup % equal the League page's focused-team numbers.
- [ ] **Step 2: Run** → PASS (fix any mismatch in `league_core.js`, not by changing the board).
- [ ] **Step 3: Add** the How it works paragraph and the handoff item; rebuild.
- [ ] **Step 4: Commit** `docs: League page`. Push only when the user says so.
