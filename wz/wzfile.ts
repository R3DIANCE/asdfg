// WZ container (PKG1) + directory tree.
//
// Header layout for the GMS v232.2 64-bit build:
//   "PKG1" | u64 fileSize | u32 FStart | copyright (NUL-terminated)
//   then the root directory AT FStart.  There is NO u16 encrypted-version
//   field before the directory in this layout — byte FStart is the
//   compressed entry count.  Treating FStart-2..FStart as a version
//   (as older tooling does) shifts the whole parse by 2 bytes and yields
//   an empty tree.
//
// The version hash is therefore not recoverable from the header and must
// be found by scoring: with the right hash every kind-4 (image) entry's
// decoded offset lands on a 0x73 byte.  VERSION_HASH_GMS_232 is that
// value, solved and verified at 22833/22833 entries across this build.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { computeVersionHash, WzKey, WzReader } from "./reader.ts";
import { WzCanvasProperty, WzSubProperty, parsePropertyList, type WzProperty } from "./properties.ts";

/** Version hash solved for the GMS v232.2 client (computeVersionHash(777)). */
export const VERSION_HASH_GMS_232 = 0x0000e738;

export interface WzHeader {
  ident: string;
  fileSize: bigint;
  fStart: number;
  copyright: string;
}

/** One .img inside a container — parsed lazily. */
export class WzImage {
  root: WzSubProperty | null = null;
  truncated = false;
  warnings: string[] = [];
  constructor(
    public name: string,
    public parent: WzDirectory | null,
    public offset: number,
    public size: number,
    public file: WzFile,
  ) {}

  get path(): string {
    const p = this.parent?.path ?? "";
    return p ? `${p}/${this.name}` : this.name;
  }

  /** Read raw bytes at an absolute file offset. */
  readAt(offset: number, length: number): Buffer {
    return this.file.buf.subarray(offset, Math.min(offset + length, this.file.buf.length));
  }

  parse(): WzSubProperty {
    if (this.root) return this.root;
    const r = this.file.reader;
    r.seek(this.offset);
    const tag = r.u8();
    if (tag !== 0x73) {
      this.root = new WzSubProperty(this.name);
      return this.root;
    }
    const typeName = r.readString();
    r.skip(2); // reserved
    if (typeName !== "Property") {
      this.root = new WzSubProperty(this.name);
      return this.root;
    }
    const root = new WzSubProperty(this.name);
    for (const c of parsePropertyList(r, this.offset, root, this)) root.add(c);
    this.root = root;
    return root;
  }

  get(path: string): WzProperty | null {
    return this.parse().get(path);
  }
}

export class WzDirectory {
  subdirs = new Map<string, WzDirectory>();
  images = new Map<string, WzImage>();
  constructor(public name: string, public parent: WzDirectory | null = null) {}

  get path(): string {
    const parts: string[] = [];
    let n: WzDirectory | null = this;
    while (n && n.parent) {
      parts.push(n.name);
      n = n.parent;
    }
    return parts.reverse().join("/");
  }

  child(name: string): WzDirectory | WzImage | null {
    return this.subdirs.get(name) ?? this.images.get(name) ?? null;
  }

  /** Resolve a slash path to a directory, image, or property. */
  get(path: string): WzDirectory | WzImage | WzProperty | null {
    if (!path) return this;
    // `node` is deliberately loose: the property union contains subclasses
    // that share the `get` method, so instanceof narrowing collapses the
    // branch to `never`. Structural checks are what we actually want here.
    let node: unknown = this;
    for (const part of path.split("/")) {
      if (!part) continue;
      if (node instanceof WzDirectory) {
        node = node.child(part);
      } else if (typeof (node as { get?: unknown })?.get === "function") {
        node = (node as WzImage).get(part);
      } else {
        return null;
      }
      if (!node) return null;
    }
    return node as WzDirectory | WzImage | WzProperty;
  }
  *walkImages(prefix = ""): Generator<{ path: string; image: WzImage }> {
    for (const [name, sub] of this.subdirs) {
      yield* sub.walkImages(prefix ? `${prefix}/${name}` : name);
    }
    for (const [name, img] of this.images) {
      yield { path: prefix ? `${prefix}/${name}` : name, image: img };
    }
  }

  get imageCount(): number {
    let n = this.images.size;
    for (const s of this.subdirs.values()) n += s.imageCount;
    return n;
  }
}

export class WzFile {
  header!: WzHeader;
  root = new WzDirectory("");
  buf!: Buffer;
  reader!: WzReader;

  constructor(
    public path: string,
    public region = "BMS",
    public versionHash: number = VERSION_HASH_GMS_232,
  ) {}

  static open(path: string, region = "BMS", versionHash?: number): WzFile {
    const f = new WzFile(path, region, versionHash);
    f.load();
    return f;
  }

  private load(): void {
    this.buf = readFileSync(this.path);
    const key = WzKey.forRegion(this.region);
    this.reader = new WzReader(this.buf, key);
    const r = this.reader;

    const ident = r.read(4).toString("latin1");
    const fileSize = r.u64();
    const fStart = r.u32();
    let end = r.pos;
    while (this.buf[end] !== 0) end++;
    const copyright = this.buf.subarray(r.pos, end).toString("latin1");
    this.header = { ident, fileSize, fStart, copyright };

    r.headerFStart = fStart;
    r.versionHash = this.versionHash;
    // Directory begins at FStart — no u16 version field in this layout.
    r.seek(fStart);
    this.parseDirectory(this.root);
  }

  private parseDirectory(dir: WzDirectory): void {
    const r = this.reader;
    const count = r.cint();
    const entries: Array<{ name: string; kind: number; size: number; offset: number }> = [];
    for (let i = 0; i < count; i++) {
      let kind = r.u8();
      let name = "";
      if (kind === 1) {
        r.skip(10);
        continue;
      }
      if (kind === 2) {
        const strOff = r.i32();
        const keep = r.pos;
        r.seek(this.header.fStart + strOff);
        kind = r.u8();
        name = r.readString();
        r.seek(keep);
      } else if (kind === 3 || kind === 4) {
        name = r.readString();
      } else {
        continue;
      }
      const size = r.cint();
      r.cint(); // checksum
      const offset = r.readOffset();
      entries.push({ name, kind, size, offset });
    }
    for (const e of entries) {
      if (e.kind === 3) {
        const sub = new WzDirectory(e.name, dir);
        dir.subdirs.set(e.name, sub);
        const keep = r.pos;
        r.seek(e.offset);
        this.parseDirectory(sub);
        r.seek(keep);
      } else if (e.kind === 4) {
        dir.images.set(e.name, new WzImage(e.name, dir, e.offset, e.size, this));
      }
    }
  }
}

/**
 * Score a candidate version hash against a .wz file: with the correct
 * hash, every image entry's decoded offset lands on the 0x73 Property
 * tag. Returns the hit fraction.
 */
export function scoreVersion(path: string, versionHash: number, region = "BMS"): number {
  const buf = readFileSync(path);
  const key = WzKey.forRegion(region);
  const r = new WzReader(buf, key);
  const ident = r.read(4).toString("latin1");
  if (ident !== "PKG1") return -1;
  r.u64();
  const fStart = r.u32();
  r.headerFStart = fStart;
  r.versionHash = versionHash;
  r.seek(fStart);
  let count: number;
  try {
    count = r.cint();
  } catch {
    return -1;
  }
  if (count <= 0 || count > 20000) return -1;
  let imgs = 0, hits = 0;
  try {
    for (let i = 0; i < count; i++) {
      let kind = r.u8();
      if (kind === 1) { r.skip(10); continue; }
      if (kind === 2) {
        const so = r.i32();
        const keep = r.pos;
        r.seek(fStart + so);
        kind = r.u8();
        r.readString();
        r.seek(keep);
      } else if (kind === 3 || kind === 4) {
        r.readString();
      } else return -1;
      r.cint();
      r.cint();
      const off = r.readOffset();
      if (kind === 4) {
        imgs++;
        if (off >= 0 && off < buf.length && buf[off] === 0x73) hits++;
      }
    }
  } catch {
    return -1;
  }
  return imgs ? hits / imgs : -1;
}

/** Brute-force the version hash by scanning patch numbers 1..max. */
export function detectVersionHash(path: string, region = "BMS", max = 6000): number | null {
  let best: { hash: number; score: number } | null = null;
  for (let v = 1; v <= max; v++) {
    const h = computeVersionHash(v);
    const s = scoreVersion(path, h, region);
    if (s === 1) return h;
    if (s > 0 && (!best || s > best.score)) best = { hash: h, score: s };
  }
  return best?.hash ?? null;
}

/**
 * A 64-bit client's data directory: a structure file `<Base>.wz` plus
 * numbered siblings `<Base>_NNN.wz`, merged into one virtual tree.
 */
export class WzPackage {
  root = new WzDirectory("");
  files: WzFile[] = [];

  constructor(public dir: string, public base: string, public region = "BMS",
              public versionHash: number = VERSION_HASH_GMS_232) {}

  static open(dir: string, base: string, region = "BMS", versionHash?: number): WzPackage {
    const pkg = new WzPackage(dir, base, region, versionHash ?? VERSION_HASH_GMS_232);
    pkg.loadInto(pkg.root, dir, base);
    return pkg;
  }

  private packFiles(dir: string, base: string): string[] {
    const out: string[] = [];
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return out;
    }
    const structure = join(dir, `${base}.wz`);
    if (names.includes(`${base}.wz`)) out.push(structure);
    const indexed: Array<[number, string]> = [];
    for (const n of names) {
      const m = /_(\d+)\.wz$/i.exec(n);
      if (!m) continue;
      if (!n.toLowerCase().startsWith(`${base.toLowerCase()}_`)) continue;
      indexed.push([Number(m[1]), join(dir, n)]);
    }
    indexed.sort((a, b) => a[0] - b[0]);
    out.push(...indexed.map((x) => x[1]));
    return out;
  }

  private loadInto(target: WzDirectory, dir: string, base: string): void {
    for (const p of this.packFiles(dir, base)) {
      const wz = WzFile.open(p, this.region, this.versionHash);
      this.files.push(wz);
      mergeDir(target, wz.root);
    }
    let entries: string[] = [];
    try {
      entries = readdirSync(dir).filter((e) => {
        try {
          return statSync(join(dir, e)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch {
      return;
    }
    const lower = new Map(entries.map((e) => [e.toLowerCase(), e]));
    for (const subName of [...target.subdirs.keys()]) {
      const onDisk = lower.get(subName.toLowerCase());
      if (!onDisk) continue;
      this.loadInto(target.subdirs.get(subName)!, join(dir, onDisk), onDisk);
    }
  }

  get(path: string) {
    return this.root.get(path);
  }
  get imageCount(): number {
    return this.root.imageCount;
  }
}

function mergeDir(target: WzDirectory, source: WzDirectory): void {
  for (const [name, img] of source.images) {
    img.parent = target;
    target.images.set(name, img);
  }
  for (const [name, sub] of source.subdirs) {
    const existing = target.subdirs.get(name);
    if (existing) mergeDir(existing, sub);
    else {
      sub.parent = target;
      target.subdirs.set(name, sub);
    }
  }
}

/**
 * Open a client's Data directory: every `<Category>/` folder that holds a
 * `<Category>.wz` becomes a top-level branch of one virtual tree.
 */
export class WzClient {
  root = new WzDirectory("");
  packages = new Map<string, WzPackage>();

  constructor(public dataDir: string, public region = "BMS",
              public versionHash: number = VERSION_HASH_GMS_232) {}

  static open(dataDir: string, region = "BMS", versionHash?: number): WzClient {
    const c = new WzClient(dataDir, region, versionHash ?? VERSION_HASH_GMS_232);
    c.load();
    return c;
  }

  private load(): void {
    let cats: string[] = [];
    try {
      cats = readdirSync(this.dataDir).filter((e) => {
        try {
          return statSync(join(this.dataDir, e)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch {
      return;
    }
    for (const cat of cats) {
      const dir = join(this.dataDir, cat);
      const pkg = WzPackage.open(dir, cat, this.region, this.versionHash);
      if (!pkg.files.length) continue;
      this.packages.set(cat, pkg);
      const branch = new WzDirectory(cat, this.root);
      mergeDir(branch, pkg.root);
      this.root.subdirs.set(cat, branch);
    }
  }

  /** Every loaded .wz file, for stats. */
  get files(): WzFile[] {
    return [...this.packages.values()].flatMap((p) => p.files);
  }

  find(path: string) {
    return this.root.get(path);
  }
}
