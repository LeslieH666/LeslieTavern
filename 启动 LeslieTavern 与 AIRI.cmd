@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0packaging\windows-local\Leslie-AIRI-Launcher.ps1" -Mode All
if errorlevel 1 pause
