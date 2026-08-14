@echo off
rem ============================================================
rem  One-click verify & install for the dsh-codex-desktop project:
rem    [1/4] generate app icons
rem    [2/4] npm install (Electron)
rem    [3/4] syntax checks
rem    [4/4] install dsh-codex-flavor into the web profile
rem  The last step needs a dsh web RESTART to take effect.
rem ============================================================
cd /d "%~dp0\.."

echo [1/4] Generating app icons...
node scripts\make-icon.mjs
if errorlevel 1 call :die icon generation failed

echo [2/4] Installing dependencies (first run downloads Electron)...
call npm install --no-audit --no-fund
call :ensureElectron
if errorlevel 1 call :die Electron binary could not be installed

echo [3/4] Syntax checks...
node --check main\main.js
if errorlevel 1 call :die syntax check failed
node --check preload.js
if errorlevel 1 call :die syntax check failed
node --check plugin\dsh-codex-flavor\lib\client.js
if errorlevel 1 call :die syntax check failed
node --check plugin\dsh-codex-flavor\lib\index.js
if errorlevel 1 call :die syntax check failed

echo [4/4] Installing dsh-codex-flavor into the web profile...
call :ensurePnpm
if errorlevel 1 call :die pnpm not available
call :resolveDsh
if errorlevel 1 call :die dsh CLI not found

pushd plugin\dsh-codex-flavor
%DSH_BIN% plugin --profile web add .
set "PLUGIN_RC=%errorlevel%"
popd
if not "%PLUGIN_RC%"=="0" call :die plugin install failed

echo.
echo Done. Verify the plugin layer with:
echo   %DSH_BIN% --profile web --dump-config ^| findstr codex
echo.
echo NOTE: restart dsh web to activate the plugin, then refresh.
pause
exit /b 0

:ensurePnpm
where pnpm >nul 2>nul
if not errorlevel 1 exit /b 0
echo   pnpm not on PATH - enabling corepack shims...
corepack enable
where pnpm >nul 2>nul
exit /b %errorlevel%

:ensureElectron
if exist "node_modules\electron\dist\electron.exe" exit /b 0
echo   Electron binary missing. Approving its install script and downloading...
npm approve-scripts electron >nul 2>nul
node "node_modules\electron\install.js"
if exist "node_modules\electron\dist\electron.exe" exit /b 0
npm rebuild electron
if exist "node_modules\electron\dist\electron.exe" exit /b 0
exit /b 1

:resolveDsh
set "DSH_BIN=dsh"
where dsh >nul 2>nul
if not errorlevel 1 exit /b 0
set "DSH_BIN=node %APPDATA%\npm\node_modules\@deepseek-ai\dsh\lib\bin.js"
if exist "%APPDATA%\npm\node_modules\@deepseek-ai\dsh\lib\bin.js" exit /b 0
set "DSH_BIN=node C:\Users\Windows\nodejs\node_modules\@deepseek-ai\dsh\lib\bin.js"
if exist "C:\Users\Windows\nodejs\node_modules\@deepseek-ai\dsh\lib\bin.js" exit /b 0
echo [ERROR] dsh CLI not found on PATH or npm global install.
exit /b 1

:die
echo.
echo [FAILED] %*
pause
exit /b 1
