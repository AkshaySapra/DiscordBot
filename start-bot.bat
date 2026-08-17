@echo off
setlocal
cd /d "%~dp0"

REM Start the Discord bot in a window titled "DiscordBot"
REM (auto-pull.bat uses that title to restart only this bot)

title DiscordBot
echo Starting Discord bot...
npm start
pause
