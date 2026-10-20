---
paths:
  - "src/app.html"
  - "src/league.html"
  - "src/shared.js"
  - "src/league_core.js"
  - "src/inseason.html"
  - "src/inseason_league.js"
  - "src/inseason_players.js"
  - "src/matchup_core.js"
  - "src/trade_core.js"
  - "src/gen.py"
  - "src/build_site.py"
  - "worker/**"
---

# Board, League Dashboard and Worker rules

- Edit the templates in `src/`, never the built `index.html`, `league.html`, `inseason.html` or `math.html` (they are blocked from
  reading and editing). Rebuild with the build command in `CLAUDE.md`.
- Publish `src/courtside-draft-board.html` to the board artifact, never `app.html`.
- Hover tooltips: one short line. Longer explanations go in How it works, whose only copy lives in `app.html`
  (`gen.py` copies it into the League Dashboard).
- Defaults go in `DEF` only and apply on a first visit; `migrate()` never changes a saved setting (IDEAS #79).
- Browser checks live in `src/tests/browser/` (Playwright, repo root served on port 8765).
