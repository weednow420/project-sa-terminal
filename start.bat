@echo off
chcp 65001 >nul
title PROJECT S-A TERMINAL // CONTROL CENTER
cd /d "%~dp0"

echo ============================================================
echo   PROJECT S-A TERMINAL // ЗАПУСК ВСЕХ СИСТЕМ
echo ============================================================
echo.

:: 1. Освобождаем порт 3000, если остался старый процесс
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    echo [CLEANUP] Освобождение порта 3000 (PID %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

:: 2. Закрываем возможные зависшие процессы python бота
taskkill /F /IM python.exe >nul 2>&1

:: Небольшая пауза для освобождения сокетов
timeout /t 1 /nobreak >nul

:: Переходим в папку backend и запускаем единый лаунчер
cd backend
node launcher.js

pause
