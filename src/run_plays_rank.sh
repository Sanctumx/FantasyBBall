#!/bin/bash
# #141 backtest: arm 65 (Plays % by roster rank) against arm 23, paired. Run from anywhere: bash src/run_plays_rank.sh
# Step 1 is the parity check, step 2 the paired run (4 seasons x slots 1/4/7/10/14 x seeds 145-160 = 320 drafts per arm).
# Seasons run in parallel; results land in src/bt_real_*.json, then prize equity is printed.
cd "$(dirname "$0")" || exit 1

echo "== 1. parity: 2024-25, seeds 145-147 =="
node bt_real.js 2024-25 23 145 147 &
node bt_real.js 2024-25 65 145 147 &
wait
python prize_equity.py 65:23
rm -f bt_real_2024-25_a23_145-147.json bt_real_2024-25_a65_145-147.json   # step 2 covers these seeds; keep them out of the paired total

echo "== 2. paired run: seeds 145-160 =="
for s in 2022-23 2023-24 2024-25 2025-26; do
  ( node bt_real.js $s 23 145 160; node bt_real.js $s 65 145 160 ) &
done
wait
python prize_equity.py 65:23
echo "Done. Send the output above back."
