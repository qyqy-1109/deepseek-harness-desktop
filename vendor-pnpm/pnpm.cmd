@echo off
set "NODE_EXE=%~dp0..\node\node.exe"
set "PNPM_ENTRY=%~dp0runtime\pnpm\bin\pnpm.mjs"
if exist "%NODE_EXE%" "%NODE_EXE%" "%PNPM_ENTRY%" %*
if not exist "%NODE_EXE%" node "%PNPM_ENTRY%" %*
exit /b %errorlevel%
