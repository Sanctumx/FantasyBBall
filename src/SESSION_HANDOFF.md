# 🔄 SESSION HANDOFF MATRIX — Courtside Draft Kit (Fantasy BBall)

## 🎯 1. High-Level Objective
*   **Current Project Scope:** A live snake-draft board for 9-cat/8-cat fantasy basketball (modeled on draftdesk-beta.netlify.app/snake), built on BBM 2026-27 projections + Fantrax ADP. It ranks players by Zscore, Gain C, Gain M (matchup win-chance gain), availability (There at / Lasts to), Edge, and a Model pick. It has punt-aware strategy logic, Fantrax live sync, and saved drafts/leagues. It's shared with friends via Netlify.
*   **Next Active Milestone:** Decide on and (if confirmed) run the **Weekly adds backtest**: re-run the realistic-league backtest at 0 adds and unlimited adds. If the best games weighting shifts (0 adds → Season-ish, unlimited → Per-game-ish), add a League Settings "Weekly adds" field that sets the games weighting automatically (replacing the Basis guess and working alongside IL fill). If it doesn't shift, don't add the setting.

## 🛠️ 2. Architecture & Technical State
*   **Tech Stack / Tools:** A single self-contained HTML page (vanilla JS, no framework) built from a template plus a pure-JS engine. A Netlify site with a serverless proxy for Fantrax. Node for the engine and backtests, Python for data prep, Playwright for UI tests.
*   **Files (scratchpad of the previous session; only in that container):**
    *   `engine.js`: the engine (`prepPlayers`, `buildContext`, `evaluate`, `strategiesFor`, `teamAt`, `Phi`, …).
    *   `app.html`: the page template with placeholders `/*__DATA__*/`, `/*__SCHED__*/`, `/*__ENGINE__*/`.
    *   `gen.py`: builds `courtside-draft-board.html` from the template, players.json, sched.json and engine.js.
    *   `build_site.py`: wraps the page into `site/index.html` (full doc with meta charset/viewport).
    *   `site/`: `index.html`, `netlify.toml`, `README.md`, and `netlify/functions/fantrax.mjs` (proxy at `/api/fantrax?what=draft|league|players&leagueId=`).
    *   **Data:**
        *   `players.json`: 234 players with BBM fields plus `ftx` (Fantrax ADP) and `b2b` (back-to-back rest rate).
        *   `sched.json`: `{weeks[25], games{TEAM:[25]}, b2b{TEAM:[25]}}` built from the user's nba-2026-UTC.csv. Week = CSV Round Number; UTC−6h gives the local date.
        *   `logs3.csv`: player game logs for 2023-26, converted from the user's Hugging Face parquet files.
    *   **Backtest:**
        *   `backtest.js`: `draft(season, slot, seed, cfgExtra, opp{n, gamma, model})` and the old `score()`.
        *   `stream_sim.js`: `scoreLeague()` for realistic scoring (daily 10 active of 12, 2 IL, 4 adds/wk streaming).
        *   `bt_data.json` / `bt_daily.json`: prior-season stats used as projections, a synthetic noisy ADP, and weekly/daily actuals for the 2024-25 and 2025-26 tests.
*   **Deployment:**
    *   Artifact: claude.ai/artifact/YK93XaPAdsvaxwQadmvUNz (v92, latest).
    *   GitHub: `Sanctumx/FantasyBBall`, main. The last push was a8c70da, the default-settings commit. **Everything since is unpushed.**
    *   Netlify: courtside-draft.netlify.app auto-deploys from main. The user was told to "Make public" in Netlify's share panel.
*   **Math doc:** claude.ai/code/artifact/2d4059a8-f9ad-465d-bfa7-41ef6990e7a8 (sections 1–10 plus Fitted variances).
*   **Active Decisions Made (all backtested; numbers are matchup-win-rate points vs the old board):**
    *   **Zscore** = Σ z_c·W_c, where z_c = (x − avg drafted)/team-total SD from 80 ADP draft sims. Category weights affect **Zscore only**, never Gain; scarcity ranks use the unweighted boardRaw.
    *   **Gain C / Gain M** use a Φ-based win chance. H2H noise uses per-game variances **fitted on 2023-26 logs**:
        *   counting stats: 3PM 1.154m, REB 1.336m, AST 1.251m, STL 1.066m, BLK 1.109m, TO 1.022m;
        *   PTS 5.38·m^0.78;
        *   FG binomial ×0.932, FT binomial ×1.115.
    *   **Correlated categories (on):**
        *   Shared weekly games factor: SIGMA_G2 = 1.87 per player, 5-point Gauss-Hermite over the games gap.
        *   Calibration improved (Brier 0.2354 → 0.2314); picks barely changed (+0.1).
        *   Cost: about 0.3 s per pick in Auto.
    *   **Punt strategies:** 130 in 9-cat (no punt, 9 singles, 36 doubles, 84 triples), all lockable.
        *   **Auto** blends only no punt, the singles and the **top 8 synergy pairs** (correlation of category z among draftable players) by softmax(V/τ).
        *   Settings: β = 1.5 (tilt), τ = 0.005, top-K = 8 Gain passes.
        *   Result: Auto ≈ +5.5 vs Punt Off. Using all 130 in Auto hurt; triples didn't help; re-locking the best strategy every pick hurt.
    *   **Model pick** always uses **Gain M** × chance he's there, plus a one-pick look-ahead, regardless of "# order by". The # column ranks by "# order by".
    *   **Board users setting:** opponents who draft with the board are modeled with a blended expected slot: (1−f)·ADP + f·(pick + value rank). With all 13 opponents on the board, Auto went from −2.8 to +9.8.
    *   **B2B rest:**
        *   Player-list setting, On by default.
        *   Playoff games are reduced by rest rate × team back-to-backs in the playoff weeks.
        *   Clicking the Playoff games cell cycles a per-player override: sits / plays / data.
        *   Kawhi measured at 23%, not "never".
    *   **IL spots:** League Settings, default 2. Missed games are filled at the replacement level at a share of 0.35 × IL, capped at 0.9. Mix + IL fill gained +2.3 under realistic scoring.
    *   **Basis default Mix.** Season was −17 under realistic scoring and Per game −1.6.
    *   **Streamer-baseline idea** (rep = streaming spot): changed no picks, so it isn't exposed as a setting (the engine supports `weeklyAdds`).
*   **Defaults (DEF in app.html):**
    *   League: 14 teams, slot 7, snake, roster 12, H2H most categories, 9-cat, ASB merged, playoffs start week 18, format 1-2-2.
    *   Player list: zdrop −1, stats Gain, poBoost medium, scarcity Cat vstrong / Pos light, # order by Gain M, Edge vs Gain M, basis mix.
    *   New features: puntMode auto, oppBoard 0, b2b on, ilSpots 2.
*   **League facts (user's):** 4 adds/week, no games cap, 10 active + 2 bench, 2 IL spots, Fantrax.

## 🛑 3. Hard Constraints & Anti-Patterns ("Dos & Don'ts")
*   **Always Do:**
    *   **Never push to GitHub unless the user explicitly says so**, and don't ask after each change whether to push. The user will say when.
    *   Build flow: edit `engine.js` / `app.html`, run `python3 gen.py && python3 build_site.py`, run a Playwright smoke test, then publish the artifact from `courtside-draft-board.html`. **Never publish app.html (the template) itself** (that once created a stray artifact).
    *   Backtest model changes before making them default. Use paired comparisons on the same drafts, report ± SE, the split by season, and "% of drafts worse", and be honest when results are noise.
    *   Keep hover tooltips short; put long explanations in "How the board works".
    *   Keep the UI style: bold headers, chips and pills with green/amber/red, centered columns (player name left), and the phone layout (player column pinned first).
    *   Reply to artifact comments in the comment thread, then resolve it.
*   **Never Do / Avoid:**
    *   Don't let category weights affect Gain.
    *   Don't let Auto blend all 130 strategies.
    *   Don't add settings that backtests show do nothing (as with weekly adds today).
    *   Don't use per-league fetches from the artifact; the artifact has no external network, and Fantrax works only via the Netlify proxy.
    *   Don't state "facts" the data contradicts. Check the logs first (for example Kawhi on back-to-backs).

## 📋 4. Next Session Action Items
1.  [ ] **Immediate Priority:** Recover the source files. They live only in the old session's container.
    *   With permission: push to GitHub, or save engine.js, app.html, gen.py, build_site.py, players.json, sched.json and the backtest scripts to the claude.ai Project.
    *   Otherwise: rebuild from the latest artifact (v92 contains the full engine and data inline).
2.  [ ] **Secondary Goal:** Run the weekly-adds backtest (0 vs 4 vs unlimited adds) to decide whether a Weekly adds setting should auto-set the games weighting.
3.  [ ] **Open Question:** Does the user want GitHub/Netlify updated now? Everything since commit a8c70da is unpushed: punt strategies, synergy Auto, Model pick = Gain M, Board users, B2B rest, IL spots, correlation, fitted variances, mobile layout, centered columns, header rename.
4.  [ ] **Backlog ideas (not started):**
    *   Lineup-slot/position-aware values.
    *   Read opponents' punts from their rosters.
    *   Joint pick + strategy valuation.
    *   Backtest the Scarcity and Playoff boost strengths.
    *   Fit games-per-week (3.45) and VAR_GAMES from the schedule.
    *   Two-pick joint look-ahead.
    *   Late-round upside.
    *   Hover on Strategy pills showing per-category win chances (engine already returns `catP`).
    *   Test Fantrax sync on a real league.

## 📥 5. Cold Bootstrap Prompt (Copy & Paste Into New Chat)
> *Instructions for Next Chat:* "Hello Claude! We are picking up from a prior session on the Courtside Draft Kit (Fantasy BBall project). Please ingest the following context as your baseline ground-truth system instruction. Do not deviate from the constraints or architecture decisions outlined in Sections 2 & 3. In particular, never push to GitHub unless I say so. Our first immediate action item is **recovering the board's source (engine.js, app.html, data) from the latest published artifact claude.ai/artifact/YK93XaPAdsvaxwQadmvUNz into a working build setup, then running the weekly-adds backtest (0 vs 4 vs unlimited adds) to decide whether to add a Weekly adds league setting**."
