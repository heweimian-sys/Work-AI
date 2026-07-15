@echo off
cd /d "%USERPROFILE%\hermes-agent"
"%USERPROFILE%\hermes-agent\venv\Scripts\python.exe" -m hermes_cli.main gateway run
