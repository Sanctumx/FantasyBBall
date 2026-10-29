# fix-roster-rep

State (2026-10-29): branch `fix-roster-rep` from origin/main (after PR #59), worktree `C:/Users/Fefe/Documents/FantasyBBall-reprep`, one commit 3ef75a4, UNPUSHED, no reviewer pass. 513 unit tests pass.

Done: roster table "Win M vs replacement" showed the raw contribution (Maxey +10.8, the replacement Dunn +5.8). `TeamView.winJob` now rescores the rows through `TeamWin.moduleSetup/moduleRow` when `opts.baseline === 'rep'`, so the roster equals the player list and the replacement shows 0 (test in `team_view.test.js`). Also `.claude/scripts/serve-local.mjs [port]`: serves the repo and runs `worker/index.js` for `/api/fantrax`, so a league loads locally (the Settings message "Loading runs on the hosted site" no longer appears).

Open (user, 2026-10-29): player list "Vs average" does not look right; user expects it to loosely follow the Vs replacement list order. Measured on the user's league (Paragua, team TupperWare LLC b5idqb2rmv4hcbf3, league mm5i19xxmv4hcbcy, hashtag source, Rest of season, 369 candidates with g > 30): rank correlation avg vs rep 0.80; the top 8 agree (Jokic, Wemby, SGA, Maxey, Doncic, White, Barnes). Differences:
- Low-game scrubs score about -10 under avg but about 0 under rep (the made-up average player is elite for this team, +0.83 z per slot), so the avg tail is steep.
- Keegan Murray (IL, paired with Champagnie): avg -0.27 (rank 19) but rep -4.17 (rank 369) in `moduleScores`, while the roster shows rep +1.62. Check why the list's rep row for an IL pair member differs from the roster row (`moduleRow` own-counted branch vs `su.grp`).
- Stars below the team average (Harden -0.1, Durant -0.3, Giannis -0.6) are legit for a strong team but may be what looks wrong.
Ask the user what exactly looks wrong before changing `avgCandidate` / `avgOwn` (hard area, use the `planner`).

Open (user question, 2026-10-29): Champagnie shows Plays 0% while Murray (IL now) shows 96%. Reading of the code (unverified): on Rest of season an IL player is there for avail(g) of the games with no return date, so 13 players for 12 slots and the lowest nightValue (Champagnie) is cut; he should still play the ~4% of nights Murray is not there (check the unrounded value in ), and 96% for a player who is out now may be too high (where does his avail come from: g/82 only, or the current injury?).

Open (user, 2026-10-29): IL pair scoring is asymmetric. Murray (IL, 67 GL, better stats) roster Win M +1.6 vs Champagnie (69 GL, Plays 0%) +6.2; list Vs replacement gives Murray -4.17. Expected: two players sharing one slot with similar games score about the same, split by who plays when. Suspect: pw[k] for a pair member (team minus team without him) is not symmetric because removing Champagnie drops Active below maxActive so ilPairs turns off, while removing Murray leaves Champagnie playing. Fix in the design of the pair scoring (planner, hard area), not by patching numbers.

Not done: help text still says "worst counted player" / "the worst shows 0" (team.html 161,167,168,236,523; rankings.html 96,333); forced pair-as-replacement test; `team_page.mjs` fails at the drag-and-drop swap on main too (pre-existing).

Debug tools (not in the repo): `C:/Users/Fefe/Documents/pw-tools/diag*.mjs` load the real league through the local server and read ctx/state by injecting `window.__dbg` into team.html.

Next: 1. Settle the Vs average expectation with the user. 2. Reviewer on the branch diff. 3. On "push": push, PR.
