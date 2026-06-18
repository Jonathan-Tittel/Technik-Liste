// ── Klassen-Verwaltung ────────────────────────────────────────
const DEFAULT_CLASS = "10B";

function loadClasses() {
  const saved = localStorage.getItem("technik_classes");
  return saved ? JSON.parse(saved) : [DEFAULT_CLASS];
}

function saveClasses(list) {
  localStorage.setItem("technik_classes", JSON.stringify(list));
}

function loadActiveClass() {
  return localStorage.getItem("technik_active_class") || DEFAULT_CLASS;
}

function saveActiveClass(name) {
  localStorage.setItem("technik_active_class", name);
}

function classKey(base, className) {
  return `${base}__${className}`;
}

// ── Schüler ──────────────────────────────────────────────────
const DEFAULT_STUDENTS = [
  "Alexakis Leonidas",
  "Brommer Lionel",
  "Hahn Felix",
  "Hügle Bennet",
  "Klein Yves",
  "Priore Matteo",
  "Schill Max",
  "Schwehr Joshua",
  "Seifert Theo",
  "Tittel Jonathan",
  "Faller Matteo"
];

function loadStudents() {
  const key = classKey("technik_students", loadActiveClass());
  const saved = localStorage.getItem(key);
  // Nur die Standard-Klasse bekommt die Default-Schülerliste
  if (saved) return JSON.parse(saved);
  if (loadActiveClass() === DEFAULT_CLASS) return DEFAULT_STUDENTS;
  return [];
}

function saveStudents(list) {
  localStorage.setItem(classKey("technik_students", loadActiveClass()), JSON.stringify(list));
}

// ── Datums-Helfer ─────────────────────────────────────────────
// Donnerstag der aktuellen ISO-Woche (Mo–So)
function getThursdayOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() === 0 ? 7 : d.getDay(); // 1=Mo … 7=So
  d.setDate(d.getDate() + (4 - day));
  return d;
}

// Freitag derselben Woche (nur für Anzeige)
function getFridayOfThursday(thursday) {
  const d = new Date(thursday);
  d.setDate(d.getDate() + 1);
  return d;
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function weeksBetween(d1, d2) {
  return Math.round((d2 - d1) / (7 * 24 * 60 * 60 * 1000));
}

function formatDate(date) {
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function seededRandom(seed) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// ── Krank-Verwaltung ─────────────────────────────────────────
function sickKey(thursday) {
  return classKey(`sick_${thursday.getFullYear()}_KW${isoWeek(thursday)}`, loadActiveClass());
}

function loadSick(thursday) {
  const saved = localStorage.getItem(sickKey(thursday));
  return saved ? JSON.parse(saved) : [];
}

function saveSick(thursday, list) {
  localStorage.setItem(sickKey(thursday), JSON.stringify(list));
}

// ── Zu-spät-Verwaltung ───────────────────────────────────────
function lateKey(thursday) {
  return classKey(`late_${thursday.getFullYear()}_KW${isoWeek(thursday)}`, loadActiveClass());
}

function loadLate(thursday) {
  const saved = localStorage.getItem(lateKey(thursday));
  return saved ? JSON.parse(saved) : [];
}

function saveLate(thursday, list) {
  localStorage.setItem(lateKey(thursday), JSON.stringify(list));
}

// Schüler per Nummer (1-basiert), Nachname oder Vorname finden
function resolveStudent(query, students) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const num = parseInt(q, 10);
  if (!isNaN(num) && num >= 1 && num <= students.length) {
    return students[num - 1];
  }
  return students.find(name => {
    const parts = name.toLowerCase().split(" ");
    return parts[0] === q || (parts[1] && parts[1] === q) || name.toLowerCase() === q;
  }) || null;
}

// ── Referenz-Donnerstag (KW 25 / 19.06.2026) ─────────────────
const REF_THURSDAY = getThursdayOfWeek(new Date(2026, 5, 18));
// Offset: KW25 (weeks=0) startet bei Index 2 (Hahn Felix)
const ROTATION_OFFSET = 4;
// ── Zuteilung (kranke Schüler überspringen) ──────────────────
function getAssigned(students, thursday) {
  const sick = loadSick(thursday);
  const n = students.length;
  const weeks = weeksBetween(REF_THURSDAY, thursday);
  const saugStart = ((weeks * 2 + ROTATION_OFFSET) % n + n) % n;
  const werkzeugStart = ((saugStart - 2) % n + n) % n;

  const result = [];

  // Saugdienst: aktuelles Paar
  for (let i = 0; i < n && result.length < 2; i++) {
    const student = students[(saugStart + i) % n];
    if (!sick.includes(student)) result.push(student);
  }
  // Fallback Saug
  for (let i = 0; i < n && result.length < 2; i++) {
    const student = students[(saugStart + i) % n];
    if (!result.includes(student)) result.push(student);
  }

  // Werkzeugdienst: Paar der Vorwoche (haben letzte Woche gesaugt)
  for (let i = 0; i < n && result.length < 4; i++) {
    const student = students[(werkzeugStart + i) % n];
    if (!sick.includes(student) && !result.includes(student)) result.push(student);
  }
  // Fallback Werkzeug
  for (let i = 0; i < n && result.length < 4; i++) {
    const student = students[(werkzeugStart + i) % n];
    if (!result.includes(student)) result.push(student);
  }

  return result;
}

// ── State ─────────────────────────────────────────────────────
let currentThursday = getThursdayOfWeek(new Date());

// ── Rendern ───────────────────────────────────────────────────
function render() {
  const students = loadStudents();
  const todayThursday = getThursdayOfWeek(new Date());

  const isCurrentWeek = currentThursday.getTime() === todayThursday.getTime();

  document.getElementById("weekLabel").textContent = `KW ${isoWeek(currentThursday)}`;
  const displayDate = isCurrentWeek ? new Date() : currentThursday;
  document.getElementById("weekDate").textContent = formatDate(displayDate);

  const badge = document.getElementById("currentBadge");
  isCurrentWeek ? badge.classList.remove("hidden") : badge.classList.add("hidden");

  const nav = document.querySelector(".week-nav");
  isCurrentWeek ? nav.classList.add("week-nav--current") : nav.classList.remove("week-nav--current");

  const sick = loadSick(currentThursday);
  const late = loadLate(currentThursday);
  const assigned = getAssigned(students, currentThursday);

  // Staubsaugen: zu-spät-Schüler übernehmen den Dienst; originale entfallen
  const lateDoing = late.filter(s => !sick.includes(s));
  const origStaub = [assigned[0], assigned[1]].filter(s => !late.includes(s));
  let staubStudents;
  if (lateDoing.length === 0) {
    staubStudents = origStaub.map(s => ({ name: s, isLate: false }));
  } else if (lateDoing.length === 1) {
    const seed = currentThursday.getFullYear() * 100 + isoWeek(currentThursday);
    const rnd = seededRandom(seed);
    const randomPick = origStaub[Math.floor(rnd * origStaub.length)];
    staubStudents = [
      { name: lateDoing[0], isLate: true },
      ...(randomPick ? [{ name: randomPick, isLate: false }] : [])
    ];
  } else {
    staubStudents = lateDoing.slice(0, 2).map(s => ({ name: s, isLate: true }));
  }
  const staubContainer = document.getElementById("staubNames");
  staubContainer.innerHTML = "";
  (staubStudents.length > 0 ? staubStudents : [{ name: "–", isLate: false }]).forEach(({ name, isLate }) => {
    const tag = document.createElement("span");
    tag.className = "name-tag" + (isLate ? " name-tag--late" : "");
    tag.textContent = name;
    staubContainer.appendChild(tag);
  });

  // Werkzeugdienst: planmäßige Schüler; zu-spät-Schüler sind entschuldigt (durchgestrichen)
  const werkzeugContainer = document.getElementById("werkzeugNames");
  werkzeugContainer.innerHTML = "";
  [{ name: assigned[2], excused: late.includes(assigned[2]) },
   { name: assigned[3], excused: late.includes(assigned[3]) }].forEach(({ name, excused }) => {
    const tag = document.createElement("span");
    tag.className = "name-tag" + (excused ? " name-tag--excused" : "");
    tag.textContent = name;
    werkzeugContainer.appendChild(tag);
  });

  const grid = document.getElementById("studentDisplay");
  grid.innerHTML = "";
  students.forEach((name, i) => {
    const chip = document.createElement("div");
    const isSick = sick.includes(name);
    const isLate = late.includes(name);
    chip.className = "student-chip" +
      (assigned.includes(name) ? " active" : "") +
      (isSick ? " sick" : "") +
      (isLate ? " late" : "");
    chip.textContent = `${i + 1}. ${name}`;
    grid.appendChild(chip);
  });

  // Kranken-Liste rendern
  const sickList = document.getElementById("sickList");
  sickList.innerHTML = "";
  if (sick.length === 0) {
    const empty = document.createElement("span");
    empty.className = "sick-empty";
    empty.textContent = "Niemand krank gemeldet";
    sickList.appendChild(empty);
  } else {
    sick.forEach(name => {
      const tag = document.createElement("div");
      tag.className = "sick-tag";
      tag.innerHTML = `<span>${name}</span><button aria-label="Entfernen" data-name="${name}">&times;</button>`;
      sickList.appendChild(tag);
    });
  }

  // Zu-spät-Liste rendern
  const lateList = document.getElementById("lateList");
  lateList.innerHTML = "";
  if (late.length === 0) {
    const empty = document.createElement("span");
    empty.className = "late-empty";
    empty.textContent = "Niemand zu spät";
    lateList.appendChild(empty);
  } else {
    late.forEach(name => {
      const tag = document.createElement("div");
      tag.className = "late-tag";
      tag.innerHTML = `<span>${name}</span><button aria-label="Entfernen" data-name="${name}">&times;</button>`;
      lateList.appendChild(tag);
    });
  }
}

// ── Navigation ────────────────────────────────────────────────
document.getElementById("prevWeek").addEventListener("click", () => {
  currentThursday = new Date(currentThursday);
  currentThursday.setDate(currentThursday.getDate() - 7);
  render();
});

document.getElementById("nextWeek").addEventListener("click", () => {
  currentThursday = new Date(currentThursday);
  currentThursday.setDate(currentThursday.getDate() + 7);
  render();
});

// ── Schülerliste bearbeiten ───────────────────────────────────
let editOpen = false;

document.getElementById("toggleEdit").addEventListener("click", () => {
  editOpen = !editOpen;
  const btn = document.getElementById("toggleEdit");
  if (editOpen) {
    document.getElementById("studentDisplay").classList.add("hidden");
    document.getElementById("studentEdit").classList.remove("hidden");
    document.getElementById("studentTextarea").value = loadStudents().join("\n");
    btn.textContent = "Schließen";
  } else {
    closeEdit();
  }
});

function closeEdit() {
  editOpen = false;
  document.getElementById("studentDisplay").classList.remove("hidden");
  document.getElementById("studentEdit").classList.add("hidden");
  document.getElementById("toggleEdit").textContent = "Bearbeiten";
}

document.getElementById("saveStudents").addEventListener("click", () => {
  const names = document.getElementById("studentTextarea").value
    .split("\n")
    .map(n => n.trim())
    .filter(n => n.length > 0);
  if (names.length < 4) {
    alert("Mindestens 4 Schüler werden benötigt.");
    return;
  }
  saveStudents(names);
  closeEdit();
  render();
});

document.getElementById("cancelEdit").addEventListener("click", closeEdit);

// ── Krank hinzufügen ──────────────────────────────────────────
function addSick() {
  const input = document.getElementById("sickInput");
  const query = input.value.trim();
  if (!query) return;
  const students = loadStudents();
  const found = resolveStudent(query, students);
  if (!found) {
    input.classList.add("input-error");
    setTimeout(() => input.classList.remove("input-error"), 1200);
    return;
  }
  const sick = loadSick(currentThursday);
  if (!sick.includes(found)) {
    sick.push(found);
    saveSick(currentThursday, sick);
  }
  input.value = "";
  render();
}

document.getElementById("sickAdd").addEventListener("click", addSick);
document.getElementById("sickInput").addEventListener("keydown", e => {
  if (e.key === "Enter") addSick();
});

document.getElementById("sickList").addEventListener("click", e => {
  const btn = e.target.closest("button[data-name]");
  if (!btn) return;
  const name = btn.dataset.name;
  const sick = loadSick(currentThursday).filter(n => n !== name);
  saveSick(currentThursday, sick);
  render();
});

// ── Zu spät hinzufügen ────────────────────────────────────────
function addLate() {
  const input = document.getElementById("lateInput");
  const query = input.value.trim();
  if (!query) return;
  const students = loadStudents();
  const found = resolveStudent(query, students);
  if (!found) {
    input.classList.add("input-error");
    setTimeout(() => input.classList.remove("input-error"), 1200);
    return;
  }
  const late = loadLate(currentThursday);
  if (!late.includes(found)) {
    late.push(found);
    saveLate(currentThursday, late);
  }
  input.value = "";
  render();
}

document.getElementById("lateAdd").addEventListener("click", addLate);
document.getElementById("lateInput").addEventListener("keydown", e => {
  if (e.key === "Enter") addLate();
});

document.getElementById("lateList").addEventListener("click", e => {
  const btn = e.target.closest("button[data-name]");
  if (!btn) return;
  const name = btn.dataset.name;
  const late = loadLate(currentThursday).filter(n => n !== name);
  saveLate(currentThursday, late);
  render();
});

// ── Start ─────────────────────────────────────────────────────

function deleteClass(name) {
  let classes = loadClasses().filter(c => c !== name);
  if (classes.length === 0) classes = [DEFAULT_CLASS];
  saveClasses(classes);
  if (loadActiveClass() === name) {
    saveActiveClass(classes[0]);
    currentThursday = getThursdayOfWeek(new Date());
    updateClassSubtitle();
    render();
  }
  renderClassModal();
}

function renameClass(oldName) {
  const newName = prompt(`Klasse umbenennen:`, oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;
  const trimmed = newName.trim();
  let classes = loadClasses();
  if (classes.includes(trimmed)) return;
  classes = classes.map(c => c === oldName ? trimmed : c);
  saveClasses(classes);
  // Daten umkopieren
  ["technik_students"].forEach(base => {
    const val = localStorage.getItem(classKey(base, oldName));
    if (val !== null) {
      localStorage.setItem(classKey(base, trimmed), val);
      localStorage.removeItem(classKey(base, oldName));
    }
  });
  if (loadActiveClass() === oldName) {
    saveActiveClass(trimmed);
    updateClassSubtitle();
  }
  renderClassModal();
  render();
}

// ── Klassen-Modal ─────────────────────────────────────────────
function renderClassModal() {
  const classes = loadClasses();
  const active = loadActiveClass();
  const list = document.getElementById("classList");
  list.innerHTML = "";
  classes.forEach(name => {
    const row = document.createElement("div");
    row.className = "class-row" + (name === active ? " class-row--active" : "");
    row.innerHTML = `
      <span class="class-row-name">${name}</span>
      <div class="class-row-actions">
        ${name === active ? "<span class=\"class-active-badge\">Aktiv</span>" : ""}
        <button class="class-action-btn" data-action="rename" data-name="${name}" title="Umbenennen">&#x270F;&#xFE0F;</button>
        <button class="class-action-btn class-action-btn--delete" data-action="delete" data-name="${name}" title="L\u00f6schen">&times;</button>
      </div>`;
    row.querySelector(".class-row-name").addEventListener("click", () => {
      saveActiveClass(name);
      currentThursday = getThursdayOfWeek(new Date());
      closeClassModal();
      updateClassSubtitle();
      render();
    });
    row.querySelector("[data-action='rename']").addEventListener("click", e => {
      e.stopPropagation();
      renameClass(name);
    });
    row.querySelector("[data-action='delete']").addEventListener("click", e => {
      e.stopPropagation();
      if (confirm(`Klasse "${name}" wirklich löschen?`)) deleteClass(name);
    });
    list.appendChild(row);
  });
}


function openClassModal() {
  renderClassModal();
  document.getElementById("classModal").classList.remove("hidden");
}

function closeClassModal() {
  document.getElementById("classModal").classList.add("hidden");
  document.getElementById("classNameInput").value = "";
}

function updateClassSubtitle() {
  document.getElementById("classSubtitle").textContent = loadActiveClass();
}

document.getElementById("classBtn").addEventListener("click", openClassModal);
document.getElementById("classModalClose").addEventListener("click", closeClassModal);
document.getElementById("classModal").addEventListener("click", e => {
  if (e.target === document.getElementById("classModal")) closeClassModal();
});

document.getElementById("classAddBtn").addEventListener("click", () => {
  const name = document.getElementById("classNameInput").value.trim();
  if (!name) return;
  const classes = loadClasses();
  if (!classes.includes(name)) {
    classes.push(name);
    saveClasses(classes);
    // Neue Klasse mit leerer Schülerliste initialisieren
    localStorage.setItem(classKey("technik_students", name), JSON.stringify([]));
  }
  saveActiveClass(name);
  currentThursday = getThursdayOfWeek(new Date());
  closeClassModal();
  updateClassSubtitle();
  render();
});

document.getElementById("classNameInput").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("classAddBtn").click();
});

updateClassSubtitle();
render();
