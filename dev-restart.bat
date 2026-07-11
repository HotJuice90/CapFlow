@echo off
setlocal
REM CapFlow: clean dev-environment restart.
REM Kills whatever is stuck on :8081, starts Metro fresh in its own window,
REM waits until it responds, then re-applies adb reverse and cold-restarts
REM the app on the phone. Run from repo root (lives there).

echo [1/5] Killing old processes on port 8081...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8081" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1

echo [2/5] Starting Metro in a separate window...
REM --dev-client: this project uses a custom dev client (capflow://), not Expo Go.
start "CapFlow Metro" /d "%~dp0" cmd /k npx expo start --dev-client

echo [3/5] Waiting for Metro to respond...
:waitmetro
ping -n 3 127.0.0.1 >nul
curl -s -m 2 http://127.0.0.1:8081/status 2>nul | findstr /c:"running" >nul
if errorlevel 1 goto waitmetro
echo       Metro is up.

echo [4/5] Waiting for phone over ADB (wireless debugging must be on)...
REM Wireless ADB sometimes registers the same phone twice (two mDNS names) -
REM plain "adb" then refuses to pick one ("more than one device/emulator").
REM Resolve one concrete serial up front and target it explicitly everywhere.
set "DEVICE="
:waitdev
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "$d = (adb devices) -split \"`n\" | Select-String '\tdevice$' | Select-Object -First 1; if ($d) { $d -replace \"`t.*\", '' }"`) do set "DEVICE=%%d"
if not defined DEVICE (
  ping -n 3 127.0.0.1 >nul
  goto waitdev
)
echo       Using device: %DEVICE%
adb -s "%DEVICE%" reverse tcp:8081 tcp:8081

echo [5/5] Cold-restarting the app on the phone...
adb -s "%DEVICE%" shell am force-stop com.capflow.app
adb -s "%DEVICE%" shell am start -a android.intent.action.VIEW -d "capflow://expo-development-client/?url=http://127.0.0.1:8081"

echo.
echo Done. If the phone hangs on splash, unlock the screen and re-run this script.
if not "%~1"=="nopause" pause
