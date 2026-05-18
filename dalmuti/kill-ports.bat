@echo off
chcp 65001 >nul 2>&1
echo 3000, 3333 포트를 쓰는 프로세스를 종료합니다...
echo.

for %%P in (3000 3333) do (
  echo --- 포트 %%P ---
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P" ^| findstr LISTENING') do (
    echo   PID %%a 종료
    taskkill /F /PID %%a >nul 2>&1
    if errorlevel 1 (
      echo   PID %%a 종료 실패 ^(관리자 권한이 필요할 수 있음^)
    ) else (
      echo   종료 완료
    )
  )
)

echo.
echo 완료. 이제 start.bat 을 다시 실행하세요.
pause
