'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Companion apps: separate Electron apps that live in sibling project folders
 * and get a button on the dock. Each runs from its own folder with its own
 * Electron, and has its own single-instance lock - so launching one that is
 * already open simply brings its window forward.
 */

const PROJECTS = path.resolve(__dirname, '..', '..', '..');

const COMPANIONS = {
  folio: { name: 'Folio', dir: path.join(PROJECTS, 'Book reading') }
};

/** How to start the app in `dir`, or why it cannot be started. */
function launchCommand(dir) {
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    return { ok: false, error: `App folder not found: ${dir}` };
  }
  const exe = path.join(dir, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (!fs.existsSync(exe)) {
    return { ok: false, error: `Electron is missing in ${dir}. Run "npm install" there once.` };
  }
  return { ok: true, exe, args: [dir], cwd: dir };
}

/** Tick's own Electron/Chromium variables would confuse a fresh Electron. */
function cleanEnv(env) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (/^(ELECTRON_|CHROME_)/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Start (or focus) a companion. Resolves to { ok, error? }. */
function launch(id) {
  const companion = COMPANIONS[id];
  if (!companion) return { ok: false, error: `Unknown app: ${id}` };
  const cmd = launchCommand(companion.dir);
  if (!cmd.ok) return cmd;
  try {
    const child = spawn(cmd.exe, cmd.args, {
      cwd: cmd.cwd,
      env: cleanEnv(process.env),
      detached: true,
      stdio: 'ignore'
    });
    child.on('error', (err) => console.error(`[launch] ${id}:`, err.message));
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { COMPANIONS, launchCommand, cleanEnv, launch };
