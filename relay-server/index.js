require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const dgram = require('dgram');
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('Erreur critique : SUPABASE_URL et SUPABASE_ANON_KEY doivent être définies.');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const configPath = path.join(__dirname, 'config.json');

const ask = (question) => new Promise((resolve) => {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  terminal.question(question, (answer) => {
    terminal.close();
    resolve(answer.trim());
  });
});

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

async function start() {
  const userId = await authenticateRelay();
  const telemetryChannel = supabase.channel(`telemetry_${userId}`, { config: { private: true } });
  let realtimeReady = false;
  let latestTelemetry = null;
  let lastSentTelemetry = null;
  let sendInProgress = false;
  let lastLapTime = 0;
  const udpSocket = dgram.createSocket('udp4');

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

  udpSocket.on('message', async (msg) => {
    if (msg.length < 324 || msg.readInt32LE(0) !== 1) return;
    const isMotorsportDash = msg.length >= 331;
    const dashboardOffset = isMotorsportDash ? 0 : 12;
    const engineMaxRpm = msg.readFloatLE(8);
    const engineIdleRpm = msg.readFloatLE(12);
    const currentEngineRpm = msg.readFloatLE(16);
    const speed = msg.readFloatLE(244 + dashboardOffset) * 3.6;
    const powerHp = msg.readFloatLE(248 + dashboardOffset) / 745.7;
    const torque = msg.readFloatLE(252 + dashboardOffset);
    const gear = msg.readUInt8(307 + dashboardOffset);
    const accel = msg.readUInt8(303 + dashboardOffset);
    const brake = msg.readUInt8(304 + dashboardOffset);
    const steer = msg.readInt8(308 + dashboardOffset);
    const gForceLat = msg.readFloatLE(20) / 9.80665;
    const gForceLon = msg.readFloatLE(28) / 9.80665;
    const lastLap = msg.readFloatLE(288 + dashboardOffset);
    const fahrenheitToCelsius = (value) => (value - 32) * (5 / 9);
    const tireWear = isMotorsportDash ? {
      fl: msg.readFloatLE(314), fr: msg.readFloatLE(318),
      rl: msg.readFloatLE(322), rr: msg.readFloatLE(326)
    } : null;

    if (lastLap > 0 && lastLap !== lastLapTime) {
      lastLapTime = lastLap;
      const { error } = await supabase.from('laptimes').insert([{ lap_time: lastLap, user_id: userId }]);
      if (error) console.error(`Impossible d'enregistrer le tour : ${error.message}`);
    }

    latestTelemetry = {
      rpm: currentEngineRpm, maxRpm: engineMaxRpm, idleRpm: engineIdleRpm, speed,
      gear: gear === 0 ? 'R' : gear, powerHp, torque, inputs: { accel, brake, steer },
      gForce: { x: gForceLat, y: gForceLon }, timestamp: Date.now(), user_id: userId,
      suspension: { fl: msg.readFloatLE(68), fr: msg.readFloatLE(72), rl: msg.readFloatLE(76), rr: msg.readFloatLE(80) },
      tireTemp: {
        fl: fahrenheitToCelsius(msg.readFloatLE(256 + dashboardOffset)),
        fr: fahrenheitToCelsius(msg.readFloatLE(260 + dashboardOffset)),
        rl: fahrenheitToCelsius(msg.readFloatLE(264 + dashboardOffset)),
        rr: fahrenheitToCelsius(msg.readFloatLE(268 + dashboardOffset))
      },
      tireWear,
      tireSlip: {
        fl: msg.readFloatLE(180), fr: msg.readFloatLE(184),
        rl: msg.readFloatLE(188), rr: msg.readFloatLE(192)
      }
    };
  });

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
