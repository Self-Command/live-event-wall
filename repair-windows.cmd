@echo off
setlocal
cd /d "%~dp0"
title Repair Live Signature Wall Pro

echo Removing old dependency files...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /f /q package-lock.json

call npm cache verify
if errorlevel 1 goto :error
call npm install --registry=https://registry.npmjs.org/
if errorlevel 1 goto :error
call npm run check
if errorlevel 1 goto :error

echo.
echo Repair completed. You can run start-windows.cmd now.
pause
exit /b 0

:error
echo.
echo Repair failed. Check your Node.js installation and network connection.
pause
exit /b 1
