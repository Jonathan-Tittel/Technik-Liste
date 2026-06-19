// ── Supabase ──────────────────────────────────────────────────
const SUPABASE_URL = 'https://kloaehjodwfotdutfunm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsb2FlaGpvZHdmb3RkdXRmdW5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjA4NjIsImV4cCI6MjA5NzM5Njg2Mn0.Wc3lLEYlZoQ0mgGy3x8nsldZBb9Hc1VNbLCXzv3XeVE';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── PIN-Schutz ────────────────────────────────────────────
const PIN_HASH = 'f3d497366e7adc53c17ab25367108b8e826b168f3edb00ade987b814eb2d2598'; // SHA-256 of "0702"

async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function unlockApp() {
  sessionStorage.setItem('technik_unlocked', '1');
  document.getElementById('pinScreen').classList.add('hidden');
  document.getElementById('mainContainer').classList.remove('hidden');
}

const pinInput = document.getElementById('pinInput');
const pinError = document.getElementById('pinError');

if (sessionStorage.getItem('technik_unlocked') === '1') {
  unlockApp();
} else {
  pinInput.addEventListener('input', async () => {
    if (pinInput.value.length >= 4) {
      if ((await hashPin(pinInput.value)) === PIN_HASH) {
        pinError.classList.add('hidden');
        unlockApp();
      } else {
        pinError.classList.remove('hidden');
        pinInput.value = '';
        setTimeout(() => pinError.classList.add('hidden'), 2000);
      }
    }
  });
  pinInput.focus();
}


// ── Klassen-Verwaltung ────────────────────────────────────────
const DEFAULT_CLASS = '10B';

function loadActiveClass() {
  return localStorage.getItem('technik_active_class') || DEFAULT_CLASS;
}

function saveActiveClass(name) {
  localStorage.setItem('technik_active_class', name);
}

async function loadClasses() {
  const { data } = await db.from('classes').select('name').order('name');
  if (!data || data.length === 0) {
    await db.from('classes').upsert({ name: DEFAULT_CLASS });
    return [DEFAULT_CLASS];
  }
  return data.map(r => r.name);
}

// ── Schüler ──────────────────────────────────────────────────
async function loadStudents() {
  const cls = loadActiveClass();
  const { data } = await db.from('students').select('names').eq('class_name', cls).maybeSingle();
  return data ? data.names : [];
}

async function saveStudents(list) {
  await db.from('students').upsert({ class_name: loadActiveClass(), names: list });
}

// ── Datums-Helfer ─────────────────────────────────────────────
function getThursdayOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() + (4 - day));
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
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function seededRandom(seed) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// ── Wochen-Daten (Supabase) ───────────────────────────────────
function weekId(thursday) {
  return `${loadActiveClass()}_${thursday.getFullYear()}_KW${isoWeek(thursday)}`;
}

async function loadWeekData(thursday) {
  const { data } = await db.from('week_data').select('sick,late,disabled').eq('id', weekId(thursday)).maybeSingle();
  if (!data) return { sick: [], late: [], disabled: [] };
  return { sick: data.sick || [], late: data.late || [], disabled: data.disabled || [] };
}

async function saveWeekData(thursday, wd) {
  await db.from('week_data').upsert({
    id: weekId(thursday),
    class_name: loadActiveClass(),
    year: thursday.getFullYear(),
    kw: isoWeek(thursday),
    sick: wd.sick,
    late: wd.late,
    disabled: wd.disabled
  });
}

// ── Schüler per Nummer/Name finden ────────────────────────────
function resolveStudent(query, students) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const num = parseInt(q, 10);
  if (!isNaN(num) && num >= 1 && num <= students.length) return students[num - 1];
  return students.find(name => {
    const parts = name.toLowerCase().split(' ');
    return parts[0] === q || (parts[1] && parts[1] === q) || name.toLowerCase() === q;
  }) || null;
}

// ── Referenz & Rotation ───────────────────────────────────────
const REF_THURSDAY = getThursdayOfWeek(new Date(2026, 5, 18));
const ROTATION_OFFSET = 4;

function getAssigned(students, thursday, sick) {
  const n = students.length;
  const weeks = weeksBetween(REF_THURSDAY, thursday);
  const saugStart = ((weeks * 2 + ROTATION_OFFSET) % n + n) % n;
  const werkzeugStart = ((saugStart - 2) % n + n) % n;
  const result = [];
  for (let i = 0; i < n && result.length < 2; i++) {
    const s = students[(saugStart + i) % n];
    if (!sick.includes(s)) result.push(s);
  }
  for (let i = 0; i < n && result.length < 2; i++) {
    const s = students[(saugStart + i) % n];
    if (!result.includes(s)) result.push(s);
  }
  for (let i = 0; i < n && result.length < 4; i++) {
    const s = students[(werkzeugStart + i) % n];
    if (!sick.includes(s) && !result.includes(s)) result.push(s);
  }
  for (let i = 0; i < n && result.length < 4; i++) {
    const s = students[(werkzeugStart + i) % n];
    if (!result.includes(s)) result.push(s);
  }
  return result;
}

// ── State ─────────────────────────────────────────────────────
let currentThursday = getThursdayOfWeek(new Date());

// ── Rendern ───────────────────────────────────────────────────
async function render() {
  const [students, wd] = await Promise.all([
    loadStudents(),
    loadWeekData(currentThursday)
  ]);
  const { sick, late, disabled } = wd;

  const todayThursday = getThursdayOfWeek(new Date());
  const isCurrentWeek = currentThursday.getTime() === todayThursday.getTime();

  document.getElementById('weekLabel').textContent = `KW ${isoWeek(currentThursday)}`;
  const displayDate = isCurrentWeek ? new Date() : currentThursday;
  document.getElementById('weekDate').textContent = formatDate(displayDate);

  const badge = document.getElementById('currentBadge');
  isCurrentWeek ? badge.classList.remove('hidden') : badge.classList.add('hidden');
  const nav = document.querySelector('.week-nav');
  isCurrentWeek ? nav.classList.add('week-nav--current') : nav.classList.remove('week-nav--current');

  const assigned = getAssigned(students, currentThursday, sick);

  ['staub', 'werkzeug'].forEach(duty => {
    const card = document.getElementById(`${duty}Card`);
    const btn = document.getElementById(`${duty}ToggleBtn`);
    if (disabled.includes(duty)) {
      card.classList.add('duty-card--disabled');
      btn.innerHTML = '&#x25B6;';
      btn.title = 'Aktivieren';
    } else {
      card.classList.remove('duty-card--disabled');
      btn.innerHTML = '&#x23F8;';
      btn.title = 'Deaktivieren';
    }
  });

  // Staubsaugen
  const lateDoing = late.filter(s => !sick.includes(s));
  const origStaub = [assigned[0], assigned[1]].filter(s => !late.includes(s));
  let staubStudents;
  if (disabled.includes('staub')) {
    staubStudents = [{ name: 'Kein Dienst', isLate: false }];
  } else if (lateDoing.length === 0) {
    staubStudents = origStaub.map(s => ({ name: s, isLate: false }));
  } else if (lateDoing.length === 1) {
    const seed = currentThursday.getFullYear() * 100 + isoWeek(currentThursday);
    const randomPick = origStaub[Math.floor(seededRandom(seed) * origStaub.length)];
    staubStudents = [
      { name: lateDoing[0], isLate: true },
      ...(randomPick ? [{ name: randomPick, isLate: false }] : [])
    ];
  } else {
    staubStudents = lateDoing.slice(0, 2).map(s => ({ name: s, isLate: true }));
  }
  const staubContainer = document.getElementById('staubNames');
  staubContainer.innerHTML = '';
  (staubStudents.length > 0 ? staubStudents : [{ name: '–', isLate: false }]).forEach(({ name, isLate }) => {
    const tag = document.createElement('span');
    tag.className = 'name-tag' + (isLate ? ' name-tag--late' : '');
    tag.textContent = name;
    staubContainer.appendChild(tag);
  });

  // Werkzeugdienst
  const werkzeugContainer = document.getElementById('werkzeugNames');
  werkzeugContainer.innerHTML = '';
  if (disabled.includes('werkzeug')) {
    const tag = document.createElement('span');
    tag.className = 'name-tag';
    tag.textContent = 'Kein Dienst';
    werkzeugContainer.appendChild(tag);
  } else {
    [{ name: assigned[2], excused: late.includes(assigned[2]) },
     { name: assigned[3], excused: late.includes(assigned[3]) }].forEach(({ name, excused }) => {
      const tag = document.createElement('span');
      tag.className = 'name-tag' + (excused ? ' name-tag--excused' : '');
      tag.textContent = name;
      werkzeugContainer.appendChild(tag);
    });
  }

  // Schüler-Grid
  const grid = document.getElementById('studentDisplay');
  grid.innerHTML = '';
  students.forEach((name, i) => {
    const chip = document.createElement('div');
    chip.className = 'student-chip' +
      (assigned.includes(name) ? ' active' : '') +
      (sick.includes(name) ? ' sick' : '') +
      (late.includes(name) ? ' late' : '');
    chip.textContent = `${i + 1}. ${name}`;
    grid.appendChild(chip);
  });

  // Krank-Liste
  const sickList = document.getElementById('sickList');
  sickList.innerHTML = '';
  if (sick.length === 0) {
    const e = document.createElement('span');
    e.className = 'sick-empty';
    e.textContent = 'Niemand krank gemeldet';
    sickList.appendChild(e);
  } else {
    sick.forEach(name => {
      const tag = document.createElement('div');
      tag.className = 'sick-tag';
      tag.innerHTML = `<span>${name}</span><button aria-label="Entfernen" data-name="${name}">&times;</button>`;
      sickList.appendChild(tag);
    });
  }

  // Zu-spät-Liste
  const lateList = document.getElementById('lateList');
  lateList.innerHTML = '';
  if (late.length === 0) {
    const e = document.createElement('span');
    e.className = 'late-empty';
    e.textContent = 'Niemand zu spät';
    lateList.appendChild(e);
  } else {
    late.forEach(name => {
      const tag = document.createElement('div');
      tag.className = 'late-tag';
      tag.innerHTML = `<span>${name}</span><button aria-label="Entfernen" data-name="${name}">&times;</button>`;
      lateList.appendChild(tag);
    });
  }
}

// ── Navigation ────────────────────────────────────────────────
document.getElementById('prevWeek').addEventListener('click', () => {
  currentThursday = new Date(currentThursday);
  currentThursday.setDate(currentThursday.getDate() - 7);
  render();
});

document.getElementById('nextWeek').addEventListener('click', () => {
  currentThursday = new Date(currentThursday);
  currentThursday.setDate(currentThursday.getDate() + 7);
  render();
});

// ── Schülerliste bearbeiten ───────────────────────────────────
let editOpen = false;

document.getElementById('toggleEdit').addEventListener('click', async () => {
  editOpen = !editOpen;
  const btn = document.getElementById('toggleEdit');
  if (editOpen) {
    document.getElementById('studentDisplay').classList.add('hidden');
    document.getElementById('studentEdit').classList.remove('hidden');
    const students = await loadStudents();
    document.getElementById('studentTextarea').value = students.join('\n');
    btn.textContent = 'Schließen';
  } else {
    closeEdit();
  }
});

function closeEdit() {
  editOpen = false;
  document.getElementById('studentDisplay').classList.remove('hidden');
  document.getElementById('studentEdit').classList.add('hidden');
  document.getElementById('toggleEdit').textContent = 'Bearbeiten';
}

document.getElementById('saveStudents').addEventListener('click', async () => {
  const names = document.getElementById('studentTextarea').value
    .split('\n').map(n => n.trim()).filter(n => n.length > 0);
  if (names.length < 4) { alert('Mindestens 4 Schüler werden benötigt.'); return; }
  await saveStudents(names);
  closeEdit();
  render();
});

document.getElementById('cancelEdit').addEventListener('click', closeEdit);

// ── Krank ─────────────────────────────────────────────────────
async function addSick() {
  const input = document.getElementById('sickInput');
  const query = input.value.trim();
  if (!query) return;
  const students = await loadStudents();
  const found = resolveStudent(query, students);
  if (!found) {
    input.classList.add('input-error');
    setTimeout(() => input.classList.remove('input-error'), 1200);
    return;
  }
  const wd = await loadWeekData(currentThursday);
  if (!wd.sick.includes(found)) wd.sick.push(found);
  await saveWeekData(currentThursday, wd);
  input.value = '';
  render();
}

document.getElementById('sickAdd').addEventListener('click', addSick);
document.getElementById('sickInput').addEventListener('keydown', e => { if (e.key === 'Enter') addSick(); });

document.getElementById('sickList').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-name]');
  if (!btn) return;
  const wd = await loadWeekData(currentThursday);
  wd.sick = wd.sick.filter(n => n !== btn.dataset.name);
  await saveWeekData(currentThursday, wd);
  render();
});

// ── Zu spät ───────────────────────────────────────────────────
async function addLate() {
  const input = document.getElementById('lateInput');
  const query = input.value.trim();
  if (!query) return;
  const students = await loadStudents();
  const found = resolveStudent(query, students);
  if (!found) {
    input.classList.add('input-error');
    setTimeout(() => input.classList.remove('input-error'), 1200);
    return;
  }
  const wd = await loadWeekData(currentThursday);
  if (!wd.late.includes(found)) wd.late.push(found);
  await saveWeekData(currentThursday, wd);
  input.value = '';
  render();
}

document.getElementById('lateAdd').addEventListener('click', addLate);
document.getElementById('lateInput').addEventListener('keydown', e => { if (e.key === 'Enter') addLate(); });

document.getElementById('lateList').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-name]');
  if (!btn) return;
  const wd = await loadWeekData(currentThursday);
  wd.late = wd.late.filter(n => n !== btn.dataset.name);
  await saveWeekData(currentThursday, wd);
  render();
});

// ── Dienst deaktivieren ───────────────────────────────────────
async function toggleDisabled(thursday, duty) {
  const wd = await loadWeekData(thursday);
  const idx = wd.disabled.indexOf(duty);
  if (idx === -1) wd.disabled.push(duty); else wd.disabled.splice(idx, 1);
  await saveWeekData(thursday, wd);
  render();
}

document.getElementById('staubToggleBtn').addEventListener('click', () => toggleDisabled(currentThursday, 'staub'));
document.getElementById('werkzeugToggleBtn').addEventListener('click', () => toggleDisabled(currentThursday, 'werkzeug'));

// ── Klassen-Modal ─────────────────────────────────────────────
async function renderClassModal() {
  const classes = await loadClasses();
  const active = loadActiveClass();
  const list = document.getElementById('classList');
  list.innerHTML = '';
  classes.forEach(name => {
    const row = document.createElement('div');
    row.className = 'class-row' + (name === active ? ' class-row--active' : '');
    row.innerHTML = `
      <span class="class-row-name">${name}</span>
      <div class="class-row-actions">
        ${name === active ? '<span class="class-active-badge">Aktiv</span>' : ''}
        <button class="class-action-btn" data-action="rename" data-name="${name}" title="Umbenennen">&#x270F;&#xFE0F;</button>
        <button class="class-action-btn class-action-btn--delete" data-action="delete" data-name="${name}" title="Loeschen">&times;</button>
      </div>`;
    row.querySelector('.class-row-name').addEventListener('click', () => {
      saveActiveClass(name);
      currentThursday = getThursdayOfWeek(new Date());
      closeClassModal();
      updateClassSubtitle();
      render();
    });
    row.querySelector("[data-action='rename']").addEventListener('click', async e => {
      e.stopPropagation();
      await renameClass(name);
    });
    row.querySelector("[data-action='delete']").addEventListener('click', async e => {
      e.stopPropagation();
      if (confirm(`Klasse "${name}" wirklich loeschen?`)) await deleteClass(name);
    });
    list.appendChild(row);
  });
}

async function deleteClass(name) {
  await Promise.all([
    db.from('classes').delete().eq('name', name),
    db.from('students').delete().eq('class_name', name),
    db.from('week_data').delete().eq('class_name', name)
  ]);
  const classes = await loadClasses();
  if (!classes.includes(loadActiveClass())) {
    if (classes.length === 0) {
      await db.from('classes').upsert({ name: DEFAULT_CLASS });
      saveActiveClass(DEFAULT_CLASS);
    } else {
      saveActiveClass(classes[0]);
    }
    currentThursday = getThursdayOfWeek(new Date());
    updateClassSubtitle();
    render();
  }
  renderClassModal();
}

async function renameClass(oldName) {
  const newName = prompt('Klasse umbenennen:', oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;
  const trimmed = newName.trim();
  const classes = await loadClasses();
  if (classes.includes(trimmed)) return;

  await db.from('classes').insert({ name: trimmed });
  await db.from('classes').delete().eq('name', oldName);

  const { data: stuData } = await db.from('students').select('names').eq('class_name', oldName).single();
  if (stuData) {
    await db.from('students').upsert({ class_name: trimmed, names: stuData.names });
    await db.from('students').delete().eq('class_name', oldName);
  }

  const { data: wdRows } = await db.from('week_data').select('*').eq('class_name', oldName);
  if (wdRows && wdRows.length > 0) {
    const newRows = wdRows.map(r => ({
      ...r,
      id: r.id.replace(oldName + '_', trimmed + '_'),
      class_name: trimmed
    }));
    await db.from('week_data').upsert(newRows);
    await db.from('week_data').delete().eq('class_name', oldName);
  }

  if (loadActiveClass() === oldName) {
    saveActiveClass(trimmed);
    updateClassSubtitle();
  }
  renderClassModal();
  render();
}

async function openClassModal() {
  await renderClassModal();
  document.getElementById('classModal').classList.remove('hidden');
}

function closeClassModal() {
  document.getElementById('classModal').classList.add('hidden');
  document.getElementById('classNameInput').value = '';
}

function updateClassSubtitle() {
  document.getElementById('classSubtitle').textContent = loadActiveClass();
}

document.getElementById('classBtn').addEventListener('click', openClassModal);
document.getElementById('classModalClose').addEventListener('click', closeClassModal);
document.getElementById('classModal').addEventListener('click', e => {
  if (e.target === document.getElementById('classModal')) closeClassModal();
});

document.getElementById('classAddBtn').addEventListener('click', async () => {
  const name = document.getElementById('classNameInput').value.trim();
  if (!name) return;
  await db.from('classes').upsert({ name });
  await db.from('students').upsert({ class_name: name, names: [] });
  saveActiveClass(name);
  currentThursday = getThursdayOfWeek(new Date());
  closeClassModal();
  updateClassSubtitle();
  render();
});

document.getElementById('classNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('classAddBtn').click();
});

// ── Start ─────────────────────────────────────────────────────
updateClassSubtitle();
render();
