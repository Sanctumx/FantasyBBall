# Ideas ledger — Courtside Draft Kit

One line per idea, feature, measurement or rule: tried, shipped, rejected or still open. **Search it** (don't read it whole)
before proposing or testing an idea. The full write-up of item N is in `src/HANDOFF_ARCHIVE.md` (search `^N\.`).

**Statuses:** Open (not tried) · Testing (in progress) · Adopted (in the board or the backtests now) · Rejected (tried, didn't
help) · Superseded (adopted once, later replaced) · Measured (a fact we measured; no setting to change) · Parked (worth
returning to; reason given).

**Results:** PE = prize equity, TE = title equity (older metric), both in title-equivalents per 100 seasons, ± SE; "titles" =
title % points. Tests before item 50 ran in the old backtest world (prior-season stats, synthetic ADP), which real projections
overturned; re-test old-world results before relying on them.

**Rules:** edit a row in place when its status changes; never delete a row; one line per row; put the deciding numbers in
Result. New ideas take the next number (next: **104**).

| # | Date | Area | Idea | Status | Result |
|---|------|------|------|--------|--------|
| 103 | 2026-10-20 | In-season | Week-to-date actuals in the Weekly Matchup Analyzer (daily stat snapshots) | Open | not started |
| 102 | 2026-10-20 | In-season | Multi-week waiver add plan (today: current week only) | Open | plan structure keeps `periods` for it |
| 101 | 2026-10-20 | In-season | Projected playoffs in the Trade Analyzer Win M (today: remaining regular season only) | Open | user plan; design leaves room |
| 100 | 2026-10-20 | In-season | Daily ESPN actual-stats collector (`src/collect/espn_stats.mjs`, `stats/espn.json`) | Adopted | built; needs `seasontype=2`; ESPN returns 2025-26 until 2026-27 games exist (guard refuses to overwrite); first GitHub runner run pending (trigger `collect-stats` by hand after the merge; ESPN may block runner IPs) |
| 99 | 2026-10-20 | In-season | `Engine.pairMatchup`: win chances for two rosters with known games (additive; draft engine pinned by a golden test) | Adopted | golden test pinned the draft engine (unchanged); consistency vs draft engine within 0.05 per category / 0.03 match (gVar 1.87); calibration on 2025-26 and 2024-25 weeks (20 seeds, 45,500 pair-weeks each): default gVar overconfident (matchup slope 0.56 / 0.57, Brier tied with the draft engine), gVar 1.87 best (Brier -0.0038 / -0.0077 vs draft engine, slope 0.72); shipped caller-side with gVar 1.87 and shrink toward 0.5 (k 0.72 matchup, 0.82 categories; passes the bar except one thin bin); k fit on preseason projections, refit with in-season data |
| 98 | 2026-10-20 | In-season | Trade perceived-value weights (40% current / 30% projection / 30% ADP) and likelihood scale | Open | fixed guesses; tune against real accepted trades |
| 97 | 2026-10-20 | In-season | Trade Analyzer: one-for-one finder, Sell High / Buy Low lists, Trade Builder | Adopted | one-for-one finder, Sell High / Buy Low, Trade Builder; Win M over remaining regular-season matchups (periods 1-15 here) |
| 96 | 2026-10-20 | In-season | Waiver add plan for the current week (4 adds/week) | Adopted | greedy plan, 4 adds, current week only; fixture league plans in about 0.2 s; win chance 61.2% to 67.6% for the fixture team |
| 95 | 2026-10-20 | In-season | Weekly Matchup Analyzer + Simple adds (Win M vs this week opponent) on a new In-Season page | Adopted | In-Season page, Matchup tab; Win M vs this week opponent from real games; 84 unit tests and the Playwright check pass; branch `matchup-trade-analyzers`, not pushed |
| 94 | 2026-10-20 | Infra | Netlify removed: site deleted, `netlify.toml` and the Netlify function removed | Adopted | user rule; Cloudflare only |
| 93 | 2026-10-20 | Infra | Move backtest result files (`bt_*_*.json`, ~225) from `src/` to `src/results/` | Open | needs `bt_real.js` output path, `prize_equity.py` / summary globs and the PC run folder updated together |
| 92 | 2026-10-18 | UI | League Dashboard polish, favicon in `<head>`, saved-draft import/export | Adopted | |
| 91 | 2026-10-18 | UI | League page renamed League Dashboard; How it works on both pages | Adopted | |
| 90 | 2026-10-18 | Model | Light category-scarcity boost, confirmation of 87 | Rejected | PE +0.1 ± 0.7 over 640 drafts; scarcity stays info only |
| 89 | 2026-10-18 | UI | League page full width; matrix and team stats side by side | Adopted | |
| 88 | 2026-10-18 | UI | League page sortable columns, one-decimal %, Total / Per game | Adopted | |
| 87 | 2026-10-18 | Model | New scarcity index (83) as a Win boost, Light / Medium | Rejected | Light +0.4 ± 1.3 (then 90); Medium PE −4.0 ± 1.4 |
| 86 | 2026-10-18 | UI | League page: team focus, matchup matrix, team stats | Adopted | spec and plan in `docs/superpowers/` |
| 85 | 2026-10-18 | UI | MPG shown to at most 2 decimals | Adopted | |
| 84 | 2026-10-18 | Data | Fantrax name aliases and duplicate cleanup (`findListed`, `absorbExtras`) | Adopted | |
| 83 | 2026-10-18 | Display | Category scarcity redefined: concentration + depletion (info only) | Adopted | depletion-only, replacement baseline, eps 0.25 tried and dropped |
| 82 | 2026-10-18 | Infra | Fantrax sync auto-retry with backoff; Worker serves last good answer | Adopted | |
| 81 | 2026-10-18 | UI | Lineup slot settings and position coverage, read from Fantrax (display only) | Adopted | Model pick ignores slots (80) |
| 80 | 2026-10-18 | Model | Lineup slots re-checked on the current board | Measured | 0.14-0.27% of games lost; slots don't bind |
| 79 | 2026-10-18 | Rule | Updates never change saved settings; DEF only on a first visit | Adopted | user rule |
| 78 | 2026-10-18 | UI | Rename saved leagues and saved drafts | Adopted | |
| 77b | 2026-10-18 | Test | Why Standard-Zscore drafting is the weakest strategy | Open | not yet checked |
| 77 | 2026-10-18 | Test | League of drafting strategies (run 33) | Measured | PE: Model pick 14.8, H2H-Adj Z 13.0, ADP 11.7, Standard Z 8.1 (fair 11.9) |
| 76 | 2026-10-18 | Model | Draft field guessed wrong (Easy vs Average) | Measured | +0.3 ± 1.1 / −0.6 ± 0.7, neither costs; Easy stays default |
| 75 | 2026-10-18 | Rule | Model pick always on tested settings (`MODEL_CFG`: Season, Average, boost Off) | Adopted | user rule |
| 74 | 2026-10-18 | Defaults | Defaults from the user's screenshots (Standard Z, Per game, Easy, slot 1) | Adopted | display only since 75 |
| 73 | 2026-10-18 | Model | Value blend 30/70 and 20/80 Zscore / Win C | Rejected | −0.1 ± 0.6 / −0.4 ± 0.5 over 320; 50/50 settled |
| 72 | 2026-10-18 | Docs | Math doc rev 146 (prize equity, Zscore types); KaTeX CSS and fonts inlined | Adopted | |
| 71 | 2026-10-18 | Test | Standard-Zscore room; Basis 2×2 split | Measured | field model ranking like the room +1.2 ± 0.7; Mix loss mostly on the fit side |
| 70 | 2026-10-18 | Model | Fit = Win C or 50/50, blend 70/30, missW 0.75, Mix basis | Rejected | PE −1.3 / 0.0 / −0.6 / −3.5 / −2.7 |
| 69 | 2026-10-18 | Model | There at / Lasts to from the room's Standard Z with TO ×0.5 (`fieldZ 'std'`) | Adopted | not backtested (backtest field ranks by team-spread Z) |
| 68 | 2026-10-18 | Model | TO ×0 / ×0.5 in the early-pick value side | Rejected | PE −2.0 ± 0.9 / −1.4 ± 0.7; value side keeps TO ×1 |
| 67 | 2026-10-18 | Model | Pure H2H-adjusted Zscore as the value side (no Win C) | Rejected | PE −1.9 to −3.2 |
| 66 | 2026-10-18 | UI | B2B rest dropdown removed (forced off) | Adopted | |
| 65 | 2026-10-18 | Model | H2H-adjusted Zscore + Win C as the value side | Rejected | TE −1.0 ± 0.6 / −1.4 ± 0.7 |
| 64 | 2026-10-18 | Model | True (Standard) Zscore in the value side | Rejected | TE −1.5 ± 0.5 with Win C, −1.0 ± 0.5 alone |
| 63 | 2026-10-18 | Display | Zscore type dropdown: Standard / ROTO-Adjusted / H2H-Adjusted | Adopted | display only; Model pick identical under all three |
| 62 | 2026-10-17 | Future | In-season projection model (core of a future in-season tool) | Parked | on hold; a cheap first test is described in the archive |
| 61e | 2026-10-17 | Data | Draft field absolute level (`field_abs.py`) | Measured | f 0.28 (2022), 0.07 (2024): rooms sit between Easy and Average |
| 61d | 2026-10-17 | Model | Loose draft field / wider assumed spread | Rejected | Easy +0.4 ± 0.6, spread ×1.5 +0.1 ± 0.2 |
| 61c | 2026-10-17 | Model | IL stashes of known-injured players | Rejected | TE −0.8 ± 0.3 (last 3 picks), −4.2 ± 0.8 (all) |
| 61b | 2026-10-17 | Model | 2-week playoff matchup noise | Rejected | TE −0.7 ± 0.7 (×0.5), −0.3 ± 0.5 (×0.75) |
| 61a | 2026-10-17 | Model | Projections blended toward ADP | Rejected | TE +0.2 ± 0.7 (w 0.25), −1.7 ± 0.7 (w 0.4) |
| 60 | 2026-10-17 | Model | Young-player upside bonus | Rejected | young − veterans −0.17 ± 0.30; rookies untested |
| 59 | 2026-10-17 | UI | Strategy punt line removed; Playoff boost Off by default | Adopted | Off vs Light +0.9 ± 0.5 |
| 58 | 2026-10-17 | UI | Punt dropdown removed (always Off); tooltips one short line | Adopted | |
| 57 | 2026-10-17 | Model | Opportunistic punt (lock weakest category from pick 6) | Rejected | TE +0.14 ± 0.11 over 320, changes 17 drafts |
| 56 | 2026-10-17 | Model | Punt Auto re-tested on the k=2 board | Rejected | TE −4.5 ± 0.8; with τ schedule −4.3 |
| 55 | 2026-10-17 | Model | Logistic value-to-fit drop, k=2, value = soft −1 Z + Win C | Adopted | TE +1.4 ± 0.4 (board v137); the current Model pick |
| 54 | 2026-10-17 | Model | Value at first 2 picks / fast slide t^0.25 | Rejected | titles −0.3 each; replaced by 55 |
| 53 | 2026-10-17 | Model | Settings re-check on real projections (Mix, boost, field, IL 0.60, look-ahead 8) | Rejected | first-half gains were noise on confirmation; all kept |
| 52 | 2026-10-17 | Model | No slide (Win M + look-ahead) + Punt Off, four real seasons | Superseded | shipped v136, replaced by 55; Punt Off stays |
| 51 | 2026-10-17 | Rule | Ask before every use of the user's computer | Superseded | 2026-10-18: allowed until withdrawn (CLAUDE.md) |
| 50 | 2026-10-17 | Test | Real projections + user's league format (`bt_real.js`) | Adopted | the backtest world since; showed the slide board below average |
| 49 | 2026-10-17 | Rule | Netlify only on request; basketball icon | Adopted | user rule |
| 48b | 2026-10-17 | Test | Title backtest with each projection source | Open | partly covered by 50 |
| 48 | 2026-10-17 | Data | Projection accuracy: BBM vs Hashtag vs Average | Adopted | Average best or tied (rank corr 0.542); default Average |
| 47 | 2026-10-17 | UI | Projections dropdown (BBM / Hashtag / Average) | Adopted | |
| 46b | 2026-10-17 | Model | TO ×0.5 inside soft −1 | Rejected | titles −0.6 ± 2.2, made −3.8 ± 1.6 |
| 46a | 2026-10-17 | Model | Soft −1 ignores category weights | Adopted | identical at all ×1 |
| 45b | 2026-10-17 | Data | Fit Draft field f on the 2026 LOFB draft vs same-day ADP | Open | needs that draft's data |
| 45 | 2026-10-17 | Model | Draft field (Easy … Very strong) replaces Kit users | Adopted | no distinct drafter types in LOFB |
| 44 | 2026-10-17 | Defaults | 3 IL spots by default | Adopted | |
| 43 | 2026-10-17 | Model | Special handling for H2H each category | Rejected | no model change needed (40 drafts) |
| 42 | 2026-10-17 | Defaults | Stats Raw, Playoff boost Light, Basis Season | Superseded | boost Off since 59; Per game display since 74 |
| 41 | 2026-10-17 | Defaults | League defaults = the user's league | Adopted | |
| 40 | 2026-10-17 | UI | Model pick dropdown removed; Zscore Normal; TO ×0.5 display default | Adopted | |
| 39 | 2026-10-17 | Model | √t value-to-fit slide shipped (v109) | Superseded | replaced by 52, then 55 |
| 38 | 2026-10-17 | Infra | Cloudflare hosting (Worker `courtside-basketball`) | Adopted | Netlify only on `[netlify]` |
| 37 | 2026-10-17 | Model | Slide shapes and Auto-weighted value | Rejected | √t and soft −1 blend kept (old world) |
| 36 | 2026-10-17 | Model | Slides vs the board on fresh seeds | Superseded | led to 39 (old world) |
| 35 | 2026-10-17 | Model | Value-to-fit slide: value measures and shapes | Superseded | by 55 |
| 34 | 2026-10-17 | Model | Early rounds by Win C or Zscore | Superseded | led to the slide work (35) |
| 33 | 2026-10-17 | Model | Stronger test punters; Giannis drafters punt FT | Parked | tabled by the user; moot while the board never punts |
| 32 | 2026-10-17 | Model | Two-pick look-ahead shipped (`lookAhead2`, K 4) | Adopted | the fit side of the Model pick |
| 31f | 2026-10-17 | Test | Prize structures (100/0/0 … 40/30/10) | Measured | change no decision |
| 31e | 2026-10-17 | Model | Playoff boost Off vs Medium confirmation | Superseded | boost Off since 59 |
| 31d | 2026-10-17 | Model | Two-pick look-ahead tested | Adopted | pooled matchup +2.2 ± 0.5, made +5.5 ± 1.5 → 32 |
| 31c | 2026-10-17 | Model | Credit players returning from injury (`knownW`) | Rejected | inconsistent (titles −3.1 / +2.5) |
| 31b | 2026-10-17 | Model | Late-round upside bonus | Rejected | λ 0.25 titles −5.9 ± 2.5 |
| 31a | 2026-10-17 | Model | Auto pair menu top 24 | Superseded | punting off since 52 |
| 30 | 2026-10-17 | Test | Realistic league opponents (kit users, punters, sharp, ADP) | Adopted | backtest opponents since |
| 29 | 2026-10-17 | Data | Do real drafters punt? | Measured | ~7% punt one category (mostly FT%), about 1 per league |
| 28 | 2026-10-17 | Model | Season basis; GPW 3.42, VAR_GAMES 0.82 | Adopted | Model pick uses Season (75) |
| 27 | 2026-10-17 | Data | Weekly games constants fitted | Adopted | applied in 28 |
| 26b | 2026-10-17 | Model | Convex injury discount (`riskK`) | Rejected | k 2 titles −1.6 ± 3.4; k 8 collapses |
| 26a | 2026-10-17 | Test | Title scoring (weeks 1-17, top 8, playoff rounds) | Adopted | Season vs Mix titles +6.9 ± 3.2 |
| 25 | 2026-10-17 | Model | Season basis confirmed; playoff availability measured | Adopted | Season + IL 0.70 +0.94 ± 0.37 (320) |
| 24 | 2026-10-17 | Model | Injury risk double-discounted on the live board | Superseded | → 25, 28 |
| 23 | 2026-10-17 | Docs | Math doc rewritten (rev 62) | Adopted | |
| 22 | 2026-10-17 | Model | Position wait cost (position scarcity) | Rejected | λ 2 −1.16 ± 0.47, harm grows with λ |
| 21 | 2026-10-17 | Model | Do lineup slots bind? | Measured | 0.1-0.3% of games lost; no position-scarcity model |
| 20 | 2026-10-17 | Model | Opponents' picks tilted to their needs | Rejected | measured: real drafters follow consensus, not needs |
| 19 | 2026-10-17 | UI | Safe until / Gone by removed; Rank range → Pick range | Adopted | |
| 18 | 2026-10-17 | Model | IL fill share vs overlapping injuries; `IL_FILL` curve | Adopted | 0.47 / 0.70 / 0.79 / 0.81 for 1-4 spots |
| 17 | 2026-10-17 | Model | Auto pair menu top 20 | Superseded | 24, then punting off |
| 16 | 2026-10-17 | Model | Weekly adds setting × missed-games weighting | Rejected | Mix best at every add level (old world) |
| 15g | 2026-10-16 | Model | Two-pick joint look-ahead (backlog) | Adopted | done as 32 |
| 15f | 2026-10-16 | Data | Fit games per week and VAR_GAMES (backlog) | Adopted | done as 27 |
| 15e | 2026-10-16 | Test | Backtest Scarcity and Playoff boost strengths (backlog) | Measured | done in 6, 30, 53, 87, 90 |
| 15d | 2026-10-16 | Model | Lineup-slot / position-aware values (backlog) | Rejected | done as 21, 22, 80 |
| 15c | 2026-10-16 | Model | Rookie upside (backlog) | Open | rookies aren't in the backtest pool |
| 15b | 2026-10-16 | Model | Joint pick + strategy valuation (backlog) | Parked | moot while the board never punts |
| 15a | 2026-10-16 | Model | Read opponents' punts from their rosters (backlog) | Open | |
| 14 | 2026-10-16 | Model | Agreed model work list (survival, upside, streamability, needs) | Superseded | all tested: 5, 6, 20, 31b, 60 |
| 13c | 2026-10-17 | Model | Punt τ/β refinement | Superseded | punting off |
| 13b | 2026-10-17 | Model | Missed-games dial (`missW`) | Rejected | every lighter share worse than Mix (old world) |
| 13 | 2026-10-17 | Model | Auto menu C confirmation | Rejected | −0.25 ± 0.19 |
| 12 | 2026-10-17 | UI | Gain → Win naming, How it works rewrite, horizontal scroll bar | Adopted | |
| 11 | 2026-10-16 | Model | Punt Auto τ 0.01 | Superseded | punting off |
| 10 | 2026-10-16 | Test | Backtest speed-up (`cfg.fast`) | Adopted | identical rosters 72/72, 0.72 s/draft |
| 9 | 2026-10-16 | Model | Punt Auto menus | Rejected | current Auto kept, later punting off |
| 8 | 2026-10-16 | Model | Model pick fallback fix | Superseded | Model pick replaced since |
| 7 | 2026-10-16 | Model | Punt retest with correlated categories | Rejected | nothing beat Auto; later punting off |
| 6c | 2026-10-16 | Model | Position scarcity (`scarP`) | Rejected | never backtested, off; see 21, 22 |
| 6b | 2026-10-16 | Model | Streamability (Weekly adds) in win chances | Rejected | −2.1 ± 0.9 at 4 adds; retry only crediting out-streaming opponents |
| 6a | 2026-10-16 | Model | Category scarcity weighting (`scarZ`) | Rejected | vstrong −5.3 ± 1.2; scarcity info only |
| 5 | 2026-10-16 | Model | Playoff boost × roster survival | Rejected | survival vs uniform −0.6 ± 0.8; boost now Off |
| 4b | 2026-10-16 | Data | League consensus vs Fantrax ADP gap (the assumed 5% term) | Open | measure on a live 2026 draft with same-day ADP snapshots |
| 4 | 2026-10-16 | Data | ADP spread from real drafts (`adpSd` v2) and the draft collector | Adopted | fitted on 50 LOFB drafts |
| 3 | 2026-10-16 | Infra | Netlify deploys from main | Superseded | Cloudflare (38) |
| 2 | 2026-10-16 | Test | Weekly-adds backtest | Superseded | done as 16 |
| 1 | 2026-10-16 | Infra | Work from `src/` in the GitHub repo | Adopted | |
