@echo off
chcp 65001 >nul
title Video Studio
cd /d "%~dp0"

echo ════════════════════════════════════════════
echo   Video Studio - 视频后处理工具
echo ════════════════════════════════════════════
echo.

REM 检查 Python（先试 python，再试 py）
set "PYCMD=python"
python --version >nul 2>&1
if errorlevel 1 (
    set "PYCMD=py"
    py --version >nul 2>&1
    if errorlevel 1 (
        echo [错误] 未找到 Python，请先安装 Python 3.10+
        echo 下载地址: https://www.python.org/downloads/
        pause
        exit /b 1
    )
)

echo 使用 Python: %PYCMD%
echo.

REM 检查是否已安装依赖
%PYCMD% -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo [首次运行] 正在安装依赖...
    %PYCMD% -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请手动运行: %PYCMD% -m pip install -r requirements.txt
        pause
        exit /b 1
    )
    echo.
)

REM 检查配置文件
if not exist "config.toml" (
    echo [首次运行] 创建配置文件...
    copy config.example.toml config.toml >nul
    echo config.toml 已创建，请编辑填入 API Key
    echo.
)

echo 正在启动 Video Studio...
echo 浏览器打开: http://127.0.0.1:5600
echo 按 Ctrl+C 停止
echo.

%PYCMD% app.py

pause
