@echo off
setlocal
title SurperClean Launcher
cd /d "%~dp0"

echo ==========================================
echo   SurperClean - one click start
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  echo         https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [1/2] Installing dependencies, please wait...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo [2/2] Building latest code...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

echo Launching...
start "" "node_modules\electron\dist\electron.exe" .

exit /b 0
