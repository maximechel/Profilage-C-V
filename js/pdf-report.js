// ============================================================
// pdf-report.js — Génère le PDF correspondant à l'onglet "CR VITRUVE"
// du fichier Excel d'origine (logo, identité, tableau des séries,
// tableau des zones d'entraînement).
// Utilise jsPDF + jspdf-autotable (chargés depuis un CDN dans index.html).
// ============================================================

const VBT_COLORS = {
  headerOrange: [255, 192, 0], // FFC000
  altYellow: [255, 222, 54], // FFDE36
  maxStrengthRed: [255, 118, 127], // FF767F
  text: [30, 30, 30],
};

function fmt(n, decimals) {
  if (n === null || n === undefined || n === "hors plage") return "hors plage";
  if (typeof n !== "number" || !Number.isFinite(n)) return "-";
  return n.toFixed(decimals);
}

function fmtPct(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "-";
  return `${Math.round(n * 100)}%`;
}

/**
 * @param {object} params
 * @param {string} params.athleteName
 * @param {number} params.bodyweightKg
 * @param {string} params.exercise
 * @param {string} params.sessionDateDisplay
 * @param {Array} params.sets  [{setNumber, load_kg, mcv_ms, rom_cm, power_w}]
 * @param {object} params.profile résultat de VbtCalc.computeVbtProfile
 * @param {string} [params.logoDataUrl] logo encodé en base64 (data URL)
 * @returns {jsPDF} document, pas encore sauvegardé
 */
function buildCrVitruvePdf({ athleteName, bodyweightKg, exercise, sessionDateDisplay, sets, profile, logoDataUrl }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 15;

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "JPEG", pageWidth - marginX - 45, 10, 45, 17);
    } catch (e) {
      // silencieux si le logo ne peut pas être chargé
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...VBT_COLORS.text);
  doc.text("Rapport de profil charge - vélocité", marginX, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("(CR VITRUVE)", marginX, 24);

  let y = 34;
  doc.setFontSize(11);
  const infoLines = [
    ["Nom", athleteName || "-"],
    ["Poids de corps", bodyweightKg ? `${bodyweightKg} kg` : "-"],
    ["Exercice", exercise || "-"],
    ["Date du test", sessionDateDisplay || "-"],
  ];
  infoLines.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label} :`, marginX, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(value), marginX + 40, y);
    y += 6;
  });
  y += 10;

  // Tableau des séries
  const setRows = sets.map((s, i) => [
    String(s.set_number ?? i + 1),
    fmt(Number(s.load_kg), 0),
    fmt(Number(s.mcv_ms), 2),
    fmt(Number(s.rom_cm), 2),
    fmt(Number(s.power_w), 1),
  ]);

  doc.autoTable({
    startY: y,
    head: [["#Série", "Charge (kg)", "MCV (m/s)", "ROM (cm)", "Puissance (W)"]],
    body: setRows,
    theme: "grid",
    styles: { fontSize: 10, halign: "center" },
    headStyles: { fillColor: VBT_COLORS.headerOrange, textColor: [0, 0, 0], fontStyle: "bold" },
    alternateRowStyles: { fillColor: VBT_COLORS.altYellow },
    margin: { left: marginX, right: marginX },
  });

  // Courbe Charge/Force-Vélocité — directement sous le tableau des séries,
  // sur la même page (plutôt que sur une page à part entièrement vide en
  // dessous du tableau). La courbe Puissance-Vélocité suit sur la page
  // suivante, avec les zones d'entraînement juste après.
  const chartWidth = pageWidth - marginX * 2;
  const chartsShown = profile.maxPowerReliable && window.VbtCharts;

  if (chartsShown) {
    y = doc.lastAutoTable.finalY + 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...VBT_COLORS.text);
    doc.text("Courbes du profil", marginX, y);

    const fvData = window.VbtCharts.buildForceVelocityChartData(profile, sets);
    window.VbtCharts.renderChartPdf(doc, fvData, { x: marginX, y: y + 8, width: chartWidth, height: 95 });

    doc.addPage();
    const pvChartY = 22;
    const pvData = window.VbtCharts.buildPowerVelocityChartData(profile, sets);
    window.VbtCharts.renderChartPdf(doc, pvData, { x: marginX, y: pvChartY, width: chartWidth, height: 95 });

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      "Droite et courbe théoriques calculées à partir de la régression charge-vélocité du test ; points = séries mesurées.",
      marginX,
      pvChartY + 95 + 8
    );

    y = pvChartY + 95 + 8 + 22;
  } else {
    y = doc.lastAutoTable.finalY + 10;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...VBT_COLORS.text);
  doc.text("ZONE D'ENTRAÎNEMENT", marginX, y);
  y += 4;

  const zoneRows = profile.trainingZones.map((z) => [
    z.name,
    fmt(z.vMin, 2),
    fmt(z.vMax, 2),
    fmt(z.loadMax, 0),
    fmt(z.loadMin, 0),
    fmtPct(z.pctMax),
    fmtPct(z.pctMin),
  ]);

  doc.autoTable({
    startY: y,
    head: [
      [
        "Indication",
        "Vélocité min (m/s)",
        "Vélocité max (m/s)",
        "Charge max (kg)",
        "Charge min (kg)",
        "% 1RM max",
        "% 1RM min",
      ],
    ],
    body: zoneRows,
    theme: "grid",
    styles: { fontSize: 9.5, halign: "center" },
    headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: "bold" },
    margin: { left: marginX, right: marginX },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === zoneRows.length - 1) {
        data.cell.styles.fillColor = VBT_COLORS.maxStrengthRed;
      }
    },
  });

  y = doc.lastAutoTable.finalY + 5;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  const refNote =
    "Zones d'entraînement définies selon la méthode par pourcentage de vélocité maximale, telle que " +
    "popularisée par les travaux de Jean-Benoît Morin et Pierre Samozino sur le profil force-vitesse et " +
    "l'entraînement basé sur la vélocité (VBT).";
  const refLines = doc.splitTextToSize(refNote, pageWidth - marginX * 2);
  doc.text(refLines, marginX, y);
  y += refLines.length * 3.3 + 5;

  if (typeof profile.abs1RM === "number") {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...VBT_COLORS.text);
    doc.text(
      `1RM estimé (méthode charge-vélocité, seuil MVT = ${fmt(profile.mvtUsed, 2)} m/s) : ${fmt(
        profile.abs1RM,
        1
      )} kg`,
      marginX,
      y
    );
  }

  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    `Généré le ${new Date().toLocaleDateString("fr-FR")} — Ruthene Coach'in`,
    marginX,
    doc.internal.pageSize.getHeight() - 10
  );

  return doc;
}

window.VbtPdf = { buildCrVitruvePdf };
