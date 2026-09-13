// ============================================================
// charts.js — Courbes Charge/Force-Vélocité et Puissance-Vélocité
//
// Deux rendus pour les mêmes données : SVG (affichage à l'écran) et
// dessin vectoriel jsPDF (export PDF). Palette et repères conformes au
// guide dataviz interne (2 séries -> légende, marques épaisseur 2px,
// axes discrets) : slot 1 (bleu #2a78d6) pour la courbe théorique,
// slot 2 (orange #eb6834) pour les points mesurés.
// ============================================================

const CHART_COLORS = {
  line: "#2a78d6", // théorique (slot 1)
  scatter: "#eb6834", // mesuré (slot 2)
  grid: "#d8d8d5",
  axis: "#8a8a86",
  text: "#3a3a38",
};

const G = 9.81;

/** Arrondit `max` à un palier "propre" et renvoie {max, step, ticks[]}. */
function niceScale(max, count = 5) {
  if (!Number.isFinite(max) || max <= 0) max = 1;
  const rawStep = max / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const niceResidual = [1, 2, 2.5, 5, 10].find((n) => n >= residual) || 10;
  const step = niceResidual * magnitude;
  const niceMax = step * count;
  const ticks = [];
  for (let i = 0; i <= count; i++) ticks.push(Math.round(i * step * 1000) / 1000);
  return { max: niceMax, step, ticks };
}

/**
 * Construit les données du profil Charge (Force) - Vélocité.
 * @param {object} profile résultat de VbtCalc.computeVbtProfile
 * @param {Array<{load_kg:number, mcv_ms:number}>} sets
 */
function buildForceVelocityChartData(profile, sets) {
  const v0 = profile.v0;
  const l0 = profile.l0;
  const scatter = sets.map((s) => ({ x: Number(s.mcv_ms), y: Number(s.load_kg) }));
  const xScale = niceScale(Math.max(v0, ...scatter.map((p) => p.x)) * 1.05);
  const yScale = niceScale(Math.max(l0, ...scatter.map((p) => p.y)) * 1.05);
  return {
    title: "Profil Charge-Vélocité (Force-Vélocité)",
    xLabel: "Vélocité (m/s)",
    yLabel: "Charge (kg)",
    xScale,
    yScale,
    line: { points: [{ x: 0, y: l0 }, { x: v0, y: 0 }], color: CHART_COLORS.line, label: "Droite théorique" },
    scatter: { points: scatter, color: CHART_COLORS.scatter, label: "Séries mesurées" },
  };
}

/**
 * Construit les données du profil Puissance - Vélocité (parabole
 * théorique P(v) = g × L(v) × v, où L(v) est la charge donnée par la
 * droite charge-vélocité à la vélocité v).
 */
function buildPowerVelocityChartData(profile, sets) {
  const v0 = profile.v0;
  const { slope, intercept } = profile.regression;
  const loadAtV = (v) => (v - intercept) / slope;
  const nPoints = 40;
  const curve = [];
  for (let i = 0; i <= nPoints; i++) {
    const v = (v0 * i) / nPoints;
    const load = loadAtV(v);
    curve.push({ x: v, y: G * load * v });
  }
  const scatter = sets.map((s) => ({ x: Number(s.mcv_ms), y: Number(s.power_w) }));
  const yMaxCandidate = Math.max(...curve.map((p) => p.y), ...scatter.map((p) => p.y || 0));
  const xScale = niceScale(Math.max(v0, ...scatter.map((p) => p.x)) * 1.05);
  const yScale = niceScale(yMaxCandidate * 1.15);
  return {
    title: "Profil Puissance-Vélocité",
    xLabel: "Vélocité (m/s)",
    yLabel: "Puissance (W)",
    xScale,
    yScale,
    line: { points: curve, color: CHART_COLORS.line, label: "Courbe théorique" },
    scatter: { points: scatter, color: CHART_COLORS.scatter, label: "Séries mesurées" },
  };
}

// ------------------------------------------------------------
// Rendu SVG (affichage à l'écran)
// ------------------------------------------------------------
function renderChartSVG(config, { width = 460, height = 300 } = {}) {
  const margin = { top: 46, right: 20, bottom: 44, left: 56 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const sx = (x) => margin.left + (x / config.xScale.max) * plotW;
  const sy = (y) => margin.top + plotH - (y / config.yScale.max) * plotH;

  const gridLines = config.yScale.ticks
    .map(
      (t) =>
        `<line x1="${margin.left}" y1="${sy(t)}" x2="${width - margin.right}" y2="${sy(t)}" stroke="${
          CHART_COLORS.grid
        }" stroke-width="1"/>` +
        `<text x="${margin.left - 8}" y="${sy(t) + 4}" text-anchor="end" font-size="11" fill="${
          CHART_COLORS.text
        }">${fmtTick(t)}</text>`
    )
    .join("");

  const xTicks = config.xScale.ticks
    .map(
      (t) =>
        `<text x="${sx(t)}" y="${height - margin.bottom + 18}" text-anchor="middle" font-size="11" fill="${
          CHART_COLORS.text
        }">${fmtTick(t)}</text>`
    )
    .join("");

  const linePath = config.line
    ? `<polyline points="${config.line.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}" fill="none" stroke="${
        config.line.color
      }" stroke-width="2.5"/>`
    : "";

  const scatterDots = config.scatter
    ? config.scatter.points
        .map((p) => `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="4.5" fill="${config.scatter.color}"/>`)
        .join("")
    : "";

  const legend = `
    <g transform="translate(${margin.left}, 32)">
      <line x1="0" y1="0" x2="16" y2="0" stroke="${config.line.color}" stroke-width="2.5"/>
      <text x="21" y="4" font-size="11" fill="${CHART_COLORS.text}">${config.line.label}</text>
      <circle cx="150" cy="0" r="4.5" fill="${config.scatter.color}"/>
      <text x="160" y="4" font-size="11" fill="${CHART_COLORS.text}">${config.scatter.label}</text>
    </g>
  `;

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${config.title}">
    <text x="${margin.left}" y="16" font-size="13" font-weight="600" fill="${CHART_COLORS.text}">${
    config.title
  }</text>
    ${legend}
    ${gridLines}
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="${
    CHART_COLORS.axis
  }" stroke-width="1"/>
    <line x1="${margin.left}" y1="${margin.top + plotH}" x2="${width - margin.right}" y2="${
    margin.top + plotH
  }" stroke="${CHART_COLORS.axis}" stroke-width="1"/>
    ${xTicks}
    ${linePath}
    ${scatterDots}
    <text x="${margin.left + plotW / 2}" y="${height - 6}" text-anchor="middle" font-size="11" fill="${
    CHART_COLORS.text
  }">${config.xLabel}</text>
    <text x="14" y="${margin.top + plotH / 2}" text-anchor="middle" font-size="11" fill="${
    CHART_COLORS.text
  }" transform="rotate(-90, 14, ${margin.top + plotH / 2})">${config.yLabel}</text>
  </svg>`;
}

function fmtTick(v) {
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (Math.abs(v) >= 10) return v.toFixed(1).replace(/\.0$/, "");
  return v.toFixed(2).replace(/0$/, "").replace(/\.$/, "");
}

// ------------------------------------------------------------
// Rendu jsPDF (export PDF) — mêmes données, tracé vectoriel
// ------------------------------------------------------------
function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Dessine le même graphique dans un document jsPDF, en mm.
 * @param {jsPDF} doc
 * @param {object} config voir build*ChartData
 * @param {{x:number,y:number,width:number,height:number}} box zone en mm
 */
function renderChartPdf(doc, config, box) {
  const margin = { top: 24, right: 6, bottom: 14, left: 16 };
  const plotX = box.x + margin.left;
  const plotY = box.y + margin.top;
  const plotW = box.width - margin.left - margin.right;
  const plotH = box.height - margin.top - margin.bottom;
  const sx = (x) => plotX + (x / config.xScale.max) * plotW;
  const sy = (y) => plotY + plotH - (y / config.yScale.max) * plotH;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...hexToRgb(CHART_COLORS.text));
  doc.text(config.title, box.x, box.y + 5);

  // Légende
  doc.setDrawColor(...hexToRgb(config.line.color));
  doc.setLineWidth(0.6);
  doc.line(box.x, box.y + 11, box.x + 6, box.y + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...hexToRgb(CHART_COLORS.text));
  doc.text(config.line.label, box.x + 7.5, box.y + 11.8);
  const legendX2 = box.x + 55;
  doc.setFillColor(...hexToRgb(config.scatter.color));
  doc.circle(legendX2 + 1, box.y + 11, 1.1, "F");
  doc.text(config.scatter.label, legendX2 + 3.5, box.y + 11.8);

  // Libellé de l'axe Y (au-dessus de la zone de tracé, non pivoté)
  doc.setFontSize(7.5);
  doc.setTextColor(...hexToRgb(CHART_COLORS.text));
  doc.text(config.yLabel, plotX, box.y + 19);

  // Grille + graduations Y
  doc.setDrawColor(...hexToRgb(CHART_COLORS.grid));
  doc.setLineWidth(0.15);
  doc.setFontSize(7);
  config.yScale.ticks.forEach((t) => {
    const y = sy(t);
    doc.line(plotX, y, plotX + plotW, y);
    doc.setTextColor(...hexToRgb(CHART_COLORS.text));
    doc.text(fmtTick(t), plotX - 2, y + 1, { align: "right" });
  });

  // Axes
  doc.setDrawColor(...hexToRgb(CHART_COLORS.axis));
  doc.setLineWidth(0.25);
  doc.line(plotX, plotY, plotX, plotY + plotH);
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH);

  // Graduations X
  config.xScale.ticks.forEach((t) => {
    const x = sx(t);
    doc.text(fmtTick(t), x, plotY + plotH + 4, { align: "center" });
  });

  // Courbe théorique
  doc.setDrawColor(...hexToRgb(config.line.color));
  doc.setLineWidth(0.7);
  const pts = config.line.points;
  for (let i = 0; i < pts.length - 1; i++) {
    doc.line(sx(pts[i].x), sy(pts[i].y), sx(pts[i + 1].x), sy(pts[i + 1].y));
  }

  // Points mesurés
  doc.setFillColor(...hexToRgb(config.scatter.color));
  config.scatter.points.forEach((p) => {
    doc.circle(sx(p.x), sy(p.y), 1.1, "F");
  });

  // Label de l'axe X
  doc.setFontSize(8);
  doc.setTextColor(...hexToRgb(CHART_COLORS.text));
  doc.text(config.xLabel, plotX + plotW / 2, box.y + box.height - 1, { align: "center" });
}

window.VbtCharts = {
  buildForceVelocityChartData,
  buildPowerVelocityChartData,
  renderChartSVG,
  renderChartPdf,
  niceScale,
};
