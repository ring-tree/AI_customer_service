@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Virtual env missing. Run setup first.
  exit /b 1
)
".venv\Scripts\python.exe" main.py
pause
