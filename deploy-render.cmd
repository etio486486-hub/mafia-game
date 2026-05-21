@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM  마피아 게임 — Render 배포용 (Windows CMD)
REM  1) GitHub에 푸시  2) Render Blueprint 또는 Web Service 연결
REM ============================================================

cd /d "%~dp0"
echo.
echo [1/4] 현재 폴더: %CD%
echo.

REM --- Git 상태 확인 ---
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Git 저장소가 없습니다. 초기화합니다...
  git init
  git branch -M main
)

echo [2/4] 변경 사항 스테이징...
git add -A
git status

echo.
set /p MSG=커밋 메시지 (Enter=기본값 "deploy to render"): 
if "%MSG%"=="" set MSG=deploy to render

git commit -m "%MSG%" 2>nul
if errorlevel 1 (
  echo 커밋할 변경이 없거나 커밋 실패. 원격 푸시만 시도합니다.
)

echo.
echo [3/4] 원격 저장소 확인...
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo.
  echo GitHub 저장소 URL을 아직 연결하지 않았습니다.
  echo 예: https://github.com/USER/mafia-game.git
  set /p REPO=GitHub 저장소 URL: 
  if not "!REPO!"=="" git remote add origin "!REPO!"
)

echo.
echo [4/4] main 브랜치 푸시...
git push -u origin main
if errorlevel 1 (
  echo.
  echo *** push 실패 ***
  echo - GitHub에 빈 repo를 먼저 만드세요
  echo - git remote add origin ^<URL^> 후 다시 실행
  echo - 인증: GitHub PAT 또는 gh auth login
  goto :render_help
)

:render_help
echo.
echo ============================================================
echo  Render 대시보드 설정 (한 번만)
echo ============================================================
echo.
echo  A) Blueprint (권장) — 이 폴더에 render.yaml 있음
echo     https://dashboard.render.com/blueprints
echo     ^> New Blueprint Instance ^> GitHub repo 선택
echo.
echo  B) Web Service 수동
echo     https://dashboard.render.com/
echo     ^> New + ^> Web Service ^> repo 연결
echo.
echo     Build Command:
echo       npm install ^&^& npm run install-new-roles ^&^& npm run prepare-assets
echo.
echo     Start Command:
echo       npm start
echo.
echo     Health Check Path: /health
echo     Environment: NODE_VERSION=20
echo.
echo  배포 후 접속: https://^<서비스이름^>.onrender.com
echo  헬스체크:     https://^<서비스이름^>.onrender.com/health
echo ============================================================
echo.
pause
endlocal
