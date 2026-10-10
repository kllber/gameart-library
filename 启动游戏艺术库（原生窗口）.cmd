@echo off
REM ============================================================
REM  GameArt Library - native window launcher (Electron)
REM  Double-click to open the app in its own window (no browser).
REM  For a no-console launch, use the .vbs launcher instead.
REM ============================================================
setlocal
set "APP=%~dp0"
set "EXE=%APP%node_modules\electron\dist\electron.exe"
if not exist "%EXE%" (
  echo.
  echo  Electron not found.
  echo  Please run this once in the project folder:
  echo      dev.cmd npm install
  echo.
  pause
  exit /b 1
)
start "" "%EXE%" "%APP%."
