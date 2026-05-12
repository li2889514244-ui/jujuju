@echo off
chcp 65001 >nul
TITLE MatrixFlow 一键安装
echo ========================================
echo   MatrixFlow 本地扫码服务 - 一键安装
echo ========================================
echo.
echo [1/3] 安装 Python 依赖...
pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo 错误: pip 安装失败，请检查 Python 是否已安装
    pause
    exit /b 1
)
echo   → 依赖安装完成
echo.
echo [2/3] 安装 requirements.txt 额外依赖...
pip install flask flask-cors requests playwright
if %ERRORLEVEL% NEQ 0 (
    echo 错误: Flask 安装失败
    pause
    exit /b 1
)
echo.
echo [3/3] 安装 Chromium 浏览器（约 150MB，仅首次）...
playwright install chromium
if %ERRORLEVEL% NEQ 0 (
    echo 警告: Chromium 安装可能失败，请手动运行: playwright install chromium
)
echo.
echo ========================================
echo   安装完成！
echo   双击 start.bat 启动本地扫码服务
echo ========================================
pause
