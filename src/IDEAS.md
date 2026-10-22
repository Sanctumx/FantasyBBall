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
Result. New ideas take the next number (next: **135**).

| # | Date | Area | Idea | Status | Result |
|---|------|------|------|--------|--------|
| 108 | 2026-10-20 | UI | Settings tab: league settings and the Fantrax league set once in a shared store; every tab reads it; per-tab team pickers; League Dashboard on current rosters; Import draft from league on Draft | Adopted, released 2026-10-21 (all 10 tasks; 109 unit tests and 9 browser checks pass; Draft output identical to the pre-change baseline; reviewer's 2 must-fix and 3 should-fix done) | design `docs/superpowers/specs/2026-10-20-settings-tab-design.md` |
| 111 | 2026-10-21 | In-season | ESPN stats refreshed hourly in game windows (UTC 17:00-07:59 at :07, plus the daily run); written only when the numbers changed | Adopted | built on `stats-hourly`, unpushed; live check: two runs against ESPN both "unchanged" (no spurious diff); first live night pending; extends #100 |
| 110 | 2026-10-21 | UI | Rankings tab like basketballmonster.com/playerrankings.aspx, in our layout: Stats dropdown instead of multiple views; Zscore type, Playoff boost, etc. as on the board; Basis (Per game / Season / Mix); Source dropdown: actuals (season to date, last week, last 2 weeks, last month) or Projections (Average / BBM / Hashtag); Hide taken button using the Settings league's rosters (owner shown per row); no min-games hiding (use Projections for that) | Building | stage 2 built 2026-10-21 on `rankings-page` (unpushed): `rankings.html` on Season to date + Projections, owners, Hide taken; Zscore is calculated on the top teams x roster players by H2H value within each source (user ruling, replaces the ADP/roster pool). Added 2026-10-21: Playoff games column (boost built, then hidden by the user), columns reordered, position filter, Find, Show, Zscore -1/-2, punt weights, Win C / Win M via Engine.evaluate (Win vs Replacement / Average player; league mode: weakest player's slot open, own players one run each). Windows built (Last week / 2 weeks / month from box scores, 110d), review fixes done; left: PR on push |
| 134 | 2026-10-21 | UI | Tab order: Rankings to the left of Draft, new Team tab between Rankings and Draft (user request) | Done (order) | Rankings now left of Draft (branch tab-order-compact); the Team tab between them waits for #131 |
| 133 | 2026-10-21 | UI | Hover tooltips on every page redone with the Draft tab as the model (user request) | Open | part of the tab overhaul |
| 132 | 2026-10-21 | UI | Tabs UI/UX: compact but filling the space (user request) | Done | tabs are equal-width, tighter, and the nav fills the header row (branch tab-order-compact; not checked in a browser) |
| 131 | 2026-10-21 | UI | Team tab: all my players with projected/real stats, team totals (averages), Win C / Win M, swap a player to see new stats, matchup / category matrix; plus a collapsible How it works panel on every tab covering every control, column and number (user request) | Open | brainstorming started 2026-10-22 (decisions in archive 131); needs the written design and a plan; big feature |
| 130 | 2026-10-21 | UI | Rankings tab like the Draft player list: MPG column (Team and Pos were already there), Order by (Zscore / Win C / Win M, sets what # means), my players highlighted (user request) | Adopted | branch rankings-draft-list, commit b90f322, not pushed; no backtest (display only); tests pass |
| 129 | 2026-10-21 | In-season | Review fixes for 122-128: saved extras carry `base` so old saves survive the players.json growth; simpleAdds guard when all players kept; scoreWeek box condition | Adopted | merged in PR #24; new tests for the 234-base save and the all-kept case |
| 128 | 2026-10-21 | UI | Matchup period dates were one day late at the end (Fantrax ends a period at 18:59:59 ET the day after its last day): week labels and the Team schedule days follow Fantrax (`periodLast`, `periodDays`) | Adopted | user report with Fantrax screenshot; unit test first; week 1 = Oct 20 - Oct 25, week 2 = Oct 26 - Nov 1 |
| 127 | 2026-10-21 | In-season | Waiver adds / plan Win M scored from the week's box scores like the Matchup headline (known stats + games left); a player added mid-week carries no box lines | Adopted | `matchup_core.js` statusCore shared by weekStatus and scoreWeek; unit test: every add row's base (match - dMatch) and plan.start equal the headline (was .60 vs .86 with a strong box); no backtest; 190 unit tests, browser checks pass |
| 126 | 2026-10-21 | Data | Hashtag-only players (Hashtag rank <= 300, 68 of the 166 unmatched, e.g. Jared McCain) added to players.json with their Hashtag line (`src:'hs'`, rk 235+, ftx from the newest Fantrax snapshot); waiver-level tail excludes them | Adopted | cut-off 300 by the user; Model pick check (3 slots x rounds 1-4): one change, slot 1 round 3 Derrick White -> Trey Murphy; pool pFG .4862->.4859, G0 69.0->69.3; no backtest (backtests don't read players.json); Keldon Johnson, Mikel Brown, Aday Mara now have projections (tests updated) |
| 125 | 2026-10-21 | In-season | Keep list replaces the add-ignore list (#123): × beside the drop name protects a player on my team from being offered as a drop in best adds and the plan; per league, saved | Adopted | committed; unit test first (kept players never dropped); browser check rewritten and passing |
| 124 | 2026-10-21 | Data | Hashtag projections refreshed from the 2026-10-21 export (`data/hashtag_2026-10-21.xlsx`, `hashtag.py`) | Adopted | 8 of 234 players changed (e.g. Nembhard ast 6.4→5.0, Rollins ast 4.9→5.8); 107 new rows not in the pool; no backtest; uncommitted |
| 123 | 2026-10-21 | In-season | (replaced by #125) Ignore list for waiver adds (× on a row, restore from the Ignored line; per league, also applied to the add plan) | Superseded | replaced by the keep list #125 |
| 122 | 2026-10-21 | In-season | Waiver adds module: plan and best adds in one panel as tall as the Matchup panel, adds fill it (up to 40); best adds pair each add with the 5 lowest-value drops (top 20 adds tried against the other drops); Team schedule module (roster by day, active-limit flags) | Adopted | uncommitted; no backtest; team-switch time 16 ms |
| 121 | 2026-10-21 | In-season | Crowded-night lineup picks the Win M-maximizing players | Open | tabled by the user; per-game value (idea 120) used meanwhile |
| 120 | 2026-10-21 | In-season | Games are whole scheduled games with per-game lines; Trade Analyzer whole games in the current week, g/82 later; crowded nights by per-game value; pairTeam reads per-game variance directly | Adopted | branch `matchup-week-status`, unpushed; no backtest (engine refactor pinned, outputs unchanged); calib_pair says whole games are worse than g/82 for weeks with unknown availability (Matchup Brier PM-whole .2360/.2423 vs g/82 .2338/.2359), hence g/82 kept for future weeks; refit k for future weeks open |
| 119 | 2026-10-21 | In-season | Matchup games left as whole scheduled games per player; players with no minutes in their team's last 3 games counted out; shrink refit | Adopted | calib_pair (20 seeds, 2025-26 / 2024-25): whole games alone worse than fractional (matchup Brier .2367/.2427 vs .2324/.2357, slope .61/.51); with the recent-play filter Brier .1925/.1996 (filter helps most because test rosters hold long-injured players) and ideal k .83 matchup, .85 cats. Trade Analyzer unchanged. Branch `matchup-week-status` |
| 118 | 2026-10-21 | In-season | Win M on remaining games given the so-far score (user ruled D1) + Matchup week status (#103/#114/#115 partly): known box totals, remaining games, variance scaled by games left, shrink easing to 1 | Adopted | branch `matchup-week-status`, unpushed; no backtest by user decision (beating whole-week is certain); unit tests + browser check; Best adds/plan still score the whole week; archive 118b |
| 117 | 2026-10-21 | UI | Remember results by their inputs and prewarm likely next choices in idle time (Matchup, Rankings, League) | Adopted | branch `perf-cache`, unpushed; week switch 78 -> 2 ms, League basis 67 -> 8 ms; display only; archive 117 |
| 116 | 2026-10-21 | In-season | Dropdown in the Matchup Analyzer to cap how many team slots the waiver add plan may use (today: the whole week's add allowance, 4 adds/week) | Adopted | May drop dropdown (All, Worst 1-5; saved per league; keep list excluded first); addPlan ranks candidates only against allowed drops; no model change, no backtest |
| 115 | 2026-10-21 | In-season | Matchup Analyzer combines known game stats (current matchup status, from the ESPN actuals / box-score collector) with projections for the rest of the week | Open | user request; same data as #103 (week-to-date actuals) and #113 (box scores); do after Rankings and #114; planned 2026-10-21 (archive 118): one feature, display only, waits on user rulings D1-D3 |
| 114 | 2026-10-21 | In-season | Projected weekly stats dashboard in the Matchup Analyzer (both teams' projected week totals per category) | Open | user request; do after the Rankings tab; planned 2026-10-21 (archive 118): one feature, display only, waits on user rulings D1-D3 |
| 112 | 2026-10-21 | In-season | League Dashboard Team profile "Projected" column is wrong: Per game sums every rostered player's per-game line (12 players incl. bench, none play together); Season's per-week divides season totals by poStart−1 (17) instead of the schedule's weeks and ignores the active-slot cap. User's spec: per game = the team's AVERAGE value (first fix summed 10 players; corrected 2026-10-21 to the mean of the active players), per week = week totals, per season = season totals | Adopted | `league_core.js` lines 62-73, `league.html` fmtStat/profile (line 263); win chances and ranks do not use these numbers |
| 113 | 2026-10-21 | In-season | Box-score collector: after each final game, save every player's line (ESPN `summary?event=ID` boxscore, ~29 players/game, MIN PTS FG 3PT FT REB AST TO STL BLK; ids match espn.json) into monthly files for last-week/2-weeks/month Rankings | Adopted | merged 2026-10-21 (PR #20); live run saved 3 opening-night games; 17 live 2025-26 games saved, second run wrote nothing; about 1.7 MB per season; only competition type STD counts (Cup final and All-Star are season type 2 too, play-in is type 5) |
| 109 | 2026-10-20 | UI | League Dashboard counts IR players (some teams would have 15); tabled, IR left out for now | Open | from #108 |
| 107 | 2026-10-20 | In-season | Trade Builder Zscore: column per player (Average, Total rows) and tiles for each team's change and Zscore received; dropdowns Zscore type (Normal / H2H-Adjusted / ROTO-Adjusted) and Basis (Per game / Season / Mix) | Adopted | board Zscore from `Engine.buildContext` (default league, Average projections), `InPlayers.zscoreOf`; players without a projection show a dash; the two teams' changes always cancel, so no Total Zscore tile |
| 106 | 2026-10-20 | In-season | Matchup Analyzer and Trade Analyzer as their own toolbar entries (`inseason.html#matchup` / `#trades`); trade search saved in the browser | Adopted | no recalculation on reload (signature of rosters, team, period, day, weights); about 10 s on the first search of the day |
| 105 | 2026-10-20 | In-season | Trade likelihood bias -0.75 in the logistic (a fair-looking swap is not a coin flip) | Adopted | fixture league: best-value 25 offers 11-33%, median 21% (was up to 78%); a guess, not fitted (see 98) |
| 104 | 2026-10-20 | In-season | Trade finder: Any of my players, text-box filters (likelihood, +Win M you / them), every one-for-one listed (no floor), about 25 rows then a scrollbar, Buy Low column removed | Adopted | blank +Win M you means no limit; the saved candidates hold every pair (2145 trades for 4 of my players on the fixture) |
| 103 | 2026-10-20 | In-season | Week-to-date actuals in the Weekly Matchup Analyzer (daily stat snapshots) | Open | not started; planned 2026-10-21 (archive 118): one feature, display only, waits on user rulings D1-D3 |
| 102 | 2026-10-20 | In-season | Multi-week waiver add plan (today: current week only) | Open | plan structure keeps `periods` for it |
| 101 | 2026-10-20 | In-season | Projected playoffs in the Trade Analyzer Win M (today: remaining regular season only) | Open | user plan; design leaves room |
| 100 | 2026-10-20 | In-season | Daily ESPN actual-stats collector (`src/collect/espn_stats.mjs`, `stats/espn.json`) | Adopted | built; needs `seasontype=2`; ESPN returns 2025-26 until 2026-27 games exist (guard refuses to overwrite); first GitHub runner run pending (trigger `collect-stats` by hand after the merge; ESPN may block runner IPs) |
| 99 | 2026-10-20 | In-season | `Engine.pairMatchup`: win chances for two rosters with known games (additive; draft engine pinned by a golden test) | Adopted | golden test pinned the draft engine (unchanged); consistency vs draft engine within 0.05 per category / 0.03 match (gVar 1.87); calibration on 2025-26 and 2024-25 weeks (20 seeds, 45,500 pair-weeks each): default gVar overconfident (matchup slope 0.56 / 0.57, Brier tied with the draft engine), gVar 1.87 best (Brier -0.0038 / -0.0077 vs draft engine, slope 0.72); shipped caller-side with gVar 1.87 and shrink toward 0.5 (k 0.72 matchup, 0.82 categories; passes the bar except one thin bin); k fit on preseason projections, refit with in-season data |
| 98 | 2026-10-20 | In-season | Trade perceived-value weights (40% current / 30% projection / 30% ADP) and likelihood scale | Open | fixed guesses (likelihood bias added in 105); tune against real accepted trades |
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
