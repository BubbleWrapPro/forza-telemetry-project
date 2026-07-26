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
