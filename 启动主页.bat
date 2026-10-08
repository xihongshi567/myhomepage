@echo off
cd /d "%~dp0"
start "何媛个人主页服务器" /b node server.mjs
timeout /t 1 /nobreak >nul
start "" http://127.0.0.1:4173/
