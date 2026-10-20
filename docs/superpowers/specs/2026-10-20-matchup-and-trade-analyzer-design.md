# Weekly Matchup Analyzer and Trade Analyzer — design

Date: 2026-10-20. Status: draft for the user's approval. Items marked **(my call)** are the writer's choices, not
the user's; everything else was said or confirmed by the user.

## Intent

The Courtside Draft Kit stops being useful once the draft is over. The user wants two in-season tools for their own
Fantrax league (14 teams, public league id `mm5i19xxmv4hcbcy`, 22 weekly periods, 10 active + 2 bench + 3 IL):

1. **Weekly Matchup Analyzer** — for a chosen week, project both teams' categories, turn them into per-category and
   overall matchup win chances, and recommend waiver adds.
2. **Trade Analyzer** — pick a player and find trades that help the user's team, ideally both teams, and judge likely
   acceptance by how managers actually value players.

Both use the existing Win C / Win M engine (Φ-based win chances, fitted weekly variances, shared weekly-games factor).

## Goals

- Weekly Matchup Analyzer shows, for the user's team vs this week's opponent: projected value per category for both
  teams, % chance to win each category, and the overall matchup win chance.
- Waiver adds are a **strategy** with two levels (user decision):
  - **Simple (always shown):** the best single adds from the available pool, ranked by how much each raises Win M
    against this week's opponent alone, a "WinM vs Team B vacuum". Not rest-of-season value.
  - **Better (waiver add plan):** a plan that uses the weekly transactions left (the league allows 4 adds per week),
    the schedule (each player's games per week) and the available free agents, deciding which adds to make and when.
    Details are left to the builder, but the plan must account for the adds remaining this week. **User decision:
    the plan covers only the current weekly matchup for now**; multi-week planning is a later extension, so keep the
    structure able to grow into it.
- Trade Analyzer, finder: pick one of your players; a ranked table of one-for-one trades with columns Target (team),
  Likelihood of trade, +Win M team A (you), +Win M team B (them), Total Win M, and a Buy Low tag (layout "A" chosen by
  the user). Win M is over the rest of the season.
- Below the table, a second section with two lists: **Sell High** (players on your team) and **Buy Low** (players on
  the other teams), each with possible trade targets.
- Trade Builder module: pick any players for both teams (Team A receives / Team B receives, several per side, type-ahead
  player pickers, Reset Trade), following the reference screenshot the user shared (per-player stat rows with
  green/red category cells, Average and Total rows, summary strip). Team A and Team B are **real teams from the
  league**, scored against their real rosters. The summary shows the finder's metrics: +Win M each team, total Win M,
  likelihood of trade.
- Likelihood of trade comes from perceived value: managers trade on some combination of current performance +
  projected performance + ADP (sunk-cost bias). Buy Low = perceived value below real value; Sell High = above.

## Non-goals

- Two-for-one (and larger) trades in the **finder**. They need waiver-usage modelling and other variables. The Trade
  Builder may take several players per side by hand; its Win M for those trades is flagged as not modelling the roster
  spot freed or filled **(my call on the flag)**.
- Rest-of-season value ranking of waiver adds, lineup setting, anything that writes to Fantrax. Which player to drop
  is shown as the assumption behind each add (see Settled), not as separate drop advice.
- Projected playoffs in Win M (planned later; record in the handoff).
- Changing the draft Model pick or anything it sees. These tools read the engine; they do not change it.
- Private-league support (login cookies).

## Anti-goals

- Tools that look authoritative but run on stale or mismatched data (wrong player matched, last season's stats shown as
  current). Data freshness and match failures must be visible on the page.
- Hard-wiring today's projections so that updating `players.json` later breaks or goes ignored.

## Data

| Need | Source | Notes |
| --- | --- | --- |
| All rosters, slot status (ACTIVE / RESERVE / INJURED_RESERVE) | Fantrax public `getTeamRosters` | Tested on the user's league: 14 teams, 12-15 players each. |
| Free agents | Fantrax `getLeagueInfo` `playerInfo` status FA / WW / T | Tested: about 1,290 players, 1,108 FA. User also accepts "players not rostered". |
| Weekly schedule (who plays whom) | `getLeagueInfo` `matchups`, 22 periods | Tested. Playoff structure in the response is unread. |
| Standings | Fantrax `getStandings` | Tested; 0-0-0 now. |
| Player id, name, team, position | Fantrax `getPlayerIds`; match to other sources by normalized name + team with a small manual override table | Existing repo practice. |
| Projections | Current `players.json` (BBM + Hashtag averaged, as the board uses). Future updates expected; see "Settled". | BBM and Hashtag are the user's paid subscriptions and not fetchable. |
| Actual stats | **ESPN public JSON** `site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete` (3 calls: category general / offensive / defensive; paginated), chosen by the user. Hashtag free page is the fallback. | Tested from the user's PC only; not yet from a GitHub Actions runner. Default call returns last season; `season=2027` is the untested way to get 2026-27. No last-N-days filter. |
| Games per week | `sched.json` (exists for the board) | Not yet used by the League Dashboard. |

Season started 2026-10-20, so real 2026-27 stats are empty. **For development and tests, use last season's (2025-26)
ESPN stats as test data** (user: "we need some stats to test on anyways") **(my call on which season)**.

Fetching actual stats runs in a scheduled GitHub Actions job that commits JSON, like the ADP collector **(my call; a
Worker could also do it)**.

## Settled after the builder check

- **League scoring:** 9-category, H2H each category (repo defaults, `SESSION_HANDOFF.md`), so ESPN stats map to PTS,
  REB, AST, STL, BLK, 3PM, FG%, FT%, TO.
- **Which team is "yours" (my call):** a team picker fed by `getLeagueInfo` team names, remembered in the browser,
  defaulting to the League Dashboard's saved team if it has one. Trade Builder's Team A defaults to it; Team B is any
  other team.
- **Win M in these tools (user decision):**
  - **Weekly Matchup Analyzer:** Win M is calculated only against that week's opponent (one pairwise matchup).
  - **Trade Analyzer:** Win M is measured against the team's remaining regular-season matchups (the actual schedule
    from `getLeagueInfo`), other teams' rosters held fixed, using `sched.json` games per week.
  - **Later (user, to be noted in the handoff):** projected playoffs get added to the Trade Analyzer's Win M. Out of
    scope now; design so it can be added. Which Fantrax weeks are regular season versus playoffs is left to the
    builder (the draft board assumes playoffs from week 18; Fantrax lists 22 periods).
- **Waiver-add baseline (my call):** each add is scored against dropping the user's lowest-value non-IL player; the
  drop used is shown on the row.
- **Projections (user decision):** for now the tools use the current `players.json`, as the board does. These
  projections will be updated in future, so projections go through one loader and are never hard-coded into the new
  tools; an updated `players.json` (or a later source) must flow through with no change to the analyzers. How updates
  arrive is out of scope for this project.

## Behaviour to design in

- A two-roster engine function: given two rosters, a week or the rest of the season, and projected stats, return
  per-category win chances, Win M for each team. The engine today only evaluates a league from one draft state, so
  this is new, in a hard area (`src/engine.js`) and needs the planner and an analyst-reviewed test.
- Perceived value (Trade Analyzer): blend of current performance (ESPN actual stats), projection and ADP, with ADP
  carrying sunk-cost weight. **(my call)** Start with fixed weights chosen by the builder and shown on the page; tune
  later. Likelihood of trade is derived from the perceived-value gap for the other manager and from whether their own
  Win M also rises.
- Early-season blend: with few games played, actual stats should be shrunk toward projections **(my call)**.

## Build order and size

- Size: a project with a written design, then a plan via the planner subagent, then executing-plans inline, one review.
- Shared data layer first (rosters, free agents, schedule, ESPN stats, matching), then the two-roster engine function,
  then **Weekly Matchup Analyzer first, Trade Analyzer second (my call; the user has not chosen the order)**.
- Branch → PR → merge as in CLAUDE.md; merge only when the user says push.

## Left to the builder

- Where each tool lives (new page, League Dashboard tab, or both), and visual design beyond the agreed layout.
- Exact shrinkage and perceived-value weights, how likelihood is scaled, how the candidate list is generated and
  pruned, caching and refresh cadence, name-match override list.
- How the Worker is extended (new `what=` values) versus the collector job.

## Open risks

- ESPN endpoint is undocumented; may change or block. Fallback is Hashtag (brittle POST) or manual export.
- Fantrax rate limits (the Worker already backs off).
- Early-season data is thin, so outputs are noisy for the first weeks.
