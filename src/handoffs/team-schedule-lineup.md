# team-schedule-lineup

State (2026-11-02): MERGED as PR #75 (deployed). Reviewer fixes made: out players keep their played games, earlier days dimmed. Ledger 122 update committed in the ledger worktree, not landed.

Done: the Team schedule grid (In-Season, Matchup tab) now shows who plays each night. `scheduleGrid` in src/matchup_core.js (pure, same rules as `segGames` / `statusCore`): on a night over the active limit the best per-game players (`nightValue`) start (solid dot), the rest bench (hollow dot, tooltip); past days count only players with minutes (box lines), a missed game is a red ×; IR players sort to the bottom with an IR label in every period (no games in the current week, counted like the projection in later weeks, user choice); out players as before. The Games column counts only start / played cells. The Playing row reads `10 (12)` when more than 10 players have a game that night. `renderSchedule` in src/inseason.html only draws it.

Tests: src/tests/team/matchup_schedule.test.js (5, incl. grid games = `weekStatus` games left); browser checks added to src/tests/browser/inseason_page.mjs (124 pass; port 8765 was taken by another server, ran on 8766). Pages rebuilt.

Known: `trade_weeks.test.js` "about 2 ms per trade" fails under load in the full run.

Not checked: real league data (late games across New York / local dates, today's column with a partly played night). The ledger row for idea 122 (UI change) is not written yet.

Next:
1. User checks the Team schedule on their league.
2. Land the ledger (`node .claude/scripts/ledger.mjs land`) on the user's word; delete local branch `team-schedule-lineup` (main checkout sits on it; main is in the FantasyBBall-auto worktree).
