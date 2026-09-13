// ============================================================
// calc.js — Moteur de calcul du profil charge-vitesse
//
// Reproduit fidèlement les formules du fichier Excel d'origine
// (onglets VITRUVE + CR VITRUVE) :
//   - régression linéaire vitesse = f(charge)   -> 1RM estimé
//   - régression quadratique puissance = f(charge) -> puissance max
//   - interpolation linéaire pour les zones d'entraînement
//
// Généralisé à N séries (le fichier d'origine était figé à 6).
// ============================================================

/**
 * Régression linéaire simple (moindres carrés).
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {{slope:number, intercept:number}}
 */
function linearRegression(xs, ys) {
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

/**
 * Régression quadratique (moindres carrés, degré 2) : y = a*x² + b*x + c.
 * Résolution du système normal 3x3 par élimination de Gauss.
 * Équivalent à la courbe de tendance polynomiale d'Excel utilisée
 * manuellement dans le fichier d'origine pour Puissance = f(Charge).
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {{a:number,b:number,c:number}}
 */
function quadraticRegression(xs, ys) {
  const n = xs.length;
  let S0 = n,
    S1 = 0,
    S2 = 0,
    S3 = 0,
    S4 = 0,
    T0 = 0,
    T1 = 0,
    T2 = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    const x2 = x * x;
    S1 += x;
    S2 += x2;
    S3 += x2 * x;
    S4 += x2 * x2;
    T0 += y;
    T1 += x * y;
    T2 += x2 * y;
  }
  // Système :
  // [S4 S3 S2] [a]   [T2]
  // [S3 S2 S1] [b] = [T1]
  // [S2 S1 S0] [c]   [T0]
  const M = [
    [S4, S3, S2, T2],
    [S3, S2, S1, T1],
    [S2, S1, S0, T0],
  ];
  const sol = solve3x3(M);
  if (!sol) return { a: 0, b: 0, c: 0 };
  const [a, b, c] = sol;
  return { a, b, c };
}

/** Élimination de Gauss pour un système 3x3 augmenté (3 lignes x 4 colonnes). */
function solve3x3(M) {
  const m = M.map((row) => row.slice());
  for (let col = 0; col < 3; col++) {
    // pivot
    let pivotRow = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(m[pivotRow][col]) < 1e-12) return null;
    [m[col], m[pivotRow]] = [m[pivotRow], m[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      for (let c = col; c < 4; c++) {
        m[r][c] -= factor * m[col][c];
      }
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

/**
 * Interpole la charge (kg) correspondant à une vitesse cible, à partir
 * des points mesurés (charge, vitesse). Reproduit MATCH(...,-1) + INDEX
 * d'Excel (interpolation linéaire entre les deux points encadrants).
 * Retourne la chaîne "hors plage" si la vitesse cible sort de l'intervalle
 * mesuré, comme dans le fichier d'origine.
 * @param {{load:number, velocity:number}[]} points
 * @param {number} targetVelocity
 * @returns {number|"hors plage"}
 */
function interpolateLoadAtVelocity(points, targetVelocity) {
  // Tri par vitesse décroissante (charge croissante), comme dans le
  // tableau VITRUVE d'origine.
  const sorted = points.slice().sort((a, b) => b.velocity - a.velocity);
  const velocities = sorted.map((p) => p.velocity);
  const vMax = Math.max(...velocities);
  const vMin = Math.min(...velocities);
  const eps = 1e-9;
  if (targetVelocity > vMax + eps || targetVelocity < vMin - eps) {
    return "hors plage";
  }
  // Trouve la paire de points encadrant targetVelocity (liste décroissante).
  for (let i = 0; i < sorted.length - 1; i++) {
    const v1 = sorted[i].velocity;
    const v2 = sorted[i + 1].velocity;
    if (
      (targetVelocity <= v1 && targetVelocity >= v2) ||
      (targetVelocity >= v1 && targetVelocity <= v2)
    ) {
      if (v1 === v2) return sorted[i].load;
      const t = (targetVelocity - v1) / (v2 - v1);
      return sorted[i].load + t * (sorted[i + 1].load - sorted[i].load);
    }
  }
  // Cas limite (valeur exactement égale à un point mesuré)
  const exact = sorted.find((p) => Math.abs(p.velocity - targetVelocity) < eps);
  return exact ? exact.load : "hors plage";
}

/**
 * Calcule le profil complet charge-vitesse pour une séance.
 *
 * @param {Array<{load_kg:number, mcv_ms:number, power_w:number}>} sets
 * @param {number|null} bodyweightKg
 * @param {number} mvt  Seuil de vitesse minimale (m/s) retenu pour l'exercice
 * @returns {object} profil complet (voir structure ci-dessous)
 */
function computeVbtProfile(sets, bodyweightKg, mvt) {
  const loads = sets.map((s) => Number(s.load_kg));
  const velocities = sets.map((s) => Number(s.mcv_ms));
  const powers = sets.map((s) => Number(s.power_w));

  const { slope, intercept } = linearRegression(loads, velocities);

  // F16 — Absolute 1RM = (MVT - intercept) / slope
  const abs1RM = slope !== 0 ? (mvt - intercept) / slope : null;
  const rel1RM = abs1RM && bodyweightKg ? abs1RM / bodyweightKg : null;

  // V0 (vitesse à charge nulle) / L0 (charge à vitesse nulle)
  const v0 = intercept;
  const l0 = slope !== 0 ? -intercept / slope : null;

  const vMinMeasured = Math.min(...velocities);
  const vMaxMeasured = Math.max(...velocities);
  const deltaV = sets.length > 1 ? (vMaxMeasured - vMinMeasured) / (sets.length - 1) : null;

  // Charge et puissance à puissance maximale — méthode théorique à partir de
  // la droite charge-vitesse (et non d'un ajustement quadratique sur les
  // points de puissance mesurés).
  //
  // Pourquoi : avec seulement quelques séries, la puissance mesurée par série
  // est bruitée (variation technique, fatigue, mesure du capteur...). Ajuster
  // une parabole directement sur ces quelques points bruités peut donner une
  // courbe qui n'a pas de vrai sommet exploitable (ex: un sommet situé à une
  // charge supérieure au 1RM, ce qui est physiquement impossible). C'est la
  // même limite que dans le fichier Excel d'origine, où ce point nécessitait
  // un contrôle visuel du coach sur le graphique avant de retenir l'équation.
  //
  // On utilise à la place la relation théorique classique en musculation
  // charge-vitesse (modèle Puissance = Force × Vitesse, avec Force ≈
  // Charge × g, et une relation charge-vitesse linéaire — cf. Samozino,
  // Jaric & Markovic) : pour une droite vitesse = f(charge), la puissance
  // Charge×g×Vitesse(Charge) est elle-même une parabole dont le sommet est
  // toujours bien défini, à charge = L0/2 et vitesse = V0/2. Résultat
  // beaucoup plus stable que l'ajustement direct sur les points mesurés, et
  // toujours calculable dès lors que la droite charge-vitesse est valide
  // (pente négative — la vitesse diminue quand la charge augmente).
  const G = 9.81;
  let loadAtMaxPower = null;
  let pctRMatMaxPower = null;
  let powerAtPeak = null;
  let velocityAtPeak = null;
  let relMaxPowerOutput = null;
  const maxPowerReliable = slope < 0;
  if (maxPowerReliable) {
    loadAtMaxPower = l0 / 2;
    velocityAtPeak = v0 / 2;
    powerAtPeak = G * loadAtMaxPower * velocityAtPeak;
    pctRMatMaxPower = abs1RM ? loadAtMaxPower / abs1RM : null;
    relMaxPowerOutput = bodyweightKg ? powerAtPeak / bodyweightKg : null;
  }

  // Zones d'entraînement (méthode % vitesse max — Morin & Samozino)
  const points = sets.map((s) => ({ load: Number(s.load_kg), velocity: Number(s.mcv_ms) }));
  const zoneDefs = [
    { name: "Vitesse maximale", vMinFactor: 0.9, vMaxFactor: 1.0 },
    { name: "Vitesse de puissance", vMinFactor: 0.7, vMaxFactor: 0.9 },
    { name: "Puissance maximale", vMinFactor: 0.5, vMaxFactor: 0.7 },
    { name: "Force-vitesse", vMinFactor: 0.3, vMaxFactor: 0.5 },
    { name: "Force maximale", vMinFactor: null, vMaxFactor: 0.3 },
  ];

  const trainingZones = zoneDefs.map((z, idx) => {
    const isLast = idx === zoneDefs.length - 1;
    const vMin = isLast ? mvt : z.vMinFactor * vMaxMeasured;
    const vMax = z.vMaxFactor * vMaxMeasured;
    const loadMax = isLast ? abs1RM : interpolateLoadAtVelocity(points, vMin);
    const loadMin = interpolateLoadAtVelocity(points, vMax);
    const pctMax = typeof loadMax === "number" && abs1RM ? loadMax / abs1RM : null;
    const pctMin = typeof loadMin === "number" && abs1RM ? loadMin / abs1RM : null;
    return { name: z.name, vMin, vMax, loadMax, loadMin, pctMax, pctMin };
  });

  return {
    regression: { slope, intercept },
    abs1RM,
    rel1RM,
    v0,
    l0,
    vMinMeasured,
    vMaxMeasured,
    deltaV,
    mvtUsed: mvt,
    maxPowerReliable,
    loadAtMaxPower,
    pctRMatMaxPower,
    maxPowerOutput: powerAtPeak,
    relMaxPowerOutput,
    velocityAtPeak,
    trainingZones,
  };
}

window.VbtCalc = {
  linearRegression,
  quadraticRegression,
  interpolateLoadAtVelocity,
  computeVbtProfile,
};
