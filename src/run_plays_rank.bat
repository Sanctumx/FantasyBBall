@echo off
cd /d "%~dp0"
echo #141 Plays % by roster rank: arm 65 vs arm 23. Leave this window open.
echo == 1. parity: 2024-25 seeds 145-147
node bt_real.js 2024-25 23 145 147
node bt_real.js 2024-25 65 145 147
python prize_equity.py 65:23
del bt_real_2024-25_a23_145-147.json bt_real_2024-25_a65_145-147.json
echo.
echo == 2. paired run: 4 seasons, seeds 145-160
for %%S in (2022-23 2023-24 2024-25 2025-26) do (
  node bt_real.js %%S 23 145 160
  node bt_real.js %%S 65 145 160
)
python prize_equity.py 65:23 > results_plays_rank.txt
type results_plays_rank.txt
echo.
echo Done. Send results_plays_rank.txt back.
pause
