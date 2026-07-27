@echo off
setlocal enabledelayedexpansion

REM ============================================
REM  Portfolio AI Assistant - n8n Startup Script
REM  Handles first-time setup + daily startup
REM ============================================

echo.
echo  Portfolio AI Assistant - n8n Launcher
echo  ======================================
echo.

REM --- Load .env from same folder as this script ---
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%~dp0.env") do (
    set "%%A=%%B"
)

REM --- Check API key ---
if "%ANTHROPIC_API_KEY%"=="your-key-here" (
    echo [ERROR] API key not set. Edit .env and replace "your-key-here" with your real key.
    pause
    exit /b 1
)
if "%ANTHROPIC_API_KEY%"=="" (
    echo [ERROR] ANTHROPIC_API_KEY is empty. Check your .env file.
    pause
    exit /b 1
)
echo [OK] API key loaded

REM --- Check Node.js ---
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js found

REM --- Check n8n ---
where n8n >nul 2>&1
if errorlevel 1 (
    echo [SETUP] n8n not found. Installing globally...
    npm install -g n8n
    if errorlevel 1 (
        echo [ERROR] Failed to install n8n
        pause
        exit /b 1
    )
)
echo [OK] n8n installed

REM --- Run setup (imports workflow, creates credentials) ---
node "%~dp0setup.js"

REM --- Start n8n ---
echo.
echo  Starting n8n...
echo  Webhook: http://localhost:5678/webhook/chat
echo  Editor:  http://localhost:5678
echo  Press Ctrl+C to stop
echo.
npx n8n start
