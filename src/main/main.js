'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const {
  app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, screen, Notification,
  shell, clipboard, desktopCapturer, nativeImage
} = require('electron');
const { pathToFileURL } = require('url');

const { Store } = require('./store');
const { Timer, MODES } = require('./timer');
const W = require('./windows');
const launchers = require('./launchers');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
// Ctrl+Alt+4 is deliberately NOT registered here. It lives on the Start Menu
// shortcut so it works even when Tick is not running; pressing it launches a
// second instance, which the single-instance lock turns into a toggle below.
const HOTKEY_WIDGET = 'Control+Alt+5';
const HOTKEY_TOGGLE = 'Control+Alt+6';
const HOTKEY_BAR = 'Control+Alt+3';
const HOTKEY_REGION = 'Control+Alt+X';
// Capture wants Ctrl+Alt+Space, but a global hotkey belongs to whoever
// registered it first and Windows will not let us take it off a running app.
// So: ask for the preferred one, settle for the best free alternative, and keep
// checking - the moment the preferred key is released, we upgrade to it.
const CAPTURE_PREFERRED = 'Control+Alt+Space';
const CAPTURE_FALLBACKS = [
  'Control+Alt+C', 'Control+Alt+Q', 'Control+Alt+W',
  'Control+Alt+N', 'Control+Alt+7', 'Control+Shift+Space'
];
// Always held, whatever else we manage to claim. The AutoHotkey bridge
// (scripts/capture-hotkey.ahk) hooks Ctrl+Alt+Space and forwards to this, so it
// has to be a fixed address that never moves.
const CAPTURE_BRIDGE = 'Control+Alt+C';

// One instance only. A second launch behaves like pressing the hotkey, which
// makes a desktop shortcut a perfectly good way to summon the app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let store;
let timer;
let widgetWin = null;
let appWin = null;
let barWin = null;
let captureWin = null;
let shotWin = null;
let captureHotkey = null;
let captureRetry = null;
let tray = null;
let isQuitting = false;
let dragState = null;
let lastTrayRefresh = 0;
let cursorPoll = null;
let geo = null;                 // current widget geometry, follows petScale
let flipped = false;            // true when the control tray unfolds downward

app.setAppUserModelId('com.kedar.tick');

// ---------------------------------------------------------------------------
// Broadcasting
// ---------------------------------------------------------------------------
function broadcast(channel, payload) {
  for (const win of [widgetWin, appWin, barWin, captureWin]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function pushState() { broadcast('timer:state', timer.getState()); }
function pushEntries() { broadcast('entries:changed', store.entries); }
function pushSettings() { broadcast('settings:changed', store.settings); }
function pushData() { broadcast('data:changed', store.snapshot()); }

// ---------------------------------------------------------------------------
// Window control
// ---------------------------------------------------------------------------
function showWidget() {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  if (store.settings.docked) {
    applyDockBounds();
  } else {
    const saved = store.settings.widgetPosition;
    const pos = saved ? W.clampToDisplay(saved.x, saved.y, geo, flipped) : W.defaultWidgetPosition(geo);
    widgetWin.setPosition(pos.x, pos.y, false);
  }
  widgetWin.showInactive();               // never steal focus from real work
  widgetWin.setAlwaysOnTop(true, 'screen-saver');
  if (!store.settings.docked) evaluateFlip();
  pushDockState();
  store.updateSettings({ widgetVisible: true });
  refreshTray();
}

// ---------------------------------------------------------------------------
// Docking: fold the creature into a tab on the nearest screen edge. The timer
// keeps running; the tab keeps showing the progress ring.
// ---------------------------------------------------------------------------
function pushDockState() {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  widgetWin.webContents.send('widget:dock', {
    docked: !!store.settings.docked,
    edge: store.settings.dockEdge || 'right'
  });
}

/** Centre of the creature on screen, right now. */
function petCentre() {
  const [x, y] = widgetWin.getPosition();
  const off = W.petOffsets(geo, flipped);
  return { x: Math.round(x + geo.slackX + geo.petW / 2), y: Math.round(y + off.top + geo.petH / 2) };
}

function applyDockBounds() {
  const saved = store.settings.dockPosition;
  const edge = store.settings.dockEdge || 'right';
  const pos = saved
    ? W.dockPosition(saved.y + W.DOCK.height / 2, edge, { x: saved.x, y: saved.y })
    : W.dockPosition(petCentre().y, edge, petCentre());
  widgetWin.setBounds({ x: pos.x, y: pos.y, width: W.DOCK.width, height: W.DOCK.height });
  store.updateSettings({ dockPosition: pos });
}

function dockWidget(edge) {
  if (!widgetWin || widgetWin.isDestroyed() || store.settings.docked) return;
  const [x, y] = widgetWin.getPosition();
  const centre = petCentre();
  const side = edge || W.nearestEdge(centre);
  const pos = W.dockPosition(centre.y, side, centre);

  store.updateSettings({
    undockedPosition: { x, y },     // so it comes back exactly where it was
    docked: true,
    dockEdge: side,
    dockPosition: pos
  });
  widgetWin.setBounds({ x: pos.x, y: pos.y, width: W.DOCK.width, height: W.DOCK.height });
  pushDockState();
  refreshTray();
}

function undockWidget() {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  store.updateSettings({ docked: false });
  const saved = store.settings.undockedPosition || store.settings.widgetPosition;
  const pos = saved
    ? W.clampToDisplay(saved.x, saved.y, geo, flipped)
    : W.defaultWidgetPosition(geo);
  widgetWin.setBounds({ x: pos.x, y: pos.y, width: geo.width, height: geo.height });
  store.updateSettings({ widgetPosition: pos });
  evaluateFlip();
  pushDockState();
  refreshTray();
}

/** After dragging the tab, snap it back to whichever edge is now nearest. */
function snapDock() {
  if (!widgetWin || widgetWin.isDestroyed() || !store.settings.docked) return;
  const [x, y] = widgetWin.getPosition();
  const centre = { x: Math.round(x + W.DOCK.width / 2), y: Math.round(y + W.DOCK.height / 2) };
  const side = W.nearestEdge(centre);
  const pos = W.dockPosition(centre.y, side, centre);
  widgetWin.setBounds({ x: pos.x, y: pos.y, width: W.DOCK.width, height: W.DOCK.height });
  store.updateSettings({ dockEdge: side, dockPosition: pos });
  pushDockState();
}

function hideWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.hide();
  store.updateSettings({ widgetVisible: false });
  refreshTray();
}

function openApp({ focusTask = false } = {}) {
  if (!appWin || appWin.isDestroyed()) appWin = buildAppWindow();
  if (appWin.isMinimized()) appWin.restore();

  // Windows refuses to hand the foreground to a process that is not already
  // there, and a plain show() drops the window at the BOTTOM of the z-order -
  // so a desk summoned by the shortcut key opens behind everything. Pin it
  // above the stack, and only unpin once it has genuinely been focused;
  // unpinning on a timer just lets it sink again.
  appWin.setAlwaysOnTop(true, 'screen-saver');
  appWin.show();
  appWin.moveTop();
  appWin.focus();

  const unpin = () => {
    if (appWin && !appWin.isDestroyed()) appWin.setAlwaysOnTop(false);
  };
  appWin.once('focus', unpin);
  setTimeout(unpin, 8000);        // never leave it pinned forever

  if (focusTask) {
    if (appWin.webContents.isLoading()) {
      appWin.webContents.once('did-finish-load', () => appWin.webContents.send('ui:focus-task'));
    } else {
      appWin.webContents.send('ui:focus-task');
    }
  }
}

function hideApp() {
  if (appWin && !appWin.isDestroyed()) appWin.hide();
  if (store.settings.widgetVisible !== false) showWidget();
}

function toggleApp() {
  const open = appWin && !appWin.isDestroyed() && appWin.isVisible() && !appWin.isMinimized();
  if (open) hideApp(); else openApp({ focusTask: true });
}

function buildAppWindow() {
  const win = W.createAppWindow();
  win.on('close', (e) => {
    // Closing the desk just puts the pet back on its perch; only tray > Quit
    // actually ends the process.
    if (!isQuitting) {
      e.preventDefault();
      hideApp();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}

// ---------------------------------------------------------------------------
// Widget dragging: driven from the main process by polling the cursor, which
// survives the pointer outrunning the window and needs no OS drag regions.
// ---------------------------------------------------------------------------
function startDrag(win) {
  const target = win || widgetWin;
  if (!target || target.isDestroyed()) return;
  stopDrag();
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = target.getPosition();
  const isBar = target === barWin;
  dragState = {
    win: target,
    isBar,
    offsetX: cursor.x - wx,
    offsetY: cursor.y - wy,
    interval: setInterval(() => {
      if (!dragState || !dragState.win || dragState.win.isDestroyed()) return stopDrag();
      const p = screen.getCursorScreenPoint();
      const rawX = p.x - dragState.offsetX;
      const rawY = p.y - dragState.offsetY;
      let next;
      if (dragState.isBar) next = W.clampBar(rawX, rawY);
      else if (store.settings.docked) next = { x: Math.round(rawX), y: Math.round(rawY) };
      else next = W.clampToDisplay(rawX, rawY, geo, flipped);
      dragState.win.setPosition(next.x, next.y, false);
    }, 16)
  };
}

function stopDrag({ persist = false } = {}) {
  const wasBar = dragState && dragState.isBar;
  if (dragState) clearInterval(dragState.interval);
  dragState = null;
  if (persist && wasBar && barWin && !barWin.isDestroyed()) {
    const [x, y] = barWin.getPosition();
    store.updateSettings({ barPosition: { x, y } });
    return;
  }
  if (persist && widgetWin && !widgetWin.isDestroyed()) {
    if (store.settings.docked) {
      snapDock();
    } else {
      const [x, y] = widgetWin.getPosition();
      store.updateSettings({ widgetPosition: { x, y } });
      evaluateFlip();
    }
  }
}

/* The control tray and speech bubble normally unfold upward. Perched near the
   top of a screen there is no room for that, so they flip below the creature -
   and the window shifts to keep the creature itself exactly where it was. */
const FLIP_MARGIN = 40;

function petScreenTop() {
  const [, y] = widgetWin.getPosition();
  return y + W.petOffsets(geo, flipped).top;
}

function evaluateFlip() {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  const [x, y] = widgetWin.getPosition();
  const area = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
  const want = petScreenTop() < area.y + geo.panelReserve + FLIP_MARGIN;
  if (want === flipped) return;

  const shift = geo.panelReserve - geo.flipTop;
  flipped = want;
  const moved = W.clampToDisplay(x, want ? y + shift : y - shift, geo, flipped);
  widgetWin.setPosition(moved.x, moved.y, false);
  widgetWin.webContents.send('widget:flip', flipped);
  store.updateSettings({ widgetPosition: { x: moved.x, y: moved.y } });
}

/** Grow or shrink the pet, keeping the creature's feet where they were. */
function resizeWidget(scale) {
  const next = W.widgetGeometry(scale);
  if (!widgetWin || widgetWin.isDestroyed()) { geo = next; return; }
  if (store.settings.docked) { geo = next; return; }   // the tab is a fixed size

  const [x, y] = widgetWin.getPosition();
  const anchoredX = Math.round(x + (geo.width - next.width) / 2);
  const anchoredY = y + (geo.height - next.height);
  geo = next;

  const pos = W.clampToDisplay(anchoredX, anchoredY, geo, flipped);
  widgetWin.setBounds({ x: pos.x, y: pos.y, width: geo.width, height: geo.height });
  store.updateSettings({ widgetPosition: { x: pos.x, y: pos.y } });
  evaluateFlip();
}

// ---------------------------------------------------------------------------
// Starting with Windows
//
// The app owns this rather than a shortcut in the Startup folder: a login item
// can be toggled from Settings, and there is exactly one of it, so there is no
// way to end up launching twice.
// ---------------------------------------------------------------------------
const APP_ROOT = path.join(__dirname, '..', '..');
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_NAME = 'Tick';

function legacyStartupShortcut() {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows',
    'Start Menu', 'Programs', 'Startup', 'Tick.lnk');
}

/* The Run key is a single command line, so every path in it has to be quoted -
   this one lives under "Claude Projects", and an unquoted space turns the
   command into nonsense at login. Electron's setLoginItemSettings does not
   quote, so we write the value ourselves. */
function autoStartCommand() {
  const parts = [`"${process.execPath}"`];
  if (!app.isPackaged) parts.push(`"${APP_ROOT}"`);
  parts.push('--background');
  return parts.join(' ');
}

function reg(args) {
  return execFileSync('reg', args, { encoding: 'utf8', windowsHide: true });
}

function isAutoStartOn() {
  try {
    const out = reg(['query', RUN_KEY, '/v', RUN_NAME]);
    return out.toLowerCase().includes(process.execPath.toLowerCase());
  } catch (_) {
    return false;              // reg exits non-zero when the value is absent
  }
}

function setAutoStart(enabled) {
  try {
    if (enabled) {
      reg(['add', RUN_KEY, '/v', RUN_NAME, '/t', 'REG_SZ', '/d', autoStartCommand(), '/f']);
    } else {
      try { reg(['delete', RUN_KEY, '/v', RUN_NAME, '/f']); } catch (_) { /* already gone */ }
    }
  } catch (err) {
    console.error('[autostart] could not update the Run key:', err.message);
  }

  // Clean up the two ways older builds did this. Either one left behind would
  // launch a second copy at login.
  try { reg(['delete', RUN_KEY, '/v', 'com.kedar.tick', '/f']); } catch (_) { /* fine */ }
  try {
    const legacy = legacyStartupShortcut();
    if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
  } catch (_) { /* not important enough to fail over */ }

  return isAutoStartOn();
}

// ---------------------------------------------------------------------------
// The suite dock
// ---------------------------------------------------------------------------
function showBar() {
  if (!barWin || barWin.isDestroyed()) return;
  const saved = store.settings.barPosition;
  const pos = saved ? W.clampBar(saved.x, saved.y) : W.defaultBarPosition();
  barWin.setPosition(pos.x, pos.y, false);
  barWin.showInactive();
  barWin.setAlwaysOnTop(true, 'screen-saver');
  barWin.webContents.send('bar:state', { collapsed: !!store.settings.barCollapsed });
}

function toggleBar() {
  if (!barWin || barWin.isDestroyed()) return;
  if (barWin.isVisible()) barWin.hide(); else showBar();
  refreshTray();
}

/** Open the shell on a particular app. */
function openAppView(appId) {
  if (appId) store.updateSettings({ lastApp: appId });
  openApp();
  const send = () => appWin.webContents.send('shell:open', appId || store.settings.lastApp);
  if (appWin.webContents.isLoading()) appWin.webContents.once('did-finish-load', send);
  else send();
}

// ---------------------------------------------------------------------------
// Quick capture
//
// One keystroke from anywhere, straight into the inbox. Nothing is classified
// here - deciding what a thought *is* costs more than writing it down, so that
// decision is deferred to triage.
// ---------------------------------------------------------------------------
function showCapture() {
  if (!captureWin || captureWin.isDestroyed()) return;
  const pos = W.capturePosition();
  captureWin.setPosition(pos.x, pos.y, false);
  // Summoned by a hotkey, so it has to fight the foreground lock like the desk.
  captureWin.setAlwaysOnTop(true, 'screen-saver');
  captureWin.show();
  captureWin.moveTop();
  captureWin.focus();
  captureWin.webContents.focus();
  captureWin.webContents.send('capture:open');
  // Another top-most window can land above us in the same frame; re-assert once.
  setTimeout(() => {
    if (!captureWin || captureWin.isDestroyed() || !captureWin.isVisible()) return;
    captureWin.setAlwaysOnTop(true, 'screen-saver');
    captureWin.moveTop();
  }, 80);
}

function hideCapture() {
  if (captureWin && !captureWin.isDestroyed() && captureWin.isVisible()) captureWin.hide();
}

function toggleCapture() {
  if (captureWin && captureWin.isVisible()) hideCapture(); else showCapture();
}

function grab(combo) {
  try { return globalShortcut.register(combo, () => toggleCapture()); }
  catch (_) { return false; }
}

/** Claim the best capture hotkey available right now. */
function claimCaptureHotkey() {
  const preferred = store.settings.captureHotkey || CAPTURE_PREFERRED;
  if (captureHotkey === preferred) return captureHotkey;

  // Always try the preferred one first, so a fallback gets upgraded later.
  if (grab(preferred)) {
    if (captureHotkey) globalShortcut.unregister(captureHotkey);
    captureHotkey = preferred;
    announceHotkey();
    return captureHotkey;
  }

  if (captureHotkey) return captureHotkey;      // a fallback already works

  for (const combo of CAPTURE_FALLBACKS) {
    if (grab(combo)) {
      captureHotkey = combo;
      announceHotkey();
      return captureHotkey;
    }
  }
  console.warn('[hotkey] no capture shortcut could be registered');
  return null;
}

/** A fixed second door, so an external hook always has somewhere to knock. */
function holdBridgeHotkey() {
  if (captureHotkey === CAPTURE_BRIDGE) return;      // already ours
  if (globalShortcut.isRegistered(CAPTURE_BRIDGE)) return;
  grab(CAPTURE_BRIDGE);
}

function announceHotkey() {
  broadcast('capture:hotkey', captureHotkey);
  refreshTray();
}

/** Cheap watch so releasing the preferred key hands it straight to us. */
function watchCaptureHotkey() {
  if (captureRetry) clearInterval(captureRetry);
  captureRetry = setInterval(() => {
    const preferred = store.settings.captureHotkey || CAPTURE_PREFERRED;
    if (captureHotkey !== preferred) claimCaptureHotkey();
    holdBridgeHotkey();
  }, 15000);
}

// ---------------------------------------------------------------------------
// Region screenshots
//
// Freeze the screen first, then let you drag a rectangle over the frozen copy.
// Picking from a still image means the selection is exactly what was there when
// you reached for the camera - no windows shuffling underneath you.
// ---------------------------------------------------------------------------
const SHOTS_DIR = () => path.join(app.getPath('userData'), 'shots');

async function grabDisplay(display) {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor)
    }
  });
  const match = sources.find((s) => String(s.display_id) === String(display.id));
  return (match || sources[0] || {}).thumbnail || null;
}

/** Full-screen picker over the frozen image. Resolves to a rect, or null. */
function pickRegion(display, image) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (rect) => {
      if (settled) return;
      settled = true;
      try { ipcMain.removeHandler('shot:picked'); } catch (_) { /* fine */ }
      if (shotWin && !shotWin.isDestroyed()) shotWin.destroy();
      shotWin = null;
      resolve(rect);
    };

    ipcMain.handleOnce('shot:picked', (_e, rect) => { finish(rect); return true; });

    shotWin = W.createShotWindow(display);
    shotWin.on('closed', () => finish(null));      // never leave the promise hanging
    shotWin.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error('[shot] the region overlay failed to load:', code, desc);
      finish(null);
    });
    shotWin.webContents.once('did-finish-load', () => {
      if (!shotWin || shotWin.isDestroyed()) return;
      shotWin.webContents.send('shot:image', { url: image.toDataURL() });
      shotWin.show();
      shotWin.moveTop();
      shotWin.focus();
      shotWin.webContents.focus();
    });
  });
}

function saveShot(image, rect, display) {
  const size = image.getSize();
  const sx = size.width / display.bounds.width;
  const sy = size.height / display.bounds.height;
  const crop = {
    x: Math.max(0, Math.round(rect.x * sx)),
    y: Math.max(0, Math.round(rect.y * sy)),
    width: Math.max(1, Math.round(rect.width * sx)),
    height: Math.max(1, Math.round(rect.height * sy))
  };
  const cropped = image.crop(crop);

  const dir = SHOTS_DIR();
  fs.mkdirSync(dir, { recursive: true });
  const id = crypto.randomUUID();
  const full = path.join(dir, `${id}.png`);
  const thumb = path.join(dir, `${id}-thumb.png`);
  fs.writeFileSync(full, cropped.toPNG());
  fs.writeFileSync(thumb, cropped.resize({ width: Math.min(420, crop.width) }).toPNG());

  return {
    id,
    path: full,
    thumbPath: thumb,
    url: pathToFileURL(full).href,
    thumbUrl: pathToFileURL(thumb).href,
    width: crop.width,
    height: crop.height
  };
}

/** Hide our own floating furniture so it never ends up in your screenshot. */
function withOurWindowsHidden(fn) {
  const hidden = [];
  for (const win of [captureWin, barWin, widgetWin]) {
    if (win && !win.isDestroyed() && win.isVisible()) { win.hide(); hidden.push(win); }
  }
  const restore = () => {
    for (const win of hidden) {
      if (win && !win.isDestroyed() && win !== captureWin) win.showInactive();
    }
  };
  return fn().finally(restore);
}

async function captureRegion() {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);

  return withOurWindowsHidden(async () => {
    await new Promise((r) => setTimeout(r, 220));   // let the windows actually go
    const image = await grabDisplay(display);
    if (!image) return null;
    const rect = await pickRegion(display, image);
    if (!rect || rect.width < 4 || rect.height < 4) return null;   // cancelled
    return saveShot(image, rect, display);
  });
}

/** A region grabbed on its own goes straight to the inbox, no typing. */
async function regionToInbox() {
  const shot = await captureRegion();
  if (!shot) return null;
  const created = store.add('inbox', { text: '', shot, source: 'region', triaged: false });
  pushData();
  return created;
}

// ---------------------------------------------------------------------------
// Cursor feed
//
// A click-through window does not reliably receive forwarded mouse moves on
// Windows, so the main process polls the real cursor and hands the widget
// window-relative coordinates. The widget uses them both to decide whether the
// pixel under the pointer is solid and to aim the pet's eyes.
// ---------------------------------------------------------------------------
function startCursorPoll() {
  if (cursorPoll) return;
  cursorPoll = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    for (const win of [widgetWin, barWin]) {
      if (!win || win.isDestroyed() || !win.isVisible()) continue;
      const [wx, wy] = win.getPosition();
      win.webContents.send('widget:cursor', { x: p.x - wx, y: p.y - wy });
    }
  }, 55);
}

function stopCursorPoll() {
  if (cursorPoll) clearInterval(cursorPoll);
  cursorPoll = null;
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function buildTray() {
  tray = new Tray(path.join(ASSETS, 'tray.png'));
  tray.setToolTip('Tick');
  refreshTray();
  // Only 'click' - Windows also fires it for each half of a double-click, so
  // handling both would toggle the window three times on a double-click.
  tray.on('click', () => toggleApp());
}

function refreshTray() {
  if (!tray) return;
  const s = timer.getState();
  const running = s.status !== 'idle';
  const clock = fmt(s.kind === 'countup' ? s.elapsedMs : s.remainingMs);
  const widgetHidden = store.settings.widgetVisible === false;

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: running ? `${s.modeLabel} - ${clock}` : 'Tick - idle', enabled: false },
    { type: 'separator' },
    { label: `Quick capture (${prettyKey(captureHotkey)})`, click: () => showCapture() },
    { label: 'Grab a screen region (Ctrl+Alt+X)', click: () => regionToInbox() },
    { label: 'Open the desk (Ctrl+Alt+4)', click: () => openAppView() },
    {
      label: barWin && barWin.isVisible() ? 'Hide the dock (Ctrl+Alt+3)' : 'Show the dock (Ctrl+Alt+3)',
      click: () => toggleBar()
    },
    {
      label: widgetHidden ? 'Show widget (Ctrl+Alt+5)' : 'Hide widget (Ctrl+Alt+5)',
      click: () => (widgetHidden ? showWidget() : hideWidget())
    },
    {
      label: store.settings.docked ? 'Bring the pet back' : 'Tuck pet to the edge',
      click: () => (store.settings.docked ? undockWidget() : dockWidget())
    },
    { label: 'Reset widget position', click: () => nudgeHome() },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: isAutoStartOn(),
      click: (item) => {
        store.updateSettings({ autoStart: item.checked });
        setAutoStart(item.checked);
        refreshTray();
      }
    },
    { type: 'separator' },
    { label: 'Start focus session', enabled: !running, click: () => timer.start({ mode: 'focus' }) },
    { label: s.status === 'running' ? 'Pause' : 'Resume', enabled: running, click: () => timer.toggle() },
    { label: 'Stop and log', enabled: running, click: () => timer.stop() },
    { type: 'separator' },
    { label: 'Quit Tick', click: () => { isQuitting = true; app.quit(); } }
  ]));

  tray.setToolTip(running
    ? `Tick - ${s.modeLabel} ${clock}${s.task ? ' - ' + s.task : ''}`
    : 'Tick - idle');
}

function nudgeHome() {
  if (store.settings.docked) store.updateSettings({ docked: false });
  const pos = W.defaultWidgetPosition(geo);
  if (widgetWin && !widgetWin.isDestroyed()) {
    widgetWin.setBounds({ x: pos.x, y: pos.y, width: geo.width, height: geo.height });
  }
  store.updateSettings({ widgetPosition: pos, undockedPosition: pos });
  pushDockState();
  refreshTray();
}

/** 'Control+Alt+C' reads better as 'Ctrl+Alt+C'. */
function prettyKey(combo) {
  return combo ? combo.replace('Control', 'Ctrl') : 'not available';
}

function fmt(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function wireIpc() {
  ipcMain.handle('timer:get', () => timer.getState());
  ipcMain.handle('timer:start', (_e, opts) => timer.start(opts || {}));
  ipcMain.handle('timer:pause', () => timer.pause());
  ipcMain.handle('timer:resume', () => timer.resume());
  ipcMain.handle('timer:toggle', () => timer.toggle());
  ipcMain.handle('timer:stop', () => timer.stop());
  ipcMain.handle('timer:extend', (_e, minutes) => timer.extend(minutes));

  ipcMain.handle('entries:list', () => store.entries);
  ipcMain.handle('entries:update', (_e, { id, patch }) => {
    const updated = store.updateEntry(id, patch);
    pushEntries();
    pushData();
    return updated;
  });
  ipcMain.handle('entries:delete', (_e, id) => {
    const ok = store.deleteEntry(id);
    pushEntries();
    return ok;
  });
  ipcMain.handle('entries:add', (_e, entry) => {
    const created = store.addEntry({ ...entry, id: entry.id || crypto.randomUUID() });
    pushEntries();
    return created;
  });

  ipcMain.handle('settings:get', () => store.settings);
  ipcMain.handle('settings:update', (_e, patch) => {
    const scaleChanged = patch && patch.petScale != null
      && W.clampScale(patch.petScale) !== geo.scale;
    const next = store.updateSettings(patch || {});
    if (scaleChanged) resizeWidget(next.petScale);
    pushSettings();
    refreshTray();
    return next;
  });

  ipcMain.handle('win:open-app', () => openApp());
  ipcMain.handle('win:minimize-app', () => hideApp());
  ipcMain.handle('win:toggle-maximize-app', () => {
    if (!appWin || appWin.isDestroyed()) return false;
    if (appWin.isMaximized()) appWin.unmaximize(); else appWin.maximize();
    return appWin.isMaximized();
  });
  ipcMain.handle('win:close-app', () => hideApp());
  ipcMain.handle('win:show-widget', () => showWidget());
  ipcMain.handle('win:hide-widget', () => hideWidget());
  ipcMain.handle('win:quit', () => { isQuitting = true; app.quit(); });

  ipcMain.handle('widget:drag-start', (e) => startDrag(BrowserWindow.fromWebContents(e.sender)));
  ipcMain.handle('widget:drag-end', () => stopDrag({ persist: true }));
  ipcMain.handle('widget:set-interactive', (e, interactive) => {
    // Sender-aware: both the pet and the suite dock are click-through windows.
    // forward:true keeps mousemove flowing to the renderer while clicks fall
    // through to whatever is underneath the transparent pixels.
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!interactive, { forward: true });
  });
  ipcMain.handle('widget:nudge-home', () => nudgeHome());
  ipcMain.handle('widget:dock', (_e, edge) => dockWidget(edge));
  ipcMain.handle('widget:undock', () => undockWidget());
  ipcMain.handle('widget:toggle-dock', () => {
    if (store.settings.docked) undockWidget(); else dockWidget();
  });

  // ---- the suite: one generic door for every app's records ----------------
  // A bad record from one app must never take down the door every app uses.
  const guard = (label, fn) => (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      console.error(`[data] ${label} failed:`, err.message);
      return null;
    }
  };

  ipcMain.handle('data:snapshot', guard('snapshot', () => store.snapshot()));
  ipcMain.handle('data:add', guard('add', (_e, { collection, item }) => {
    const created = store.add(collection, item || {});
    pushData();
    return created;
  }));
  ipcMain.handle('data:update', guard('update', (_e, { collection, id, patch }) => {
    const updated = store.update(collection, id, patch || {});
    pushData();
    return updated;
  }));
  ipcMain.handle('data:remove', guard('remove', (_e, { collection, id }) => {
    const ok = store.remove(collection, id);
    pushData();
    return ok;
  }));

  ipcMain.handle('app:autostart-get', () => isAutoStartOn());
  ipcMain.handle('app:autostart-set', (_e, enabled) => setAutoStart(enabled));

  // Electron's clipboard beats navigator.clipboard here: no focus requirement,
  // no secure-context caveats.
  ipcMain.handle('app:copy', (_e, text) => {
    clipboard.writeText(String(text == null ? '' : text));
    return true;
  });

  // Only ever hand the OS a real web address.
  ipcMain.handle('app:open-external', (_e, url) => {
    const raw = String(url || '').trim();
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let parsed;
    try { parsed = new URL(candidate); } catch (_) { return false; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    shell.openExternal(parsed.href);
    return true;
  });

  ipcMain.handle('capture:save', (_e, payload = {}) => {
    const text = String(payload.text || '').trim();
    if (!text && !payload.shot) return null;
    const created = store.add('inbox', {
      text,
      shot: payload.shot || null,
      source: payload.source || 'quick',
      triaged: false
    });
    pushData();
    return created;
  });
  ipcMain.handle('capture:close', () => hideCapture());
  ipcMain.handle('capture:hotkey', () => captureHotkey);

  ipcMain.handle('shot:region', async () => {
    try {
      const shot = await captureRegion();
      showCapture();                 // come back with the picture in hand
      return shot;
    } catch (err) {
      console.error('[shot] region capture failed:', err.message);
      showCapture();
      return null;
    }
  });

  ipcMain.handle('app:copy-image', (_e, filePath) => {
    const target = path.resolve(String(filePath || ''));
    if (!target.startsWith(path.resolve(SHOTS_DIR()))) return false;
    const image = nativeImage.createFromPath(target);
    if (image.isEmpty()) return false;
    clipboard.writeImage(image);
    return true;
  });

  ipcMain.handle('app:open-file', (_e, filePath) => {
    const dir = SHOTS_DIR();
    const target = path.resolve(String(filePath || ''));
    // Only ever open something we saved ourselves.
    if (!target.startsWith(path.resolve(dir))) return false;
    shell.openPath(target);
    return true;
  });

  ipcMain.handle('bar:toggle', () => toggleBar());
  ipcMain.handle('bar:hide', () => { if (barWin) barWin.hide(); refreshTray(); });
  ipcMain.handle('bar:collapse', (_e, collapsed) => {
    store.updateSettings({ barCollapsed: !!collapsed });
    if (barWin && !barWin.isDestroyed()) {
      barWin.webContents.send('bar:state', { collapsed: !!collapsed });
    }
  });
  ipcMain.handle('shell:open-app', (_e, appId) => openAppView(appId));
  ipcMain.handle('bar:launch', (_e, id) => {
    const result = launchers.launch(String(id || ''));
    if (!result.ok && Notification.isSupported()) {
      new Notification({ title: 'Could not open app', body: result.error, silent: true }).show();
    }
    return result;
  });

  ipcMain.handle('app:notify', (_e, payload = {}) => {
    if (!Notification.isSupported()) return false;
    new Notification({
      title: payload.title || 'Tick',
      body: payload.body || '',
      icon: path.join(ASSETS, 'icon-256.png'),
      silent: true                   // the renderer plays its own nicer chime
    }).show();
    return true;
  });
}

// ---------------------------------------------------------------------------
// Timer wiring
// ---------------------------------------------------------------------------
function wireTimer() {
  timer.on('state', () => {
    pushState();
    const now = Date.now();          // the tray label only needs second-level truth
    if (now - lastTrayRefresh > 1000) {
      lastTrayRefresh = now;
      refreshTray();
    }
  });

  timer.on('entry', (entry) => {
    store.addEntry(entry);
    pushEntries();
    pushData();
  });

  timer.on('completed', ({ entry, mode, next }) => {
    broadcast('timer:completed', { entry, mode, next });
    if (Notification.isSupported()) {
      new Notification({
        title: mode === 'focus' ? 'Session complete' : 'Break over',
        body: mode === 'focus'
          ? 'Nice work. Time to stand up and look at something far away.'
          : 'Back to it whenever you are ready.',
        icon: path.join(ASSETS, 'icon-256.png'),
        silent: true
      }).show();
    }

    // Make sure the pet is on screen to deliver the news.
    if (store.settings.widgetVisible !== false && widgetWin && !widgetWin.isVisible()) {
      showWidget();
    }

    if (next && next.auto) {
      setTimeout(() => {
        if (timer.status === 'idle') timer.start({ mode: next.mode });
      }, 4000);
    }
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  timer = new Timer(store);

  wireIpc();
  wireTimer();

  geo = W.widgetGeometry(store.settings.petScale);
  widgetWin = W.createWidgetWindow(store.settings.petScale);
  widgetWin.on('closed', () => { widgetWin = null; });
  widgetWin.webContents.on('did-finish-load', () => {
    // Everything is click-through until the renderer reports the cursor is
    // over something solid.
    widgetWin.setIgnoreMouseEvents(true, { forward: true });
    if (store.settings.widgetVisible !== false) showWidget();
    widgetWin.webContents.send('widget:flip', flipped);
    startCursorPoll();
    pushState();
    pushSettings();
  });

  appWin = buildAppWindow();

  captureWin = W.createCaptureWindow();
  captureWin.on('closed', () => { captureWin = null; });
  captureWin.on('blur', () => hideCapture());   // click away to dismiss

  barWin = W.createBarWindow();
  barWin.on('closed', () => { barWin = null; });
  barWin.webContents.on('did-finish-load', () => {
    barWin.setIgnoreMouseEvents(true, { forward: true });
    showBar();
  });

  buildTray();

  // First run: adopt auto-start. On later runs, re-assert it - the stored
  // command contains this folder's path, so a move or a rename would otherwise
  // leave a Run entry pointing at nothing.
  if (store.settings.autoStart == null) store.updateSettings({ autoStart: true });
  if (store.settings.autoStart) {
    let current = '';
    try { current = reg(['query', RUN_KEY, '/v', RUN_NAME]); } catch (_) { /* absent */ }
    if (!current.includes(autoStartCommand())) setAutoStart(true);
  } else if (isAutoStartOn()) {
    setAutoStart(false);
  }

  const shortcuts = {
    'show widget': globalShortcut.register(HOTKEY_WIDGET, () => {
      if (!widgetWin || !widgetWin.isVisible()) { showWidget(); return; }
      if (store.settings.docked) undockWidget(); else hideWidget();
    }),
    'suite dock': globalShortcut.register(HOTKEY_BAR, () => toggleBar()),
    'quick capture': !!claimCaptureHotkey(),
    'grab a region': globalShortcut.register(HOTKEY_REGION, () => regionToInbox()),
    'play/pause': globalShortcut.register(HOTKEY_TOGGLE, () => {
      timer.toggle();
      if (widgetWin && !widgetWin.isVisible()) showWidget();
    })
  };
  for (const [name, ok] of Object.entries(shortcuts)) {
    if (!ok) console.warn(`[hotkey] could not register "${name}" - another app may already own it`);
  }
  holdBridgeHotkey();
  watchCaptureHotkey();

  if (!process.argv.includes('--background')) {
    openAppView(store.settings.lastApp);
  }

  if (process.argv.includes('--dev')) {
    appWin.show();
    appWin.webContents.openDevTools({ mode: 'detach' });
    // Surface renderer errors in the terminal; a transparent click-through
    // window is a miserable place to discover a typo.
    for (const [name, win] of [['widget', widgetWin], ['desk', appWin]]) {
      win.webContents.on('console-message', (_e, level, message, line, source) => {
        if (level >= 2) console.error(`[${name}] ${source}:${line} ${message}`);
      });
    }
  }
});

app.on('second-instance', (_e, argv) => {
  if (argv.includes('--capture')) showCapture();
  else toggleApp();
});
app.on('window-all-closed', () => { /* tray app: stay resident */ });
app.on('before-quit', () => {
  isQuitting = true;
  stopDrag();
  stopCursorPoll();
  // Bank whatever was on the clock rather than losing it on the way out.
  if (timer && timer.status !== 'idle') timer.stop({ silent: true });
  if (store) store.save({ immediate: true });
});
app.on('will-quit', () => {
  if (captureRetry) clearInterval(captureRetry);
  globalShortcut.unregisterAll();
});
