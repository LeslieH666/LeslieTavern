@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0packaging\windows-local\Backup-LeslieTavern.ps1"
if errorlevel 1 pause
