'use strict';
const { contextBridge, ipcRenderer } = require('electron');

/**
 * The whole renderer-facing API. Nothing else crosses the bridge: renderers
 * get plain data and a fixed list of verbs, never node.
 */
const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

const listen = (channel) => (handler) => {
  const wrapped = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld('tick', {
  timer: {
    getState: () => invoke('timer:get'),
    start: (opts) => invoke('timer:start', opts),
    pause: () => invoke('timer:pause'),
    resume: () => invoke('timer:resume'),
    toggle: () => invoke('timer:toggle'),
    stop: () => invoke('timer:stop'),
    extend: (minutes) => invoke('timer:extend', minutes)
  },
  entries: {
    list: () => invoke('entries:list'),
    update: (id, patch) => invoke('entries:update', { id, patch }),
    remove: (id) => invoke('entries:delete', id),
    add: (entry) => invoke('entries:add', entry)
  },
  settings: {
    get: () => invoke('settings:get'),
    update: (patch) => invoke('settings:update', patch)
  },
  win: {
    openApp: () => invoke('win:open-app'),
    minimizeApp: () => invoke('win:minimize-app'),
    toggleMaximizeApp: () => invoke('win:toggle-maximize-app'),
    closeApp: () => invoke('win:close-app'),
    showWidget: () => invoke('win:show-widget'),
    hideWidget: () => invoke('win:hide-widget'),
    quit: () => invoke('win:quit')
  },
  widget: {
    dragStart: () => invoke('widget:drag-start'),
    dragEnd: () => invoke('widget:drag-end'),
    setInteractive: (interactive) => invoke('widget:set-interactive', interactive),
    nudgeHome: () => invoke('widget:nudge-home'),
    dock: (edge) => invoke('widget:dock', edge),
    undock: () => invoke('widget:undock'),
    toggleDock: () => invoke('widget:toggle-dock')
  },
  // The suite: one generic door for every app's records.
  data: {
    snapshot: () => invoke('data:snapshot'),
    add: (collection, item) => invoke('data:add', { collection, item }),
    update: (collection, id, patch) => invoke('data:update', { collection, id, patch }),
    remove: (collection, id) => invoke('data:remove', { collection, id })
  },
  capture: {
    save: (payload) => invoke('capture:save', payload),
    close: () => invoke('capture:close'),
    hotkey: () => invoke('capture:hotkey'),
    region: () => invoke('shot:region')
  },
  bar: {
    toggle: () => invoke('bar:toggle'),
    hide: () => invoke('bar:hide'),
    collapse: (collapsed) => invoke('bar:collapse', collapsed),
    openApp: (appId) => invoke('shell:open-app', appId),
    launch: (companionId) => invoke('bar:launch', companionId)
  },
  autoStart: {
    get: () => invoke('app:autostart-get'),
    set: (enabled) => invoke('app:autostart-set', enabled)
  },
  copy: (text) => invoke('app:copy', text),
  openFile: (filePath) => invoke('app:open-file', filePath),
  copyImage: (filePath) => invoke('app:copy-image', filePath),
  shotPicked: (rect) => invoke('shot:picked', rect),
  openExternal: (url) => invoke('app:open-external', url),
  notify: (payload) => invoke('app:notify', payload),
  onState: listen('timer:state'),
  onEntries: listen('entries:changed'),
  onSettings: listen('settings:changed'),
  onCompleted: listen('timer:completed'),
  onFocusTask: listen('ui:focus-task'),
  onCursor: listen('widget:cursor'),
  onFlip: listen('widget:flip'),
  onDock: listen('widget:dock'),
  onData: listen('data:changed'),
  onBarState: listen('bar:state'),
  onShellOpen: listen('shell:open'),
  onCaptureOpen: listen('capture:open'),
  onCaptureHotkey: listen('capture:hotkey'),
  onShotImage: listen('shot:image')
});
