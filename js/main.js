// ============================================================
// main.js — Application (routage, vues, accès Supabase)
// ============================================================

const sb = supabase.createClient(window.VBT_CONFIG.SUPABASE_URL, window.VBT_CONFIG.SUPABASE_ANON_KEY);

const DEFAULT_EXERCISES = [
  { name: "Squat", mvt_default: 0.275, aliases: ["SQUAT", "BACK SQUAT"] },
  { name: "Squat avant", mvt_default: 0.35, aliases: ["FRONT SQUAT"] },
  { name: "Développé couché", mvt_default: 0.225, aliases: ["BENCH PRESS", "BENCH"] },
  { name: "Développé militaire", mvt_default: 0.275, aliases: ["OVERHEAD PRESS", "SHOULDER PRESS", "MILITARY PRESS"] },
  { name: "Soulevé de terre", mvt_default: 0.185, aliases: ["DEADLIFT"] },
  { name: "Soulevé de terre sumo", mvt_default: 0.175, aliases: ["SUMO DEADLIFT"] },
  { name: "Soulevé de terre trap bar", mvt_default: 0.375, aliases: ["TRAP BAR DEADLIFT", "HEX BAR DEADLIFT"] },
  { name: "Rowing barre", mvt_default: 0.45, aliases: ["BARBELL ROW", "ROW", "BENT OVER ROW"] },
];

let LOGO_DATA_URL = null;
let LOGO_ICON_DATA_URL = null;
let currentUser = null;

const appEl = () => document.getElementById("app");

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function fmtNum(n, decimals = 2) {
  if (n === null || n === undefined) return "-";
  if (n === "hors plage") return "hors plage";
  if (typeof n !== "number" || !Number.isFinite(n)) return "-";
  return n.toFixed(decimals);
}

function fmtPct(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "-";
  return `${Math.round(n * 100)}%`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function loadLogoDataUrl() {
  if (LOGO_DATA_URL) return LOGO_DATA_URL;
  try {
    // Version JPEG compacte (fond blanc, basse résolution) dédiée au PDF :
    // jsPDF réencode les images en bitmap non compressé, une PNG haute
    // résolution ferait gonfler le fichier à plusieurs Mo pour rien.
    const res = await fetch("assets/logo-pdf.jpg");
    const blob = await res.blob();
    LOGO_DATA_URL = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    LOGO_DATA_URL = null;
  }
  return LOGO_DATA_URL;
}

async function loadLogoIconDataUrl() {
  if (LOGO_ICON_DATA_URL) return LOGO_ICON_DATA_URL;
  try {
    // Logo "icône" (le R. seul) utilisé en haut de page du PDF, distinct du
    // logo complet (texte + icône) utilisé dans la signature de pied de page.
    const res = await fetch("assets/logo-icon-pdf.jpg");
    const blob = await res.blob();
    LOGO_ICON_DATA_URL = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    LOGO_ICON_DATA_URL = null;
  }
  return LOGO_ICON_DATA_URL;
}

// ------------------------------------------------------------
// Auth
// ------------------------------------------------------------
async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = "Connexion impossible : " + error.message;
    return;
  }
  currentUser = data.user;
  await ensureDefaultExercises();
  navigate("#/athletes");
}

async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null;
  navigate("#/login");
}

async function ensureDefaultExercises() {
  const { data, error } = await sb.from("vbt_exercise_defaults").select("id").limit(1);
  if (error || (data && data.length > 0)) return;
  const rows = DEFAULT_EXERCISES.map((ex) => ({
    name: ex.name,
    mvt_default: ex.mvt_default,
    aliases: ex.aliases,
  }));
  await sb.from("vbt_exercise_defaults").insert(rows);
}

// ------------------------------------------------------------
// Routage
// ------------------------------------------------------------
function navigate(hash) {
  if (window.location.hash === hash) {
    render();
  } else {
    window.location.hash = hash;
  }
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", init);

async function init() {
  await loadLogoDataUrl();
  const { data } = await sb.auth.getSession();
  currentUser = data.session ? data.session.user : null;
  if (!window.location.hash) window.location.hash = currentUser ? "#/athletes" : "#/login";
  render();
}

async function render() {
  const { data } = await sb.auth.getSession();
  currentUser = data.session ? data.session.user : null;

  if (!currentUser) {
    renderLogin();
    return;
  }

  const hash = window.location.hash || "#/athletes";
  renderShell();
  const [, route, param] = hash.match(/^#\/([^/]*)\/?(.*)$/) || [];

  if (route === "athletes") await renderAthletes();
  else if (route === "athlete") await renderAthleteDetail(param);
  else if (route === "import") await renderImport();
  else if (route === "session") await renderSessionReport(param);
  else if (route === "settings") await renderSettings();
  else await renderAthletes();
}

// ------------------------------------------------------------
// Vue : Login
// ------------------------------------------------------------
function renderLogin() {
  appEl().innerHTML = `
    <div class="login-wrap">
      <img src="assets/logo.png" alt="Ruthene Coach'in" class="login-logo" />
      <h1>Profil Charge - Vélocité</h1>
      <p class="muted">Connecte-toi avec ton compte (le même que ton application de coaching).</p>
      <form id="login-form" class="stack">
        <label>Email<input type="email" id="login-email" required autocomplete="username" /></label>
        <label>Mot de passe<input type="password" id="login-password" required autocomplete="current-password" /></label>
        <p id="login-error" class="error"></p>
        <button type="submit">Se connecter</button>
      </form>
    </div>
  `;
  document.getElementById("login-form").addEventListener("submit", handleLoginSubmit);
}

// ------------------------------------------------------------
// Coquille de l'appli (nav commune)
// ------------------------------------------------------------
function renderShell() {
  if (document.getElementById("shell")) return;
  document.body.innerHTML = `
    <div id="shell">
      <header class="topbar">
        <img src="assets/logo.png" alt="" class="topbar-logo" />
        <nav>
          <a href="#/athletes">Athlètes</a>
          <a href="#/import">Importer un CSV</a>
          <a href="#/settings">Réglages</a>
        </nav>
        <button id="logout-btn" class="link-btn">Déconnexion</button>
      </header>
      <main id="app"></main>
    </div>
  `;
  document.getElementById("logout-btn").addEventListener("click", handleLogout);
}

// ------------------------------------------------------------
// Vue : Liste des athlètes
// ------------------------------------------------------------
async function renderAthletes() {
  appEl().innerHTML = `<p class="muted">Chargement…</p>`;
  const { data: athletes, error } = await sb
    .from("vbt_athletes")
    .select("*")
    .order("last_name", { ascending: true });

  if (error) {
    appEl().innerHTML = `<p class="error">Erreur : ${escapeHtml(error.message)}</p>`;
    return;
  }

  appEl().innerHTML = `
    <div class="page-header">
      <h2>Athlètes</h2>
      <button id="new-athlete-btn">+ Nouvel athlète</button>
    </div>
    <div id="athlete-form-slot"></div>
    <table class="data-table">
      <thead><tr><th>Nom</th><th>Prénom</th><th>Date de naissance</th><th>Poids (kg)</th><th>Taille (cm)</th><th></th></tr></thead>
      <tbody>
        ${athletes
          .map(
            (a) => `
          <tr>
            <td>${escapeHtml(a.last_name)}</td>
            <td>${escapeHtml(a.first_name)}</td>
            <td>${a.birth_date ? escapeHtml(a.birth_date) : "-"}</td>
            <td>${a.weight_kg ?? "-"}</td>
            <td>${a.height_cm ?? "-"}</td>
            <td>
              <a href="#/athlete/${a.id}">Voir les tests</a>
              &middot; <button class="link-btn edit-athlete-btn" data-id="${a.id}">Modifier</button>
            </td>
          </tr>`
          )
          .join("") || `<tr><td colspan="6" class="muted">Aucun athlète pour le moment.</td></tr>`}
      </tbody>
    </table>
  `;

  document.getElementById("new-athlete-btn").addEventListener("click", () => showAthleteForm(null, athletes));
  document.querySelectorAll(".edit-athlete-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const athlete = athletes.find((a) => a.id === btn.dataset.id);
      showAthleteForm(athlete, athletes);
    })
  );
}

function showAthleteForm(athlete, allAthletes) {
  const slot = document.getElementById("athlete-form-slot");
  const isEdit = !!athlete;
  slot.innerHTML = `
    <form id="athlete-form" class="card stack">
      <h3>${isEdit ? "Modifier l'athlète" : "Nouvel athlète"}</h3>
      <div class="row">
        <label>Prénom<input type="text" id="af-first-name" value="${escapeHtml(athlete?.first_name || "")}" required /></label>
        <label>Nom<input type="text" id="af-last-name" value="${escapeHtml(athlete?.last_name || "")}" required /></label>
      </div>
      <div class="row">
        <label>Date de naissance<input type="date" id="af-birth-date" value="${athlete?.birth_date || ""}" /></label>
        <label>Poids (kg)<input type="number" step="0.1" id="af-weight" value="${athlete?.weight_kg ?? ""}" /></label>
        <label>Taille (cm)<input type="number" step="0.1" id="af-height" value="${athlete?.height_cm ?? ""}" /></label>
      </div>
      <div class="row">
        <button type="submit">${isEdit ? "Enregistrer" : "Créer"}</button>
        <button type="button" id="af-cancel" class="secondary">Annuler</button>
        ${isEdit ? `<button type="button" id="af-delete" class="danger">Supprimer</button>` : ""}
      </div>
      <p id="af-error" class="error"></p>
    </form>
  `;
  document.getElementById("af-cancel").addEventListener("click", () => (slot.innerHTML = ""));
  document.getElementById("athlete-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      first_name: document.getElementById("af-first-name").value.trim(),
      last_name: document.getElementById("af-last-name").value.trim(),
      birth_date: document.getElementById("af-birth-date").value || null,
      weight_kg: document.getElementById("af-weight").value || null,
      height_cm: document.getElementById("af-height").value || null,
    };
    const { error } = isEdit
      ? await sb.from("vbt_athletes").update(payload).eq("id", athlete.id)
      : await sb.from("vbt_athletes").insert(payload);
    if (error) {
      document.getElementById("af-error").textContent = error.message;
      return;
    }
    renderAthletes();
  });
  if (isEdit) {
    document.getElementById("af-delete").addEventListener("click", async () => {
      if (!confirm(`Supprimer ${athlete.first_name} ${athlete.last_name} et tous ses tests ?`)) return;
      await sb.from("vbt_athletes").delete().eq("id", athlete.id);
      renderAthletes();
    });
  }
}

// ------------------------------------------------------------
// Vue : Détail athlète (historique des tests)
// ------------------------------------------------------------
async function renderAthleteDetail(athleteId) {
  const { data: athlete, error: aErr } = await sb.from("vbt_athletes").select("*").eq("id", athleteId).single();
  if (aErr || !athlete) {
    appEl().innerHTML = `<p class="error">Athlète introuvable.</p>`;
    return;
  }
  const { data: sessions } = await sb
    .from("vbt_sessions")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("session_date", { ascending: false });

  appEl().innerHTML = `
    <p><a href="#/athletes">&larr; Tous les athlètes</a></p>
    <div class="page-header">
      <h2>${escapeHtml(athlete.first_name)} ${escapeHtml(athlete.last_name)}</h2>
      <a href="#/import"><button>+ Importer un test</button></a>
    </div>
    <p class="muted">
      ${athlete.birth_date ? "Né(e) le " + escapeHtml(athlete.birth_date) + " · " : ""}
      ${athlete.weight_kg ? athlete.weight_kg + " kg · " : ""}
      ${athlete.height_cm ? athlete.height_cm + " cm" : ""}
    </p>
    <table class="data-table">
      <thead><tr><th>Date</th><th>Exercice</th><th>1RM estimé</th><th></th></tr></thead>
      <tbody>
        ${(sessions || [])
          .map(
            (s) => `
          <tr>
            <td>${escapeHtml(s.session_date)}</td>
            <td>${escapeHtml(s.exercise)}</td>
            <td>${s.results?.abs1RM ? fmtNum(s.results.abs1RM, 1) + " kg" : "-"}</td>
            <td><a href="#/session/${s.id}">Voir le rapport</a></td>
          </tr>`
          )
          .join("") || `<tr><td colspan="4" class="muted">Aucun test importé pour cet athlète.</td></tr>`}
      </tbody>
    </table>
  `;
}

// ------------------------------------------------------------
// Vue : Réglages (MVT par exercice)
// ------------------------------------------------------------
async function renderSettings() {
  const { data: exercises, error } = await sb.from("vbt_exercise_defaults").select("*").order("name");
  if (error) {
    appEl().innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    return;
  }
  appEl().innerHTML = `
    <h2>Seuils de vélocité minimale (MVT) par exercice</h2>
    <p class="muted">
      Le MVT est la vélocité (m/s) en-dessous de laquelle on estime que l'athlète est proche de son 1RM.
      Les valeurs pré-remplies sont des estimations médianes tirées de la littérature charge-vélocité
      (plage novice → élite) : à ajuster selon tes propres observations. Voir la
      <a href="https://vbtcoach.com/charts/mvt-by-lift/" target="_blank" rel="noopener">table de référence VBT Coach</a>.
    </p>
    <table class="data-table">
      <thead><tr><th>Exercice</th><th>MVT (m/s)</th><th>Alias CSV Vitruve</th><th></th></tr></thead>
      <tbody id="settings-rows">
        ${exercises
          .map(
            (ex) => `
          <tr data-id="${ex.id}">
            <td><input class="ex-name" value="${escapeHtml(ex.name)}" /></td>
            <td><input class="ex-mvt" type="number" step="0.01" value="${ex.mvt_default}" style="width:5em" /></td>
            <td><input class="ex-aliases" value="${escapeHtml((ex.aliases || []).join(", "))}" placeholder="SQUAT, BACK SQUAT" /></td>
            <td>
              <button class="link-btn save-ex-btn">Enregistrer</button>
              &middot; <button class="link-btn danger delete-ex-btn">Supprimer</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <form id="new-ex-form" class="card stack">
      <h3>Ajouter un exercice</h3>
      <div class="row">
        <label>Nom<input type="text" id="nex-name" required /></label>
        <label>MVT (m/s)<input type="number" step="0.01" id="nex-mvt" required /></label>
        <label>Alias CSV (séparés par virgule)<input type="text" id="nex-aliases" placeholder="SQUAT, BACK SQUAT" /></label>
      </div>
      <button type="submit">Ajouter</button>
      <p id="nex-error" class="error"></p>
    </form>
  `;

  document.querySelectorAll(".save-ex-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const name = tr.querySelector(".ex-name").value.trim();
      const mvt = Number(tr.querySelector(".ex-mvt").value);
      const aliases = tr
        .querySelector(".ex-aliases")
        .value.split(",")
        .map((a) => a.trim().toUpperCase())
        .filter(Boolean);
      await sb.from("vbt_exercise_defaults").update({ name, mvt_default: mvt, aliases }).eq("id", id);
      renderSettings();
    })
  );
  document.querySelectorAll(".delete-ex-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr").dataset.id;
      await sb.from("vbt_exercise_defaults").delete().eq("id", id);
      renderSettings();
    })
  );
  document.getElementById("new-ex-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("nex-name").value.trim();
    const mvt_default = Number(document.getElementById("nex-mvt").value);
    const aliases = document
      .getElementById("nex-aliases")
      .value.split(",")
      .map((a) => a.trim().toUpperCase())
      .filter(Boolean);
    const { error: insErr } = await sb.from("vbt_exercise_defaults").insert({ name, mvt_default, aliases });
    if (insErr) {
      document.getElementById("nex-error").textContent = insErr.message;
      return;
    }
    renderSettings();
  });
}

// ------------------------------------------------------------
// Vue : Import CSV
// ------------------------------------------------------------
let importState = { sessions: [], athletes: [], exerciseDefaults: [] };

async function renderImport() {
  const { data: athletes } = await sb.from("vbt_athletes").select("*").order("last_name");
  const { data: exerciseDefaults } = await sb.from("vbt_exercise_defaults").select("*").order("name");
  importState.athletes = athletes || [];
  importState.exerciseDefaults = exerciseDefaults || [];
  importState.sessions = [];

  appEl().innerHTML = `
    <h2>Importer un CSV Vitruve</h2>
    <p class="muted">Sélectionne le fichier CSV exporté depuis l'application Vitruve. L'app détecte automatiquement les séances (une par athlète + exercice + date) et calcule le profil charge-vélocité.</p>
    <input type="file" id="csv-file-input" accept=".csv,text/csv" />
    <div id="import-warnings"></div>
    <div id="import-sessions"></div>
  `;
  document.getElementById("csv-file-input").addEventListener("change", onCsvFileSelected);
}

async function onCsvFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const { sessions, warnings } = VbtCsvImport.parseVitruveCsv(text);
  importState.sessions = sessions;
  importState.fileName = file.name;

  document.getElementById("import-warnings").innerHTML = warnings
    .map((w) => `<p class="warning">${escapeHtml(w)}</p>`)
    .join("");

  document.getElementById("import-sessions").innerHTML = sessions.length
    ? sessions.map((s, i) => renderSessionPreview(s, i)).join("")
    : `<p class="muted">Aucune séance détectée.</p>`;

  sessions.forEach((s, i) => wireSessionPreview(i));
}

function guessExerciseDefault(csvExerciseTag) {
  return importState.exerciseDefaults.find((ex) =>
    (ex.aliases || []).some((al) => al.toUpperCase() === csvExerciseTag.toUpperCase())
  );
}

function renderSessionPreview(session, idx) {
  const guessed = guessExerciseDefault(session.exercise);
  const matchingAthlete = importState.athletes.find(
    (a) => a.last_name.toLowerCase() === session.lastName.toLowerCase()
  );
  const setsPreview = session.sets
    .map(
      (s) => `<tr><td>${s.setNumber}</td><td>${s.weightKg}</td><td>${s.mpv}</td><td>${s.romCm ?? "-"}</td><td>${
        s.meanPowerW ?? "-"
      }</td></tr>`
    )
    .join("");

  return `
    <div class="card stack" id="import-session-${idx}">
      <h3>${escapeHtml(session.lastName)} — ${escapeHtml(session.exercise)} — ${escapeHtml(session.dateDisplay)}
        <span class="muted">(${session.sets.length} séries détectées)</span>
      </h3>
      <table class="data-table small">
        <thead><tr><th>#Série</th><th>Charge (kg)</th><th>MCV (m/s)</th><th>ROM (cm)</th><th>Puissance (W)</th></tr></thead>
        <tbody>${setsPreview}</tbody>
      </table>
      <div class="row">
        <label>Athlète
          <select class="is-athlete-select">
            <option value="">-- Choisir --</option>
            ${importState.athletes
              .map(
                (a) =>
                  `<option value="${a.id}" ${matchingAthlete?.id === a.id ? "selected" : ""}>${escapeHtml(
                    a.first_name
                  )} ${escapeHtml(a.last_name)}</option>`
              )
              .join("")}
            <option value="__new__">+ Créer « ${escapeHtml(session.lastName)} »</option>
          </select>
        </label>
        <label>Exercice
          <select class="is-exercise-select">
            <option value="">-- Choisir --</option>
            ${importState.exerciseDefaults
              .map(
                (ex) =>
                  `<option value="${ex.id}" data-mvt="${ex.mvt_default}" ${
                    guessed?.id === ex.id ? "selected" : ""
                  }>${escapeHtml(ex.name)}</option>`
              )
              .join("")}
          </select>
        </label>
        <label>MVT retenu (m/s)<input type="number" step="0.01" class="is-mvt-input" value="${
          guessed?.mvt_default ?? ""
        }" /></label>
        <label>Poids de corps (kg)<input type="number" step="0.1" class="is-bw-input" value="${
          matchingAthlete?.weight_kg ?? ""
        }" /></label>
      </div>
      <div class="row is-new-athlete-fields" style="display:none">
        <label>Prénom du nouvel athlète<input type="text" class="is-new-first-name" /></label>
      </div>
      <button class="is-confirm-btn">Importer cette séance</button>
      <p class="is-status muted"></p>
    </div>
  `;
}

function wireSessionPreview(idx) {
  const root = document.getElementById(`import-session-${idx}`);
  const athleteSelect = root.querySelector(".is-athlete-select");
  const exerciseSelect = root.querySelector(".is-exercise-select");
  const mvtInput = root.querySelector(".is-mvt-input");
  const bwInput = root.querySelector(".is-bw-input");
  const newAthleteFields = root.querySelector(".is-new-athlete-fields");
  const newFirstName = root.querySelector(".is-new-first-name");

  athleteSelect.addEventListener("change", () => {
    if (athleteSelect.value === "__new__") {
      newAthleteFields.style.display = "";
    } else {
      newAthleteFields.style.display = "none";
      const a = importState.athletes.find((x) => x.id === athleteSelect.value);
      if (a?.weight_kg) bwInput.value = a.weight_kg;
    }
  });
  exerciseSelect.addEventListener("change", () => {
    const opt = exerciseSelect.selectedOptions[0];
    if (opt?.dataset.mvt) mvtInput.value = opt.dataset.mvt;
  });

  root.querySelector(".is-confirm-btn").addEventListener("click", () => importSession(idx, root));
}

async function importSession(idx, root) {
  const statusEl = root.querySelector(".is-status");
  const session = importState.sessions[idx];
  let athleteId = root.querySelector(".is-athlete-select").value;
  const exerciseId = root.querySelector(".is-exercise-select").value;
  const mvt = Number(root.querySelector(".is-mvt-input").value);
  const bodyweight = root.querySelector(".is-bw-input").value || null;

  if (!athleteId) {
    statusEl.textContent = "Choisis ou crée un athlète avant d'importer.";
    return;
  }
  if (!mvt) {
    statusEl.textContent = "Renseigne un seuil MVT (m/s) avant d'importer.";
    return;
  }

  statusEl.textContent = "Import en cours…";

  if (athleteId === "__new__") {
    const firstName = root.querySelector(".is-new-first-name").value.trim();
    if (!firstName) {
      statusEl.textContent = "Renseigne le prénom du nouvel athlète.";
      return;
    }
    const { data: newAthlete, error: newAthErr } = await sb
      .from("vbt_athletes")
      .insert({ first_name: firstName, last_name: session.lastName, weight_kg: bodyweight })
      .select()
      .single();
    if (newAthErr) {
      statusEl.textContent = "Erreur création athlète : " + newAthErr.message;
      return;
    }
    athleteId = newAthlete.id;
    importState.athletes.push(newAthlete);
  }

  const exerciseName =
    importState.exerciseDefaults.find((ex) => ex.id === exerciseId)?.name || session.exercise;

  const setsForCalc = session.sets.map((s) => ({
    load_kg: s.weightKg,
    mcv_ms: s.mpv,
    power_w: s.meanPowerW,
  }));
  const profile = VbtCalc.computeVbtProfile(setsForCalc, bodyweight ? Number(bodyweight) : null, mvt);

  const { data: sessionRow, error: sessErr } = await sb
    .from("vbt_sessions")
    .insert({
      athlete_id: athleteId,
      exercise: exerciseName,
      session_date: session.dateOnly,
      bodyweight_kg: bodyweight,
      mvt_used: mvt,
      source: "import",
      raw_csv_filename: importState.fileName || null,
      results: profile,
    })
    .select()
    .single();

  if (sessErr) {
    statusEl.textContent = "Erreur création séance : " + sessErr.message;
    return;
  }

  const setRows = session.sets.map((s) => ({
    session_id: sessionRow.id,
    set_number: s.setNumber,
    load_kg: s.weightKg,
    mcv_ms: s.mpv,
    peak_velocity_ms: s.peakVelocity,
    rom_cm: s.romCm,
    power_w: s.meanPowerW,
    duration_ms: s.durationMs,
    time_to_peak_ms: s.timeToPeakMs,
    acceleration_index: s.accelIndex,
    reps: s.reps || 1,
  }));
  const { error: setsErr } = await sb.from("vbt_sets").insert(setRows);
  if (setsErr) {
    statusEl.textContent = "Séance créée mais erreur sur les séries : " + setsErr.message;
    return;
  }

  statusEl.innerHTML = `Séance importée ✓ — <a href="#/session/${sessionRow.id}">voir le rapport</a>`;
}

// ------------------------------------------------------------
// Vue : Rapport de séance (CR VITRUVE) + export PDF
// ------------------------------------------------------------
async function renderSessionReport(sessionId) {
  const { data: session, error: sErr } = await sb
    .from("vbt_sessions")
    .select("*, vbt_athletes(*)")
    .eq("id", sessionId)
    .single();
  if (sErr || !session) {
    appEl().innerHTML = `<p class="error">Séance introuvable.</p>`;
    return;
  }
  const { data: sets } = await sb
    .from("vbt_sets")
    .select("*")
    .eq("session_id", sessionId)
    .order("set_number");

  const athlete = session.vbt_athletes;

  // Le profil est toujours recalculé à l'affichage à partir des séries brutes
  // (plutôt que de se fier uniquement à la valeur mise en cache au moment de
  // l'import) : ça garantit que les rapports déjà importés profitent aussi
  // des corrections apportées au moteur de calcul, sans réimporter le CSV.
  const setsForCalc = sets.map((s) => ({
    load_kg: s.load_kg,
    mcv_ms: s.mcv_ms,
    power_w: s.power_w,
  }));
  const profile = VbtCalc.computeVbtProfile(
    setsForCalc,
    session.bodyweight_kg ? Number(session.bodyweight_kg) : null,
    Number(session.mvt_used)
  );
  // Rafraîchit le cache en base pour que les autres vues (liste des tests
  // d'un athlète) restent cohérentes, sans bloquer l'affichage du rapport.
  sb.from("vbt_sessions").update({ results: profile }).eq("id", sessionId).then(() => {});

  appEl().innerHTML = `
    <p><a href="#/athlete/${athlete.id}">&larr; ${escapeHtml(athlete.first_name)} ${escapeHtml(athlete.last_name)}</a></p>
    <div class="page-header">
      <h2>Rapport — ${escapeHtml(session.exercise)} — ${escapeHtml(session.session_date)}</h2>
      <button id="export-pdf-btn">Télécharger le PDF</button>
    </div>

    <div class="card">
      <p><strong>Nom :</strong> ${escapeHtml(athlete.first_name)} ${escapeHtml(athlete.last_name)}</p>
      <p><strong>Poids de corps :</strong> ${session.bodyweight_kg ? session.bodyweight_kg + " kg" : "-"}</p>
      <p><strong>Exercice :</strong> ${escapeHtml(session.exercise)}</p>
      <p><strong>MVT retenu :</strong> ${fmtNum(session.mvt_used, 2)} m/s</p>
    </div>

    <table class="data-table">
      <thead><tr><th>#Série</th><th>Charge (kg)</th><th>MCV (m/s)</th><th>ROM (cm)</th><th>Puissance (W)</th></tr></thead>
      <tbody>
        ${sets
          .map(
            (s) => `<tr><td>${s.set_number}</td><td>${s.load_kg}</td><td>${s.mcv_ms}</td><td>${s.rom_cm ?? "-"}</td><td>${
              s.power_w ?? "-"
            }</td></tr>`
          )
          .join("")}
      </tbody>
    </table>

    ${
      profile.maxPowerReliable
        ? `<h3>Courbes du profil</h3>
           <div class="row" style="align-items:flex-start">
             <div class="card" id="chart-fv" style="flex:1; min-width:300px"></div>
             <div class="card" id="chart-pv" style="flex:1; min-width:300px"></div>
           </div>`
        : ""
    }

    <h3>Zone d'entraînement</h3>
    <table class="data-table">
      <thead><tr><th>Indication</th><th>Vélocité min (m/s)</th><th>Vélocité max (m/s)</th><th>Charge min (kg)</th><th>Charge max (kg)</th><th>% 1RM min</th><th>% 1RM max</th></tr></thead>
      <tbody>
        ${profile.trainingZones
          .map(
            (z, i) => `<tr class="${i === profile.trainingZones.length - 1 ? "zone-max" : ""}">
              <td>${escapeHtml(z.name)}</td><td>${fmtNum(z.vMin)}</td><td>${fmtNum(z.vMax)}</td>
              <td>${fmtNum(z.loadMin, 0)}</td><td>${fmtNum(z.loadMax, 0)}</td>
              <td>${fmtPct(z.pctMin)}</td><td>${fmtPct(z.pctMax)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <p class="muted">
      Zones définies selon la méthode par pourcentage de vélocité maximale, telle que
      popularisée par les travaux de Jean-Benoît Morin et Pierre Samozino sur le profil
      force-vitesse et l'entraînement basé sur la vélocité (VBT).
    </p>

    <h3>Profil complet (données avancées)</h3>
    <table class="data-table small">
      <tbody>
        <tr><td>1RM absolu estimé</td><td>${fmtNum(profile.abs1RM, 1)} kg</td></tr>
        <tr><td>1RM relatif</td><td>${fmtNum(profile.rel1RM, 2)} × poids de corps</td></tr>
        <tr><td>Puissance maximale estimée</td><td>${
          profile.maxPowerReliable ? fmtNum(profile.maxPowerOutput, 0) + " W" : "donnée du test invalide"
        }</td></tr>
        <tr><td>Puissance max relative</td><td>${
          profile.maxPowerReliable ? fmtNum(profile.relMaxPowerOutput, 1) + " W/kg" : "donnée du test invalide"
        }</td></tr>
        <tr><td>Charge à puissance maximale</td><td>${
          profile.maxPowerReliable
            ? `${fmtNum(profile.loadAtMaxPower, 1)} kg (${fmtPct(profile.pctRMatMaxPower)} du 1RM)`
            : "donnée du test invalide"
        }</td></tr>
        <tr><td>Vélocité min mesurée</td><td>${fmtNum(profile.vMinMeasured)} m/s</td></tr>
        <tr><td>Vélocité max mesurée</td><td>${fmtNum(profile.vMaxMeasured)} m/s</td></tr>
        <tr><td>L0 (charge théorique à vélocité nulle)</td><td>${fmtNum(profile.l0, 1)} kg</td></tr>
        <tr><td>V0 (vélocité théorique à charge nulle)</td><td>${fmtNum(profile.v0)} m/s</td></tr>
      </tbody>
    </table>
    <p class="muted">
      La puissance maximale et la charge associée sont calculées à partir de la droite
      charge-vélocité du test (charge optimale = L0 / 2, vélocité optimale = V0 / 2 — méthode
      standard en musculation charge-vélocité), et non d'un ajustement direct sur les quelques
      points de puissance mesurés, plus sensible au bruit de mesure série par série.
    </p>
    ${
      !profile.maxPowerReliable
        ? `<p class="warning">« Donnée du test invalide » : la vélocité mesurée n'a pas diminué quand la charge a augmenté sur cette séance — vérifie les séries saisies (charges/vélocités inversées ?).</p>`
        : ""
    }
  `;

  if (profile.maxPowerReliable && window.VbtCharts) {
    const fvData = VbtCharts.buildForceVelocityChartData(profile, sets);
    const pvData = VbtCharts.buildPowerVelocityChartData(profile, sets);
    document.getElementById("chart-fv").innerHTML = VbtCharts.renderChartSVG(fvData, { width: 460, height: 300 });
    document.getElementById("chart-pv").innerHTML = VbtCharts.renderChartSVG(pvData, { width: 460, height: 300 });
  }

  document.getElementById("export-pdf-btn").addEventListener("click", async () => {
    const [logo, logoIcon] = await Promise.all([loadLogoDataUrl(), loadLogoIconDataUrl()]);
    const doc = VbtPdf.buildCrVitruvePdf({
      athleteName: `${athlete.first_name} ${athlete.last_name}`,
      bodyweightKg: session.bodyweight_kg,
      exercise: session.exercise,
      sessionDateDisplay: session.session_date,
      sets,
      profile,
      logoDataUrl: logo,
      logoIconDataUrl: logoIcon,
    });
    doc.save(`CR-Vitruve_${athlete.last_name}_${session.exercise}_${session.session_date}.pdf`);
  });
}
