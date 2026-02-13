@echo off

echo Starting Proxfleet...

docker start proxfleet-container >nul 2>&1

timeout /t 2 >nul

start http://localhost:8000/docs
