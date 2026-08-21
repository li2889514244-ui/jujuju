@echo off
chcp 65001 >nul
TITLE 披星云伴侣（开发模式）
cd /d "%~dp0"

echo ========================================
echo   披星云伴侣 - 开发调试模式
echo   http://localhost:5409
echo ========================================
echo.
echo 支持平台: 抖音 / 小红书 / 快手 / 视频号 / 抖店
echo.
echo 按 Ctrl+C 停止服务
echo ========================================

python companion_app.py --debug

pause
