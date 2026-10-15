// Map data from the local client's Map.wz.
//
// Provides the pieces the game needs to draw a map without any remote API:
//   - background layers (backs) with their scroll/type parameters
//   - foothold + ladder vectors (physics)
//   - portal positions
//   - the map's own object/tile canvases
//   - a stitched PNG preview

import { WzImage, WzDirectory, WzFile } from "./wzfile.ts";
import { WzCanvasProperty, WzSubProperty, WzStringProperty, WzVectorProperty, resolveUol, resolveCanvas, type WzProperty } from "./properties.ts";
import { canvasToPng } from "./canvas.ts";

export interface MapFoothold {
  id: number; x1: number; y1: number; x2: number; y2: number;
  prev: number; next: number; layer: number; group: number;
}
export interface MapLadder { x: number; y1: number; y2: number; isLadder: boolean }
export interface MapSpawn { id: number; x: number; y: number; fh: number; rx0: number; rx1: number }
export interface MapPortal { x: number; y: number; to: number; side: "left" | "right"; pn: string; tn: string; pt: number }
export interface MapBack {
  sprite: { url: string; w: number; h: number; ox: number; oy: number };
  x: number; y: number; rx: number; ry: number; cx: number; cy: number;
  type: number; a: number; flip: boolean; front: boolean;
}

/** Convert a 4-digit hex id to its padded decimal string (Map.wz naming). */
export function mapImageId(mapId: number): string {
  const s = String(mapId).padStart(9, "0");
  // Map.wz/<area>/<area><sub>.img  e.g. 100010000 -> 100/100010000.img
  return s;
}

/** Map ids whose image lives in Map.wz vs Map001/Map002/Map2. */
export function mapArea(mapId: number): string {
  const s = String(mapId).padStart(9, "0");
  return s.slice(0, 3);
}

/** Depth-first search for an .img anywhere under a directory. */
function findImageDeep(dir: WzDirectory, name: string, depth = 0): WzImage | null {
  if (depth > 6) return null;
  const hit = dir.images.get(name);
  if (hit) return hit;
  for (const sub of dir.subdirs.values()) {
    const r = findImageDeep(sub, name, depth + 1);
    if (r) return r;
  }
  return null;
}

export class MapStore {
  /** container files for the Map category, in load order. */
  constructor(private files: WzFile[]) {}

  /** Find a map's .img across the Map containers. */
  image(mapId: number): WzImage | null {
    const name = `${mapImageId(mapId)}.img`;
    // Real layout: Map.wz root has Obj/Tile/WorldMap; the map .img files sit
    // under Map/Map1..MapN inside Map002/Map2. Search every level rather than
    // assuming an <area>/<id>.img path.
    for (const f of this.files) {
      const direct = f.root.images.get(name);
      if (direct) return direct;
      const found = findImageDeep(f.root, name);
      if (found) return found;
    }
    return null;
  }

  /** Foothold vectors for a map. */
  footholds(mapId: number): MapFoothold[] {
    const img = this.image(mapId);
    if (!img) return [];
    const fh = img.parse().get("foothold");
    if (!(fh instanceof WzSubProperty)) return [];
    const out: MapFoothold[] = [];
    for (const layer of fh.children()) {
      if (!(layer instanceof WzSubProperty)) continue;
      for (const group of layer.children()) {
        if (!(group instanceof WzSubProperty)) continue;
        for (const seg of group.children()) {
          const g = seg as WzSubProperty;
          const n = (k: string) => Number((g.child(k) as any)?.value ?? 0);
          out.push({
            id: Number(seg.name),
            x1: n("x1"), y1: n("y1"), x2: n("x2"), y2: n("y2"),
            prev: n("prev"), next: n("next"),
            layer: Number(layer.name), group: Number(group.name),
          });
        }
      }
    }
    return out;
  }

  /** Ladders and ropes. */
  ladders(mapId: number): MapLadder[] {
    const img = this.image(mapId);
    if (!img) return [];
    const node = img.parse().get("ladderRope");
    if (!(node instanceof WzSubProperty)) return [];
    const out: MapLadder[] = [];
    for (const lr of node.children()) {
      const g = lr as WzSubProperty;
      const n = (k: string) => Number((g.child(k) as any)?.value ?? 0);
      const isLadder = Boolean((g.child("l") as any)?.value);
      out.push({ x: n("x"), y1: n("y1"), y2: n("y2"), isLadder });
    }
    return out;
  }

  /** Monster spawns. */
  spawns(mapId: number): MapSpawn[] {
    const img = this.image(mapId);
    if (!img) return [];
    const life = img.parse().get("life");
    if (!(life instanceof WzSubProperty)) return [];
    const out: MapSpawn[] = [];
    for (const l of life.children()) {
      const g = l as WzSubProperty;
      const type = (g.child("type") as any)?.value;
      if (type !== "m") continue;
      const n = (k: string) => Number((g.child(k) as any)?.value ?? 0);
      out.push({ id: n("id"), x: n("x"), y: n("y"), fh: n("fh"), rx0: n("rx0"), rx1: n("rx1") });
    }
    return out;
  }

  /** Portals. */
  portals(mapId: number): MapPortal[] {
    const img = this.image(mapId);
    if (!img) return [];
    const node = img.parse().get("portal");
    if (!(node instanceof WzSubProperty)) return [];
    const out: MapPortal[] = [];
    for (const p of node.children()) {
      const g = p as WzSubProperty;
      const pt = Number((g.child("pt") as any)?.value ?? 0);
      out.push({
        x: Number((g.child("x") as any)?.value ?? 0),
        y: Number((g.child("y") as any)?.value ?? 0),
        to: Number((g.child("tm") as any)?.value ?? 0),
        side: Number((g.child("x") as any)?.value ?? 0) < 0 ? "left" : "left",
        pn: String((g.child("pn") as any)?.value ?? ""),
        tn: String((g.child("tn") as any)?.value ?? ""),
        pt,
      });
    }
    return out;
  }

  /** Background layer descriptors, resolved to sprite URLs + origins. */
  backs(mapId: number): MapBack[] {
    const img = this.image(mapId);
    if (!img) return [];
    const node = img.parse().get("back");
    if (!(node instanceof WzSubProperty)) return [];
    const out: MapBack[] = [];
    for (const b of node.children()) {
      const g = b as WzSubProperty;
      const n = (k: string, d = 0) => Number((g.child(k) as any)?.value ?? d);
      const bs = String((g.child("bS") as any)?.value ?? "");
      const no = Number((g.child("no") as any)?.value ?? 0);
      const front = Boolean((g.child("front") as any)?.value);
      const [file] = bs.split("/");
      if (!file) continue;
      let bimg: WzImage | null = null;
      const imgName = file.endsWith(".img") ? file : `${file}.img`;
      for (const mf of this.files) {
        const candidate = mf.root.get(`Back/${imgName}`);
        if (candidate instanceof WzImage) { bimg = candidate; break; }
      }
      if (!bimg) continue;
      const broot = bimg.parse();
      const node = broot.get("back")?.get(String(no)) ?? broot.get("ani")?.get(String(no)) ?? broot.get(String(no));
      const r = resolveCanvas(node);
      if (!(r instanceof WzCanvasProperty)) continue;
      const ox = (r.child("origin") as any)?.x ?? 0;
      const oy = (r.child("origin") as any)?.y ?? 0;
      out.push({
        sprite: { url: `/wz/map/${mapId}/back/${file}/${no}`, w: r.width, h: r.height, ox, oy },
        x: n("x"), y: n("y"), rx: n("rx"), ry: n("ry"),
        cx: n("cx", r.width), cy: n("cy", r.height),
        type: n("type"), a: n("a", 255), flip: Boolean((g.child("f") as any)?.value), front,
      });
    }
    return out;
  }

  /** Map name from String.wz/Map.img. */
  name(mapId: number, strings: WzFile | null): { name: string; street: string } {
    if (!strings) return { name: "", street: "" };
    const s = String(mapId).padStart(9, "0");
    const mapImg = strings.root.images.get("Map.img");
    if (!mapImg) return { name: "", street: "" };
    const root = mapImg.parse();
    for (const region of root.children()) {
      if (!(region instanceof WzSubProperty)) continue;
      const entry = region.child(s);
      if (entry instanceof WzSubProperty) {
        return {
          name: String((entry.child("mapName") as any)?.value ?? ""),
          street: String((entry.child("streetName") as any)?.value ?? ""),
        };
      }
    }
    return { name: "", street: "" };
  }
}
