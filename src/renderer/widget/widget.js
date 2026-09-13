'use strict';
/* The desk pet. Owns three jobs: show the time at a glance, stay out of the
   way (click-through everywhere it isn't drawn), and have a bit of a life. */

const $ = (id) => document.getElementById(id);
const body = document.body;

const el = {
  pet: $('pet'), petWrap: $('petWrap'), panel: $('panel'), bubble: $('bubble'),
  bubbleText: $('bubbleText'), badge: $('badge'), badgeTime: $('badgeTime'),
  badgeLabel: $('badgeLabel'), taskInput: $('taskInput'), modes: $('modes'),
  panelMode: $('panelMode'), idleActions: $('idleActions'), runActions: $('runActions'),
  confetti: $('confetti'),
  btnStart: $('btnStart'), btnPause: $('btnPause'), btnStop: $('btnStop'),
  btnExtend: $('btnExtend'), btnDesk: $('btnDesk'), btnHide: $('btnHide'),
  btnDock: $('btnDock'), dock: $('dock'), dockTab: $('dockTab'),
  dockPet: $('dockPet'), dockTime: $('dockTime'), dockRingFill: $('dockRingFill')
};

// Mode colours. The progress collar always wears the mode, so you can tell
// focus from a break no matter which creature you picked.
const MODE_COLOR = { focus: '#f48f2d', short: '#2f8577', long: '#7b5ea7', stopwatch: '#d9a92c' };
const MODE_TINT = {
  focus: { light: '#ffb457', dark: '#e07a1c' },
  short: { light: '#56bba8', dark: '#2a7668' },
  long: { light: '#a58ad0', dark: '#6f57a0' },
  stopwatch: { light: '#f2cf76', dark: '#c9a13c' }
};

let RING_C = 1;
let charDef = null;
let builtSignature = '';
// Live references into the SVG the roster just drew.
const svg = { ringFill: null, handSlow: null, handFast: null, mouth: null, digits: null };

let state = null;
let settings = null;
let selectedMode = 'focus';
let panelOpen = false;
let interactive = false;
let bubbleTimer = null;
let awakeTimer = null;
let fidgetTimer = null;
let fidgetClear = null;
let chatterTimer = null;
let saidNearlyDone = false;
let saidLongRun = false;
let docked = false;
let dockBuilt = '';

const DOCK_RING_C = 2 * Math.PI * 29;

// --------------------------------------------------------------------- pet
/* Rebuilding the SVG is only needed when the creature, its costume or the face
   style changes - never on a tick. */
function buildPet() {
  const mode = (state && state.status !== 'idle') ? state.mode : selectedMode;
  const def = Characters.byId(settings && settings.characterId);
  const faceStyle = (settings && settings.faceStyle) === 'digital' ? 'digital' : 'analog';
  const signature = `${def.id}|${mode}|${faceStyle}`;
  if (signature === builtSignature) return;
  builtSignature = signature;
  charDef = def;

  const costume = def.tint ? MODE_TINT[mode] || MODE_TINT.focus : def.palette;
  el.pet.innerHTML = Characters.render(def, {
    light: costume.light,
    dark: costume.dark,
    mode: MODE_COLOR[mode] || MODE_COLOR.focus
  }, { faceStyle });

  svg.ringFill = $('ringFill');
  svg.handSlow = $('handSlow');
  svg.handFast = $('handFast');
  svg.mouth = $('mouth');
  svg.digits = $('digitalTime');
  RING_C = Characters.ringCircumference(def);
  applyPupils();
}

/* The tucked-away tab: the same creature, shrunk into a badge, with the
   session progress drawn around it. */
function buildDockPet() {
  if (!settings) return;
  const def = Characters.byId(settings.characterId);
  const mode = (state && state.status !== 'idle') ? state.mode : selectedMode;
  const signature = `${def.id}|${mode}`;
  if (signature === dockBuilt) return;
  dockBuilt = signature;

  const costume = def.tint ? MODE_TINT[mode] || MODE_TINT.focus : def.palette;
  el.dockPet.innerHTML = Characters.render(def, {
    light: costume.light,
    dark: costume.dark,
    mode: MODE_COLOR[mode] || MODE_COLOR.focus
  }, { faceStyle: 'analog' });
  el.dockRingFill.style.stroke = MODE_COLOR[mode] || MODE_COLOR.focus;
  el.dockRingFill.setAttribute('stroke-dasharray', String(DOCK_RING_C));
}

function applyScale() {
  const scale = (settings && settings.petScale) || 1;
  document.documentElement.style.setProperty('--pet-scale', String(scale));
}

function setMouth(name) {
  if (!svg.mouth || !charDef || !charDef.mouth) return;
  svg.mouth.setAttribute('d', Characters.mouthPath(name, charDef.mouth));
  svg.mouth.style.fill = name === 'celebrate' ? Characters.INK : 'none';
}

// -------------------------------------------------------------- eye contact
let pupilTarget = { x: 0, y: 0 };
let lastPointerAt = 0;

function aimEyes(clientX, clientY) {
  const box = el.pet.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height * 0.46;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const dist = Math.hypot(dx, dy) || 1;
  const reach = Math.min(4.5, dist / 14);
  pupilTarget = { x: (dx / dist) * reach, y: (dy / dist) * reach };
  applyPupils();
}

function applyPupils() {
  const t = `translate(${pupilTarget.x.toFixed(2)}px, ${pupilTarget.y.toFixed(2)}px)`;
  for (const p of document.querySelectorAll('.eye__pupil')) p.style.transform = t;
}

// When nobody is around, the eyes wander on their own.
setInterval(() => {
  if (Date.now() - lastPointerAt < 2500) return;
  pupilTarget = { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 3.5 };
  applyPupils();
}, 3200);


// --------------------------------------------------------------- behaviour
/* A pet that only reacts to the clock is a progress bar with eyes. This is the
   part that gives it a life of its own: it fidgets when you are not looking,
   reacts to being poked and carried, and has opinions about your session. */

/** Say one of this character's lines for the moment. */
function speak(event, ms) {
  if (!charDef) return;
  const line = Characters.say(charDef, event);
  if (line) say(line, ms || 3400);
}

/** Play a one-off body reaction. Never interrupts a celebration or a carry. */
function doFidget(name) {
  if (!charDef) return;
  if (body.dataset.dragging === 'true' || body.dataset.celebrate === 'true') return;
  const move = name || Characters.fidget(charDef);
  body.dataset.fidget = '';
  void el.pet.getBoundingClientRect().width;   // force a reflow so it replays
  body.dataset.fidget = move;
  clearTimeout(fidgetClear);
  fidgetClear = setTimeout(() => { body.dataset.fidget = ''; }, 2400);
}

/** Idle life: every so often it does something on its own. */
function scheduleFidget() {
  clearTimeout(fidgetTimer);
  fidgetTimer = setTimeout(() => {
    if (!panelOpen && !docked) doFidget();
    scheduleFidget();
  }, 7000 + Math.random() * 14000);
}

/** Occasional unprompted remarks. Rare enough to stay charming. */
function scheduleChatter() {
  clearTimeout(chatterTimer);
  chatterTimer = setTimeout(() => {
    if (!panelOpen && !docked && charDef) {
      const hour = new Date().getHours();
      const nocturnal = (hour >= 23 || hour < 5) && Math.random() < 0.45;
      speak(nocturnal ? 'lateNight' : 'chatter', 4200);
      doFidget();
    }
    scheduleChatter();
  }, 95000 + Math.random() * 130000);
}

// ------------------------------------------------------------- click-through
/* The window covers a 340x420 rectangle but only a pet-shaped part of it is
   drawn. Anything not over a .solid element is handed back to whatever app is
   underneath. */
function setInteractive(next) {
  if (next === interactive) return;
  interactive = next;
  window.tick.widget.setInteractive(next);
}

function hitTest(x, y) {
  const target = document.elementFromPoint(x, y);
  return !!(target && target.closest('.solid'));
}

/* The authoritative pointer feed comes from the main process: a click-through
   window does not get reliable mouse moves from Windows, and polling the real
   cursor means the pet can also watch you move around the whole screen. */
window.tick.onCursor(({ x, y }) => {
  lastPointerAt = Date.now();
  aimEyes(x, y);
  const inside = x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
  if (inside) wake();
  if (!drag) setInteractive(inside && hitTest(x, y));
  // CSS :hover never fires on a click-through window, so the tab's reach-for
  // state comes from the same cursor feed.
  if (docked) body.dataset.dockHover = inside ? 'true' : 'false';
});

// Real events still arrive once the window is interactive; they keep the eyes
// smooth between polls.
window.addEventListener('mousemove', (e) => {
  lastPointerAt = Date.now();
  aimEyes(e.clientX, e.clientY);
  wake();
}, true);

function wake() {
  body.dataset.awake = 'true';
  clearTimeout(awakeTimer);
  awakeTimer = setTimeout(() => { body.dataset.awake = 'false'; }, 4000);
}

// -------------------------------------------------------------------- drag
let drag = null;

function beginGrab(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  drag = { sx: e.screenX, sy: e.screenY, moved: false, target: e.currentTarget };
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
}

function moveGrab(e) {
  if (!drag || drag.moved) return;
  if (Math.hypot(e.screenX - drag.sx, e.screenY - drag.sy) < 4) return;
  drag.moved = true;
  body.dataset.dragging = 'true';
  hideBubble();
  window.tick.widget.dragStart();
  speak('drag', 2000);
}

function endGrab(e) {
  if (!drag) return;
  const wasDrag = drag.moved;
  try { drag.target.releasePointerCapture(e.pointerId); } catch (_) { /* fine */ }
  drag = null;
  if (wasDrag) {
    body.dataset.dragging = 'false';
    window.tick.widget.dragEnd();
    if (docked) return;
    doFidget('land');
    speak('drop', 2200);
  } else if (docked) {
    window.tick.widget.undock();
  } else {
    const wasOpen = panelOpen;
    togglePanel();
    // Closing it again reads as a poke rather than a request for controls.
    if (wasOpen) {
      doFidget('squash');
      speak('poke', 2400);
    }
  }
}

for (const grabbable of [el.pet, el.badge, el.dockTab]) {
  grabbable.addEventListener('pointerdown', beginGrab);
  grabbable.addEventListener('pointermove', moveGrab);
  grabbable.addEventListener('pointerup', endGrab);
  grabbable.addEventListener('pointercancel', () => { drag = null; body.dataset.dragging = 'false'; });
}

el.pet.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.tick.win.openApp();
});

// ------------------------------------------------------------------- panel
function togglePanel(force) {
  panelOpen = force == null ? !panelOpen : force;
  body.dataset.panel = panelOpen ? 'open' : 'closed';
  if (panelOpen) {
    wake();
    hideBubble();
    setTimeout(() => el.taskInput.focus(), 180);
  } else {
    el.taskInput.blur();
  }
}

el.modes.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  selectedMode = chip.dataset.mode;
  syncModeChips();
  if (!state || state.status === 'idle') render();
});

function syncModeChips() {
  for (const chip of el.modes.querySelectorAll('.chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.mode === selectedMode));
  }
}

function startFromPanel() {
  window.tick.timer.start({ mode: selectedMode, task: el.taskInput.value });
  togglePanel(false);
}

el.btnStart.addEventListener('click', startFromPanel);
el.btnPause.addEventListener('click', () => window.tick.timer.toggle());
el.btnStop.addEventListener('click', () => {
  window.tick.timer.stop();
  say('Logged it.', 2200);
});
el.btnExtend.addEventListener('click', () => {
  window.tick.timer.extend(5);
  say('Five more minutes.', 1800);
});
el.btnDock.addEventListener('click', () => {
  togglePanel(false);
  window.tick.widget.dock();
});
el.btnDesk.addEventListener('click', () => { togglePanel(false); window.tick.win.openApp(); });
el.btnHide.addEventListener('click', () => { togglePanel(false); window.tick.win.hideWidget(); });

el.taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startFromPanel();
  if (e.key === 'Escape') togglePanel(false);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panelOpen) togglePanel(false);
});

// ------------------------------------------------------------------ bubble
function say(text, ms = 3200) {
  el.bubbleText.textContent = text;
  el.bubble.hidden = false;
  el.bubble.style.animation = 'none';
  void el.bubble.offsetWidth;               // restart the pop
  el.bubble.style.animation = '';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(hideBubble, ms);
}

function hideBubble() {
  clearTimeout(bubbleTimer);
  el.bubble.hidden = true;
}

// ------------------------------------------------------------------- sound
let audio = null;
function chime(kind) {
  if (settings && settings.soundEnabled === false) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const vol = settings ? settings.volume : 0.5;
    const notes = kind === 'done' ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 523.25];
    notes.forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t0 = audio.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol * 0.35, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0);
      osc.stop(t0 + 0.6);
    });
  } catch (_) { /* sound is a nicety, never a failure */ }
}

// ---------------------------------------------------------------- confetti
function burstConfetti() {
  const colors = ['#f48f2d', '#e9c46a', '#c9452f', '#2f8577', '#7b5ea7', '#fff4dd'];
  for (let i = 0; i < 26; i++) {
    const bit = document.createElement('div');
    bit.className = 'confetto';
    bit.style.left = `${40 + Math.random() * 260}px`;
    bit.style.top = `${120 + Math.random() * 60}px`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDuration = `${1 + Math.random() * 0.9}s`;
    bit.style.animationDelay = `${Math.random() * 0.35}s`;
    el.confetti.appendChild(bit);
    setTimeout(() => bit.remove(), 2600);
  }
}

function celebrate() {
  body.dataset.celebrate = 'true';
  setMouth('celebrate');
  burstConfetti();
  chime('done');
  speak('complete', 4200);
  setTimeout(() => {
    body.dataset.celebrate = 'false';
    render();
  }, 2600);
}

// ------------------------------------------------------------------ render
function plannedMsForMode(mode) {
  if (!settings) return 25 * 60 * 1000;
  const map = { focus: 'focusMinutes', short: 'shortBreakMinutes', long: 'longBreakMinutes' };
  const key = map[mode];
  return key ? settings[key] * 60 * 1000 : 0;
}

function render() {
  if (!state) return;
  const running = state.status !== 'idle';
  const mode = running ? state.mode : selectedMode;

  body.dataset.mode = mode;
  body.dataset.status = state.status;
  buildPet();
  // Idle creatures potter about; working ones get their working gait.
  if (charDef) {
    body.dataset.anim = state.status === 'idle' ? charDef.idle : charDef.work;
  }

  // --- readout
  if (running) {
    const showMs = state.kind === 'countup' ? state.elapsedMs : state.remainingMs;
    el.badgeTime.textContent = Fmt.clock(showMs);
    el.badgeLabel.textContent = state.status === 'paused' ? 'paused' : state.modeLabel;
    body.dataset.urgent = String(state.kind === 'countdown' && state.remainingMs <= 10000
      && state.status === 'running');
  } else {
    const ms = plannedMsForMode(mode);
    el.badgeTime.textContent = mode === 'stopwatch' ? '00:00' : Fmt.clock(ms);
    el.badgeLabel.textContent = 'ready';
    body.dataset.urgent = 'false';
  }

  // --- collar, hands, digits
  const progress = running ? state.progress : 0;
  if (svg.ringFill) svg.ringFill.setAttribute('stroke-dashoffset', String(RING_C * (1 - progress)));

  const pivot = charDef ? `${charDef.dial.cx} ${charDef.dial.cy}` : '100 102';
  if (svg.handSlow) {
    svg.handSlow.setAttribute('transform', `rotate(${(progress * 360).toFixed(1)} ${pivot})`);
  }
  if (svg.handFast) {
    const fast = running ? ((state.elapsedMs % 60000) / 60000) * 360 : 0;
    svg.handFast.setAttribute('transform', `rotate(${fast.toFixed(1)} ${pivot})`);
  }
  if (svg.digits) svg.digits.textContent = el.badgeTime.textContent;

  if (docked) {
    buildDockPet();
    el.dockTime.textContent = el.badgeTime.textContent;
    el.dockRingFill.setAttribute('stroke-dashoffset', String(DOCK_RING_C * (1 - progress)));
  }

  // --- mood
  if (body.dataset.celebrate !== 'true') {
    if (state.status === 'running') setMouth('working');
    else if (state.status === 'paused') setMouth('flat');
    else if (body.dataset.awake === 'true' || panelOpen) setMouth('content');
    else setMouth('sleepy');
  }

  // --- panel
  el.panelMode.textContent = running ? `${state.modeLabel} in progress` : 'New session';
  el.idleActions.hidden = running;
  el.runActions.hidden = !running;
  el.btnPause.textContent = state.status === 'paused' ? 'Resume' : 'Pause';
  el.btnExtend.disabled = state.kind === 'countup';
  if (running && state.task && el.taskInput.value !== state.task
      && document.activeElement !== el.taskInput) {
    el.taskInput.value = state.task;
  }
  if (running) selectedMode = state.mode;
  syncModeChips();
}

// ------------------------------------------------------------------- wiring
window.tick.onState((next) => {
  const prev = state;
  state = next;

  if (prev) {
    if (prev.status === 'idle' && next.status === 'running') {
      saidNearlyDone = false;
      saidLongRun = false;
      chime('start');
      speak('start', 3000);
      doFidget('hop');
    } else if (prev.status === 'running' && next.status === 'paused') {
      speak('pause', 2800);
    } else if (prev.status === 'paused' && next.status === 'running') {
      speak('resume', 2400);
    } else if (prev.status !== 'idle' && next.status === 'idle'
               && body.dataset.celebrate !== 'true') {
      // A completion sets the celebrate flag first, so this really is a bail-out.
      speak('stopEarly', 3000);
    }
  }

  if (next.status === 'running') {
    if (!saidNearlyDone && next.kind === 'countdown' && next.remainingMs <= 30000) {
      saidNearlyDone = true;
      speak('nearlyDone', 2600);
    }
    if (!saidLongRun && next.elapsedMs >= 45 * 60 * 1000) {
      saidLongRun = true;
      speak('longRun', 3200);
    }
  }

  render();
});

window.tick.onFlip((isFlipped) => {
  body.dataset.flip = isFlipped ? 'true' : 'false';
});

window.tick.onDock(({ docked: isDocked, edge }) => {
  docked = !!isDocked;
  body.dataset.docked = docked ? 'true' : 'false';
  body.dataset.edge = edge || 'right';
  el.dock.hidden = !docked;
  if (docked) {
    togglePanel(false);
    hideBubble();
    buildDockPet();
  }
  render();
});

window.tick.onSettings((next) => {
  settings = next;
  applyScale();
  buildPet();
  render();
});

window.tick.onCompleted(() => celebrate());

el.petWrap.addEventListener('mouseenter', () => {
  wake();
  if (panelOpen) return;
  if (state && state.status !== 'idle' && state.task) {
    say(state.task, 2600);
  } else if (Math.random() < 0.3) {
    doFidget('lookAround');
  }
});

(async function boot() {
  settings = await window.tick.settings.get();
  state = await window.tick.timer.getState();
  if (state.status !== 'idle') selectedMode = state.mode;
  body.dataset.panel = 'closed';
  applyScale();
  syncModeChips();
  buildPet();
  render();

  scheduleFidget();
  scheduleChatter();

  // A hello, once it has settled in.
  setTimeout(() => {
    const hour = new Date().getHours();
    speak((hour >= 23 || hour < 5) ? 'lateNight' : 'greet', 3600);
  }, 1800);
})();
