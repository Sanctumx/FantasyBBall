# avg-standin

State (2026-11-02): branch off main after PR #73 (team-list-owner). Not pushed.

Done: Team tab "Win M vs Average" scored my own players about 1.2 Win M points above comparable outsiders (analyst, 14 fixture teams as "me", Season: +1.22 ± 0.10; Mix +1.48; Per game +1.36). Cause: `avgOwn` replaced X with an average-line player at X's own slot games, `avgCandidate` took out an average player at total / Active spots (10) while the Team tab has 12-15 counted players (bench counts as Active), so every outsider was charged for a stand-in with 20-50% too many games. Concavity was not it (+0.03). Availability also barely counted for own rows.

Fix (user definition, 2026-11-02), `avgParts` / `avgOwn` in src/team_win.js: on the Team tab one stand-in for every row, the real average player of my team: games = total (games played x play %) / the counted players who play (Season, Mix); / all counted players (Per game, where plain "who plays" collapses to total / Active spots); a plain ctx (Rankings, Trade Analyzer) keeps total / Active spots, untested. `ap.common` marks the Team tab; a dropped IL player still gets 0 games. A candidate keeps his own games. Analyst numbers for this rule: Season gap +0.06 ± 0.05, own rows +0.08, outsiders +1.96; Mix -0.24 (without the nightly share factor, which would count the cap twice).

Tests: three new in src/tests/team/team_win.test.js (stand-in games, own row = team minus team with the common stand-in, own vs same player as outsider mean gap < 0.5); two old tests that locked the slot-games own rule updated. Pages rebuilt.

Not checked: fixture has every team playing every other day, so schedule differences are untested; compare the list on the user's league after deploy. The half-availability check rests on 5 own players.

Known: `trade_weeks.test.js` "about 2 ms per trade" fails under load in the full run, passes alone.

Next:
1. User checks the Player list (Vs average) on their league: Maxey/White/Young vs Barnes/Tatum/Mitchell should be level.
2. Ledger row (next number 173, Open -> Measured) and archive write-up in the ledger worktree (`node .claude/scripts/ledger.mjs setup | next | land`).
3. Push and merge only on the user's word.
