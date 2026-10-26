---
paths:
  - "src/app.html"
  - "src/league.html"
  - "src/shared.js"
  - "src/league_core.js"
  - "src/settings.html"
  - "src/league_store.js"
  - "src/inseason.html"
  - "src/inseason_league.js"
  - "src/inseason_players.js"
  - "src/matchup_core.js"
  - "src/trade_core.js"
  - "src/team.html"
  - "src/team_view.js"
  - "src/gen.py"
  - "src/build_site.py"
  - "worker/**"
---

# Board, League Dashboard and Worker rules

- Edit the templates in `src/`, never the built `index.html`, `league.html`, `inseason.html`, `settings.html` or `math.html` (they are blocked from
  reading and editing). Rebuild with the build command in `CLAUDE.md`.
- Publish `src/courtside-draft-board.html` to the board artifact, never `app.html`.
- Hover tooltips: one short line. Longer explanations go in How it works, and every tab's How it works is specific to that
  tab (user, 2026-10-25). The Team tab has its own dialog in `team.html`; the Draft tab's lives in `app.html` and `gen.py` still
  copies it into the League Dashboard and In-Season pages until those get their own.
- Defaults go in `DEF` (league defaults in `LeagueStore.LEAGUE_DEF`) only and apply on a first visit; `migrate()` never changes a saved setting (IDEAS #79).
- Browser checks live in `src/tests/browser/` (Playwright, repo root served on port 8765).
