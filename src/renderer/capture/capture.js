'use strict';
/* Quick capture. The whole point is that it costs one keystroke to reach and
   one to leave, so it does as little as possible: take the text, send it to the
   inbox, get out of the way. Sorting happens later, in triage. */

const field = document.getElementById('field');
const dest = document.getElementById('dest');
const body = document.body;

let closing = null;
let shot = null;                 // the region grab attached to this capture

const shotChip = document.getElementById('shotChip');
const shotThumb = document.getElementById('shotThumb');
const shotMeta = document.getElementById('shotMeta');

/** A hint about where it will land - never a decision you have to make. */
function describe(text) {
  const t = text.trim();
  if (!t) return shot ? '→ Inbox · picture' : '→ Inbox';
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return '→ Inbox · link';
  if (/^>/.test(t)) return '→ Inbox · feeling';
  if (/^(\[\]|-|\*)\s/.test(t)) return '→ Inbox · task';
  return shot ? '→ Inbox · with a picture' : '→ Inbox';
}

function grow() {
  field.style.height = 'auto';
  field.style.height = `${Math.min(field.scrollHeight, 92)}px`;
}

function reset() {
  field.value = '';
  shot = null;
  paintShot();
  body.dataset.saved = 'false';
  grow();
  dest.textContent = describe('');
}

function paintShot() {
  shotChip.hidden = !shot;
  if (!shot) { shotThumb.removeAttribute('src'); return; }
  shotThumb.src = shot.thumbUrl;
  shotMeta.textContent = shot.width + ' x ' + shot.height;
}

/* The picker hides this window, freezes the screen, and hands back a crop. */
document.getElementById('shotBtn').addEventListener('click', async () => {
  const grabbed = await window.tick.capture.region();
  if (grabbed) shot = grabbed;
  paintShot();
  dest.textContent = describe(field.value);
  field.focus();
});

document.getElementById('shotDrop').addEventListener('click', () => {
  shot = null;
  paintShot();
  field.focus();
});

async function save() {
  const text = field.value.trim();
  if (!text && !shot) return close();

  await window.tick.capture.save({ text, shot, source: 'quick' });

  // A beat of confirmation, then out of the way.
  body.dataset.saved = 'true';
  field.value = '';
  shot = null;
  paintShot();
  grow();
  clearTimeout(closing);
  closing = setTimeout(() => { reset(); window.tick.capture.close(); }, 550);
}

function close() {
  clearTimeout(closing);
  reset();
  window.tick.capture.close();
}

field.addEventListener('input', () => {
  grow();
  dest.textContent = describe(field.value);
  if (body.dataset.saved === 'true') body.dataset.saved = 'false';
});

field.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    save();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
});

/* Summoned again: keep whatever was there and select it, rather than clearing.
   The window dismisses itself on blur, so anything that steals focus mid-thought
   would otherwise throw your sentence away. Selecting it means typing still
   replaces it, and a half-finished thought survives an interruption. */
window.tick.onCaptureOpen(() => {
  body.dataset.saved = 'false';
  grow();
  dest.textContent = describe(field.value);
  requestAnimationFrame(() => {
    field.focus();
    field.select();
  });
});

reset();
field.focus();
