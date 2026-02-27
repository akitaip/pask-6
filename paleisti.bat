@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Paleidžiama...
start "" http://localhost:3000
python -m http.server 3000
pause
