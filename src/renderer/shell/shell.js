'use strict';
/* The shell: chrome, routing, and the one data client every app shares.
   Apps register themselves and get handed a container to fill. */

const $ = (id) => document.getElementById(id);
const body = document.body;

// ------------------------------------------------------------------- data
/* The whole file is a few kilobytes, so every change ships the whole snapshot
   and apps just re-render. Simple beats clever at this size. */
const DB = {
  snap: { entries: [], tasks: [], notes: [], habits: [], journal: [], stash: [], settings: {}, meta: {} },

  get(collection) { return this.snap[collection] || []; },
  get settings() { return this.snap.settings || {}; },

  async load() { this.snap = await window.tick.data.snapshot(); return this.snap; },
  add(collection, item) { return window.tick.data.add(collection, item); },
  update(collection, id, patch) { return window.tick.data.update(collection, id, patch); },
  remove(collection, id) { return window.tick.data.remove(collection, id); }
};

// ---------------------------------------------------------------- helpers
const esc = (v) => Fmt.escapeHtml(v);

/** Local YYYY-MM-DD for a date or an offset in days from today. */
function dayKey(offset = 0) {
  const d = new Date();
  if (offset) d.setDate(d.getDate() + offset);
  return Fmt.dayKey(d);
}

function parseTags(text) {
  return [...new Set((String(text).match(/#[\w-]+/g) || []).map((t) => t.slice(1).toLowerCase()))];
}

function stripTags(text) {
  return String(text).replace(/#[\w-]+/g, '').replace(/\s+/g, ' ').trim();
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Friendly relative date for a YYYY-MM-DD key. */
function dueLabel(key) {
  if (!key) return '';
  const today = dayKey();
  if (key === today) return 'Today';
  if (key === dayKey(1)) return 'Tomorrow';
  if (key === dayKey(-1)) return 'Yesterday';
  const d = new Date(`${key}T12:00:00`);
  const withinWeek = Math.abs(d - new Date(`${today}T12:00:00`)) < 7 * 86400000;
  return d.toLocaleDateString([], withinWeek
    ? { weekday: 'long' }
    : { month: 'short', day: 'numeric' });
}

let captureKeyLabel = 'Ctrl+Alt+Space';
const captureKey = () => captureKeyLabel;

const parseTask = (raw) => Parse.parseTask(raw, dayKey);

const UI = { esc, dayKey, parseTags, stripTags, debounce, dueLabel, parseTask, captureKey, DB };

// ------------------------------------------------------------------ router
const registry = new Map();
let current = null;
let currentId = null;

const Shell = {
  register(id, factory) { registry.set(id, factory); },

  open(id) {
    const app = SuiteApps.byId(registry.has(id) ? id : 'today');
    if (currentId === app.id) return;
    currentId = app.id;

    body.dataset.app = app.id;
    document.documentElement.style.setProperty('--app-accent', app.accent);
    $('tbApp').textContent = app.name.toUpperCase();
    $('tbBlurb').textContent = app.blurb;

    for (const btn of $('rail').querySelectorAll('.railBtn')) {
      btn.classList.toggle('is-on', btn.dataset.app === app.id);
    }

    const view = $('view');
    view.innerHTML = '';
    try {
      current = registry.get(app.id)(view, UI) || {};
    } catch (err) {
      // One broken app should cost you that app, not the whole desk.
      console.error(`[shell] ${app.id} failed to open:`, err);
      current = {};
      view.innerHTML = `
        <div class="page">
          <div class="card">
            <div class="card__head"><span class="stamp">${esc(app.name)} could not open</span></div>
            <div class="hint">${esc(err && err.message ? err.message : String(err))}</div>
          </div>
        </div>`;
    }
    if (current.onState && lastState) current.onState(lastState);
    window.tick.settings.update({ lastApp: app.id });
  },

  refresh() { if (current && current.refresh) current.refresh(); },
  get activeId() { return currentId; },

  /** Called once, after every app has registered itself. */
  async start() {
    await DB.load();
    lastState = await window.tick.timer.getState();
    const combo = await window.tick.capture.hotkey();
    captureKeyLabel = combo ? combo.replace('Control', 'Ctrl') : 'no hotkey';
    const slot = $('keyCapture');
    if (slot) slot.textContent = captureKeyLabel;
    body.dataset.mode = lastState.mode;
    body.dataset.status = lastState.status;
    renderMinipet();
    this.open(DB.settings.lastApp || 'today');
  }
};

// -------------------------------------------------------------------- rail
$('rail').innerHTML = SuiteApps.list.map((app) => `
  <button class="railBtn" data-app="${app.id}" style="--rail-accent:${app.accent}"
          title="${esc(app.blurb)}">
    ${app.icon}<span>${esc(app.name)}</span>
  </button>`).join('');

$('rail').addEventListener('click', (e) => {
  const btn = e.target.closest('.railBtn');
  if (btn) Shell.open(btn.dataset.app);
});

// ---------------------------------------------------------------- titlebar
$('tbMin').addEventListener('click', () => window.tick.win.minimizeApp());
$('tbMax').addEventListener('click', () => window.tick.win.toggleMaximizeApp());
$('tbClose').addEventListener('click', () => window.tick.win.closeApp());
$('tbSettings').addEventListener('click', () => openSettings(true));
$('settingsClose').addEventListener('click', () => openSettings(false));
$('btnResetWidget').addEventListener('click', () => window.tick.widget.nudgeHome());
$('btnQuit').addEventListener('click', () => window.tick.win.quit());

$('settingsDrawer').addEventListener('click', (e) => {
  if (e.target === $('settingsDrawer')) openSettings(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('settingsDrawer').hidden) openSettings(false);
});

// ---------------------------------------------------------------- settings
const MODE_COLOR = { focus: '#f48f2d', short: '#2f8577', long: '#7b5ea7', stopwatch: '#d9a92c' };
const PET_TINT = {
  focus: { light: '#ffb457', dark: '#e07a1c' },
  short: { light: '#56bba8', dark: '#2a7668' },
  long: { light: '#a58ad0', dark: '#6f57a0' },
  stopwatch: { light: '#f2cf76', dark: '#c9a13c' }
};

const SETTING_FIELDS = [
  ['setFocus', 'focusMinutes', 'number'],
  ['setShort', 'shortBreakMinutes', 'number'],
  ['setLong', 'longBreakMinutes', 'number'],
  ['setEvery', 'longBreakEvery', 'number'],
  ['setGoal', 'dailyGoalMinutes', 'number'],
  ['setVolume', 'volume', 'float'],
  ['setAutoBreak', 'autoStartBreaks', 'bool'],
  ['setAutoFocus', 'autoStartFocus', 'bool'],
  ['setSound', 'soundEnabled', 'bool']
];

function openSettings(open) {
  if (open && !DB.settings.characterId) return;
  $('settingsDrawer').hidden = !open;
  if (open) fillSettings();
}

async function fillSettings() {
  const s = DB.settings;
  if (!s) return;
  renderPetGrid();
  CatalogPanel.refresh();
  try { $('setAutoStart').checked = await window.tick.autoStart.get(); }
  catch (_) { /* the toggle just shows stale state */ }
  for (const [id, key, type] of SETTING_FIELDS) {
    const field = $(id);
    if (type === 'bool') field.checked = !!s[key];
    else field.value = s[key];
  }
}

for (const [id, key, type] of SETTING_FIELDS) {
  $(id).addEventListener('change', async () => {
    const field = $(id);
    let value;
    if (type === 'bool') {
      value = field.checked;
    } else {
      if (field.value.trim() === '') return fillSettings();
      value = type === 'float' ? parseFloat(field.value) : parseInt(field.value, 10);
      if (!Number.isFinite(value)) return fillSettings();
      const floor = (key === 'longBreakEvery' || key === 'dailyGoalMinutes' || type === 'float') ? 0 : 1;
      value = Math.max(floor, value);
      field.value = value;
    }
    await window.tick.settings.update({ [key]: value });
  });
}

function renderPetGrid() {
  const s = DB.settings;
  const chosen = s.characterId || 'tick';
  const face = s.faceStyle === 'digital' ? 'digital' : 'analog';

  $('petGrid').innerHTML = Characters.list.map((def) => {
    const costume = def.tint ? PET_TINT.focus : def.palette;
    const svg = Characters.render(def, {
      light: costume.light, dark: costume.dark, mode: MODE_COLOR.focus
    }, { faceStyle: face });
    return `
      <button class="petTile ${def.id === chosen ? 'is-on' : ''}" data-char="${def.id}"
              title="${esc(def.name)} - ${esc(def.blurb)}">
        <svg viewBox="0 0 200 200">${svg}</svg>
        <span>${esc(def.name)}</span>
      </button>`;
  }).join('');

  const def = Characters.byId(chosen);
  $('petName').textContent = def.name;
  $('petBlurb').textContent = def.blurb;
  const sample = (def.voice.start && def.voice.start[0]) || '';
  $('petQuote').textContent = sample ? `“${sample}”  ·  moves: ${def.idle}` : '';

  for (const b of $('faceSeg').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.face === face));
  }
  const scale = s.petScale || 1;
  $('setScale').value = scale;
  $('scaleOut').textContent = `${Math.round(scale * 100)}%`;
  renderMinipet();
}

function renderMinipet() {
  const s = DB.settings;
  if (!s.characterId) return;
  const def = Characters.byId(s.characterId);
  const mode = (lastState && lastState.status !== 'idle') ? lastState.mode : 'focus';
  const costume = def.tint ? PET_TINT[mode] || PET_TINT.focus : def.palette;
  $('minipet').innerHTML = Characters.render(def, {
    light: costume.light, dark: costume.dark, mode: MODE_COLOR[mode] || MODE_COLOR.focus
  }, { faceStyle: 'analog' });
}

$('petGrid').addEventListener('click', (e) => {
  const tile = e.target.closest('.petTile');
  if (tile) window.tick.settings.update({ characterId: tile.dataset.char });
});
$('faceSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) window.tick.settings.update({ faceStyle: b.dataset.face });
});
$('setScale').addEventListener('input', () => {
  $('scaleOut').textContent = `${Math.round($('setScale').value * 100)}%`;
});
$('setScale').addEventListener('change', () => {
  window.tick.settings.update({ petScale: parseFloat($('setScale').value) });
});

$('setAutoStart').addEventListener('change', async () => {
  const wanted = $('setAutoStart').checked;
  await window.tick.settings.update({ autoStart: wanted });
  const actual = await window.tick.autoStart.set(wanted);
  $('setAutoStart').checked = actual;
});

// ------------------------------------------------------------------ wiring
let lastState = null;

window.tick.onState((next) => {
  const modeChanged = !lastState || lastState.mode !== next.mode;
  lastState = next;
  body.dataset.mode = next.mode;
  body.dataset.status = next.status;

  const running = next.status !== 'idle';
  $('tbLive').hidden = !running;
  if (running) {
    $('tbLiveTime').textContent = Fmt.clock(next.kind === 'countup' ? next.elapsedMs : next.remainingMs);
    $('tbLiveTask').textContent = next.task || '';
  }
  if (modeChanged) renderMinipet();
  if (current && current.onState) current.onState(next);
});

window.tick.onData((snap) => {
  DB.snap = snap;
  Shell.refresh();
  if (!$('settingsDrawer').hidden) fillSettings();
});

window.tick.onSettings((settings) => {
  DB.snap.settings = settings;
  renderMinipet();
  if (!$('settingsDrawer').hidden) fillSettings();
  Shell.refresh();
});

window.tick.onCaptureHotkey((combo) => {
  captureKeyLabel = combo ? combo.replace('Control', 'Ctrl') : 'no hotkey';
  const slot = $('keyCapture');
  if (slot) slot.textContent = captureKeyLabel;
  Shell.refresh();
});

window.tick.onShellOpen((appId) => Shell.open(appId));
window.tick.onEntries(() => { /* the snapshot carries entries too */ });

window.Shell = Shell;
window.UI = UI;
window.DB = DB;
