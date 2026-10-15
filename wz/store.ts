// Live sprite streaming from a local MapleStory GMS client's WZ archives.
//
// Reads Data/*.wz straight off disk and serves decoded PNGs + animation
// manifests, straight from the installed client.
//
// Routes:
//   GET /wz/status                        — what's loaded
//   GET /wz/sprite/<category>/<id>/<path> — one canvas as PNG
//   GET /wz/anim/<category>/<id>/<action> — frame list + origins + delays
//   GET /wz/char?eq=...&action=...        — composited character frames
//   GET /wz/list/<category>               — available ids
//   GET /wz/search?q=...                  — find images by name

import { WzClient, WzFile, WzImage, WzDirectory, VERSION_HASH_GMS_232 } from "./wzfile.ts";
import { canvasToPng } from "./canvas.ts";
import { WzCanvasProperty, WzSubProperty, WzStringProperty, WzUolProperty, resolveUol, resolveCanvas, type WzProperty } from "./properties.ts";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** Categories in a 64-bit client's Data/ tree, mapped to their dir name. */
export const CATEGORY_DIRS: Record<string, string> = {
  Character: "Character",
  Item: "Item",
  Map: "Map",
  Mob: "Mob",
  Npc: "Npc",
  Skill: "Skill",
  Sound: "Sound",
  String: "String",
  UI: "UI",
  Effect: "Effect",
  Etc: "Etc",
  Quest: "Quest",
  Reactor: "Reactor",
  Morph: "Morph",
  Base: "Base",
  TamingMob: "TamingMob",
};

export interface AnimFrame {
  frame: number;
  /** Path to pass to spritePng(), relative to the image root. */
  path: string;
  url: string;
  w: number;
  h: number;
  ox: number;
  oy: number;
  delay: number;
}

export interface SpriteStoreOptions {
  /** Client root containing MapleStory.exe + Data/ (or the .wz files directly). */
  clientDir: string;
  /** Prefer <clientDir>/Data when it exists; otherwise read <clientDir>/*.wz. */
  region?: string;
  versionHash?: number;
}

/**
 * Lazily-opened sprite source over one or more WZ containers.
 *
 * Containers are opened on first use and cached, so startup stays instant
 * and a category the game never touches costs nothing.
 */
export class SpriteStore {
  clientDir: string;
  region: string;
  versionHash: number;
  dataDir: string;
  /** category -> opened containers, in load order. */
  open = new Map<string, WzFile[]>();
  private manifest = new Map<string, string[]>(); // category -> file names
  stats = { sprites: 0, anims: 0, errors: 0 };

  constructor(opts: SpriteStoreOptions) {
    this.clientDir = opts.clientDir;
    this.region = opts.region ?? "BMS";
    this.versionHash = opts.versionHash ?? VERSION_HASH_GMS_232;
    const d = join(this.clientDir, "Data");
    this.dataDir = existsSync(d) && statSync(d).isDirectory() ? d : this.clientDir;
    this.discover();
  }

  /** Find each category's structure file + numbered siblings. */
  private discover(): void {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    let entries: string[] = [];
    try {
      entries = readdirSync(this.dataDir);
    } catch {
      return;
    }
    // Flat layout: Mob.wz, Mob001.wz, ... at the root.
    for (const cat of Object.keys(CATEGORY_DIRS)) {
      const files = entries
        .filter((e) => e.endsWith(".wz") && new RegExp(`^${cat}\\d*\\.wz$`, "i").test(e))
        .sort((a, b) => {
          const na = Number(/(\d+)/.exec(a)?.[1] ?? -1);
          const nb = Number(/(\d+)/.exec(b)?.[1] ?? -1);
          return na - nb;
        });
      if (files.length) this.manifest.set(cat, files);
    }
    // Nested layout: Data/<Cat>/<Cat>.wz (+ siblings).
    for (const cat of Object.keys(CATEGORY_DIRS)) {
      if (this.manifest.has(cat)) continue;
      const dir = join(this.dataDir, cat);
      if (!existsSync(dir)) continue;
      let sub: string[] = [];
      try {
        sub = readdirSync(dir).filter((e) => e.endsWith(".wz"));
      } catch {
        continue;
      }
      if (sub.length) this.manifest.set(cat, sub.map((e) => join(cat, e)));
    }
  }

  get categories(): string[] {
    return [...this.manifest.keys()];
  }

  /** Opened containers for a category, loading on first access. */
  files(category: string): WzFile[] {
    const hit = this.open.get(category);
    if (hit) return hit;
    const names = this.manifest.get(category);
    if (!names) return [];
    const out: WzFile[] = [];
    for (const n of names) {
      try {
        out.push(WzFile.open(join(this.dataDir, n), this.region, this.versionHash));
      } catch (e) {
        this.stats.errors++;
        console.error(`[wz] failed to open ${n}: ${(e as Error).message}`);
      }
    }
    this.open.set(category, out);
    return out;
  }

  /** Locate an image by category + id across that category's containers. */
  image(category: string, id: string): { image: WzImage; file: WzFile } | null {
    const name = id.endsWith(".img") ? id : `${id}.img`;
    for (const f of this.files(category)) {
      const img = f.root.images.get(name);
      if (img) return { image: img, file: f };
      // Nested categories: Character/Cap/01000000.img
      for (const sub of f.root.subdirs.values()) {
        const nested = sub.images.get(name);
        if (nested) return { image: nested, file: f };
      }
    }
    return null;
  }

  /** Resolve a slash path inside a category's tree. */
  resolve(category: string, path: string): { node: WzDirectory | WzImage | WzProperty; file: WzFile } | null {
    for (const f of this.files(category)) {
      const node = f.root.get(path);
      if (node) return { node, file: f };
    }
    return null;
  }

  /** All canvas nodes under a property, in tree order. */
  static canvases(node: WzProperty | WzImage | WzDirectory | null): WzCanvasProperty[] {
    if (!node) return [];
    const out: WzCanvasProperty[] = [];
    const visit = (p: WzProperty | null) => {
      if (!p) return;
      if (p instanceof WzCanvasProperty) out.push(p);
      for (const c of p.children()) visit(c);
    };
    if (node instanceof WzImage) visit(node.parse());
    else if (node instanceof WzDirectory) {
      for (const { image } of node.walkImages()) visit(image.parse());
    } else visit(node as WzProperty);
    return out;
  }

  /** PNG for one canvas at a path like "stand/0/0". */
  spritePng(category: string, id: string, path: string): Buffer | null {
    const found = this.image(category, id);
    if (!found) return null;
    let node: WzProperty | null = found.image.parse();
    for (const part of path.split("/").filter(Boolean)) {
      if (!node) return null;
      node = node.get(part);
    }
    const canvas = resolveCanvas(node, (cat, img) => this.image(cat, img));
    if (!canvas) return null;
    this.stats.sprites++;
    const key = canvas.image?.file?.reader?.key ?? found.file.reader.key;
    return canvasToPng(canvas, key);
  }

  /**
   * Frame list for an animation: walks <id>.img/<action>/<n>/<canvas>
   * collecting origin + delay so the client can play it.
   */
  animManifest(category: string, id: string, action: string, baseUrl: string): AnimFrame[] {
    const found = this.image(category, id);
    if (!found) return [];
    const root = found.image.parse();
    let act = root.get(action);
    // Weapons/items nest actions under a numeric weapon-num subtree.
    if (!(act instanceof WzSubProperty)) {
      for (const c of root.children()) {
        if (!(c instanceof WzSubProperty)) continue;
        const cand = c.get(action);
        if (cand instanceof WzSubProperty) {
          act = cand;
          break;
        }
      }
    }
    if (!(act instanceof WzSubProperty)) return [];
    const frames: AnimFrame[] = [];
    const nums = act
      .children()
      .filter((c) => /^\d+$/.test(c.name))
      .sort((a, b) => Number(a.name) - Number(b.name));
    for (const fr of nums) {
      // Two shapes exist in real data:
      //   Mob/Item:  <action>/<n> IS the canvas (origin/delay are its children)
      //   Character: <action>/<n> is a SubProperty whose child ("0"/"body"/...)
      //              is the canvas
      let canvas: WzCanvasProperty | null = null;
      let canvasName = "0";
      let meta: WzProperty = fr;
      // Resolve a frame's node to the canvas that owns pixels. Handles:
      //   - the node itself is a canvas (Mob/Item layout)
      //   - the node is a SubProperty whose child is a canvas (Character)
      //   - the node is a UOL pointing at another frame's SubProperty
      //     (Hair/Face: stand1/0 is all-UOLs into ../../default)
      const findCanvas = (node: WzProperty | null, depth = 0): WzCanvasProperty | null => {
        if (!node || depth > 8) return null;
        const r = resolveUol(node);
        if (!r) return null;
        if (r instanceof WzCanvasProperty && r.hasPixels()) return r;
        if (r instanceof WzSubProperty) {
          // Prefer an explicit "0"/"body" child, then any pixel canvas.
          for (const pref of ["0", "body", "hair", "hairOverHead", "face"]) {
            const c = r.child(pref);
            if (!c) continue;
            const rr = resolveUol(c);
            if (rr instanceof WzCanvasProperty && rr.hasPixels()) return rr;
          }
          for (const c of r.children()) {
            const rr = resolveUol(c);
            if (rr instanceof WzCanvasProperty && rr.hasPixels()) return rr;
          }
        }
        return null;
      };
      const direct = resolveUol(fr);
      canvas = findCanvas(fr);
      if (!canvas) continue;
      // Name the canvas so the client can re-request the same pixels.
      if (direct instanceof WzCanvasProperty) {
        canvasName = fr.name;
      } else if (direct instanceof WzSubProperty) {
        for (const c of direct.children()) {
          if (resolveUol(c) === canvas) { canvasName = c.name; break; }
        }
      } else {
        canvasName = "";
      }
      const origin = meta.child("origin") as any;
      const delay = meta.child("delay") as any;
      // For a frame that is itself a canvas the path is <action>/<n>;
      // otherwise <action>/<n>/<child>. UOL-only frames resolve to a
      // sibling frame, so point the client at that frame's canvas.
      let rel = canvasName ? `${action}/${fr.name}/${canvasName}` : `${action}/${fr.name}`;
      if (direct instanceof WzUolProperty) rel = canvasName || `${action}/${fr.name}`;
      frames.push({
        frame: Number(fr.name),
        path: rel,
        url: `${baseUrl}/${category}/${id}/${rel}`,
        w: canvas.width,
        h: canvas.height,
        ox: origin?.x ?? Math.floor(canvas.width / 2),
        oy: origin?.y ?? canvas.height,
        delay: delay?.value ?? 100,
      });
    }
    if (frames.length) this.stats.anims++;
    return frames;
  }

  /** Image ids available in a category. */
  list(category: string): string[] {
    const out = new Set<string>();
    for (const f of this.files(category)) {
      for (const n of f.root.images.keys()) out.add(n.replace(/\.img$/, ""));
      for (const sub of f.root.subdirs.values()) {
        for (const n of sub.images.keys()) out.add(n.replace(/\.img$/, ""));
      }
    }
    return [...out].sort();
  }

  /** Subdirectories of a category (e.g. Character's Cap, Coat, Weapon). */
  subdirs(category: string): string[] {
    const out = new Set<string>();
    for (const f of this.files(category)) {
      for (const n of f.root.subdirs.keys()) out.add(n);
    }
    return [...out].sort();
  }

  /** Search image names across loaded categories. */
  search(q: string, limit = 50): Array<{ category: string; id: string; path: string }> {
    const needle = q.toLowerCase();
    const hits: Array<{ category: string; id: string; path: string }> = [];
    for (const cat of this.categories) {
      for (const f of this.files(cat)) {
        for (const { path } of f.root.walkImages()) {
          if (path.toLowerCase().includes(needle)) {
            hits.push({ category: cat, id: path.replace(/\.img$/, ""), path });
            if (hits.length >= limit) return hits;
          }
        }
      }
    }
    return hits;
  }
}
