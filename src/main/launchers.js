'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Companion apps: separate apps with their own repos, installed wherever they
 * like. Tick does not know where they live. Each companion installs a Start
 * Menu shortcut, and its dock button opens that shortcut - exactly as clicking
 * it in the Start Menu would. Each companion has its own single-instance lock,
 * so launching one that is already open simply brings its window forward.
 */

const COMPANIONS = {
  folio: { name: 'Folio', shortcut: 'Folio.lnk' }
};

/** The per-user Start Menu, where companions install their shortcuts. */
function startMenuDir(env = process.env) {
  return path.join(env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
}

/** A shortcut's argument string as a list: spaces separate, double quotes group. */
function splitArgs(str) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(str || ''))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

/**
 * How to start the program behind the shortcut at `lnk`, or why it cannot be
 * started. `readLink` is Electron's shell.readShortcutLink.
 */
function launchCommand(lnk, readLink) {
  if (!fs.existsSync(lnk)) {
    return { ok: false, error: `Shortcut not found: ${lnk}` };
  }
  let link;
  try {
    link = readLink(lnk);
  } catch (err) {
    return { ok: false, error: `Cannot read shortcut ${lnk}: ${err.message}` };
  }
  if (!link.target || !fs.existsSync(link.target)) {
    return { ok: false, error: `${path.basename(lnk)} points at a missing program: ${link.target || '(none)'}` };
  }
  return {
    ok: true,
    exe: link.target,
    args: splitArgs(link.args),
    cwd: link.cwd || path.dirname(link.target)
  };
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
function launch(id, readLink) {
  const companion = COMPANIONS[id];
  if (!companion) return { ok: false, error: `Unknown app: ${id}` };
  const lnk = path.join(startMenuDir(), companion.shortcut);
  const cmd = launchCommand(lnk, readLink || require('electron').shell.readShortcutLink);
  if (!cmd.ok) {
    if (!fs.existsSync(lnk)) {
      cmd.error = `${companion.name} is not installed: no ${companion.shortcut} in the Start Menu. ` +
        `Run scripts\\install-shortcuts.ps1 in ${companion.name}'s folder.`;
    }
    return cmd;
  }
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

module.exports = { COMPANIONS, startMenuDir, splitArgs, launchCommand, cleanEnv, launch };
