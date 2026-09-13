'use strict';
/* Store tests: the data file is the only durable thing Tick owns, so reading
   it must survive the ways Windows tools like to mangle a text file. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Store, DEFAULTS } = require('../src/main/store');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tick-store-'));
}

test('a missing file starts from defaults', () => {
  const dir = tmpDir();
  const store = new Store(dir);
  assert.deepEqual(store.entries, []);
  assert.equal(store.settings.focusMinutes, DEFAULTS.settings.focusMinutes);
});

test('entries and settings survive a round trip', () => {
  const dir = tmpDir();
  const a = new Store(dir);
  a.addEntry({ id: 'e1', task: 'Something', mode: 'focus', actualMs: 60000 });
  a.updateSettings({ focusMinutes: 45, dailyGoalMinutes: 180 });
  a.save({ immediate: true });

  const b = new Store(dir);
  assert.equal(b.entries.length, 1);
  assert.equal(b.entries[0].task, 'Something');
  assert.equal(b.settings.focusMinutes, 45);
  assert.equal(b.settings.dailyGoalMinutes, 180);
});

test('a UTF-8 BOM does not destroy the file', () => {
  const dir = tmpDir();
  const a = new Store(dir);
  a.addEntry({ id: 'e1', task: 'Keep me', mode: 'focus', actualMs: 60000 });
  a.updateSettings({ focusMinutes: 33 });
  a.save({ immediate: true });

  // Exactly what PowerShell's `Out-File -Encoding utf8` produces on 5.1.
  const withBom = '﻿' + fs.readFileSync(a.file, 'utf8');
  fs.writeFileSync(a.file, withBom, 'utf8');

  const b = new Store(dir);
  assert.equal(b.settings.focusMinutes, 33, 'settings must survive a BOM');
  assert.equal(b.entries.length, 1, 'entries must survive a BOM');
});

test('unreadable JSON falls back to defaults but keeps a copy', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'tick-data.json');
  fs.writeFileSync(file, '{ this is not json', 'utf8');

  const store = new Store(dir);
  assert.deepEqual(store.entries, []);
  assert.equal(store.settings.focusMinutes, DEFAULTS.settings.focusMinutes);

  const kept = fs.readdirSync(dir).filter((f) => f.includes('.corrupt-'));
  assert.equal(kept.length, 1, 'the unreadable file is preserved, not dropped');
});

test('missing keys are backfilled from defaults', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'tick-data.json');
  // A file written by an older version that had fewer settings.
  fs.writeFileSync(file, JSON.stringify({ entries: [], settings: { focusMinutes: 50 } }), 'utf8');

  const store = new Store(dir);
  assert.equal(store.settings.focusMinutes, 50, 'existing value wins');
  assert.equal(store.settings.longBreakEvery, DEFAULTS.settings.longBreakEvery, 'new key filled in');
  assert.equal(store.meta.pomodoroCount, 0);
});

test('deleting and updating entries works by id', () => {
  const dir = tmpDir();
  const store = new Store(dir);
  store.addEntry({ id: 'a', task: 'first' });
  store.addEntry({ id: 'b', task: 'second' });

  assert.equal(store.entries[0].id, 'b', 'newest entry is first');

  store.updateEntry('a', { task: 'renamed' });
  assert.equal(store.entries.find((e) => e.id === 'a').task, 'renamed');

  assert.equal(store.deleteEntry('a'), true);
  assert.equal(store.deleteEntry('nope'), false);
  assert.equal(store.entries.length, 1);
});
