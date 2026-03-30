@echo off
echo Bienvenue dans Proxfleet !
echo Demarrage du conteneur Docker...

docker start proxfleet-container >nul 2>&1

timeout /t 3 >nul

start http://localhost:5173/app2
