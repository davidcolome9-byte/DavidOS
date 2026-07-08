// Generates PWA icons (PNG) without any image dependencies:
// raw RGBA pixels -> zlib deflate -> hand-assembled PNG chunks.
// Design: dark navy background, cyan circle, dark "D" mark.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixelFn) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const i = rowStart + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const NAVY = [15, 23, 42, 255];
const CYAN = [34, 211, 238, 255];

// "D" drawn geometrically: a vertical bar + a right half-ring.
function davidOsPixel(circleRadiusFrac) {
  return (x, y, size) => {
    const cx = size / 2;
    const cy = size / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const R = size * circleRadiusFrac;
    if (dist > R) return NAVY;

    // Inside the cyan circle — draw the dark D.
    const barLeft = cx - R * 0.42;
    const barRight = cx - R * 0.18;
    const barTop = cy - R * 0.5;
    const barBottom = cy + R * 0.5;
    const inBar = x >= barLeft && x <= barRight && y >= barTop && y <= barBottom;

    const ringCx = barRight;
    const rdx = x - ringCx;
    const rdy = y - cy;
    const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
    const inRing = rdx >= 0 && rdist >= R * 0.26 && rdist <= R * 0.5;

    return inBar || inRing ? NAVY : CYAN;
  };
}

writeFileSync(join(outDir, 'icon-192.png'), png(192, davidOsPixel(0.42)));
writeFileSync(join(outDir, 'icon-512.png'), png(512, davidOsPixel(0.42)));
// Maskable: smaller art so Android's mask (safe zone = inner 80%) never clips it.
writeFileSync(join(outDir, 'maskable-512.png'), png(512, davidOsPixel(0.32)));
console.log('Icons written to public/icons/');
