'use strict';
/* The task parser eats words out of what you typed, so it had better only do
   that when it is certain. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'shared', 'parse.js'), 'utf8');
const box = {};
new Function('window', src)(box);
const { parseTask } = box.Parse;

// A fixed "today": Sunday 2026-09-13.
const NOW = new Date('2026-09-13T12:00:00');
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (offset = 0) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const parse = (raw) => parseTask(raw, dayKey, NOW);

test('a plain task keeps every word', () => {
  const t = parse('Write the migration spec');
  assert.equal(t.title, 'Write the migration spec');
  assert.equal(t.due, null);
  assert.equal(t.priority, false);
});

test('words that merely start with a day name are left alone', () => {
  // this was a real bug: "monitor" matched "mon" and became a Monday due date
  for (const word of ['monitor', 'monday-ish', 'satellite', 'sunscreen', 'weds', 'frier']) {
    const t = parse(`Fix the ${word}`);
    assert.equal(t.title, `Fix the ${word}`, `"${word}" should not be eaten`);
    assert.equal(t.due, null, `"${word}" should not set a due date`);
  }
});

test('real day names set a due date and are removed', () => {
  const t = parse('Sprint planning friday');
  assert.equal(t.title, 'Sprint planning');
  assert.equal(t.due, dayKey(5), 'Sunday + 5 = Friday');
});

test('a day name matching today means next week, not today', () => {
  const t = parse('Review sunday');       // NOW is a Sunday
  assert.equal(t.due, dayKey(7));
});

test('today, tomorrow and +n offsets work', () => {
  assert.equal(parse('Call the bank today').due, dayKey(0));
  assert.equal(parse('Call the bank tomorrow').due, dayKey(1));
  assert.equal(parse('Call the bank tmr').due, dayKey(1));
  assert.equal(parse('Call the bank +3').due, dayKey(3));
  assert.equal(parse('Call the bank today').title, 'Call the bank');
});

test('only a standalone bang flags a task', () => {
  const flagged = parse('Ship the spec !');
  assert.equal(flagged.priority, true);
  assert.equal(flagged.title, 'Ship the spec');

  const excited = parse('Ship it!');
  assert.equal(excited.priority, false, 'trailing punctuation is not a flag');
  assert.equal(excited.title, 'Ship it!');
});

test('tags are collected but left in the title', () => {
  const t = parse('Ship the spec #work #urgent');
  assert.deepEqual(t.tags, ['work', 'urgent']);
  assert.ok(t.title.includes('#work'));
});

test('everything at once', () => {
  const t = parse('Ship the spec #work ! friday');
  assert.equal(t.title, 'Ship the spec #work');
  assert.deepEqual(t.tags, ['work']);
  assert.equal(t.due, dayKey(5));
  assert.equal(t.priority, true);
});

test('only one date is consumed, and it is the last one', () => {
  const t = parse('Meet monday about tuesday');
  assert.equal(t.due, dayKey(2), 'the trailing "tuesday" wins');
  assert.equal(t.title, 'Meet monday about');
});

test('empty and junk input do not throw', () => {
  assert.equal(parse('').title, '');
  assert.equal(parse('   ').title, '');
  assert.equal(parse(null).title, '');
  assert.equal(parse(undefined).due, null);
});
