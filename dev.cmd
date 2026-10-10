@echo off
REM ============================================================
REM  GameArt Library - unified launcher
REM  Purpose: keep ALL caches/temp inside the project folder. Never write to C:.
REM  Usage:  dev.cmd <command>     e.g.  dev.cmd npm install
REM ============================================================
setlocal
set "ROOT=%~dp0"

REM --- temp dirs ---
set "TEMP=%ROOT%.tmp"
set "TMP=%ROOT%.tmp"
set "TMPDIR=%ROOT%.tmp"

REM --- node ---
set "NPM_CONFIG_CACHE=%ROOT%.cache\npm"
set "YARN_CACHE_FOLDER=%ROOT%.cache\yarn"

REM --- browser / runtime downloads ---
set "PLAYWRIGHT_BROWSERS_PATH=%ROOT%.cache\playwright"
set "PUPPETEER_CACHE_DIR=%ROOT%.cache\puppeteer"
set "ELECTRON_CACHE=%ROOT%.cache\electron"

REM --- python ---
set "PIP_CACHE_DIR=%ROOT%.cache\pip"
set "PYTHONPYCACHEPREFIX=%ROOT%.cache\pycache"

REM --- rust / tauri ---
set "CARGO_HOME=%ROOT%.cache\cargo"
set "RUSTUP_HOME=%ROOT%.cache\rustup"
set "CARGO_TARGET_DIR=%ROOT%target"

REM --- java / gradle ---
set "GRADLE_USER_HOME=%ROOT%.cache\gradle"

if not exist "%ROOT%.cache" mkdir "%ROOT%.cache"
if not exist "%ROOT%.tmp" mkdir "%ROOT%.tmp"

%*
