export const analysisMetrics = ['rpm', 'speed', 'brake', 'steering', 'gForceX', 'gForceY'];

export const metricLabels = {
  rpm: 'RPM',
  speed: 'Vitesse',
  brake: 'Freinage',
  steering: 'Angle volant',
  gForceX: 'G latéral',
  gForceY: 'G longitudinal'
};

export const metricUnits = {
  rpm: 'RPM',
  speed: 'km/h',
  brake: '%',
  steering: '°',
  gForceX: 'G',
  gForceY: 'G'
};

export const FORZA_CLASSES = {
  0: { code: 'D',  piRange: [100, 400], speedFactor: 0.60, gFactor: 0.65 },
  1: { code: 'C',  piRange: [401, 500], speedFactor: 0.75, gFactor: 0.75 },
  2: { code: 'B',  piRange: [501, 600], speedFactor: 0.88, gFactor: 0.85 },
  3: { code: 'A',  piRange: [601, 700], speedFactor: 1.00, gFactor: 1.00 },
  4: { code: 'S1', piRange: [701, 800], speedFactor: 1.15, gFactor: 1.15 },
  5: { code: 'S2', piRange: [801, 900], speedFactor: 1.30, gFactor: 1.30 },
  6: { code: 'R',  piRange: [901, 998], speedFactor: 1.45, gFactor: 1.50 },
  7: { code: 'X',  piRange: [999, 999], speedFactor: 1.65, gFactor: 1.75 }
};

export const analysisProfiles = {
  f1: {
    name: 'Formule 1',
    description: 'Profil de piste orienté performance pure, avec forte montée en régime et très peu de marge sur la trajectoire.',
    attentionPoints: [
      'Régime moteur très élevé et très stable sur longue portion.',
      'Freinage tardif mais précis, avec forte charge latérale.',
      'Le moindre écart de trajectoire devient visible sur la charge latérale.'
    ],
    rpm: { ideal: 9000, min: 8000, max: 9800 },
    speed: { ideal: 180, min: 140, max: 220 },
    brake: { ideal: 35, min: 20, max: 70 },
    steering: { ideal: 12, min: 5, max: 25 },
    gForceX: { ideal: 1.2, min: 0.6, max: 2.1 },
    gForceY: { ideal: 1.0, min: 0.4, max: 1.8 }
  },
  rallye: {
    name: 'Rallye',
    description: 'Profil de roulage rapide sur terrain varié, avec beaucoup d’engagement au volant et forte gestion du freinage.',
    attentionPoints: [
      'Sérieux besoin de stabilité sous charge et de correction continue.',
      'Freinage très important pour gagner en vitesse de passage.',
      'Les variations de G latéral sont plus intenses que sur un profil route.'
    ],
    rpm: { ideal: 7000, min: 5200, max: 8600 },
    speed: { ideal: 120, min: 75, max: 175 },
    brake: { ideal: 55, min: 35, max: 90 },
    steering: { ideal: 30, min: 15, max: 55 },
    gForceX: { ideal: 1.8, min: 0.9, max: 3.0 },
    gForceY: { ideal: 1.3, min: 0.6, max: 2.4 }
  },
  crossCountry: {
    name: 'Cross country',
    description: 'Profil de terrain avec beaucoup de roulis, de traction et d’adaptation à la surface.',
    attentionPoints: [
      'Le régime moteur doit rester fluide pour éviter les coupures de traction.',
      'La vitesse moyenne est plus faible, mais la régularité est essentielle.',
      'Le freinage reste important, mais sur des phases plus longues.'
    ],
    rpm: { ideal: 5600, min: 4000, max: 7300 },
    speed: { ideal: 95, min: 65, max: 150 },
    brake: { ideal: 45, min: 30, max: 72 },
    steering: { ideal: 22, min: 10, max: 40 },
    gForceX: { ideal: 1.6, min: 0.8, max: 2.5 },
    gForceY: { ideal: 1.1, min: 0.5, max: 2.0 }
  },
  route: {
    name: 'Route',
    description: 'Profil de conduite régulière et stable, à privilégier pour une performance saine et reproductible.',
    attentionPoints: [
      'Le plus important est la régularité sur la ligne droite et en courbe.',
      'Le freinage doit rester maîtrisé et progressif.',
      'Le régime moteur doit rester au-dessus du ralenti sans surconsommer.'
    ],
    rpm: { ideal: 3400, min: 2300, max: 5200 },
    speed: { ideal: 100, min: 65, max: 150 },
    brake: { ideal: 28, min: 15, max: 55 },
    steering: { ideal: 14, min: 6, max: 25 },
    gForceX: { ideal: 0.9, min: 0.4, max: 1.6 },
    gForceY: { ideal: 0.8, min: 0.3, max: 1.5 }
  },
  drift: {
    name: 'Drift',
    description: 'Profil très agressif, centré sur le maintien de la voiture à l’angle avec un pilotage très décisif.',
    attentionPoints: [
      'Le braquage est très élevé et doit rester cohérent avec la vitesse.',
      'Le maintien en glissement demande une très forte maîtrise de la charge latérale.',
      'Le freinage doit être très précis pour éviter la perte de contrôle.'
    ],
    rpm: { ideal: 7200, min: 5200, max: 9200 },
    speed: { ideal: 75, min: 35, max: 110 },
    brake: { ideal: 28, min: 10, max: 55 },
    steering: { ideal: 40, min: 22, max: 70 },
    gForceX: { ideal: 2.4, min: 1.4, max: 3.5 },
    gForceY: { ideal: 1.8, min: 0.7, max: 2.6 }
  }
};

export const createProfileSnapshot = (profiles) => JSON.parse(JSON.stringify(profiles));

/**
 * Calibre un profil d'analyse selon la classe, le PI et les caractéristiques moteur du véhicule
 */
export const calibrateProfileForCar = (baseProfile, carData) => {
  const { carClass = 3, carPI = 650, maxRpm = 8000, idleRpm = 1000 } = carData;
  
  const classMeta = FORZA_CLASSES[carClass] || FORZA_CLASSES[3];
  const piFactor = Math.max(0.4, carPI / 650); // 650 = centre de la classe A
  const effectiveSpeedFactor = (classMeta.speedFactor + piFactor) / 2;
  const effectiveGFactor = (classMeta.gFactor + Math.sqrt(piFactor)) / 2;

  const calibrated = JSON.parse(JSON.stringify(baseProfile));

  // Ajustement du régime selon les caractéristiques réelles du moteur
  if (calibrated.rpm && maxRpm > idleRpm) {
    const usefulRange = maxRpm - idleRpm;
    const idealRatio = Math.min(0.95, baseProfile.rpm.ideal / 9000);
    const minRatio = Math.min(0.85, baseProfile.rpm.min / 9000);
    const maxRatio = Math.min(0.99, baseProfile.rpm.max / 9000);

    calibrated.rpm = {
      ideal: Math.round(idleRpm + usefulRange * idealRatio),
      min: Math.round(idleRpm + usefulRange * minRatio),
      max: Math.round(idleRpm + usefulRange * maxRatio)
    };
  }

  // Ajustement de la vitesse
  if (calibrated.speed) {
    calibrated.speed = {
      ideal: Math.round(baseProfile.speed.ideal * effectiveSpeedFactor),
      min: Math.round(baseProfile.speed.min * effectiveSpeedFactor),
      max: Math.round(baseProfile.speed.max * effectiveSpeedFactor)
    };
  }

  // Ajustement des forces G
  if (calibrated.gForceX) {
    calibrated.gForceX = {
      ideal: Number((baseProfile.gForceX.ideal * effectiveGFactor).toFixed(2)),
      min: Number((baseProfile.gForceX.min * effectiveGFactor).toFixed(2)),
      max: Number((baseProfile.gForceX.max * effectiveGFactor).toFixed(2))
    };
  }

  if (calibrated.gForceY) {
    calibrated.gForceY = {
      ideal: Number((baseProfile.gForceY.ideal * effectiveGFactor).toFixed(2)),
      min: Number((baseProfile.gForceY.min * effectiveGFactor).toFixed(2)),
      max: Number((baseProfile.gForceY.max * effectiveGFactor).toFixed(2))
    };
  }

  return calibrated;
};

/**
 * Génère l'ensemble des profils calibrés pour un véhicule donné
 */
export const getCarCalibratedProfiles = (carData, baseProfiles = analysisProfiles) => {
  const result = {};
  for (const [key, profile] of Object.entries(baseProfiles)) {
    result[key] = calibrateProfileForCar(profile, carData);
  }
  return result;
};

const METRIC_WEIGHTS = {
  steering: 2.0,
  gForceX: 1.8,
  gForceY: 1.2,
  rpm: 1.0,
  speed: 1.2,
  brake: 1.0
};

const computeMetricScore = (val, { ideal, min, max }) => {
  if (val === undefined || val === null || isNaN(val)) return 0;
  
  if (val >= min && val <= max) {
    const range = val < ideal ? ideal - min : max - ideal;
    return range === 0 ? 1 : 1 - Math.abs(val - ideal) / range;
  }
  
  const distanceOut = val < min ? min - val : val - max;
  const spread = max - min;
  return Math.max(0, 1 - (distanceOut / spread) - 0.2);
};

/**
 * Détecte le profil de conduite le plus adapté à partir de moyennes télémétriques
 */
export const detectVehicleProfile = (telemetryStats, profiles = analysisProfiles) => {
  const scores = {};
  const metrics = Object.keys(METRIC_WEIGHTS);

  for (const [key, profile] of Object.entries(profiles)) {
    let totalScore = 0;
    let totalWeight = 0;

    for (const metric of metrics) {
      if (profile[metric] && telemetryStats[metric] !== undefined) {
        const score = computeMetricScore(telemetryStats[metric], profile[metric]);
        const weight = METRIC_WEIGHTS[metric] || 1.0;
        
        totalScore += score * weight;
        totalWeight += weight;
      }
    }

    scores[key] = totalWeight > 0 ? Number((totalScore / totalWeight).toFixed(3)) : 0;
  }

  const detectedKey = Object.keys(scores).reduce((best, current) => 
    scores[current] > scores[best] ? current : best
  , Object.keys(scores)[0]);

  return {
    detectedKey,
    profile: profiles[detectedKey],
    confidence: Math.round(scores[detectedKey] * 100),
    scores
  };
};