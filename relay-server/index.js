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
const io = new Server(server, { 
    cors: { 
        origin: 'https://theriaud.alwaysdata.net', // Autorise spécifiquement mon hébergement
        methods: ["GET", "POST"]
    } 
});

const FORZA_PORT = 5607;
const udpSocket = dgram.createSocket('udp4');

let lastLapTime = 0;

udpSocket.on('message', async (msg) => {
    if (msg.length >= 324) {
        const isRaceOn = msg.readInt32LE(0);
        if (isRaceOn !== 1) return;

        // --- MOTEUR & TRANSMISSION ---
        const engineMaxRpm = msg.readFloatLE(8);
        const engineIdleRpm = msg.readFloatLE(12);
        const currentEngineRpm = msg.readFloatLE(16);
        const speed = msg.readFloatLE(256) * 3.6; // km/h
        const powerHp = msg.readFloatLE(260) / 745.7; // Watts convertis en Chevaux
        const torque = msg.readFloatLE(264); // Nm
        const gear = msg.readUInt8(319); // Correction de l'offset ici !

        // --- PÉDALES & VOLANT ---
        const accel = msg.readUInt8(315); // Valeur de 0 à 255
        const brake = msg.readUInt8(316); // Valeur de 0 à 255
        const steer = msg.readInt8(320);  // Valeur de -127 (Gauche) à 127 (Droite)

        // --- DYNAMIQUE (G-Force) ---
        const gForceLat = msg.readFloatLE(44);
        const gForceLon = msg.readFloatLE(48);

        // --- TEMPS AU TOUR ---
        const lastLap = msg.readFloatLE(300); // Correction de l'offset du temps au tour

        // Suspensions (Débattement normalisé de 0.0 à 1.0)
        const suspFL = msg.readFloatLE(68);
        const suspFR = msg.readFloatLE(72);
        const suspRL = msg.readFloatLE(76);
        const suspRR = msg.readFloatLE(80);

        // Température des pneus (en Fahrenheit, à convertir en Celsius)
        const tempFL = (msg.readFloatLE(120) - 32) * (5/9);
        const tempFR = (msg.readFloatLE(124) - 32) * (5/9);
        const tempRL = (msg.readFloatLE(128) - 32) * (5/9);
        const tempRR = (msg.readFloatLE(132) - 32) * (5/9);

        // Timestamp pour l'export CSV
        const timestamp = Date.now();

        if (lastLap > 0 && lastLap !== lastLapTime) {
            lastLapTime = lastLap;
            await supabase.from('laptimes').insert([{ lap_time: lastLap }]);
        }

        io.emit('telemetry', {
            rpm: currentEngineRpm,
            maxRpm: engineMaxRpm,
            idleRpm: engineIdleRpm,
            speed: speed,
            gear: gear === 0 ? 'R' : gear,
            powerHp: powerHp,
            torque: torque,
            inputs: { accel, brake, steer },
            gForce: { x: gForceLat, y: gForceLon },
            timestamp: timestamp,
            suspension: { fl: suspFL, fr: suspFR, rl: suspRL, rr: suspRR },
            tireTemp: { fl: tempFL, fr: tempFR, rl: tempRL, rr: tempRR }
        });
    }
});

udpSocket.bind(FORZA_PORT, () => console.log(`UDP en écoute sur ${FORZA_PORT}`));
server.listen(3000, () => console.log('Serveur WebSocket sur le port 3000'));