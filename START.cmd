@echo off
setlocal
chcp 65001 >nul
title Transit Map Workshop - Local Server
cd /d "%~dp0"

echo ========================================
echo        Transit Map Workshop
echo ========================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1" -NoPause
set "LAUNCH_EXIT=%ERRORLEVEL%"

echo.
if not "%LAUNCH_EXIT%"=="0" (
  echo [FAILED] Startup failed. The error is shown above.
  echo Please take a screenshot of this window.
) else (
  echo [OK] The local website is running.
  echo Open http://localhost:3000/?storage=http in your browser.
)
echo.
echo This window will stay open. Press any key to close it.
pause >nul
exit /b %LAUNCH_EXIT%
