@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0packaging\windows-local\Stop-LeslieTavern.ps1"
if errorlevel 1 pause
