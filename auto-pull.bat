@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM ============================================================
REM Auto-pull + restart for Windows
REM Schedule this in Task Scheduler every 5 minutes:
REM   Program:  C:\path\to\DiscordBot\auto-pull.bat
REM   Start in: C:\path\to\DiscordBot
REM
REM First launch the bot with start-bot.bat (window title DiscordBot).
REM ============================================================

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Not a git repo: %cd%
  exit /b 1
)

echo [%date% %time%] Checking for updates...
git fetch origin
if errorlevel 1 (
  echo git fetch failed.
  exit /b 1
)

git rev-parse --abbrev-ref HEAD > "%TEMP%\discordbot_branch.txt"
set /p BRANCH=<"%TEMP%\discordbot_branch.txt"
if "%BRANCH%"=="" set BRANCH=main

git rev-parse HEAD > "%TEMP%\discordbot_local.txt"
git rev-parse "origin/%BRANCH%" > "%TEMP%\discordbot_remote.txt" 2>nul
if errorlevel 1 (
  echo Remote branch origin/%BRANCH% not found.
  exit /b 1
)

fc /b "%TEMP%\discordbot_local.txt" "%TEMP%\discordbot_remote.txt" >nul
if not errorlevel 1 (
  echo Already up to date.
  exit /b 0
)

echo New commits found on origin/%BRANCH%. Pulling...
git pull --ff-only origin %BRANCH%
if errorlevel 1 (
  echo git pull failed. Fix conflicts manually.
  exit /b 1
)

echo Running npm install...
call npm install
if errorlevel 1 (
  echo npm install failed.
  exit /b 1
)

echo Restarting bot window "DiscordBot"...
taskkill /FI "WINDOWTITLE eq DiscordBot*" /F >nul 2>&1
timeout /t 2 /nobreak >nul

start "DiscordBot" cmd /c "cd /d \"%~dp0\" && npm start"
echo Restart launched.
exit /b 0
