@echo off
cd /d "%~dp0"
echo #139 rest-of-season calibration of the Team tab Win M / Win C. Leave this window open (about 2-4 minutes).
node --max-old-space-size=4096 calib_ros.js 20
echo.
echo FINISHED. Send results_calib_ros.txt back (the Verdict block at the bottom is the answer).
pause
