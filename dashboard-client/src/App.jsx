import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css'; // S'assurer d'y définir background-color: #121212; color: #ffffff;

// Connexion au serveur relais local. 
// Remplacer localhost par l'IP de la machine Windows si consultation depuis un smartphone/tablette.
const socket = io(' https://swirl-charm-preface.ngrok-free.dev');

function App() {
  const [telemetry, setTelemetry] = useState({ rpm: 0, speed: 0, gear: 0, gForce: { x: 0, y: 0 } });
  
  // Utilisation de useRef pour le canvas du G-Meter (Heatmap créative)
  const canvasRef = useRef(null);

  useEffect(() => {
    socket.on('telemetry', (data) => {
      setTelemetry(data);
      drawGMeter(data.gForce);
    });
    return () => socket.off('telemetry');
  }, []);

  // Fonctionnalité créative : Dessin d'un point G-Force en temps réel
  const drawGMeter = (gForce) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const scale = 50; // Multiplicateur pour étendre le point sur le canvas

    // Effacement fluide pour effet de traînée
    ctx.fillStyle = 'rgba(18, 18, 18, 0.2)'; // Fond sombre avec opacité
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.arc(centerX + gForce.x * scale, centerY - gForce.y * scale, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#ff3366';
    ctx.fill();
  };

  return (
    <div style={{ backgroundColor: '#121212', minHeight: '100vh', color: '#fff', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Dashboard Télémétrique</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
        
        {/* Module Vitesse et Régime Moteur */}
        <div style={{ backgroundColor: '#1e1e1e', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>
          <h2>Vitesse</h2>
          <div style={{ fontSize: '4rem', fontWeight: 'bold' }}>
            {Math.round(telemetry.speed)} <span style={{ fontSize: '1.5rem' }}>km/h</span>
          </div>
          <div style={{ fontSize: '2rem', marginTop: '1rem', color: '#aaa' }}>
            Rapport : {telemetry.gear}
          </div>
          <div style={{ width: '100%', height: '20px', backgroundColor: '#333', marginTop: '2rem', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min((telemetry.rpm / 8500) * 100, 100)}%`, height: '100%', backgroundColor: telemetry.rpm > 7500 ? '#ff3366' : '#00cc99', transition: 'width 0.1s linear' }} />
          </div>
          <p style={{ marginTop: '0.5rem' }}>{Math.round(telemetry.rpm)} RPM</p>
        </div>

        {/* Module G-Meter (Créatif) */}
        <div style={{ backgroundColor: '#1e1e1e', padding: '2rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2>G-Force</h2>
          <canvas ref={canvasRef} width={250} height={250} style={{ border: '2px solid #333', borderRadius: '50%', marginTop: '1rem', backgroundColor: '#121212' }} />
        </div>

      </div>
    </div>
  );
}

export default App;