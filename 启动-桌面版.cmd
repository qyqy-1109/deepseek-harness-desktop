@echo off
rem ============================================================
rem  DeepSeek Harness Desktop - double-click launcher (dev mode)
rem  Steps:
rem    [1/3] npm install (Electron ~100MB on first run)
rem    [2/3] ensure the Electron binary (npm 11 blocks its
rem          postinstall by default; this approves and fetches it)
rem    [3/3] npm start -> desktop window
rem ============================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nodeMissing

if exist "node_modules\electron\dist\electron.exe" goto run

echo [1/3] Installing dependencies, please wait...
call npm install --no-audit --no-fund

echo [2/3] Ensuring the Electron binary...
call :ensureElectron
if errorlevel 1 goto installFailed

:run
echo [3/3] Starting DeepSeek Harness Desktop...
call npm start
exit /b 0

:ensureElectron
if exist "node_modules\electron\dist\electron.exe" exit /b 0
echo   Electron binary missing. Approving its install script and downloading...
npm approve-scripts electron >nul 2>nul
node "node_modules\electron\install.js"
if exist "node_modules\electron\dist\electron.exe" exit /b 0
echo   Direct download failed, trying npm rebuild...
npm rebuild electron
if exist "node_modules\electron\dist\electron.exe" exit /b 0
exit /b 1

:nodeMissing
echo [ERROR] Node.js not found. Install it from https://nodejs.org/
pause
exit /b 1

:installFailed
echo [ERROR] Electron could not be installed. Check your network and retry.
pause
exit /b 1
