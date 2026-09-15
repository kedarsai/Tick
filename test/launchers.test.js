'use strict';
/* Companion apps are separate installs that Tick starts through their Start
   Menu shortcut. The command has to be right, and a missing app must say so. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { COMPANIONS, startMenuDir, splitArgs, launchCommand, cleanEnv, launch } = require('../src/main/launchers');

test('folio is a known companion found by its Start Menu shortcut, not a folder', () => {
  const folio = COMPANIONS.folio;
  assert.ok(folio);
  assert.strictEqual(folio.shortcut, 'Folio.lnk');
  assert.strictEqual(folio.dir, undefined);
});

test('startMenuDir is the per-user Start Menu programs folder', () => {
  const dir = startMenuDir({ APPDATA: 'C:\\Users\\me\\AppData\\Roaming' });
  assert.strictEqual(dir, path.join('C:\\Users\\me\\AppData\\Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
});

test('splitArgs keeps quoted paths with spaces whole', () => {
  assert.deepStrictEqual(splitArgs('"C:\\My Apps\\Folio" --background'), ['C:\\My Apps\\Folio', '--background']);
  assert.deepStrictEqual(splitArgs(''), []);
  assert.deepStrictEqual(splitArgs(undefined), []);
});

test('launchCommand runs what the shortcut points at', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tick-launch-'));
  const lnk = path.join(dir, 'Folio.lnk');
  const exe = path.join(dir, 'electron.exe');
  fs.writeFileSync(lnk, '');
  fs.writeFileSync(exe, '');
  const readLink = () => ({ target: exe, args: `"${dir}"`, cwd: dir });

  const cmd = launchCommand(lnk, readLink);
  assert.strictEqual(cmd.ok, true);
  assert.strictEqual(cmd.exe, exe);
  assert.deepStrictEqual(cmd.args, [dir]);
  assert.strictEqual(cmd.cwd, dir);

  const noCwd = launchCommand(lnk, () => ({ target: exe, args: '' }));
  assert.strictEqual(noCwd.cwd, dir);
});

test('launchCommand reports a missing shortcut, an unreadable one, and a stale target', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tick-launch-'));
  const lnk = path.join(dir, 'Folio.lnk');

  const missing = launchCommand(lnk, () => assert.fail('should not read'));
  assert.strictEqual(missing.ok, false);
  assert.match(missing.error, /not found/);

  fs.writeFileSync(lnk, '');
  const unreadable = launchCommand(lnk, () => { throw new Error('bad link'); });
  assert.strictEqual(unreadable.ok, false);
  assert.match(unreadable.error, /bad link/);

  const stale = launchCommand(lnk, () => ({ target: path.join(dir, 'gone.exe'), args: '' }));
  assert.strictEqual(stale.ok, false);
  assert.match(stale.error, /missing program/);
});

test('launch rejects an unknown companion', () => {
  const result = launch('nope', () => assert.fail('should not read'));
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /Unknown app/);
});

test('cleanEnv drops Electron and Chromium variables inherited from Tick', () => {
  const env = cleanEnv({ PATH: 'x', ELECTRON_RUN_AS_NODE: '1', CHROME_CRASHPAD_PIPE_NAME: 'p', APPDATA: 'a' });
  assert.deepStrictEqual(env, { PATH: 'x', APPDATA: 'a' });
});
