'use strict';

/**
 * Picture arithmetic.
 *
 * A rectangle is always dragged over a picture that is being shown at some
 * other size than it really is - a screen grabbed at 150% scaling, or an image
 * shrunk to fit the viewer. Turning that rectangle into real pixels is the one
 * place this is easy to get quietly wrong, so it lives here on its own where
 * it can be tested without a screen.
 */

// Below this, a drag is a slip of the hand rather than a selection.
const MIN_SIDE = 4;

/**
 * Map a rectangle drawn over a displayed picture onto the real pixels of that
 * picture, clamped to its edges.
 *
 * @param {{x,y,width,height}} rect   as drawn, in displayed units
 * @param {{width,height}} shown      the size it was drawn over
 * @param {{width,height}} real       the picture's true size
 * @returns {{x,y,width,height}|null} null when the drag is too small to mean anything
 */
function cropRect(rect, shown, real) {
  if (!rect || !shown || !real) return null;
  if (!(shown.width > 0) || !(shown.height > 0)) return null;
  if (!(real.width > 0) || !(real.height > 0)) return null;

  const sx = real.width / shown.width;
  const sy = real.height / shown.height;

  // Normalise first: dragging up and to the left is a negative width.
  const left = Math.min(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const right = Math.max(rect.x, rect.x + rect.width);
  const bottom = Math.max(rect.y, rect.y + rect.height);

  const x = Math.round(Math.min(Math.max(left * sx, 0), real.width));
  const y = Math.round(Math.min(Math.max(top * sy, 0), real.height));
  const width = Math.round(Math.min(right * sx, real.width)) - x;
  const height = Math.round(Math.min(bottom * sy, real.height)) - y;

  if (width < MIN_SIDE || height < MIN_SIDE) return null;
  return { x, y, width, height };
}

module.exports = { cropRect, MIN_SIDE };
