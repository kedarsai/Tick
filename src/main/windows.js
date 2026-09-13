'use strict';
const path = require('path');
const { BrowserWindow, screen } = require('electron');

const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');
const RENDERER = path.join(__dirname, '..', 'renderer');

// The creature is drawn in a 200x200 box and sits at the bottom of the window.
// Everything above it is transparent room for the speech bubble and the
// control tray, which unfold upward. Empty pixels are click-through, so the
// slack costs nothing.
const PET_BOX_W = 200;
const PET_BOX_H = 214;          // 200 of creature plus the badge overhang
const PANEL_RESERVE = 236;      // headroom the control tray needs
const FLIP_TOP = 12;            // gap above the creature once the tray flips below
const MIN_W = 340;              // the tray itself is 296 wide

const MIN_SCALE = 0.6;
const MAX_SCALE = 2;

// Tucked away: a small tab clinging to a screen edge. The window is wider than
// the tab so the time can slide out beside it on hover.
const DOCK_W = 200;
const DOCK_H = 96;
const DOCK = { width: DOCK_W, height: DOCK_H };

/** Where the tab wants to sit for a given edge and desired centre height. */
function dockPosition(centreY, edge, point) {
  const area = screen.getDisplayNearestPoint(point || { x: 0, y: Math.round(centreY) }).workArea;
  const x = edge === 'left' ? area.x : area.x + area.width - DOCK_W;
  const y = Math.round(Math.min(
    Math.max(centreY - DOCK_H / 2, area.y),
    area.y + area.height - DOCK_H
  ));
  return { x: Math.round(x), y };
}

/** Which edge is this point closest to? */
function nearestEdge(point) {
  const area = screen.getDisplayNearestPoint(point).workArea;
  return point.x > area.x + area.width / 2 ? 'right' : 'left';
}

function clampScale(scale) {
  const s = Number(scale);
  if (!Number.isFinite(s)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** Window size and the transparent margins around the creature, for a scale. */
function widgetGeometry(scale = 1) {
  const s = clampScale(scale);
  const petW = Math.round(PET_BOX_W * s);
  const petH = Math.round(PET_BOX_H * s);
  const width = Math.max(MIN_W, petW + 80);
  const height = PANEL_RESERVE + petH;
  return {
    scale: s,
    width,
    height,
    petW,
    petH,
    panelReserve: PANEL_RESERVE,
    flipTop: FLIP_TOP,
    slackX: (width - petW) / 2      // transparent gutter either side
  };
}

/** Where the creature sits inside its window, which depends on which way the
    control tray unfolds. */
function petOffsets(geo, flipped) {
  const top = flipped ? geo.flipTop : geo.panelReserve;
  return { top, bottom: geo.height - top - geo.petH };
}

function createWidgetWindow(scale = 1) {
  const geo = widgetGeometry(scale);
  const win = new BrowserWindow({
    width: geo.width,
    height: geo.height,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    type: 'toolbar',            // keeps it out of Alt+Tab on Windows
    backgroundColor: '#00000000',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  // 'screen-saver' is the highest sane level: it floats above normal windows
  // and most full-screen apps without hijacking focus.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(RENDERER, 'widget', 'index.html'));
  return win;
}

// The suite dock: a slim bar that lives at the top of the screen. The window is
// deliberately wider than the bar so the bar can be centred and still have
// transparent room either side; empty pixels are click-through.
const BAR = { width: 720, height: 92 };

function createBarWindow() {
  const win = new BrowserWindow({
    width: BAR.width,
    height: BAR.height,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    type: 'toolbar',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(RENDERER, 'dock', 'index.html'));
  return win;
}

/** Centred at the top of the primary display, just under the screen edge. */
function defaultBarPosition() {
  const a = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(a.x + (a.width - BAR.width) / 2),
    y: Math.round(a.y + 2)
  };
}

/** Keep the bar reachable: it may hang off the sides but never off the top. */
function clampBar(x, y) {
  const display = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  const a = display.workArea;
  return {
    x: Math.round(Math.min(Math.max(x, a.x - BAR.width * 0.35), a.x + a.width - BAR.width * 0.65)),
    y: Math.round(Math.min(Math.max(y, a.y - 6), a.y + a.height - 70))
  };
}

// Quick capture: a single box summoned by a hotkey from anywhere. It is the
// front door to everything, so it must cost exactly one keystroke to reach.
const CAPTURE = { width: 620, height: 190 };

function createCaptureWindow() {
  const win = new BrowserWindow({
    width: CAPTURE.width,
    height: CAPTURE.height,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(RENDERER, 'capture', 'index.html'));
  return win;
}

/** Centred, a little above the middle - where your eyes already are. */
function capturePosition() {
  const point = screen.getCursorScreenPoint();
  const a = screen.getDisplayNearestPoint(point).workArea;
  return {
    x: Math.round(a.x + (a.width - CAPTURE.width) / 2),
    y: Math.round(a.y + a.height * 0.22)
  };
}

/* The region picker: a full-screen window over one display, showing a frozen
   copy of that screen for you to drag a rectangle on. */
function createShotWindow(display) {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(RENDERER, 'shot', 'index.html'));
  return win;
}

function createAppWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#fdf4e3',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(RENDERER, 'shell', 'index.html'));
  return win;
}

/** Keep the *creature* on a real display, even if monitors changed under us.
    Only the creature has to stay visible - the transparent margins around it
    are free to hang off the edge. */
function clampToDisplay(x, y, geo, flipped) {
  const g = geo || widgetGeometry(1);
  const off = petOffsets(g, flipped);
  const display = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  const a = display.workArea;
  const minX = a.x - g.slackX;
  const maxX = a.x + a.width - g.width + g.slackX;
  const minY = a.y - off.top;
  const maxY = a.y + a.height - g.height + off.bottom + 10;
  return {
    x: Math.round(Math.min(Math.max(x, minX), maxX)),
    y: Math.round(Math.min(Math.max(y, minY), maxY))
  };
}

/** Bottom-right perch, the classic desk-pet spot. */
function defaultWidgetPosition(geo) {
  const g = geo || widgetGeometry(1);
  const a = screen.getPrimaryDisplay().workArea;
  return clampToDisplay(a.x + a.width - g.width - 12, a.y + a.height - g.height, g, false);
}

module.exports = {
  createWidgetWindow,
  createAppWindow,
  createBarWindow,
  createCaptureWindow,
  createShotWindow,
  capturePosition,
  CAPTURE,
  defaultBarPosition,
  clampBar,
  BAR,
  clampToDisplay,
  defaultWidgetPosition,
  widgetGeometry,
  petOffsets,
  dockPosition,
  nearestEdge,
  DOCK,
  clampScale,
  MIN_SCALE,
  MAX_SCALE
};
