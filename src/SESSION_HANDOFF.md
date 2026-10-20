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
- **Built, not pushed:** In-season tools (In-Season page: Weekly Matchup Analyzer, waiver plan, Trade Analyzer; ideas 95-103)
  on branch `matchup-trade-analyzers`. Spec `docs/superpowers/specs/2026-10-20-matchup-and-trade-analyzer-design.md`, plan
  `docs/superpowers/plans/2026-10-20-matchup-and-trade-analyzer.md`; Tasks 1-13 steps 1-4 done (modules `inseason_league.js`,
  `inseason_players.js`, `matchup_core.js`, `trade_core.js`, page `inseason.html`; `Engine.pairMatchup` is the only engine change,
  additions only, pinned by `engine_golden.test.js`). Ledger with every ruling: `.superpowers/sdd/2026-10-20-matchup-and-trade-analyzer/progress.md`
  (git-ignored). Decisions in force: Win M = vs this week's opponent in the Matchup Analyzer, vs remaining regular-season
  matchups (periods 1-15) in the Trade Analyzer (projected playoffs later, #101); chances use gVar 1.87 and shrink toward 0.5
  (k 0.72 matchup, 0.82 categories, from the calibration: default gVar was overconfident, slope 0.56); players without projections
  use ESPN actuals or a waiver-level line.

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
11. Environment (this PC): `python3` is not installed, use `python`; the after-edit hook's quoted glob
    (`src/tests/*.test.js`) fails on Windows with a false "unit tests FAIL"; the real check is `node --test src/tests/`
    (idea: fix the hook to pass the directory).

## Next session starts with

In-season tools are built on `matchup-trade-analyzers` and reviewed (Opus, 2026-10-20). Fixed test-first: same-name free agents
no longer take a rostered player's projection; the page flags stale rosters (Worker header `x-courtside-age`); plan moves sort by
day; Win M labelled "whole week projected, results so far not counted" (real fix is #103); `findTrades` cached; golden fixture
now uses a frozen `golden_players.json`; clearer message when Fantrax lists later regular-season weeks without opponents.
Left open from the review: a traded player's games still come from his preseason team in `players.json` (matters after the
trade deadline). Last-season ESPN stats stay as is (no current-season stats exist yet; the banner says "last season").
Next: wait for the user's "push" to open the PR and merge. Browser checks need Playwright (not installed in the repo;
`npm i playwright@1.48.2` and `npx playwright install chromium` in a scratch folder; run `src/tests/browser/*.mjs` with
`REPO=<repo root>`, repo root served by `python -m http.server 8765`; league_page.mjs and league_how.mjs still carry a
`/root/FantasyBBall/` path to fix on Windows).
Standing rule (user, 2026-10-20): keep running plan tasks unless something needs the user; once past the context limit
(Messages > ~115K), finish the task, record it and stop; don't autorun the next one.
