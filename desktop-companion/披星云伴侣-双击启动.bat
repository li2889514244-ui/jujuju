@echo off
chcp 65001 >nul
title Pixingyun Mate

set "APP_DIR=%~dp0"
set "EXE_PATH=%APP_DIR%dist\pixingyun-mate\pixingyun-mate.exe"

if not exist "%EXE_PATH%" (
    echo [ERROR] Cannot find:
    echo %EXE_PATH%
    pause
    exit /b 1
)

start "" "%EXE_PATH%"
