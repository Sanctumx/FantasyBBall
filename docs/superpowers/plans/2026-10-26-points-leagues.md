# Points Leagues (IDEAS #137 part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Points scoring in Settings (PR 1), then Rankings and Team valued in projected fantasy points with Win M, Vs average and Vs replacement kept and only the unit changed (PR 2).

**Architecture:** PR 1 adds `scoring: 'points'` and a `pointVals` object to the shared league store and the Settings form. Every tab that cannot handle points yet shows a "not supported yet" note. PR 2 adds a pure module, `src/points_core.js`. It turns a stat line into fantasy points (FP) and an FP variance, using the engine's own per-stat variances plus a correlation matrix measured from game logs. It also builds an "engine view": copies of the players and the context with the FP total in one category slot (`FP_SLOT`) and zeros elsewhere. That way `Engine.evaluate` runs unchanged, and its single-category chance for that slot is the normal-distribution chance that one total beats the other. Win M = 100 × gainC[FP_SLOT]. `engine.js` only gains exports and an output-neutral refactor, so category output stays byte-identical.

**Tech Stack:** Vanilla JS (UMD modules, browser and Node), `node --test`, Playwright browser checks, Python build scripts.

**Spec:** `docs/superpowers/specs/2026-10-26-points-leagues-design.md`

## Global Constraints

- Defaults go in `LeagueStore.LEAGUE_DEF` only; `migrate()` never changes a saved setting (IDEAS #79). Old saved leagues keep working with no points values.
- Points mode must not change anything for category leagues: `engine_golden.test.js` and all existing tests stay green. `engine_golden.json` is never regenerated in this work.
- No silent category numbers are shown for a points league.
- Point stats, in this order: `pts, reb, ast, stl, blk, to, tpm, fgm, fga, ftm, fta`. Values may be negative or decimal, from −100 to 100. The default is 0. Values are kept when Scoring switches away. The 8/9-cat choice is hidden in points mode.
- Draft in points mode shows a "not supported yet" note and does not fall back to categories. The Matchup and Trade Analyzers are out of scope (they show the same note).
- Test first: write the failing test, watch it fail, then make it pass. Unit tests: `node --test src/tests/*.test.js`, with the glob unquoted because Git Bash does not expand a quoted glob.
- Browser checks live in `src/tests/browser/*.mjs`. Run them from a folder with Playwright installed, as `REPO=<repo root> node X.mjs`, with the repo root served by `python -m http.server 8765`.
- Edit templates in `src/`, never the built pages. Rebuild with: `cd src && python gen.py && python build_site.py && cp site/index.html ../index.html && cp site/league.html ../league.html && cp site/inseason.html ../inseason.html && cp site/settings.html ../settings.html && cp site/rankings.html ../rankings.html && cp site/team.html ../team.html`. In PR 1, drop the `team.html` copy if `site/team.html` does not exist yet. Use `python`, not `python3`, on this PC.
- Hover tooltips are one line; the longer text goes in the tab's How it works.
- Commits use type prefixes (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`). The `reviewer` subagent runs once per branch at effort high. Push or merge only when the user says "push".

## Variance design (hard area; the plan's decision)

A player's FP per game is m = Σ wₛ·sₛ, with fgm = fgp·fga and ftm = ftp·fta, as in `prepPlayers`. Each engine variance becomes FP units like this:

- **Games played** (`VAR_GAMES` 0.82, `SIGMA_G2` 1.87, games gap): every stat scales with games, so this part is exactly m²·VAR_GAMES. It is the same shared games factor as the categories and needs no covariance.
- **Game-to-game noise** (`perGameVar`): pgVar = Σᵢⱼ wᵢwⱼ ρᵢⱼ σᵢσⱼ.
  - σᵢ² for tpm, pts, reb, ast, stl, blk and to come from the engine's existing fits, `Engine.perGameVar(line)[2..8]`.
  - Four new fits, measured the same way (pooled variance/mean): fgm 1.230·fgm, fga 1.415·fga, ftm 1.999·ftm, fta 2.177·fta.
  - ρ is the pooled within-player per-game correlation from `src/logs3.csv` (2023-24 to 2025-26), using the filter the existing fits used: player-seasons with 25+ games and 20+ minutes per game. That is 723 player-seasons and 46,381 games.
  - Measured on 2026-10-26: ρ(pts,fgm) 0.94, ρ(ftm,fta) 0.94, ρ(fgm,fga) 0.78, ρ(pts,fga) 0.75, ρ(pts,tpm) 0.66; most others are 0.03 to 0.33. The 2021-23 logs agree within 0.02.
  - The same script reproduces the engine's existing coefficients within 0.006 (reb 1.340 vs 1.336, to 1.027 vs 1.022), which confirms the method matches.
  - Correlations matter: they raise Yahoo-style FP variance by 1.39× and ESPN-style by 1.19× over treating stats as independent.
- **Weekly** (`weekVar`): (GPW·g/82)·pgVar + m²·VAR_GAMES, the same form as the engine's.
- **Projection error** (`projVar`, 12% per counting stat): (0.12·g)²·Σᵢⱼ wᵢwⱼ ρᵢⱼ mᵢmⱼ. This uses the same measured ρ (decision 3 below). fgm, fga, ftm and fta count as counting stats here.
- **Team noise:** the same 80 simulated ADP drafts as `scaleFor`, through a new export `Engine.draftSims`, and the same formulas: idio = PGv + SIGMA_G2·max(0, S2 − S1²/n), load = S1/n, with gapSd unchanged.
- **One-stat check:** with a single counting stat scored (for example REB = 1), every FP number must equal the engine's number for that category. Task 8 tests this; it is what proves "only the unit changes".
- **Shrink:** K_MATCH (0.72) and K_CAT (0.82) do not carry over, because they are not in the category path either. The Rankings Win M (`Engine.evaluate`) never shrinks, and the Team tab moved off `pairMatchup` onto `Engine.evaluate` on 2026-10-26 with "no shrink toward 0.5" (team-core `team_win.js`). Only the Matchup and Trade Analyzers shrink, and they are out of scope. If #139 adds a shrink later, points needs its own fit: a single total behaves like one category, so K_CAT is the nearer analogue, but it has not been refitted.
- **No Model-pick backtest needed:** Draft shows the note in points mode and `MODEL_CFG` never sees points. A calibration of points Win M on real weeks is an analyst follow-up and does not block shipping (decision 4).

## Review Focus

1. Old saved settings or an old saved draft without `pointVals`: everything loads, and loading an old draft with "Switch settings?" keeps the typed point values. Tests: Task 1 (`draftSettings`) and Task 3 (browser).
2. A bad box entry (letters, 150, a browser badInput, an empty box): bad input reverts the box with a one-line warning, an empty box means 0, and nothing stores NaN. Tests: Task 1 (`normalize`) and Task 2 (browser).
3. Every point value is 0 while Scoring is points: Rankings and Team show 0 and a hint, Win M is 0, and nothing is NaN. Tests: Task 8 and Task 10.
4. A point value is changed in Settings while Rankings or Team is open in another tab: the numbers refresh, because the caches are keyed on `Points.key(w)`. Tests: Task 10 and Task 12 (browser).
5. Negative-heavy weights (ESPN-style FGA −1, FTA −1): the variance stays ≥ 0 (ρ is positive semidefinite and the result is clamped), and players with negative FP rank last. Tests: Task 7 and Task 8.

## Where the spec and the code disagree (read before building)

- **"Per saved league":** the store keeps one `settings` object for every league. Scoring and categories are not per league either; loading another league changes only teams, roster and lineup. This plan stores `pointVals` with the other league settings (decision 1).
- **"Nothing downstream reads them yet" (PR 1):** once Settings offers `points`, Draft, League, Matchup, Trade and Rankings would read `scoring: 'points'` and silently show category numbers. `app.html` would even print "undefined" in its league summary. PR 1 therefore includes the "not supported yet" notes (Task 3), including the Draft note the spec placed in PR 2.
- **"Existing shrink toward 0.5":** none applies on Rankings or Team (see Variance design).
- **Team tab:** it is not on `origin/main`. It lives on the unmerged `team-core` branch (#131), which is still changing `engine.js`, `team_win.js` and the Rankings Vs average. PR 2 starts only after #131 merges. The names in Tasks 11-12 come from `team-core` 1f36e98 and must be re-read then.
- **Rankings Basis has three options** (Per game, Season, Mix). The spec defines only per game and season, so Mix is hidden in points mode (decision 5).
- **Team Active nights already ignore position:** the nightly cap counts players only (`Matchup.segGames`). It picks the best players by category `valueZ`, so in points mode it must pick by FP per game (Task 11).

## Files

PR 1:
- `src/league_store.js`: point stats, defaults, validation, helpers
- `src/settings.html`: form
- `src/app.html`, `src/league.html`, `src/inseason.html`, `src/rankings.html`: points note
- Tests: `src/tests/league_store*.test.js`, `src/tests/browser/settings_page.mjs`, new `src/tests/browser/points_note.mjs`

PR 2:
- New `src/points_core.js`: FP math and the engine view
- New `src/points_fit.js`: the correlation fit
- `src/engine.js`: exports only
- `src/rankings_core.js`, `src/rankings.html`
- `src/matchup_core.js` (`nightValue` hook)
- `src/team_win.js`, `src/team_view.js`, `src/team.html`
- `src/gen.py`
- Tests: `src/tests/points_core.test.js`, `src/tests/points_engine.test.js`, `src/tests/engine_points_hooks.test.js`, `src/tests/category_golden.test.js` with its fixture maker, and the existing Rankings, Team and Matchup tests and browser checks

---

## PR 1: Settings and store (branch `yahoo-points-137`)

### Task 1: Point values in the league store

**Files:**
- Modify: `src/league_store.js` (LEAGUE_DEF, LEAGUE_KEYS, normalize, api)
- Test: `src/tests/league_store.test.js`, `src/tests/league_store_fx.test.js`

**Interfaces:**
- Produces:
  - `POINT_STATS: string[]` (the 11 keys, in order)
  - `POINT_LABELS: {key: label}`: Points, Rebounds, Assists, Steals, Blocks, Turnovers, 3-pointers made, FG made, FG attempted, FT made, FT attempted
  - `PT_MAX = 100`
  - `LEAGUE_DEF.pointVals` (all 0)
  - `isPoints(s) → boolean`
  - `draftSettings(current, draftCfg) → settings`: the draft's LEAGUE_KEYS over the defaults, keeping `current.pointVals`
  - `POINTS_NOTE_HTML: string`
  - `LEAGUE_KEYS` excludes `'pointVals'`, so the Draft board never stores it and `sameLeague` ignores it

- [ ] **Step 1: Write the failing tests**
  - `LEAGUE_DEF` deep-equals the old object plus `pointVals` with the 11 keys at 0. Update the existing expectation.
  - `normalize({scoring:'points', cats:8, pointVals:{to:-1.5, reb:1.2}})` gives scoring `'points'`, cats 8, to −1.5, reb 1.2, the other 9 keys 0.
  - Each of `'2', NaN, Infinity, 101, -100.01, null` in a box becomes 0, and an unknown key is dropped.
  - A missing `pointVals` becomes all zeros, and the result is a new object (`!== LEAGUE_DEF.pointVals`).
  - `load` of saved settings without `pointVals` returns them unchanged plus zeros.
  - `LEAGUE_KEYS.includes('pointVals') === false`, and `sameLeague` is true when only `pointVals` differs.
  - `applyFantrax` keeps `scoring: 'points'` and `pointVals`.
  - `draftSettings({…, pointVals: {to: -1}}, {teams: 12, scoring: 'h2h'})` gives teams 12, scoring `'h2h'`, to −1.
  - `isPoints({scoring:'points'}) === true`.
- [ ] **Step 2: Run `node --test src/tests/league_store.test.js src/tests/league_store_fx.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement in `src/league_store.js`.** Each value is kept if `typeof v === 'number' && isFinite(v) && Math.abs(v) <= PT_MAX`, otherwise it becomes 0. Do not round.
- [ ] **Step 4: Run `node --test src/tests/*.test.js`.** Expected: all PASS.
- [ ] **Step 5: Commit** `feat: points scoring and point values in the league store (#137)`.

### Task 2: Settings tab, the Points option and the boxes

**Files:**
- Modify: `src/settings.html` (form at lines 147-171, `renderSettings`, `onSetting`)
- Test: `src/tests/browser/settings_page.mjs`

**Interfaces:**
- Consumes: Task 1's `POINT_STATS`, `POINT_LABELS`, `PT_MAX` and `normalize`.

- [ ] **Step 1: Write the failing browser checks.**
  - Picking Scoring `H2H: points` shows `#pv-row` and hides the Categories label.
  - `#pv-to` set to −1.5 stores `settings.pointVals.to === -1.5`, and `#pv-reb` set to 1.25 stores 1.25.
  - 150 shows `#pv-warn` and puts the box back to the stored value, with the store unchanged.
  - Clearing a box stores 0.
  - Switching to `h2h` hides the row, shows Categories with its old value, and keeps to −1.5 in the store. Switching back shows −1.5.
  - A reload keeps everything, and there are no page errors.
- [ ] **Step 2: Build, then run `settings_page.mjs`.** Expected: the new checks FAIL.
- [ ] **Step 3: Implement.**
  - Add `<option value="points">H2H: points</option>`.
  - Add `<div class="grid2" id="pv-row" hidden>` with one `<label class="f" for="pv-<key>">` per stat, each holding `<input type="number" step="any" min="-100" max="100">`.
  - Add one hint line: "Fantasy points per stat; a negative value subtracts. Unscored stats stay 0."
  - The `pv-row` tooltip is one line.
  - `validity.badInput` or out of range: revert and warn. Empty: 0. Otherwise save through `LS.normalize`, then `persist()` and `renderSettings()`.
- [ ] **Step 4: Rebuild; run `settings_page.mjs` and the unit suite.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: Settings - points scoring with a point value per stat (#137)`.

### Task 3: Tabs that can't value points say so

**Files:**
- Modify: `src/app.html`
  - `SC_NAME` gains `points: 'H2H points'`.
  - When `LS.isPoints(cfg)`, the board area is replaced by `LS.POINTS_NOTE_HTML` and the engine does not run.
  - The saved-draft load at line 987 builds `ds` with `LS.draftSettings(SS.settings, d.cfg)`.
  - How it works gets a points paragraph. This is the only copy; `gen.py` shares it.
- Modify: `src/league.html`, `src/inseason.html`, `src/rankings.html`: when `LS.isPoints(SS.settings)`, show the note before the no-league check and render no table.
- Test: create `src/tests/browser/points_note.mjs`.

**Interfaces:**
- Consumes: `isPoints`, `draftSettings`, `POINTS_NOTE_HTML`. The text is "Points leagues aren't supported on this tab yet. Scoring is set to points in <a href="settings.html">Settings</a>."

- [ ] **Step 1: Write the failing browser check.**
  - Seed `courtside-settings-v1` with scoring `points` and a league.
  - `index.html`, `league.html`, `inseason.html` and `rankings.html` each show "aren't supported on this tab yet" and have 0 player rows.
  - With `h2h`, Draft and Rankings have rows.
  - With stored `pointVals.to = -1`, a saved h2h draft with 12 teams, loaded through "Switch settings?", stores teams 12 and to −1.
- [ ] **Step 2: Build; run it.** Expected: FAIL.
- [ ] **Step 3: Implement the guards** at each page's render entry, next to its `NO_LEAGUE_HTML` use.
- [ ] **Step 4: Rebuild; run `points_note.mjs` and every existing browser check** (draft_settings, draft_import, league_page, inseason_page, rankings_page, settings_page), plus the unit suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Draft, League, Matchup, Trade and Rankings show a not-supported note in points leagues (#137)`.

### Task 4: Build, record, review, pull request

- [ ] Rebuild with the Global Constraints command. Run the full unit suite and every browser check. Expected: all PASS, and `engine_golden.test.js` is untouched.
- [ ] Edit IDEAS #137's row in place to say PR 1 is built, and update the handoff line. Commit `docs: handoff points PR 1 built (#137)`.
- [ ] Run the `reviewer` subagent at effort high on the branch diff. Fix what matters, each fix with a test that failed first.
- [ ] Push and open the PR only when the user says "push" (summary, tests run, decisions).

---

## PR 2: Points in Rankings and Team (new branch from `origin/main` after #131 and PR 1 have merged)

### Task 5: Pin the category output of Rankings and Team before any change

**Files:**
- Create: `src/tests/fixtures/make_category_golden.js`, `src/tests/fixtures/category_golden.json`, `src/tests/category_golden.test.js`

**Interfaces:**
- Produces: `compute()`, built like `make_engine_golden.js` and compared with the same `same()` at 1e-12. It covers, on `golden_players.json`:
  - `Rankings.table` for every type × `pergame`/`total` × cats 9/8.
  - `Rankings.winStart` without lists and with 14×12 lists in ADP order, all `rep`/`avg` values after draining `step()`.
  - On the fixture ctx that `team_win.test.js` uses: `TeamWin.matrix`, `moduleScores` (`rep` and `avg`) and `Matchup.segGames`.

- [ ] **Step 1: Write the maker and the test; generate the JSON on unchanged code.**
- [ ] **Step 2: Run `node --test src/tests/category_golden.test.js`.** Expected: PASS (it pins today's numbers).
- [ ] **Step 3: Commit** `test: pin Rankings and Team category outputs before points mode (#137)`.

### Task 6: Engine hooks (exports only, outputs unchanged)

**Files:**
- Modify: `src/engine.js`
  - Extract the draws, sort and `teamAt` of `scaleFor` into `draftSims`, and have `scaleFor` use it. It must consume the RNG in the same order.
  - Set `p.gUse = gOf(p)` in `buildContext`.
  - Add `const PROJ_SD = 0.12` and use it in `projVar`.
  - Export the new names.
- Test: create `src/tests/engine_points_hooks.test.js`

**Interfaces:**
- Produces:
  - `Engine.draftSims(players, cfg) → number[][][]`: [sim][team] → player indexes, 80 sims, min(N·R, n) picks each.
  - `p.gUse`: g for `total`, `ctx.G0` for `pergame`, (g+G0)/2 for `mix`.
  - `Engine.perGameVar(line) → Float64Array(9)`.
  - `Engine.VARS = { GPW: 3.42, VAR_GAMES: 0.82, SIGMA_G2: 1.87, SEASON_G: 80, PROJ_SD: 0.12 }`.

- [ ] **Step 1: Write the failing tests.**
  - Two `draftSims` calls deep-equal each other.
  - Each sim has N teams, min(N·R, n) picks in total, and no repeated index.
  - `gUse` is right for each basis.
  - With `ilSpots: 0` and `total`, `p.x[4] === p.reb * p.gUse`.
- [ ] **Step 2: Run them.** Expected: FAIL ("draftSims is not a function").
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `node --test src/tests/*.test.js`.** Expected: all PASS, including `engine_golden` and `category_golden`, with no fixture regenerated.
- [ ] **Step 5: Commit** `refactor: engine exports draft sims, games used and variance constants (#137)`.

### Task 7: The correlation fit and one player's FP variance

**Files:**
- Create: `src/points_fit.js`
  - Reads `src/logs3.csv` and keeps player-seasons with 25+ games and 20+ mpg.
  - Uses per-game deviations from each player-season's means.
  - Prints ρ to 3 decimals in `POINT_STATS` order (fg3m → tpm, tov → to).
  - Prints pooled variance/mean for fgm, fga, ftm and fta, and for the 7 existing stats to compare.
- Create: `src/points_core.js` (UMD, global `Points`; requires `engine.js` and `league_store.js`)
- Test: create `src/tests/points_core.test.js`

**Interfaces:**
- Produces:
  - `Points.RHO: number[11][11]`, pasted from the fit output.
  - `Points.DISP = { fgm: 1.230, fga: 1.415, ftm: 1.999, fta: 2.177 }`.
  - `statsOf(line) → {11 keys}` per game.
  - `perGame(line, w) → number`.
  - `pgVar(line, w) → number`.
  - `projVar(line, g, w) → number`.
  - `weekVar(line, g, w) → number`.
  - `key(w) → string`.
  - The formulas are the ones in Variance design. Both quadratic forms are clamped at ≥ 0.

- [ ] **Step 1: Run `node src/points_fit.js`.** Expected: the values in Variance design, within 0.005. Paste RHO and DISP into `points_core.js`.
- [ ] **Step 2: Write the failing tests.**
  - RHO is symmetric with diagonal 1, a Cholesky factorization succeeds, and the 5 named entries match within 0.005.
  - `pgVar(line, {reb:1}) === Engine.perGameVar(line)[4]`.
  - `pgVar(line, {to:-1}) === perGameVar(line)[8]` and `perGame(line, {to:-1}) === -line.to`.
  - `pgVar(line, {pts:1}) === 5.38 * line.pts ** 0.78`.
  - `projVar(line, 70, {reb:1}) === (0.12 * line.reb * 70) ** 2`.
  - `perGame({fgp:0.5, fga:10, …}, {fgm:2, fga:-1}) === 0`.
  - With Yahoo weights `{pts:1, reb:1.2, ast:1.5, stl:3, blk:3, to:-1}` on a 20-point line, `pgVar` divided by the diagonal-only sum is between 1.2 and 1.6.
  - ESPN weights give `pgVar >= 0`, and zero weights give 0 everywhere.
- [ ] **Step 3: Run `node --test src/tests/points_core.test.js`.** Expected: FAIL. Implement until it passes.
- [ ] **Step 4: Commit** `feat: points_core - fantasy points of a stat line and its variance with measured stat correlations (#137)`.

### Task 8: One points total through the engine

**Files:**
- Modify: `src/points_core.js`
- Test: create `src/tests/points_engine.test.js`

**Interfaces:**
- Consumes: Task 6 (`draftSims`, `gUse`, `VARS`), Task 7.
- Produces:
  - `Points.FP_SLOT = 3`.
  - `Points.noise(P, ctx, cfg, w) → { idio, load, h2h }`, in the units of `ctx.idioNoise`, `ctx.loadS` and `ctx.h2hNoise`.
  - `Points.engineView(P, ctx, cfg, w) → { P, ctx }`, where P is prepped and ctx comes from `Engine.buildContext(P, cfg)`.
  - `Points.entry(line, games, ctx, w) → { x, pv }`: games in season units, IL fill off, the points version of `Engine.entryVec`.
  - Win M = 100 · gainC[FP_SLOT] after `Engine.evaluate(view.P, view.ctx, cfg, state)`. A match chance is `out.catProb(A, B, FP_SLOT)`.

- [ ] **Step 1: Write the failing tests.**
  - **Parity:** use `golden_players`, `cfg = Rankings.cfgFor({teams:14, roster:12, cats:9, ilSpots:3, basis:'total'})` with `field: null`, and w `{reb:1}`. For every player, `view.P[i].x[3]` and `.pv[3]` equal the category `x[4]` and `pv[4]` (1e-12). `noise.idio === ctx.idioNoise[4]` and `noise.load === ctx.loadS[4]`. With 167 of 168 slots filled, every candidate's `gainC[3]` equals the category run's `gainC[4]`.
  - The same with `{to:-1}` against category 8, and with basis `pergame`.
  - With `field: 'easy'`, `view.P[i].fieldV === view.P[i].x[3]`.
  - Yahoo weights: every gain is finite and the top-x player's gain is in the top 5. Zero weights: all gains are 0 and none is NaN.
  - `entry(line, 72, ctx, {reb:1}).x[3] === Engine.entryVec(line, ctx, 72).x[4]`, and the same for pv.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** The algorithm, which the signatures do not determine:
  - **Copies:** x and pv are 0 in every slot except FP_SLOT.
    - x[FP_SLOT] = perGame·gUse + max(0, SEASON_G − gUse)·ctx.ilFill·replFP, where replFP is the mean `perGame` at ADP ranks N·R+1 … N·R+20, sorted with `Engine.adpOf(p, cfg.adpSrc)` as `buildContext` sorts.
    - pv[FP_SLOT] = `projVar(line, gUse, w)`.
    - fieldV = x[FP_SLOT].
  - **ctx copy:** `idioNoise`, `loadS` and `h2hNoise` are copied with FP_SLOT replaced from `noise()`. Every other field is shared.
  - **`noise()`:** over `draftSims`, for each drafted player take m = perGame and WV = weekVar(line, gUse, w).
    - Per team, sum S1 = Σm, S2 = Σm² and PGv = Σ(WV − m²·VAR_GAMES). Average each over SIMS·N teams; nT = picks / teams.
    - idio = PGv + SIGMA_G2·max(0, S2 − S1²/nT); then idioNoise = 2·idio·WEEKS² and loadS = (S1/nT)·WEEKS.
    - h2h = 2·(ΣWV / teams)·WEEKS².
    - Multiply by `cfg.noiseK` when it is set, as `buildContext` does.
- [ ] **Step 4: Run `node --test src/tests/*.test.js`.** Expected: all PASS.
- [ ] **Step 5: Commit** `feat: points_core - one fantasy-points total through Engine.evaluate with the engine's own noise (#137)`.

### Task 9: Rankings core in points mode

**Files:**
- Modify: `src/points_core.js` (table), `src/rankings_core.js` (`winStart`), `src/gen.py` (`points_core.js` goes before `rankings_core.js` in the Rankings mods)
- Test: `src/tests/rankings_core.test.js`

**Interfaces:**
- Produces:
  - `Points.table(rows, w, {teams, roster, basis}) → [{pid, z, fpg, cats: null, inPool}]`
    - z = fpg for `pergame`, and fpg × (r.gp ?? r.g) for `total`.
    - Rows are best first; rows with g ≤ 0 go last with z null.
    - inPool marks the top teams×roster.
  - `Rankings.winStart(rows, tab, o)` with `o.points = w`: values are `{c: null, m}` with m = 100·gainC[FP_SLOT]. The average entry is built from the points copies exactly as today.

- [ ] **Step 1: Write the failing tests.**
  - `table` values and order on 3 rows for each basis.
  - The points `winStart` m equals a direct `engineView` plus `evaluate` on the same picks, both without lists and through `step()` with lists.
  - `c === null`.
- [ ] **Step 2: Run them.** Expected: FAIL. Implement until they pass.
- [ ] **Step 3: Run `node --test src/tests/*.test.js`.** Expected: PASS, and `category_golden` is unchanged.
- [ ] **Step 4: Commit** `feat: Rankings core - points table and Win M in points (#137)`.

### Task 10: The Rankings page in points mode

**Files:**
- Modify: `src/rankings.html`
- Test: `src/tests/browser/rankings_page.mjs`

**Interfaces:**
- Consumes: Task 9 and `LS.isPoints`.

- [ ] **Step 1: Write the failing browser checks.**
  - With Yahoo weights: the header shows Points, there is no Win C header, Win M and Edge are present, and Points is in descending order under Order by Points.
  - Changing `pointVals` in another page changes the top row's value.
  - All zeros shows the hint "All point values are 0: enter your league's values in Settings."
  - With `h2h`, the existing checks pass.
- [ ] **Step 2: Build; run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Remove the PR 1 note on this tab.
  - The Zscore column becomes Points: "Pts/g" for Per game, "Pts" for Season. Hide Win C.
  - The category columns show raw per-game stats.
  - Hide Zscore type, Stats, Zscore drop, the category weights and the Order by option "Win C".
  - Basis offers Per game and Season; a saved Mix shows as Per game and the saved UI is not rewritten.
  - The tab and win cache keys include `Points.key(w)`.
  - Add one How it works or footnote paragraph covering the points formula and Win M as one weekly total. Tooltips stay one line.
- [ ] **Step 4: Rebuild; run `rankings_page.mjs`, `points_note.mjs` and the unit suite.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: Rankings - points mode (Points column, Win M in points, no Zscore or Win C) (#137)`.

### Task 11: Team core and win numbers in points mode

**Files:**
- Modify: `src/matchup_core.js`: `nightValue` uses `ctx.nightOf(pp)` when it is set. The Matchup Analyzer never sets it.
- Modify: `src/team_win.js`: `opts.points` flows through `engCtx` (cache key gets `Points.key(w)`), `teamVec` (uses `Points.entry`), `matrixOf` (match = `out.catProb(A, B, FP_SLOT)`), `gain`, `playerGain`, `avgParts`/`avgOwn`/`avgCandidate`, `moduleSetup`, `moduleRow` and `moduleScores`.
- Modify: `src/gen.py`: on the Team page, `points_core.js` goes before `team_win.js`.
- Test: `src/tests/team_win.test.js`, `src/tests/matchup_core.test.js`

**Interfaces:**
- These names come from team-core 1f36e98; re-read them on main before starting.
- Produces:
  - In points mode, a matrix is `teams: [{id, cat: null, match, winC: null}]` and `mean: {cat: null, match, winC: null}`, and a gain is `{c: null, m, dCat: null}`.
  - `TeamWin.pointsPerWeek(ctx, state, w) → number`: Σ perGame·games per average week over the counted players.
  - The Team page builds its ctx with `ctx.nightOf = pp => Points.perGame(pp.line, w)` in points mode.

- [ ] **Step 1: Write the failing tests.**
  - With `{reb:1}`, each opponent's points `match` equals the category matrix's `cat[4]` (1e-12). This is the only-the-unit-changes check.
  - With Yahoo weights, `match` is in (0, 1), `moduleScores` rows are sorted by dM, and `c` is null.
  - With `ctx.nightOf`, a low-Z, high-FP player wins the capped night. Without it, `segGames` is unchanged (`category_golden`).
- [ ] **Step 2: Run them.** Expected: FAIL. Implement until they pass.
- [ ] **Step 3: Run `node --test src/tests/*.test.js`.** Expected: PASS.
- [ ] **Step 4: Commit** `feat: Team core - Win M, Vs average and Vs replacement in points (#137)`.

### Task 12: The Team page in points mode

**Files:**
- Modify: `src/team.html`, `src/team_view.js`
- Test: `src/tests/team_view.test.js`, `src/tests/browser/team_page.mjs`

- [ ] **Step 1: Write the failing tests.**
  - Points view: there are no Z, Win C or per-category change columns.
  - A Points column shows FP per game, or in the totals view FP over his Plays % games, and the team row is the sum.
  - The swap panel, the Changes list and the Old vs New cards show Win M and "Points/wk" (`pointsPerWeek`) and no category or Win C numbers.
  - Changing `pointVals` in another page refreshes the numbers.
  - With `h2h`, the existing checks pass.
- [ ] **Step 2: Build; run them.** Expected: FAIL. Implement, with a one-line tooltip and a How it works paragraph.
- [ ] **Step 3: Rebuild; run `team_page.mjs` and the unit suite.** Expected: PASS.
- [ ] **Step 4: Commit** `feat: Team tab - points mode (#137)`.

### Task 13: Build, record, review, pull request

- [ ] Change `POINTS_NOTE_HTML` to end with "Rankings and Team work in points leagues." and update Task 3's check to match.
- [ ] Rebuild with the full command, including `team.html`. Run every unit test and browser check. Expected: all PASS, and `engine_golden.json` and `category_golden.json` are byte-identical to their committed versions (`git diff --stat` shows neither).
- [ ] Records:
  - Edit IDEAS #137's row in place.
  - Add a new Open row: "points Win M calibration on 2024-26 real weeks for 2-3 common scoring systems (analyst)".
  - Add the archive write-up at the top of "Entries after 2026-10-18".
  - Update the handoff.
  - Commit `docs: points leagues PR 2 (#137)`.
- [ ] Run the `reviewer` at effort high on the whole branch. Fix what matters, each fix with a test that failed first.
- [ ] Push and open the PR only when the user says "push".

---

## Self-review

1. **Spec coverage:**
   - Settings option, boxes and hidden 8/9-cat: Tasks 1-2.
   - Values kept when Scoring switches: Tasks 1-2.
   - Rankings per-game and season points, ranking, Zscore and Win C hidden: Tasks 9-10.
   - Team sum: Task 12.
   - Vs average, Vs replacement and Win M in points with the same machinery: Tasks 8, 9 and 11.
   - Draft note: Task 3.
   - Category output unchanged: Tasks 5 and 6, plus the regression in every task.
   - FGM/FTM derived: Task 7.
   - Covariance measured: Task 7.
   - Shrink question: answered in Variance design.
2. **Steps:** each test step names its assertions with the spec's values, and only `noise`/`engineView` get an algorithm sketch because the signatures don't determine them.
3. **Names:** `pointVals`, `POINT_STATS`, `isPoints`, `draftSettings`, `POINTS_NOTE_HTML`, `Points.{perGame, pgVar, projVar, weekVar, key, table, noise, engineView, entry, FP_SLOT}`, `Engine.{draftSims, perGameVar, VARS}`, `p.gUse` and `TeamWin.pointsPerWeek` are used the same way in every task.
4. **Review Focus:** each item has a test in its owning task.
5. **Proportion:** the code blocks are signatures and assertions only.
