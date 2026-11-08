@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================================
echo   EVRENSEL SINAV KAGIDI STUDYOSU VE MOBIL OPTIK OKUYUCU (OMR) BASLATILIYOR
echo ============================================================================
start "" "http://127.0.0.1:3000"
node server.js
pause
