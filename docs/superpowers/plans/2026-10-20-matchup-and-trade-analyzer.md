# Weekly Matchup Analyzer and Trade Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new In-Season page for the user's public Fantrax league. It has a Weekly Matchup Analyzer (win chances against this week's opponent, the best single adds and a waiver add plan for this week) and a Trade Analyzer (one-for-one finder, Sell High / Buy Low lists, Trade Builder), all built on the existing Win C / Win M math.

**Architecture:** Four pure UMD modules (browser + Node), following the pattern of `league_core.js`:
- `inseason_league.js`: Fantrax league, periods and the daily schedule.
- `inseason_players.js`: one projection loader, ESPN and Fantrax matching, the player pool and the value scale.
- `matchup_core.js`: the week's projection, Simple adds and the add plan.
- `trade_core.js`: rest-of-season Win M, perceived value, the finder and the builder math.

They sit on one new additive engine function, `Engine.pairMatchup`, which scores two rosters with known expected games. Data arrives through two new Worker routes (`rosters`, `standings`), a committed daily schedule (`src/sched_days.json`) and a daily GitHub Actions job that writes ESPN actual stats to repo-root `stats/espn.json`. The page fetches that file at runtime, so stats refresh without a page rebuild. The tools go on a new page, `inseason.html`, rather than League Dashboard tabs, for three reasons:
- The dashboard is built around draft sources (current draft, saved mock drafts) and computes from picks. These tools need live rosters, a week picker and a large Trade Builder.
- A separate page leaves `league.html` and its five browser checks untouched.
- The toolbar gets a third link.

**Tech Stack:** Vanilla JS (UMD modules inlined by `gen.py`), Node `node:test`, Python build scripts, Playwright browser checks, Cloudflare Worker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-20-matchup-and-trade-analyzer-design.md`

## Global Constraints

- League: 14 teams, public league id `mm5i19xxmv4hcbcy`, "9-category, H2H each category". ESPN stats map to PTS, REB, AST, STL, BLK, 3PM, FG%, FT%, TO. Roster: 10 active + 2 bench + 3 IL; 4 adds per week. Read `maxTotalActivePlayers` / `maxTotalPlayers` from `getLeagueInfo.rosterInfo`; don't hard-code them.
- Regular season = matchup periods 1..`playoffs.lastRegularSeasonPeriod`. That is 17 in this league, and Fantrax also states `firstPlayoffPeriod` 18. Fallback: the last matchup period whose pairs carry team ids. Periods 7 (Nov 30–Dec 14) and 17 (Feb 15–Mar 1) are two weeks long.
- "Weekly Matchup Analyzer: Win M is calculated only against that week's opponent (one pairwise matchup)."
- "Trade Analyzer: Win M is measured against the team's remaining regular-season matchups (the actual schedule from `getLeagueInfo`), other teams' rosters held fixed."
- Projections come only from `players.json`, through one loader (`projLines`) using `Shared.projOf(r, 'avg')`, the Model pick's projection. Never hard-code them. An updated `players.json` must flow through with no change to the analyzers.
- "Changing the draft Model pick or anything it sees" is a non-goal:
  - `src/engine.js` changes are additions only (a new function plus its `api` entry); no existing line changes.
  - `findListed`, `projOf`, `buildContext` and `evaluate` are untouched.
  - A golden-output test proves it.
- Anti-goal: "Tools that look authoritative but run on stale or mismatched data". Data freshness, the stats season and match failures are visible on the page.
- Finder: one-for-one only. Builder: several players per side, with a visible caveat that Win M doesn't model the roster spot freed or filled.
- Simple adds: each add is scored against dropping the user's lowest-value non-IL player, and that drop is shown on the row. Add plan: current week only, using the adds left this week.
- Nothing writes to Fantrax; no login.
- Page rules (`.claude/rules/pages.md`):
  - Edit the templates in `src/`, never the built pages.
  - Hover tooltips are one short line; longer text goes in How it works, whose only copy is in `app.html`.
  - Defaults are applied only on a first visit.
- Unit tests: `node --test 'src/tests/*.test.js'` from the repo root. New modules use the UMD pattern of `league_core.js` with no npm dependencies.
- Every commit uses a type prefix (`feat:`, `fix:`, `test:`, `docs:`, `chore:`) and ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Constants the builder chose and the page shows, in one exported object each:
  - `TRADE_W = { cur: 0.4, proj: 0.3, adp: 0.3, shrinkGames: 20, slope: 2.0, winM: 0.1, tagGap: 0.5 }`
  - Adds take effect from the next local day.
  - Local day = UTC − 6 h, as `sched_b2b.py`.

## Review Focus

1. **A rostered player with no projection and no ESPN match** (rookies such as Aday Mara and Mikel Brown in today's rosters). He counts at waiver level, tagged "no projection", and is listed under "unmatched". He is never silently dropped from a team's totals. Test: Task 4.
2. **Stats from the wrong season** (ESPN still serving 2025-26, or ignoring `season=`). The page banner names the season and says "last season". The collector never overwrites `stats/espn.json` with an empty or other-season response. Tests: Task 3 (collector) and Task 11 (banner).
3. **Two-week periods and Monday-evening period boundaries** (period 7, period 17; Fantrax dates like `2026-10-26T19:00:00.0-0400`). Games are counted by tip-off time across the whole period, and the dates parse identically in every browser. Tests: Task 2.
4. **Late in the week, past weeks, playoffs.** The week picker lists only regular-season periods. A week with no games left shows "no games left this week" instead of a table of zeros. The plan for a non-current week says "current week only". Tests: Tasks 7 and 8.
5. **Trade Builder misuse:** the same player on both sides, a player not on that team, an empty side, Team A = Team B. The pickers offer only that team's roster minus players already chosen. Team B excludes Team A. An empty side blanks the summary. `evaluateTrade` throws on invalid input and the page shows the message. Tests: Task 9 (unit) and Task 12 (browser).

---

## File structure

| File | New / changed | Responsibility |
| --- | --- | --- |
| `worker/index.js` | changed | Routes `rosters` → `getTeamRosters`, `standings` → `getStandings`, with the same cache and backoff |
| `src/sched_days.py`, `src/sched_days.json` | new | Per-team tip-off times (epoch seconds) from `nba-2026-UTC.csv` (on the PC: `C:\Users\Fefe\Downloads\nba-2026-UTC.csv`) |
| `src/inseason_league.js` | new | Fantrax parsing (league, rosters, standings), periods, current period, opponents, team-code map, games in a window with the daily active cap |
| `src/collect/espn_stats.mjs`, `.github/workflows/collect-stats.yml`, `stats/espn.json` | new | Daily ESPN actual stats (per-game), committed JSON served at `/stats/espn.json` |
| `src/inseason_players.js` | new | Projection loader, matching (Fantrax/ESPN → `players.json`), player pool, value scale (`valueZ`, `catZ`), shrunk current line |
| `src/engine.js` | **changed, hard area, additive only** | `pairMatchup(A, B, opts)`: two rosters with expected games → category and matchup win chances |
| `src/matchup_core.js` | new | Analysis context, segments, week projection, Simple adds, add plan |
| `src/trade_core.js` | new | Rest-of-season Win M, perceived value, likelihood, `evaluateTrade`, finder, Sell High / Buy Low |
| `src/inseason.html` | new | Page template: pickers, freshness strip, Matchup tab, Trades tab with the Trade Builder |
| `src/gen.py`, `src/build_site.py`, `src/shared.js` | changed | Build the new page; toolbar gets an "In-Season" link |
| `src/app.html` | changed (text only) | New "In-season tools" card in How it works |
| `src/tests/…`, `src/tests/fixtures/…`, `src/tests/browser/inseason_page.mjs` | new | Unit tests, recorded fixtures, browser check |

---

### Task 1: Worker routes for rosters and standings

**Files:**
- Modify: `worker/index.js:3-11` (ROUTES, CACHE), `:25` (STALE_MAX), `:57` (error text)
- Test: `src/tests/worker_routes.test.js`

**Interfaces:**
- Produces: `GET /api/fantrax?what=rosters&leagueId=ID` → the `getTeamRosters` body. `what=standings` → the `getStandings` body (array of `{teamName, teamId, rank, points: "W-L-T", gamesBack, winPercentage}`).
- `CACHE`: rosters 60, standings 300. `STALE_MAX`: rosters 86400, standings 86400.

- [ ] **Step 1: Write the failing test.** The worker is ESM without a package.json, so the test copies `worker/index.js` to `os.tmpdir()/worker-<pid>.mjs` and `import()`s it. It stubs `globalThis.fetch` to record the URL and return `new Response('{"rosters":{}}')`. `caches` stays undefined; the worker's try/catch covers that.

```js
test('rosters route calls getTeamRosters and caches 60 s', async () => { /* res = await W.fetch(new Request('https://x/api/fantrax?what=rosters&leagueId=mm5i19xxmv4hcbcy'), {}, { waitUntil(){} }) */
  assert.strictEqual(seen.at(-1), 'https://www.fantrax.com/fxea/general/getTeamRosters?leagueId=mm5i19xxmv4hcbcy');
  assert.strictEqual(res.status, 200); assert.match(res.headers.get('cache-control'), /max-age=60/); });
test('standings route calls getStandings', …);   // URL ends getStandings?leagueId=mm5i19xxmv4hcbcy
test('unknown what lists the new values', …);     // status 400, body.error matches /rosters/ and /standings/
```

- [ ] **Step 2:** Run `node --test src/tests/worker_routes.test.js`. Expected: FAIL (400 "Unknown request").
- [ ] **Step 3:** Add the two routes, cache times and error text ("Use what=draft, league, players, rosters or standings.").
- [ ] **Step 4:** Run the test. Expected: PASS. Run the whole suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Worker routes for Fantrax rosters and standings`.

---

### Task 2: Daily schedule and league calendar

**Files:**
- Create: `src/sched_days.py`, `src/sched_days.json`, `src/inseason_league.js`
- Create fixtures: `src/tests/fixtures/record_fx.mjs` and its output `fx_league.json`, `fx_rosters.json`, `fx_standings.json`, `fx_players.json`
- Test: `src/tests/inseason_league.test.js`

**Interfaces:**
- `sched_days.json`: `{ "source": "nba-2026-UTC.csv", "games": { "<players.json team code>": [epochSeconds, …] } }`. Team codes come from the `NAMES` map in `sched_b2b.py` (GSW, NOR, NYK, SAS, PHO, UTA, WAS …).
- Produces (`root.InLeague` / `module.exports`):
  - `parseFxDate(s: string) -> number` (ms). Manual regex for `YYYY-MM-DDTHH:MM:SS(.f)?±HHMM`.
  - `parseLeague(info) -> League`, where `League = { teams: [{id, name, short}], periods: [{n, start, end}] (ms), matchups: { [n]: [[awayId, homeId], …] } (only pairs with team ids), lastRegular: number, maxActive: number, maxPlayers: number, fxStatus: { [fid]: 'FA'|'WW'|'T' }, eligible: { [fid]: string }, season: number }`
  - `parseRosters(body) -> { [teamId]: [{ fid, slot: 'ACTIVE'|'RESERVE'|'IR' }] }` (`INJURED_RESERVE` → `'IR'`)
  - `parseStandings(arr) -> { [teamId]: { rank, record } }` (`record` = `points` string)
  - `currentPeriod(L, nowMs) -> number|null`: the period containing now. Before the first period → 1. After `lastRegular` ends → null.
  - `opponentOf(L, teamId, n) -> string|null`
  - `regularFrom(L, n) -> number[]` (n..lastRegular)
  - `toProjTeam(code) -> string`: Fantrax/ESPN code → players.json code (`GS→GSW, NO→NOR, NOP→NOR, NY→NYK, SA→SAS, PHX→PHO, UTAH→UTA, WSH→WAS`); `'(N/A)'`/unknown → `''`
  - `localDay(ms) -> 'YYYY-MM-DD'` (UTC − 6 h), `dayStart(day) -> ms`, `nextDayStart(ms) -> ms`
  - `rosterGames(entries: Array<{ t: string, a: number, from: number, to: number }>, DAYS, maxActive) -> number[]`: expected games for each entry. Count the entry's team's tip-offs in `[from, to)`, each worth `a` (availability). On a local day where the sum over entries exceeds `maxActive`, scale that day's contributions by `maxActive / sum`.

- [ ] **Step 1: Generate data and fixtures.**
  - `cd src && python3 sched_days.py /c/Users/Fefe/Downloads/nba-2026-UTC.csv` writes `sched_days.json`. It parses `Date` as UTC (`%d/%m/%Y %H:%M`) with the same `NAMES` map.
  - `node src/tests/fixtures/record_fx.mjs` fetches `getLeagueInfo`, `getTeamRosters`, `getStandings` and `getPlayerIds` for `mm5i19xxmv4hcbcy` and writes the four fixtures.
    - Team names become "Team 1".."Team 14", consistently across files.
    - `fx_league.json` keeps only `matchups, scoringPeriods, playoffs, rosterInfo, teamInfo, playerInfo, seasonYear, startDate, endDate`.
    - `fx_players.json` keeps `{name, team, position}` for ids in `playerInfo`.
- [ ] **Step 2: Write the failing tests:**

```js
test('parseFxDate reads Fantrax offsets', () => assert.strictEqual(I.parseFxDate('2026-10-26T19:00:00.0-0400'), Date.UTC(2026, 9, 26, 23)));
test('league shape', () => { /* 14 teams; 20 periods; period 7 lasts 14 days; lastRegular 17; Object.keys(matchups) = '1'..'17'; 7 pairs each; maxActive 10; maxPlayers 12 */ });
test('current period', () => { /* Date.UTC(2026,9,21) → 1; Date.UTC(2026,11,5) → 7; Date.UTC(2027,2,10) → null */ });
test('opponents are mutual and unique each regular period', …);
test('every Fantrax and ESPN team code maps to a sched.json team', …);   // codes from fx_players.json and espn_page.json (Task 3; add the ESPN half there)
test('sched_days agrees with sched.json', () => { /* per team: games over periods 1–20 == sum of sched.json games over all 25 weeks; each team-period differs from its sched.json week sum by ≤ 1 (a period covers the weeks whose start date falls in [local start day, local end day)) */ });
test('rosterGames applies availability and the daily cap', () => { /* 2 entries, same team, a = 1, one 7-day window → each = team games; a = 0.5 → half; 12 entries on one day with a game, maxActive 10 → each 10/12; empty window → 0 */ });
```

- [ ] **Step 3:** Run `node --test src/tests/inseason_league.test.js`. Expected: FAIL (module missing).
- [ ] **Step 4:** Implement `src/inseason_league.js` with the interfaces above.
- [ ] **Step 5:** Run it. Expected: PASS. Run the whole suite. Expected: PASS.
- [ ] **Step 6: Commit** `feat: league calendar, Fantrax parsing and daily schedule for in-season tools`.

---

### Task 3: ESPN actual-stats collector

**Files:**
- Create: `src/collect/espn_stats.mjs`, `.github/workflows/collect-stats.yml`, `stats/espn.json`, `src/tests/fixtures/espn_page.json`, `src/tests/fixtures/espn_2025_26.json`
- Test: `src/tests/espn_stats.test.js`

**Interfaces:**
- One call returns all three category arrays per athlete, and `limit=1000` returns all 578 athletes in one page. Use `byathlete?category=general&limit=1000&page=N&season=S` and follow `pagination.pages`.
- `export function parseByAthlete(body) -> EspnRow[]`, where `EspnRow = { id, n, t, gp, min, pts, reb, ast, stl, blk, to, tpm, fgm, fga, ftm, fta }`. Values are per game. Find each value by its label name in `body.categories[k].names` (`gamesPlayed, avgMinutes, avgPoints, avgRebounds, avgAssists, avgSteals, avgBlocks, avgTurnovers, avgThreePointFieldGoalsMade, avgFieldGoalsMade, avgFieldGoalsAttempted, avgFreeThrowsMade, avgFreeThrowsAttempted`), never by position. `t` = `athlete.teamShortName`.
- `export function shouldWrite(body, season) -> boolean`: true only if `requestedSeason.year === season` and there is at least one athlete.
- `stats/espn.json` = `{ season: number, label: string /* requestedSeason.displayName */, fetchedAt: ISO, players: EspnRow[] }`.
- `main()` runs only when the file is executed directly. Season = `process.argv[2]` or `ESPN_SEASON` env, default `2027`. When `shouldWrite` is false it logs `::warning::` and leaves the file alone.

- [ ] **Step 1: Record fixtures.** Real call with `limit=3` → `espn_page.json`. A full parsed 2025-26 run → `espn_2025_26.json`, frozen for tests.
- [ ] **Step 2: Write the failing test:**

```js
test('parses per-game rows by label', async () => { const r = (await import('../collect/espn_stats.mjs')).parseByAthlete(page);
  assert.strictEqual(r.length, 3); assert.deepStrictEqual([r[0].id, r[0].n, r[0].t, r[0].gp], ['3945274', 'Luka Doncic', 'LAL', 64]);
  assert.ok(Math.abs(r[0].pts - 33.484) < 1e-3 && Math.abs(r[0].fga - 22.766) < 1e-3 && Math.abs(r[0].stl - 1.641) < 1e-3 && Math.abs(r[0].to - 3.984) < 1e-3); });
test('label order does not matter', …);            // reverse names + values in a copy → same rows
test('refuses another season or an empty page', …); // shouldWrite(page, 2027) false (fixture is 2026); empty athletes false; matching season true
```

- [ ] **Step 3:** Run `node --test src/tests/espn_stats.test.js`. Expected: FAIL.
- [ ] **Step 4:** Implement `espn_stats.mjs`. Add `.github/workflows/collect-stats.yml`, modelled on `collect-drafts.yml`:
  - cron `'41 10 * * *'` plus `workflow_dispatch`
  - run `node src/collect/espn_stats.mjs`
  - `git add stats/espn.json`
  - message `Collect ESPN stats $(date -u +%F) [skip netlify]`
  - concurrency group `collect-stats`
- [ ] **Step 5:** Run `node src/collect/espn_stats.mjs 2026` once.
  - Check that `season=2026` is honoured: `label` "2025-26", about 578 players.
  - This writes the initial `stats/espn.json` (test data until the 2026-27 file exists).
  - Confirm `stats/` is not excluded by `.assetsignore`.
- [ ] **Step 6:** Run the tests. Expected: PASS. Add the ESPN half of the team-code test from Task 2. Expected: PASS.
- [ ] **Step 7: Commit** `feat: daily ESPN actual-stats collector (2025-26 as test data)`.

---

### Task 4: Player pool, matching and value scale

**Files:**
- Create: `src/inseason_players.js`
- Test: `src/tests/inseason_players.test.js`

**Interfaces:**
- Consumes: `Shared.projOf`, `Shared.findListed`, `Shared.norm`, `InLeague.toProjTeam`, the `League` shape from Task 2.
- `StatLine = { fgp, fga, ftp, fta, tpm, pts, reb, ast, stl, blk, to }` (per game).
- `projLines(PLAYERS, proj = 'avg') -> ProjPlayer[]`: **the single projection loader**. `ProjPlayer = { id, n, t, pos, g, line: StatLine, adp /* ftx */ }`.
- `OVERRIDES = { fx: { [fid]: projName }, espn: { [espnId]: projName } }`. Seed it only with genuine spelling differences found on the fixtures.
- `matchTo(list, name, team) -> item|null`: applies `toProjTeam`, then `Shared.findListed`. Fantrax `"Last, First"` names are swapped first.
- `buildPool({ PLAYERS, fxPlayers, espn, L, rosters, proj = 'avg' }) -> Pool`, where `Pool = { players: PoolPlayer[], byKey: Map<fid, PoolPlayer>, unmatched: { noProj: PoolPlayer[], noEspn: number }, stats: { season, label, fetchedAt } | null }`.
- `PoolPlayer = { key /* fid */, n, t, pos, line: StatLine, g, src: 'proj'|'actual'|'waiver', actual: { gp, line: StatLine } | null, adp: number|null, owner: teamId|null, slot: 'ACTIVE'|'RESERVE'|'IR'|null, fxStatus }`. Line sources, in order:
  1. A projection.
  2. Otherwise the ESPN actual line (`src 'actual'`).
  3. Otherwise the waiver-level line (`src 'waiver'`): the average of the 15 lowest-ranked projected players, as `League.sourceFromFantrax` does.

  Non-projected players get `g` = the waiver-level average `g`. The pool holds every rostered player, plus FA/WW players whose `src` isn't `'waiver'`.
- `makeValueRef(projPlayers, n = 168) -> ValueRef`: from the top `n` by ADP. Holds season and per-game category means and SDs, `pFG`, `pFT`, weights (1, TO 0.5), and `valueSd`.
- `valueZ(line, g, ref) -> number`: season Standard Zscore (excess makes for FG%/FT%, TO negative ×0.5), standardized to mean 0 / SD 1 over the ref pool.
- `catZ(line, ref) -> number[9]`: per-game z per category; positive = good (TO flipped).
- `curLine(pp, K = TRADE_W.shrinkGames) -> StatLine`: `(gp·actual + K·line)/(gp + K)`, with percentages from blended makes over attempts. Without actuals → `line`.

- [ ] **Step 1: Write the failing tests** (fixtures `fx_*`, `espn_2025_26.json`):

```js
test('every rostered player is in the pool with owner and slot', …);       // 178 keys; IR count 11
test('projected player uses the averaged projection', …);                  // Wembanyama: src 'proj', line.pts ≈ (27.521 + 25.6) / 2
test('no projection falls back to ESPN actual, then waiver level, and is listed', …);   // Keldon Johnson → 'actual'; Aday Mara → 'waiver'; both in unmatched.noProj
test('ESPN GS/NY/SA codes match players.json GSW/NYK/SAS players', …);
test('an updated players.json flows through unchanged code', …);           // copy PLAYERS, Wembanyama pts + 10 → pool line.pts + 5; appended player → src 'proj'
test('valueZ is standardized over the ref pool', …);                       // mean ≈ 0, sd ≈ 1 (1e-9) over top 168
test('curLine shrinks toward the projection', …);                          // gp 0 → line; gp 1e6 → actual (1e-4); gp = K → midpoint for pts
```

- [ ] **Step 2:** Run `node --test src/tests/inseason_players.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. **Step 4:** Run it and the whole suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: in-season player pool with one projection loader and name matching`.

---

### Task 5: `Engine.pairMatchup` (HARD AREA, additive only)

**Hard area:** `src/engine.js` (CLAUDE.md). It must not alter anything the draft Model pick sees:
- No existing line of `engine.js` changes.
- A golden test written **before** the edit pins `evaluate`, `slidePick` and `computeLeague` outputs bit-for-bit.

The `analyst` reviews the math, the tolerance in the consistency test and whether Task 6's calibration gates the merge. The `reviewer` runs on Opus. If the build stalls here, tell the user that `/model opus` for this task is the escalation path.

**Files:**
- Create: `src/tests/fixtures/make_engine_golden.js`, `src/tests/fixtures/engine_golden.json`, `src/tests/engine_golden.test.js`, `src/tests/engine_pairmatchup.test.js`
- Modify: `src/engine.js`, adding after `slidePick` (before `const E2`) and to the `api` object at `:843`

**Interfaces:**
- Produces: `Engine.pairMatchup(A, B, opts) -> { cat: (number|null)[9], match: number, mu: [number[9], number[9]] }`.
  - `A`, `B`: `Array<{ p: StatLine, games: number, gVar?: number }>`.
  - `opts = { cats: 9|8 = 9, projErr: boolean = true }`.
  - `cat[c]` = P(A wins category c); `cat[TO] = null` in 8-cat.
  - `match` = P(A wins the matchup), ties counting half.
  - `mu` = each team's projected FG%, FT% (0–1) and period totals of 3PM, PTS, REB, AST, ST, BLK, TO (TO positive), in `CATS` order.
- Algorithm (not determined by the tests). Same constants and helpers as the board; `weekVar`, `projVar`, `vec`, `Phi`, `GH_Z/GH_W`, `VAR_GAMES`, `GPW` are reused unchanged:
  - Per team T: `FGA_T = Σ fga·games`, `pFG_T = Σ fgp·fga·games / FGA_T` (0 if no attempts); same for FT. `ref_T = { pFG: pFG_T, pFT: pFT_T }`. This linearizes the percentages around **each team's own** percentage, so the sign of the expected gap always matches the projected percentages. The pool-average form can't guarantee that.
  - Per player: `m = vec(p, ref_T, 1)` (signed per game). Scale `s_c` = `1/FGA_T` for FG%, `1/FTA_T` for FT%, 1 otherwise. Per-game outcome variance `pgv_c = (weekVar(p, ref_T, 82)[c] − m_c²·VAR_GAMES) / GPW`. `gVar = entry.gVar ?? VAR_GAMES·games/GPW`.
  - Mean (bigger is better): FG `pFG_T`, FT `pFT_T`, else `Σ m_c·games`.
  - Games factor per team: `S_T = Σ gVar`, `λ_T[c] = Σ s_c·m_c·gVar / S_T`, `resid_T[c] = Σ (s_c·m_c)²·gVar − λ_T[c]²·S_T`.
  - Idiosyncratic: `idio_T[c] = Σ s_c²·games·pgv_c + resid_T[c] + (projErr ? Σ s_c²·projVar(p, games)[c] : 0)`.
  - `cat[c] = Φ(Δmean_c / √(idio_A + idio_B + λ_A²S_A + λ_B²S_B + 1e-9))`.
  - `match = Σ_j Σ_k GH_W[j]·GH_W[k]·matchProb_nc( Φ((Δmean_c + λ_A[c]√S_A·GH_Z[j] − λ_B[c]√S_B·GH_Z[k]) / √(idio_A[c] + idio_B[c] + 1e-9)) )`. Here `matchProb_nc` is a new module-level copy of `evaluate`'s inner `matchProb`; the closure is not touched.

- [ ] **Step 1: Pin the engine (engine.js still unchanged).** `make_engine_golden.js` builds `P = prepPlayers(PLAYERS × projOf 'avg')` with the `CFG` of `engine_pair.test.js` (`basis 'total'`, `poBoost 'off'`). For pick counts k ∈ {0, 29, 70} (first k players by `ftx`), with `slot = teamAt(k)+1` and `myIdx` = that team's earlier picks, it records:
  - `slidePick` output: `modelPick`, `slide` (`w`, `cands`)
  - `standings`, `myChance`, `myMatch`
  - each player's `[id, gain, gainM, thereAt]`

  It also records the `League.computeLeague(PLAYERS, src(168), 'avg')` `match` matrix. Float64Arrays become arrays. `engine_golden.test.js` recomputes and `deepStrictEqual`s.
- [ ] **Step 2:** Run `node --test src/tests/engine_golden.test.js`. Expected: PASS. **Commit** `test: pin draft engine outputs before adding pairMatchup`.
- [ ] **Step 3: Analyst checkpoint.** Dispatch `analyst` with this task, the algorithm above and the tests below. It sets the tolerance of the consistency test (start 0.05) and decides whether Task 6 gates the merge. Record its answer in the task notes.
- [ ] **Step 4: Write the failing tests** (`engine_pairmatchup.test.js`):

```js
test('identical rosters are even', …);                // match 0.5 ± 1e-12, every cat 0.5
test('A over B and B over A sum to 1', …);            // match and each cat, ± 1e-9, two different 12-player rosters
test('FG% sign follows the percentages, not volume', …);   // A: fgp .50 fga 20 g 3; B: fgp .48 fga 5 g 3 (both below a .55 pool) → cat[0] > 0.5
test('a zero-games entry changes nothing', …);         // same result ± 1e-12 as without it
test('more games for a scorer raise PTS and lower TO chances', …);
test('8-cat ignores turnovers', …);                    // A = B except fewer TO: 9-cat match > 0.5, 8-cat match = 0.5, cat[8] === null
test('close to the draft engine on a typical week', …);  // full ADP draft, cfg.ilSpots 0: teams 0 vs 5, games = g·3.42/82 → |cat − evaluate().catProb| < tol each category, |match − pairProb| < tol (tol from the analyst)
test('mu reports team percentages and totals', …);     // mu[0][0] === pFG_A; mu[0][8] = Σ to·games
```

- [ ] **Step 5:** Run `node --test src/tests/engine_pairmatchup.test.js`. Expected: FAIL (`pairMatchup` is not a function).
- [ ] **Step 6:** Implement `pairMatchup` and `matchProbN` and add `pairMatchup` to `api`.
- [ ] **Step 7:** Run the suite. Expected: all PASS, including `engine_golden` unchanged. Run `git diff -U0 origin/main -- src/engine.js | grep -E '^-[^-]'`. Expected: no output (additions only).
- [ ] **Step 8: Commit** `feat: Engine.pairMatchup, two-roster win chances with known games`.

---

### Task 6: Calibration check of `pairMatchup` (analyst designs, builder runs)

**Files:** Create `src/calib_pair.js` (output `src/calib_pair_2025-26.json`, blocked from reading like other `bt_*` results; print a summary only).

**Question it answers:** Are `pairMatchup`'s weekly category and matchup chances calibrated on real 2025-26 weeks? Measure Brier score and reliability in 10% bins against weekly actuals from `logs3.csv`, with rosters drafted by ADP from `bt_proj.json` 2025-26 projections and games from that week's real schedule. Are they at least as good as the draft engine's weekly chances?

This is not a draft backtest, because the Model pick is untouched. The analyst writes the exact design and the pass bar.

- [ ] **Step 1:** The analyst writes the design (rosters, weeks, metric, pass bar). Paste it into the script header.
- [ ] **Step 2:** Implement the script, run it on 2025-26 (and 2024-25 if the analyst asks), and print the summary.
- [ ] **Step 3:** The analyst judges the result.
  - If it fails, the remedy is the caller-side `gVar` (e.g. binomial `n·a(1−a)`, set in `matchup_core.js`). `engine.js` is not changed again without another golden run.
- [ ] **Step 4: Commit** `test: calibration of pairMatchup on 2025-26 weeks`. The numbers go into the IDEAS row in Task 13.

---

### Task 7: Weekly Matchup Analyzer core (projection and Simple adds)

**Files:**
- Create: `src/matchup_core.js`
- Test: `src/tests/matchup_core.test.js`

**Interfaces:**
- Consumes: `Engine.pairMatchup`; `InLeague.{currentPeriod, opponentOf, rosterGames, nextDayStart, localDay}`; `Pool`, `valueZ`, `makeValueRef` from Task 4.
- `makeCtx({ L, pool, DAYS, rosters /* parseRosters */, me, nowMs }) -> Ctx`, where `Ctx = { L, pool, DAYS, me, nowMs, cur /* currentPeriod */, ref, roster: { [teamId]: fid[] } }`.
- `Segment = { key: fid, from: ms, to: ms }`.
- `teamSegments(ctx, teamId, n, keys?: fid[]) -> Segment[]`: whole-period window. IR-slot players are left out **only when n is the current period**; in later periods everyone counts at availability `g/82`.
- `scoreSegments(ctx, segsA, segsB) -> { mu, cat, match, games: [number, number] }`. Uses `rosterGames` (cap `L.maxActive`, `a = min(1, g/82)`), then `pairMatchup`.
- `projectWeek(ctx, teamId, n) -> { opp, ...scoreSegments }` (`opp = opponentOf`; `null` → no matchup).
- `addFrom(ctx, n) -> ms`: `max(period.start, nextDayStart(nowMs))` for the current period, `period.start` for future periods.
- `lowestValue(ctx, teamId, k) -> PoolPlayer[]`: the k non-IR players with the lowest `valueZ`.
- `simpleAdds(ctx, n, { limit = 20 }) -> AddRow[]`, where `AddRow = { add, drop: PoolPlayer|null, games, lost, match, dMatch, dCat: number[9] }`.
  - The drop is always `lowestValue(…, 1)[0]`, or `null` if non-IR players < `L.maxPlayers`.
  - The drop's segment ends at `addFrom`; the add runs `[addFrom, period.end)`.
  - Candidates: pool players with `fxStatus` FA/WW and no owner.
  - Rows are sorted by `dMatch` descending. Rows with `games === 0` are dropped, and the page shows "no games left this week" when none remain.

- [ ] **Step 1: Write the failing tests** (fixtures; `nowMs = Date.UTC(2026, 9, 21, 12)`, `me` = Team 1's id):

```js
test('week projection is complementary', …);         // projectWeek(me).match + projectWeek(opp).match ≈ 1 (1e-9); opp === opponentOf(L, me, 1)
test('IR players sit out only the current period', …);
test('simple adds: same drop on every row, FA only, sorted', …);
test('a row equals a recomputed swap', …);           // row 0 dMatch == scoreSegments(with swap).match − baseline (1e-12)
test('late in the week no rows have zero games', …); // nowMs = Date.UTC(2026, 9, 26, 12) → every row games > 0 (or empty list)
test('open roster spot means no drop', …);           // remove one non-IR player from a rosters copy → drop === null
```

- [ ] **Step 2:** Run `node --test src/tests/matchup_core.test.js`. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run it and the suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: weekly matchup projection and best single adds`.

---

### Task 8: Waiver add plan (current week)

**Files:** Modify `src/matchup_core.js`. Test: `src/tests/matchup_plan.test.js`.

**Interfaces:**
- `addPlan(ctx, { addsLeft = 4, candidates = 30, droppable = L.maxPlayers − L.maxActive, periods = [ctx.cur] }) -> Plan`, where `Plan = { start: number, end: number, moves: [{ period, day: 'YYYY-MM-DD', add, drop: PoolPlayer|null, match }], droppable: PoolPlayer[], note: string|null }`.
- `periods` exists so multi-week planning can be added later. Today any value other than `[ctx.cur]` returns `{ moves: [], note: 'Plans cover the current week only' }`.
- Algorithm (greedy):
  - Days = local days from `addFrom` to the period end.
  - Candidates = the top `candidates` rows of `simpleAdds`.
  - Droppable = `lowestValue(ctx, me, droppable)` ∪ players this plan added and still holds that day ∪ `{null}` if that day has an open roster spot.
  - Each round, try every (candidate not held, day, drop): end the drop's segment at `dayStart(day)` and open the candidate's segment `[dayStart(day), period.end)`. Keep the best `match`.
  - Stop when no move gains more than `1e-4` or `addsLeft` is used.
  - `start` = baseline match; `end` = the last move's match.

- [ ] **Step 1: Write the failing tests:**

```js
test('never more moves than adds left; zero adds = no moves', …);
test('each move raises the match chance and end matches a recompute', …);
test('drops come only from the droppable set or earlier adds', …);
test('move days are from tomorrow to the period end', …);
test('non-current week gives the current-week note', …);
```

- [ ] **Step 2:** Run it. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run it and the suite. Expected: PASS; the plan for the fixture league takes < 2 s (assert).
- [ ] **Step 5: Commit** `feat: waiver add plan for the current week`.

---

### Task 9: Trade core (rest-of-season Win M, perceived value, likelihood)

**Files:** Create `src/trade_core.js`. Test: `src/tests/trade_core.test.js`.

**Interfaces:**
- Consumes: `makeCtx`, `teamSegments`, `scoreSegments` (Task 7); `valueZ`, `curLine`, `makeValueRef` (Task 4); `InLeague.regularFrom`, `opponentOf`.
- `TRADE_W = { cur: 0.4, proj: 0.3, adp: 0.3, shrinkGames: 20, slope: 2.0, winM: 0.1, tagGap: 0.5 }`. `TRADE_W.winM` is per percentage point of the other team's Win M.
- `rosWinM(ctx, roster: { [teamId]: fid[] }, teamId) -> { mean: number, periods: [{ n, opp, p }] }`: over `regularFrom(L, ctx.cur ?? 1)`, other rosters as given. Returns `{ mean: null, periods: [] }` after the regular season.
- `perceived(ctx, pp) -> { cur, proj, adp, pv, rv }`, all in `valueZ` units:
  - `proj = valueZ(pp.line, pp.g)`
  - `cur = valueZ(curLine(pp))` (= `proj` without actuals)
  - `adp` = `valueZ` of the projected player at rank `round(pp.adp)` by projected value; no ADP → rank 168
  - `pv = 0.4·cur + 0.3·proj + 0.3·adp`
  - `rv = proj`
- `evaluateTrade(ctx, { a, b, aGets: fid[], bGets: fid[] }) -> { dA, dB, total, likelihood, gapB, multi }`:
  - `dA`, `dB` are percentage points of rest-of-season Win M; `total = dA + dB`.
  - `gapB = Σ pv(bGets) − Σ pv(aGets)`.
  - `likelihood = 1 / (1 + e^−(slope·gapB + winM·dB))`.
  - `multi = aGets.length !== bGets.length`.
  - Throws `Error('…')` if `a === b`, a key is not on the giving team, or a key is on both sides.

- [ ] **Step 1: Write the failing tests:**

```js
test('an empty trade changes nothing', …);              // dA = dB = 0, likelihood = 1/(1+e^0) = 0.5
test('a trade and its reverse cancel', …);              // evaluate on swapped rosters: dA' ≈ −dA (1e-9)
test('rest of season covers current to period 17 with the real opponents', …);
test('likelihood rises when B receives more perceived value', …);
test('multi flag on uneven trades', …);
test('invalid trades throw', …);                        // same team; player not on the giving team; player on both sides
test('perceived value weights are 0.4 / 0.3 / 0.3', …);
```

- [ ] **Step 2:** Run it. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run it and the suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: trade evaluation over the remaining regular season`.

---

### Task 10: Trade finder and Sell High / Buy Low

**Files:** Modify `src/trade_core.js`. Test: `src/tests/trade_finder.test.js`.

**Interfaces:**
- `findTrades(ctx, myKey, { limit = 25 }) -> TradeRow[]`, where `TradeRow = { give: PoolPlayer, target: PoolPlayer, team: teamId, likelihood, dA, dB, total, buyLow: boolean }`.
  - One-for-one: `myKey` for every player on every other team.
  - Keeps rows with `dA > 0`, sorted by `dA × likelihood` descending.
  - `buyLow` ⇔ `rv − pv ≥ tagGap`.
- `sellHighBuyLow(ctx, { limit = 8, targets = 3 }) -> { sellHigh: [{ player, gap, trades: TradeRow[] }], buyLow: [{ player, gap, trades: TradeRow[] }] }`:
  - Sell High: my players with `pv − rv ≥ tagGap`, by gap descending, each with `findTrades(…, {limit: targets})`.
  - Buy Low: other teams' players with `rv − pv ≥ tagGap`, each with my best `targets` one-for-one offers for him.
  - Rest-of-season matchups are cached per (team, roster signature).

- [ ] **Step 1: Write the failing tests:** rows are one-for-one with the target on another team; sorted by `dA × likelihood`; `buyLow` tag matches the gap rule; Sell High players are mine and Buy Low players aren't; each Buy Low trade offers one of my players; the whole fixture league computes in < 3 s.
- [ ] **Step 2:** Run it. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run it and the suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: one-for-one trade finder with Sell High and Buy Low lists`.

---

### Task 11: In-Season page, data loading and Matchup tab

**Files:**
- Create: `src/inseason.html`, `src/tests/browser/inseason_page.mjs`
- Modify:
  - `src/gen.py`: build `courtside-inseason.html` with placeholders `/*__DATA__*/`, `/*__DAYS__*/` (`const SCHED_DAYS=…`), `/*__ENGINE__*/`, `/*__SHARED__*/`, `/*__INSEASON__*/` (the four modules concatenated) and `<!--__HOW__-->`
  - `src/build_site.py:17-19`: write `site/inseason.html` with the description "In-season tools for a Fantrax league: weekly matchup win chances, waiver adds and trades."
  - `src/shared.js:36-39`: `TOOLBAR_HTML` gets a third link, `inseason.html` "In-Season", with `active === 'inseason'`
  - `src/tests/shared.test.js:29-34`
  - `src/tests/browser/league_page.mjs:28` (toolbar text `Draft Kit|League Dashboard|In-Season`)

**Interfaces:**
- Consumes everything above. `fxGet` and the transient-retry backoff are copied from `league.html:192-231`, which stays untouched.
- localStorage `courtside-inseason-v1` = `{ leagueId, team: { [leagueId]: teamId }, tab: 'matchup'|'trades', week, adds: { [leagueId + ':' + period]: n }, sort }`.
- League select = the saved Fantrax leagues from `League.listSources`-style `courtside-leagues-v1`, plus the default `mm5i19xxmv4hcbcy`. The team default is that league's saved `myTeam`, else the first team.
- Load order: `league`, `rosters`, `standings`, `players` (via `api/fantrax`), then `stats/espn.json`. A missing stats file shows "No actual stats: perceived value uses projection and ADP only".

- [ ] **Step 1: Write the failing browser check** `inseason_page.mjs`:
  - Routes `api/fantrax` to the Task 2 fixtures and `stats/espn.json` to `espn_2025_26.json` wrapped as `{season: 2026, label: '2025-26', …}`.
  - Freezes `Date.now` at `Date.UTC(2026, 9, 21, 12)`.
  - Reads players.json via a path relative to the script (`import.meta.url`).
  - Checks:
    - No page errors.
    - Toolbar `Draft Kit|League Dashboard|In-Season`.
    - The team select has 14 options.
    - The week select lists periods 1–17 with 1 selected.
    - The matchup table has 9 category rows and a Win M KPI between 0 and 100.
    - The freshness strip contains "2025-26" and "last season".
    - The unmatched count is shown and lists "Aday Mara".
    - The Simple adds table has ≥ 1 row, all with the same Drop cell.
    - Adds left defaults to 4; setting it to 0 empties the plan.
    - Week 5 shows the "current week only" note in the plan panel.
    - The team choice survives a reload.
  - Update the `shared.test.js` toolbar test to expect the `inseason.html` link and `aria-current` on `'inseason'`.
- [ ] **Step 2:** Build (`cd src && python3 gen.py && python3 build_site.py && cp site/index.html ../index.html && cp site/league.html ../league.html && cp site/inseason.html ../inseason.html`), serve the repo root on 8765 and run the check. Expected: FAIL (no page).
- [ ] **Step 3: Implement `inseason.html`.**
  - Header, toolbar and theme match `league.html`.
  - Controls: League, Your team (with the standings record), Week; tabs `.seg` Matchup | Trades.
  - Freshness strip:
    - Rosters fetched at HH:MM.
    - Stats: ESPN `label`, fetched date, in `--warn` with "last season" when `label` isn't the league's season (2026-27).
    - Projections: "BBM + Hashtag average (players.json)".
    - "N players without projections" (button lists them).
  - Matchup tab panels:
    1. You vs opponent (dates): big Win M KPI, games each side, and a category table (Yours | Theirs | Win % chip).
    2. Best single adds (Simple): Add | Pos | Team | Games | Drop | Win M | +Win M.
    3. Waiver add plan: Adds-left number input 0–4, the moves list (Day: add X, drop Y → Win M), start → end, and the droppable players named.
  - Tooltips are one line.
- [ ] **Step 4:** Rebuild and run `inseason_page.mjs`, `league_page.mjs` and the unit suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: In-Season page with the Weekly Matchup Analyzer`.

---

### Task 12: Trades tab (finder, lists, Trade Builder)

**Files:** Modify `src/inseason.html`, `src/tests/browser/inseason_page.mjs`.

**Interfaces:** Consumes `findTrades`, `sellHighBuyLow`, `evaluateTrade`, `perceived`, `catZ`, `TRADE_W`.

- [ ] **Step 1: Extend the browser check (failing):**
  - Trades tab: picking one of my players fills a table with header `Target|Team|Likelihood of trade|+Win M you|+Win M them|Total Win M|Buy Low`. Rows are sortable by clicking a header, as on the League Dashboard.
  - Sell High and Buy Low lists are shown, each item with trade targets.
  - Builder:
    - Team A defaults to me; Team B has 13 options without Team A.
    - The "Team A receives" type-ahead offers only Team B's roster, without players already picked. "Team B receives" works the same way with Team A's roster.
    - Adding two players for one shows the multi-player caveat.
    - Per-player rows show 9 category cells with green/red backgrounds, plus Average and Total rows.
    - The summary strip shows +Win M each team, Total, and Likelihood.
    - Reset Trade empties both sides and the summary.
    - Clicking a finder row loads that trade into the builder.
  - The weights line reads "Perceived value = 40% current + 30% projection + 30% ADP".
- [ ] **Step 2:** Rebuild and run. Expected: FAIL. **Step 3:** Implement.
  - Category cell colour = `chip(0.5 + catZ/4)` from `league.html`.
  - A Projection | Current toggle switches the stat rows between `line` and `curLine`. Win M always uses projections.
  - Run `evaluateTrade` in a `try`; its error shows in the summary.
- [ ] **Step 4:** Rebuild and run all browser checks and the unit suite. Expected: PASS, no page errors.
- [ ] **Step 5: Commit** `feat: Trade Analyzer tab with finder, Sell High / Buy Low and Trade Builder`.

---

### Task 13: Docs, ledger, build check, review

**Files:**
- Modify:
  - `src/app.html`: new How it works card "In-season tools", explaining Win M per tool, adds from tomorrow, the daily active cap, the perceived-value weights, shrinkage, no-projection players, and "projected playoffs not yet included"
  - `src/IDEAS.md`, `src/HANDOFF_ARCHIVE.md`, `src/SESSION_HANDOFF.md`, `src/README.md` (data table: `sched_days.json`, `stats/espn.json`)
- Only with the user's OK, since these are workflow config:
  - `CLAUDE.md`: build command adds `&& cp site/inseason.html ../inseason.html`
  - `.claude/settings.json`: deny `Read(/inseason.html)`
  - `.claude/rules/pages.md`: paths add `src/inseason.html` and the four modules
  - `.claude/hooks/after-edit.mjs`: `testOn` adds the four modules

- [ ] **Step 1:** IDEAS rows. Next is 95; the related rows are 62 (in-season projection model, Parked, untouched) and 6b (streamability in the draft model, Rejected, unrelated because the draft model is unchanged).

  | Row | Item | Status |
  | --- | --- | --- |
  | 95 | Weekly Matchup Analyzer + Simple adds | Adopted |
  | 96 | Waiver add plan (current week) | Adopted |
  | 97 | Trade Analyzer: finder, Sell High / Buy Low, Trade Builder | Adopted |
  | 98 | Perceived-value weights and likelihood scale | Open: tune against real accepted trades |
  | 99 | `Engine.pairMatchup` | Adopted, with the Task 6 numbers |
  | 100 | ESPN stats collector | Adopted; first runner run pending |
  | 101 | Projected playoffs in Trade Analyzer Win M | Open |
  | 102 | Multi-week waiver planning | Open |
  | 103 | Week-to-date actuals in the matchup (daily stat snapshots) | Open |

  Add the archive write-up at the top of "Entries after 2026-10-18".
- [ ] **Step 2:** Handoff:
  - Current state: the In-Season page; data sources; the collector cadence.
  - Open items: projected playoffs (101), the first `collect-stats` run from GitHub (user triggers `workflow_dispatch` after merge; if ESPN blocks the runner, fall back to running the collector on the PC), weight tuning (98).
  - Keep it ≤ 150 lines.
- [ ] **Step 3: Build check.** Run the full build command, `node --test 'src/tests/*.test.js'`, and every `src/tests/browser/*.mjs`. Expected: all PASS, no page errors. `engine.js` changed, so note in the handoff that `courtside-draft-board.html` must be republished to the board artifact at release; do not publish it now.
- [ ] **Step 4: Commit** `docs: in-season tools in How it works, ledger, archive and handoff`.
- [ ] **Step 5: Review.** Run the `reviewer` (Opus) on the whole branch diff, with special attention to Task 5 (engine additions only, golden test) and Review Focus 1–5. Fix each finding test-first. Open the PR; merge only when the user says push.

---

## Self-review notes

- **Spec coverage:**
  - Data table → Tasks 1–4.
  - Two-roster function → 5 (and 6).
  - Matchup goals → 7, 8, 11.
  - Trade goals, layout A, the lists and the builder → 9, 10, 12.
  - Likelihood and shrinkage → 4, 9.
  - The "yours" picker → 11.
  - The playoffs-later note → 13.
  - The anti-goals → Review Focus 1–2, Task 4's loader test, Task 5's golden test.
- **Names used across tasks:** `League`, `Pool`, `PoolPlayer`, `Ctx`, `Segment`, `scoreSegments`, `teamSegments`, `addFrom`, `lowestValue`, `TRADE_W`, `valueZ`, `curLine`, `catZ`, `rosterGames`, `pairMatchup`.

---

## Decisions for the user (before building)

1. **Players without projections.** `players.json` has 234 players. Today 6 rostered players (rookies such as Aday Mara, Mikel Brown, Carter Bryant, plus Keldon Johnson) and almost all of the ~1,108 free agents have no projection.
   - **Default in this plan:** use their ESPN actual per-game line, tagged "no projection". Players with no ESPN line count at waiver level. The waiver pool then holds FAs with either a projection or actual stats.
   - **Alternative:** projected players only. The waiver pool would shrink to about 60 FAs, and rostered rookies would count at waiver level.
   - Note: while the stats are 2025-26 test data, "actual" means last season.
2. **Approve the workflow-config edits in Task 13:** the CLAUDE.md build command, the settings deny rule, the page-rules paths and the hook's `testOn`.

**Answered by the user (2026-10-20):** (1) keep the default: players without projections use their ESPN actual line,
tagged "no projection"; the user will add projections for them later (they flow in through `players.json`).
(2) Approved: the four workflow-config edits in Task 13. Execution: inline (the CLAUDE.md default).

## Execution recommendation

**Native (executing-plans inline).** The 13 tasks form a strict chain where each consumes the previous task's interfaces, and CLAUDE.md defaults to inline execution. The one hard-area task (5) is better handled by pausing for the analyst checkpoint and Opus review; if the user wishes, they can switch the main session to Opus for that task only.

---

## Facts the plan relies on (checked 2026-10-20 with live calls)

- **Fantrax league settings:** `getLeagueInfo` has `playoffs.lastRegularSeasonPeriod` 17 and `firstPlayoffPeriod` 18. `scoringPeriods` lists 20 periods; periods 7 and 17 are two weeks long and boundaries fall on Mondays at 19:00 ET. Matchups for periods 18–22 carry seeds instead of team ids.
- **Team codes:** players.json/sched.json use GSW/NOR/NYK/SAS/PHO/UTA/WAS. Fantrax uses GS/NO/NY/SA/PHO. ESPN uses GS/NO/NY/SA/PHX/UTAH/WSH. So `findListed`'s team tie-break never matches Fantrax codes for those teams. The new code maps codes before calling it and leaves `findListed` unchanged.
- **ESPN endpoint:** one `byathlete` call returns all three stat groups per athlete, and `limit=1000` returns all 578 athletes in one page. The default response is 2025-26.
- **Roster matching:** 6 of 178 rostered players don't match `players.json`.
- **Served files:** `.assetsignore` excludes `src/`, which is why the stats file goes in repo-root `stats/`.
