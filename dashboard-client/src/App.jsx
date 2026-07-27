import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';
import { analysisProfiles, analysisMetrics, metricLabels, metricUnits, createProfileSnapshot } from './analysisProfiles';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
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

const customProfileStorageKey = 'forza-custom-profile-v1';
const customMetricsStorageKey = 'forza-custom-metrics-v1';

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
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [telemetry, setTelemetry] = useState({
    rpm: 0,
    maxRpm: 8000,
    idleRpm: 1000,
    speed: 0,
    gear: 0,
    powerHp: 0,
    torque: 0,
    inputs: { accel: 0, brake: 0, steer: 0 },
    gForce: { x: 0, y: 0 }
  });

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
  const canvasRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const telemetryRef = useRef(telemetry);
  const renderTelemetryTimerRef = useRef(null);
  const lastTelemetryRenderRef = useRef(0);
  const gMeterFrameRef = useRef(null);
  const latestGForceRef = useRef(telemetry.gForce);
  const isRecordingRef = useRef(isRecording);
  const sessionData = useRef([]);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      const { data: { session: restoredSession } } = await supabase.auth.getSession();
      if (active) {
        setSession(restoredSession);
        setAuthLoading(false);
      }
    };

    restoreSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

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
  };

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

  useEffect(() => {
    drawGMeter(telemetry.gForce);
  }, [telemetry.gForce]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(customMetricsStorageKey, JSON.stringify(customMetrics));
    }
  }, [customMetrics]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(customProfileStorageKey, JSON.stringify(customProfile));
    }
  }, [customProfile]);

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
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
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
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX + x * scale, centerY - y * scale, 7, 0, 2 * Math.PI);
    ctx.fillStyle = '#ff3366';
    ctx.fill();
  };

  const rpmPercent = Math.max(0, ((telemetry.rpm - telemetry.idleRpm) / (telemetry.maxRpm - telemetry.idleRpm)) * 100);
  const throttlePercent = Math.round((telemetry.inputs.accel / 255) * 100);
  const brakePercent = Math.round((telemetry.inputs.brake / 255) * 100);
  const steeringAngle = Math.round(telemetry.inputs.steer);
  const gForce = telemetry.gForce || { x: 0, y: 0 };
  const speed = telemetry.speed || 0;
  const powerHp = telemetry.powerHp || 0;

  const engineLoad = Math.min(100, Math.round((rpmPercent * 0.6) + ((powerHp / 800) * 40)));
  const tireStress = Math.min(100, Math.round(((Math.abs(gForce.x) + Math.abs(gForce.y)) * 35) + (brakePercent * 0.3) + (throttlePercent * 0.2)));
  const suspensionLoad = Math.min(100, Math.round(((Math.abs(gForce.x) + Math.abs(gForce.y)) * 45) + ((speed / 200) * 20) + ((Math.abs(steeringAngle) / 90) * 15)));
  const thermalStress = Math.min(100, Math.round((rpmPercent * 0.55) + ((powerHp / 800) * 45)));

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

  const temperatureColor = (temperature) => {
    if (!Number.isFinite(temperature)) return 'rgba(71, 85, 105, 0.72)';
    if (temperature < 65) return '#38bdf8';
    if (temperature < 85) return '#22c55e';
    if (temperature < 105) return '#facc15';
    return '#f87171';
  };
  const wheelTemps = [
    { name: 'AV G', value: telemetry.tireTemp?.fl, wearValue: telemetry.tireWear?.fl, slipValue: telemetry.tireSlip?.fl },
    { name: 'AV D', value: telemetry.tireTemp?.fr, wearValue: telemetry.tireWear?.fr, slipValue: telemetry.tireSlip?.fr },
    { name: 'AR G', value: telemetry.tireTemp?.rl, wearValue: telemetry.tireWear?.rl, slipValue: telemetry.tireSlip?.rl },
    { name: 'AR D', value: telemetry.tireTemp?.rr, wearValue: telemetry.tireWear?.rr, slipValue: telemetry.tireSlip?.rr }
  ].map((wheel) => ({
    ...wheel,
    current: Number.isFinite(wheel.value) ? wheel.value : null,
    wear: Number.isFinite(wheel.wearValue) ? Math.max(0, Math.min(1, wheel.wearValue)) : null,
    slip: Number.isFinite(wheel.slipValue) ? Math.abs(wheel.slipValue) : null
  }));

  const suspensionTravel = [
    { name: 'AV G', value: telemetry.suspension?.fl },
    { name: 'AV D', value: telemetry.suspension?.fr },
    { name: 'AR G', value: telemetry.suspension?.rl },
    { name: 'AR D', value: telemetry.suspension?.rr }
  ].map((corner) => ({ ...corner, current: Number.isFinite(corner.value) ? corner.value : null }));

  const availableWheelTemps = wheelTemps.filter((wheel) => wheel.current !== null);
  const avgTemp = availableWheelTemps.length
    ? Math.round(availableWheelTemps.reduce((sum, wheel) => sum + wheel.current, 0) / availableWheelTemps.length)
    : null;
  const maxSuspensionTravel = suspensionTravel.some((corner) => corner.current !== null)
    ? Math.round(Math.max(...suspensionTravel.filter((corner) => corner.current !== null).map((corner) => corner.current)) * 100)
    : null;
  const severelyWornTires = wheelTemps.filter((wheel) => wheel.wear !== null && wheel.wear >= 0.75);
  const wornTires = wheelTemps.filter((wheel) => wheel.wear !== null && wheel.wear >= 0.5 && wheel.wear < 0.75);
  const overheatedTires = wheelTemps.filter((wheel) => wheel.current !== null && wheel.current >= 105);
  const hotTires = wheelTemps.filter((wheel) => wheel.current !== null && wheel.current >= 95 && wheel.current < 105);
  const slidingTires = wheelTemps.filter((wheel) => wheel.slip !== null && wheel.slip >= 1);
  const unstableTires = wheelTemps.filter((wheel) => wheel.slip !== null && wheel.slip >= 0.75 && wheel.slip < 1);
  const compressedSuspension = suspensionTravel.filter((corner) => corner.current !== null && corner.current >= 0.98);
  const loadedSuspension = suspensionTravel.filter((corner) => corner.current !== null && corner.current >= 0.9 && corner.current < 0.98);
  const componentAlerts = [
    ...technicalAlerts,
    severelyWornTires.length ? `Usure pneus critique : ${severelyWornTires.map((wheel) => `${wheel.name} ${Math.round(wheel.wear * 100)}%`).join(', ')}.` : null,
    wornTires.length ? `Usure pneus à surveiller : ${wornTires.map((wheel) => `${wheel.name} ${Math.round(wheel.wear * 100)}%`).join(', ')}.` : null,
    overheatedTires.length ? `Surchauffe pneus : ${overheatedTires.map((wheel) => `${wheel.name} ${Math.round(wheel.current)}°C`).join(', ')}.` : null,
    hotTires.length ? `Pneus chauds : ${hotTires.map((wheel) => `${wheel.name} ${Math.round(wheel.current)}°C`).join(', ')}.` : null,
    slidingTires.length ? `Perte d'adhérence détectée : ${slidingTires.map((wheel) => wheel.name).join(', ')}.` : null,
    unstableTires.length ? `Adhérence à surveiller : ${unstableTires.map((wheel) => wheel.name).join(', ')}.` : null,
    compressedSuspension.length ? `Talonnage probable : ${compressedSuspension.map((corner) => corner.name).join(', ')} à pleine compression.` : null,
    loadedSuspension.length ? `Suspension proche de la butée : ${loadedSuspension.map((corner) => corner.name).join(', ')}.` : null
  ].filter(Boolean);

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

  const resetCustomProfile = () => {
    setCustomMetrics(defaultCustomMetrics);
    setCustomProfile(defaultCustomProfile);
  };

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

  const exportToCSV = () => {
    const data = sessionData.current;
    if (data.length === 0) return;

    const headers = 'Timestamp,Speed_Kmh,RPM,Gear,Susp_FL,Susp_FR,Temp_FL_C,Temp_FR_C\n';
    const rows = data.map((d) => {
      return `${d.timestamp},${d.speed.toFixed(1)},${d.rpm.toFixed(0)},${d.gear},${d.suspension?.fl?.toFixed(3) || ''},${d.suspension?.fr?.toFixed(3) || ''},${d.tireTemp?.fl?.toFixed(1) || ''},${d.tireTemp?.fr?.toFixed(1) || ''}`;
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

  if (!session) {
    return (
      <div className="dashboard-shell auth-shell">
        <form className="auth-panel" onSubmit={handleAuthSubmit}>
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
          <h2>Statut de connexion</h2>
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
          <button type="button" className="ghost-btn" onClick={handleSignOut}>Déconnexion</button>
          <h1>Dashboard télémétrique</h1>
        </div>
        <div className={`status-pill ${offlineMode ? 'offline-status' : ''}`}>{offlineMode ? 'Mode hors ligne' : 'Données live'}</div>
      </header>

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
          <div>
            <span>Points enregistrés</span>
            <strong>{captureSummary.points}</strong>
          </div>
          <div>
            <span>Pic RPM</span>
            <strong>{Math.round(captureSummary.maxRpm)} RPM</strong>
          </div>
          <div>
            <span>Vitesse max</span>
            <strong>{Math.round(captureSummary.maxSpeed)} km/h</strong>
          </div>
          <div>
            <span>Changements marqués</span>
            <strong>{captureSummary.bigChanges}</strong>
          </div>
          <div>
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
              style={{ width: `${Math.min(rpmPercent, 100)}%`, backgroundColor: rpmPercent > 90 ? '#ff3366' : '#00cc99' }}
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
        </section>

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
              <span className="metric-label">RPM max</span>
              <strong>{Math.round(telemetry.maxRpm)}</strong>
            </div>
            <div className="metric-box">
              <span className="metric-label">Ralentit</span>
              <strong>{Math.round(telemetry.idleRpm)} RPM</strong>
            </div>
          </div>
        </section>

        <section className="card card-inputs">
          <div className="card-header">
            <h2>Inputs pilote</h2>
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
          </div>

          <p className="input-summary">Volant {steeringAngle}° • Gaz {throttlePercent}% • Frein {brakePercent}%</p>
        </section>

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
            </div>
          </div>
        </section>

        <section className="card card-tech">
          <div className="card-header">
            <h2>Diagnostic technique</h2>
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
                    <small>{wheel.wear === null ? 'Usure : non disponible' : `Usure : ${Math.round(wheel.wear * 100)}%`}</small>
                  </div>
                ))}
              </div>
              <p className="heatmap-legend">Bleu : froid · vert : optimal · jaune : chaud · rouge : surchauffe</p>
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
                    <small>{corner.current === null ? 'en attente' : `${corner.current.toFixed(3)} normalisé`}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

export default App;
