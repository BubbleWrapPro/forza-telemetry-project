/**
 * Relais de télémétrie Forza.
 *
 * Ce processus reçoit les paquets UDP envoyés localement par le jeu, extrait les
 * champs utiles, puis publie le dernier état connu sur un canal Supabase Realtime
 * privé. Le tableau de bord s'abonne à ce même canal.
 *
 * Flux : Forza (UDP:5607) -> ce relais -> Supabase Realtime -> App.jsx.
 */
const ws = require('ws');

// Affiche les erreurs inattendues avant que la fenêtre de l'agent compilé ne se ferme.
process.on('uncaughtException', (err) => {
    console.error("❌ ERREUR FATALE :", err.message);
    console.log(err.stack);
    console.log("\nAppuyez sur 'Entrée' ou fermez la fenêtre pour quitter.");
    
    // Garde le processus actif pour lire l'erreur
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    readline.question('', () => process.exit(1));
});

require('dotenv').config();
const fs = require('fs');
const path = require('path');
// En binaire pkg, la configuration doit vivre près de l'exécutable, pas dans son système de fichiers virtuel.
const isCompiled = typeof process.pkg !== 'undefined';
const baseDir = isCompiled ? path.dirname(process.execPath) : __dirname;
// Chemin final absolu et sûr pour le fichier de configuration
const configPath = path.join(baseDir, 'config.json');
const readline = require('readline');
const dgram = require('dgram');


const { createClient } = require('@supabase/supabase-js');


const SUPABASE_URL="https://yphsagzixbcrxmeqptpf.supabase.co"
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwaHNhZ3ppeGJjcnhtZXFwdHBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NjQ3NjcsImV4cCI6MjEwMDU0MDc2N30.kQThZTtNGm9Ttr0xGm3yFKtgy6n9FJN6vWI6Zqzhur8"


// Ce client ne conserve aucune session en mémoire : le jeton est stocké explicitement dans config.json.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // pkg cible Node 18, qui ne fournit pas WebSocket nativement.
  // Le transport explicite évite à realtime-js de chercher l'API WebSocket native.
  realtime: { transport: ws }
});

// Crée une interface readline éphémère afin de ne pas laisser de descripteur stdin ouvert.
const ask = (question) => new Promise((resolve) => {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  terminal.question(question, (answer) => {
    terminal.close();
    resolve(answer.trim());
  });
});

/**
 * Restaure la session locale si elle est valide ; sinon demande les identifiants
 * Supabase et mémorise les jetons de renouvellement pour les prochains démarrages.
 * @returns {Promise<string>} identifiant de l'utilisateur propriétaire du canal.
 */
async function authenticateRelay() {
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.access_token && config.refresh_token && config.user_id) {
        const { data, error } = await supabase.auth.setSession({
          access_token: config.access_token,
          refresh_token: config.refresh_token
        });
        if (!error && data.user?.id === config.user_id) return data.user.id;
        console.warn('Session sauvegardée invalide ou expirée ; nouvelle connexion requise.');
      }
    } catch (error) {
      console.warn(`Impossible de lire config.json : ${error.message}`);
    }
  }

  const email = await ask('E-mail Supabase : ');
  const password = await ask('Mot de passe Supabase : ');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(error?.message || 'Connexion Supabase impossible.');
  }

  fs.writeFileSync(configPath, `${JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user_id: data.user.id
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(`Session sauvegardée pour ${data.user.email || data.user.id}.`);
  return data.user.id;
}

/**
 * Initialise le canal Realtime et le serveur UDP, puis maintient le cycle de vie
 * du relais jusqu'à la réception d'un signal d'arrêt.
 */
async function start() {
  const userId = await authenticateRelay();
  const telemetryChannel = supabase.channel(`telemetry_${userId}`, { config: { private: true } });
  let realtimeReady = false;
  let latestTelemetry = null;
  let lastSentTelemetry = null;
  let sendInProgress = false;
  let lastLapTime = 0;
  // Le protocole FH6 ne fournit pas cette vitesse directement. Elle est dérivée
  // de deux débattements normalisés successifs (unité : débattement normalisé/s).
  let previousSuspension = null;
  const udpSocket = dgram.createSocket('udp4');

  // Aucun envoi n'est tenté tant que l'abonnement privé n'est pas confirmé.
  telemetryChannel.subscribe((status) => {
    realtimeReady = status === 'SUBSCRIBED';
    if (realtimeReady) console.log(`Canal Realtime telemetry_${userId} connecté.`);
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error(`Canal Realtime indisponible (${status}).`);
    }
  });

  // Les paquets UDP peuvent dépasser 60 Hz : on conserve la plus récente et on
  // évite toute file d'envoi Realtime susceptible d'augmenter la latence.
  const broadcastTimer = setInterval(async () => {
    if (!realtimeReady || sendInProgress || !latestTelemetry || latestTelemetry === lastSentTelemetry) return;
    const payload = latestTelemetry;
    sendInProgress = true;
    try {
      const status = await telemetryChannel.send({
        type: 'broadcast',
        event: 'telemetry_update',
        payload
      });
      if (status === 'ok') lastSentTelemetry = payload;
      else console.error(`Échec de diffusion Realtime : ${status}`);
    } catch (error) {
      console.error(`Échec de diffusion Realtime : ${error.message}`);
    } finally {
      sendInProgress = false;
    }
  }, 1000 / 60);

  // Les décalages dépendent du format de paquet Forza : Motorsport Dash contient
  // les données dashboard à partir de l'octet 0, les autres formats à l'octet 12.
  udpSocket.on('message', async (msg) => {
    if (msg.length < 324 || msg.readInt32LE(0) !== 1) return;
    // FH6 utilise toujours un paquet fixe de 324 octets ; ne pas appliquer les
    // décalages du format « Dash » de Forza Motorsport.
    const isRaceOn = msg.readInt32LE(0);
    const timestampMs = msg.readUInt32LE(4);
    const engineMaxRpm = msg.readFloatLE(8);
    const engineIdleRpm = msg.readFloatLE(12);
    const currentEngineRpm = msg.readFloatLE(16);

    const acceleration = { x: msg.readFloatLE(20), y: msg.readFloatLE(24), z: msg.readFloatLE(28) };
    const velocity = { x: msg.readFloatLE(32), y: msg.readFloatLE(36), z: msg.readFloatLE(40) };
    const angularVelocity = { x: msg.readFloatLE(44), y: msg.readFloatLE(48), z: msg.readFloatLE(52) };
    const orientation = {
      yaw: msg.readFloatLE(56),
      pitch: msg.readFloatLE(60),
      roll: msg.readFloatLE(64)
    };

    const suspension = {
      fl: msg.readFloatLE(68), fr: msg.readFloatLE(72),
      rl: msg.readFloatLE(76), rr: msg.readFloatLE(80)
    };
    const tireSlipRatio = {
      fl: msg.readFloatLE(84), fr: msg.readFloatLE(88),
      rl: msg.readFloatLE(92), rr: msg.readFloatLE(96)
    };
    const wheelRotationSpeed = {
      fl: msg.readFloatLE(100), fr: msg.readFloatLE(104),
      rl: msg.readFloatLE(108), rr: msg.readFloatLE(112)
    };
    const wheelOnRumbleStrip = {
      fl: msg.readInt32LE(116) !== 0, fr: msg.readInt32LE(120) !== 0,
      rl: msg.readInt32LE(124) !== 0, rr: msg.readInt32LE(128) !== 0
    };
    const wheelInPuddleDepth = {
      fl: msg.readFloatLE(132), fr: msg.readFloatLE(136),
      rl: msg.readFloatLE(140), rr: msg.readFloatLE(144)
    };
    const surfaceRumble = {
      fl: msg.readFloatLE(148), fr: msg.readFloatLE(152),
      rl: msg.readFloatLE(156), rr: msg.readFloatLE(160)
    };
    const tireSlipAngle = {
      fl: msg.readFloatLE(164), fr: msg.readFloatLE(168),
      rl: msg.readFloatLE(172), rr: msg.readFloatLE(176)
    };
    const tireCombinedSlip = {
      fl: msg.readFloatLE(180), fr: msg.readFloatLE(184),
      rl: msg.readFloatLE(188), rr: msg.readFloatLE(192)
    };
    const suspensionTravelMeters = {
      fl: msg.readFloatLE(196), fr: msg.readFloatLE(200),
      rl: msg.readFloatLE(204), rr: msg.readFloatLE(208)
    };

    const carOrdinal = msg.readInt32LE(212);
    const carClass = msg.readInt32LE(216);
    const carPerformanceIndex = msg.readInt32LE(220);
    const drivetrainType = msg.readInt32LE(224);
    const numCylinders = msg.readInt32LE(228);

    // Gap 232-243

    const position = { x: msg.readFloatLE(244), y: msg.readFloatLE(248), z: msg.readFloatLE(252) };
    const speed = msg.readFloatLE(256) * 3.6;
    const powerHp = msg.readFloatLE(260) / 745.7;
    const torque = msg.readFloatLE(264);

    const fahrenheitToCelsius = (value) => (value - 32) * (5 / 9);
    const tireTemp = {
      fl: fahrenheitToCelsius(msg.readFloatLE(268)), fr: fahrenheitToCelsius(msg.readFloatLE(272)),
      rl: fahrenheitToCelsius(msg.readFloatLE(276)), rr: fahrenheitToCelsius(msg.readFloatLE(280))
    };

    const boost = msg.readFloatLE(284);
    const fuel = msg.readFloatLE(288);
    const distanceTraveled = msg.readFloatLE(292);
    const bestLap = msg.readFloatLE(296);
    const lastLap = msg.readFloatLE(300);
    const currentLap = msg.readFloatLE(304);
    const currentRaceTime = msg.readFloatLE(308);
    const lapNumber = msg.readUInt16LE(312);
    const racePosition = msg.readUInt8(314);

    const accel = msg.readUInt8(315);
    const brake = msg.readUInt8(316);
    const clutch = msg.readUInt8(317);
    const handbrake = msg.readUInt8(318);
    const gear = msg.readUInt8(319);
    const steer = msg.readInt8(320);
    const normDrivingLine = msg.readInt8(321);
    const normAIBrake = msg.readInt8(322);

    const gForceLat = - (acceleration.x / 9.80665);
    const gForceLon = - (acceleration.z / 9.80665);

    const deltaSeconds = previousSuspension ? (timestampMs - previousSuspension.timestampMs) / 1000 : 0;
    const suspensionVelocity = deltaSeconds > 0 && deltaSeconds < 1
      ? Object.fromEntries(Object.entries(suspension).map(([wheel, travel]) => [wheel, (travel - previousSuspension.values[wheel]) / deltaSeconds]))
      : { fl: 0, fr: 0, rl: 0, rr: 0 };
    previousSuspension = { timestampMs, values: suspension };

    // Un nouveau temps de tour est persistant ; la télémétrie courante reste, elle, éphémère.
    if (lastLap > 0 && lastLap !== lastLapTime) {
      lastLapTime = lastLap;
      const { error } = await supabase.from('laptimes').insert([{ lap_time: lastLap, user_id: userId }]);
      if (error) console.error(`Impossible d'enregistrer le tour : ${error.message}`);
    }

    // Contrat de données consommé par dashboard-client/src/App.jsx.
    latestTelemetry = {
      isRaceOn,
      rpm: currentEngineRpm, maxRpm: engineMaxRpm, idleRpm: engineIdleRpm, speed,
      gear: gear === 0 ? 'R' : (gear === 1 ? 'N' : gear - 1),
      powerHp, torque,
      inputs: { accel, brake, clutch, handbrake, steer },
      gForce: { x: gForceLat, y: gForceLon },
      acceleration,
      velocity,
      angularVelocity,
      timestamp: Date.now(), timestampMs, user_id: userId,
      position,
      orientation,
      suspension,
      suspensionVelocity,
      suspensionTravelMeters,
      tireTemp,
      tireSlipRatio,
      tireSlipAngle,
      tireCombinedSlip,
      wheelRotationSpeed,
      wheelOnRumbleStrip,
      wheelInPuddleDepth,
      surfaceRumble,
      carOrdinal,
      carClass,
      carPerformanceIndex,
      drivetrainType,
      numCylinders,
      boost,
      fuel,
      distanceTraveled,
      bestLap,
      lastLap,
      currentLap,
      currentRaceTime,
      lapNumber,
      racePosition,
      normDrivingLine,
      normAIBrake
    };
  });

  // Libère le port UDP et le canal Realtime pour permettre un redémarrage propre.
  const shutdown = async () => {
    clearInterval(broadcastTimer);
    udpSocket.close();
    await supabase.removeChannel(telemetryChannel);
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  udpSocket.bind(5607, () => console.log('UDP en écoute sur 5607.'));
}

start().catch((error) => {
  console.error(`Démarrage interrompu : ${error.message}`);
  process.exit(1);
});
