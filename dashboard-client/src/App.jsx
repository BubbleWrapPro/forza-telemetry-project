import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const ngrokUrl = import.meta.env.VITE_NGROK_URL;
const socket = io(ngrokUrl || undefined, {
  extraHeaders: {
    'ngrok-skip-browser-warning': 'true'
  }
});

function App() {
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordedPoints, setRecordedPoints] = useState(0);
  const canvasRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const telemetryRef = useRef(telemetry);
  const isRecordingRef = useRef(isRecording);
  const sessionData = useRef([]);

  useEffect(() => {
    const handleTelemetry = (data) => {
      setTelemetry(data);
      setTelemetryReceived(true);
      drawGMeter(data.gForce);
      telemetryRef.current = data;
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
      setConnectionMessage('Impossible de se connecter au serveur WebSocket.');
    };

    const handleError = () => {
      setConnectionStatus('error');
      setConnectionMessage('Erreur de communication WebSocket détectée.');
    };

    socket.on('telemetry', handleTelemetry);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('error', handleError);

    return () => {
      socket.off('telemetry', handleTelemetry);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('error', handleError);
    };
  }, []);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

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

  const drawGMeter = (gForce) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const scale = 50;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.arc(centerX, centerY, 70, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX + gForce.x * scale, centerY - gForce.y * scale, 6, 0, 2 * Math.PI);
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

  const wheelTemps = [
    { name: 'AV G', current: Math.max(60, Math.min(115, 72 + (tireStress / 8) + (speed / 12))), max: Math.max(80, Math.min(125, 90 + (tireStress / 6))) },
    { name: 'AV D', current: Math.max(60, Math.min(115, 74 + (tireStress / 7) + (speed / 14))), max: Math.max(80, Math.min(125, 92 + (tireStress / 6))) },
    { name: 'AR G', current: Math.max(60, Math.min(115, 70 + (tireStress / 9) + (speed / 11))), max: Math.max(80, Math.min(125, 88 + (tireStress / 5))) },
    { name: 'AR D', current: Math.max(60, Math.min(115, 73 + (tireStress / 8) + (speed / 13))), max: Math.max(80, Math.min(125, 91 + (tireStress / 6))) }
  ];

  const suspensionTemps = [
    { name: 'Avant', current: Math.max(45, Math.min(100, 55 + (suspensionLoad / 5) + (Math.abs(steeringAngle) / 8))), max: Math.max(60, Math.min(110, 70 + (suspensionLoad / 4))) },
    { name: 'Arrière', current: Math.max(45, Math.min(100, 58 + (suspensionLoad / 6) + (speed / 25))), max: Math.max(60, Math.min(110, 74 + (suspensionLoad / 4))) }
  ];

  const avgTemp = Math.round(wheelTemps.reduce((sum, wheel) => sum + wheel.current, 0) / wheelTemps.length);
  const peakTemp = Math.max(...wheelTemps.map((wheel) => wheel.max));

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

  const courseProfiles = {
    f1: {
      name: 'Formule 1',
      rpm: { ideal: 9000, min: 8000, max: 9800 },
      speed: { ideal: 180, min: 140, max: 220 },
      brake: { ideal: 35, min: 20, max: 70 },
      steering: { ideal: 12, min: 5, max: 25 },
      gForceX: { ideal: 1.2, min: 0.6, max: 2.1 },
      gForceY: { ideal: 1.0, min: 0.4, max: 1.8 }
    },
    rallye: {
      name: 'Rallye',
      rpm: { ideal: 6000, min: 4500, max: 7500 },
      speed: { ideal: 110, min: 70, max: 160 },
      brake: { ideal: 55, min: 30, max: 85 },
      steering: { ideal: 25, min: 10, max: 40 },
      gForceX: { ideal: 1.6, min: 0.8, max: 2.6 },
      gForceY: { ideal: 1.2, min: 0.5, max: 2.2 }
    },
    crossCountry: {
      name: 'Cross country',
      rpm: { ideal: 5000, min: 3500, max: 6800 },
      speed: { ideal: 95, min: 60, max: 140 },
      brake: { ideal: 40, min: 25, max: 70 },
      steering: { ideal: 18, min: 8, max: 35 },
      gForceX: { ideal: 1.4, min: 0.7, max: 2.3 },
      gForceY: { ideal: 1.0, min: 0.4, max: 1.8 }
    },
    route: {
      name: 'Route',
      rpm: { ideal: 3200, min: 2200, max: 4500 },
      speed: { ideal: 95, min: 60, max: 140 },
      brake: { ideal: 30, min: 15, max: 60 },
      steering: { ideal: 10, min: 5, max: 18 },
      gForceX: { ideal: 0.8, min: 0.4, max: 1.4 },
      gForceY: { ideal: 0.7, min: 0.3, max: 1.2 }
    },
    drift: {
      name: 'Drift',
      rpm: { ideal: 6500, min: 5000, max: 8000 },
      speed: { ideal: 80, min: 40, max: 120 },
      brake: { ideal: 25, min: 10, max: 45 },
      steering: { ideal: 35, min: 20, max: 55 },
      gForceX: { ideal: 2.0, min: 1.2, max: 3.0 },
      gForceY: { ideal: 1.3, min: 0.5, max: 2.2 }
    }
  };

  const shouldShowConnectionScreen = connectionStatus !== 'connected' || !telemetryReceived;

  const analyzeCapture = () => {
    if (captureData.length < 3) {
      setAnalysisReport([{ title: 'Pas assez de données', detail: 'Capture au moins 3 points significatifs avant l’analyse.', severity: 'warning' }]);
      return;
    }

    const profile = courseProfiles[analysisType];
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

    const findings = [];
    const addFinding = (title, detail, severity) => findings.push({ title, detail, severity });

    if (averages.rpm > profile.rpm.max || averages.rpm < profile.rpm.min) {
      addFinding('RPM hors cible', `Moyenne ${Math.round(averages.rpm)} RPM | pointe ${Math.round(peaks.rpm)} RPM, cible ${profile.rpm.ideal} RPM`, averages.rpm > profile.rpm.max ? 'warning' : 'info');
    }
    if (averages.speed > profile.speed.max || averages.speed < profile.speed.min) {
      addFinding('Vitesse hors cible', `Vitesse moy. ${Math.round(averages.speed)} km/h | pointe ${Math.round(peaks.speed)} km/h`, averages.speed > profile.speed.max ? 'warning' : 'info');
    }
    if (averages.brake > profile.brake.max || averages.brake < profile.brake.min) {
      addFinding('Freinage non adapté', `Freinage moyen ${Math.round(averages.brake)}% | pointe ${Math.round(peaks.brake)}%`, 'warning');
    }
    if (averages.steering > profile.steering.max || averages.steering < profile.steering.min) {
      addFinding('Entrée au volant hors cible', `Angle moyen ${Math.round(averages.steering)}° | pointe ${Math.round(peaks.steering)}°`, 'warning');
    }
    if (averages.gForceX > profile.gForceX.max || averages.gForceX < profile.gForceX.min) {
      addFinding('Charge latérale anormale', `G latéral moyen ${averages.gForceX.toFixed(2)} | pointe ${peaks.gForceX.toFixed(2)}`, 'warning');
    }
    if (averages.gForceY > profile.gForceY.max || averages.gForceY < profile.gForceY.min) {
      addFinding('Charge longitudinale anormale', `G long moyen ${averages.gForceY.toFixed(2)} | pointe ${peaks.gForceY.toFixed(2)}`, 'warning');
    }
    if (captureSummary.bigChanges > 8) {
      addFinding('Surtensions fréquentes', `Le profil montre ${captureSummary.bigChanges} changements marqués, à vérifier sur la gestion de charge et de freinage.`, 'critical');
    }

    if (findings.length === 0) {
      addFinding('Aucun point d’attention majeur', `Le profil enregistré semble cohérent avec ${profile.name}.`, 'ok');
    }

    setAnalysisReport(findings);
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

  if (connectionStatus !== 'connected' || !telemetryReceived) {
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
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Forza telemetry</p>
          <h1>Dashboard télémétrique</h1>
        </div>
        <div className="status-pill">Live data</div>
      </header>

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
            </select>
          </label>
          <button type="button" className="primary-btn" onClick={analyzeCapture}>
            Lancer l’analyse
          </button>
        </div>

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
            <strong>{courseProfiles[analysisType].name}</strong>
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
            {technicalAlerts.length > 0 ? (
              <ul>
                {technicalAlerts.map((alert) => (
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
                <span>{avgTemp}°C moyen</span>
              </div>
              <div className="expert-list">
                {wheelTemps.map((wheel) => (
                  <div key={wheel.name} className="expert-row">
                    <span>{wheel.name}</span>
                    <strong>{Math.round(wheel.current)}°C</strong>
                    <small>max {Math.round(wheel.max)}°C</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="expert-panel">
              <div className="expert-panel-header">
                <h3>Températures suspension</h3>
                <span>{peakTemp}°C max</span>
              </div>
              <div className="expert-list">
                {suspensionTemps.map((item) => (
                  <div key={item.name} className="expert-row">
                    <span>{item.name}</span>
                    <strong>{Math.round(item.current)}°C</strong>
                    <small>max {Math.round(item.max)}°C</small>
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