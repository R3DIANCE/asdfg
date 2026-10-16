// Character composition: assemble a full avatar frame from equip ids.
//
// Follows the MapleStory z-order rules: body draws with its navel at world
// origin; every other part's canvas is placed so its `map/<anchor>` point
// coincides with the same-named anchor already established (head's `neck`
// matching body's `neck`, weapon's `hand` matching the arm's `hand`).
//
// Parts are sorted by the `z` slot they reference, resolved against the
// client's own Base/zmap.img ordering when available.

import { SpriteStore } from "./store.ts";
import { WzCanvasProperty, WzSubProperty, WzUolProperty, WzVectorProperty, resolveUol, resolveCanvas, type WzProperty } from "./properties.ts";
import { FrameBuffer, decodePixels, decompressCanvas, canvasFramePng } from "./canvas.ts";
import { WzImage } from "./wzfile.ts";

/** Character.wz subdirectory for an equip id. */
export function categoryForId(id: number): string {
  const p = Math.floor(id / 10000);
  if (p === 0 || p === 1) return "";                    // Body (00002000) and Head (00012000) at root
  if (p === 2 || p === 5) return "Face";
  if (p === 3 || p === 4 || p === 6) return "Hair";
  if (p === 100) return "Cap";
  if (p >= 101 && p <= 103) return "Accessory";
  if (p === 104) return "Coat";
  if (p === 105) return "Longcoat";
  if (p === 106) return "Pants";
  if (p === 107) return "Shoes";
  if (p === 108) return "Glove";
  if (p === 109) return "Shield";
  if (p === 110) return "Cape";
  if (p >= 111 && p <= 120) return "Accessory";
  if (p >= 121 && p <= 170) return "Weapon";
  return "";
}

/** Anchor priority: first one present on a canvas and established wins. */
const ANCHOR_PRIORITY = ["navel", "neck", "brow", "hand", "handMove", "origin"];

/** Default anchor per category when a canvas declares no map/*. */
const DEFAULT_ANCHOR: Record<string, string> = {
  "": "navel", Face: "brow", Hair: "brow", Cap: "brow", Accessory: "brow",
  Coat: "navel", Longcoat: "navel", Pants: "navel", Shoes: "navel",
  Glove: "hand", Shield: "navel", Cape: "navel", Weapon: "hand",
};

/** Fallback z-order when Base/zmap.img is unavailable (back → front). */
const FALLBACK_ZMAP = [
  "capeBelowBody", "shieldBelowBody", "weaponBelowBody", "body", "gloveOverBody",
  "mailChestBelowPants", "pants", "shoes", "mailChest", "armBelowHead",
  "gloveBelowHead", "weaponOverBody", "shield", "weapon", "arm", "hand", "glove",
  "cape", "head", "face", "ear", "hairShade", "hair", "cap", "capAccessory",
  "weaponOverArm", "weaponOverHand", "weaponOverGlove", "weaponWristOverGlove",
  "capeOverHead", "hairOverHead", "characterEnd",
];

interface Placement {
  id: number;
  category: string;
  canvas: WzCanvasProperty;
  origin: [number, number];
  anchors: Map<string, [number, number]>;
  zSlot: string | null;
  z: number;
  px: number;   // resolved top-left in world space
  py: number;
  pixels: Buffer | null;
}

function vec(p: WzProperty | null): [number, number] | null {
  const r = resolveUol(p);
  if (r instanceof WzVectorProperty) return [r.x, r.y];
  return null;
}

function mapAnchors(c: WzCanvasProperty): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const m = c.child("map");
  if (m instanceof WzSubProperty) {
    for (const ch of m.children()) {
      const v = vec(ch);
      if (v) out.set(ch.name, v);
    }
  }
  return out;
}

/** Collect all renderable canvas layers under an equip frame node (e.g. body + arm, head + ear, mail + mailArm). */
function collectCanvases(node: WzProperty | null, store?: SpriteStore): WzCanvasProperty[] {
  if (!node) return [];
  const r = resolveCanvas(node, store ? (cat, img) => store.image(cat, img) : undefined) ?? resolveUol(node);
  if (!r) return [];
  if (r instanceof WzCanvasProperty && r.hasPixels()) return [r];
  const list: WzCanvasProperty[] = [];
  if (r instanceof WzSubProperty) {
    const hasHumanEar = r.children().some((ch) => ch.name === "humanEar");
    for (const c of r.children()) {
      // Exclude elf ear variations; keep standard humanEar (or ear if no humanEar)
      if (c.name === "lefEar" || c.name === "highlefEar" || c.name === "highLefEar") continue;
      if (hasHumanEar && c.name === "ear") continue;
      const cr = resolveCanvas(c, store ? (cat, img) => store.image(cat, img) : undefined) ?? resolveUol(c);
      if (cr instanceof WzCanvasProperty && cr.hasPixels()) {
        list.push(cr);
      }
    }
    // If empty, try child '0'
    if (!list.length && r.child("0")) {
      return collectCanvases(r.child("0"), store);
    }
  }
  return list;
}

/** z-order index for a slot name, using the client's zmap when loaded. */
function makeZIndex(store: SpriteStore): (slot: string | null) => number {
  const base = store.files("Base")[0];
  let zmap: string[] = FALLBACK_ZMAP;
  if (base) {
    const img = base.root.images.get("zmap.img");
    if (img) {
      try {
        const names = img.parse().children().map((c) => c.name);
        if (names.length) zmap = [...names].reverse();
      } catch { /* keep fallback */ }
    }
  }
  const hairIdx = zmap.indexOf("hair");
  return (slot) => {
    if (!slot) return zmap.length;
    // Front-facing cap layers must draw in front of hair
    if (slot === "capBelowAccessory" || slot === "capAccessoryBelowAccFace" || slot === "cap" || slot === "capAccessory") {
      const idx = zmap.indexOf(slot);
      return idx >= 0 ? Math.max(idx, hairIdx + 2) : (hairIdx >= 0 ? hairIdx + 2 : zmap.length);
    }
    const i = zmap.indexOf(slot);
    return i >= 0 ? i : zmap.length;
  };
}

/**
 * Find a character image by "<subdir>/<8-digit id>" or just the id.
 * Resilient lookup checking subdirectory, root, and other subdirectories.
 */
function findImage(store: SpriteStore, lookup: string): { image: WzImage; file: import("./wzfile.ts").WzFile } | null {
  const slash = lookup.indexOf("/");
  const id = slash >= 0 ? lookup.slice(slash + 1) : lookup;
  const sub = slash >= 0 ? lookup.slice(0, slash) : "";
  const imgName = `${id}.img`;
  for (const f of store.files("Character")) {
    if (sub) {
      const dir = f.root.subdirs.get(sub);
      const hit = dir?.images.get(imgName);
      if (hit) return { image: hit, file: f };
    }
    // Check root directory (e.g. 00002000.img body and 00012000.img head)
    const hitRoot = f.root.images.get(imgName);
    if (hitRoot) return { image: hitRoot, file: f };
    // Check all subdirectories as fallback
    for (const dir of f.root.subdirs.values()) {
      const hitSub = dir.images.get(imgName);
      if (hitSub) return { image: hitSub, file: f };
    }
  }
  return null;
}

/**
 * Compose one animation frame of a character into a 96x96 PNG.
 *
 * `ids` are the raw equip ids (body, head, hair, face, cap, coat, ...).
 * Frame layout: <id>.img/<action>/<frame>/<canvas>.
 * Anchors are resolved in world space relative to the body navel at (0, 0).
 * Placed onto a standard 96x96 canvas with feet anchored at (48, 88).
 */
export function composeCharacter(
  store: SpriteStore,
  ids: number[],
  action: string,
  frame: number,
  flip = false,
  expr = "default",
  ef = 0,
): Buffer | null {
  const zIndex = makeZIndex(store);
  const placements: Placement[] = [];
  const anchors: Map<string, [number, number]> = new Map();
  anchors.set("navel", [0, 0]);

  // Order parts so body is 0, head is 1, and gear is 2.
  // This guarantees navel and neck anchors are published first.
  const ordered = Array.from(new Set(ids)).sort((a, b) => {
    const orderA = a < 10000 ? 0 : a < 20000 ? 1 : 2;
    const orderB = b < 10000 ? 0 : b < 20000 ? 1 : 2;
    return orderA - orderB;
  });

  // Check if an equipped hat fully encloses the head / covers all hair (e.g. Zakum Helmet)
  let hatCoversAllHair = false;
  for (const id of ids) {
    if (categoryForId(id) === "Cap") {
      const sid = String(id).padStart(8, "0");
      const found = findImage(store, `Cap/${sid}`);
      if (found) {
        const vslot = String((found.image.parse().child("info")?.child("vslot") as any)?.value ?? "");
        if (vslot.includes("H1") && vslot.includes("H2") && vslot.includes("H3")) {
          hatCoversAllHair = true;
          break;
        }
      }
    }
  }

  for (const id of ordered) {
    // When climbing rope or ladder, character faces backwards: hide front face
    if ((action === "rope" || action === "ladder") && id >= 20000 && id < 30000) continue;

    const category = categoryForId(id);
    if (hatCoversAllHair && category === "Hair") continue;

    const sid = String(id).padStart(8, "0");
    const lookup = category ? `${category}/${sid}` : sid;
    const found = findImage(store, lookup);
    if (!found) continue;
    const file = found.file;
    const root = found.image.parse();

    // The action node may sit at root, under a numeric weapon-num, or under 'default' (Face)
    let act: WzProperty | null = null;
    const isFace = id >= 20000 && id < 30000;
    if (isFace && expr && expr !== "default") {
      const eAct = root.child(expr);
      if (eAct instanceof WzSubProperty) act = eAct;
    }
    if (!act) {
      act = root.child(action);
      if (!(act instanceof WzSubProperty)) {
        // For cash weapons (0170...) with numeric weapon types (30=sword, 47=claw, 45=bow, etc.)
        const isClaw = category === "Weapon" && (id >= 1470000 && id < 1480000);
        const preferNum = isClaw ? "47" : "30";
        const prefNode = root.child(preferNum);
        if (prefNode instanceof WzSubProperty && prefNode.child(action) instanceof WzSubProperty) {
          act = prefNode.child(action);
        } else {
          for (const c of root.children()) {
            if (!(c instanceof WzSubProperty)) continue;
            const cand = c.get(action);
            if (cand instanceof WzSubProperty) { act = cand; break; }
          }
        }
      }
      // Robust action fallbacks for weapons that don't have certain animations
      if (!(act instanceof WzSubProperty)) {
        if (action === "walk2") act = root.child("walk1") ?? root.get("47/walk1") ?? root.get("30/walk1");
        else if (action === "stand2") act = root.child("stand1") ?? root.get("47/stand1") ?? root.get("30/stand1");
        else if (action.startsWith("shoot")) act = root.child("swingO1") ?? root.child("stabO1") ?? root.get("47/swingO1");
        else if (action.startsWith("swingT") || action.startsWith("swingP")) act = root.child("swingO1") ?? root.child("swingO2") ?? root.get("47/swingO1");
        else if (action.startsWith("stabT")) act = root.child("stabO1") ?? root.child("stabO2") ?? root.get("47/stabO1");
        else if (action === "fly") act = root.child("jump") ?? root.child("stand1");
        else if (action === "rope" || action === "ladder") act = root.child("stand1");
      }
      // Hair/Face keep the frame under `default` for the static pose
      if (!(act instanceof WzSubProperty) && root.child("default")) act = root.child("default") as WzProperty;
      if (!(act instanceof WzSubProperty) && root.child("stand1")) act = root.child("stand1") as WzProperty;
    }
    if (!(act instanceof WzSubProperty)) continue;

    const numericChildren = act.children().filter((c) => /^\d+$/.test(c.name));
    const fr = (isFace && expr && expr !== "default")
      ? (act.child(String(ef)) ?? act.child("0") ?? (act.child("face") ? act : null) ?? act)
      : (act.child(String(frame)) ?? (numericChildren.length ? numericChildren[frame % numericChildren.length] : null) ?? act.child("0") ?? (act.child("face") ? act : null) ?? act);
    const canvases = collectCanvases(fr, store);
    if (!canvases.length) continue;

    for (const canvas of canvases) {
      const origin = vec(canvas.child("origin")) ?? [Math.floor(canvas.width / 2), canvas.height];
      const zSlotRaw = (canvas.child("z") as any)?.value;
      const zSlot = typeof zSlotRaw === "string" ? zSlotRaw : null;
      const cAnchors = mapAnchors(canvas);

      // The main body canvas of id < 10000 is the root reference frame for the character.
      // Every other canvas (bare arm, hands, head, equips) aligns to established anchors.
      let px = 0;
      let py = 0;
      const isRootBody = id < 10000 && (canvas.name === "body" || !anchors.has("navel"));
      if (!isRootBody) {
        let aname = "";
        for (const a of ANCHOR_PRIORITY) {
          if (cAnchors.has(a) && anchors.has(a)) {
            aname = a;
            break;
          }
        }
        if (aname && cAnchors.has(aname) && anchors.has(aname)) {
          const local = cAnchors.get(aname)!;
          const target = anchors.get(aname)!;
          px = target[0] - local[0];
          py = target[1] - local[1];
        }
      }

      // Publish this part's anchors in world space
      for (const [name, [ax, ay]] of cAnchors) {
        if (!anchors.has(name) || name === "hand" || isRootBody) {
          anchors.set(name, [px + ax, py + ay]);
        }
      }

      let pixels: Buffer | null = null;
      try {
        const raw = canvas.pngData();
        const readerKey = canvas.image?.file?.reader?.key ?? file.reader.key;
        pixels = decodePixels(
          decompressCanvas(raw, readerKey),
          canvas.width, canvas.height, canvas.format + canvas.format2,
        );
      } catch { pixels = null; }

      placements.push({
        id, category, canvas, origin, anchors: cAnchors,
        zSlot, z: zIndex(zSlot), px, py, pixels,
      });
    }
  }

  if (!placements.length) return null;

  // Generous standard canvas size (384x384) to fit full weapon reaching, dark auras, and special effects (e.g. Black Sword).
  // Origin is positioned at (192, 256), anchoring character feet solidly at y = 256 with horizontal center at 192.
  // Dynamic expansion guarantees that even mega-attacks or screen-wide effects are never clipped.
  const baseW = 384, baseH = 384;
  const baseOx = 192, baseOy = 256;

  let minX = 0, maxX = baseW, minY = 0, maxY = baseH;
  for (const p of placements) {
    const x0 = Math.round(p.px - p.origin[0] + baseOx);
    const x1 = x0 + p.canvas.width;
    const y0 = Math.round(p.py - p.origin[1] + baseOy);
    const y1 = y0 + p.canvas.height;
    if (x0 < minX) minX = x0;
    if (x1 > maxX) maxX = x1;
    if (y0 < minY) minY = y0;
    if (y1 > maxY) maxY = y1;
  }

  const padX = Math.max(0 - minX, maxX - baseW, 0);
  const padTop = Math.max(0 - minY, 0);
  const padBot = Math.max(maxY - baseH, 0);

  const w = baseW + padX * 2;
  const ox = baseOx + padX;
  const h = baseH + padTop + padBot;
  const oy = baseOy + padTop;

  placements.sort((a, b) => a.z - b.z);
  return canvasFramePng(w, h, (fb) => {
    for (const p of placements) {
      if (!p.pixels) continue;
      fb.blend(
        p.pixels, p.canvas.width, p.canvas.height,
        Math.round(p.px - p.origin[0] + ox),
        Math.round(p.py - p.origin[1] + oy),
        flip,
      );
    }
  });
}
