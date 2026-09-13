'use strict';
/* Companion apps live in sibling folders and are started with their own
   Electron. The command has to be right, and a missing app must say so. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { COMPANIONS, launchCommand, cleanEnv } = require('../src/main/launchers');

test('folio is a known companion that lives next to Tick', () => {
  const folio = COMPANIONS.folio;
  assert.ok(folio);
  assert.strictEqual(path.basename(folio.dir), 'Book reading');
  assert.strictEqual(path.dirname(folio.dir), path.resolve(__dirname, '..', '..'));
});

test('launchCommand points at the app folder\'s own electron', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tick-launch-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  assert.strictEqual(launchCommand(dir).ok, false);
  assert.match(launchCommand(dir).error, /npm install/);

  const exe = path.join(dir, 'node_modules', 'electron', 'dist', 'electron.exe');
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(exe, '');
  const cmd = launchCommand(dir);
  assert.strictEqual(cmd.ok, true);
  assert.strictEqual(cmd.exe, exe);
  assert.deepStrictEqual(cmd.args, [dir]);
  assert.strictEqual(cmd.cwd, dir);
});

test('launchCommand reports a missing folder', () => {
  const cmd = launchCommand(path.join(os.tmpdir(), 'definitely-not-here-tick'));
  assert.strictEqual(cmd.ok, false);
  assert.match(cmd.error, /not found/);
});

test('cleanEnv drops Electron and Chromium variables inherited from Tick', () => {
  const env = cleanEnv({ PATH: 'x', ELECTRON_RUN_AS_NODE: '1', CHROME_CRASHPAD_PIPE_NAME: 'p', APPDATA: 'a' });
  assert.deepStrictEqual(env, { PATH: 'x', APPDATA: 'a' });
});
