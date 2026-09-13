// ============================================================
// csv-import.js — Import du CSV exporté par l'application Vitruve
//
// Particularités gérées :
//  - nombres au format français ("1 743,83" -> 1743.83, espace fine
//    insécable ou normale comme séparateur de milliers, virgule comme
//    séparateur décimal)
//  - dates au format JJ/MM/AAAA HH:MM:SS
//  - un décalage de colonnes rencontré sur certains exports Vitruve :
//    la colonne "Weight (kg)" est vide et les valeurs réelles se
//    retrouvent décalées d'une colonne vers la gauche à partir de
//    "Repetition Date". Le parseur détecte automatiquement ce cas et
//    corrige le décalage — un aperçu est toujours affiché avant
//    import pour que le coach puisse vérifier.
// ============================================================

/** Parse un texte CSV en tableau de lignes (tableau de cellules), en gérant les guillemets. */
function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  // Normalise les fins de ligne
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Convertit un nombre au format français ("1 743,83", "1,76"...) en Number JS. */
function parseFrenchNumber(str) {
  if (str === undefined || str === null) return null;
  const cleaned = String(str)
    .replace(/[  \s]/g, "") // espaces fines insécables / normales (milliers)
    .replace(",", ".")
    .trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse une date "JJ/MM/AAAA HH:MM:SS" (locale FR) en objet {iso, dateOnly, display}. */
function parseFrenchDate(str) {
  const m = String(str).match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (!m) return null;
  const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = m;
  const dateOnly = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  const iso = `${dateOnly}T${hh.padStart(2, "0")}:${min.padStart(2, "0")}:${ss.padStart(2, "0")}`;
  return { iso, dateOnly, display: `${dd}/${mm}/${yyyy}` };
}

const EXPECTED_HEADER_TOKENS = ["email", "exercise", "workout date"];

/**
 * Parse le fichier CSV exporté par Vitruve.
 * @param {string} text contenu brut du fichier
 * @returns {{sessions: Array, warnings: string[]}}
 */
function parseVitruveCsv(text) {
  const allRows = parseCsvText(text).filter((r) => r.some((c) => c.trim() !== ""));
  const warnings = [];

  // Trouve la ligne d'en-tête (une ligne de disclaimer peut précéder, ex: "* Marked: ...")
  let headerIdx = allRows.findIndex((r) => {
    const joined = r.join("|").toLowerCase();
    return EXPECTED_HEADER_TOKENS.every((t) => joined.includes(t));
  });
  if (headerIdx === -1) headerIdx = 0;
  const dataRows = allRows.slice(headerIdx + 1);

  if (dataRows.length === 0) {
    return { sessions: [], warnings: ["Aucune ligne de données trouvée dans le fichier."] };
  }

  // Détection du décalage de colonnes : la colonne "Weight (kg)" (index brut 7)
  // doit contenir des nombres > 0 pour la majorité des lignes si l'export est
  // correctement aligné.
  let plausibleDirectWeights = 0;
  for (const r of dataRows) {
    const w = parseFrenchNumber(r[7]);
    if (w !== null && w > 0) plausibleDirectWeights++;
  }
  const directRatio = plausibleDirectWeights / dataRows.length;
  const shifted = directRatio < 0.5;
  if (shifted) {
    warnings.push(
      "Décalage de colonnes détecté dans l'export Vitruve (colonne « Weight (kg) » vide) — correction automatique appliquée. Vérifie l'aperçu ci-dessous avant de valider."
    );
  }

  const parsedRows = [];
  for (const r of dataRows) {
    const email = r[0] || "";
    const athleteLabel = r[1] || "";
    const lastName = (r[2] || "").trim();
    const exercise = (r[3] || "").trim().toUpperCase();
    const date = parseFrenchDate(r[4]);
    if (!lastName || !exercise || !date) continue;

    let setNumber, weightKg, reps, type, mpv, peakVelocity, romCm, meanPowerW, durationMs, timeToPeakMs, accelIndex;
    if (shifted) {
      // à partir de l'index brut 5, tout est décalé d'une colonne vers la gauche
      setNumber = parseFrenchNumber(r[5]);
      weightKg = parseFrenchNumber(r[6]);
      // r[7] = commentaires (ignoré)
      reps = parseFrenchNumber(r[8]);
      type = (r[9] || "").trim();
      mpv = parseFrenchNumber(r[10]);
      peakVelocity = parseFrenchNumber(r[11]);
      romCm = parseFrenchNumber(r[12]);
      meanPowerW = parseFrenchNumber(r[13]);
      // r[14] = 1RM (kg) — ignoré, recalculé par l'app
      durationMs = parseFrenchNumber(r[15]);
      timeToPeakMs = parseFrenchNumber(r[16]);
      accelIndex = parseFrenchNumber(r[17]);
    } else {
      setNumber = parseFrenchNumber(r[6]);
      weightKg = parseFrenchNumber(r[7]);
      reps = parseFrenchNumber(r[9]);
      type = (r[10] || "").trim();
      mpv = parseFrenchNumber(r[11]);
      peakVelocity = parseFrenchNumber(r[12]);
      romCm = parseFrenchNumber(r[13]);
      meanPowerW = parseFrenchNumber(r[14]);
      durationMs = parseFrenchNumber(r[16]);
      timeToPeakMs = parseFrenchNumber(r[17]);
      accelIndex = parseFrenchNumber(r[18]);
    }

    if (weightKg === null || mpv === null) continue;

    parsedRows.push({
      email,
      athleteLabel,
      lastName,
      exercise,
      date,
      setNumber: setNumber || null,
      weightKg,
      reps: reps || 1,
      type,
      mpv,
      peakVelocity,
      romCm,
      meanPowerW,
      durationMs,
      timeToPeakMs,
      accelIndex,
    });
  }

  if (parsedRows.length === 0) {
    warnings.push(
      "Aucune ligne exploitable n'a pu être lue. Vérifie que le fichier correspond bien à un export Vitruve (séries de charge/vitesse)."
    );
    return { sessions: [], warnings };
  }

  // Regroupement en séances : même athlète + même exercice + même jour
  const groups = new Map();
  for (const row of parsedRows) {
    const key = `${row.lastName.toLowerCase()}|${row.exercise}|${row.date.dateOnly}`;
    if (!groups.has(key)) {
      groups.set(key, {
        lastName: row.lastName,
        exercise: row.exercise,
        dateOnly: row.date.dateOnly,
        dateDisplay: row.date.display,
        sets: [],
      });
    }
    groups.get(key).sets.push(row);
  }

  const sessions = Array.from(groups.values()).map((g) => {
    // Tri par numéro de série si dispo, sinon par charge croissante
    g.sets.sort((a, b) => {
      if (a.setNumber && b.setNumber) return a.setNumber - b.setNumber;
      return a.weightKg - b.weightKg;
    });
    g.sets.forEach((s, i) => {
      if (!s.setNumber) s.setNumber = i + 1;
    });
    return g;
  });

  return { sessions, warnings };
}

window.VbtCsvImport = { parseCsvText, parseFrenchNumber, parseFrenchDate, parseVitruveCsv };
