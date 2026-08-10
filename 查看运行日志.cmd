@echo off
if not exist "%~dp0logs\desktop" mkdir "%~dp0logs\desktop"
explorer.exe "%~dp0logs\desktop"
