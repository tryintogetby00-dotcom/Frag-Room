@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "FRAG ROOM server" /min node server.js
  timeout /t 2 /nobreak >nul
  start "" http://127.0.0.1:8000
  exit /b
)
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  start "FRAG ROOM server" /min "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
  timeout /t 2 /nobreak >nul
  start "" http://127.0.0.1:8000
  exit /b
)
echo Node.js 18 or later is needed for room-code multiplayer. Install Node.js or deploy this folder with render.yaml.
pause
