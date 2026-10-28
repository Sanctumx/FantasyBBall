@echo off
cd /d "%~dp0"
node --max-old-space-size=4096 calib_ros.js 20 2025-26,2024-25,2023-24 41 blend
