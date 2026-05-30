@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动天狼星门户服务器...
echo.
npm start
pause
