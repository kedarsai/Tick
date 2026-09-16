'use strict';
/* Store tests: the data file is the only durable thing Tick owns, so reading
   it must survive the ways Windows tools like to mangle a text file. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Store, DEFAULTS, tagName } = require('../src/main/store');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tick-store-'));
}

/** A data file as an older version would have written it. */
function writeLegacy(dir, data) {
  fs.writeFileSync(path.join(dir, 'tick-data.json'), JSON.stringify(data), 'utf8');
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

// ---------------------------------------------------------- projects & tags

test('a task starts unassigned, with room for an identity number', () => {
  const store = new Store(tmpDir());
  const task = store.add('tasks', { title: 'Fix recon mismatch' });
  assert.equal(task.projectId, null);
  assert.equal(task.identity, '');

  const project = store.add('projects', { name: 'Data Migration', identity: 'DM-100' });
  const filed = store.add('tasks', { title: 'Ship it', projectId: project.id, identity: 'DM-142' });
  assert.equal(filed.projectId, project.id, 'a given project is not overwritten by the default');
  assert.equal(filed.identity, 'DM-142');
});

test('writing a task or note adopts its tags into the catalogue', () => {
  const store = new Store(tmpDir());
  store.add('tasks', { title: 'Ship it', tags: ['urgent', 'backend'] });
  store.add('notes', { title: 'Idea', tags: ['backend', 'reading'] });
  assert.deepEqual(store.list('tags').map((t) => t.name).sort(), ['backend', 'reading', 'urgent']);

  const task = store.add('tasks', { title: 'Later' });
  store.update('tasks', task.id, { tags: ['#Urgent', 'new-one'] });
  assert.deepEqual(store.list('tags').map((t) => t.name).sort(),
    ['backend', 'new-one', 'reading', 'urgent'], '#Urgent is the tag urgent, not a second one');

  assert.ok(store.list('tags').every((t) => /^#[0-9a-f]{6}$/i.test(t.accent)), 'every tag gets a colour');
});

test('tags already on records are adopted when an older file is opened', () => {
  const dir = tmpDir();
  writeLegacy(dir, {
    version: 3,
    tasks: [{ id: 't1', title: 'Old task', tags: ['work', 'urgent'] }],
    notes: [{ id: 'n1', title: 'Old note', tags: ['urgent', 'reading'] }],
    settings: {}
  });

  const store = new Store(dir);
  assert.deepEqual(store.list('tags').map((t) => t.name).sort(), ['reading', 'urgent', 'work']);
  assert.equal(store.data.version, DEFAULTS.version);
  store.save({ immediate: true });

  // Opening it again must not seed a second time.
  const again = new Store(dir);
  assert.equal(again.list('tags').length, 3);
});

test('renaming a tag rewrites every task and note that used it', () => {
  const store = new Store(tmpDir());
  const task = store.add('tasks', { title: 'Ship it', tags: ['wrk', 'urgent'] });
  const note = store.add('notes', { title: 'Idea', tags: ['wrk'] });

  assert.equal(store.renameTag('wrk', 'work'), true);
  assert.deepEqual(store.list('tasks').find((t) => t.id === task.id).tags, ['work', 'urgent']);
  assert.deepEqual(store.list('notes').find((n) => n.id === note.id).tags, ['work']);
  assert.deepEqual(store.list('tags').map((t) => t.name).sort(), ['urgent', 'work']);

  assert.equal(store.renameTag('nope', 'something'), false, 'an unknown tag cannot be renamed');
});

test('renaming a tag onto an existing one merges them', () => {
  const store = new Store(tmpDir());
  const task = store.add('tasks', { title: 'Ship it', tags: ['wrk', 'work'] });

  assert.equal(store.renameTag('wrk', 'work'), true);
  assert.deepEqual(store.list('tasks').find((t) => t.id === task.id).tags, ['work'], 'no duplicate left behind');
  assert.deepEqual(store.list('tags').map((t) => t.name), ['work']);
});

test('deleting a tag strips it from everything that used it', () => {
  const store = new Store(tmpDir());
  const task = store.add('tasks', { title: 'Ship it', tags: ['work', 'urgent'] });

  assert.equal(store.deleteTag('urgent'), true);
  assert.deepEqual(store.list('tasks').find((t) => t.id === task.id).tags, ['work']);
  assert.deepEqual(store.list('tags').map((t) => t.name), ['work']);
  assert.equal(store.deleteTag('urgent'), false, 'deleting it twice is not a change');
});

test('deleting a project keeps its tasks and unassigns them', () => {
  const store = new Store(tmpDir());
  const project = store.add('projects', { name: 'Data Migration', identity: 'DM-100' });
  const task = store.add('tasks', { title: 'Fix recon', projectId: project.id });

  assert.equal(store.deleteProject(project.id), true);
  assert.equal(store.list('projects').length, 0);
  assert.equal(store.list('tasks').length, 1, 'the task itself survives');
  assert.equal(store.list('tasks')[0].projectId, null);
  assert.equal(task.identity, '');
  assert.equal(store.deleteProject('nope'), false);
});

test('tagName reads the many ways a tag gets typed', () => {
  assert.equal(tagName('  #Work '), 'work');
  assert.equal(tagName('##double'), 'double');
  assert.equal(tagName(''), '');
  assert.equal(tagName(null), '');
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
