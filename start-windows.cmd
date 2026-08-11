@echo off
setlocal
cd /d "%~dp0"
title Live Signature Wall Pro

echo [1/3] Checking Node.js...
where node >nul 2>nul || (
  echo Node.js was not found. Install Node.js 22 LTS or newer first.
  pause
  exit /b 1
)

echo [2/3] Checking dependencies...
if not exist "node_modules\socket.io-parser" (
  if exist node_modules rmdir /s /q node_modules
  call npm cache verify
  call npm install --registry=https://registry.npmjs.org/
  if errorlevel 1 goto :error
)

echo [3/3] Starting service...
call npm start
exit /b %errorlevel%

:error
echo.
echo Dependency installation failed. Run repair-windows.cmd.
pause
exit /b 1
