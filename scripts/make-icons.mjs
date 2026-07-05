// Generates PWA icons as PNGs with zero dependencies (raw PNG encoding via zlib).
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, pixels) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- draw the icon: moonlit night, lantern-gold purse with a cut cord ---
function drawIcon(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const pad = maskable ? 0.82 : 1; // maskable icons keep art inside the safe zone
  const put = (i, r, g, b, a = 255) => { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a; };
  const mix = (i, r, g, b, a) => {
    const t = a / 255, u = 1 - t;
    px[i] = r * t + px[i] * u;
    px[i + 1] = g * t + px[i + 1] * u;
    px[i + 2] = b * t + px[i + 2] * u;
    px[i + 3] = Math.min(255, px[i + 3] + a);
  };

  const R = size * 0.5;
  const purseY = cy + size * 0.06 * pad;
  const purseR = size * 0.26 * pad;
  const moonX = cx + size * 0.22 * pad, moonY = cy - size * 0.26 * pad, moonR = size * 0.09 * pad;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);

      // rounded-square night background
      const corner = size * (maskable ? 0 : 0.18);
      const qx = Math.max(0, Math.abs(dx) - (R - corner));
      const qy = Math.max(0, Math.abs(dy) - (R - corner));
      if (!maskable && Math.hypot(qx, qy) > corner) { put(i, 0, 0, 0, 0); continue; }

      // night gradient
      const g = Math.min(1, d / R);
      put(i, 19 + 12 * (1 - g), 16 + 9 * (1 - g), 34 + 19 * (1 - g));

      // stars (hashed)
      const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      if (h - Math.floor(h) > 0.9985 && y < purseY - purseR * 0.8) mix(i, 227, 213, 179, 160);

      // moon
      const md = Math.hypot(x - moonX, y - moonY);
      if (md < moonR * 2.4) mix(i, 230, 225, 205, Math.max(0, 60 * (1 - md / (moonR * 2.4))));
      if (md < moonR) mix(i, 221, 216, 194, 255);

      // purse glow
      const pd = Math.hypot(x - cx, y - purseY);
      if (pd < purseR * 1.8) mix(i, 224, 168, 60, Math.max(0, 70 * (1 - pd / (purseR * 1.8))));

      // purse body (slightly squashed circle)
      const bd = Math.hypot((x - cx) / 1.05, (y - purseY) / 0.95);
      if (bd < purseR) {
        const shade = 1 - 0.45 * ((y - (purseY - purseR)) / (purseR * 2));
        const hi = Math.hypot(x - (cx - purseR * 0.3), y - (purseY - purseR * 0.35)) < purseR * 0.45 ? 25 : 0;
        mix(i, 224 * shade + hi, 168 * shade + hi, 60 * shade, 255);
      }
      // cinch band near the top of the purse
      if (bd < purseR && Math.abs(y - (purseY - purseR * 0.62)) < size * 0.018) mix(i, 90, 62, 20, 255);
      // cut cord: two short diagonal stubs above the purse
      const cordY = purseY - purseR * 0.95;
      for (const s of [-1, 1]) {
        const t = (y - (cordY - size * 0.09 * pad)) / (size * 0.09 * pad);
        if (t >= 0 && t <= 1) {
          const cordX = cx + s * (size * 0.03 + t * size * 0.05) * pad;
          if (Math.abs(x - cordX) < size * 0.014 && y < cordY) mix(i, 138, 100, 32, 255);
        }
      }
    }
  }
  return encodePNG(size, px);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', drawIcon(192, false));
writeFileSync('public/icons/icon-512.png', drawIcon(512, false));
writeFileSync('public/icons/icon-maskable-512.png', drawIcon(512, true));
console.log('icons written to public/icons/');
