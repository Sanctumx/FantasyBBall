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
- **In progress:** In-season tools (Weekly Matchup Analyzer + Trade Analyzer, ideas 95-103) on branch
  `matchup-trade-analyzers` (not pushed). Spec `docs/superpowers/specs/2026-10-20-matchup-and-trade-analyzer-design.md`, plan
  `docs/superpowers/plans/2026-10-20-matchup-and-trade-analyzer.md` (13 tasks, executed inline). **Tasks 1-4 done**
  (Worker `rosters`/`standings` routes, `inseason_league.js` + `sched_days.json`, ESPN collector + `stats/espn.json`,
  `inseason_players.js`). **Task 5** (`Engine.pairMatchup`, hard area, additive only) has its golden test committed; its
  `engine_pairmatchup.test.js` and the function are next. Per-task ledger and every ruling:
  `.superpowers/sdd/2026-10-20-matchup-and-trade-analyzer/progress.md` (git-ignored; resume at the first task without a
  "complete" line). Decisions in force: Win M = vs this week's opponent only in the Matchup Analyzer, vs remaining regular-season
  matchups in the Trade Analyzer (projected playoffs later, #101); waiver adds = Simple (Win M vs opponent) + current-week plan;
  players without projections use ESPN actuals until the user adds projections to `players.json`; the user approved the Task 13
  workflow-config edits (CLAUDE.md build line, settings deny rule, pages.md paths, hook `testOn`).

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

9. In-season tools, after the merge, trigger the `collect-stats` workflow once by hand
   (`workflow_dispatch`); ESPN may block runner IPs (tested only from the PC). Republish `courtside-draft-board.html` to the board
   artifact at release (engine.js changes). Task 6 (calibration of `pairMatchup` vs 2025-26 weeks) gates the merge.
10. Environment (this PC): `python3` is not installed, use `python`; the after-edit hook's quoted glob
    (`src/tests/*.test.js`) fails on Windows with a false "unit tests FAIL"; the real check is `node --test src/tests/`
    (idea: fix the hook to pass the directory).

## Next session starts with

Resume the in-season tools plan: read this file and the ledger, then Task 5 of the plan: write
`src/tests/engine_pairmatchup.test.js` (RED; consistency test with gVar 1.87, pairs (0,5),(1,12),(6,7), tolerance 0.05 per
category / 0.03 match; `projErr:false` more extreme; zero-games entry; 8-cat), implement `Engine.pairMatchup` in `src/engine.js`
(additive only; check `git diff -U0 origin/main -- src/engine.js | grep -E '^-[^-]'` is empty), then Task 6, and so on.
