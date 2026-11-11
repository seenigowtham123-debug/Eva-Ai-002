@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Download it from https://nodejs.org ^(LTS^) then run this again. & pause & exit /b 1)
if not exist .env if exist .env.example copy .env.example .env >nul
start "" http://localhost:3000
node server.js
pause
