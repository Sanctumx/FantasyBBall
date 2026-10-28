# Branch trade-team-rules (#151/#152)

## State
Built, tested (446 unit tests, `inseason_page.mjs` all pass), reviewed (Opus high, no must-fix), pages rebuilt. Two commits on the
branch (51afd48 feature, 8b98101 review fixes). Not pushed, no PR.
- `src/team_win.js`: `tabView(ctx, basis)` (cached shallow copy, `teamTab:true`, basis 'total'); `tradeState` = `Team.tabState` (IR stays IR,
  rest Active); `leagueWin` keeps `engCtx`/`lwMemos` on the original ctx and scores `side(tabView, ...)`; memo key has the basis;
  `opts.basis` overrides.
- `src/trade_core.js`: `TRADE_W.winM` 0.07 -> 0.065 (old dB on new dB through the origin: slope 0.922, R2 0.785, N 2145); `optKey` has basis.
- `courtside-inseason.html`: `CAND_VER` v4 (saved trade candidates rebuilt).
- Fixture my Win M 0.5032 -> 0.5319; golden changed only in `team.leagueWin`, `leagueWinSwap`, `rosWinM`.
- `trade_finder.test.js` "any": diversity now checked on the unlimited list (top 40 are all my IR player).

## Decisions
Always Season basis; keep `perceived`'s worst-line fill; refit winM (user-approved plan, archive "151. Plan").

## Next
1. On the user's word: push branch, PR, merge (Use a merge commit).
2. Follow-up (IDEAS 153): `perceived()` still credits an IR player with roughly his healthy value, so the finder ranks "dump my IR player"
   first with likelihood 0.5-0.7 though the opponent's own dB is -1.7 to -3.1. Give IR the availability rule in `perceived()` or weight dB more.
3. #150 (fit k for the Team-tab rules) needs a PC run: ask the user before staging it.

## Hazards for others
`TeamWin.leagueWin` default is now the Season Team-tab rules; Team tab ctxs with another basis get a Season copy unless `opts.basis` is passed.
