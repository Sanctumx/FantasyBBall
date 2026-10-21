# Session handoff — Courtside Draft Kit (Fantasy BBall)

_Last updated: 2026-10-20_ · Current state only, about 150 lines max. Replace lines instead of appending.
Every idea ever tried: `src/IDEAS.md` (one line each, search it). Full write-ups: `src/HANDOFF_ARCHIVE.md` (search `^N\.`).
How work gets done (branch → PR → merge, model routing): the repo's `CLAUDE.md`.

## What this is

A live snake-draft board for 9-cat / 8-cat H2H fantasy basketball, built on BBM + Hashtag 2026-27 projections (averaged) and
Fantrax ADP, plus a League Dashboard. It ranks players by Zscore, Win C, Win M, availability (There at / Lasts to), Edge and a
Model pick; it never punts. Shared with friends via Cloudflare.

## Standing user rules

- Push only when the user says "push" or types /release. Cloudflare is the only deploy; the Netlify site was deleted (2026-10-20).
- Using the user's computer is allowed without asking each time until withdrawn (2026-10-18). The user starts PC runs.
- Report test results in **prize equity**: `python3 prize_equity.py <arm>:<baseline> ...` (60/30/5 prizes, title-equivalents
  per 100 seasons). Older items quote title equity (`equity.py`).
- Engine, backtest and page rules (Model pick on `MODEL_CFG`, backtest before changing it, weights never affect Win,
  tooltips, defaults) live in `.claude/rules/` and load when those files are opened.

## Current state

- **Live:** Cloudflare Worker `courtside-basketball` deploys every push to main; serves the board, the League Dashboard and
  `/api/fantrax`. The old Netlify site (courtside-draft.netlify.app) is deleted.
- **Board artifact:** claude.ai/artifact/YK93XaPAdsvaxwQadmvUNz (last noted v144; read it before republishing).
  Publish `courtside-draft-board.html`, **never `app.html`**.
- **Math doc:** claude.ai/code/artifact/2d4059a8-f9ad-465d-bfa7-41ef6990e7a8 (rev 159). The board links to `math.html`:
  export the doc tab as HTML, then `python3 build_math.py <export.html> <katex folder>`.
- **Works:** board, Fantrax live sync (backoff + Worker cache), saved drafts/leagues (rename, import/export), League
  Dashboard, ADP/draft collector (GitHub Actions every 6 h).
- **In-season tools + Settings tab (ideas 95-109), released 2026-10-21:** Matchup and Trade Analyzers (`inseason.html`) and the Settings tab
  (shared league store `league_store.js`). Specs/plans in `docs/superpowers/`; ledger with every ruling in
  `.superpowers/sdd/2026-10-20-matchup-and-trade-analyzer/progress.md` (git-ignored). `Engine.pairMatchup` is the only engine change
  (additions only, pinned by `engine_golden.test.js`). ESPN actuals refresh hourly in game windows (#111, merged 2026-10-21; two manual runs from GitHub succeeded, no data yet because ESPN has no 2026-27 stats until games are played). Decisions in force: Win M = vs this week's opponent in the Matchup Analyzer,
  vs remaining regular-season matchups (periods 1-15) in the Trade Analyzer (projected playoffs later, #101); chances use gVar 1.87
  and shrink toward 0.5 (k 0.72 matchup, 0.82 categories); players without projections use ESPN actuals or a waiver-level line.

## Current model (backtested in the user's format with real projections)

- **Zscore** = Σ z_c·W_c vs an average drafted player, scaled by team-total SD from ADP draft sims (ROTO-Adjusted). Zscore
  type Standard / H2H-Adjusted are display only (#63). Weights affect Zscore only, never Win.
- **Win C / Win M:** Φ-based category / matchup win chances, fitted weekly variances, shared weekly-games factor.
- **Model pick (on the clock):** logistic value-to-fit, fit share 1/(1+e^(−2(i−1.5))) by your pick index i (value 95 / 73 /
  27 / 5% at picks 1-4). Value = 50/50 standardized soft −1 Zscore (unweighted, TO ×1, worst category at half) + Win C; fit =
  Win M + two-pick look-ahead over the top 4 by Win M and top 4 by value (#55, #32). Off the clock: Likely pick = Win M ×
  availability.
- **No punting:** Punt always Off; manual punt = ×0 weight (Zscore only).
- **Availability:** adpSd v2 = √((0.42·ADP^0.68)² + (0.05·ADP)²); room's value side = Standard Z with TO ×0.5 (`fieldZ 'std'`,
  #69). Draft field Easy / Average / Strong / Very strong = f 0.08 / 0.31 / 0.46 / 0.62.
- **Games:** Season basis for the Model pick; IL fill 0.47 / 0.70 / 0.79 / 0.81 for 1-4 spots; GPW 3.42, VAR_GAMES 0.82.
- **Scarcity:** concentration + depletion index, information only (#83, #90).

## Defaults (DEF in `src/app.html`, basisV 12)

- League: 14 teams, slot 1, 3RR, roster 12, H2H each category, 9-cat, All-Star merged, playoffs week 18, 2-2-2, Draft field
  Easy, IL 3, lineup PG SG G SF PF F C C U U.
- List: Zscore type Standard, Zscore Normal, Stats Raw, Playoff boost Off, Basis Per game, Projections Average, # order and
  Edge vs Zscore, weights ×1 with TO ×0.5.

## Architecture

- Single self-contained HTML page (vanilla JS) built from a template plus a pure-JS engine; Node for engine and backtests,
  Python for data prep, Playwright for UI checks. Build and test commands are in `CLAUDE.md`; data pipeline in `src/README.md`.
- `src/engine.js` (the engine), `src/app.html` (board template), `src/league.html` + `src/league_core.js` (League Dashboard),
  `src/shared.js` (name matching, projection blend, toolbar), `gen.py` / `build_site.py` (build), `worker/index.js` (Worker),
  `src/collect/` + `.github/workflows/collect-drafts.yml` (collector).
- Data: `players.json` (234 players, BBM + Hashtag `hs` + Fantrax `ftx`), `sched.json`, `logs3.csv` / `logs_early.csv`,
  `bt_proj.json` (real preseason projections 2022-26).
- **Backtests:** `bt_real.js` with arms; baseline arm 23. World: seasons 2022-26, real projections and ADP, 14 teams, 3RR,
  each category, 3 IL, field Average; opponents 2 kit users, 2 punters, 4 sharp, 5 ADP; seeds 145-160 (161-176 used by run 35; fresh from 177) × slots
  1/4/7/10/14. PC runs: the user double-clicks a .bat in `C:\Users\Fefe\Documents\courtside-backtest`.
- League facts (user's): Fantrax, 14 teams, 4 adds/week, no games cap, 10 active + 2 bench, 3 IL.

## Open items (details in IDEAS.md)

1. **4b** Measure the league-consensus vs Fantrax ADP gap on a live 2026 draft (same-day ADP snapshots).
2. **45b** Fit the Draft field level f on the 2026 LOFB draft.
3. **77b** Why Standard-Zscore drafting is the weakest strategy.
4. **48b** Title backtest with each projection source.
5. **15a** Read opponents' punts from their rosters. **15c** Rookie upside (rookies not in the backtest pool).
6. Parked: **62** in-season projection model (future tool), **33** stronger test punters, **15b** joint pick + strategy.
7. Workflow: break cues now keyed to Messages in `/context` (115K break, 265K stop) in CLAUDE.md, the status line
   (`CTX_BASELINE`) and Claude-Workflow (2026-10-20, not pushed). Still open: idea #93 (move
   backtest result files into `src/results/`).
8. User side: on the PC run `cd ~/Documents/FantasyBBall; git restore netlify.toml; git pull`; edit or delete the stale
   claude.ai Project instructions.

9. **To add to `Sanctumx/Claude-Workflow`** (user rule: workflow changes are generalized; not done yet, needs the user's "push"):
   (a) `template/GUIDELINES.md` and the `template/CLAUDE.md` "user's working rules": keep running plan tasks back to back unless
   something needs the user's input; once a task has taken the conversation past the context limit (Messages past ~115K in
   `/context`, hard stop ~265K), finish that task, record it (ledger, handoff) and don't autorun the next; tell the user to
   `/handoff` and `/clear` (user, 2026-10-20). (b) The same as a feedback memory for the shared skills/templates, if they carry memories.
   (c) The 2026-10-20 break-cue change keyed to Messages in `/context` (item 7) is also still unpushed there. (d) Windows notes for
   the template's hook: its quoted test glob fails on Windows (pass the directory or expand the glob in node), and bash heredocs with
   apostrophes break in the Bash tool (use the Write tool for scripts).
10. In-season tools: at release, republish `courtside-draft-board.html` to the board artifact (engine.js changed) and trigger the
   `collect-stats` workflow once by hand (`workflow_dispatch`; ESPN may block runner IPs, tested only from the PC). Open: #98 tune
   perceived-value weights, #101 projected playoffs, #102 multi-week plan, #103 week-to-date actuals; refit the shrink k with in-season data.
11. Environment (this PC): `python3` is not installed, use `python`. (The after-edit hook's Windows glob problem is fixed, 2026-10-21.)
12. **Rankings tab (idea 110), plan `docs/superpowers/plans/2026-10-21-rankings-tab.md` (user rulings D1-D5 in it).** Stage 1 (collector #113) is on main (PR #20). Stage 2 is BUILT on branch `rankings-page` (4 commits, NOT pushed): `src/rankings_core.js`, `src/rankings.html` (Source: Season to date / Projections; Zscore type, Basis, Stats, Hide taken, owners incl. IR), toolbar entry, `rankings.html` at the repo root, deny rule added. D1 as ruled by the user: Zscore is calculated on the top teams x roster players by H2H-adjusted value within the source (see archive 110b). Also built (2026-10-21): Playoff games column (boost control hidden, Win ignores it), position filter, Find, Show, Zscore -1/-2, punt weights (pool stays on default weights), Win C / Win M through `Engine.evaluate` like the Draft tab (`Rankings.winStart`; Win vs Replacement / Average player; saved team in Settings = its rosters fill the slots, weakest player's slot open, own players one run each), How it works text done. Still to do: stage 3 windows (needs box-score days: `stats/box-2026-10.json`), reviewer, PR on "push" (engine unchanged; `shared.js` toolbar and CSS changed, so rebuild all pages).
13. **League Dashboard "Projected" fix (#112):** user's spec: per game = team's average value, per week = week totals, per season = season totals (details in IDEAS 112). Small-to-medium task, `league_core.js` computeLeague + `league.html` profile; do before or after Rankings.
14. This PC now has the GitHub CLI installed and logged in as Sanctumx (`gh` at `C:\Program Files\GitHub CLI`, add to PATH in the Bash tool): `gh pr create/merge` and `gh workflow run <id>` work; the workflow name lookup needs the id (`gh workflow list`).

15. **After Rankings (user, 2026-10-21):** #114 projected weekly stats dashboard in the Matchup Analyzer; #115 Matchup Analyzer combines known game stats (current matchup status) with projections (needs #113 box-score data / #103). Also #116: dropdown capping team slots the waiver add plan uses.

## Next session starts with

Branch `rankings-page` holds Rankings stage 2 (item 12), committed through `ownersOf`; the page, toolbar, build files, tests and docs are the last commit. Next: ship stage 2 (reviewer, PR on "push") after the How it works text; then stage 3 windows once `stats/box-*.json` has several days (task 9 `windowSource`, task 10 wiring), and the How it works text. Queued after Rankings: #114, #115, #116 (item 15). Left open: traded player's games come from his preseason team; likelihood bias is a guess (#98); Win M ignores results so far (#103); IR on the League tab (#109).
Browser checks: Playwright (`npm i playwright@1.48.2` + `npx playwright install chromium` in a scratch folder, or an earlier session's scratchpad `pw/`, e.g. under `AppData/Local/Temp/claude/c--Users-Fefe-Documents-FantasyBBall/*/scratchpad/pw`); copy `src/tests/browser/*.mjs` there, `REPO=<repo root> node X.mjs`, repo root served on :8765 (`python -m http.server 8765`).
Build on this PC: `cd src && python gen.py && python build_site.py && cp site/{index,league,inseason,settings}.html ..` (CLAUDE.md has python3). Bash heredocs with apostrophes break: use the Write tool for files.
Standing rule (user, 2026-10-20): keep running plan tasks unless something needs the user; once past the context limit (Messages > ~115K), finish the task, record it and stop; don't autorun the next one.
