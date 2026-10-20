# Courtside Draft Board

Live snake draft board for 9-cat and 8-cat fantasy basketball, on BBM 2026-27 projections and Fantrax ADP, with live Fantrax draft sync.

## What's in here

- `index.html` – the whole board (projections included); `league.html` – the League Dashboard.
- `worker/index.js` – the Cloudflare Worker: serves the pages and relays Fantrax requests at `/api/fantrax`. The board
  can't call Fantrax directly from the browser, so it goes through this.
- `wrangler.jsonc` – the Worker's configuration. `src/` holds the engine, page templates, data and backtests.

## Where it runs

The Cloudflare Worker `courtside-basketball` is connected to this repository and deploys every push to `main` within a
couple of minutes. Netlify is no longer used: `netlify.toml` only tells it to skip every push.

## Using it with friends

Send them the site link. Each person:

1. Sets scoring and categories in **Setup**.
2. Pastes their Fantrax league ID (or the whole league URL) into **Fantrax sync** and presses **Connect**. Team count, rounds and draft order come from the league.
3. Chooses their team. Picks then appear every 10 seconds as they happen in the Fantrax draft room, traded picks included.

Each person's draft is saved in their own browser, so friends in the same league or different leagues don't affect each other.

## If sync doesn't connect

- "Fantrax doesn't know that league ID": check the ID against the league URL (the part after `/league/`).
- Private leagues: Fantrax's public draft feed may not share them. Ask the commissioner to make the league viewable, or log picks by hand.
- Before the draft starts, Fantrax may not list the draft order yet; connect again once the draft room opens.
