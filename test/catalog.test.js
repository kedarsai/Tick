'use strict';
/* The catalogue readings are shared by Settings and Tasks, so a wrong count or
   a dropped archived project would show up in two places at once. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'shared', 'catalog.js'), 'utf8');
const box = {};
new Function('window', src)(box);
const C = box.Catalog;

const PROJECTS = [
  { id: 'p2', name: 'data migration', identity: 'DM-100' },
  { id: 'p1', name: 'Admin', identity: '' },
  { id: 'p3', name: 'Old thing', identity: '', archived: true }
];

const TASKS = [
  { id: 't1', projectId: 'p1', tags: ['work', 'urgent'] },
  { id: 't2', projectId: 'p1', tags: ['work'] },
  { id: 't3', projectId: null, tags: [] },
  { id: 't4', projectId: 'p3', tags: ['#Work'] }
];

test('projects sort by name regardless of case, archived ones stay out', () => {
  assert.deepEqual(C.openProjects(PROJECTS).map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(C.byName(PROJECTS).map((p) => p.id), ['p1', 'p2', 'p3']);
});

test('a project reads with its identity number only when it has one', () => {
  assert.equal(C.projectLabel(C.projectById(PROJECTS, 'p2')), 'data migration (DM-100)');
  assert.equal(C.projectLabel(C.projectById(PROJECTS, 'p1')), 'Admin');
  assert.equal(C.projectLabel(null), '', 'a task with no project says nothing');
});

test('tag counts span every list and read #Work as work', () => {
  const notes = [{ id: 'n1', tags: ['reading', 'work'] }];
  assert.deepEqual(C.tagCounts(TASKS, notes), { work: 4, urgent: 1, reading: 1 });
  assert.deepEqual(C.tagCounts(), {});
});

test('project counts include tasks on archived projects', () => {
  assert.deepEqual(C.projectCounts(TASKS), { p1: 2, p3: 1 });
});

test('a tag wears its own colour, an unknown one a quiet default', () => {
  const tags = [{ name: 'work', accent: '#c9452f' }];
  assert.equal(C.tagAccent(tags, '#Work'), '#c9452f');
  assert.equal(C.tagAccent(tags, 'nope'), C.DEFAULT_ACCENT);
});

test('the tag picker only offers what is not already on the record', () => {
  const tags = [{ name: 'work' }, { name: 'urgent' }, { name: 'reading' }];
  assert.deepEqual(C.tagsNotOn(tags, ['#Work']).map((t) => t.name), ['reading', 'urgent']);
  assert.deepEqual(C.tagsNotOn(tags, []).map((t) => t.name), ['reading', 'urgent', 'work']);
});
