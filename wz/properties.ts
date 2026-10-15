// IMG property tree — parsed from a .img inside a .wz container.
//
// Type tags (MapleLib WzLib/WzProperties):
//   0 Null · 2/11 Short · 3/19 CompressedInt · 4 Float · 5 Double
//   8 String · 9 Extended (Property/Canvas/Vector/Convex/Sound/UOL)
//   20 CompressedLong (post-BB)

import { EOFError, WzReader, type WzKey } from "./reader.ts";
import type { WzImage } from "./wzfile.ts";

export type WzProperty =
  | WzNullProperty
  | WzShortProperty
  | WzIntProperty
  | WzLongProperty
  | WzFloatProperty
  | WzDoubleProperty
  | WzStringProperty
  | WzVectorProperty
  | WzUolProperty
  | WzConvexProperty
  | WzSubProperty
  | WzCanvasProperty
  | WzSoundProperty;

export class WzNullProperty {
  readonly type: string = "Null";
  constructor(public name: string, public parent: WzProperty | null = null) {}
  get value(): unknown {
    return null;
  }
  child(_name: string): WzProperty | null {
    return null;
  }
  children(): WzProperty[] {
    return [];
  }
  get(path: string): WzProperty | null {
    let node: WzProperty | null = this;
    for (const part of path.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        node = node?.parent ?? null;
        continue;
      }
      node = node?.child(part) ?? null;
      if (!node) return null;
    }
    return node;
  }
}

export class WzShortProperty extends WzNullProperty {
  readonly type: string = "Short";
  constructor(name: string, public num: number, parent: WzProperty | null = null) {
    super(name, parent);
  }
  get value(): unknown {
    return this.num;
  }
}

export class WzIntProperty extends WzNullProperty {
  readonly type: string = "Int";
  constructor(name: string, public num: number, parent: WzProperty | null = null) {
    super(name, parent);
  }
  get value(): unknown {
    return this.num;
  }
}

export class WzLongProperty extends WzNullProperty {
  readonly type: string = "Long";
  constructor(name: string, public num: number, parent: WzProperty | null = null) {
    super(name, parent);
  }
  get value(): unknown {
    return this.num;
  }
}

export class WzFloatProperty extends WzNullProperty {
  readonly type: string = "Float";
  constructor(name: string, public num: number, parent: WzProperty | null = null) {
    super(name, parent);
  }
  get value(): unknown {
    return this.num;
  }
}

export class WzDoubleProperty extends WzNullProperty {
  readonly type: string = "Double";
  constructor(name: string, public num: number, parent: WzProperty | null = null) {
    super(name, parent);
  }
  get value(): unknown {
    return this.num;
  }
}

export class WzStringProperty extends WzNullProperty {
  readonly type: string = "String";
  constructor(name: string, public str: string, parent: WzProperty | null = null) {
    super(name, parent);
  }
  get value(): unknown {
    return this.str;
  }
}

export class WzVectorProperty extends WzNullProperty {
  readonly type: string = "Vector";
  constructor(name: string, public x: number, public y: number, parent: WzProperty | null = null) {
    super(name, parent);
  }
  get value(): unknown {
    return [this.x, this.y];
  }
}

/** Symlink to another property — sibling-relative path. */
export class WzUolProperty extends WzNullProperty {
  readonly type: string = "UOL";
  constructor(name: string, public link: string, parent: WzProperty | null = null) {
    super(name, parent);
  }
  get value(): unknown {
    return this.link;
  }
}

export class WzConvexProperty extends WzNullProperty {
  readonly type: string = "Convex";
  points: WzVectorProperty[] = [];
  override children(): WzProperty[] {
    return this.points;
  }
}

export class WzSubProperty extends WzNullProperty {
  readonly type: string = "SubProperty";
  protected map = new Map<string, WzProperty>();
  add(p: WzProperty): void {
    p.parent = this;
    this.map.set(p.name, p);
  }
  override child(name: string): WzProperty | null {
    return this.map.get(name) ?? null;
  }
  override children(): WzProperty[] {
    return [...this.map.values()];
  }
  get size(): number {
    return this.map.size;
  }
}

export class WzCanvasProperty extends WzSubProperty {
  readonly type: string = "Canvas";
  width = 0;
  height = 0;
  format = 0;
  format2 = 0;
  pngOffset = 0;
  pngLength = 0;
  constructor(name: string, parent: WzProperty | null, public image: WzImage) {
    super(name, parent);
  }
  hasPixels(): boolean {
    return this.pngLength > 0;
  }
  /** Raw compressed payload, read straight from the container. */
  pngData(): Buffer {
    return this.image.readAt(this.pngOffset, this.pngLength);
  }
}

export class WzSoundProperty extends WzNullProperty {
  readonly type: string = "Sound";
  lengthMs = 0;
  dataOffset = 0;
  dataLength = 0;
  constructor(name: string, parent: WzProperty | null, public image: WzImage) {
    super(name, parent);
  }
  audio(): Buffer {
    return this.image.readAt(this.dataOffset, this.dataLength);
  }
}

// ── parsing ───────────────────────────────────────────────────────────

/** Parse a property list, degrading gracefully on truncation. */
export function parsePropertyList(
  r: WzReader,
  baseOffset: number,
  parent: WzProperty,
  image: WzImage,
): WzProperty[] {
  let count: number;
  try {
    count = r.cint();
  } catch (e) {
    if (e instanceof EOFError) image.truncated = true;
    else throw e;
    return [];
  }
  const items: WzProperty[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const name = r.readStringBlock(baseOffset);
      items.push(parseProperty(r, baseOffset, name, parent, image));
    } catch (e) {
      if (e instanceof EOFError) {
        image.truncated = true;
        break;
      }
      image.truncated = true;
      image.warnings.push(`stopped parsing ${parent.name || "?"}: ${(e as Error).message}`);
      break;
    }
  }
  return items;
}

/** One property: name already read, tag byte next. */
function parseProperty(
  r: WzReader,
  baseOffset: number,
  name: string,
  parent: WzProperty,
  image: WzImage,
): WzProperty {
  const tag = r.u8();
  switch (tag) {
    case 0:
      return new WzNullProperty(name, parent);
    case 2:
    case 11:
      return new WzShortProperty(name, r.i16(), parent);
    case 3:
    case 19:
      return new WzIntProperty(name, r.cint(), parent);
    case 20:
      return new WzLongProperty(name, r.clong(), parent);
    case 4: {
      const sub = r.u8();
      return new WzFloatProperty(name, sub === 0x80 ? r.f32() : 0, parent);
    }
    case 5:
      return new WzDoubleProperty(name, r.f64(), parent);
    case 8:
      return new WzStringProperty(name, r.readStringBlock(baseOffset), parent);
    case 9: {
      const blockSize = r.u32();
      const endPos = r.pos + blockSize;
      const extType = r.readStringBlock(baseOffset);
      const prop = parseExtended(r, baseOffset, name, extType, parent, image, endPos);
      if (r.pos < endPos) r.seek(endPos);
      return prop;
    }
    default:
      throw new Error(`unknown property tag ${tag} for '${name}' at 0x${r.pos - 1}`);
  }
}

function parseExtended(
  r: WzReader,
  baseOffset: number,
  name: string,
  extType: string,
  parent: WzProperty,
  image: WzImage,
  endPos: number,
): WzProperty {
  if (extType === "Property") {
    const sub = new WzSubProperty(name, parent);
    r.skip(2); // reserved
    for (const c of parsePropertyList(r, baseOffset, sub, image)) sub.add(c);
    return sub;
  }

  if (extType === "Shape2D#Convex2D") {
    const convex = new WzConvexProperty(name, parent);
    const count = r.cint();
    for (let i = 0; i < count; i++) {
      const childType = r.readStringBlock(baseOffset);
      const child = parseExtended(r, baseOffset, String(i), childType, convex, image, endPos);
      if (child instanceof WzVectorProperty) convex.points.push(child);
    }
    return convex;
  }

  if (extType === "Canvas") {
    const canvas = new WzCanvasProperty(name, parent, image);
    r.skip(1); // reserved
    const hasChildren = r.u8();
    if (hasChildren === 1) {
      r.skip(2);
      for (const c of parsePropertyList(r, baseOffset, canvas, image)) canvas.add(c);
    }
    canvas.width = r.cint();
    canvas.height = r.cint();
    canvas.format = r.cint();
    canvas.format2 = r.u8();
    r.skip(4); // reserved
    r.i32(); // declared length — unreliable across versions; block end is authoritative
    r.skip(1); // filler
    canvas.pngOffset = r.pos;
    canvas.pngLength = Math.max(0, endPos - r.pos);
    r.seek(endPos);
    return canvas;
  }

  if (extType === "Shape2D#Vector2D") {
    return new WzVectorProperty(name, r.cint(), r.cint(), parent);
  }

  if (extType === "Sound_DX8" || extType === "Sound") {
    const sound = new WzSoundProperty(name, parent, image);
    r.skip(1); // reserved
    sound.dataLength = r.cint();
    sound.lengthMs = r.cint();
    const headerStart = r.pos;
    const avail = endPos - headerStart - sound.dataLength;
    if (avail > 0) r.read(avail);
    sound.dataOffset = r.pos;
    r.skip(sound.dataLength);
    return sound;
  }

  if (extType === "UOL") {
    r.skip(1);
    return new WzUolProperty(name, r.readStringBlock(baseOffset), parent);
  }

  // Unknown extended type — keep parsing as an opaque container.
  return new WzSubProperty(name, parent);
}

/** Follow a UOL chain to its non-UOL target. */
export function resolveUol(prop: WzProperty | null): WzProperty | null {
  const seen = new Set<WzProperty>();
  let cur = prop;
  for (let i = 0; i < 16; i++) {
    if (!cur || !(cur instanceof WzUolProperty)) return cur;
    if (seen.has(cur)) return null;
    seen.add(cur);
    if (!cur.parent) return null;
    cur = cur.parent.get(cur.link);
  }
  return null;
}

/**
 * Follow UOL, _inlink, and _outlink references on a canvas to find its authoritative source canvas.
 * Modern post-BB MapleStory clients use _inlink and _outlink to avoid duplicate PNG data.
 */
export function resolveCanvas(
  prop: WzProperty | null,
  getStoreImage?: (cat: string, img: string) => any
): WzCanvasProperty | null {
  const seen = new Set<WzProperty>();
  let cur: WzProperty | null = resolveUol(prop);
  for (let i = 0; i < 16; i++) {
    if (!cur || !(cur instanceof WzCanvasProperty)) return null;
    if (seen.has(cur)) return cur;
    seen.add(cur);

    // 1. Check for _inlink (relative to the image root)
    const inlink = (cur.child("_inlink") as any)?.value;
    if (typeof inlink === "string" && inlink.length > 0) {
      let root: WzProperty = cur;
      while (root.parent) root = root.parent;
      const target = root.get(inlink);
      const res = resolveUol(target);
      if (res instanceof WzCanvasProperty) {
        cur = res;
        continue;
      }
    }

    // 2. Check for _outlink (cross-image path: <Category>/<Image>.img/<path>)
    const outlink = (cur.child("_outlink") as any)?.value;
    if (typeof outlink === "string" && outlink.length > 0 && getStoreImage) {
      const parts = outlink.split("/");
      const cat = parts[0];
      const imgIdx = parts.findIndex((p) => p.endsWith(".img"));
      if (imgIdx > 0) {
        const imgName = parts[imgIdx].replace(/\.img$/, "");
        const subPath = parts.slice(imgIdx + 1).join("/");
        const found = getStoreImage(cat, imgName);
        if (found) {
          const root = found.image.parse();
          const target = subPath ? root.get(subPath) : root;
          const res = resolveUol(target);
          if (res instanceof WzCanvasProperty) {
            cur = res;
            continue;
          }
        }
      }
    }

    return cur;
  }
  return cur instanceof WzCanvasProperty ? cur : null;
}

