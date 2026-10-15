// WZ canvas (sprite) decoding → PNG.
//
// WZ canvas payloads are zlib streams in one of several pixel formats.
// The decompressed bytes may also be XOR-obfuscated ("listWz") when the
// first two bytes are not a zlib header.

import { inflateSync, inflateRawSync, createInflate, createInflateRaw, constants, encodePng, WzKey } from "./reader.ts";
import type { WzCanvasProperty } from "./properties.ts";

const ZLIB_HEADERS = new Set([0x9c78, 0xda78, 0x0178, 0x5e78]);

/**
 * Inflate that tolerates a truncated stream.
 *
 * WZ canvas payloads are sometimes clipped at the extended-block boundary
 * while the real zlib stream continues past it, so a strict inflate throws
 * "unexpected end of file". `finishFlush: Z_SYNC_FLUSH` makes zlib return
 * everything decoded so far instead of erroring — the Python reference
 * gets the same behaviour from `decompressobj()` + `flush()`.
 */
function inflateLenient(data: Buffer, raw = false): Buffer {
  const opts = { finishFlush: constants.Z_SYNC_FLUSH } as const;
  try {
    return raw ? inflateRawSync(data, opts) : inflateSync(data, opts);
  } catch (e) {
    // Even sync-flush can refuse a badly clipped tail; fall back to the
    // stream API, which yields partial output before erroring.
    try {
      const d = raw ? createInflateRaw() : createInflate();
      const out: Buffer[] = [];
      d.on("data", (c: Buffer) => out.push(c));
      d.end(data);
      return Buffer.concat(out);
    } catch {
      throw e;
    }
  }
}

/** listWz: 4-byte LE chunk length, then key-XOR'd chunk bytes. */
function tryListWz(raw: Buffer, key: WzKey): Buffer {
  const out: Buffer[] = [];
  let p = 0;
  while (p + 4 <= raw.length) {
    const len = raw.readUInt32LE(p);
    p += 4;
    if (len <= 0 || len > raw.length) throw new Error("invalid listWz chunk length");
    if (p + len > raw.length) throw new Error("truncated listWz chunk");
    const chunk = raw.subarray(p, p + len);
    p += len;
    key.ensure(len);
    const ks = key.slice(len);
    const dec = Buffer.alloc(len);
    for (let i = 0; i < len; i++) dec[i] = chunk[i] ^ ks[i];
    out.push(dec);
  }
  return Buffer.concat(out);
}

export function decompressCanvas(raw: Buffer, key: WzKey): Buffer {
  if (raw.length < 2) return Buffer.alloc(0);
  const attempts: Array<[string, () => Buffer]> = [
    ["zlib", () => inflateLenient(raw)],
    ["raw-deflate-skip2", () => inflateLenient(raw.subarray(2), true)],
    ["listwz-zlib", () => inflateLenient(tryListWz(raw, key))],
    ["listwz-raw-deflate-skip2", () => inflateLenient(tryListWz(raw, key).subarray(2), true)],
  ];
  const errors: string[] = [];
  for (const [name, fn] of attempts) {
    try {
      const r = fn();
      if (r.length) return r;
      errors.push(`${name}: empty`);
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  throw new Error(
    `no canvas decoder succeeded (first 16 bytes: ${raw.subarray(0, 16).toString("hex")}); attempts: ${errors.join(" | ")}`,
  );
}

/** Decode one DXT colour block's 4-colour palette (BC2/BC3, unconditional). */
function dxtPalette(c0: number, c1: number): Uint8Array {
  const pal = new Uint8Array(16);
  const unpack = (c: number) => [
    Math.floor(((c >> 11) & 0x1f) * 255 / 31),
    Math.floor(((c >> 5) & 0x3f) * 255 / 63),
    Math.floor((c & 0x1f) * 255 / 31),
  ];
  const [r0, g0, b0] = unpack(c0);
  const [r1, g1, b1] = unpack(c1);
  pal.set([r0, g0, b0], 0);
  pal.set([r1, g1, b1], 3);
  pal.set([(2 * r0 + r1 + 1) / 3 | 0, (2 * g0 + g1 + 1) / 3 | 0, (2 * b0 + b1 + 1) / 3 | 0], 6);
  pal.set([(r0 + 2 * r1 + 1) / 3 | 0, (g0 + 2 * g1 + 1) / 3 | 0, (b0 + 2 * b1 + 1) / 3 | 0], 9);
  return pal;
}

function decodeDxt(data: Buffer, width: number, height: number, dxt5: boolean): Buffer {
  const bw = Math.ceil(width / 4), bh = Math.ceil(height / 4);
  const blockBytes = dxt5 ? 16 : 16;
  const out = Buffer.alloc(width * height * 4);
  const pal = new Uint8Array(16);
  const alpha = new Uint8Array(16);

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const off = (by * bw + bx) * blockBytes;
      if (off + blockBytes > data.length) continue;
      // alpha block first (DXT3 = 8 explicit bytes, DXT5 = 2 endpoints + 48-bit indices)
      if (dxt5) {
        const a0 = data[off], a1 = data[off + 1];
        alpha[0] = a0;
        alpha[1] = a1;
        if (a0 > a1) {
          for (let i = 1; i <= 6; i++) alpha[1 + i] = Math.floor(((7 - i) * a0 + i * a1 + 3) / 7);
        } else {
          for (let i = 1; i <= 4; i++) alpha[1 + i] = Math.floor(((5 - i) * a0 + i * a1 + 2) / 5);
          alpha[6] = 0;
          alpha[7] = 255;
        }
        // 48-bit little-endian index field
        let bits = 0n;
        for (let i = 0; i < 6; i++) bits |= BigInt(data[off + 2 + i]) << BigInt(8 * i);
        for (let i = 0; i < 16; i++) alpha[i] = alpha[Number((bits >> BigInt(3 * i)) & 7n)];
      } else {
        for (let i = 0; i < 8; i++) {
          const b = data[off + i];
          alpha[i * 2] = (b & 0x0f) * 17;
          alpha[i * 2 + 1] = (b >> 4) * 17;
        }
      }
      // colour block
      const co = off + 8;
      const c0 = data[co] | (data[co + 1] << 8);
      const c1 = data[co + 2] | (data[co + 3] << 8);
      pal.set(dxtPalette(c0, c1));
      const idx = data.readUInt32LE(co + 4);
      for (let i = 0; i < 16; i++) {
        const pi = (idx >>> (2 * i)) & 3;
        const px = bx * 4 + (i % 4);
        const py = by * 4 + Math.floor(i / 4);
        if (px >= width || py >= height) continue;
        const o = (py * width + px) * 4;
        out[o] = pal[pi * 3];
        out[o + 1] = pal[pi * 3 + 1];
        out[o + 2] = pal[pi * 3 + 2];
        out[o + 3] = alpha[i];
      }
    }
  }
  return out;
}

/** BC7 / BPTC (format 4098) — newer 64-bit clients. */
function decodeBc7(data: Buffer, width: number, height: number): Buffer {
  // BC7 has 8 modes with different partition/rotation/index schemes.
  // Mode 6 (the only one with a fixed 128-bit layout and no partitions)
  // is by far the most common in MapleStory UI sprites; other modes are
  // rare. We decode mode 6 exactly and fall back to opaque magenta so
  // an unsupported block is visible rather than silently black.
  const bw = Math.ceil(width / 4), bh = Math.ceil(height / 4);
  const out = Buffer.alloc(width * height * 4);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const off = (by * bw + bx) * 16;
      if (off + 16 > data.length) continue;
      const blk = data.subarray(off, off + 16);
      let mode = 0;
      for (let i = 0; i < 8; i++) {
        if (blk[i >> 3] & (1 << (i & 7))) { mode = i; break; }
      }
      const write = (i: number, r: number, g: number, b: number, a: number) => {
        const px = bx * 4 + (i % 4), py = by * 4 + Math.floor(i / 4);
        if (px >= width || py >= height) return;
        const o = (py * width + px) * 4;
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
      };
      if (mode !== 6) {
        for (let i = 0; i < 16; i++) write(i, 255, 0, 255, 255);
        continue;
      }
      // Mode 6: 1 mode bit (7 zero bits) + 7+7 bits per endpoint, 4-bit indices, no alpha.
      let bits = 0n;
      for (let i = 0; i < 16; i++) bits |= BigInt(blk[i]) << BigInt(8 * i);
      bits >>= 7n; // drop the 7-bit mode prefix (mode 6 = bit 6 set)
      const take = (n: number) => {
        const v = Number(bits & ((1n << BigInt(n)) - 1n));
        bits >>= BigInt(n);
        return v;
      };
      const r0 = take(7), r1 = take(7);
      const g0 = take(7), g1 = take(7);
      const b0 = take(7), b1 = take(7);
      const a0 = take(7), a1 = take(7);
      const expand = (v: number) => (v << 1) | (v >> 6);
      const ep = [
        [expand(r0), expand(g0), expand(b0), expand(a0)],
        [expand(r1), expand(g1), expand(b1), expand(a1)],
      ];
      const weights = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];
      const idxBits = take(2) === 0 ? 3 : 2; // partition field is 0 for mode 6
      for (let i = 0; i < 16; i++) {
        const w = weights[take(idxBits)];
        const c0 = ep[0], c1 = ep[1];
        write(
          i,
          Math.min(255, Math.round((c0[0] * (64 - w) + c1[0] * w) / 64)),
          Math.min(255, Math.round((c0[1] * (64 - w) + c1[1] * w) / 64)),
          Math.min(255, Math.round((c0[2] * (64 - w) + c1[2] * w) / 64)),
          Math.min(255, Math.round((c0[3] * (64 - w) + c1[3] * w) / 64)),
        );
      }
    }
  }
  return out;
}

/** Raw decompressed pixels → RGBA buffer. */
export function decodePixels(data: Buffer, width: number, height: number, fmt: number): Buffer {
  const n = width * height;
  if (fmt === 1) {
    // ARGB4444
    const out = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) {
      const lo = data[i * 2], hi = data[i * 2 + 1];
      out[i * 4] = (hi & 0x0f) | ((hi & 0x0f) << 4);
      out[i * 4 + 1] = (lo & 0xf0) | ((lo & 0xf0) >> 4);
      out[i * 4 + 2] = (lo & 0x0f) | ((lo & 0x0f) << 4);
      out[i * 4 + 3] = (hi & 0xf0) | ((hi & 0xf0) >> 4);
    }
    return out;
  }
  if (fmt === 2) {
    // ARGB8888 stored BGRA
    const out = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) {
      out[i * 4] = data[i * 4 + 2];
      out[i * 4 + 1] = data[i * 4 + 1];
      out[i * 4 + 2] = data[i * 4];
      out[i * 4 + 3] = data[i * 4 + 3];
    }
    return out;
  }
  if (fmt === 3) {
    // 4x4 downsampled ARGB8888 → nearest-neighbour upscale
    const sw = Math.ceil(width / 4), sh = Math.ceil(height / 4);
    const small = decodePixels(data, sw, sh, 2);
    const out = Buffer.alloc(n * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = (Math.floor(y / 4) * sw + Math.floor(x / 4)) * 4;
        const o = (y * width + x) * 4;
        out[o] = small[s]; out[o + 1] = small[s + 1]; out[o + 2] = small[s + 2]; out[o + 3] = small[s + 3];
      }
    }
    return out;
  }
  if (fmt === 257) {
    // ARGB1555
    const out = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) {
      const v = data[i * 2] | (data[i * 2 + 1] << 8);
      out[i * 4] = ((v >> 10) & 0x1f) * 8;
      out[i * 4 + 1] = ((v >> 5) & 0x1f) * 8;
      out[i * 4 + 2] = (v & 0x1f) * 8;
      out[i * 4 + 3] = v & 0x8000 ? 255 : 0;
    }
    return out;
  }
  if (fmt === 513) {
    // RGB565
    const out = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) {
      const v = data[i * 2] | (data[i * 2 + 1] << 8);
      out[i * 4] = ((v >> 11) & 0x1f) * 8;
      out[i * 4 + 1] = ((v >> 5) & 0x3f) * 4;
      out[i * 4 + 2] = (v & 0x1f) * 8;
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  if (fmt === 517) {
    // 16x16 downsampled RGB565
    const sw = Math.ceil(width / 16), sh = Math.ceil(height / 16);
    const small = decodePixels(data.subarray(0, sw * sh * 2), sw, sh, 513);
    const out = Buffer.alloc(n * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = (Math.floor(y / 16) * sw + Math.floor(x / 16)) * 4;
        const o = (y * width + x) * 4;
        out[o] = small[s]; out[o + 1] = small[s + 1]; out[o + 2] = small[s + 2]; out[o + 3] = 255;
      }
    }
    return out;
  }
  if (fmt === 1026) return decodeDxt(data, width, height, false);
  if (fmt === 2050) return decodeDxt(data, width, height, true);
  if (fmt === 4098) return decodeBc7(data, width, height);
  throw new Error(`unsupported canvas format ${fmt}`);
}

/** Full path: canvas property → PNG bytes. */
export function canvasToPng(canvas: WzCanvasProperty, key: WzKey): Buffer {
  const raw = canvas.pngData();
  const pixels = decompressCanvas(raw, key);
  const rgba = decodePixels(pixels, canvas.width, canvas.height, canvas.format + canvas.format2);
  return encodePng(rgba, canvas.width, canvas.height);
}

// ── compositing frame buffer ──────────────────────────────────────────
/**
 * An RGBA scratch buffer with rect/draw ops, so several WZ canvases can be
 * composited into one PNG (map previews, character assembly).
 */
export class FrameBuffer {
  data: Buffer;
  constructor(public width: number, public height: number) {
    this.data = Buffer.alloc(width * height * 4);
  }

  clear(r: number, g: number, b: number, a: number): void {
    for (let i = 0; i < this.width * this.height; i++) {
      this.data[i * 4] = r; this.data[i * 4 + 1] = g; this.data[i * 4 + 2] = b; this.data[i * 4 + 3] = a;
    }
  }

  rect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number): void {
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w), y1 = Math.min(this.height, y + h);
    for (let py = y0; py < y1; py++) {
      let o = (py * this.width + x0) * 4;
      for (let px = x0; px < x1; px++) {
        this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b; this.data[o + 3] = a;
        o += 4;
      }
    }
  }

  /** Alpha-blend an RGBA buffer at (x, y). */
  blend(src: Buffer, sw: number, sh: number, x: number, y: number, flip = false): void {
    for (let sy = 0; sy < sh; sy++) {
      const py = y + sy;
      if (py < 0 || py >= this.height) continue;
      for (let sx = 0; sx < sw; sx++) {
        const px = x + sx;
        if (px < 0 || px >= this.width) continue;
        const so = (sy * sw + (flip ? sw - 1 - sx : sx)) * 4;
        const sa = src[so + 3];
        if (!sa) continue;
        const dof = (py * this.width + px) * 4;
        const da = this.data[dof + 3];
        // Source-over with straight (non-premultiplied) alpha.
        const outA = sa + (da * (255 - sa)) / 255;
        for (let c = 0; c < 3; c++) {
          const s = src[so + c], d = this.data[dof + c];
          this.data[dof + c] = Math.round((s * sa + d * da * (255 - sa) / 255) / (outA || 1));
        }
        this.data[dof + 3] = Math.round(outA);
      }
    }
  }

  toPng(): Buffer {
    return encodePng(this.data, this.width, this.height);
  }
}

/** Run `draw` against a fresh frame buffer and return the PNG. */
export function canvasFramePng(width: number, height: number, draw: (b: FrameBuffer) => void): Buffer {
  const fb = new FrameBuffer(width, height);
  draw(fb);
  return fb.toPng();
}
