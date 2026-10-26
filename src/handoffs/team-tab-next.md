# team-tab-next (Team tab #131 follow-ups, step 3; planned, no code yet)

Branch `team-tab-next`, worktree `C:/Users/Fefe/Documents/FantasyBBall-tabnext`, created 2026-10-26 from `team-d3-swap` (not main), because step 3 edits the same Team tab code. **PR #45** (`team-d3-swap`: D3 trades, Source switch, Rankings D2, review fixes; 417 unit tests; pushed on the user's word, not yet merged) must merge first; then `git fetch && git rebase origin/main` here (the d3 commits drop out) and rebuild. The `FantasyBBall-d3` worktree is removed; the branch is on origin.

## Done on the earlier steps

1 (D3 swap) and 2 (Rankings D2) are in PR #45. Browser checks pass except the known `rankings_page` 302 vs 303.

## Step 3: user requests (2026-10-26) and the planner's plan

User: (a) the Per game / Rest of season toggle (`#view`) should "also affect player values the same way it does for ranking/draft/trade-analyzer"; (b) auto-fill the top 12 into Active, ranked by **Win M**; (c) "neither eligible, top 12 players are already going into your active team, play% for players in reserve and IL should show 0%".

Planner's plan (Opus, 2026-10-26), tests first in each step:
1. `team_view.js` `sourceCtx(args, src, rows, fx, basis)`: 'pergame' copies the pool with every player's g = G0 (mean g of rostered players with g > 0), so `gamesLeft`, Plays % and `TeamWin.engCtx` follow; 'total' stays as today. View 'game' -> 'pergame', 'ros' -> 'total'.
2. `team.html`: `ctxs` keyed `src|basis`, `#view` handler calls `srcCtx(); render()`, `mkZ` uses the basis (it hardcodes `'pergame'` now) and adds it to `ck`; show the "uncalibrated" warning in Per game (the shrink k was fitted on Season-like forecasts; the analyst should check k on a per-game ctx).
3. `rankings.html` `d2For`: pass `ui.basis` to `TV.sourceCtx`, add it to `d2.key`, still no `shrink`; extend `rankings_team_parity.mjs` (Per game vs Per game, Season vs Rest of season).
4. `team_view.js` pure `autoFill(state, score, n)`: non-IL players by score, top n Active, rest Reserve, IL untouched, via `Team.moveSlot` so `moves` is kept.
5. Fill scorer ranks on a probe state with every non-IL player Active (a Reserve player's displayed Win M uses leftover games, so he could never be promoted); n = `ctx.L.maxPlayers || ctx.L.maxActive`; a "Fill Active" button makes one Changes entry that Undo restores.
6. IL rows show Plays % 0%; update How it works and `rost-note`.
The draft Model pick is not affected (no prize-equity backtest). Mix stays Rankings-only.

## Decisions (user, 2026-10-26, after the plan) — these replace the plan's steps 4-6 where they differ

1. Win C / Win M follow the toggle. 2. GL and Plays % follow it in Per game. 3. Only **Reserve** shows and counts 0% Plays % for the team; a player can still be moved into Active (respecting the max) and then counts again. 4. The "12" is `maxActive`. 5. Courtside "Active" = the league's active + bench; Reserve is only a parking place for preview/testing so a player does not count toward the team's games. So the model change IS wanted: Reserve players must not fill nights (today `Team.COUNTED` includes them via the reserve slot; check `team_core.js`, `TeamWin.side`, `oppState`). Auto-fill therefore ranks all non-IL players on a probe state and puts the top `maxActive` into Active, the rest into Reserve (0%). 6. IL does not show 0%: it uses **#149** (IL players count as healthy on the Team tab, as the Trade Analyzer already does), so #149 is part of this branch's work.
**Scope (user, 2026-10-26): Reserve exists only inside the Team tab.** "Reserve does not count" is a Team-tab-only rule; the Trade Analyzer, Rankings D2 and every other tab never have a Reserve slot and must not change. Keep it in the Team tab's state/ctx path (not in shared `TeamWin` behaviour that other tabs call), and check that Rankings D2 (which builds a Team-style state from the roster) gets no Reserve players.
Open for the next session: have the `explorer` find every use of the reserve slot / `COUNTED` / IL, then the planner re-plans step 4-6 and #149 (Hard area: TeamWin) within that scope.

## Superseded: six questions asked at the end of the 2026-10-26 session (answered above)

1. Should Win C / Win M follow the toggle (Rankings, Draft) or only Zscore (Trade Analyzer)? Planner: Win follows; the default view is Per game, so the Win numbers users see by default change and are uncalibrated.
2. In Per game, do GL and Plays % follow too? Planner: yes (injured players then look healthy).
3. "Neither eligible": (a) Reserve are candidates for Active, IL stays put (recommended), or (b) only Active players over the limit are trimmed to Reserve?
4. What are `maxPlayers` and `maxActive` in the user's league (the "12")?
5. "Reserve shows 0%" contradicts the model (Reserve fills nights Active leaves open); a display-only 0% would contradict the Win numbers. Do Reserve players score in the league? If not, that is a model change (COUNTED = active only) moving the Trade Analyzer and Rankings D2: own IDEAS row, own branch, analyst. Otherwise this branch ships only IL 0%.
6. IL 0% conflicts with #149 (IL counted as healthy, Open). Confirm 0% for now.

## Next

1. Explorer: every use of the reserve slot / `COUNTED` / IL in `team_core.js`, `team_win.js`, `team_view.js`, the Trade Analyzer and Rankings D2. Planner (effort high): re-plan steps 4-6 plus #149 from the Decisions section; show the plan, then build the plan test-first, rebuild with `node .claude/scripts/build.mjs`, run unit + browser (`team_page`, `inseason_page`, `rankings_page` [known 302 vs 303], `rankings_team_parity`), `reviewer` (effort high), PR on the user's word.

## Hazards

- A g change in only one of `segGames`, `gamesLeft` or `engCtx` gives believable but inconsistent Win numbers; step 1's tests must cover all three.
- No double shrink: `d2For` passes no `shrink`; the fill ranks already-shrunk Win M (order unchanged).
- Rebase after PR #45 merges; built pages and assets conflict: rebuild instead of resolving by hand.
- Ledger: no IDEAS row for this step yet; add through the ledger worktree (`node .claude/scripts/ledger.mjs next`).

## PC commands

- Browser check: copy `src/tests/browser/*.mjs` to the Playwright folder (`$TEMP/claude/c--Users-Fefe-Documents-FantasyBBall/17acf9ec-27b6-4489-8c20-2f1a7575e2cd/scratchpad/pw`), `REPO=<worktree> node X.mjs`, worktree served with `python -m http.server 8765 --directory <worktree>`; kill stale servers on 8765 first.
- Unit tests from outside the worktree: `node --test C:/Users/Fefe/Documents/FantasyBBall-tabnext/src/tests/*.test.js`.
