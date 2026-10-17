@echo off
set "args=%*"
set "args=%args:marimba7f=marimba12ar1%"
"C:\Program Files\Docker\Docker\resources\bin\docker.exe" %args%
exit /b %errorlevel%
