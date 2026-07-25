require('dotenv').config(); // Charge le fichier .env
const dgram = require('dgram');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

// Vérification de sécurité au démarrage
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Erreur critique : Les variables d'environnement Supabase sont manquantes.");
    process.exit(1);
}

// Initialisation avec la clé Service Role (contourne le RLS pour l'écriture backend)
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const FORZA_PORT = 5607;
const udpSocket = dgram.createSocket('udp4');

let lastLapTime = 0;

udpSocket.on('message', async (msg) => {
    if (msg.length >= 324) {
        const isRaceOn = msg.readInt32LE(0);
        if (isRaceOn !== 1) return;

        // Décodage binaire (Little-Endian)
        const currentEngineRpm = msg.readFloatLE(16);
        const speed = msg.readFloatLE(256) * 3.6; // Conversion m/s en km/h
        const gear = msg.readUInt8(307); // Rapport de boîte (0 = R, 1-10)
        
        // Créativité : G-Force pour une Heatmap
        const gForceLat = msg.readFloatLE(44);
        const gForceLon = msg.readFloatLE(48);

        // Analyse des temps au tour
        const currentLap = msg.readUInt16LE(300);
        const lastLap = msg.readFloatLE(292);

        // Sauvegarde en base de données à chaque nouveau tour validé
        if (lastLap > 0 && lastLap !== lastLapTime) {
            lastLapTime = lastLap;
            await supabase.from('laptimes').insert([{ lap_time: lastLap }]);
        }

        // Diffusion en temps réel au Dashboard Front-end
        io.emit('telemetry', {
            rpm: currentEngineRpm,
            speed: speed,
            gear: gear === 0 ? 'R' : gear,
            gForce: { x: gForceLat, y: gForceLon }
        });
    }
});

udpSocket.bind(FORZA_PORT, () => console.log(`UDP en écoute sur ${FORZA_PORT}`));
server.listen(3000, () => console.log('Serveur WebSocket sur le port 3000'));