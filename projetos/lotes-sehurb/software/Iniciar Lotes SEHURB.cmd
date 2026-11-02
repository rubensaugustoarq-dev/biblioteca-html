@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Ambiente local ausente. Execute Preparar Lotes SEHURB.cmd primeiro.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" scripts\launch_web.py
if errorlevel 1 pause
