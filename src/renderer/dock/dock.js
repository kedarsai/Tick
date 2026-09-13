'use strict';
/* The suite dock. Launches apps, shows whether the clock is running, and gets
   out of the way when told. Like the pet, it is a click-through window: only
   the drawn bar takes the mouse. */

const $ = (id) => document.getElementById(id);
const body = document.body;

const el = {
  bar: $('bar'), apps: $('apps'), grip: $('grip'), tab: $('tab'),
  btnCollapse: $('btnCollapse'), timerChip: $('timerChip'),
  chipTime: $('chipTime'), tabTime: $('tabTime')
};

const MODE_COLOR = { focus: '#f48f2d', short: '#2f8577', long: '#7b5ea7', stopwatch: '#d9a92c' };

let collapsed = false;
let interactive = false;
let state = null;

// ------------------------------------------------------------------- apps
el.apps.innerHTML = SuiteApps.list.map((app) => `
  <button class="appBtn" data-app="${app.id}" data-name="${app.name}"
          style="--app-accent:${app.accent}" title="${app.name} - ${app.blurb}">
    ${app.icon}
  </button>`).join('') + (SuiteApps.companions.length ? '<div class="bar__sep"></div>' : '') +
  SuiteApps.companions.map((app) => `
  <button class="appBtn appBtn--companion" data-launch="${app.id}" data-name="${app.name}"
          style="--app-accent:${app.accent}" title="${app.name} - ${app.blurb}">
    ${app.icon}
  </button>`).join('');

el.apps.addEventListener('click', (e) => {
  const btn = e.target.closest('.appBtn');
  if (!btn) return;
  if (btn.dataset.launch) {
    btn.classList.remove('is-launching');
    void btn.offsetWidth;
    btn.classList.add('is-launching');
    window.tick.bar.launch(btn.dataset.launch);
    return;
  }
  window.tick.bar.openApp(btn.dataset.app);
});

el.timerChip.addEventListener('click', () => window.tick.bar.openApp('timer'));

// -------------------------------------------------------------- collapsing
function setCollapsed(next) {
  collapsed = !!next;
  body.dataset.collapsed = collapsed ? 'true' : 'false';
  el.tab.hidden = !collapsed;
}

el.btnCollapse.addEventListener('click', () => {
  setCollapsed(true);
  window.tick.bar.collapse(true);
});

el.tab.addEventListener('click', (e) => {
  if (tabDragged) return;          // a drag should not also open it
  e.preventDefault();
  setCollapsed(false);
  window.tick.bar.collapse(false);
});

window.tick.onBarState(({ collapsed: isCollapsed }) => setCollapsed(isCollapsed));

// ------------------------------------------------------------- click-through
function setInteractive(next) {
  if (next === interactive) return;
  interactive = next;
  window.tick.widget.setInteractive(next);
}

function hitTest(x, y) {
  const target = document.elementFromPoint(x, y);
  return !!(target && target.closest('.solid'));
}

window.tick.onCursor(({ x, y }) => {
  const inside = x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
  if (!drag) setInteractive(inside && hitTest(x, y));
});

// -------------------------------------------------------------------- drag
let drag = null;
let tabDragged = false;

function beginGrab(e) {
  if (e.button !== 0) return;
  drag = { sx: e.screenX, sy: e.screenY, moved: false, target: e.currentTarget };
  tabDragged = false;
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
}

function moveGrab(e) {
  if (!drag || drag.moved) return;
  if (Math.hypot(e.screenX - drag.sx, e.screenY - drag.sy) < 4) return;
  drag.moved = true;
  body.dataset.dragging = 'true';
  window.tick.widget.dragStart();
}

function endGrab(e) {
  if (!drag) return;
  const wasDrag = drag.moved;
  try { drag.target.releasePointerCapture(e.pointerId); } catch (_) { /* fine */ }
  drag = null;
  if (wasDrag) {
    body.dataset.dragging = 'false';
    window.tick.widget.dragEnd();
    tabDragged = true;
    setTimeout(() => { tabDragged = false; }, 120);
  }
}

for (const handle of [el.grip, el.tab]) {
  handle.addEventListener('pointerdown', beginGrab);
  handle.addEventListener('pointermove', moveGrab);
  handle.addEventListener('pointerup', endGrab);
  handle.addEventListener('pointercancel', () => { drag = null; body.dataset.dragging = 'false'; });
}

// ------------------------------------------------------------------ timer
window.tick.onState((next) => {
  state = next;
  const running = next.status !== 'idle';
  body.dataset.running = running ? 'true' : 'false';
  document.documentElement.style.setProperty('--chip-accent',
    MODE_COLOR[next.mode] || MODE_COLOR.focus);

  const label = running
    ? Fmt.clock(next.kind === 'countup' ? next.elapsedMs : next.remainingMs)
    : 'Idle';
  el.chipTime.textContent = label;
  el.tabTime.textContent = running ? label : 'Suite';
  el.timerChip.title = running
    ? `${next.modeLabel}${next.task ? ' - ' + next.task : ''}`
    : 'Open the timer';
});

(async function boot() {
  state = await window.tick.timer.getState();
  const settings = await window.tick.settings.get();
  setCollapsed(!!settings.barCollapsed);
})();
