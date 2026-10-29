@echo off
cd /d "%~dp0"
node --max-old-space-size=4096 calib_live.js
