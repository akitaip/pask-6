@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Paleidžiama per Vercel dev...
start "" http://localhost:3000
vercel dev
pause
