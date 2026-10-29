@echo off
cd /d "%~dp0"
node --max-old-space-size=8192 calib_ros.js 20 2025-26,2024-25,2023-24,2022-23 81 avail && node --max-old-space-size=4096 calib_live.js avail
