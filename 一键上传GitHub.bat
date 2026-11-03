@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0upload.ps1"
if errorlevel 1 (
    echo.
    echo [提示] 脚本执行失败，请查看上方报错信息。
)
pause
