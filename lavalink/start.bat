@echo off
echo 🎵 Starting Lavalink Server...

REM Check if Java is installed
java -version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Java is not installed. Please install Java 11 or higher.
    pause
    exit /b 1
)

REM Check if Lavalink.jar exists
if not exist "lavalink.jar" (
    echo ❌ Lavalink.jar not found!
    echo Please download Lavalink.jar from: https://github.com/lavalink-devs/Lavalink/releases
    echo And place it in the lavalink/ directory
    pause
    exit /b 1
)

REM Start Lavalink
echo 🚀 Starting Lavalink on port 2333...
java -jar lavalink.jar

echo ✅ Lavalink server stopped
pause
