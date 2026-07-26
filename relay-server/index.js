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
        const isMotorsportDash = msg.length >= 331;
        const dashboardOffset = isMotorsportDash ? 0 : 12;

        // --- MOTEUR & TRANSMISSION ---
        const engineMaxRpm = msg.readFloatLE(8);
        const engineIdleRpm = msg.readFloatLE(12);
        const currentEngineRpm = msg.readFloatLE(16);
        const speed = msg.readFloatLE(244 + dashboardOffset) * 3.6; // km/h
        const powerHp = msg.readFloatLE(248 + dashboardOffset) / 745.7; // Watts convertis en Chevaux
        const torque = msg.readFloatLE(252 + dashboardOffset); // Nm
        const gear = msg.readUInt8(307 + dashboardOffset);

        // --- PÉDALES & VOLANT ---
        const accel = msg.readUInt8(303 + dashboardOffset); // Valeur de 0 à 255
        const brake = msg.readUInt8(304 + dashboardOffset); // Valeur de 0 à 255
        const steer = msg.readInt8(308 + dashboardOffset);  // Valeur de -127 (Gauche) à 127 (Droite)

        // --- DYNAMIQUE (G-Force) ---
        // Le paquet donne l'accélération en m/s² : X est latéral, Z longitudinal.
        // Conversion en G pour le G-mètre (les offsets 44/48 sont des vitesses angulaires).
        const gForceLat = msg.readFloatLE(20) / 9.80665;
        const gForceLon = msg.readFloatLE(28) / 9.80665;

        // --- TEMPS AU TOUR ---
        const lastLap = msg.readFloatLE(288 + dashboardOffset);

        // Suspensions (Débattement normalisé de 0.0 à 1.0)
        const suspFL = msg.readFloatLE(68);
        const suspFR = msg.readFloatLE(72);
        const suspRL = msg.readFloatLE(76);
        const suspRR = msg.readFloatLE(80);

        // Les offsets 120-132 sont des données de piste, pas les températures :
        // leur lecture donnait donc -18 °C après conversion d'une valeur nulle.
        const fahrenheitToCelsius = (value) => (value - 32) * (5 / 9);
        const tempFL = fahrenheitToCelsius(msg.readFloatLE(256 + dashboardOffset));
        const tempFR = fahrenheitToCelsius(msg.readFloatLE(260 + dashboardOffset));
        const tempRL = fahrenheitToCelsius(msg.readFloatLE(264 + dashboardOffset));
        const tempRR = fahrenheitToCelsius(msg.readFloatLE(268 + dashboardOffset));
        const tireWear = isMotorsportDash
            ? {
                fl: msg.readFloatLE(314), fr: msg.readFloatLE(318),
                rl: msg.readFloatLE(322), rr: msg.readFloatLE(326)
            }
            : null;
        const tireSlip = {
            fl: msg.readFloatLE(180), fr: msg.readFloatLE(184),
            rl: msg.readFloatLE(188), rr: msg.readFloatLE(192)
        };

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
            tireTemp: { fl: tempFL, fr: tempFR, rl: tempRL, rr: tempRR },
            tireWear,
            tireSlip
        });
    }
});

udpSocket.bind(FORZA_PORT, () => console.log(`UDP en écoute sur ${FORZA_PORT}`));
server.listen(3000, () => console.log('Serveur WebSocket sur le port 3000'));
