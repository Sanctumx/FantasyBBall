# inseason-pe

State (2026-10-29): design approved and committed (`docs/superpowers/specs/2026-10-29-inseason-pe-design.md`, 0cebd07); planner's plan approved in chat (tasks 0-9). Ledger rows 161 (streaming), 162 (lineup), 163 (trade) are committed in the ledger worktree but NOT landed (landing needs the user's push word).

Decisions (user, 2026-10-29): k tuning is dropped from this work (the shrink is monotone, so k cannot flip a pick, a lineup or a trade sign); model objective = all-play category share in the regular season (title_score rsMode 'each' has no weekly opponents), bracket opponent match win in the playoffs; model arms as in the design. Not answered yet: delta (smallest PE gain worth acting on; planner suggests 0.3) and the PC time budget (sets the seed count).

Order: 0 setup, 1 hooks in `src/stream_sim.js` (opts.me, streamPick, lineupRank, trades; parity script shows byte-identical rows with hooks absent/null), 2 `src/ipe_core.js` pickers + gate arithmetic (test first, k-invariance test), 3 pilot with placebo arm (PC, ask first) and gate committed to `src/results/ipe_gate.txt` before any screen is read, 4 streaming screen, 5 lineup screen (autoFill is already headless, no extraction), 6 trade screen, 7 analyst checkpoints, 8 full PE for survivors (PC, ask first), 9 records via the ledger worktree.

Next: task 1 (hooks + parity script, test first in `src/tests/engine/ipe_core.test.js`).
