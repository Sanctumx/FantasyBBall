# Courtside Draft Board

Live snake draft board for 9-cat and 8-cat fantasy basketball, on BBM 2026-27 projections and Fantrax ADP, with live Fantrax draft sync.

## What's in here

- `index.html` – the whole board (projections included).
- `netlify/functions/fantrax.mjs` – a small function that reads your league's draft from Fantrax. The board can't call Fantrax directly from the browser, so it goes through this.
- `netlify.toml` – tells Netlify where the page and the function are.

## Put it online (GitHub + Netlify, about 5 minutes)

1. Create a free GitHub repository (for example `courtside-draft-board`) and upload these files, keeping the folder structure (`netlify/functions/fantrax.mjs` must stay in that folder).
2. Sign in to Netlify (free), choose **Add new site → Import an existing project → GitHub**, and pick the repository.
3. Leave the build settings as Netlify fills them in from `netlify.toml` (no build command, publish directory `.`) and press **Deploy**.
4. Optional: under **Site configuration → Change site name**, pick something like `courtside-draft`, giving you `https://courtside-draft.netlify.app`.

Any later change pushed to the repository goes live on its own.

Note: Netlify's drag-and-drop deploy publishes the page but not the function, so sync won't work that way. Use the GitHub import above, or the Netlify CLI (`npm i -g netlify-cli`, then `netlify deploy --prod` in this folder).

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
