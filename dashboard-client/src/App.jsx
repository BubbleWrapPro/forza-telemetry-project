/**
 * Tableau de bord de télémétrie.
 *
 * Responsabilités : authentifier l'utilisateur, recevoir son flux Realtime,
 * afficher les mesures live et produire des analyses/captures locales. Le format
 * de télémétrie est produit par relay-server/index.js.
 */
import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';
import { analysisProfiles, analysisMetrics, metricLabels, metricUnits, createProfileSnapshot } from './analysisProfiles';

// Les variables Vite sont publiques côté navigateur ; ne jamais placer ici une clé de service Supabase.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
// Valeurs initiales du profil local. Elles servent aussi de schéma de secours lors d'une migration de localStorage.
const defaultCustomMetrics = {
  rpm: true,
  speed: true,
  brake: true,
  steering: true,
  gForceX: true,
  gForceY: true
};

const defaultCustomProfile = {
  name: 'Personnalisé',
  description: 'Profil établi par l’utilisateur avec des métriques et seuils sur mesure.',
  attentionPoints: ['Ajustez ce profil selon votre voiture et votre stratégie.'],
  rpm: { ideal: 7000, min: 5000, max: 9000 },
  speed: { ideal: 140, min: 80, max: 180 },
  brake: { ideal: 35, min: 18, max: 70 },
  steering: { ideal: 20, min: 10, max: 45 },
  gForceX: { ideal: 1.4, min: 0.8, max: 2.5 },
  gForceY: { ideal: 1.1, min: 0.5, max: 2.1 }
};

// Incrémenter la version si la structure stockée localement devient incompatible.
const customProfileStorageKey = 'forza-custom-profile-v1';
const customMetricsStorageKey = 'forza-custom-metrics-v1';
const widgetVisibilityStorageKey = 'forza-widget-visibility-v1';

const defaultWidgetVisibility = {
  transmission: true,
  engine: true,
  inputs: true,
  gforce: true,
  diagnostics: true,
  raceInfo: true,
  chassis: true,
  wheelExpert: true,
  carInfo: true
};

// Fusionne les données persistées avec les valeurs par défaut pour tolérer les profils créés avec une ancienne version.
const buildCustomProfileState = (savedValue) => {
  const nextProfile = { ...defaultCustomProfile, ...(savedValue || {}) };
  analysisMetrics.forEach((metric) => {
    nextProfile[metric] = {
      ...defaultCustomProfile[metric],
      ...(savedValue?.[metric] || {})
    };
  });
  return nextProfile;
};

const buildCustomMetricsState = (savedValue) => ({ ...defaultCustomMetrics, ...(savedValue || {}) });

function App() {
  // État d'authentification et du formulaire de connexion.
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState('landing'); // 'landing', 'auth', 'dashboard'
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  // Dernier état rendu à l'écran. Les paquets bruts sont gardés dans telemetryRef pour éviter un rendu par paquet.
  const [telemetry, setTelemetry] = useState({
    isRaceOn: 0,
    rpm: 0, maxRpm: 8000, idleRpm: 1000, speed: 0,
    gear: 0, powerHp: 0, torque: 0,
    inputs: { accel: 0, brake: 0, clutch: 0, handbrake: 0, steer: 0 },
    gForce: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    orientation: { yaw: 0, pitch: 0, roll: 0 },
    suspension: { fl: 0, fr: 0, rl: 0, rr: 0 },
    suspensionVelocity: { fl: 0, fr: 0, rl: 0, rr: 0 },
    suspensionTravelMeters: { fl: 0, fr: 0, rl: 0, rr: 0 },
    tireTemp: { fl: 0, fr: 0, rl: 0, rr: 0 },
    tireSlipRatio: { fl: 0, fr: 0, rl: 0, rr: 0 },
    tireSlipAngle: { fl: 0, fr: 0, rl: 0, rr: 0 },
    tireCombinedSlip: { fl: 0, fr: 0, rl: 0, rr: 0 },
    wheelRotationSpeed: { fl: 0, fr: 0, rl: 0, rr: 0 },
    wheelOnRumbleStrip: { fl: false, fr: false, rl: false, rr: false },
    wheelInPuddleDepth: { fl: 0, fr: 0, rl: 0, rr: 0 },
    surfaceRumble: { fl: 0, fr: 0, rl: 0, rr: 0 },
    carOrdinal: 0, carClass: 0, carPerformanceIndex: 0, drivetrainType: 0, numCylinders: 0,
    boost: 0, fuel: 0, distanceTraveled: 0, bestLap: 0, lastLap: 0, currentLap: 0, currentRaceTime: 0,
    lapNumber: 0, racePosition: 0, normDrivingLine: 0, normAIBrake: 0
  });

  const [visibleWidgets, setVisibleWidgets] = useState(() => {
    if (typeof window === 'undefined') return defaultWidgetVisibility;
    try {
      const stored = window.localStorage.getItem(widgetVisibilityStorageKey);
      return stored ? { ...defaultWidgetVisibility, ...JSON.parse(stored) } : defaultWidgetVisibility;
    } catch {
      return defaultWidgetVisibility;
    }
  });

  const [showCustomizer, setShowCustomizer] = useState(false);

  // Données de capture et paramètres d'analyse, indépendants de l'enregistrement CSV haute fréquence.
  const [captureActive, setCaptureActive] = useState(false);
  const [captureData, setCaptureData] = useState([]);
  const [analysisType, setAnalysisType] = useState('f1');
  const [analysisReport, setAnalysisReport] = useState([]);
  const [captureStatus, setCaptureStatus] = useState('Prêt à capturer');
  const [connectionStatus, setConnectionStatus] = useState('pending');
  const [connectionMessage, setConnectionMessage] = useState('Connexion au serveur...');
  const [telemetryReceived, setTelemetryReceived] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedPoints, setRecordedPoints] = useState(0);
  const [profiles] = useState(() => createProfileSnapshot(analysisProfiles));
  const [customMetrics, setCustomMetrics] = useState(() => {
    if (typeof window === 'undefined') return defaultCustomMetrics;
    try {
      const stored = window.localStorage.getItem(customMetricsStorageKey);
      return stored ? buildCustomMetricsState(JSON.parse(stored)) : defaultCustomMetrics;
    } catch {
      return defaultCustomMetrics;
    }
  });
  const [customProfile, setCustomProfile] = useState(() => {
    if (typeof window === 'undefined') return defaultCustomProfile;
    try {
      const stored = window.localStorage.getItem(customProfileStorageKey);
      return stored ? buildCustomProfileState(JSON.parse(stored)) : defaultCustomProfile;
    } catch {
      return defaultCustomProfile;
    }
  });
  const [showProfileDetails, setShowProfileDetails] = useState(false);
  const availableMetrics = analysisMetrics;
  // Refs mutables : elles évitent des fermetures obsolètes et des rendus coûteux dans les chemins temps réel.
  const canvasRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const telemetryRef = useRef(telemetry);
  const renderTelemetryTimerRef = useRef(null);
  const lastTelemetryRenderRef = useRef(0);
  const gMeterFrameRef = useRef(null);
  const latestGForceRef = useRef(telemetry.gForce);
  const isRecordingRef = useRef(isRecording);
  const sessionData = useRef([]);
  const [trackPoints, setTrackPoints] = useState([]);

  // Restaure la session au chargement puis suit les connexions/déconnexions sans fuite d'abonnement.
  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      const { data: { session: restoredSession } } = await supabase.auth.getSession();
      if (active) {
        setSession(restoredSession);
        if (restoredSession) setView('dashboard');
        setAuthLoading(false);
      }
    };

    restoreSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        if (nextSession) setView('dashboard');
        else if (view === 'dashboard') setView('landing');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Soumet indifféremment la connexion ou l'inscription selon le mode affiché.
  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthMessage('');

    const credentials = { email, password };
    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp(credentials);

    if (result.error) {
      setAuthMessage(result.error.message);
    } else if (authMode === 'register' && !result.data.session) {
      setAuthMessage('Inscription créée. Vérifiez votre e-mail pour confirmer votre compte.');
    }
    setAuthSubmitting(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setOfflineMode(false);
    setView('landing');
  };

  // Chaque utilisateur s'abonne uniquement à son canal privé telemetry_<userId>.
  // Le flux peut dépasser 60 Hz : le state React est limité à 10 Hz, alors que les refs restent à jour.
  useEffect(() => {
    if (!session?.user?.id) {
      setTelemetryReceived(false);
      setConnectionStatus('pending');
      return undefined;
    }

    const handleTelemetry = (data) => {
      if (data.user_id !== session?.user?.id) return;
      setTelemetryReceived(true);
      telemetryRef.current = data;
      latestGForceRef.current = data.gForce || { x: 0, y: 0 };
      setOfflineMode(false);

      // Le jeu peut envoyer plusieurs centaines de paquets par seconde. On garde
      // toutes les données utiles en ref, mais on limite le rendu de l'UI à 10 Hz.
      const now = Date.now();
      const elapsed = now - lastTelemetryRenderRef.current;
      const commitTelemetry = () => {
        lastTelemetryRenderRef.current = Date.now();
        renderTelemetryTimerRef.current = null;
        setTelemetry(telemetryRef.current);
      };
      if (elapsed >= 100) {
        if (renderTelemetryTimerRef.current) {
          clearTimeout(renderTelemetryTimerRef.current);
          renderTelemetryTimerRef.current = null;
        }
        commitTelemetry();
      } else if (!renderTelemetryTimerRef.current) {
        renderTelemetryTimerRef.current = setTimeout(commitTelemetry, 100 - elapsed);
      }

      if (!gMeterFrameRef.current) {
        gMeterFrameRef.current = requestAnimationFrame(() => {
          gMeterFrameRef.current = null;
          drawGMeter(latestGForceRef.current);
        });
      }
      if (isRecordingRef.current) {
        sessionData.current.push(data);
        setRecordedPoints((prev) => prev + 1);
      }
    };

    const handleConnect = () => {
      setConnectionStatus('connected');
      setConnectionMessage('Connexion établie avec le serveur de télémétrie.');
    };

    const handleDisconnect = () => {
      setConnectionStatus('disconnected');
      setConnectionMessage('Connexion perdue. Vérifie le serveur ou le jeu.');
    };

    const handleConnectError = () => {
      setConnectionStatus('error');
      setConnectionMessage('Impossible de se connecter au canal Supabase Realtime.');
    };

    const channel = supabase
      .channel(`telemetry_${session.user.id}`, { config: { private: true } })
      .on('broadcast', { event: 'telemetry_update' }, ({ payload }) => handleTelemetry(payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') handleConnect();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') handleConnectError();
        else if (status === 'CLOSED') handleDisconnect();
      });

    return () => {
      supabase.removeChannel(channel);
      if (renderTelemetryTimerRef.current) clearTimeout(renderTelemetryTimerRef.current);
      if (gMeterFrameRef.current) cancelAnimationFrame(gMeterFrameRef.current);
    };
  }, [session?.user?.id]);

  // Le canvas est impératif : le redessiner après un rendu couvre aussi le mode hors ligne.
  useEffect(() => {
    drawGMeter(telemetry.gForce);
  }, [telemetry.gForce]);

  // Historique visuel borné : assez dense pour situer un incident sans croître pendant une longue course.
  useEffect(() => {
    const { position } = telemetry;
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return;

    const onRumbleStrip = Object.values(telemetry.wheelOnRumbleStrip || {}).some(Boolean);
    const bottomingOut = !onRumbleStrip && Object.values(telemetry.suspension || {}).some((travel) => travel >= 0.98);
    const overheating = Object.values(telemetry.tireTemp || {}).some((temperature) => temperature >= 105);
    const alert = bottomingOut ? 'bottoming-out' : overheating ? 'overheating' : null;
    setTrackPoints((previous) => [...previous, { x: position.x, z: position.z, alert }].slice(-600));
  }, [telemetry]);

  // Rend l'état de l'enregistrement lisible par le gestionnaire Realtime sans le réabonner.
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Persistance navigateur uniquement : un échec de localStorage ne doit pas bloquer le tableau de bord.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(customMetricsStorageKey, JSON.stringify(customMetrics));
    }
  }, [customMetrics]);

  // Même règle de persistance pour les seuils personnalisés.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(customProfileStorageKey, JSON.stringify(customProfile));
    }
  }, [customProfile]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(widgetVisibilityStorageKey, JSON.stringify(visibleWidgets));
    }
  }, [visibleWidgets]);

  // La capture d'analyse échantillonne volontairement à 1 Hz, afin de garder un rapport compact et lisible.
  useEffect(() => {
    if (!captureActive) {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      return;
    }

    setCaptureStatus('Capture en cours…');
    captureIntervalRef.current = setInterval(() => {
      const currentTelemetry = telemetryRef.current;
      setCaptureData((prev) => {
        const nextPoint = {
          timestamp: Date.now(),
          rpm: currentTelemetry.rpm,
          speed: currentTelemetry.speed,
          powerHp: currentTelemetry.powerHp,
          torque: currentTelemetry.torque,
          accel: currentTelemetry.inputs.accel,
          brake: currentTelemetry.inputs.brake,
          steer: currentTelemetry.inputs.steer,
          gForceX: currentTelemetry.gForce?.x || 0,
          gForceY: currentTelemetry.gForce?.y || 0
        };

        return [...prev, nextPoint];
      });
    }, 1000);

    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, [captureActive]);

  // Dessine le G-mètre en bornant les valeurs à ±2,5 G pour conserver une échelle stable.
  const drawGMeter = (gForce = { x: 0, y: 0 }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxG = 2.5;
    const scale = 70 / maxG;
    const x = Math.max(-maxG, Math.min(maxG, Number(gForce.x) || 0));
    const y = Math.max(-maxG, Math.min(maxG, Number(gForce.y) || 0));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    [28, 56, 84].forEach((radius) => {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.moveTo(centerX - 88, centerY);
    ctx.lineTo(centerX + 88, centerY);
    ctx.moveTo(centerX, centerY - 88);
    ctx.lineTo(centerX, centerY + 88);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX + x * scale, centerY - y * scale, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#CFFF04'; // Primary Volt
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(207, 255, 4, 0.5)';
    ctx.fill();
    ctx.shadowBlur = 0;
  };

  const rpmPercent = Math.max(0, ((telemetry.rpm - telemetry.idleRpm) / (telemetry.maxRpm - telemetry.idleRpm)) * 100);
  const throttlePercent = Math.round((telemetry.inputs.accel / 255) * 100);
  const brakePercent = Math.round((telemetry.inputs.brake / 255) * 100);
  const steeringAngle = Math.round(telemetry.inputs.steer);
  const gForce = telemetry.gForce || { x: 0, y: 0 };
  const speed = telemetry.speed || 0;
  const powerHp = telemetry.powerHp || 0;

  const temperatureColor = (temperature) => {
    if (!Number.isFinite(temperature)) return 'rgba(148, 163, 184, 0.1)';
    if (temperature < 65) return '#00E5FF'; // Secondary Cyan
    if (temperature < 85) return '#00FF94'; // OK Green
    if (temperature < 105) return '#FFB800'; // Warning Gold
    return '#FF0055'; // Alert Red
  };

  // Normalise les données optionnelles du relais : null signifie « donnée non disponible », jamais zéro.
  const wheelTemps = [
    { key: 'fl', name: 'AV G', value: telemetry.tireTemp?.fl, slipRatioValue: telemetry.tireSlipRatio?.fl, slipAngleValue: telemetry.tireSlipAngle?.fl, combinedSlipValue: telemetry.tireCombinedSlip?.fl },
    { key: 'fr', name: 'AV D', value: telemetry.tireTemp?.fr, slipRatioValue: telemetry.tireSlipRatio?.fr, slipAngleValue: telemetry.tireSlipAngle?.fr, combinedSlipValue: telemetry.tireCombinedSlip?.fr },
    { key: 'rl', name: 'AR G', value: telemetry.tireTemp?.rl, slipRatioValue: telemetry.tireSlipRatio?.rl, slipAngleValue: telemetry.tireSlipAngle?.rl, combinedSlipValue: telemetry.tireCombinedSlip?.rl },
    { key: 'rr', name: 'AR D', value: telemetry.tireTemp?.rr, slipRatioValue: telemetry.tireSlipRatio?.rr, slipAngleValue: telemetry.tireSlipAngle?.rr, combinedSlipValue: telemetry.tireCombinedSlip?.rr }
  ].map((wheel) => ({
    ...wheel,
    current: Number.isFinite(wheel.value) ? wheel.value : null,
    slipRatio: Number.isFinite(wheel.slipRatioValue) ? Math.abs(wheel.slipRatioValue) : null,
    slipAngle: Number.isFinite(wheel.slipAngleValue) ? Math.abs(wheel.slipAngleValue) : null,
    combinedSlip: Number.isFinite(wheel.combinedSlipValue) ? Math.abs(wheel.combinedSlipValue) : null
  }));

  const suspensionTravel = [
    { name: 'AV G', value: telemetry.suspension?.fl, velocity: telemetry.suspensionVelocity?.fl },
    { name: 'AV D', value: telemetry.suspension?.fr, velocity: telemetry.suspensionVelocity?.fr },
    { name: 'AR G', value: telemetry.suspension?.rl, velocity: telemetry.suspensionVelocity?.rl },
    { name: 'AR D', value: telemetry.suspension?.rr, velocity: telemetry.suspensionVelocity?.rr }
  ].map((corner) => ({ ...corner, current: Number.isFinite(corner.value) ? corner.value : null, velocity: Number.isFinite(corner.velocity) ? corner.velocity : null }));

  // Indicateurs heuristiques destinés à l'interface, pas des diagnostics mécaniques mesurés.
  const engineLoad = Math.min(100, Math.round((rpmPercent * 0.6) + ((powerHp / 800) * 40)));
  const tireStress = Math.min(100, Math.round(((Math.abs(gForce.x) + Math.abs(gForce.y)) * 35) + (brakePercent * 0.3) + (throttlePercent * 0.2)));
  const suspensionLoad = Math.min(100, Math.round(((Math.abs(gForce.x) + Math.abs(gForce.y)) * 45) + ((speed / 200) * 20) + ((Math.abs(steeringAngle) / 90) * 15)));

  // Utilise la température des pneus pour diverger de la sollicitation moteur brute.
  const avgTireTemp = wheelTemps.filter(w => w.current !== null).reduce((acc, w) => acc + w.current, 0) / (wheelTemps.filter(w => w.current !== null).length || 1);
  const thermalStress = Math.min(100, Math.round((avgTireTemp / 110) * 70 + (rpmPercent * 0.3)));

  const getStatus = (value, warn, critical) => {
    if (value >= critical) return { label: 'Critique', tone: 'critical' };
    if (value >= warn) return { label: 'Alerte', tone: 'warning' };
    return { label: 'OK', tone: 'ok' };
  };

  const engineStatus = getStatus(engineLoad, 60, 85);
  const tireStatus = getStatus(tireStress, 60, 85);
  const suspensionStatus = getStatus(suspensionLoad, 60, 85);
  const thermalStatus = getStatus(thermalStress, 60, 85);

  const technicalAlerts = [
    engineStatus.label !== 'OK' ? `Moteur ${engineStatus.label.toLowerCase()} : ${engineLoad}% de sollicitation.` : null,
    tireStatus.label !== 'OK' ? `Pneus ${tireStatus.label.toLowerCase()} : ${tireStress}% de stress.` : null,
    suspensionStatus.label !== 'OK' ? `Suspension ${suspensionStatus.label.toLowerCase()} : ${suspensionLoad}% de charge.` : null,
    thermalStatus.label !== 'OK' ? `Thermique ${thermalStatus.label.toLowerCase()} : ${thermalStress}% de charge.` : null
  ].filter(Boolean);

  const availableWheelTemps = wheelTemps.filter((wheel) => wheel.current !== null);
  const avgTemp = availableWheelTemps.length
    ? Math.round(availableWheelTemps.reduce((sum, wheel) => sum + wheel.current, 0) / availableWheelTemps.length)
    : null;
  const maxSuspensionTravel = suspensionTravel.some((corner) => corner.current !== null)
    ? Math.round(Math.max(...suspensionTravel.filter((corner) => corner.current !== null).map((corner) => corner.current)) * 100)
    : null;
  const onRumbleStrip = Object.values(telemetry.wheelOnRumbleStrip || {}).some(Boolean);
  const overheatedTires = wheelTemps.filter((wheel) => wheel.current !== null && wheel.current >= 105);
  const hotTires = wheelTemps.filter((wheel) => wheel.current !== null && wheel.current >= 95 && wheel.current < 105);
  const slidingTires = wheelTemps.filter((wheel) => wheel.combinedSlip !== null && wheel.combinedSlip >= 1);
  const unstableTires = wheelTemps.filter((wheel) => wheel.combinedSlip !== null && wheel.combinedSlip >= 0.75 && wheel.combinedSlip < 1);
  const compressedSuspension = onRumbleStrip ? [] : suspensionTravel.filter((corner) => corner.current !== null && corner.current >= 0.98);
  const loadedSuspension = suspensionTravel.filter((corner) => corner.current !== null && corner.current >= 0.9 && corner.current < 0.98);
  const rearWheelspin = wheelTemps.filter((wheel) => ['rl', 'rr'].includes(wheel.key) && wheel.slipRatio !== null && wheel.slipRatio > 1);
  const frontSlipAngle = wheelTemps.filter((wheel) => ['fl', 'fr'].includes(wheel.key) && wheel.slipAngle !== null);
  const rearSlipAngle = wheelTemps.filter((wheel) => ['rl', 'rr'].includes(wheel.key) && wheel.slipAngle !== null);
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const frontSlipAngleAverage = average(frontSlipAngle.map((wheel) => wheel.slipAngle));
  const rearSlipAngleAverage = average(rearSlipAngle.map((wheel) => wheel.slipAngle));
  const understeerDetected = Math.abs(gForce.x) >= 0.4 && frontSlipAngleAverage !== null && rearSlipAngleAverage !== null && frontSlipAngleAverage > rearSlipAngleAverage + 0.15;
  const frontCompressionVelocity = Math.max(0, ...suspensionTravel.slice(0, 2).map((corner) => corner.velocity || 0));
  const frontReboundVelocity = Math.min(0, ...suspensionTravel.slice(0, 2).map((corner) => corner.velocity || 0));
  const pitchDegrees = (telemetry.orientation?.pitch || 0) * (180 / Math.PI);
  const rollDegrees = (telemetry.orientation?.roll || 0) * (180 / Math.PI);
  const yawDegrees = (telemetry.orientation?.yaw || 0) * (180 / Math.PI);

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return '--:--.---';
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return `${mins}:${secs.padStart(6, '0')}`;
  };

  const carClasses = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
  const drivetrainTypes = ['FWD', 'RWD', 'AWD'];
  const excessiveRoll = Math.abs(gForce.x) >= 0.5 && Math.abs(rollDegrees) >= 8;
  const componentAlerts = [
    ...technicalAlerts,
    rearWheelspin.length && throttlePercent >= 55 ? `Patinage arrière : ${rearWheelspin.map((wheel) => wheel.name).join(', ')}. Réduisez le verrouillage à l'accélération du différentiel ou assouplissez les ressorts arrière.` : null,
    understeerDetected ? `Sous-virage probable : l'angle de glissement avant (${frontSlipAngleAverage.toFixed(2)}) dépasse l'arrière (${rearSlipAngleAverage.toFixed(2)}). Augmentez l'appui avant ou assouplissez l'ARB avant.` : null,
    frontCompressionVelocity > 3 && brakePercent >= 55 && !onRumbleStrip ? `Plongée au freinage : compression avant rapide (${frontCompressionVelocity.toFixed(1)}/s). Durcissez légèrement le bump avant.` : null,
    frontReboundVelocity < -3 && !onRumbleStrip ? `Détente avant rapide (${Math.abs(frontReboundVelocity).toFixed(1)}/s) : ajustez le rebound pour aider la roue à rester en contact après une bosse.` : null,
    excessiveRoll ? `Roulis élevé (${rollDegrees.toFixed(1)}°) sous ${Math.abs(gForce.x).toFixed(2)} G latéral : durcissez globalement les barres anti-roulis.` : null,
    overheatedTires.length ? `Surchauffe pneus : ${overheatedTires.map((wheel) => `${wheel.name} ${Math.round(wheel.current)}°C`).join(', ')}.` : null,
    hotTires.length ? `Pneus chauds : ${hotTires.map((wheel) => `${wheel.name} ${Math.round(wheel.current)}°C`).join(', ')}.` : null,
    slidingTires.length ? `Perte d'adhérence détectée : ${slidingTires.map((wheel) => wheel.name).join(', ')}.` : null,
    unstableTires.length ? `Adhérence à surveiller : ${unstableTires.map((wheel) => wheel.name).join(', ')}.` : null,
    compressedSuspension.length ? `Talonnage probable : ${compressedSuspension.map((corner) => corner.name).join(', ')} à pleine compression.` : null,
    loadedSuspension.length ? `Suspension proche de la butée : ${loadedSuspension.map((corner) => corner.name).join(', ')}.` : null
  ].filter(Boolean);

  // Résumé calculé depuis la capture à 1 Hz ; les seuils de « changements marquants » sont des heuristiques UX.
  const trackBounds = trackPoints.reduce((bounds, point) => ({ minX: Math.min(bounds.minX, point.x), maxX: Math.max(bounds.maxX, point.x), minZ: Math.min(bounds.minZ, point.z), maxZ: Math.max(bounds.maxZ, point.z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const projectTrackPoint = (point) => {
    const padding = 12;
    return {
      x: padding + ((point.x - trackBounds.minX) / Math.max(trackBounds.maxX - trackBounds.minX, 1)) * 256,
      y: padding + ((point.z - trackBounds.minZ) / Math.max(trackBounds.maxZ - trackBounds.minZ, 1)) * 156
    };
  };
  const trackPath = trackPoints.length > 1 ? trackPoints.map((point, index) => { const projected = projectTrackPoint(point); return `${index === 0 ? 'M' : 'L'} ${projected.x} ${projected.y}`; }).join(' ') : '';

  const captureSummary = captureData.length === 0
    ? { points: 0, maxRpm: 0, maxSpeed: 0, maxBrake: 0, maxSteer: 0, maxGx: 0, maxGy: 0, bigChanges: 0 }
    : {
        points: captureData.length,
        maxRpm: Math.max(...captureData.map((point) => point.rpm)),
        maxSpeed: Math.max(...captureData.map((point) => point.speed)),
        maxBrake: Math.max(...captureData.map((point) => point.brake)),
        maxSteer: Math.max(...captureData.map((point) => Math.abs(point.steer))),
        maxGx: Math.max(...captureData.map((point) => Math.abs(point.gForceX))),
        maxGy: Math.max(...captureData.map((point) => Math.abs(point.gForceY))),
        bigChanges: captureData.reduce((count, point, index) => {
          const prev = captureData[index - 1];
          if (!prev) return count;
          const changed = Math.abs(point.rpm - prev.rpm) > 200 || Math.abs(point.speed - prev.speed) > 20 || Math.abs(point.brake - prev.brake) > 15 || Math.abs(point.gForceX - prev.gForceX) > 0.3 || Math.abs(point.gForceY - prev.gForceY) > 0.3;
          return count + (changed ? 1 : 0);
        }, 0)
      };

  const courseProfiles = profiles;

  // Réinitialise aussi les métriques activées pour préserver la cohérence du profil personnalisé.
  const resetCustomProfile = () => {
    setCustomMetrics(defaultCustomMetrics);
    setCustomProfile(defaultCustomProfile);
  };

  /** Compare la moyenne et les pics de la capture avec les plages du profil choisi. */
  const analyzeCapture = () => {
    if (captureData.length < 3) {
      setAnalysisReport([{ title: 'Pas assez de données', detail: 'Capture au moins 3 points significatifs avant l’analyse.', severity: 'warning' }]);
      return;
    }

    const profile = analysisType === 'custom' ? customProfile : courseProfiles[analysisType];
    const metricsToCheck = analysisType === 'custom'
      ? availableMetrics.filter((metric) => customMetrics[metric])
      : availableMetrics;

    const averages = {
      rpm: captureData.reduce((sum, point) => sum + point.rpm, 0) / captureData.length,
      speed: captureData.reduce((sum, point) => sum + point.speed, 0) / captureData.length,
      brake: captureData.reduce((sum, point) => sum + point.brake, 0) / captureData.length,
      steering: captureData.reduce((sum, point) => sum + Math.abs(point.steer), 0) / captureData.length,
      gForceX: captureData.reduce((sum, point) => sum + point.gForceX, 0) / captureData.length,
      gForceY: captureData.reduce((sum, point) => sum + point.gForceY, 0) / captureData.length
    };

    const peaks = {
      rpm: captureSummary.maxRpm,
      speed: captureSummary.maxSpeed,
      brake: captureSummary.maxBrake,
      steering: captureSummary.maxSteer,
      gForceX: captureSummary.maxGx,
      gForceY: captureSummary.maxGy
    };

    const details = [];
    const addFinding = (title, detail, severity) => details.push({ title, detail, severity });

    if (metricsToCheck.length === 0) {
      addFinding('Aucune métrique sélectionnée', 'Active au moins une métrique dans le profil personnalisé pour lancer une comparaison utile.', 'warning');
    }

    const formatValue = (metric, value) => `${metricLabels[metric]} ${typeof value === 'number' ? Math.round(value * (metric.includes('G') ? 100 : 1)) / (metric.includes('G') ? 100 : 1) : value} ${metricUnits[metric]}`;

    metricsToCheck.forEach((metric) => {
      const range = profile[metric];
      if (!range) return;
      const value = averages[metric];
      const peak = peaks[metric];

      if (value < range.min) {
        const severity = (range.min - value) / range.min > 0.18 ? 'critical' : 'warning';
        let detail = `Moyenne ${formatValue(metric, value)} sous la cible minimale ${formatValue(metric, range.min)}.`;
        if (metric === 'rpm') {
          detail = `Moteur sous-utilisé : ${formatValue(metric, value)} moyen. Considérez un rapport plus court ou une montée en régime plus précoce.`;
        } else if (metric === 'speed') {
          detail = `Vitesse moyenne ${formatValue(metric, value)} trop basse, probablement un tracé lent ou un rapport mal adapté.`;
        } else if (metric === 'brake') {
          detail = `Freinage trop léger pour ce profil : ${formatValue(metric, value)}. Vous pouvez gagner en stabilité et en vitesse en chargeant mieux la phase de freinage.`;
        } else if (metric === 'steering') {
          detail = `Angle de braquage moyen ${formatValue(metric, value)} faible : manque d’engagement dans les enchaînements serrés.`;
        } else if (metric === 'gForceX') {
          detail = `Charge latérale moyenne ${formatValue(metric, value)} faible : vous n’exploitez pas pleinement les appuis en virage.`;
        } else if (metric === 'gForceY') {
          detail = `Charge longitudinale moyenne ${formatValue(metric, value)} faible : l’accélération/freinage est trop progressive.`;
        }
        addFinding(`${metricLabels[metric]} trop bas`, `${detail} Pic ${formatValue(metric, peak)}.`, severity);
      } else if (value > range.max) {
        const severity = (value - range.max) / range.max > 0.18 ? 'critical' : 'warning';
        let detail = `Moyenne ${formatValue(metric, value)} au-dessus de la cible maximale ${formatValue(metric, range.max)}.`;
        if (metric === 'rpm') {
          detail = `Régime moteur trop élevé en permanence : ${formatValue(metric, value)} moyen. Vérifiez les points de passage et le rapport final.`;
        } else if (metric === 'speed') {
          detail = `Vitesse moyenne ${formatValue(metric, value)} trop élevée pour une trajectoire propre. Risque de sortie de piste ou de sous-virage.`;
        } else if (metric === 'brake') {
          detail = `Freinage agressif détecté : ${formatValue(metric, value)} moyen. Surveillez la température des disques et la stabilité du freinage.`;
        } else if (metric === 'steering') {
          detail = `Trop de braquage moyen ${formatValue(metric, value)} : possible survirage ou besoin de correction.`;
        } else if (metric === 'gForceX') {
          detail = `Charge latérale élevée ${formatValue(metric, value)} : le châssis travaille fort, vérifier l’équilibre des pneus et l’appui.`;
        } else if (metric === 'gForceY') {
          detail = `Charge longitudinale élevée ${formatValue(metric, value)} : danger de blocage ou patinage sous freinage/accélération.`;
        }
        addFinding(`${metricLabels[metric]} trop haut`, `${detail} Pic ${formatValue(metric, peak)}.`, severity);
      } else {
        addFinding(`${metricLabels[metric]} dans la fenêtre`, `${formatValue(metric, value)} est bien aligné avec le profil ${profile.name}.`, 'ok');
      }
    });

    if (captureSummary.bigChanges > 8) {
      addFinding('Variations de pilotage marquées', `Le jeu de données contient ${captureSummary.bigChanges} changements brusques. Contrôlez le freinage et la charge pour stabiliser le produit.`, 'critical');
    } else if (captureSummary.bigChanges > 4) {
      addFinding('Profil instable', `Il y a ${captureSummary.bigChanges} variations importantes. Recherchez une conduite plus lissée pour améliorer la constance.`, 'warning');
    }

    if (details.length === 0) {
      addFinding('Analyse propre', `Le segment est cohérent avec le profil ${profile.name}. Passe à l’ajustement de la configuration ou augmente l’agressivité du pilotage.`, 'ok');
    }

    setAnalysisReport(details);
  };

  /** Analyse l'enregistrement brut utilisé pour l'export, séparément de la capture d'analyse. */
  const analyzeSession = () => {
    const data = sessionData.current;
    if (data.length === 0) return;

    const report = [];
    const maxRpm = Math.max(...data.map((d) => d.rpm));
    const engineRedline = data[0]?.maxRpm || 0;

    const hasSuspension = data.every((d) => d.suspension && d.suspension.fl != null && d.suspension.fr != null && d.suspension.rl != null && d.suspension.rr != null);
    const hasTireTemp = data.every((d) => d.tireTemp && d.tireTemp.fl != null && d.tireTemp.fr != null && d.tireTemp.rl != null && d.tireTemp.rr != null);

    const minSuspension = hasSuspension
      ? Math.min(...data.map((d) => Math.min(d.suspension.fl, d.suspension.fr, d.suspension.rl, d.suspension.rr)))
      : null;
    const maxTireTemp = hasTireTemp
      ? Math.max(...data.map((d) => Math.max(d.tireTemp.fl, d.tireTemp.fr, d.tireTemp.rl, d.tireTemp.rr)))
      : null;

    if (engineRedline && maxRpm < engineRedline * 0.85) {
      report.push({ type: 'warning', text: "Le moteur n'est pas exploité à fond. Raccourcissez le rapport de transmission final." });
    }

    if (hasSuspension) {
      if (minSuspension <= 0.05) {
        report.push({ type: 'danger', text: "Talonnage détecté (Châssis touche le sol). Augmentez la hauteur de caisse ou durcissez les ressorts/barres anti-roulis." });
      } else {
        report.push({ type: 'success', text: "Suspension saine, aucun talonnage critique." });
      }
    }

    if (hasTireTemp && maxTireTemp > 110) {
      report.push({ type: 'danger', text: `Surchauffe pneumatique (${Math.round(maxTireTemp)}°C). Baissez la pression des pneus ou réduisez l'angle de carrossage.` });
    }

    setAnalysisReport(report);
  };

  /** Exporte exclusivement les points enregistrés par l'utilisateur dans un CSV local. */
  const exportToCSV = () => {
    const data = sessionData.current;
    if (data.length === 0) return;

    const headers = 'Timestamp,Speed_Kmh,RPM,Gear,Position_X,Position_Y,Position_Z,Pitch_deg,Roll_deg,Susp_FL,Susp_FR,SuspVel_FL,SuspVel_FR,SlipRatio_RL,SlipRatio_RR,SlipAngle_FL,SlipAngle_FR,Temp_FL_C,Temp_FR_C\n';
    const rows = data.map((d) => {
      const degrees = (value) => Number.isFinite(value) ? (value * 180 / Math.PI).toFixed(2) : '';
      return `${d.timestamp},${d.speed.toFixed(1)},${d.rpm.toFixed(0)},${d.gear},${d.position?.x?.toFixed(2) || ''},${d.position?.y?.toFixed(2) || ''},${d.position?.z?.toFixed(2) || ''},${degrees(d.orientation?.pitch)},${degrees(d.orientation?.roll)},${d.suspension?.fl?.toFixed(3) || ''},${d.suspension?.fr?.toFixed(3) || ''},${d.suspensionVelocity?.fl?.toFixed(3) || ''},${d.suspensionVelocity?.fr?.toFixed(3) || ''},${d.tireSlipRatio?.rl?.toFixed(3) || ''},${d.tireSlipRatio?.rr?.toFixed(3) || ''},${d.tireSlipAngle?.fl?.toFixed(3) || ''},${d.tireSlipAngle?.fr?.toFixed(3) || ''},${d.tireTemp?.fl?.toFixed(1) || ''},${d.tireTemp?.fr?.toFixed(1) || ''}`;
    }).join('\n');

    const csvContent = `data:text/csv;charset=utf-8,${headers}${rows}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `telemetry_session_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // L'enregistrement conserve tous les paquets reçus : surveiller l'usage mémoire sur une longue session.
  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      analyzeSession();
      return;
    }

    sessionData.current = [];
    setRecordedPoints(0);
    setAnalysisReport([]);
    setIsRecording(true);
  };

  if (authLoading) {
    return <div className="dashboard-shell auth-shell"><p>Vérification de la session…</p></div>;
  }

  if (view === 'landing') {
    return (
      <div className="dashboard-shell landing-shell">
        <div className="landing-container">
          <header className="landing-header">
            <p className="eyebrow">Forza Telemetry Project</p>
            <h1>Pilotez avec les données. <br/>Gagnez avec la précision.</h1>
          </header>

          <main className="landing-content">
            <div className="hero-box card">
              <p className="hero-text">
                Un outil de télémétrie avancé conçu pour <strong>Forza Horizon 6</strong>.
                Visualisez chaque détail de votre véhicule en temps réel, de la température des pneus à la dynamique du châssis.
              </p>

              <div className="landing-actions">
                <button className="primary-btn big-btn" onClick={() => setView(session ? 'dashboard' : 'auth')}>
                  {session ? 'Aller au Dashboard' : 'Créer un compte / Connexion'}
                </button>
                <a
                  href="https://github.com/BubbleWrapPro/forza-telemetry-project/releases/download/official_release/Setup_Forza_Telemetry.exe"
                  className="ghost-btn big-btn download-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Télécharger l'Agent Local (v1.1.0)
                </a>
                <a href="https://github.com/BubbleWrapPro/forza-telemetry-project"
                className="ghost-btn big-btn"
                target="_blank"
                rel="noopener noreferrer"
                >
                Voir le code / Collaborer
                </a>
              </div>
            </div>

            <div className="feature-grid">
              <div className="feature-card card">
                <h3>📊 Temps Réel</h3>
                <p>Flux UDP haute fréquence traité instantanément et localement pour un feedback sans délai.</p>
              </div>
              <div className="feature-card card">
                <h3>⚙️ Analyse des données</h3>
                <p>Analyse poussée de vos données avec des conseils pour améliorer vos performances.</p>
              </div>
              <div className="feature-card card">
                <h3>🎨 Personnalisation</h3>
                <p>Personnaliser la vue de votre dashboard pour ne voir que les données qui vous intéresse.</p>
              </div>
            </div>

            <div className="how-it-works card">
              <h2>Comment ça marche ?</h2>
              <ol className="steps-list">
                <li>Créez votre compte sur cette plateforme.</li>
                <li>Téléchargez et lancez l'<strong>Agent Télémétrie Forza</strong> sur votre PC.</li>
                <li>Activez la <strong>Sortie de données (Data Out)</strong> dans les paramètres de Forza.</li>
                <li>Connectez votre agent local à votre compte</li>
                <li>Regardez vos chronos et lancer des analyses !</li>
              </ol>
            </div>
          </main>

          <footer className="landing-footer">
            <p>Optimisé pour Forza Horizon 6 • Développé par <a href="https://github.com/BubbleWrapPro" target="_blank" rel="noopener noreferrer">BubbleWrapPro</a> et <a href="https://github.com/XLpotatoLX" target="_blank" rel="noopener noreferrer">XLpotatoLX</a> </p>
          </footer>
        </div>
      </div>
    );
  }

  if (view === 'auth' && !session) {
    return (
      <div className="dashboard-shell auth-shell">
        <form className="auth-panel" onSubmit={handleAuthSubmit}>
          <button type="button" className="ghost-btn back-btn" onClick={() => setView('landing')}>← Accueil</button>
          <p className="eyebrow">Forza telemetry</p>
          <h1>{authMode === 'login' ? 'Connexion' : 'Créer un compte'}</h1>
          <p>Connectez-vous pour accéder uniquement à vos données de télémétrie.</p>
          <label htmlFor="auth-email">E-mail</label>
          <input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <label htmlFor="auth-password">Mot de passe</label>
          <input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength="6" required />
          {authMessage && <p className="auth-message" role="alert">{authMessage}</p>}
          <button className="primary-btn" type="submit" disabled={authSubmitting}>{authSubmitting ? 'Veuillez patienter…' : authMode === 'login' ? 'Se connecter' : 'S’inscrire'}</button>
          <button className="ghost-btn" type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthMessage(''); }}>
            {authMode === 'login' ? 'Créer un compte' : 'J’ai déjà un compte'}
          </button>
        </form>
      </div>
    );
  }

  if ((connectionStatus !== 'connected' || !telemetryReceived) && !offlineMode) {
    return (
      <div className="dashboard-shell connection-shell">
        <div className="connection-panel">
          <span className={`connection-pill ${connectionStatus}`}>{connectionStatus === 'connected' ? 'Connecté' : connectionStatus === 'pending' ? 'En attente' : 'Déconnecté'}</span>
          <h2 className="connection-title">Statut de connexion</h2>
          <p>{connectionMessage}</p>
          {connectionStatus === 'connected' && !telemetryReceived && (
            <p className="connection-detail">En attente des premières données du jeu. Le jeu n'est pas ouvert ou le relay-server ne reçoit pas les packets UDP.</p>
          )}
          {(connectionStatus === 'disconnected' || connectionStatus === 'error') && (
            <p className="connection-detail">Vérifier le serveur relay ou la connexion entre le jeu et ce poste avant de continuer.</p>
          )}
          <button type="button" className="primary-btn offline-access-btn" onClick={() => setOfflineMode(true)}>
            Accéder à l’interface hors ligne
          </button>
          <p className="connection-detail">Le mode hors ligne affiche des valeurs de démonstration à zéro : aucun test ni diagnostic n’est effectué en direct.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Forza telemetry</p>
          <div className="header-actions">
            <button type="button" className="ghost-btn" onClick={() => setShowCustomizer(!showCustomizer)}>Personnaliser</button>
            <button type="button" className="ghost-btn" onClick={handleSignOut}>Déconnexion</button>
          </div>
          <h1>Dashboard télémétrique</h1>
        </div>
        <div className={`status-pill ${offlineMode ? 'offline-status' : ''}`}>{offlineMode ? 'Mode hors ligne' : 'Données live'}</div>
      </header>

      {showCustomizer && (
        <div className="customizer-panel card">
          <div className="card-header">
            <h2>Personnalisation du tableau de bord</h2>
            <button className="ghost-btn" onClick={() => setShowCustomizer(false)}>Fermer</button>
          </div>
          <div className="customizer-grid">
            {Object.keys(defaultWidgetVisibility).map(key => (
              <label key={key} className="metric-toggle">
                <input
                  type="checkbox"
                  checked={visibleWidgets[key]}
                  onChange={() => setVisibleWidgets(prev => ({ ...prev, [key]: !prev[key] }))}
                />
                <span>{key === 'transmission' ? 'Transmission' :
                       key === 'engine' ? 'Moteur' :
                       key === 'inputs' ? 'Pilotage' :
                       key === 'gforce' ? 'G-Force' :
                       key === 'diagnostics' ? 'Diagnostic' :
                       key === 'raceInfo' ? 'Course' :
                       key === 'chassis' ? 'Châssis' :
                       key === 'wheelExpert' ? 'Expert Roues' :
                       key === 'carInfo' ? 'Véhicule' : key}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {offlineMode && (
        <div className="offline-banner" role="status">
          Mode hors ligne : le jeu ou le relay-server n’envoie aucune donnée. Les valeurs affichées ne sont pas des mesures live.
        </div>
      )}

      <div className="capture-panel">
        <div className="capture-controls">
          <div>
            <h2>Capture d’analyse</h2>
            <p>{captureStatus}</p>
          </div>
          <div className="capture-buttons">
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                if (captureActive) {
                  setCaptureActive(false);
                  setCaptureStatus('Capture arrêtée');
                } else {
                  setCaptureData([]);
                  setAnalysisReport([]);
                  setCaptureActive(true);
                  setCaptureStatus('Capture en cours…');
                }
              }}
            >
              {captureActive ? 'Arrêter la capture' : 'Démarrer la capture'}
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setCaptureData([]);
                setAnalysisReport([]);
                setCaptureStatus('Capture effacée');
              }}
            >
              Effacer la capture
            </button>
          </div>
        </div>

        <div className="capture-toolbar">
          <label>
            Type de course
            <select value={analysisType} onChange={(event) => setAnalysisType(event.target.value)}>
              <option value="f1">F1</option>
              <option value="rallye">Rallye</option>
              <option value="crossCountry">Cross country</option>
              <option value="route">Route</option>
              <option value="drift">Drift</option>
              <option value="custom">Profil personnalisé local</option>
            </select>
          </label>
          <div className="capture-toolbar-actions">
            <button type="button" className="ghost-btn" onClick={() => setShowProfileDetails(true)}>
              Voir le profil
            </button>
            <button type="button" className="primary-btn" onClick={analyzeCapture}>
              Lancer l’analyse
            </button>
          </div>
        </div>

        {analysisType === 'custom' && (
          <div className="custom-profile-panel">
            <div className="profile-panel-header">
              <div>
                <h3>Profil personnalisé local</h3>
                <p>Choisis les métriques à comparer et définis les plages de performance attendues. Les modifications sont sauvegardées localement sur cet appareil.</p>
              </div>
              <button type="button" className="ghost-btn" onClick={resetCustomProfile}>
                Réinitialiser
              </button>
            </div>

            <div className="profile-metric-grid">
              {availableMetrics.map((metric) => (
                <div key={metric} className="profile-metric-row">
                  <label className="metric-toggle">
                    <input
                      type="checkbox"
                      checked={customMetrics[metric]}
                      onChange={() => setCustomMetrics((prev) => ({ ...prev, [metric]: !prev[metric] }))}
                    />
                    <span>{metricLabels[metric]}</span>
                  </label>

                  <div className="metric-range-inputs">
                    <label>
                      Min
                      <input
                        type="number"
                        value={customProfile[metric].min}
                        onChange={(event) => setCustomProfile((prev) => ({
                          ...prev,
                          [metric]: { ...prev[metric], min: Number(event.target.value) }
                        }))}
                        disabled={!customMetrics[metric]}
                      />
                    </label>
                    <label>
                      Idéal
                      <input
                        type="number"
                        value={customProfile[metric].ideal}
                        onChange={(event) => setCustomProfile((prev) => ({
                          ...prev,
                          [metric]: { ...prev[metric], ideal: Number(event.target.value) }
                        }))}
                        disabled={!customMetrics[metric]}
                      />
                    </label>
                    <label>
                      Max
                      <input
                        type="number"
                        value={customProfile[metric].max}
                        onChange={(event) => setCustomProfile((prev) => ({
                          ...prev,
                          [metric]: { ...prev[metric], max: Number(event.target.value) }
                        }))}
                        disabled={!customMetrics[metric]}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showProfileDetails && (
          <div className="profile-details-sheet">
            <div className="profile-details-header">
              <div>
                <h3>{(analysisType === 'custom' ? customProfile : courseProfiles[analysisType])?.name}</h3>
                <p>{(analysisType === 'custom' ? customProfile : courseProfiles[analysisType])?.description}</p>
              </div>
              <button type="button" className="ghost-btn" onClick={() => setShowProfileDetails(false)}>Fermer</button>
            </div>
            <div className="profile-details-body">
              <div className="profile-spec-card">
                <h4>Points d’attention</h4>
                <ul>
                  {(analysisType === 'custom' ? customProfile.attentionPoints : courseProfiles[analysisType]?.attentionPoints || []).map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
              <div className="profile-spec-card">
                <h4>Seuils de comparaison</h4>
                <div className="profile-spec-grid">
                  {availableMetrics.map((metric) => {
                    const range = (analysisType === 'custom' ? customProfile : courseProfiles[analysisType])?.[metric];
                    if (!range) return null;
                    return (
                      <div key={metric} className="profile-spec-row">
                        <span>{metricLabels[metric]}</span>
                        <strong>{range.ideal} {metricUnits[metric]}</strong>
                        <small>min {range.min} • max {range.max}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="recording-toolbar">
          <button type="button" className={`secondary-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording}>
            {isRecording ? 'Arrêter l’enregistrement' : 'Démarrer l’enregistrement'}
          </button>
          <button type="button" className="ghost-btn" onClick={exportToCSV} disabled={recordedPoints === 0}>
            Exporter CSV
          </button>
          <span className="recording-meta">{recordedPoints} points enregistrés</span>
        </div>

        <div className="capture-summary">
          <div className="capture-summary-row">
            <span>Points enregistrés</span>
            <strong>{captureSummary.points}</strong>
          </div>
          <div className="capture-summary-row">
            <span>Pic RPM</span>
            <strong>{Math.round(captureSummary.maxRpm)} RPM</strong>
          </div>
          <div className="capture-summary-row">
            <span>Vitesse max</span>
            <strong>{Math.round(captureSummary.maxSpeed)} km/h</strong>
          </div>
          <div className="capture-summary-row">
            <span>Changements marqués</span>
            <strong>{captureSummary.bigChanges}</strong>
          </div>
          <div className="capture-summary-row">
            <span>Profil ciblé</span>
            <strong>{analysisType === 'custom' ? customProfile.name : courseProfiles[analysisType]?.name}</strong>
          </div>
        </div>
      </div>

      
      <section className="card analysis-card">
        <div className="card-header">
          <h2>Rapport d’analyse</h2>
          <span className="card-tag">Recommandations</span>
        </div>

        <div className="analysis-list">
          {analysisReport.length > 0 ? analysisReport.map((item) => (
            <div key={`${item.title}-${item.detail}`} className={`analysis-item ${item.severity || 'info'}`}>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
          )) : <p className="analysis-empty">Lancez une analyse après une capture pour obtenir un rapport.</p>}
        </div>
      </section>

      <div className="dashboard-grid">
        {visibleWidgets.transmission && (
          <section className="card card-hero">
            <div className="card-header">
              <h2>Transmission</h2>
              <span className="card-tag">Live</span>
            </div>

            <div className="hero-metrics">
              <div className="hero-speed">
                {Math.round(telemetry.speed)}
                <span>km/h</span>
              </div>
              <div className="hero-gear">{telemetry.gear}</div>
            </div>

            <div className="rpm-track">
              <div
                className="rpm-fill"
                style={{ width: `${Math.min(rpmPercent, 100)}%`, backgroundColor: rpmPercent > 90 ? '#FF0055' : '#CFFF04' }}
              />
            </div>

            <div className="hero-meta">
              <div>
                <span>RPM</span>
                <strong>{Math.round(telemetry.rpm)}</strong>
              </div>
              <div>
                <span>Puissance</span>
                <strong>{Math.round(telemetry.powerHp)} CH</strong>
              </div>
            </div>
            <div className="chassis-summary">
              <span>Tangage {pitchDegrees.toFixed(1)}°</span>
              <span>Roulis {rollDegrees.toFixed(1)}°</span>
              <span>Lacet {yawDegrees.toFixed(1)}°</span>
            </div>
            <div className="track-map-panel">
              <div className="expert-panel-header">
                <h3>Carte du trajet</h3>
                <span>{trackPoints.length ? `${trackPoints.length} positions` : 'En attente'}</span>
              </div>
              {trackPoints.length > 1 ? (
                <svg className="track-map" viewBox="0 0 280 180" role="img" aria-label="Trajet et incidents détectés">
                  <path d={trackPath} className="track-path" />
                  {trackPoints.filter((point) => point.alert).map((point, index) => {
                    const projected = projectTrackPoint(point);
                    return <circle key={`${point.x}-${point.z}-${index}`} cx={projected.x} cy={projected.y} r="3.5" className={`track-alert ${point.alert}`} />;
                  })}
                </svg>
              ) : <p className="track-map-empty">Roulez pour tracer le parcours. Les points rouges signalent un talonnage hors vibreur ou une surchauffe.</p>}
            </div>
          </section>
        )}

        {visibleWidgets.raceInfo && (
          <section className="card">
            <div className="card-header">
              <h2>Course & Session</h2>
              <span className="card-tag">Infos</span>
            </div>
            <div className="metric-grid">
              <div className="metric-box">
                <span className="metric-label">Position</span>
                <strong>{telemetry.racePosition || '-'}</strong>
              </div>
              <div className="metric-box">
                <span className="metric-label">Tour</span>
                <strong>{telemetry.lapNumber + 1}</strong>
              </div>
              <div className="metric-box">
                <span className="metric-label">Carburant</span>
                <strong>{Math.round(telemetry.fuel * 100)}%</strong>
              </div>
              <div className="metric-box">
                <span className="metric-label">Distance</span>
                <strong>{(telemetry.distanceTraveled / 1000).toFixed(2)} km</strong>
              </div>
              <div className="metric-box full-width">
                <span className="metric-label">Meilleur tour</span>
                <strong>{formatTime(telemetry.bestLap)}</strong>
              </div>
              <div className="metric-box full-width">
                <span className="metric-label">Tour actuel</span>
                <strong>{formatTime(telemetry.currentLap)}</strong>
              </div>
            </div>
          </section>
        )}

        {visibleWidgets.engine && (
          <section className="card">
            <div className="card-header">
              <h2>Moteur</h2>
              <span className="card-tag">Puissance</span>
            </div>

            <div className="metric-grid">
              <div className="metric-box">
                <span className="metric-label">Puissance</span>
                <strong>{Math.round(telemetry.powerHp)} CH</strong>
              </div>
              <div className="metric-box">
                <span className="metric-label">Couple</span>
                <strong>{Math.round(telemetry.torque)} Nm</strong>
              </div>
              <div className="metric-box">
                <span className="metric-label">Turbo / Boost</span>
                <strong>{telemetry.boost.toFixed(2)} bar</strong>
              </div>
              <div className="metric-box">
                <span className="metric-label">RPM max</span>
                <strong>{Math.round(telemetry.maxRpm)}</strong>
              </div>
            </div>
          </section>
        )}

        {visibleWidgets.carInfo && (
          <section className="card">
            <div className="card-header">
              <h2>Véhicule</h2>
              <span className="card-tag">Specs</span>
            </div>
            <div className="metric-grid">
              <div className="metric-box">
                <span className="metric-label">Classe</span>
                <strong>{carClasses[telemetry.carClass] || '-'}</strong>
              </div>
              <div className="metric-box">
                <span className="metric-label">PI</span>
                <strong>{telemetry.carPerformanceIndex}</strong>
              </div>
              <div className="metric-box">
                <span className="metric-label">Transmission</span>
                <strong>{drivetrainTypes[telemetry.drivetrainType] || '-'}</strong>
              </div>
              <div className="metric-box">
                <span className="metric-label">Cylindres</span>
                <strong>{telemetry.numCylinders}</strong>
              </div>
            </div>
          </section>
        )}

        {visibleWidgets.inputs && (
          <section className="card card-inputs">
            <div className="card-header">
              <h2>Poste de pilotage</h2>
              <span className="card-tag">Direction</span>
            </div>

            <div className="wheel-wrap">
              <div className="steering-wheel" style={{ transform: `rotate(${steeringAngle}deg)` }}>
                <div className="wheel-marker" />
              </div>
            </div>

            <div className="pedal-row">
              <div className="pedal-box">
                <div className="pedal-bar">
                  <div className="pedal-fill brake" style={{ height: `${brakePercent}%` }} />
                </div>
                <span>Frein</span>
              </div>
              <div className="pedal-box">
                <div className="pedal-bar">
                  <div className="pedal-fill accel" style={{ height: `${throttlePercent}%` }} />
                </div>
                <span>Gaz</span>
              </div>
              <div className="pedal-box">
                <div className="pedal-bar">
                  <div className="pedal-fill clutch" style={{ height: `${Math.round((telemetry.inputs.clutch / 255) * 100)}%` }} />
                </div>
                <span>Embray.</span>
              </div>
            </div>

            <p className="input-summary">Volant {steeringAngle}° • Frein à main {telemetry.inputs.handbrake > 0 ? 'ACTIF' : 'OFF'}</p>
          </section>
        )}

        {visibleWidgets.gforce && (
          <section className="card">
            <div className="card-header">
              <h2>G-Force</h2>
              <span className="card-tag">Dynamiques</span>
            </div>

            <div className="g-meter-wrap">
              <canvas ref={canvasRef} width={220} height={220} className="g-meter-canvas" />
              <p className="g-meter-legend">← charge latérale gauche · droite →<br />↑ / ↓ charge longitudinale · ±2,5 G</p>
              <div className="g-metric-list">
                <div className="g-metric-item">
                  <span>Latéral</span>
                  <strong>{gForce.x.toFixed(2)}</strong>
                </div>
                <div className="g-metric-item">
                  <span>Longitudinal</span>
                  <strong>{gForce.y.toFixed(2)}</strong>
                </div>
                <div className="g-metric-item">
                  <span>Vertical</span>
                  <strong>{(telemetry.acceleration.y / 9.80665).toFixed(2)}</strong>
                </div>
              </div>
            </div>
          </section>
        )}

        {visibleWidgets.chassis && (
          <section className="card">
            <div className="card-header">
              <h2>Châssis Avancé</h2>
              <span className="card-tag">Vitesse & Accel</span>
            </div>
            <div className="metric-grid">
              <div className="metric-box">
                <span className="metric-label">Vitesse X</span>
                <strong>{telemetry.velocity.x.toFixed(1)} m/s</strong>
              </div>
              <div className="metric-box">
                <span className="metric-label">Vitesse Y</span>
                <strong>{telemetry.velocity.y.toFixed(1)} m/s</strong>
              </div>
              <div className="metric-box">
                <span className="metric-label">Vitesse Z</span>
                <strong>{telemetry.velocity.z.toFixed(1)} m/s</strong>
              </div>
              <div className="metric-box">
                <span className="metric-label">Rotation Lacet</span>
                <strong>{telemetry.angularVelocity.y.toFixed(2)} rad/s</strong>
              </div>
            </div>
          </section>
        )}

        {visibleWidgets.diagnostics && (
          <section className="card card-tech">
            <div className="card-header">
              <h2>Diagnostic technique (utilisation)</h2>
              <span className="card-tag">Estimation live</span>
            </div>

            <div className="tech-diagnostic-grid">
              <div className={`diagnostic-card ${engineStatus.tone}`}>
                <span className="diagnostic-title">Moteur</span>
                <strong className="diagnostic-value">{engineLoad}%</strong>
                <p>{engineStatus.label}</p>
              </div>
              <div className={`diagnostic-card ${tireStatus.tone}`}>
                <span className="diagnostic-title">Pneus</span>
                <strong className="diagnostic-value">{tireStress}%</strong>
                <p>{tireStatus.label}</p>
              </div>
              <div className={`diagnostic-card ${suspensionStatus.tone}`}>
                <span className="diagnostic-title">Suspension</span>
                <strong className="diagnostic-value">{suspensionLoad}%</strong>
                <p>{suspensionStatus.label}</p>
              </div>
              <div className={`diagnostic-card ${thermalStatus.tone}`}>
                <span className="diagnostic-title">Thermique</span>
                <strong className="diagnostic-value">{thermalStress}%</strong>
                <p>{thermalStatus.label}</p>
              </div>
            </div>

            <div className="pit-wall-alerts">
              <h3>Alertes pit wall</h3>
              {componentAlerts.length > 0 ? (
                <ul>
                  {componentAlerts.map((alert) => (
                    <li key={alert}>{alert}</li>
                  ))}
                </ul>
              ) : (
                <p>Aucune alerte technique en cours.</p>
              )}
            </div>

            <div className="expert-panels">
              <div className="expert-panel">
                <div className="expert-panel-header">
                  <h3>Températures pneus</h3>
                  <span>{avgTemp === null ? 'En attente' : `${avgTemp}°C moyen`}</span>
                </div>
                <div className="tire-heatmap" aria-label="Heatmap des températures des pneus">
                  {wheelTemps.map((wheel) => (
                    <div key={wheel.name} className="tire-heatmap-cell" style={{ '--tire-temperature': temperatureColor(wheel.current) }}>
                      <span>{wheel.name}</span>
                      <strong>{wheel.current === null ? '—' : `${Math.round(wheel.current)}°C`}</strong>
                      <small>{wheel.slipRatio === null ? 'Glissement : en attente' : `Ratio ${wheel.slipRatio.toFixed(2)} · angle ${wheel.slipAngle?.toFixed(2) ?? '—'}`}</small>
                    </div>
                  ))}
                </div>
              </div>

              <div className="expert-panel">
                <div className="expert-panel-header">
                  <h3>Débattement suspension</h3>
                  <span>{maxSuspensionTravel === null ? 'En attente' : `${maxSuspensionTravel}% max`}</span>
                </div>
                <div className="expert-list">
                  {suspensionTravel.map((corner) => (
                    <div key={corner.name} className="expert-row">
                      <span>{corner.name}</span>
                      <strong>{corner.current === null ? '—' : `${Math.round(corner.current * 100)}%`}</strong>
                      <small>{corner.velocity === null ? 'vitesse : en attente' : `vitesse ${corner.velocity >= 0 ? '+' : ''}${corner.velocity.toFixed(2)}/s`}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {visibleWidgets.wheelExpert && (
          <section className="card">
            <div className="card-header">
              <h2>Expert Roues</h2>
              <span className="card-tag">Détails</span>
            </div>
            <div className="expert-list">
              {['fl', 'fr', 'rl', 'rr'].map(w => (
                <div key={w} className="expert-row">
                  <span>{w.toUpperCase()}</span>
                  <div className="expert-mini-grid">
                    <small>Eau: {Math.round(telemetry.wheelInPuddleDepth[w] * 100)}%</small>
                    <small>Rumble: {Math.round(telemetry.surfaceRumble[w] * 100)}%</small>
                    <small>Rot: {Math.round(telemetry.wheelRotationSpeed[w])} rad/s</small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default App;
