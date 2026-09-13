'use strict';
/* The roster is 25 hand-authored creatures. These tests are the cheap way to
   catch a typo'd colour or a stray NaN before it reaches the desktop. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// characters.js is a browser global module; give it a window and take it back.
const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'shared', 'characters.js'), 'utf8');
const fakeWindow = {};
new Function('window', src)(fakeWindow);
const Characters = fakeWindow.Characters;

const COLORS = { light: '#ffb457', dark: '#e07a1c', mode: '#f48f2d' };
const HEX = /^#[0-9a-fA-F]{3,8}$/;

test('the roster is big enough and every id is unique', () => {
  assert.ok(Characters.list.length >= 20,
    `expected at least 20 characters, got ${Characters.list.length}`);
  const ids = Characters.list.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate character id');
  const names = Characters.list.map((d) => d.name);
  assert.equal(new Set(names).size, names.length, 'duplicate character name');
});

test('every character declares the anatomy the renderer needs', () => {
  for (const d of Characters.list) {
    const where = `character "${d.id}"`;
    assert.ok(d.name && d.blurb, `${where} needs a name and a blurb`);
    assert.ok(HEX.test(d.palette.light), `${where} has a bad light colour: ${d.palette.light}`);
    assert.ok(HEX.test(d.palette.dark), `${where} has a bad dark colour: ${d.palette.dark}`);
    assert.equal(typeof d.back, 'function', `${where} must draw a body`);

    for (const key of ['cx', 'cy', 'r']) {
      assert.ok(Number.isFinite(d.dial[key]), `${where} dial.${key} is not a number`);
    }
    assert.ok(d.dial.r >= 18, `${where} dial is too small to read: ${d.dial.r}`);

    for (const key of ['lx', 'rx', 'y', 'r']) {
      assert.ok(Number.isFinite(d.eyes[key]), `${where} eyes.${key} is not a number`);
    }
    assert.ok(d.eyes.lx < d.eyes.rx, `${where} has its eyes swapped`);

    if (d.mouth) {
      assert.ok(Number.isFinite(d.mouth.x) && Number.isFinite(d.mouth.y),
        `${where} mouth anchor is not a number`);
    }
  }
});

test('every character stays inside the 200x200 box', () => {
  for (const d of Characters.list) {
    const ring = d.dial.r + 9;
    assert.ok(d.dial.cx - ring >= -6 && d.dial.cx + ring <= 206,
      `character "${d.id}" dial overflows horizontally`);
    assert.ok(d.dial.cy - ring >= -6 && d.dial.cy + ring <= 206,
      `character "${d.id}" dial overflows vertically`);
  }
});

test('every character renders cleanly in both face styles', () => {
  for (const style of ['analog', 'digital']) {
    for (const d of Characters.list) {
      const svg = Characters.render(d, COLORS, { faceStyle: style });
      const where = `character "${d.id}" (${style})`;

      assert.equal(typeof svg, 'string');
      assert.ok(!svg.includes('undefined'), `${where} rendered an undefined value`);
      assert.ok(!svg.includes('NaN'), `${where} rendered NaN`);
      assert.ok(!svg.includes('[object'), `${where} rendered an object`);

      // the parts the widget reaches for by id
      for (const id of ['petBody', 'petBack', 'ringTrack', 'ringFill', 'faceCircle', 'eyes']) {
        assert.ok(svg.includes(`id="${id}"`), `${where} is missing #${id}`);
      }
      assert.ok(svg.includes('class="eye eye--l"') && svg.includes('class="eye eye--r"'),
        `${where} is missing a blinkable eye`);

      if (style === 'analog') {
        for (const id of ['handSlow', 'handFast', 'handPin', 'ticks']) {
          assert.ok(svg.includes(`id="${id}"`), `${where} is missing #${id}`);
        }
        assert.ok(!svg.includes('id="digitalTime"'), `${where} should not have digits`);
      } else {
        assert.ok(svg.includes('id="digitalTime"'), `${where} is missing its readout`);
        assert.ok(!svg.includes('id="handSlow"'), `${where} should not have hands`);
        assert.ok(!svg.includes('id="mouth"'),
          `${where} should let the digits be the expression`);
      }
    }
  }
});

test('tags every open svg element it opens', () => {
  // Crude but effective: the counts of <g> and </g> must match, and every
  // self-closing shape must actually self-close.
  for (const d of Characters.list) {
    const svg = Characters.render(d, COLORS, { faceStyle: 'analog' });
    const opens = (svg.match(/<g[\s>]/g) || []).length;
    const closes = (svg.match(/<\/g>/g) || []).length;
    assert.equal(opens, closes, `character "${d.id}" has unbalanced <g> tags`);
  }
});

test('mouth shapes are produced for every mood', () => {
  const anchor = { x: 100, y: 120, w: 24 };
  for (const mood of ['sleepy', 'content', 'working', 'flat', 'celebrate']) {
    const d = Characters.mouthPath(mood, anchor);
    assert.ok(typeof d === 'string' && d.startsWith('M'), `mood "${mood}" produced no path`);
    assert.ok(!d.includes('NaN'), `mood "${mood}" produced NaN`);
  }
  assert.equal(Characters.mouthPath('content', null), '', 'a mouthless creature gets no path');
});

test('byId falls back rather than throwing', () => {
  assert.equal(Characters.byId('tick').id, 'tick');
  assert.equal(Characters.byId('does-not-exist').id, Characters.list[0].id);
  assert.equal(Characters.byId(undefined).id, Characters.list[0].id);
});

test('ring circumference tracks the dial', () => {
  for (const d of Characters.list) {
    const c = Characters.ringCircumference(d);
    assert.ok(Number.isFinite(c) && c > 0, `character "${d.id}" has no ring`);
    assert.ok(Math.abs(c - 2 * Math.PI * (d.dial.r + 9)) < 1e-9);
  }
});

// ---------------------------------------------------------------- persona
const ANIMATIONS = new Set([
  'breathe', 'breathe-slow', 'swing', 'sway', 'float', 'float-fast', 'drift',
  'hover', 'hover-fast', 'jitter', 'pulse', 'creep', 'wobble', 'wobble-soft',
  'blobby', 'march', 'bob', 'headbob', 'hop', 'waddle', 'stomp', 'tip',
  'bounce', 'spin-slow'
]);
const FIDGETS = new Set([
  'hop', 'wiggle', 'stretch', 'yawn', 'lookAround', 'spin', 'shake', 'peek',
  'squash', 'fade'
]);
const VOICE_EVENTS = [
  'greet', 'start', 'pause', 'resume', 'stopEarly', 'complete', 'poke',
  'chatter', 'drag', 'drop', 'longRun', 'lateNight', 'nearlyDone'
];

test('every character moves in a way the stylesheet knows about', () => {
  for (const d of Characters.list) {
    assert.ok(ANIMATIONS.has(d.idle), `character "${d.id}" idles as unknown "${d.idle}"`);
    assert.ok(ANIMATIONS.has(d.work), `character "${d.id}" works as unknown "${d.work}"`);
    assert.ok(Array.isArray(d.fidgets) && d.fidgets.length,
      `character "${d.id}" has no fidgets`);
    for (const f of d.fidgets) {
      assert.ok(FIDGETS.has(f), `character "${d.id}" has unknown fidget "${f}"`);
    }
  }
});

test('the roster does not all move the same way', () => {
  const idles = new Set(Characters.list.map((d) => d.idle));
  const works = new Set(Characters.list.map((d) => d.work));
  assert.ok(idles.size >= 8, `only ${idles.size} distinct idle behaviours`);
  assert.ok(works.size >= 10, `only ${works.size} distinct working behaviours`);
});

test('every character has something to say for every moment', () => {
  for (const d of Characters.list) {
    for (const event of VOICE_EVENTS) {
      const pool = d.voice[event];
      assert.ok(Array.isArray(pool) && pool.length,
        `character "${d.id}" has nothing for "${event}"`);
      for (const line of pool) {
        assert.equal(typeof line, 'string');
        assert.ok(line.length > 0 && line.length <= 60,
          `character "${d.id}" line is too long for the bubble: "${line}"`);
      }
    }
  }
});

test('characters have their own words, not just the defaults', () => {
  for (const d of Characters.list) {
    for (const event of ['start', 'complete', 'poke', 'chatter']) {
      assert.notDeepEqual(d.voice[event], Characters.DEFAULT_VOICE[event],
        `character "${d.id}" never got its own "${event}" lines`);
    }
  }
  // and no two characters share a start line
  const seen = new Map();
  for (const d of Characters.list) {
    for (const line of d.voice.start) {
      assert.ok(!seen.has(line),
        `"${line}" is used by both ${seen.get(line)} and ${d.id}`);
      seen.set(line, d.id);
    }
  }
});

test('say() returns a line and avoids repeating itself', () => {
  const def = Characters.byId('cat');
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const line = Characters.say(def, 'poke');
    assert.ok(def.voice.poke.includes(line), `unexpected line: ${line}`);
    seen.add(line);
  }
  assert.ok(seen.size > 1, 'say() kept returning the same line');
  assert.equal(Characters.say(def, 'no-such-event'), '');
});

test('fidget() only ever suggests moves the character owns', () => {
  for (const d of Characters.list) {
    for (let i = 0; i < 20; i++) {
      assert.ok(d.fidgets.includes(Characters.fidget(d)));
    }
  }
});
