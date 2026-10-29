@echo off
cd /d "%~dp0"
node --max-old-space-size=4096 calib_kmatch.js 20 2025-26,2024-25,2023-24,2022-23 81
