/**
 * @file `bun scripts/make-icon.ts` — writes `assets/icon.png`, the 1024x1024 app icon the native
 * packager turns into every platform icon size. A rounded brand-pink tile with a white check mark,
 * drawn as raw RGBA pixels and encoded here (PNG is a handful of CRC-checked chunks around one
 * zlib stream), so the icon is regenerable source rather than an opaque binary nobody can change.
 */
import { deflateSync } from "node:zlib";

/** Icon edge length in pixels — the size the packager expects. */
const SIZE = 1024;

/** Corner radius of the tile, in pixels. */
const RADIUS = 228;

/** Brand pink, as RGB. */
const BRAND = [236, 72, 153] as const;

/** The check mark colour, as RGB. */
const MARK = [255, 255, 255] as const;

/** Half-thickness of the check-mark stroke, in pixels. */
const STROKE = 40;

/** The check mark's three corners, as fractions of the edge. */
const CHECK: readonly (readonly [number, number])[] = [
  [0.28, 0.52],
  [0.44, 0.68],
  [0.74, 0.34]
];

/** PNG file signature. */
const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Lookup table backing {@link crc32}, built once. */
const CRC_TABLE = buildCrcTable();

await Bun.write("assets/icon.png", encodePng(drawIcon()));

/**
 * Draw the icon into a raw RGBA buffer: a rounded square filled with the brand colour, with the
 * check mark laid over it. Pixels outside the rounded corners stay fully transparent.
 *
 * @returns One RGBA byte quad per pixel, row by row.
 * @example
 * ```ts
 * const pixels = drawIcon(); // SIZE * SIZE * 4 bytes
 * ```
 */
function drawIcon(): Uint8Array {
  const pixels = new Uint8Array(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!insideRoundedSquare(x, y)) continue;

      const colour = nearCheckMark(x, y) ? MARK : BRAND;
      const at = (y * SIZE + x) * 4;
      pixels[at] = colour[0];
      pixels[at + 1] = colour[1];
      pixels[at + 2] = colour[2];
      pixels[at + 3] = 255;
    }
  }

  return pixels;
}

/**
 * Whether a pixel falls inside the rounded square — inside the straight edges, or within the
 * corner radius of the nearest corner centre.
 *
 * @param x - Pixel column.
 * @param y - Pixel row.
 * @returns Whether the pixel is painted.
 * @example
 * ```ts
 * insideRoundedSquare(0, 0); // false — a corner is cut away
 * ```
 */
function insideRoundedSquare(x: number, y: number): boolean {
  const near = SIZE - 1 - RADIUS;
  const cornerX = x < RADIUS ? RADIUS : x > near ? near : x;
  const cornerY = y < RADIUS ? RADIUS : y > near ? near : y;

  return Math.hypot(x - cornerX, y - cornerY) <= RADIUS;
}

/**
 * Whether a pixel lies within the stroke width of the check mark's two segments.
 *
 * @param x - Pixel column.
 * @param y - Pixel row.
 * @returns Whether the pixel belongs to the mark.
 * @example
 * ```ts
 * nearCheckMark(512, 512);
 * ```
 */
function nearCheckMark(x: number, y: number): boolean {
  for (let index = 0; index < CHECK.length - 1; index++) {
    const from = CHECK[index];
    const to = CHECK[index + 1];
    if (!from || !to) continue;

    const distance = distanceToSegment(
      x,
      y,
      from[0] * SIZE,
      from[1] * SIZE,
      to[0] * SIZE,
      to[1] * SIZE
    );
    if (distance <= STROKE) return true;
  }

  return false;
}

/**
 * Shortest distance from a point to a line segment.
 *
 * @param x - Point column.
 * @param y - Point row.
 * @param startX - Segment start column.
 * @param startY - Segment start row.
 * @param endX - Segment end column.
 * @param endY - Segment end row.
 * @returns The distance in pixels.
 * @example
 * ```ts
 * distanceToSegment(5, 0, 0, 0, 10, 0); // 0
 * ```
 */
function distanceToSegment(
  x: number,
  y: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): number {
  const spanX = endX - startX;
  const spanY = endY - startY;
  const lengthSquared = spanX * spanX + spanY * spanY;
  const raw = lengthSquared === 0 ? 0 : ((x - startX) * spanX + (y - startY) * spanY) / lengthSquared;
  const clamped = Math.min(1, Math.max(0, raw));

  return Math.hypot(x - (startX + clamped * spanX), y - (startY + clamped * spanY));
}

/**
 * Encode RGBA pixels as a PNG: signature, IHDR, one deflated IDAT of filter-0 scanlines, IEND.
 *
 * @param pixels - RGBA bytes, row by row.
 * @returns The complete PNG file bytes.
 * @example
 * ```ts
 * await Bun.write("assets/icon.png", encodePng(drawIcon()));
 * ```
 */
function encodePng(pixels: Uint8Array): Uint8Array {
  const stride = SIZE * 4;
  const raw = new Uint8Array((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, SIZE);
  view.setUint32(4, SIZE);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: truecolour with alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk("IEND", new Uint8Array(0))
  ]);
}

/**
 * Build one PNG chunk: length, type, payload, CRC over type and payload.
 *
 * @param type - The four-character chunk type.
 * @param payload - The chunk's data bytes.
 * @returns The encoded chunk.
 * @example
 * ```ts
 * chunk("IEND", new Uint8Array(0));
 * ```
 */
function chunk(type: string, payload: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = concat([typeBytes, payload]);
  const out = new Uint8Array(body.length + 8);
  const view = new DataView(out.buffer);

  view.setUint32(0, payload.length);
  out.set(body, 4);
  view.setUint32(out.length - 4, crc32(body));

  return out;
}

/**
 * Join byte arrays end to end.
 *
 * @param parts - The arrays to join.
 * @returns One array holding every part in order.
 * @example
 * ```ts
 * concat([a, b]);
 * ```
 */
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }

  return out;
}

/**
 * Build the CRC-32 lookup table PNG chunks are checked with.
 *
 * @returns 256 precomputed remainders.
 * @example
 * ```ts
 * buildCrcTable()[0]; // 0
 * ```
 */
function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}

/**
 * CRC-32 of a byte array, as PNG specifies it.
 *
 * @param bytes - The bytes to check.
 * @returns The unsigned checksum.
 * @example
 * ```ts
 * crc32(new TextEncoder().encode("IEND"));
 * ```
 */
function crc32(bytes: Uint8Array): number {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }

  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}
