// One-shot icon generator for Flock-Avoid PWA.
//
// Run from the repo root:
//   npx tsx scripts/build-pwa-icons.ts
//
// Output:
//   public/icons/icon.svg
//   public/icons/icon-192.png
//   public/icons/icon-512.png
//   public/icons/icon-maskable-192.png
//   public/icons/icon-maskable-512.png
//
// Geometry mirrors the v0.2 brand mark used in the welcome modal:
//   - "any" icons:      transparent background, ink rounded square (full bleed),
//                       white inset square at the center.
//   - "maskable" icons: full-bleed ink background; centered white inset mark
//                       sized to sit well inside the 80% safe-zone box.
//
// PNG encoding uses only Node built-ins (zlib + Buffer + fs). No new dependency.
// Output is deterministic: re-running the script produces byte-equivalent files.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

// ---------- v0.2 brand colors ----------
const INK: RGBA = [0x0a, 0x0a, 0x0b, 0xff];
const SURFACE: RGBA = [0xff, 0xff, 0xff, 0xff];
const TRANSPARENT: RGBA = [0x00, 0x00, 0x00, 0x00];

// ---------- geometry ----------
const OUTER_RADIUS_RATIO = 0.22; // rounded-square outer (any-purpose icons)
const INNER_INSET_RATIO = 0.25; // inner white square inset for any-purpose icons
const INNER_RADIUS_RATIO = 0.06;

const MASKABLE_MARK_INSET = 0.32; // white mark inset for maskable icons
const MASKABLE_MARK_RADIUS_RATIO = 0.04;

// ---------- driver ----------
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const size of [192, 512] as const) {
    const any = renderAnyIcon(size);
    writeFileSync(resolve(OUT_DIR, `icon-${size}.png`), encodePNG(size, size, any));

    const maskable = renderMaskableIcon(size);
    writeFileSync(resolve(OUT_DIR, `icon-maskable-${size}.png`), encodePNG(size, size, maskable));
  }

  writeFileSync(resolve(OUT_DIR, 'icon.svg'), renderSVG());
  // eslint-disable-next-line no-console
  console.log(`Wrote 5 icon files to ${OUT_DIR}`);
}

// ---------- rasterizer ----------

type RGBA = readonly [number, number, number, number];

function renderAnyIcon(size: number): Uint8Array {
  const outer = { x0: 0, y0: 0, x1: size, y1: size, r: size * OUTER_RADIUS_RATIO };
  const innerInset = size * INNER_INSET_RATIO;
  const inner = {
    x0: innerInset,
    y0: innerInset,
    x1: size - innerInset,
    y1: size - innerInset,
    r: size * INNER_RADIUS_RATIO,
  };
  return rasterize(size, size, (x, y) => {
    if (insideRRect(x, y, inner)) return SURFACE;
    if (insideRRect(x, y, outer)) return INK;
    return TRANSPARENT;
  });
}

function renderMaskableIcon(size: number): Uint8Array {
  const markInset = size * MASKABLE_MARK_INSET;
  const mark = {
    x0: markInset,
    y0: markInset,
    x1: size - markInset,
    y1: size - markInset,
    r: size * MASKABLE_MARK_RADIUS_RATIO,
  };
  return rasterize(size, size, (x, y) => {
    if (insideRRect(x, y, mark)) return SURFACE;
    return INK;
  });
}

interface RRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly r: number;
}

function insideRRect(x: number, y: number, rect: RRect): boolean {
  const { x0, y0, x1, y1, r } = rect;
  const ax0 = x0 + r;
  const ax1 = x1 - r;
  const ay0 = y0 + r;
  const ay1 = y1 - r;
  const dx = Math.max(0, ax0 - x, x - ax1);
  const dy = Math.max(0, ay0 - y, y - ay1);
  return dx * dx + dy * dy <= r * r;
}

// 4x supersampling for anti-aliased edges.
const SUPERSAMPLE = 4;

function rasterize(
  width: number,
  height: number,
  shadeAt: (x: number, y: number) => RGBA,
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const samplesPerPixel = SUPERSAMPLE * SUPERSAMPLE;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = px + (sx + 0.5) / SUPERSAMPLE;
          const y = py + (sy + 0.5) / SUPERSAMPLE;
          const c = shadeAt(x, y);
          r += c[0];
          g += c[1];
          b += c[2];
          a += c[3];
        }
      }
      const i = (py * width + px) * 4;
      out[i] = Math.round(r / samplesPerPixel);
      out[i + 1] = Math.round(g / samplesPerPixel);
      out[i + 2] = Math.round(b / samplesPerPixel);
      out[i + 3] = Math.round(a / samplesPerPixel);
    }
  }
  return out;
}

// ---------- PNG encoder ----------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    if (byte === undefined) continue;
    const tableEntry = CRC_TABLE[(c ^ byte) & 0xff];
    if (tableEntry === undefined) continue;
    c = tableEntry ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- SVG ----------

function renderSVG(): string {
  const size = 100;
  const outerR = (OUTER_RADIUS_RATIO * size).toFixed(2);
  const innerInset = INNER_INSET_RATIO * size;
  const innerSize = size - 2 * innerInset;
  const innerR = (INNER_RADIUS_RATIO * size).toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect x="0" y="0" width="${size}" height="${size}" rx="${outerR}" ry="${outerR}" fill="#0a0a0b"/>
  <rect x="${innerInset}" y="${innerInset}" width="${innerSize}" height="${innerSize}" rx="${innerR}" ry="${innerR}" fill="#ffffff"/>
</svg>
`;
}

main();
