@echo off
chcp 65001 >nul
title 披星云桌面伴侣
cd /d "%~dp0"

echo.
echo   ╔══════════════════════════════════════╗
echo   ║     披星云 MatrixFlow 桌面伴侣      ║
echo   ║     一键启动 - 自动配置环境         ║
echo   ╚══════════════════════════════════════╝
echo.

:: Step 1: Check Python
set PYTHON_CMD=
echo [1/4] 检测 Python 环境...
python --version >nul 2>&1 && set PYTHON_CMD=python && goto :python_ok
python3 --version >nul 2>&1 && set PYTHON_CMD=python3 && goto :python_ok
py --version >nul 2>&1 && set PYTHON_CMD=py && goto :python_ok

:: Check common install paths
for %%p in (
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%PROGRAMFILES%\Python313\python.exe"
    "%PROGRAMFILES%\Python312\python.exe"
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
) do (
    if exist %%p set PYTHON_CMD=%%p && goto :python_ok
)

:: Python not found - offer to download
echo.
echo   [警告] 未检测到 Python！
echo.
echo   桌面伴侣需要 Python 3.11+ 才能运行。
echo   是否自动下载并安装 Python？
echo.
choice /c YN /n /m "  [Y] 自动安装  [N] 手动安装后重试 "
if errorlevel 2 goto :no_python
if errorlevel 1 goto :install_python

:install_python
echo.
echo   [继续] 正在下载 Python 3.13.0...
set PYTHON_URL=https://www.python.org/ftp/python/3.13.0/python-3.13.0-amd64.exe
set PYTHON_INSTALLER=%TEMP%\python-installer.exe
curl -L -o "%PYTHON_INSTALLER%" "%PYTHON_URL%" 2>nul
if not exist "%PYTHON_INSTALLER%" (
    echo   [错误] 下载失败，请手动安装 Python: https://python.org
    pause
    exit /b 1
)
echo   正在安装 Python（静默安装）...
"%PYTHON_INSTALLER%" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
del "%PYTHON_INSTALLER%"
set PYTHON_CMD=python
echo   Python 安装完成！

:python_ok
echo.
echo   [OK] Python: %PYTHON_CMD%

:: Step 2: Install dependencies
echo.
echo [2/4] 安装依赖包...
%PYTHON_CMD% -m pip install -r requirements.txt --quiet 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [警告] 部分依赖安装失败，尝试继续...
)
echo   [OK] 依赖包就绪

:: Step 3: Install Chromium for Playwright
echo.
echo [3/4] 安装 Chromium 浏览器（约 150MB，首次较慢）...
%PYTHON_CMD% -m playwright install chromium 2>&1
echo   [OK] Chromium 就绪

:: Step 4: Start companion
echo.
echo [4/4] 启动桌面伴侣...
echo.
echo.
echo   ╔══════════════════════════════════════╗
echo   ║  伴侣已启动！                       ║
echo   ║  打开浏览器访问:                    ║
echo   ║  http://localhost:5409              ║
echo   ║                                     ║
echo   ║  在 MatrixFlow 网页中               ║
echo   ║  点击"添加平台账号"开始使用        ║
echo   ╚══════════════════════════════════════╝
echo.
echo   按 Ctrl+C 可停止服务
echo.

%PYTHON_CMD% companion_app.py
pause
goto :end

:no_python
echo.
echo   请手动安装 Python 3.11+ 后重新运行此脚本。
echo   下载地址: https://www.python.org/downloads/
pause
exit /b 1

:end
