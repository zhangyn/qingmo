@echo off
rem MD Editor launcher
cd /d "%~dp0"
where pythonw >nul 2>nul
if %errorlevel%==0 (
  start "" pythonw serve.py
  exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "MD Editor Service" /min python serve.py
  exit /b
)
echo Python not found. Please install Python first.
pause
