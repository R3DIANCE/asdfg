// WZ binary reader + crypto + PNG encoder.
// Ported from wzpy (Leonana69/wz-python, MIT) which mirrors MapleLib.
//
// Region cipher: GMS v232.2 stores its .wz with the all-zero ("BMS") IV,
// so the keystream is zeros and string XOR is a no-op. The AES-derived
// keystream is still implemented for GMS/EMS archives.

import { deflateSync, inflateSync, inflateRawSync } from "node:zlib";

/** 4-byte region IVs, from MapleLib WzAESConstant.cs */
export const WZ_IV: Record<string, Buffer> = {
  GMS: Buffer.from([0x4d, 0x23, 0xc7, 0x2b]),
  EMS: Buffer.from([0xb9, 0x7d, 0x63, 0xe9]),
  BMS: Buffer.from([0x00, 0x00, 0x00, 0x00]),
};

export const WZ_OFFSET_CONSTANT = 0x581c3f6d;

/** 128-byte master key from MapleCryptoConstants.cs */
const USER_KEY_DEFAULT = Buffer.from([
  0x13, 0x00, 0x00, 0x00, 0x52, 0x00, 0x00, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x5b, 0x00, 0x00, 0x00,
  0x08, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x60, 0x00, 0x00, 0x00,
  0x06, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x43, 0x00, 0x00, 0x00, 0x0f, 0x00, 0x00, 0x00,
  0xb4, 0x00, 0x00, 0x00, 0x4b, 0x00, 0x00, 0x00, 0x35, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00,
  0x1b, 0x00, 0x00, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x5f, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00,
  0x0f, 0x00, 0x00, 0x00, 0x50, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x00, 0x00, 0x1b, 0x00, 0x00, 0x00,
  0x33, 0x00, 0x00, 0x00, 0x55, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00,
  0x52, 0x00, 0x00, 0x00, 0xde, 0x00, 0x00, 0x00, 0xc7, 0x00, 0x00, 0x00, 0x1e, 0x00, 0x00, 0x00,
]);

/** 8 source bytes at every 16th offset → 32-byte AES-256 key. */
const AES_KEY = (() => {
  const k = Buffer.alloc(32);
  for (let i = 0; i < 128; i += 16) k[i >> 2] = USER_KEY_DEFAULT[i];
  return k;
})();

/** Keystream generator. For a zero IV this is all zeros (no-op XOR). */
export class WzKey {
  private data = Buffer.alloc(0);
  private zero: boolean;
  constructor(private iv: Buffer) {
    if (iv.length !== 4) throw new Error("IV must be 4 bytes");
    this.zero = iv.readUInt32LE(0) === 0;
  }
  static forRegion(region: string): WzKey {
    const iv = WZ_IV[region];
    if (!iv) throw new Error(`unknown WZ region ${region}`);
    return new WzKey(iv);
  }
  ensure(size: number): void {
    if (size <= this.data.length) return;
    const target = (size + 15) & ~15;
    if (this.zero) {
      this.data = Buffer.alloc(target);
      return;
    }
    // AES-256-ECB over the repeated IV, chaining each block into the next.
    // Bun/Node expose the cipher via node:crypto; use it lazily so the
    // zero-IV fast path never pays for the import.
    const { createCipheriv } = require("node:crypto") as typeof import("node:crypto");
    const out = Buffer.alloc(target);
    this.data.copy(out, 0);
    let i = this.data.length;
    while (i < target) {
      let block: Buffer;
      if (i === 0) {
        block = Buffer.alloc(16);
        for (let j = 0; j < 16; j++) block[j] = this.iv[j % 4];
      } else {
        block = out.subarray(i - 16, i);
      }
      const c = createCipheriv("aes-256-ecb", AES_KEY, null);
      c.setAutoPadding(false);
      c.update(block).copy(out, i);
      i += 16;
    }
    this.data = out;
  }
  slice(n: number): Buffer {
    this.ensure(n);
    return this.data.subarray(0, n);
  }
  at(i: number): number {
    this.ensure(i + 1);
    return this.data[i];
  }
}

/** version hash from a patch number, per MapleLib WzTool. */
export function computeVersionHash(version: number): number {
  let h = 0;
  for (const ch of String(version)) h = (Math.imul(h, 32) + ch.charCodeAt(0) + 1) >>> 0;
  return h >>> 0;
}

export function deriveVersionCheck(hash: number): number {
  const a = (hash >>> 24) & 0xff,
    b = (hash >>> 16) & 0xff,
    c = (hash >>> 8) & 0xff,
    d = hash & 0xff;
  return ~(a ^ b ^ c ^ d) & 0xff;
}

/** Little-endian binary reader with WZ-specific helpers. */
export class WzReader {
  pos = 0;
  versionHash = 0;
  headerFStart = 0;
  private strCache = new Map<number, string>();
  private asciiCombined: Buffer | null = null;
  private unicodeCombined: Buffer | null = null;

  constructor(public buf: Buffer, public key: WzKey) {}

  seek(o: number): void {
    this.pos = o;
  }
  skip(n: number): void {
    this.pos += n;
  }
  get remaining(): number {
    return this.buf.length - this.pos;
  }
  read(n: number): Buffer {
    if (this.pos + n > this.buf.length) throw new EOFError(`wanted ${n} bytes at ${this.pos}`);
    const b = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }
  u8(): number {
    return this.read(1)[0];
  }
  i8(): number {
    return this.read(1).readInt8(0);
  }
  u16(): number {
    return this.read(2).readUInt16LE(0);
  }
  i16(): number {
    return this.read(2).readInt16LE(0);
  }
  u32(): number {
    return this.read(4).readUInt32LE(0);
  }
  i32(): number {
    return this.read(4).readInt32LE(0);
  }
  u64(): bigint {
    return this.read(8).readBigUInt64LE(0);
  }
  f32(): number {
    return this.read(4).readFloatLE(0);
  }
  f64(): number {
    return this.read(8).readDoubleLE(0);
  }

  /** Compressed int: 1 signed byte, or 0x80 sentinel + i32. */
  cint(): number {
    const sb = this.i8();
    return sb === -128 ? this.i32() : sb;
  }
  clong(): number {
    const sb = this.i8();
    if (sb !== -128) return sb;
    const v = this.read(8).readBigInt64LE(0);
    return Number(v);
  }

  private ensureAscii(len: number): Buffer {
    if (this.asciiCombined && this.asciiCombined.length >= len) return this.asciiCombined;
    const target = Math.max(len, 256, (this.asciiCombined?.length ?? 0) * 2);
    this.key.ensure(target);
    const out = Buffer.alloc(target);
    let mask = 0xaa;
    for (let i = 0; i < target; i++) {
      out[i] = (mask ^ this.key.at(i)) & 0xff;
      mask = (mask + 1) & 0xff;
    }
    this.asciiCombined = out;
    return out;
  }

  private ensureUnicode(chars: number): Buffer {
    const byteLen = chars * 2;
    if (this.unicodeCombined && this.unicodeCombined.length >= byteLen) return this.unicodeCombined;
    const targetChars = Math.max(chars, 256, Math.floor((this.unicodeCombined?.length ?? 0) / 2) * 2);
    const target = targetChars * 2;
    this.key.ensure(target);
    const out = Buffer.alloc(target);
    let mask = 0xaaaa;
    for (let i = 0; i < targetChars; i++) {
      const kp = (this.key.at(i * 2 + 1) << 8) | this.key.at(i * 2);
      const combined = (mask ^ kp) & 0xffff;
      out[i * 2] = combined & 0xff;
      out[i * 2 + 1] = (combined >> 8) & 0xff;
      mask = (mask + 1) & 0xffff;
    }
    this.unicodeCombined = out;
    return out;
  }

  private decodeAscii(len: number): string {
    const raw = this.read(len);
    const comb = this.ensureAscii(len);
    const out = Buffer.alloc(len);
    for (let i = 0; i < len; i++) out[i] = raw[i] ^ comb[i];
    return out.toString("latin1");
  }

  private decodeUnicode(len: number): string {
    const raw = this.read(len * 2);
    const comb = this.ensureUnicode(len);
    const out = Buffer.alloc(len * 2);
    for (let i = 0; i < len * 2; i++) out[i] = raw[i] ^ comb[i];
    return out.toString("utf16le");
  }

  /** sign<0 → ASCII, sign>0 → UTF-16LE. -128 / +127 are length extensions. */
  readString(): string {
    const sign = this.i8();
    if (sign === 0) return "";
    if (sign < 0) {
      const len = sign === -128 ? this.i32() : -sign;
      return len <= 0 ? "" : this.decodeAscii(len);
    }
    const len = sign === 127 ? this.i32() : sign;
    return len <= 0 ? "" : this.decodeUnicode(len);
  }

  readStringAt(offset: number): string {
    const hit = this.strCache.get(offset);
    if (hit !== undefined) return hit;
    const keep = this.pos;
    this.seek(offset);
    const s = this.readString();
    this.seek(keep);
    this.strCache.set(offset, s);
    return s;
  }

  /** Inline string (marker 0x00/0x73) or offset-indirected (0x01/0x1B). */
  readStringBlock(baseOffset: number): string {
    const marker = this.u8();
    if (marker === 0x00 || marker === 0x73) return this.readString();
    if (marker === 0x01 || marker === 0x1b) {
      const off = this.u32();
      return this.readStringAt(baseOffset + off);
    }
    throw new Error(`unknown string-block marker 0x${marker.toString(16)} at 0x${this.pos - 1}`);
  }

  /** Encrypted directory-entry offset. */
  readOffset(): number {
    let offset = this.pos >>> 0;
    offset = ((offset - this.headerFStart) ^ 0xffffffff) >>> 0;
    offset = Math.imul(offset, this.versionHash) >>> 0;
    offset = (offset - WZ_OFFSET_CONSTANT) >>> 0;
    const rot = offset & 0x1f;
    offset = (((offset << rot) | (offset >>> (32 - rot))) >>> 0) as number;
    const enc = this.u32();
    offset = (offset ^ enc) >>> 0;
    offset = (offset + this.headerFStart * 2) >>> 0;
    return offset;
  }
}

export class EOFError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "EOFError";
  }
}

// ── PNG encoding ──────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Encode straight RGBA bytes as a PNG. */
export function encodePng(rgba: Buffer, width: number, height: number): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export { inflateSync, inflateRawSync, deflateSync, constants, createInflate, createInflateRaw } from "node:zlib";
