# Trade finder: 2-for-1 and 2-for-2 trades (idea 169)

Branch `trade-speed` (part A, search speed, merged as PR #67). Hard area: `evaluateTrade`, `TeamWin.leagueWin` and Win M feed the Team, Rankings, League and Trade tabs. Nothing here changes what the draft Model pick sees, so no draft backtest is needed; the analyst judges the weighting choice (see Approaches).

## Intent and why

The Trades finder today proposes only 1-for-1 trades. The user wants uneven trades: 2x1 (I give two players, get one, and the best free agent fills the freed slot) and 2x2. The 2x1 is mainly **consolidation**: trade two mid players for one better one. The deeper reason to consolidate is that it **opens a roster slot for waiver transactions during the week** (streaming), so the finder must put a number on that slot.

## Goals

- "Trade type" select in the Trades finder: 1-for-1 (default), 2-for-1, 2-for-2, All. Rows load the Builder. Candidates cached per type (same cache as part A). Sell High / Buy Low stay 1-for-1.
- 2x1: `evaluateTrade` takes `aAdds` (unowned players added to my roster; cap drops still apply). `tradeCandidates2x1`: for each of my give-pairs, shortlist the top 10 FA/WW (`!owner`, fxStatus FA/WW as in `matchup_core`, ranked by `InPlayers.valueZ`), pick the one that gives my roster-minus-pair the best `rosMeans`, then score every target exactly. Planner estimate: 78 pairs x 10 = 780 runs about 0.3 s; "any" 12,870 trades about 4.6 s (before part A's speedup), in background chunks.
- 2x2: 78 give-pairs x 972 same-team target pairs = 75,816 trades (about 27 s exact). Screen with dA(g1->t1) + dA(g2->t2) (best pairing) from the one-for-one table, exact gapB, keep estimated dA > 0 above a likelihood floor, score the top 400 by dA x likelihood exactly. Recall check against a full enumeration of the fixture league (about 30 s): target at least 24 of the exact top 25; the analyst reads it.
- A **slot value** for uneven trades (below).

## Decisions (user, 2026-10-29, standing)

1. dA shows the total with "of which X from the pickup"; sort and filter use dA minus the pickup alone (the pickup is a move available without trading).
2. The other team's likelihood subtracts the value of the player it must drop (also changes Builder likelihoods for uneven trades; a guess like #98).
3. Waiver-wire players are in the free-agent pool, tagged "waiver".
4. No 1-for-2 for now.
5. Time weighting and slot value apply **only to uneven trades** (2x1). 1-for-1 and 2x2 numbers do not move; the likelihood weights stay as tuned.

## Slot value and time weighting (user, 2026-10-29)

- dA is in percentage points of rest-of-season Win M (the average weekly win probability over the weeks left). The slot value uses the same unit, measured straight from weekly streaming data (`stream_sim` / `bt_stream`, four seasons of real weeks). No conversion to prize equity.
- The slot's weekly value is a **profile by week**, s(w): the win-probability gain of one extra open streaming slot (best available add, no forced drop, against a full roster that must cut its worst keeper or a static pickup). It is worth more late in the season and most in the playoffs.
- **Time weighting**, for uneven trades only: early in the season long-term value counts most (consolidation pays over many weeks); approaching the playoffs the weight moves to near-term matchup Win M; in the playoffs it is almost all near-term. The weighted average over the remaining weeks (regular season plus playoff weeks) replaces the plain average for both the player part and the slot term.
- **Team-specific version (to explore):** slot value = sum over categories of (what a streamer brings per category, by week, from the FA pool, so scarce categories like assists and percentages are low and steals/blocks/threes high) x (this team's marginal Win M per unit of that category). The analyst measures the spread across teams: if teams barely differ, ship the league-wide constant profile; if they differ meaningfully, use the team version.
- Shown as its own column "slot value" (points) and labelled regular-season where it is; kept out of the sort until validated.

## Approaches

1. Slot term only: weekly profile weights the slot value; the player part of dA stays the plain rest-of-season average. Cheap, no engine work; does not give the early-long-term / late-short-term behaviour for the player part.
2. **Full weighting for uneven trades (chosen):** the 2x1 player part and the slot term both use the per-week weights. Needs per-week Win M for a trade from the engine (`rosMeans` appears to work per period internally; planner confirms and costs it).
3. Slot term first, full weighting after.

User choice: **2, unless it is not a significant improvement over 1.** So build 2, and have the analyst design a comparison of 1 against 2 (how often the top 2x1 suggestions differ; a paired prize-equity screen like #163 if the decisions differ) and fall back to 1 if 2 is not significantly better.

## Non-goals and anti-goals

- No 1-for-2, no dump-a-surplus-player search, no counter-offers, no server pre-compute, no Web Worker pool.
- Do not change 1-for-1 or 2x2 dA, the likelihood weights, or League/Team/Rankings numbers. Part A's golden (`trade_candidates_golden.json`) must stay equal.
- Failure even if it technically works: a 2x1 list dominated by trades whose gain is just the free-agent pickup, or a slot value that is large because of a few extreme weeks.

## Constraints and risks

- Pickup is credited to me (decision 1 handles it). The likelihood was tuned on one-for-ones. The additive 2x2 screen misses lineup-cap interactions (recall check). Win M gains shrink once playoff odds are included (#163b); the weighting with playoff weeks is meant to address that, but regular-season-only labels stay where it is not.
- Search runs in background chunks, pauses off the Trade tab, and saves with the part A cache (`CAND_VER`, 6 combinations, 4 decimals); uneven types add cache keys and quota.
- Not re-measured in a browser after part A: Trade to Matchup switch time; no browser test of the non-avg Source guard.

## Calls made after the builder check (planner's calls, mark if wrong)

- **Weight curve:** not specified by the user; the analyst designs it. Start with one-parameter family (weight rises toward the playoffs, playoff weeks a large multiple) and a tuning step with an analyst gate before any UI work.
- **Order and fallback:** build the slot-value measurement and per-week engine support first, then the analyst comparison of approach 1 against 2; the analyst writes the "significantly better" gate (differing top suggestions plus a paired prize-equity screen like #163) before the run, as in `src/ipe_gate.txt`. Keep or strip the weighting after the verdict.
- **Slot baseline:** the pickup that fills the freed slot is already in decision 1. The slot term is on top of it: the gain of rotating streamers through that slot against the static pickup. This avoids double counting; "dA minus the pickup" and the slot term are separate numbers.
- **2x2:** same roster size, so no slot term and the plain average.
- **Decision 2 detail:** the dropped player is the worst on their roster by the same value the likelihood already uses; hand-built uneven trades in the Builder get it too; 1-for-1 Builder numbers are unchanged (golden stays equal).
- **Team-specific slot value:** explored only (analyst measures the spread); build the constant profile and the measurement script first.
- **Profile data:** a generation script writes a committed table (JSON) that the build embeds; refreshed by re-running the script.

## Sort (user, 2026-10-29: "go with your recommendation")

The slot value enters the 2x1 sort and filter as soon as the analyst validates the measurement, as a switch inside this branch (off until validated, on after). Until then the sort uses dA minus the pickup alone.

## Left to the builder

Exact data structure of the weekly profile (table by week index vs formula), where the per-week weights live, UI wording and layout of the "A + B" cells and "+ FA Name" tag, chunk sizes, the likelihood floor and top-N for the 2x2 screen, test fixtures.
