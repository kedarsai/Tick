'use strict';
/**
 * Generates the tray / app icons from code so there are no binary blobs to
 * babysit. Draws Tick's face with 4x supersampling, then writes PNG + ICO by
 * hand (zlib is the only thing we need and it ships with node).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets');

// ---- tiny raster canvas ----------------------------------------------------
function canvas(size) {
  return { size, px: new Float64Array(size * size * 4) };
}
function blend(c, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size) return;
  const i = (y * c.size + x) * 4;
  const dst = c.px;
  const ia = 1 - a;
  dst[i] = r * a + dst[i] * ia;
  dst[i + 1] = g * a + dst[i + 1] * ia;
  dst[i + 2] = b * a + dst[i + 2] * ia;
  dst[i + 3] = a + dst[i + 3] * ia;
}
function disc(c, cx, cy, radius, color) {
  const x0 = Math.floor(cx - radius - 1), x1 = Math.ceil(cx + radius + 1);
  const y0 = Math.floor(cy - radius - 1), y1 = Math.ceil(cy + radius + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= radius) blend(c, x, y, color);
    }
  }
}
function ring(c, cx, cy, rOuter, rInner, color) {
  for (let y = Math.floor(cy - rOuter - 1); y <= Math.ceil(cy + rOuter + 1); y++) {
    for (let x = Math.floor(cx - rOuter - 1); x <= Math.ceil(cx + rOuter + 1); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= rOuter && d >= rInner) blend(c, x, y, color);
    }
  }
}
function thickLine(c, x0, y0, x1, y1, width, color) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    disc(c, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, color);
  }
}

const ORANGE = [244, 143, 45, 1];
const ORANGE_DEEP = [214, 106, 22, 1];
const CREAM = [255, 243, 219, 1];
const INK = [58, 38, 28, 1];
const WHITE = [255, 255, 255, 1];

function drawTick(size) {
  const SS = 4;               // supersample factor
  const c = canvas(size * SS);
  const n = size * SS;
  const cx = n / 2, cy = n / 2;
  const body = n * 0.46;

  disc(c, cx, cy + n * 0.02, body, ORANGE_DEEP);   // soft drop shadow / rim
  disc(c, cx, cy, body, ORANGE);
  disc(c, cx, cy, body * 0.80, CREAM);             // clock face
  ring(c, cx, cy, body * 0.82, body * 0.76, INK);  // bezel

  // Hands sit low and short so they read as a little nose, not a face-full of
  // clutter -- the eyes are what make it legible at 16px.
  thickLine(c, cx, cy - body * 0.02, cx - body * 0.20, cy + body * 0.20, n * 0.045, INK);
  thickLine(c, cx, cy - body * 0.02, cx + body * 0.24, cy + body * 0.12, n * 0.038, INK);
  disc(c, cx, cy - body * 0.02, n * 0.030, INK);

  // eyes, set high and wide so it reads as a face even at 16px
  const eyeY = cy - body * 0.32, eyeDx = body * 0.32, eyeR = body * 0.22;
  for (const dx of [-eyeDx, eyeDx]) {
    disc(c, cx + dx, eyeY, eyeR, WHITE);
    disc(c, cx + dx, eyeY, eyeR, [0, 0, 0, 0]);
    disc(c, cx + dx, eyeY, eyeR, WHITE);
    disc(c, cx + dx + eyeR * 0.12, eyeY + eyeR * 0.12, eyeR * 0.55, INK);
    disc(c, cx + dx + eyeR * 0.38, eyeY - eyeR * 0.28, eyeR * 0.20, WHITE);
  }

  // smile
  for (let a = 0.12; a <= 0.88; a += 0.005) {
    const ang = Math.PI * a;
    disc(c, cx - Math.cos(ang) * body * 0.30, cy + body * 0.38 + Math.sin(ang) * body * 0.14,
      n * 0.026, INK);
  }

  // downsample
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * n + (x * SS + sx)) * 4;
          r += c.px[i]; g += c.px[i + 1]; b += c.px[i + 2]; a += c.px[i + 3];
        }
      }
      const k = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / k); out[o + 1] = Math.round(g / k);
      out[o + 2] = Math.round(b / k); out[o + 3] = Math.round((a / k) * 255);
    }
  }
  return out;
}

// ---- PNG encoder -----------------------------------------------------------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---- ICO (PNG-compressed entries, fine for Vista+) --------------------------
function encodeICO(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

fs.mkdirSync(OUT, { recursive: true });
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((size) => ({ size, buf: encodePNG(drawTick(size), size) }));
for (const { size, buf } of pngs) fs.writeFileSync(path.join(OUT, `icon-${size}.png`), buf);
fs.writeFileSync(path.join(OUT, 'icon.png'), pngs.find((p) => p.size === 256).buf);
fs.writeFileSync(path.join(OUT, 'tray.png'), pngs.find((p) => p.size === 32).buf);
fs.writeFileSync(path.join(OUT, 'icon.ico'), encodeICO(pngs.filter((p) => p.size <= 256)));
console.log('icons written to', OUT);
