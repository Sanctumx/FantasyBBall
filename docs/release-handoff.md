# Release and handoff details

Read by /release and /handoff, and before working in a cloud session. Kept out of CLAUDE.md so it isn't sent
with every request.

## Release and handoff specifics (read by /release and /handoff)

- **Files:** `src/SESSION_HANDOFF.md`, `src/IDEAS.md`, `src/HANDOFF_ARCHIVE.md` (new write-ups at the top of "Entries
  after 2026-10-18").
- **Results metric:** prize equity (`python3 src/prize_equity.py <arm>:<baseline> ...`).
- **Mirror the handoff:** none. The repo copy is the only one (the claude.ai Project copy was dropped, 2026-10-20).
- **Handoff also tracks:** board artifact version (claude.ai/artifact/YK93XaPAdsvaxwQadmvUNz), math doc revision,
  deployment notes.
- **Build check** (only if `src/engine.js`, `src/app.html` or `src/league.html` changed since the last push): the build
  command above, the unit tests, a Playwright smoke test with no page errors, then publish
  `src/courtside-draft-board.html` to the board artifact if it isn't current. Never publish `app.html`.
- **Hashed script files:** the build writes `assets/<name>.<hash>.js` at the repo root; commit the whole `assets/` folder
  with the pages (the build command deletes and recopies it, so old hashes disappear). After a deploy, check with
  `curl -I <site>/assets/<file>` (immutable) and `curl -I <site>/team.html` (must not be immutable).
- **Deploy:** merging to main deploys the Cloudflare Worker `courtside-basketball`, the only host (the Netlify site
  was deleted, 2026-10-20).
- **Never during /release or /handoff:** use the user's computer.

## In Claude Code cloud sessions

- `gh pr …` commands fail (GraphQL is blocked). Use the REST API:
  - open: `gh api repos/Sanctumx/FantasyBBall/pulls -f title=… -f head=<branch> -f base=main -F body=@pr.md`
  - merge: `gh api -X PUT repos/Sanctumx/FantasyBBall/pulls/<n>/merge -f merge_method=merge`
- Remote branches can't be deleted from the session; GitHub deletes a PR's branch when it merges ("Automatically
  delete head branches" is on). Don't try to delete them.
