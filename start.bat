@echo off
set PORT=8000
set STATIC_DIR=.\out

echo Starting static file server in: %STATIC_DIR%
echo Access at: http://localhost:%PORT%

REM Check if the 'out' directory exists
if not exist %STATIC_DIR% (
    echo ERROR: The '%STATIC_DIR%' directory was not found.
    echo Please run 'npm run build' first to generate the static files.
    exit /b 1
)

REM Change into the static directory
cd %STATIC_DIR%

REM Launch the Python Simple HTTP Server
REM 'start' runs the command in a new window, but we need it to run in the current one
REM We use 'start /b' to run in the background (Windows specific) or just run it directly
echo.
echo Note: This server will occupy this command prompt window.
echo Press Ctrl+C to stop the server.
echo.

REM Start the browser in the background (using timeout to wait for server start)
start "" "http://localhost:%PORT%"
timeout /t 1 /nobreak >nul

REM Run the server command (Python 3 is preferred)
python -m http.server %PORT% || python -m SimpleHTTPServer %PORT%

echo Server stopped.
