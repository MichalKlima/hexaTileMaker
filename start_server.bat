@echo off
echo Spoustim MC_HEXA_MAP server na http://localhost:8000
cd /d "%~dp0"
start "" "http://localhost:8000/index.html"
python -m http.server 8000
pause
