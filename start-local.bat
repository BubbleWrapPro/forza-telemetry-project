@echo off
title Lancement Forza Telemetry
color 0A

echo ===================================================
echo     Demarrage de l'environnement local Forza
echo ===================================================
echo.

echo [1] Lancement du serveur relais Node.js...
:: Le parametre /k permet de garder la fenetre ouverte pour lire les logs en cas de crash
start "Serveur Relais Node.js" cmd /k "cd relay-server && node index.js"

:: Petite pause pour s'assurer que le serveur est bien demarre avant ngrok
timeout /t 2 /nobreak > NUL

echo [2] Lancement du tunnel ngrok sur le port 3000...
start "Tunnel Ngrok" cmd /k "ngrok http 3000"

echo.
echo ===================================================
echo  Processus locaux lances dans de nouvelles fenetres !
echo  Rappel : Mettez a jour l'URL ngrok dans App.jsx
echo  si le domaine a change depuis la derniere session.
echo ===================================================
echo.
pause