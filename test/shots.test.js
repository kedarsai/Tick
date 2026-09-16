'use strict';
/* A crop that is off by a scale factor silently cuts the wrong thing out of
   your picture, and the original is gone. This is worth being sure about. */

const test = require('node:test');
const assert = require('node:assert');
const { cropRect, MIN_SIDE } = require('../src/main/shots');

const SHOWN = { width: 400, height: 300 };
const REAL = { width: 1200, height: 900 };      // shown at a third of its size

test('a rectangle scales up to the picture it was drawn over', () => {
  assert.deepEqual(cropRect({ x: 10, y: 20, width: 100, height: 50 }, SHOWN, REAL),
    { x: 30, y: 60, width: 300, height: 150 });
});

test('a picture shown at its own size crops exactly as drawn', () => {
  assert.deepEqual(cropRect({ x: 5, y: 7, width: 40, height: 30 }, REAL, REAL),
    { x: 5, y: 7, width: 40, height: 30 });
});

test('dragging up and to the left is still a rectangle', () => {
  assert.deepEqual(cropRect({ x: 110, y: 70, width: -100, height: -50 }, SHOWN, REAL),
    { x: 30, y: 60, width: 300, height: 150 });
});

test('a drag past the edges is clamped to the picture', () => {
  assert.deepEqual(cropRect({ x: -50, y: -50, width: 600, height: 500 }, SHOWN, REAL),
    { x: 0, y: 0, width: 1200, height: 900 });
});

test('a slip of the hand is not a crop', () => {
  assert.equal(cropRect({ x: 10, y: 10, width: 1, height: 40 }, REAL, REAL), null);
  assert.equal(cropRect({ x: 10, y: 10, width: 40, height: 0 }, REAL, REAL), null);
  assert.equal(cropRect({ x: 10, y: 10, width: MIN_SIDE, height: MIN_SIDE }, REAL, REAL).width, MIN_SIDE);
});

test('nonsense in, nothing out', () => {
  assert.equal(cropRect(null, SHOWN, REAL), null);
  assert.equal(cropRect({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 300 }, REAL), null);
  assert.equal(cropRect({ x: 0, y: 0, width: 10, height: 10 }, SHOWN, { width: 0, height: 0 }), null);
});
