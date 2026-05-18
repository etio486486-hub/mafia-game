@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Dalmuti dev (3000 + 3333)

echo.
echo === 달무티 서버 시작 ===
echo 폴더: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [오류] Node.js가 없거나 PATH에 등록되지 않았습니다.
  echo        https://nodejs.org 에서 LTS 설치 후 재부팅하세요.
  goto :pause_exit
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [오류] npm을 찾을 수 없습니다.
  goto :pause_exit
)

echo Node:
node -v
echo npm:
npm -v
echo.

if not exist "package.json" (
  echo [오류] package.json이 없습니다. dalmuti 폴더에서 실행하세요.
  goto :pause_exit
)

if not exist "node_modules\" (
  echo node_modules 없음 - npm install ...
  call npm install
  if errorlevel 1 goto :pause_exit
)

call :check_port 3000
if errorlevel 1 goto :port_busy
call :check_port 3333
if errorlevel 1 goto :port_busy

echo.
echo 서버 시작: npm run dev:all
echo   게임    http://localhost:3000
echo   Socket  http://localhost:3333
echo.
echo 이 창을 닫지 마세요.
echo ----------------------------------------
echo.

call npm run dev:all
set EXITCODE=%ERRORLEVEL%

echo.
echo ----------------------------------------
if not "%EXITCODE%"=="0" (
  echo [오류] 종료 코드: %EXITCODE%
  echo 포트 충돌이면 kill-ports.bat 실행 후 다시 start.bat
  echo.
)
goto :pause_exit

:port_busy
echo.
echo [오류] 위 포트가 이미 사용 중입니다.
echo   - 예전에 켜 둔 npm / node 창을 모두 닫거나
echo   - 이 폴더의 kill-ports.bat 을 실행한 뒤
echo   - start.bat 을 다시 실행하세요.
echo.
echo 주의: npm start ^(next start^) 가 아니라 start.bat / dev:all 을 쓰세요.
goto :pause_exit

:check_port
set PORT=%1
set BUSY=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr LISTENING') do (
  set BUSY=1
  echo [경고] 포트 %PORT% 사용 중 - PID %%a
)
if "%BUSY%"=="1" exit /b 1
exit /b 0

:pause_exit
echo.
echo 아무 키나 누르면 닫습니다...
pause >nul
exit /b 0
