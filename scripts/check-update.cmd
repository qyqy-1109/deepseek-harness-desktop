@echo off
rem check-update.cmd - one-click dsh version checker (thin shell around
rem scripts/check-update.mjs; keep this file pure ASCII + single lines).
cd /d "%~dp0\.."
where node >nul 2>nul
if errorlevel 1 echo [ERROR] Node.js not found & pause & exit /b 1
node scripts\check-update.mjs
echo.
pause
