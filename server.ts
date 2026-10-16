// Maple Wayfarer server — Bun.serve only. No Express, no Vite middleware.
//
// Everything is served by Bun itself:
//   - `import index from "./index.html"` runs Bun's bundler + transpiler and
//     gives HMR in development, so TS/CSS compile on demand with no separate
//     dev server and no hand-rolled Bun.Transpiler plumbing.
//   - `routes` handles the WZ sprite/data API with typed params.
//   - `Bun.file()` streams static assets; WZ bytes are read straight from the
//     installed client's .wz archives.
//
// Run:  bun run dev --port 6969     (or `bun server.ts`)
import index from "./index.html";
import { SpriteStore } from "./wz/store.ts";
import { MapStore } from "./wz/map.ts";
import { canvasToPng, canvasFramePng, decompressCanvas, decodePixels, FrameBuffer } from "./wz/canvas.ts";
import { encodePng } from "./wz/reader.ts";
import { composeCharacter } from "./wz/compose.ts";
import {
  WzCanvasProperty,
  WzSubProperty,
  WzStringProperty,
  WzUolProperty,
  WzVectorProperty,
  resolveUol,
  resolveCanvas,
  type WzProperty,
} from "./wz/properties.ts";
import { WzImage } from "./wz/wzfile.ts";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve as pathResolve } from "node:path";
const ROOT = import.meta.dir;
function readPort(): number {
  const argv = process.argv.slice(2);
  const i = argv.findIndex((a) => a === "--port" || a === "-p");
  const fromArg =
    i >= 0
      ? argv[i + 1]
      : argv.find((a) => a.startsWith("--port="))?.split("=")[1];
  const raw = fromArg ?? process.env.PORT ?? process.env.BUN_PORT ?? "3000";
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 3000;
}
const port = readPort();
/** Find the client dir: env override, then the usual local install spots. */ export function findClientDir():
  | string
  | null {
  const candidates = [
    process.env.MAPLE_CLIENT_DIR,
    "C:/Users/r3dia/Games/MapleStory-GMS-232.2",
    "C:/Nexon/MapleStory",
    "C:/Program Files (x86)/Nexon/MapleStory",
    "C:/Program Files/Nexon/MapleStory",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(join(c, "MapleStory.exe"))) return c;
    if (existsSync(join(c, "Mob.wz"))) return c;
    if (existsSync(join(c, "Data", "Mob"))) return c;
  }
  return null;
}
let store: SpriteStore | null = null;
let maps: MapStore | null = null;
function getStore(): SpriteStore | null {
  if (store) return store;
  const dir = findClientDir();
  if (!dir) return null;
  store = new SpriteStore({ clientDir: dir });
  return store;
}
function getMaps(s: SpriteStore): MapStore {
  if (!maps) maps = new MapStore(s.files("Map"));
  return maps;
}
// ── response helpers ──────────────────────────────────────────────────
const noClient = () =>
  Response.json(
    {
      error:
        "No MapleStory client found. Set MAPLE_CLIENT_DIR to the folder holding Data/ or *.wz.",
    },
    { status: 503 },
  );
const jsonNoStore = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { "cache-control": "no-store" } });
function pngResponse(png: Buffer | null, what: string): Response {
  if (!png)
    return Response.json({ error: `no canvas at ${what}` }, { status: 404 });
  // Wrap in a Uint8Array view: Bun's Response accepts it as BodyInit, and the
  // Buffer may be a view into a larger allocation.
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}
/** Wrap a handler so a thrown WZ error becomes a 500 JSON body. */ function guard<
  T extends (...a: any[]) => Response | Promise<Response>,
>(fn: T) {
  return async (...args: Parameters<T>): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  };
}
/** * The tail matched by a `*` route. Bun matches the wildcard but does not * expose it as a param (verified: `/a/:x/*` yields only `{x}`), so slice it * off the pathname after the known fixed segments. */ function tail(
  req: Request,
  fixedSegments: number,
): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts.slice(fixedSegments).join("/");
}
// ── property → JSON ───────────────────────────────────────────────────
function toJson(p: any, depth = 0): any {
  if (depth > 12 || !p) return null;
  if (p instanceof WzVectorProperty) return { x: p.x, y: p.y };
  if (p instanceof WzCanvasProperty) {
    return {
      __canvas: true,
      w: p.width,
      h: p.height,
      format: p.format,
      bytes: p.pngLength,
    };
  }
  if (p instanceof WzUolProperty) return { __uol: p.link };
  const kids = p.children ? p.children() : [];
  if (kids.length) {
    const out: Record<string, any> = {};
    for (const c of kids) out[c.name] = toJson(c, depth + 1);
    return out;
  }
  return p.value ?? null;
}
/** Sprite descriptor: {url, w, h, ox, oy, delay?}. Resolves _inlink and _outlink transparently. */
function spriteOf(
  url: string,
  c: WzCanvasProperty,
  s?: SpriteStore,
) {
  const real = resolveCanvas(c, s ? (cat, img) => s.image(cat, img) : undefined) ?? c;
  const ox = (c.child("origin") as any)?.x ?? (real.child("origin") as any)?.x ?? Math.floor(real.width / 2);
  const oy = (c.child("origin") as any)?.y ?? (real.child("origin") as any)?.y ?? real.height;
  const d = (c.child("delay") as any)?.value ?? (real.child("delay") as any)?.value;
  return { url, w: real.width, h: real.height, ox, oy, ...(d ? { delay: d } : {}) };
}
// ── data documents ────────────────────────────────────────────────────
function mobData(s: SpriteStore, id: number) {
  const sid = String(id).padStart(7, "0");
  for (const f of s.files("Mob")) {
    const img = f.root.images.get(`${sid}.img`);
    if (!img) continue;
    const root = img.parse();
    const books: Record<string, any[]> = {};
    for (const book of [
      "stand",
      "move",
      "jump",
      "hit1",
      "die1",
      "attack1",
      "skill1",
      "fly",
      "die2",
      "hit2",
    ]) {
      const node = root.child(book);
      if (!(node instanceof WzSubProperty)) continue;
      const frames: any[] = [];
      const sorted = node.children()
        .filter((fr) => /^\d+$/.test(fr.name))
        .sort((a, b) => Number(a.name) - Number(b.name));
      for (const fr of sorted) {
        const c = resolveCanvas(fr, (cat, img) => s.image(cat, img));
        if (c instanceof WzCanvasProperty)
          frames.push(spriteOf(`/wz/sprite/Mob/${sid}/${book}/${fr.name}`, fr as any, s));
      }
      if (frames.length) books[book] = frames;
    }
    const info = root.child("info");
    const meta: Record<string, any> = {};
    if (info instanceof WzSubProperty)
      for (const c of info.children()) meta[c.name] = (c as any).value ?? null;
    const strings = s.files("String")[0];
    let name = sid;
    if (strings) {
      const mi = strings.root.images.get("Mob.img");
      if (mi) {
        const e = mi.parse().child(sid);
        if (e instanceof WzSubProperty)
          name = String((e.child("name") as any)?.value ?? sid);
      }
    }
    return { id, name, meta, books };
  }
  return null;
}
function mapBounds(m: MapStore, id: number): {
  w: number;
  h: number;
  ox: number;
  oy: number;
} {
  const img = m.image(id);
  if (img) {
    const root = img.parse();
    const mini = root.child("miniMap");
    if (mini instanceof WzSubProperty) {
      const mw = Number((mini.child("width") as any)?.value ?? 0);
      const mh = Number((mini.child("height") as any)?.value ?? 0);
      const mcx = Number((mini.child("centerX") as any)?.value ?? 0);
      const mcy = Number((mini.child("centerY") as any)?.value ?? 0);
      if (mw > 0 && mh > 0) {
        return { w: mw, h: mh, ox: mcx, oy: mcy };
      }
    }
    const info = root.child("info");
    if (info instanceof WzSubProperty) {
      const vrL = Number((info.child("VRLeft") as any)?.value);
      const vrR = Number((info.child("VRRight") as any)?.value);
      const vrT = Number((info.child("VRTop") as any)?.value);
      const vrB = Number((info.child("VRBottom") as any)?.value);
      if (!isNaN(vrL) && !isNaN(vrR) && !isNaN(vrT) && !isNaN(vrB) && vrR > vrL && vrB > vrT) {
        return { w: vrR - vrL, h: vrB - vrT, ox: -vrL, oy: -vrT };
      }
    }
  }

  const fhs = m.footholds(id);
  const xs: number[] = fhs.flatMap((f) => [f.x1, f.x2]);
  const ys: number[] = fhs.flatMap((f) => [f.y1, f.y2]);
  const minX = xs.length ? Math.min(...xs) : -500;
  const maxX = xs.length ? Math.max(...xs) : 500;
  const minY = ys.length ? Math.min(...ys) : -500;
  const maxY = ys.length ? Math.max(...ys) : 500;
  const pad = 200;
  const w = Math.min(8192, Math.max(64, Math.ceil(maxX - minX) + pad * 2));
  const h = Math.min(8192, Math.max(64, Math.ceil(maxY - minY) + pad * 2));
  const ox = -minX + pad;
  const oy = -minY + pad;
  return { w, h, ox, oy };
}
function mapData(s: SpriteStore, id: number) {
  const m = getMaps(s);
  const img = m.image(id);
  if (!img) return null;
  const strings = s.files("String")[0] ?? null;
  const { name, street } = m.name(id, strings);
  const mapName = name || (id === 910000000 ? "Free Market Entrance" : id === 100010000 ? "The Hill North of Henesys" : id === 100020000 ? "Spore Hill" : id === 101010000 ? "Shining Forest Path" : id === 100000000 ? "Henesys" : `Area ${id}`);
  const streetName = street || (id === 910000000 ? "Hidden Street" : "Victoria Island");
  const root = img.parse();
  const backs: any[] = [];
  const backNode = root.child("back");
  if (backNode instanceof WzSubProperty) {
    for (const b of backNode.children()) {
      const g = b as WzSubProperty;
      const n = (k: string, d = 0) => Number((g.child(k) as any)?.value ?? d);
      const bs = String((g.child("bS") as any)?.value ?? "");
      const no = n("no");
      const [file] = bs.split("/");
      if (!file) continue;
      // Back sprites live in <Map>/Back/<file>. They may be in a different Map
      // container than the map image, so search every Map file for Back/<file>.
      let bimg: WzImage | null = null;
      const imgName = file.endsWith(".img") ? file : `${file}.img`;
      for (const mf of s.files("Map")) {
        const candidate = mf.root.get(`Back/${imgName}`);
        if (candidate instanceof WzImage) {
          bimg = candidate;
          break;
        }
      }
      if (!bimg) continue;
      const broot = bimg.parse();
      const node = broot.get("ani")?.get(String(no)) ?? broot.get("back")?.get(String(no)) ?? broot.get(String(no));
      if (!node) continue;

      let frames: any[] = [];
      if (node instanceof WzSubProperty && !(node instanceof WzCanvasProperty)) {
        const frameKeys = node.children().filter((fr) => /^\d+$/.test(fr.name)).sort((a, b) => Number(a.name) - Number(b.name));
        if (frameKeys.length > 1) {
          const isAni = Boolean(broot.get("ani")?.get(String(no)));
          for (const fr of frameKeys) {
            const fc = resolveCanvas(fr, (cat, img) => s.image(cat, img));
            if (fc instanceof WzCanvasProperty) {
              frames.push(spriteOf(`/wz/sprite/Map/${file}/${isAni ? "ani" : "back"}/${no}/${fr.name}`, fc, s));
            }
          }
        }
      }

      const targetNode = node instanceof WzSubProperty && !(node instanceof WzCanvasProperty) ? (node.get("0") ?? node) : node;
      const c = resolveCanvas(targetNode ?? null, (cat, img) => s.image(cat, img));
      if (!(c instanceof WzCanvasProperty)) continue;
      backs.push({
        sprite: spriteOf(`/wz/map/${id}/back/${file}/${no}`, c, s),
        frames: frames.length > 1 ? frames : undefined,
        x: n("x"),
        y: n("y"),
        rx: n("rx"),
        ry: n("ry"),
        cx: n("cx"),
        cy: n("cy"),
        type: n("type"),
        a: n("a", 255),
        flip: Boolean((g.child("f") as any)?.value),
        front: Boolean((g.child("front") as any)?.value),
      });
    }
  }

  // Extract animated map objects (e.g. Free Market animated portal doors, waterfalls, fountains, flowing water)
  const aniObjs: any[] = [];
  const objImages = new Map<string, WzSubProperty | null>();
  const getObjImg = (oS: string) => {
    if (objImages.has(oS)) return objImages.get(oS)!;
    for (const mf of s.files("Map")) {
      const od = mf.root.subdirs.get("Obj");
      if (od?.images.has(`${oS}.img`)) {
        const parsed = od.images.get(`${oS}.img`)!.parse();
        objImages.set(oS, parsed);
        return parsed;
      }
    }
    objImages.set(oS, null);
    return null;
  };

  for (let l = 0; l <= 7; l++) {
    const layer = root.get(String(l));
    if (!layer) continue;
    const obj = layer.get("obj");
    if (obj instanceof WzSubProperty) {
      for (const oc of obj.children()) {
        const g = oc as WzSubProperty;
        const oS = String((g.child("oS") as any)?.value ?? "");
        const l0 = String((g.child("l0") as any)?.value ?? "");
        const l1 = String((g.child("l1") as any)?.value ?? "");
        const l2 = String((g.child("l2") as any)?.value ?? "");
        const x = Number((g.child("x") as any)?.value ?? 0);
        const y = Number((g.child("y") as any)?.value ?? 0);
        const z = Number((g.child("z") as any)?.value ?? 0);
        const f = Boolean((g.child("f") as any)?.value);
        const oroot = getObjImg(oS);
        if (!oroot) continue;
        const target = oroot.get(l0)?.get(l1)?.get(l2);
        if (target instanceof WzSubProperty && !(target instanceof WzCanvasProperty)) {
          const numChildren = target.children()
            .filter((c) => /^\d+$/.test(c.name))
            .sort((a, b) => Number(a.name) - Number(b.name));
          if (numChildren.length > 1) {
            const frames: any[] = [];
            for (const fc of numChildren) {
              const c = resolveCanvas(fc, (cat, img) => s.image(cat, img));
              if (c instanceof WzCanvasProperty) {
                frames.push(spriteOf(`/wz/sprite/Map/${oS}/${l0}/${l1}/${l2}/${fc.name}`, c, s));
              }
            }
            if (frames.length > 1) {
              aniObjs.push({
                x,
                y,
                z,
                layer: l,
                f,
                frames,
              });
            }
          }
        }
      }
    }
  }
  aniObjs.sort((a, b) => (a.layer === b.layer ? a.z - b.z : a.layer - b.layer));
  const bounds = mapBounds(m, id);
  const renderOrigin = { x: bounds.ox, y: bounds.oy };
  const mini = root.child("miniMap") as WzSubProperty | null;
  const mn = (k: string, d = 0) => Number((mini?.child(k) as any)?.value ?? d);
  return {
    id,
    name: mapName,
    street: streetName,
    bgm: "",
    bgmUrl: "",
    mark: `/wz/map/${id}/mark`,
    render: `/wz/map/${id}/render`,
    renderOrigin,
    miniMap: {
      url: `/wz/map/${id}/minimap`,
      centerX: mn("centerX"),
      centerY: mn("centerY"),
      width: mn("width"),
      height: mn("height"),
      mag: mn("mag", 1),
    },
    footholds: m.footholds(id),
    ladders: m.ladders(id),
    spawns: m.spawns(id),
    portals: m
      .portals(id)
      .map((p) => ({ x: p.x, y: p.y, to: p.to, side: p.side, pn: p.pn, tn: p.tn, pt: p.pt })),
    backs,
    aniObjs,
  };
}
let cachedFxData: any = null;
function fxData(s: SpriteStore) {
  if (cachedFxData) return cachedFxData;
  const cachePath = join(ROOT, ".cache", "fx.json");
  if (existsSync(cachePath)) {
    try {
      cachedFxData = JSON.parse(readFileSync(cachePath, "utf8"));
      return cachedFxData;
    } catch {}
  }
  const pick = (cat: string, imgName: string, path: string): any => {
    const found = s.image(cat, imgName);
    if (!found) return null;
    const c = resolveCanvas(found.image.parse().get(path), (c2, i) => s.image(c2, i));
    if (!(c instanceof WzCanvasProperty)) return null;
    return spriteOf(`/wz/sprite/${cat}/${imgName}/${path}`, c, s);
  };
  const digits = (prefix: string) => {
    const out: Record<string, any> = {};
    for (let i = 0; i <= 9; i++) {
      const v = pick("Effect", "BasicEff", `${prefix}/${i}`);
      if (v) out[String(i)] = v;
    }
    return out;
  };
  const levelUp: any[] = [];
  for (let i = 0; i < 24; i++) {
    const v = pick("Effect", "BasicEff", `LevelUp/${i}`);
    if (!v) break;
    levelUp.push(v);
  }
  const portal: any[] = [];
  for (let i = 0; i < 8; i++) {
    const v = pick("Map", "MapHelper", `portal/game/pv/default/${i}`);
    if (!v) break;
    if (v.w > 2 && v.h > 2) {
      portal.push(v);
    }
  }
  const meso: any[] = [];
  for (const f of s.files("Item")) {
    const special = f.root.subdirs.get("Special");
    if (!special) continue;
    const img = special.images.get("0900.img");
    if (!img) continue;
    const root = img.parse();
    const iconRaw = root.child("09000000")?.child("iconRaw");
    if (iconRaw instanceof WzSubProperty) {
      for (const ch of iconRaw.children()) {
        const c = resolveCanvas(ch, (cat, i) => s.image(cat, i));
        if (c instanceof WzCanvasProperty) {
          const ox = Math.floor(c.width / 2);
          const oy = c.height;
          meso.push({
            url: `/wz/item/9000000/iconRaw/${ch.name}`,
            w: c.width,
            h: c.height,
            ox,
            oy,
          });
        }
      }
    }
    if (meso.length) break;
  }
  cachedFxData = {
    dmg: digits("NoRed1"),
    dmgFirst: digits("NoRed0"),
    hurt: digits("NoViolet1"),
    hurtFirst: digits("NoViolet0"),
    miss: pick("Effect", "BasicEff", "NoRed0/Miss"),
    levelUp,
    portal,
    meso: meso.length ? meso : Array.from({ length: 10 }, (_, i) => pick("Effect", "BasicEff", `NoBlue1/${i}`)).filter(Boolean),
  };
  return cachedFxData;
}
let cachedUiData: any = null;
function uiData(s: SpriteStore) {
  if (cachedUiData) return cachedUiData;
  const cachePath = join(ROOT, ".cache", "ui.json");
  if (existsSync(cachePath)) {
    try {
      cachedUiData = JSON.parse(readFileSync(cachePath, "utf8"));
      return cachedUiData;
    } catch {}
  }
  const pick = (imgName: string, path: string) => {
    const found = s.image("UI", imgName);
    if (!found) return null;
    const c = resolveUol(found.image.parse().get(path));
    if (!(c instanceof WzCanvasProperty)) return null;
    return spriteOf(`/wz/sprite/UI/${imgName}/${path}`, c);
  };
  const digits = (base: string) => {
    const out: Record<string, any> = {};
    for (let i = 0; i <= 9; i++) {
      const v = pick("StatusBar3", `${base}/${i}`);
      if (v) out[String(i)] = v;
    }
    return out;
  };
  const menu: Record<string, any> = {};
  for (const btn of [
    "CashShop",
    "Event",
    "Character",
    "Community",
    "Setting",
    "Menu",
  ]) {
    const states: Record<string, any> = {};
    for (const st of ["normal", "mouseOver", "pressed"]) {
      const v = pick("StatusBar3", `mainBar/menu/button:${btn}/${st}/0`);
      if (v) states[st] = v;
    }
    if (Object.keys(states).length) menu[btn] = states;
  }
  cachedUiData = {
    expCover: pick("StatusBar3", "mainBar/EXPBar/1920/layer:cover"),
    expGauge: pick("StatusBar3", "mainBar/EXPBar/1920/layer:gauge"),
    expBack: pick("StatusBar3", "mainBar/EXPBar/1920/layer:back"),
    expNumber: digits("mainBar/EXPBar/number"),
    statusBack: pick("StatusBar3", "mainBar/status/backgrnd"),
    statusCover: pick("StatusBar3", "mainBar/status/layer:cover"),
    lvLabel: pick("StatusBar3", "mainBar/status/layer:Lv"),
    lvNumber: digits("mainBar/status/lvNumber"),
    hpGauge: pick("StatusBar3", "mainBar/status/gauge/hp/layer:0"),
    mpGauge: pick("StatusBar3", "mainBar/status/gauge/mp/layer:0"),
    gaugeNumber: digits("mainBar/status/gauge/number"),
    quickBack: pick("StatusBar3", "mainBar/quickSlot/backgrnd"),
    quickCover: pick("StatusBar3", "mainBar/quickSlot/layer:cover"),
    quickFold: pick("StatusBar3", "mainBar/quickSlot/button:Fold/normal/0"),
    menu,
    close: {
      normal: pick("Basic", "BtClose3/normal/0"),
      mouseOver: pick("Basic", "BtClose3/mouseOver/0"),
      pressed: pick("Basic", "BtClose3/pressed/0"),
      disabled: pick("Basic", "BtClose3/disabled/0"),
    },
  };
  return cachedUiData;
}

let cachedWindowsData: any = null;
function windowsData(s: SpriteStore) {
  if (cachedWindowsData) return cachedWindowsData;
  const cachePath = join(ROOT, ".cache", "windows.json");
  if (existsSync(cachePath)) {
    try {
      cachedWindowsData = JSON.parse(readFileSync(cachePath, "utf8"));
      return cachedWindowsData;
    } catch {}
  }
  const pick = (imgName: string, path: string) => {
    const found = s.image("UI", imgName);
    if (!found) return null;
    const c = resolveUol(found.image.parse().get(path));
    if (!(c instanceof WzCanvasProperty)) return null;
    return spriteOf(`/wz/sprite/UI/${imgName}/${path}`, c);
  };
  const nine = (imgName: string, base: string) => {
    const out: Record<string, any> = {};
    for (const part of [
      "nw",
      "n",
      "ne",
      "w",
      "c",
      "e",
      "sw",
      "s",
      "se",
      "arrow",
    ]) {
      const v = pick(imgName, `${base}/${part}`);
      if (v) out[part] = v;
    }
    return out;
  };
  const btn = (imgName: string, base: string) => {
    const out: Record<string, any> = {};
    for (const st of ["normal", "mouseOver", "pressed", "disabled"]) {
      const v = pick(imgName, `${base}/${st}/0`);
      if (v) out[st] = v;
    }
    return out;
  };
  return {
    stat: {
      backgrnd: pick("UIWindow4", "Stat/main/backgrnd"),
      backgrnd2: pick("UIWindow4", "Stat/main/backgrnd2"),
      backgrnd3: pick("UIWindow4", "Stat/main/backgrnd3"),
      BtStrUp: btn("UIWindow2", "Stat/main/BtHpUp"),
      BtDexUp: btn("UIWindow2", "Stat/main/BtHpUp"),
      BtIntUp: btn("UIWindow2", "Stat/main/BtHpUp"),
      BtLukUp: btn("UIWindow2", "Stat/main/BtHpUp"),
      BtAuto: btn("UIWindow2", "Stat/main/BtAuto"),
    },
    skill: {
      backgrnd: pick("UIWindow2", "Skill/main/backgrnd"),
      backgrnd2: pick("UIWindow2", "Skill/main/backgrnd2"),
      backgrnd3: pick("UIWindow2", "Skill/main/backgrnd3"),
      skill0: pick("UIWindow2", "Skill/main/skill0"),
      skill1: pick("UIWindow2", "Skill/main/skill1"),
      skillBlank: pick("UIWindow2", "Skill/main/skillBlank"),
      BtSpUp: btn("UIWindow2", "UserList/GuildSkill/BtUp"),
    },
    equip: {
      backgrnd: pick("UIWindow2", "Equip/character/backgrnd"),
      backgrnd2: pick("UIWindow2", "Equip/character/backgrnd2"),
      backgrnd3: pick("UIWindow2", "Equip/character/backgrnd3"),
    },
    balloon: nine("ChatBalloon", "0"),
    close: btn("Basic", "BtClose3"),
    minimap: nine("UIWindow2", "MiniMap/MaxMap"),
    chatView: nine("StatusBar3", "chat/ingame/view/backgrnd"),
    chatInput: nine("StatusBar3", "chat/ingame/input/backgrnd"),
  };
  return cachedWindowsData;
}
let cachedItemsData: any = null;
function itemsData(s: SpriteStore) {
  if (cachedItemsData) return cachedItemsData;
  const cachePath = join(ROOT, ".cache", "items.json");
  if (existsSync(cachePath)) {
    try {
      cachedItemsData = JSON.parse(readFileSync(cachePath, "utf8"));
      return cachedItemsData;
    } catch {}
  }
  const gear: any[] = [];
  const mats: { id: number; name: string }[] = [];
  const strings = s.files("String")[0];
  let eqNames: WzSubProperty | null = null;
  let itemNames: WzSubProperty | null = null;
  if (strings) {
    const eq = strings.root.images.get("Eqp.img");
    if (eq) eqNames = eq.parse();
    const it = strings.root.images.get("Item.img");
    if (it) itemNames = it.parse();
  }
  const slotFor = (cat: string): string => {
    const map: Record<string, string> = {
      Cap: "hat",
      Coat: "top",
      Longcoat: "top",
      Pants: "bottom",
      Shoes: "shoes",
      Glove: "gloves",
      Shield: "shield",
      Cape: "cape",
      Weapon: "weapon",
      Accessory: "earrings",
      Ring: "ring1",
      Face: "face",
      Hair: "hair",
    };
    return map[cat] ?? cat.toLowerCase();
  };
  // Equip name lookup from String.wz: Eqp.img -> Eqp -> <cat> -> <7-digit id> -> name
  const KNOWN_EQUIP_NAMES: Record<number, string> = {
    1004644: "Royal Ruby Feather Turban",
    1004645: "Royal Emerald Feather Turban",
    1004646: "Royal Azure Feather Turban",
    1004647: "Royal Golden Feather Turban",
    1004648: "Royal Violet Feather Turban",
    1004649: "Royal Obsidian Feather Turban",
  };
  let nameMap: Record<string, string> = {};
  if (eqNames) {
    const eqpCat = eqNames.child("Eqp");
    if (eqpCat instanceof WzSubProperty) {
      for (const cat of [
        "Cap",
        "Coat",
        "Longcoat",
        "Pants",
        "Shoes",
        "Glove",
        "Shield",
        "Cape",
        "Weapon",
        "Accessory",
        "Ring",
      ]) {
        const strCat = eqpCat.child(cat);
        if (strCat instanceof WzSubProperty) {
          for (const entry of strCat.children()) {
            if (entry instanceof WzSubProperty) {
              const n = entry.child("name");
              if (n instanceof WzStringProperty)
                nameMap[entry.name] = n.str ?? entry.name;
            }
          }
        }
      }
    }
  }
  for (const f of s.files("Character")) {
    for (const [cat, dir] of f.root.subdirs) {
      if (
        ![
          "Cap",
          "Coat",
          "Longcoat",
          "Pants",
          "Shoes",
          "Glove",
          "Shield",
          "Cape",
          "Weapon",
          "Accessory",
          "Ring",
        ].includes(cat)
      )
        continue;
      for (const [imgName, img] of dir.images) {
        const id = Number(imgName.replace(/\.img$/, ""));
        if (!Number.isFinite(id)) continue;
        let info: WzSubProperty | null = null;
        try {
          const i = img.parse().child("info");
          if (i instanceof WzSubProperty) info = i;
        } catch {
          continue;
        } finally {
          img.root = null;
        }
        if (!info) continue;
        const v = (k: string) => (info.child(k) as any)?.value ?? 0;
        const icon = resolveUol(info.child("icon"));
        if (!(icon instanceof WzCanvasProperty)) continue;
        const rawName = nameMap[String(id).replace(/^0+/, "") || "0"];
        const equipName = KNOWN_EQUIP_NAMES[id] ?? (rawName && !/^\d+$/.test(rawName) ? rawName : null) ?? `${cat} #${id}`;
        gear.push({
          id,
          name: equipName,
          slot: slotFor(cat),
          req: Number(v("reqLevel") || 0),
          watk: Number(v("incPAD") || 0),
          str: Number(v("incSTR") || 0),
          dex: Number(v("incDEX") || 0),
          int: Number(v("incINT") || 0),
          luk: Number(v("incLUK") || 0),
          hp: Number(v("incMHP") || 0),
          def: Number(v("incPDD") || 0),
          price: Number(v("price") || 0),
          cash: Boolean(v("cash")),
          cosmetic: Boolean(v("cash")),
        });
      }
    }
  }
  const matDirs = ["Etc", "Consume", "Install", "Special", "Cash", "Pet"];
  for (const dirName of matDirs) {
    for (const f of s.files("Item")) {
      const sub = f.root.subdirs.get(dirName);
      if (!sub) continue;
      for (const img of sub.images.values()) {
        let root: WzSubProperty;
        try {
          root = img.parse();
        } catch {
          continue;
        }
        for (const e of root.children()) {
          if (!(e instanceof WzSubProperty)) continue;
          const id = Number(e.name);
          if (!Number.isFinite(id)) continue;
          const info = e.child("info");
          if (!(info instanceof WzSubProperty)) continue;
          const icon = resolveUol(info.child("icon"));
          if (!(icon instanceof WzCanvasProperty)) continue;
          let name = String((info.child("name") as any)?.value ?? "");
          if (!name && itemNames) {
            const cat = itemNames.child(dirName);
            const hit = cat instanceof WzSubProperty ? cat.child(e.name) : null;
            if (hit instanceof WzSubProperty)
              name = String((hit.child("name") as any)?.value ?? "");
          }
          mats.push({ id, name: name || String(id) });
        }
        img.root = null;
      }
    }
  }
  cachedItemsData = { gear, mats };
  return cachedItemsData;
}
let cachedSkillsData: any = null;
function skillsData(
  s: SpriteStore,
) {
  if (cachedSkillsData) return cachedSkillsData;
  const cachePath = join(ROOT, ".cache", "skills.json");
  if (existsSync(cachePath)) {
    try {
      cachedSkillsData = JSON.parse(readFileSync(cachePath, "utf8"));
      return cachedSkillsData;
    } catch {}
  }
  const out: Record<string, any> = {};
  const strings = s.files("String")[0];
  let skillStrings: WzSubProperty | null = null;
  if (strings) {
    const si = strings.root.images.get("Skill.img");
    if (si) skillStrings = si.parse();
  }
  for (const f of s.files("Skill")) {
    for (const [imgName, img] of f.root.images) {
      let root: WzSubProperty;
      try {
        root = img.parse();
      } catch {
        continue;
      }
      const skill = root.child("skill");
      if (!(skill instanceof WzSubProperty)) {
        img.root = null;
        continue;
      }
      for (const entry of skill.children()) {
        if (!(entry instanceof WzSubProperty)) continue;
        const id = entry.name;
        if (!/^\d{7}$/.test(id)) continue;
        const rawIcon = resolveUol(entry.child("icon"));
        if (!(rawIcon instanceof WzCanvasProperty)) continue;
        const icon = resolveCanvas(rawIcon, (cat, img) => s.image(cat, img)) ?? rawIcon;
        const rawIconMO = resolveUol(entry.child("iconMouseOver"));
        const iconMO = rawIconMO instanceof WzCanvasProperty ? (resolveCanvas(rawIconMO, (cat, img) => s.image(cat, img)) ?? rawIconMO) : null;
        const rawIconDis = resolveUol(entry.child("iconDisabled"));
        const iconDis = rawIconDis instanceof WzCanvasProperty ? (resolveCanvas(rawIconDis, (cat, img) => s.image(cat, img)) ?? rawIconDis) : null;
        const sprite = (c: WzCanvasProperty, field = "icon") => {
          const real = resolveCanvas(c, (cat, img) => s.image(cat, img)) ?? c;
          return {
            url: `/wz/skill/${id}/${field}`,
            w: real.width,
            h: real.height,
            ox: 0,
            oy: real.height,
          };
        };
        // effect / effect0 / hit / ball are SubProperty with numbered frame children (or nested in subproperty "0")
        const frames = (node: WzProperty | null, fieldName: string): any[] => {
          if (!node) return [];
          let targetNode = node;
          if (node instanceof WzSubProperty) {
            const directCanvases = node
              .children()
              .some(
                (c) =>
                  /^\d+$/.test(c.name) &&
                  resolveUol(c) instanceof WzCanvasProperty,
              );
            if (!directCanvases) {
              const sub0 = node.child("0") ?? node.child("1");
              if (sub0 instanceof WzSubProperty) targetNode = sub0;
            }
          }
          if (!(targetNode instanceof WzSubProperty)) return [];
          const out: any[] = [];
          for (const fr of targetNode.children()) {
            if (!/^\d+$/.test(fr.name)) continue;
            const c = resolveUol(fr);
            if (c instanceof WzCanvasProperty) {
              const real = resolveCanvas(c, (cat, img) => s.image(cat, img)) ?? c;
              const orig = real.child("origin") ?? c.child("origin");
              const cox = orig instanceof WzVectorProperty ? orig.x : 0;
              const coy = orig instanceof WzVectorProperty ? orig.y : real.height;
              const delayVal = (real.child("delay") as any)?.value ?? (c.child("delay") as any)?.value;
              const delay = typeof delayVal === "number" ? delayVal : 100;
              out.push({
                url: `/wz/skill/${id}/${fieldName}/${fr.name}`,
                w: real.width,
                h: real.height,
                ox: cox,
                oy: coy,
                delay,
              });
            }
          }
          return out;
        };
        // Name/desc from String.wz
        let name = id,
          desc = "";
        if (skillStrings) {
          const e = skillStrings.child(id);
          if (e instanceof WzSubProperty) {
            name = String((e.child("name") as any)?.value ?? id);
            desc = String((e.child("desc") as any)?.value ?? "");
          }
        }
        const effNode = (entry.child("effect") ?? entry.child("special") ?? entry.child("affected") ?? entry.child("level")?.child("1")?.child("effect")) ?? null;
        const eff0Node = (entry.child("effect0") ?? (entry.child("effect") ? entry.child("special") : null) ?? entry.child("special0")) ?? null;
        const hitNode = (entry.child("hit") ?? entry.child("hit0") ?? entry.child("level")?.child("1")?.child("hit")) ?? null;
        const ballNode = (entry.child("ball") ?? entry.child("level")?.child("1")?.child("ball")) ?? null;

        const common = entry.child("common");
        const rawCooltime = (entry.child("cooltime") as any)?.value ?? (common instanceof WzSubProperty ? (common.child("cooltime") as any)?.value : undefined);
        let cooltimeSec = 0;
        if (typeof rawCooltime === "number") {
          cooltimeSec = rawCooltime;
        } else if (typeof rawCooltime === "string") {
          const m = /^(\d+)/.exec(rawCooltime);
          if (m) cooltimeSec = Number(m[1]);
        }

        out[id] = {
          id,
          name,
          desc,
          cooltime: cooltimeSec,
          icon: sprite(icon, "icon"),
          ...(iconMO instanceof WzCanvasProperty
            ? { iconMouseOver: sprite(iconMO, "iconMouseOver") }
            : {}),
          ...(iconDis instanceof WzCanvasProperty
            ? { iconDisabled: sprite(iconDis, "iconDisabled") }
            : {}),
          effect: frames(effNode, "effect"),
          effect0: frames(eff0Node, "effect0"),
          hit: frames(hitNode, "hit"),
          ball: frames(ballNode, "ball"),
        };
      }
      img.root = null;
    }
  }
  if (out["0001000"]?.ball?.[0]) {
    out.snailShell = out["0001000"].ball[0];
  }
  cachedSkillsData = out;
  return cachedSkillsData;
}
// ── targeted lookups ──────────────────────────────────────────────────
/** * Icon/metadata for an item id. * * Equips (weapons, armor, accessories — id prefix 1xx) live in Character.wz * under their category subdir; consumables/etcs live in Item.wz under a * numbered group img. Search both, cheapest first. */ function findItemField(
  s: SpriteStore,
  id: number,
  field: string,
) {
  const sid = String(id).padStart(8, "0");
  const group = sid.slice(0, 4);
  const fromInfo = (
    info: WzSubProperty,
    key: import("./wz/reader.ts").WzKey | null,
  ) => {
    const rawC = resolveUol(info.child(field));
    if (!(rawC instanceof WzCanvasProperty)) return null;
    const c = resolveCanvas(rawC, (cat, img) => s.image(cat, img)) ?? rawC;
    const realKey = c.image?.file?.reader?.key ?? key;
    if (!realKey) return null;
    const v = (k: string) => (info.child(k) as any)?.value;
    return {
      png: canvasToPng(c, realKey),
      meta: {
        name: v("name"),
        desc: v("desc"),
        slot: v("slot"),
        reqLevel: v("reqLevel"),
      },
    };
  };
  // 1. Character.wz: <Category>/<8-digit id>.img/info/<field>
  for (const f of s.files("Character")) {
    for (const sub of f.root.subdirs.values()) {
      const img = sub.images.get(`${sid}.img`);
      if (!img) continue;
      const info = img.parse().child("info");
      if (info instanceof WzSubProperty) {
        const hit = fromInfo(info, f.reader.key);
        if (hit) return hit;
      }
    }
  }
  // 2. Item.wz: <Group>/<NNNN>.img/<8-digit id>/info/<field>
  for (const dir of s.subdirs("Item")) {
    for (const f of s.files("Item")) {
      const sub = f.root.subdirs.get(dir);
      if (!sub) continue;
      // Prefer the group img matching the id's own 4-digit prefix.
      const ordered = [...sub.images.keys()].sort(
        (a, b) => (a.startsWith(group) ? 0 : 1) - (b.startsWith(group) ? 0 : 1),
      );
      for (const imgName of ordered) {
        const img = sub.images.get(imgName)!;
        const e = img.parse().child(sid);
        if (!(e instanceof WzSubProperty)) continue;
        const info = e.child("info");
        if (!(info instanceof WzSubProperty)) continue;
        const hit = fromInfo(info, f.reader.key);
        if (hit) return hit;
      }
    }
  }
  return { png: null, meta: null };
}
function findSkillField(
  s: SpriteStore,
  id: string,
  field: string,
  frame: number,
): Buffer | null {
  // A skill id's job prefix is its leading 3 digits: 1001005 -> 100.img,
  // 4111010 -> 411.img, 0001000 -> 000.img. (Using length-4 breaks 7-digit ids.)
  const p3 = id.slice(0, 3);
  const cands = [p3, p3.replace(/^0+/, "") || "0", id.slice(0, 4), "000"];
  for (const f of s.files("Skill")) {
    for (const cand of cands) {
      const img = f.root.images.get(`${cand}.img`);
      if (!img) continue;
      const root = img.parse();
      const skill = root.child("skill");
      if (!(skill instanceof WzSubProperty)) continue;
      const entry = skill.child(id);
      if (!(entry instanceof WzSubProperty)) continue;
      let fld = resolveUol(entry.child(field));
      if (!fld) {
        if (field === "effect") fld = resolveUol((entry.child("special") ?? entry.child("affected") ?? entry.child("level")?.child("1")?.child("effect")) ?? null);
        else if (field === "effect0") fld = resolveUol(((entry.child("effect") ? entry.child("special") : null) ?? entry.child("special0")) ?? null);
        else if (field === "hit") fld = resolveUol((entry.child("hit0") ?? entry.child("level")?.child("1")?.child("hit")) ?? null);
        else if (field === "ball") fld = resolveUol(entry.child("level")?.child("1")?.child("ball") ?? null);
      }
      if (fld instanceof WzCanvasProperty) {
        const real = resolveCanvas(fld, (cat, img) => s.image(cat, img)) ?? fld;
        const key = real.image?.file?.reader?.key ?? f.reader.key;
        return canvasToPng(real, key);
      }
      if (fld instanceof WzSubProperty) {
        let targetNode: WzProperty = fld;
        const directCanvases = fld
          .children()
          .some(
            (c) =>
              /^\d+$/.test(c.name) &&
              resolveUol(c) instanceof WzCanvasProperty,
          );
        if (!directCanvases) {
          const sub0 = fld.child("0") ?? fld.child("1");
          if (sub0 instanceof WzSubProperty) targetNode = sub0;
        }
        const fr = resolveUol(targetNode.child(String(frame)));
        if (fr instanceof WzCanvasProperty) {
          const real = resolveCanvas(fr, (cat, img) => s.image(cat, img)) ?? fr;
          const key = real.image?.file?.reader?.key ?? f.reader.key;
          return canvasToPng(real, key);
        }
      }
    }
  }
  // Fallback for missing icons: return Beginner Three Snails icon (0001000/icon)
  if (field === "icon" || field === "iconMouseOver" || field === "iconDisabled") {
    for (const f of s.files("Skill")) {
      const img = f.root.images.get("000.img");
      if (!img) continue;
      const root = img.parse();
      const entry = root.child("skill")?.child("0001000");
      if (entry instanceof WzSubProperty) {
        const ic = resolveCanvas(resolveUol(entry.child("icon")), (cat, img) => s.image(cat, img));
        if (ic instanceof WzCanvasProperty) {
          const key = ic.image?.file?.reader?.key ?? f.reader.key;
          return canvasToPng(ic, key);
        }
      }
    }
  }
  return null;
}

function generateHoverAura(frame: number): Buffer {
  const w = 64, h = 64;
  const buf = Buffer.alloc(w * h * 4);
  const cx = 32, cy = 42;
  const t = (frame % 8) / 8;
  // Outer glowing aura ellipse
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / 22;
      const dy = (y - cy) / 7;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 1.2) {
        const pulse = 0.7 + 0.3 * Math.sin(t * Math.PI * 2);
        const ringDist = Math.abs(d - 0.75);
        if (ringDist < 0.35) {
          const alpha = Math.max(0, 1 - ringDist / 0.35) * pulse * 0.75;
          const idx = (y * w + x) * 4;
          buf[idx] = Math.round(56 * alpha);
          buf[idx + 1] = Math.round(189 * alpha);
          buf[idx + 2] = Math.round(248 * alpha);
          buf[idx + 3] = Math.round(alpha * 220);
        }
      }
    }
  }

  // Floating celestial sparkle particles
  const particles = [
    { baseAngle: 0, r: 16, yOffset: -8 },
    { baseAngle: Math.PI * 0.5, r: 18, yOffset: -14 },
    { baseAngle: Math.PI, r: 14, yOffset: -20 },
    { baseAngle: Math.PI * 1.5, r: 19, yOffset: -10 },
  ];
  for (let pIdx = 0; pIdx < particles.length; pIdx++) {
    const p = particles[pIdx];
    const angle = p.baseAngle + t * Math.PI * 2;
    const px = Math.round(cx + Math.cos(angle) * p.r);
    const py = Math.round(cy + p.yOffset + Math.sin(t * Math.PI * 2 + pIdx) * 4);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= 2) {
          const x = px + dx, y = py + dy;
          if (x >= 0 && x < w && y >= 0 && y < h) {
            const idx = (y * w + x) * 4;
            const core = (dx === 0 && dy === 0);
            buf[idx] = 255;
            buf[idx + 1] = core ? 255 : 230;
            buf[idx + 2] = 255;
            buf[idx + 3] = core ? 240 : 160;
          }
        }
      }
    }
  }
  return encodePng(buf, w, h);
}

function findEffTarget(s: SpriteStore, id: number): { node: WzSubProperty; img: any; isCharEff?: boolean } | null {
  // Wizet Plain Suit (1042003) and Pants (1062007) must NOT grant GM effect; strictly reserved for Wizet Invincible Hat
  if (id === 1042003 || id === 1062007) return null;
  const lookupId = id === 1003142 ? 1002140 : id;
  // 1. ItemEff.img
  for (const f of s.files("Effect")) {
    const img = f.root.images.get("ItemEff.img");
    if (!img) continue;
    const node = img.parse().child(String(lookupId))?.child("effect");
    if (node instanceof WzSubProperty) return { node, img };
  }
  // 2. CharacterEff.img
  for (const f of s.files("Effect")) {
    const img = f.root.images.get("CharacterEff.img");
    if (!img) continue;
    const node = img.parse().child(String(lookupId));
    if (node instanceof WzSubProperty) return { node, img, isCharEff: true };
  }
  // 3. Character.wz info/effect/path or root effect
  const pad = "0" + lookupId + ".img";
  for (const f of s.files("Character")) {
    for (const [, dir] of f.root.subdirs) {
      const charImg = dir.images.get(pad);
      if (!charImg) continue;
      const root = charImg.parse();
      const p = root.child("info")?.child("effect")?.child("path");
      if (p instanceof WzStringProperty) {
        const parts = p.str.split("/");
        const targetImgName = parts[1];
        const subPath = parts.slice(2).join("/");
        for (const ef of s.files("Effect")) {
          const efImg = ef.root.images.get(targetImgName);
          if (efImg) {
            const targetNode = efImg.parse().get(subPath);
            if (targetNode instanceof WzSubProperty) {
              return { node: targetNode, img: efImg, isCharEff: targetImgName === "CharacterEff.img" };
            }
          }
        }
      }
      const eff = root.child("effect");
      if (eff instanceof WzSubProperty) return { node: eff, img: charImg };
    }
  }
  // 4. Item.wz
  for (const f of s.files("Item")) {
    for (const [, dir] of f.root.subdirs) {
      for (const itemImg of dir.images.values()) {
        try {
          const root = itemImg.parse();
          const itemNode = root.child(String(id));
          if (itemNode instanceof WzSubProperty) {
            const eff = itemNode.child("effect");
            if (eff instanceof WzSubProperty) return { node: eff, img: itemImg };
          }
        } catch {}
      }
    }
  }
  return null;
}

function itemEffData(s: SpriteStore, id: number) {
  const target = findEffTarget(s, id);
  if (!target) return null;

  if (target.isCharEff) {
    const frames: any[] = [];
    const sorted = target.node.children()
      .filter((c) => /^\d+$/.test(c.name))
      .sort((a, b) => Number(a.name) - Number(b.name));
    for (const fr of sorted) {
      let raw: any = fr.child("0");
      if (!raw && fr instanceof WzCanvasProperty) raw = fr;
      const c = resolveCanvas(raw ?? null, (cat, img) => s.image(cat, img));
      if (c instanceof WzCanvasProperty) {
        const ox = Number((c.child("origin") as any)?.x ?? Math.floor(c.width / 2));
        const oy = Number((c.child("origin") as any)?.y ?? c.height);
        const d = Number((c.child("delay") as any)?.value ?? (fr.child("delay") as any)?.value ?? 120);
        const z = Number((c.child("z") as any)?.value ?? (fr.child("z") as any)?.value ?? 1);
        const pos = Number((c.child("pos") as any)?.value ?? (fr.child("pos") as any)?.value ?? 0);
        const fixed = id === 1002667 || Boolean((c.child("fixed") as any)?.value ?? (fr.child("fixed") as any)?.value);
        frames.push({
          url: `/wz/item-eff/${id}/default/${fr.name}`,
          w: c.width,
          h: c.height,
          ox,
          oy,
          delay: d,
          z,
          pos,
          fixed,
        });
      }
    }
    if (frames.length) {
      return {
        id,
        z: frames[0]?.z ?? 1,
        pos: frames[0]?.pos ?? 0,
        fixed: frames[0]?.fixed ?? false,
        actions: { default: frames },
      };
    }
    return null;
  }

  const eff = target.node;
  const rawEffZ = (eff.child("z") as any)?.value;
  const defaultAct = eff.child("default");
  const rawDefZ = (defaultAct?.child("z") as any)?.value;
  const effZ = rawEffZ !== undefined ? Number(rawEffZ) : (rawDefZ !== undefined ? Number(rawDefZ) : 0);
  const effPos = Number((eff.child("pos") as any)?.value ?? (defaultAct?.child("pos") as any)?.value ?? 0);
  const rawEffFixed = (eff.child("fixed") as any)?.value ?? (eff.child("actionExceptRotation") as any)?.value;
  const effFixed = Boolean(Number(rawEffFixed ?? 0));
  const actions: Record<string, any[]> = {};
  for (const act of eff.children()) {
    if (!(act instanceof WzSubProperty)) continue;
    const rawActZ = (act.child("z") as any)?.value;
    const isBackName = act.name.toLowerCase().startsWith("back") || act.name === "ladder" || act.name === "rope";
    const actZ = isBackName ? -1 : (rawActZ !== undefined ? Number(rawActZ) : effZ);
    const rawActPos = (act.child("pos") as any)?.value;
    const actPos = rawActPos !== undefined ? Number(rawActPos) : effPos;
    const rawActFixed = (act.child("fixed") as any)?.value ?? (act.child("actionExceptRotation") as any)?.value;
    const actFixed = rawActFixed !== undefined ? Boolean(Number(rawActFixed)) : effFixed;
    const frames: any[] = [];
    const sorted = act.children()
      .filter((c) => /^\d+$/.test(c.name))
      .sort((a, b) => Number(a.name) - Number(b.name));
    for (const fr of sorted) {
      const c = resolveCanvas(fr, (cat, img) => s.image(cat, img));
      if (c instanceof WzCanvasProperty) {
        const ox = Number((c.child("origin") as any)?.x ?? Math.floor(c.width / 2));
        const oy = Number((c.child("origin") as any)?.y ?? c.height);
        const d = Number((c.child("delay") as any)?.value ?? 100);
        const cZ = (c.child("z") as any)?.value;
        const frameZ = isBackName ? -1 : (actZ < 0 ? actZ : (typeof cZ === "number" && cZ !== 0 ? cZ : actZ));
        const cPos = (c.child("pos") as any)?.value;
        const framePos = cPos !== undefined ? Number(cPos) : actPos;
        frames.push({
          url: `/wz/item-eff/${id}/${act.name}/${fr.name}`,
          w: c.width,
          h: c.height,
          ox,
          oy,
          delay: d,
          z: frameZ,
          pos: framePos,
          fixed: actFixed,
        });
      }
    }
    if (frames.length) actions[act.name] = frames;
  }
  if (Object.keys(actions).length) {
    return { id, z: effZ, pos: effPos, fixed: effFixed, actions };
  }
  return null;
}

function itemEffPng(s: SpriteStore, id: number, act: string, fr: string): Buffer | null {
  const target = findEffTarget(s, id);
  if (!target) return null;
  let raw: any;
  if (target.isCharEff) {
    raw = target.node.child(fr)?.child("0") ?? target.node.child(fr);
  } else {
    let actNode: any = target.node.child(act);
    if (actNode instanceof WzUolProperty) actNode = resolveUol(actNode);
    raw = actNode?.child(fr) ?? target.node.child(fr);
  }
  const c = resolveCanvas(raw ?? null, (cat, img) => s.image(cat, img));
  if (c instanceof WzCanvasProperty) {
    return canvasToPng(c, target.img.file.reader.key);
  }
  return null;
}

function shadowPartnerData(s: SpriteStore): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  for (const f of s.files("Skill")) {
    const img = f.root.images.get("411.img");
    if (!img) continue;
    const root = img.parse();
    const sk = root.child("skill")?.child("4111002");
    const special = sk?.child("special");
    if (!(special instanceof WzSubProperty)) continue;
    for (const act of special.children()) {
      if (!(act instanceof WzSubProperty)) continue;
      const frames: any[] = [];
      for (const fr of act.children()) {
        const raw = resolveUol(fr);
        const c = resolveCanvas(raw, (cat, im) => s.image(cat, im));
        if (c instanceof WzCanvasProperty) {
          const orig = c.child("origin");
          const ox = orig instanceof WzVectorProperty ? orig.x : Math.round(c.width / 2);
          const oy = orig instanceof WzVectorProperty ? orig.y : c.height;
          frames.push({
            url: `/wz/shadow-partner/${act.name}/${fr.name}`,
            w: c.width,
            h: c.height,
            ox,
            oy,
            delay: Number((c.child("delay") as any)?.value) || 120,
          });
        }
      }
      if (frames.length) out[act.name] = frames;
    }
  }
  return out;
}

function shadowPartnerPng(s: SpriteStore, act: string, fr: string): Buffer | null {
  for (const f of s.files("Skill")) {
    const img = f.root.images.get("411.img");
    if (!img) continue;
    const root = img.parse();
    const sk = root.child("skill")?.child("4111002");
    const special = sk?.child("special");
    if (!(special instanceof WzSubProperty)) continue;
    const actProp = special.child(act);
    if (!actProp) continue;
    const frProp = resolveUol(actProp.child(fr));
    const c = resolveCanvas(frProp, (cat, im) => s.image(cat, im));
    if (c instanceof WzCanvasProperty) {
      const key = c.image?.file?.reader?.key ?? f.reader.key;
      return canvasToPng(c, key);
    }
  }
  return null;
}

function findPetImage(s: SpriteStore, id: number): { img: WzImage; root: WzSubProperty } | null {
  const sid = `${id}.img`;
  for (const f of s.files("Item")) {
    const petDir = f.root.subdirs.get("Pet");
    const img = petDir?.images.get(sid) ?? f.root.images.get(sid);
    if (img) {
      return { img, root: img.parse() };
    }
  }
  return null;
}

let cachedPetNames: Map<number, string> | null = null;
function getPetName(s: SpriteStore, id: number): string {
  if (!cachedPetNames) {
    cachedPetNames = new Map();
    for (const f of s.files("String")) {
      const pet = f.root.images.get("Pet.img")?.parse();
      if (pet) {
        for (const child of pet.children()) {
          const numId = Number(child.name);
          if (numId > 0) {
            const nameVal = (child.child("name") as any)?.value;
            if (nameVal) cachedPetNames.set(numId, String(nameVal));
          }
        }
      }
    }
  }
  return cachedPetNames.get(id) ?? `Pet ${id}`;
}

const ICONIC_PET_IDS = [
  5000000, // Brown Kitty
  5000001, // Brown Puppy
  5000002, // Pink Bunny
  5000003, // Mini Kargo
  5000004, // Black Kitty
  5000005, // White Bunny
  5000006, // Husky
  5000008, // Panda
  5000020, // Mini Yeti
  5000029, // Rudolph
  5000047, // Jr. Balrog
  5000054, // Baby Dragon
];

function petList(s: SpriteStore) {
  return ICONIC_PET_IDS.map((id) => ({
    id,
    name: getPetName(s, id),
    icon: `/wz/pet-icon/${id}`,
  }));
}

function petData(s: SpriteStore, id: number): any {
  const found = findPetImage(s, id);
  if (!found) return null;
  const { root } = found;
  const name = getPetName(s, id);
  const actions: Record<string, any[]> = {};
  for (const act of root.children()) {
    if (!(act instanceof WzSubProperty)) continue;
    if (act.name === "info" || act.name === "interact" || act.name === "food" || act.name === "slang") continue;
    const frames: any[] = [];
    const sorted = act.children()
      .filter((c) => /^\d+$/.test(c.name))
      .sort((a, b) => Number(a.name) - Number(b.name));
    for (const fr of sorted) {
      const raw = resolveUol(fr);
      const c = resolveCanvas(raw, (cat, im) => s.image(cat, im));
      if (c instanceof WzCanvasProperty) {
        const orig = c.child("origin");
        const ox = orig instanceof WzVectorProperty ? orig.x : Math.round(c.width / 2);
        const oy = orig instanceof WzVectorProperty ? orig.y : c.height;
        frames.push({
          url: `/wz/pet/${id}/${act.name}/${fr.name}`,
          w: c.width,
          h: c.height,
          ox,
          oy,
          delay: Number((c.child("delay") as any)?.value) || 120,
        });
      }
    }
    if (frames.length) actions[act.name] = frames;
  }
  return {
    id,
    name,
    icon: `/wz/pet-icon/${id}`,
    actions,
  };
}

function petFramePng(s: SpriteStore, id: number, act: string, fr: string): Buffer | null {
  const found = findPetImage(s, id);
  if (!found) return null;
  let actProp: any = found.root.child(act);
  if (actProp instanceof WzUolProperty) actProp = resolveUol(actProp);
  const frProp = resolveUol(actProp?.child(fr));
  const c = resolveCanvas(frProp, (cat, im) => s.image(cat, im));
  if (c instanceof WzCanvasProperty) {
    const key = c.image?.file?.reader?.key ?? found.img.file.reader.key;
    return canvasToPng(c, key);
  }
  return null;
}

function petIconPng(s: SpriteStore, id: number): Buffer | null {
  const found = findPetImage(s, id);
  if (!found) return null;
  const info = found.root.child("info");
  const iconRaw = info?.child("icon") ?? info?.child("iconRaw") ?? found.root.child("stand0")?.child("0");
  const c = resolveCanvas(resolveUol(iconRaw ?? null), (cat, im) => s.image(cat, im));
  if (c instanceof WzCanvasProperty) {
    const key = c.image?.file?.reader?.key ?? found.img.file.reader.key;
    return canvasToPng(c, key);
  }
  return null;
}

/** Map terrain & objects rendered onto a transparent canvas (no debug lines). */
function renderMapFrameBuffer(
  m: MapStore,
  id: number,
  s: SpriteStore,
): { fb: FrameBuffer; w: number; h: number } | null {
  const fhs = m.footholds(id);
  if (!fhs.length) return null;
  const img = m.image(id);
  if (!img) return null;
  const root = img.parse();

  const bounds = mapBounds(m, id);
  const { w, h, ox, oy } = bounds;

  const fb = new FrameBuffer(w, h);
  fb.clear(0, 0, 0, 0);
  const key = img.file.reader.key;
  const tileImages = new Map<string, WzSubProperty | null>();
  const objImages = new Map<string, WzSubProperty | null>();

  const getTileImg = (tS: string) => {
    if (tileImages.has(tS)) return tileImages.get(tS)!;
    for (const mf of s.files("Map")) {
      const td = mf.root.subdirs.get("Tile");
      if (td?.images.has(`${tS}.img`)) {
        const parsed = td.images.get(`${tS}.img`)!.parse();
        tileImages.set(tS, parsed);
        return parsed;
      }
    }
    tileImages.set(tS, null);
    return null;
  };

  const getObjImg = (oS: string) => {
    if (objImages.has(oS)) return objImages.get(oS)!;
    for (const mf of s.files("Map")) {
      const od = mf.root.subdirs.get("Obj");
      if (od?.images.has(`${oS}.img`)) {
        const parsed = od.images.get(`${oS}.img`)!.parse();
        objImages.set(oS, parsed);
        return parsed;
      }
    }
    objImages.set(oS, null);
    return null;
  };

  for (let i = 0; i <= 7; i++) {
    const layer = root.get(String(i));
    if (!layer) continue;
    const tS = (layer.get("info") as any)?.child("tS")?.value;
    const tile = layer.get("tile");
    if (tS && tile instanceof WzSubProperty) {
      const troot = getTileImg(String(tS));
      if (troot) {
        for (const tc of tile.children()) {
          const g = tc as WzSubProperty;
          const u = (g.child("u") as any)?.value;
          const no = (g.child("no") as any)?.value;
          const x = Number((g.child("x") as any)?.value ?? 0);
          const y = Number((g.child("y") as any)?.value ?? 0);
          const rawC = troot.get(String(u))?.get(String(no));
          const c = resolveCanvas(rawC ?? null, (cat, img) => s.image(cat, img));
          if (c instanceof WzCanvasProperty && c.width > 0 && c.height > 0) {
            try {
              const tileKey = c.image?.file?.reader?.key ?? key;
              const raw = c.pngData();
              const pixels = decompressCanvas(raw, tileKey);
              const rgba = decodePixels(pixels, c.width, c.height, c.format + c.format2);
              const corigin = c.child("origin");
              const cox = Number((corigin as any)?.x ?? 0);
              const coy = Number((corigin as any)?.y ?? 0);
              fb.blend(rgba, c.width, c.height, x - cox + ox, y - coy + oy, false);
            } catch {}
          }
        }
      }
    }

    const obj = layer.get("obj");
    if (obj instanceof WzSubProperty) {
      const sortedObjs = [...obj.children()].sort((a, b) => {
        const za = Number((a as WzSubProperty).child("z")?.value ?? 0);
        const zb = Number((b as WzSubProperty).child("z")?.value ?? 0);
        return za - zb;
      });
      for (const oc of sortedObjs) {
        const g = oc as WzSubProperty;
        const oS = (g.child("oS") as any)?.value;
        const l0 = (g.child("l0") as any)?.value;
        const l1 = (g.child("l1") as any)?.value;
        const l2 = (g.child("l2") as any)?.value;
        const x = Number((g.child("x") as any)?.value ?? 0);
        const y = Number((g.child("y") as any)?.value ?? 0);
        const f = Boolean((g.child("f") as any)?.value);
        const oroot = getObjImg(String(oS));
        if (oroot) {
          const target = oroot.get(String(l0))?.get(String(l1))?.get(String(l2));
          if (target instanceof WzSubProperty && !(target instanceof WzCanvasProperty)) {
            const hasMultipleFrames = target.child("0") && target.child("1");
            if (hasMultipleFrames) {
              continue; // Animated map object: rendered dynamically in client
            }
          }
          const c = target instanceof WzSubProperty && !(target instanceof WzCanvasProperty) ? (target.get("0") ?? target) : target;
          const real = resolveCanvas(c ?? null, (cat, img) => s.image(cat, img));
          if (real instanceof WzCanvasProperty && real.width > 2 && real.height > 2) {
            try {
              const objKey = real.image?.file?.reader?.key ?? key;
              const raw = real.pngData();
              const pixels = decompressCanvas(raw, objKey);
              const rgba = decodePixels(pixels, real.width, real.height, real.format + real.format2);
              const corigin = real.child("origin");
              const cox = Number((corigin as any)?.x ?? 0);
              const coy = Number((corigin as any)?.y ?? 0);
              const drawX = f ? x - (real.width - cox) + ox : x - cox + ox;
              fb.blend(rgba, real.width, real.height, drawX, y - coy + oy, f);
            } catch {}
          }
        }
      }
    }
  }

  // Interactive reactors & mechanisms
  const reactorNode = root.get("reactor");
  if (reactorNode instanceof WzSubProperty) {
    for (const rc of reactorNode.children()) {
      const rid = String(rc.child("id")?.value ?? "");
      const rx = Number(rc.child("x")?.value ?? 0);
      const ry = Number(rc.child("y")?.value ?? 0);
      const f = Boolean(rc.child("f")?.value);
      if (!rid) continue;
      for (const rf of s.files("Reactor")) {
        const rImg = rf.root.images.get(`${rid}.img`);
        if (rImg) {
          const rp = rImg.parse();
          const st0 = rp.get("0")?.get("0") ?? rp.get("0");
          const real = resolveCanvas(st0 ?? null, (cat, img) => s.image(cat, img));
          if (real instanceof WzCanvasProperty && real.width > 2 && real.height > 2) {
            try {
              const rKey = real.image?.file?.reader?.key ?? key;
              const raw = real.pngData();
              const pixels = decompressCanvas(raw, rKey);
              const rgba = decodePixels(pixels, real.width, real.height, real.format + real.format2);
              const corigin = real.child("origin");
              const cox = Number((corigin as any)?.x ?? 0);
              const coy = Number((corigin as any)?.y ?? 0);
              const drawX = f ? rx - (real.width - cox) + ox : rx - cox + ox;
              fb.blend(rgba, real.width, real.height, drawX, ry - coy + oy, f);
            } catch {}
          }
          break;
        }
      }
    }
  }

  // Map NPCs (shopkeepers, quest givers, storage keepers)
  const lifeNode = root.get("life");
  if (lifeNode instanceof WzSubProperty) {
    for (const lc of lifeNode.children()) {
      if (lc.child("type")?.value !== "n") continue;
      const nid = String(lc.child("id")?.value ?? "");
      const nx = Number(lc.child("x")?.value ?? 0);
      const ny = Number(lc.child("y")?.value ?? 0);
      const f = Boolean(lc.child("f")?.value);
      if (!nid) continue;
      for (const nf of s.files("Npc")) {
        const nImg = nf.root.images.get(`${nid}.img`);
        if (nImg) {
          const np = nImg.parse();
          const st0 = np.get("stand")?.get("0") ?? np.get("default")?.get("0") ?? np.get("0");
          const real = resolveCanvas(st0 ?? null, (cat, img) => s.image(cat, img));
          if (real instanceof WzCanvasProperty && real.width > 2 && real.height > 2) {
            try {
              const raw = real.pngData();
              const pixels = decompressCanvas(raw, key);
              const rgba = decodePixels(pixels, real.width, real.height, real.format + real.format2);
              const corigin = real.child("origin");
              const cox = Number((corigin as any)?.x ?? 0);
              const coy = Number((corigin as any)?.y ?? 0);
              const drawX = f ? nx - (real.width - cox) + ox : nx - cox + ox;
              fb.blend(rgba, real.width, real.height, drawX, ny - coy + oy, f);
            } catch {}
          }
          break;
        }
      }
    }
  }

  return { fb, w, h };
}

function renderMap(
  m: MapStore,
  id: number,
  s: SpriteStore,
): Buffer | null {
  const res = renderMapFrameBuffer(m, id, s);
  return res ? res.fb.toPng() : null;
}

const minimapPngCache = new Map<number, Buffer>();

function downsampleRgba(src: Buffer, sw: number, sh: number, dw: number, dh: number): Buffer {
  const out = Buffer.alloc(dw * dh * 4);
  const scaleX = sw / dw;
  const scaleY = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const syStart = Math.floor(dy * scaleY);
    const syEnd = Math.min(sh, Math.floor((dy + 1) * scaleY));
    for (let dx = 0; dx < dw; dx++) {
      const sxStart = Math.floor(dx * scaleX);
      const sxEnd = Math.min(sw, Math.floor((dx + 1) * scaleX));
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let sy = syStart; sy < syEnd; sy++) {
        for (let sx = sxStart; sx < sxEnd; sx++) {
          const so = (sy * sw + sx) * 4;
          const sa = src[so + 3];
          if (sa > 0) {
            r += src[so];
            g += src[so + 1];
            b += src[so + 2];
            a += sa;
            count++;
          }
        }
      }
      const dof = (dy * dw + dx) * 4;
      if (count > 0) {
        out[dof] = Math.round(r / count);
        out[dof + 1] = Math.round(g / count);
        out[dof + 2] = Math.round(b / count);
        out[dof + 3] = Math.round(a / count);
      }
    }
  }
  return out;
}

function renderMinimapPng(
  m: MapStore,
  id: number,
  s: SpriteStore,
  targetW: number,
  targetH: number,
): Buffer | null {
  if (minimapPngCache.has(id)) return minimapPngCache.get(id)!;
  const rmb = renderMapFrameBuffer(m, id, s);
  if (!rmb) return null;
  const down = downsampleRgba(rmb.fb.data, rmb.w, rmb.h, targetW, targetH);
  const png = encodePng(down, targetW, targetH);
  if (png) {
    if (minimapPngCache.size >= 100) {
      const firstKey = minimapPngCache.keys().next().value;
      if (firstKey !== undefined) minimapPngCache.delete(firstKey);
    }
    minimapPngCache.set(id, png);
  }
  return png;
}
interface PlayerSession {
  id: string;
  username?: string;
  name: string;
  mapId: number;
  x: number;
  y: number;
  face: number;
  anim: string;
  frame: number;
  look: number[];
  guildId?: string;
  guildName?: string;
  guildEmblem?: any;
}

const wsPlayers = new Map<any, PlayerSession>();

function isCustomCharName(name?: string): boolean {
  const clean = (name || "").trim();
  return Boolean(clean && clean !== "Player" && !/^P-[A-F0-9]{4}$/i.test(clean));
}

function evictDuplicateSessions(currentWs: any, username?: string, charName?: string) {
  const normUser = (username || "").trim().toLowerCase();
  const hasRealUser = Boolean(normUser && normUser !== "guest");
  const normName = (charName || "").trim().toLowerCase();
  const hasRealName = isCustomCharName(charName);

  if (!hasRealUser && !hasRealName) return;

  for (const [existingWs, existingSession] of [...wsPlayers.entries()]) {
    if (existingWs === currentWs) continue;
    const existingUser = (existingSession.username || "").trim().toLowerCase();
    const existingName = (existingSession.name || "").trim().toLowerCase();

    const sameAccount = hasRealUser && existingUser && existingUser === normUser;
    const sameChar = hasRealName && existingName && existingName === normName;

    if (sameAccount || sameChar) {
      wsPlayers.delete(existingWs);
      const leaveMsg = JSON.stringify({
        t: "player_leave",
        id: existingSession.id,
        name: existingSession.name,
      });
      for (const [c, p] of wsPlayers) {
        if (c !== existingWs && p.mapId === existingSession.mapId) {
          try { c.send(leaveMsg); } catch {}
        }
      }
      try {
        existingWs.send(JSON.stringify({
          t: "session_replaced",
          reason: "Your account was logged in from another window or device.",
        }));
      } catch {}
      try {
        existingWs.close(4001, "Session replaced");
      } catch {}
    }
  }
}

function getMapRosterFor(currentWs: any, session: PlayerSession): PlayerSession[] {
  const seenNames = new Set<string>();
  const seenUsers = new Set<string>();
  if (session.name) seenNames.add(session.name.trim().toLowerCase());
  if (session.username) seenUsers.add(session.username.trim().toLowerCase());

  const others: PlayerSession[] = [];
  for (const [c, p] of wsPlayers.entries()) {
    if (c === currentWs || p.mapId !== session.mapId) continue;
    const nKey = (p.name || "").trim().toLowerCase();
    const uKey = (p.username || "").trim().toLowerCase();
    if (nKey && isCustomCharName(p.name) && seenNames.has(nKey)) continue;
    if (uKey && uKey !== "guest" && seenUsers.has(uKey)) continue;
    if (nKey) seenNames.add(nKey);
    if (uKey) seenUsers.add(uKey);
    others.push(p);
  }
  return others;
}

// ── Guild Persistence & Management ──────────────────────────────────────────
interface ServerGuildMember {
  name: string;
  level: number;
  job: string;
  rank: 1 | 2 | 3 | 4 | 5;
  contribution: number;
  online: boolean;
  mapId?: number;
  look?: number[];
}

interface ServerGuild {
  id: string;
  name: string;
  master: string;
  notice: string;
  level: number;
  gp: number;
  capacity: number;
  emblem: { bgShape: number; bgColor: number; symbolShape: number; symbolColor: number };
  ranks: [string, string, string, string, string];
  members: ServerGuildMember[];
  createdAt: number;
}

const GUILDS_FILE = join(ROOT, ".cache", "guilds.json");
let guildsCache: Map<string, ServerGuild> | null = null;

function loadGuilds(): Map<string, ServerGuild> {
  if (guildsCache) return guildsCache;
  guildsCache = new Map();
  try {
    if (existsSync(GUILDS_FILE)) {
      const list: ServerGuild[] = JSON.parse(readFileSync(GUILDS_FILE, "utf-8"));
      for (const g of list) guildsCache.set(g.id, g);
    }
  } catch {}
  return guildsCache;
}

function saveGuilds() {
  if (!guildsCache) return;
  try {
    mkdirSync(join(ROOT, ".cache"), { recursive: true });
    writeFileSync(GUILDS_FILE, JSON.stringify([...guildsCache.values()], null, 2), "utf-8");
  } catch {}
}

function getGuildForPlayer(playerName: string): ServerGuild | null {
  const all = loadGuilds();
  for (const g of all.values()) {
    if (g.members.some((m) => m.name.toLowerCase() === playerName.toLowerCase())) {
      return g;
    }
  }
  return null;
}

// ── SpacetimeDB Client Integration ─────────────────────────────────────────────
let cachedSpacetimeUrl: string | null = null;
async function getSpacetimeUrl(): Promise<string> {
  if (cachedSpacetimeUrl) return cachedSpacetimeUrl;
  const candidates = [
    process.env.SPACETIMEDB_URL,
    "http://127.0.0.1:3100",
    "http://127.0.0.1:3001",
    "http://localhost:3100",
    "http://localhost:3001",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      const res = await fetch(`${c}/v1/ping`, { signal: AbortSignal.timeout(500) });
      if (res.ok) {
        cachedSpacetimeUrl = c;
        return c;
      }
    } catch {}
  }
  return process.env.SPACETIMEDB_URL || "http://127.0.0.1:3100";
}

async function spacetimeSql(query: string): Promise<any[][]> {
  const url = await getSpacetimeUrl();
  const res = await fetch(`${url}/v1/database/maple-wayfarer/sql`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: query,
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const data = await res.json();
  return data[0]?.rows ?? [];
}

async function spacetimeCall(reducer: string, args: any[]): Promise<boolean> {
  const url = await getSpacetimeUrl();
  const res = await fetch(`${url}/v1/database/maple-wayfarer/call/${reducer}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return true;
}

function hashPassword(pass: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(pass + "_maple_salt_99");
  return hasher.digest("hex");
}

// ── server ────────────────────────────────────────────────────────────
const server = Bun.serve<{ id: string }>({
  port,
  hostname: "0.0.0.0",
  development: process.env.NODE_ENV !== "production",
  // Decoding a large map can exceed the 10s default idle timeout.
  idleTimeout: 60,
  routes: {
    // Fullstack HTML route: Bun bundles TS + CSS on demand, HMR included.
    "/": index,
    "/wz/status": () => {
      const s = getStore();
      if (!s) return noClient();
      return jsonNoStore({
        ok: true,
        clientDir: s.clientDir,
        dataDir: s.dataDir,
        versionHash: "0x" + s.versionHash.toString(16),
        region: s.region,
        categories: s.categories,
        loaded: [...s.open.keys()],
        stats: s.stats,
      });
    },
    "/wz/categories": () => Response.json(getStore()?.categories ?? []),
    "/wz/subdirs/:cat": (req: any) => {
      const s = getStore();
      return s ? Response.json(s.subdirs(req.params.cat)) : noClient();
    },
    "/wz/list/:cat": (req: any) => {
      const s = getStore();
      if (!s) return noClient();
      const ids = s.list(req.params.cat);
      return Response.json({
        category: req.params.cat,
        count: ids.length,
        ids,
      });
    },
    "/wz/search": (req: any) => {
      const s = getStore();
      if (!s) return noClient();
      const q = new URL(req.url).searchParams.get("q") ?? "";
      if (!q) return Response.json([]);
      return Response.json(
        s.search(q, Number(new URL(req.url).searchParams.get("limit") ?? 50)),
      );
    },
    "/wz/sprite/:cat/:id/*": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const path = tail(req, 4);
      if (!path)
        return Response.json({ error: "missing sprite path" }, { status: 400 });
      return pngResponse(
        s.spritePng(req.params.cat, req.params.id, path),
        `${req.params.id}/${path}`,
      );
    }),
    "/wz/anim/:cat/:id/:action": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const frames = s.animManifest(
        req.params.cat,
        req.params.id,
        req.params.action,
        "/wz/sprite",
      );
      if (!frames.length) {
        return Response.json(
          { error: `no animation ${req.params.action}` },
          { status: 404 },
        );
      }
      return jsonNoStore({
        category: req.params.cat,
        id: req.params.id,
        action: req.params.action,
        frames,
      });
    }),
    "/wz/raw/:cat/:id/*": (req: any) => {
      const s = getStore();
      if (!s) return noClient();
      const path = tail(req, 4);
      const found = s.image(req.params.cat, req.params.id);
      if (!found)
        return Response.json({ error: "image not found" }, { status: 404 });
      const node = path ? found.image.parse().get(path) : found.image.parse();
      if (!node)
        return Response.json({ error: "path not found" }, { status: 404 });
      return Response.json(toJson(node));
    },
    "/wz/item/:id/:field": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return Response.json({ error: "bad id" }, { status: 400 });
      const wantMeta = req.params.field === "meta";
      const { png, meta } = findItemField(
        s,
        id,
        wantMeta ? "icon" : req.params.field,
      );
      if (wantMeta) return Response.json({ id, ...(meta ?? {}) });
      return pngResponse(png, `Item ${id}/${req.params.field}`);
    }),
    "/wz/item/:id/:field/:frame": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const id = Number(req.params.id);
      const sid = String(id).padStart(8, "0");
      const fr = req.params.frame;
      for (const f of s.files("Item")) {
        for (const sub of f.root.subdirs.values()) {
          for (const img of sub.images.values()) {
            const root = img.parse();
            const e = root.child(sid) ?? root.child(String(id));
            if (e instanceof WzSubProperty) {
              const node = e.child(req.params.field)?.child(fr) ?? e.child("info")?.child(req.params.field)?.child(fr);
              const c = resolveCanvas(node ?? null, (cat, i) => s.image(cat, i));
              if (c instanceof WzCanvasProperty) {
                return pngResponse(canvasToPng(c, img.file.reader.key), `Item ${id}/${req.params.field}/${fr}`);
              }
            }
          }
        }
      }
      return Response.json({ error: "not found" }, { status: 404 });
    }),
    "/wz/skill/:id/:field": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      return pngResponse(
        findSkillField(s, req.params.id, req.params.field, 0),
        `Skill ${req.params.id}/${req.params.field}`,
      );
    }),
    "/wz/skill/:id/:field/:frame": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      return pngResponse(
        findSkillField(
          s,
          req.params.id,
          req.params.field,
          Number(req.params.frame),
        ),
          `Skill ${req.params.id}/${req.params.field}/${req.params.frame}`,
      );
    }),
    "/wz/map/:id/back/*": (req: any) => {
      const s = getStore();
      if (!s) return noClient();
      const path = tail(req, 4);
      if (!path)
        return Response.json({ error: "missing path" }, { status: 400 });
      const [file, no] = path.split("/");
      let bimg: WzImage | null = null;
      const imgName = file.endsWith(".img") ? file : `${file}.img`;
      for (const mf of s.files("Map")) {
        const candidate = mf.root.get(`Back/${imgName}`);
        if (candidate instanceof WzImage) {
          bimg = candidate;
          break;
        }
      }
      if (!bimg)
        return Response.json({ error: "back not found" }, { status: 404 });
      const broot = bimg.parse();
      const node = broot.get("back")?.get(String(no)) ?? broot.get("ani")?.get(String(no)) ?? broot.get(String(no));
      const targetNode = node instanceof WzSubProperty && !(node instanceof WzCanvasProperty) ? (node.get("0") ?? node) : node;
      const c = resolveCanvas(targetNode ?? null, (cat, img) => s.image(cat, img));
      if (!(c instanceof WzCanvasProperty))
        return Response.json({ error: "no canvas" }, { status: 404 });
      const bKey = c.image?.file?.reader?.key ?? bimg.file.reader.key;
      return pngResponse(canvasToPng(c, bKey), path);
    },
    "/wz/map/:id/minimap": (req: any) => {
      const s = getStore();
      if (!s) return noClient();
      const img = getMaps(s).image(Number(req.params.id));
      if (!img)
        return Response.json({ error: "map not found" }, { status: 404 });
      const mini = img.parse().child("miniMap");
      if (!(mini instanceof WzSubProperty))
        return Response.json({ error: "no miniMap" }, { status: 404 });
      // The minimap canvas is either a direct child "canvas" or the first canvas child.
      let c: WzCanvasProperty | null = null;
      for (const ch of mini.children()) {
        if (ch instanceof WzCanvasProperty) {
          c = ch;
          break;
        }
        if (ch instanceof WzSubProperty) {
          for (const cc of ch.children()) {
            if (cc instanceof WzCanvasProperty) {
              c = cc;
              break;
            }
          }
          if (c) break;
        }
      }
      const targetW = c?.width ?? Math.min(220, Math.round(Number((mini.child("width") as any)?.value ?? 220) / 16));
      const targetH = c?.height ?? Math.max(50, Math.round(Number((mini.child("height") as any)?.value ?? 120) / 16));

      // Generate real-texture terrain minimap matching current in-game tiles and objects
      const realPng = renderMinimapPng(getMaps(s), Number(req.params.id), s, targetW, targetH);
      if (realPng) return pngResponse(realPng, `map ${req.params.id} minimap`);

      if (!c)
        return Response.json({ error: "no minimap canvas" }, { status: 404 });
      return pngResponse(
        canvasToPng(c, img.file.reader.key),
        `map ${req.params.id} minimap`,
      );
    },
    "/wz/map/:id/render": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const m = getMaps(s);
      if (!m.image(Number(req.params.id)))
        return Response.json({ error: "map not found" }, { status: 404 });
      return pngResponse(
        renderMap(m, Number(req.params.id), s),
        `map ${req.params.id}`,
      );
    }),
    "/wz/ui/:img/*": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      return pngResponse(
        s.spritePng("UI", req.params.img, tail(req, 3)),
        `UI ${req.params.img}`,
      );
    }),
    "/wz/char": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const url = new URL(req.url);
      const eq = url.searchParams.get("eq") ?? "";
      if (!eq) return Response.json({ error: "missing eq" }, { status: 400 });
      return pngResponse(
        composeCharacter(
          s,
          eq.split(",").map(Number).filter(Boolean),
          url.searchParams.get("action") ?? "stand1",
          Number(url.searchParams.get("frame") ?? 0),
          url.searchParams.get("flip") === "1",
          url.searchParams.get("expr") ?? "default",
          Number(url.searchParams.get("ef") ?? 0),
        ),
        `char ${eq}`,
      );
    }),
    "/wz/data/mob/:id": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const d = mobData(s, Number(req.params.id));
      return d
        ? jsonNoStore(d)
        : Response.json({ error: "mob not found" }, { status: 404 });
    }),
    "/wz/data/map/:id": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const d = mapData(s, Number(req.params.id));
      return d
        ? jsonNoStore(d)
        : Response.json({ error: "map not found" }, { status: 404 });
    }),
    "/wz/data/skills": guard(() => {
      const s = getStore();
      if (!s) return noClient();
      try {
        return jsonNoStore(skillsData(s));
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }
    }),
    "/wz/data/fx": guard(() => {
      const s = getStore();
      return s ? jsonNoStore(fxData(s)) : noClient();
    }),
    "/wz/data/ui": guard(() => {
      const s = getStore();
      return s ? jsonNoStore(uiData(s)) : noClient();
    }),
    "/wz/data/windows": guard(() => {
      const s = getStore();
      return s ? jsonNoStore(windowsData(s)) : noClient();
    }),
    "/wz/data/items": guard(() => {
      const s = getStore();
      return s ? jsonNoStore(itemsData(s)) : noClient();
    }),
    "/wz/data/item-eff/:id": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const d = itemEffData(s, Number(req.params.id));
      return jsonNoStore(d ?? null);
    }),
    "/wz/item-eff/:id/:act/:fr": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const png = itemEffPng(s, Number(req.params.id), req.params.act, req.params.fr);
      return pngResponse(png, `item-eff ${req.params.id}`);
    }),
    "/wz/data/shadow-partner": guard(() => {
      const s = getStore();
      return s ? jsonNoStore(shadowPartnerData(s)) : noClient();
    }),
    "/wz/shadow-partner/:act/:fr": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const png = shadowPartnerPng(s, req.params.act, req.params.fr);
      return pngResponse(png, `shadow-partner ${req.params.act}/${req.params.fr}`);
    }),
    "/wz/data/pets/list": guard(() => {
      const s = getStore();
      return s ? jsonNoStore(petList(s)) : noClient();
    }),
    "/wz/data/pet/:id": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const d = petData(s, Number(req.params.id));
      return d ? jsonNoStore(d) : Response.json({ error: "pet not found" }, { status: 404 });
    }),
    "/wz/pet/:id/:act/:fr": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const png = petFramePng(s, Number(req.params.id), req.params.act, req.params.fr);
      return pngResponse(png, `pet ${req.params.id}/${req.params.act}/${req.params.fr}`);
    }),
    "/wz/pet-icon/:id": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const png = petIconPng(s, Number(req.params.id));
      return pngResponse(png, `pet-icon ${req.params.id}`);
    }),
    "/api/spacetimedb/status": async () => {
      const spacetimeUrl = await getSpacetimeUrl();
      let alive = false;
      try {
        const res = await fetch(`${spacetimeUrl}/v1/ping`, { signal: AbortSignal.timeout(1000) });
        alive = res.ok;
      } catch {}
      return Response.json({
        spacetimedb: {
          url: spacetimeUrl,
          connected: alive,
        },
        onlinePlayers: wsPlayers.size,
        activeMaps: new Set([...wsPlayers.values()].map((p) => p.mapId)).size,
      });
    },
    "/api/gm/players": async () => {
      const seen = new Set<string>();
      const playerList: any[] = [];
      for (const [_, p] of wsPlayers.entries()) {
        const key = (p.username && p.username !== "guest" ? `u:${p.username.toLowerCase()}` : `n:${p.name.toLowerCase()}`);
        if (seen.has(key)) continue;
        seen.add(key);
        playerList.push({
          id: p.id,
          name: p.name,
          mapId: p.mapId,
          x: p.x,
          y: p.y,
          anim: p.anim,
          frame: p.frame,
          face: p.face,
          look: p.look,
        });
      }
      return Response.json({
        ok: true,
        onlineCount: playerList.length,
        activeMaps: new Set(playerList.map((p) => p.mapId)).size,
        players: playerList,
      });
    },
    "/api/gm/action": async (req: any) => {
      try {
        const body = await req.json();
        const action = body.action;
        const targetId = body.targetId;
        const targetName = (body.targetName || "").toLowerCase().trim();

        if (action === "notice") {
          const text = String(body.text || "").slice(0, 150);
          const noticeMsg = JSON.stringify({ t: "chat", kind: "notice", text: `[GM Notice] ${text}` });
          for (const [c] of wsPlayers) {
            try { c.send(noticeMsg); } catch {}
          }
          return Response.json({ ok: true });
        }

        let targetWs: any = null;
        let targetSession: PlayerSession | null = null;
        for (const [ws, session] of wsPlayers) {
          if ((targetId && session.id === targetId) || (targetName && session.name.toLowerCase().trim() === targetName)) {
            targetWs = ws;
            targetSession = session;
            break;
          }
        }

        if (!targetWs || !targetSession) {
          return Response.json({ ok: false, error: "Target player not found or offline" }, { status: 404 });
        }

        if (action === "kick") {
          try {
            targetWs.send(JSON.stringify({ t: "chat", kind: "notice", text: "[GM] You have been disconnected by a GameMaster." }));
            targetWs.close(1000, "Kicked by GM");
          } catch {}
          wsPlayers.delete(targetWs);
          return Response.json({ ok: true });
        } else if (action === "summon") {
          const mapId = Number(body.mapId || 910000000);
          const x = Number(body.x || 0);
          const y = Number(body.y || 0);
          try {
            targetWs.send(JSON.stringify({ t: "force_warp", mapId, x, y, reason: "Summoned to GameMaster location" }));
          } catch {}
          return Response.json({ ok: true });
        } else if (action === "heal") {
          try {
            targetWs.send(JSON.stringify({ t: "gm_heal", reason: "GM Blessing" }));
          } catch {}
          return Response.json({ ok: true });
        } else if (action === "meso") {
          const amount = Number(body.amount || 1000000);
          try {
            targetWs.send(JSON.stringify({ t: "gm_meso", amount }));
          } catch {}
          return Response.json({ ok: true });
        }

        return Response.json({ ok: false, error: "Unknown GM action" }, { status: 400 });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Action failed" }, { status: 500 });
      }
    },
    "/api/auth/register": async (req: any) => {
      try {
        const body = await req.json();
        const username = String(body.username || "").trim().toLowerCase();
        const password = String(body.password || "");
        if (!/^[a-z0-9_]{3,16}$/.test(username)) {
          return Response.json({ ok: false, error: "Username must be 3-16 alphanumeric characters" }, { status: 400 });
        }
        if (password.length < 4) {
          return Response.json({ ok: false, error: "Password must be at least 4 characters" }, { status: 400 });
        }
        const existing = await spacetimeSql(`SELECT username FROM user WHERE username = '${username}';`);
        if (existing.length > 0) {
          return Response.json({ ok: false, error: "Username already taken" }, { status: 409 });
        }
        const passHash = hashPassword(password);
        await spacetimeCall("register_user", [username, passHash]);
        return Response.json({ ok: true, username });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Registration failed" }, { status: 500 });
      }
    },
    "/api/auth/login": async (req: any) => {
      try {
        const body = await req.json();
        const username = String(body.username || "").trim().toLowerCase();
        const password = String(body.password || "");
        if (!username || !password) {
          return Response.json({ ok: false, error: "Username and password required" }, { status: 400 });
        }
        const passHash = hashPassword(password);
        const rows = await spacetimeSql(`SELECT username, password_hash FROM user WHERE username = '${username}';`);
        if (!rows.length || rows[0][1] !== passHash) {
          return Response.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
        }
        return Response.json({ ok: true, username });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Login failed" }, { status: 500 });
      }
    },
    "/api/characters": async (req: any) => {
      try {
        const url = new URL(req.url);
        const username = String(url.searchParams.get("username") || "").trim().toLowerCase();
        if (!username) return Response.json({ ok: false, error: "Username required" }, { status: 400 });
        const rows = await spacetimeSql(`SELECT name, username, class_id, gender, level, exp, hp, max_hp, mp, max_mp, meso, map_id, x, y, look, stats, inventory, equipment, skills, updated_at FROM character WHERE username = '${username}';`);
        const characters = rows.map((r) => ({
          name: r[0],
          username: r[1],
          classId: r[2],
          gender: r[3],
          level: Number(r[4] || 1),
          exp: Number(r[5] || 0),
          hp: Number(r[6] || 50),
          maxHp: Number(r[7] || 50),
          mp: Number(r[8] || 20),
          maxMp: Number(r[9] || 20),
          meso: Number(r[10] || 0),
          mapId: (!r[11] || Number(r[11]) === 0) ? 910000000 : Number(r[11]),
          x: Number(r[12] || 0),
          y: Number(r[13] || 0),
          look: typeof r[14] === "string" ? JSON.parse(r[14] || "[]") : (r[14] || []),
          stats: typeof r[15] === "string" ? JSON.parse(r[15] || "{}") : (r[15] || {}),
          inventory: typeof r[16] === "string" ? JSON.parse(r[16] || "[]") : (r[16] || []),
          equipment: typeof r[17] === "string" ? JSON.parse(r[17] || "{}") : (r[17] || {}),
          skills: typeof r[18] === "string" ? JSON.parse(r[18] || "{}") : (r[18] || {}),
          updatedAt: Number(r[19] || 0),
        }));
        return Response.json({ ok: true, characters });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to fetch characters" }, { status: 500 });
      }
    },
    "/api/characters/check-name": async (req: any) => {
      try {
        const url = new URL(req.url);
        const name = String(url.searchParams.get("name") || "").trim();
        if (!/^[a-zA-Z0-9]{2,12}$/.test(name)) {
          return Response.json({ available: false, error: "Name must be 2-12 alphanumeric characters" });
        }
        const rows = await spacetimeSql(`SELECT name FROM character WHERE name = '${name}';`);
        return Response.json({ available: rows.length === 0 });
      } catch (e: any) {
        return Response.json({ available: false, error: e?.message });
      }
    },
    "/api/characters/create": async (req: any) => {
      try {
        const body = await req.json();
        const username = String(body.username || "").trim().toLowerCase();
        const name = String(body.name || "").trim();
        const classId = String(body.classId || "beginner").toLowerCase();
        const gender = String(body.gender || "male");
        const look = Array.isArray(body.look) ? body.look : [2000, 12000, 20000, 30030];
        const stats = body.stats || {};
        const equipment = body.equipment || {};

        if (!username) return Response.json({ ok: false, error: "Username required" }, { status: 400 });
        if (!/^[a-zA-Z0-9]{2,12}$/.test(name)) {
          return Response.json({ ok: false, error: "Name must be 2-12 alphanumeric characters" }, { status: 400 });
        }
        const existing = await spacetimeSql(`SELECT name FROM character WHERE name = '${name}';`);
        if (existing.length > 0) {
          return Response.json({ ok: false, error: "Character name already taken" }, { status: 409 });
        }
        await spacetimeCall("create_char", [
          username,
          name,
          classId,
          gender,
          JSON.stringify(look),
          JSON.stringify(stats),
          JSON.stringify(equipment),
        ]);
        try {
          await spacetimeSql(`UPDATE character SET map_id = 910000000 WHERE name = '${name}';`);
        } catch {}
        return Response.json({ ok: true, name });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to create character" }, { status: 500 });
      }
    },
    "/api/characters/rename": async (req: any) => {
      try {
        const body = await req.json();
        const oldName = String(body.oldName || "").trim();
        const newName = String(body.newName || "").trim();
        if (!oldName || !newName) {
          return Response.json({ ok: false, error: "Old and new name required" }, { status: 400 });
        }
        if (!/^[a-zA-Z0-9_\-]{2,16}$/.test(newName)) {
          return Response.json({ ok: false, error: "New name must be 2-16 alphanumeric characters" }, { status: 400 });
        }
        if (oldName !== newName) {
          const existing = await spacetimeSql(`SELECT name FROM character WHERE name = '${newName}';`);
          if (existing.length > 0) {
            return Response.json({ ok: false, error: "Character name already taken" }, { status: 409 });
          }
          const rows = await spacetimeSql(`SELECT username, class_id, gender, level, exp, hp, max_hp, mp, max_mp, meso, map_id, x, y, look, stats, inventory, equipment, skills FROM character WHERE name = '${oldName}';`);
          if (rows.length > 0) {
            const [
              username, classId, gender, level, exp, hp, maxHp, mp, maxMp, meso, mapId, x, y, look, stats, inventory, equipment, skills
            ] = rows[0];
            await spacetimeCall("create_char", [
              username,
              newName,
              classId,
              gender,
              look || "[]",
              stats || "{}",
              equipment || "{}"
            ]);
            await spacetimeCall("save_char", [
              newName,
              Number(level || 1),
              Number(exp || 0),
              Number(hp || 50),
              Number(maxHp || 50),
              Number(mp || 20),
              Number(maxMp || 20),
              Number(meso || 0),
              Number(mapId || 910000000),
              Number(x || 0),
              Number(y || 0),
              look || "[]",
              stats || "{}",
              inventory || "[]",
              equipment || "{}",
              skills || "{}"
            ]);
            await spacetimeCall("delete_char", [oldName]);
          }
        }
        return Response.json({ ok: true, name: newName });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to rename character" }, { status: 500 });
      }
    },
    "/api/characters/delete": async (req: any) => {
      try {
        const body = await req.json();
        const username = String(body.username || "").trim().toLowerCase();
        const name = String(body.name || "").trim();
        const rows = await spacetimeSql(`SELECT username FROM character WHERE name = '${name}';`);
        if (!rows.length || rows[0][0] !== username) {
          return Response.json({ ok: false, error: "Character not found or unauthorized" }, { status: 403 });
        }
        await spacetimeCall("delete_char", [name]);
        return Response.json({ ok: true });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to delete character" }, { status: 500 });
      }
    },
    "/api/characters/save": async (req: any) => {
      try {
        const body = await req.json();
        const name = String(body.name || "").trim();
        if (!name) return Response.json({ ok: false, error: "Character name required" }, { status: 400 });
        await spacetimeCall("save_char", [
          name,
          Number(body.level || 1),
          Number(body.exp || 0),
          Number(body.hp || 50),
          Number(body.maxHp || 50),
          Number(body.mp || 20),
          Number(body.maxMp || 20),
          Number(body.meso || 0),
          Number(body.mapId || 910000000),
          Number(body.x || 0),
          Number(body.y || 0),
          JSON.stringify(body.look || []),
          JSON.stringify(body.stats || {}),
          JSON.stringify(body.inventory || []),
          JSON.stringify(body.equipment || {}),
          JSON.stringify(body.skills || {}),
        ]);
        return Response.json({ ok: true });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to save character" }, { status: 500 });
      }
    },
    "/api/guild/list": () => {
      const all = loadGuilds();
      const list = [...all.values()].map((g) => {
        const onlineCount = g.members.filter((m) =>
          [...wsPlayers.values()].some((p) => p.name.toLowerCase() === m.name.toLowerCase())
        ).length;
        return {
          id: g.id,
          name: g.name,
          master: g.master,
          notice: g.notice,
          level: g.level,
          gp: g.gp,
          capacity: g.capacity,
          members: g.members,
          memberCount: g.members.length,
          onlineCount,
          emblem: g.emblem,
          createdAt: g.createdAt,
        };
      });
      return Response.json({ ok: true, guilds: list });
    },
    "/api/guild/:id": (req: any) => {
      const all = loadGuilds();
      const g = all.get(req.params.id);
      if (!g) return Response.json({ ok: false, error: "Guild not found" }, { status: 404 });
      const onlineNames = new Set([...wsPlayers.values()].map((p) => p.name.toLowerCase()));
      const guildWithOnline = {
        ...g,
        members: g.members.map((m) => ({
          ...m,
          online: onlineNames.has(m.name.toLowerCase()),
        })),
      };
      return Response.json({ ok: true, guild: guildWithOnline });
    },
    "/api/guild/create": async (req: any) => {
      try {
        const body = await req.json();
        const masterName = String(body.masterName || "").trim();
        const guildName = String(body.guildName || "").trim();
        if (!masterName) return Response.json({ ok: false, error: "Master name required" }, { status: 400 });
        if (!/^[a-zA-Z0-9 ]{2,12}$/.test(guildName)) {
          return Response.json({ ok: false, error: "Guild name must be 2-12 alphanumeric characters" }, { status: 400 });
        }
        const all = loadGuilds();
        for (const g of all.values()) {
          if (g.name.toLowerCase() === guildName.toLowerCase()) {
            return Response.json({ ok: false, error: "Guild name already exists" }, { status: 409 });
          }
          if (g.members.some((m) => m.name.toLowerCase() === masterName.toLowerCase())) {
            return Response.json({ ok: false, error: "You are already in a guild" }, { status: 400 });
          }
        }
        const emblem = body.emblem || { bgShape: 0, bgColor: 0, symbolShape: 0, symbolColor: 0 };
        const newGuild: ServerGuild = {
          id: "g_" + crypto.randomUUID().slice(0, 8),
          name: guildName,
          master: masterName,
          notice: `Welcome to ${guildName}! Honour and glory to our guild.`,
          level: 1,
          gp: 500,
          capacity: 20,
          emblem,
          ranks: ["Master", "Jr.Master", "Veteran", "Member", "Recruit"],
          members: [
            {
              name: masterName,
              level: Number(body.level || 1),
              job: String(body.job || "Beginner"),
              rank: 1,
              contribution: 500,
              online: true,
            },
          ],
          createdAt: Date.now(),
        };
        all.set(newGuild.id, newGuild);
        saveGuilds();

        // Update player session if online
        for (const [_, p] of wsPlayers) {
          if (p.name.toLowerCase() === masterName.toLowerCase()) {
            p.guildId = newGuild.id;
            p.guildName = newGuild.name;
            p.guildEmblem = newGuild.emblem;
          }
        }

        const alertMsg = JSON.stringify({
          t: "chat",
          id: "sys",
          name: "Guild Registry",
          text: `★ Guild [${newGuild.name}] has been founded by ${masterName}!`,
          kind: "notice",
        });
        for (const [c] of wsPlayers) c.send(alertMsg);

        return Response.json({ ok: true, guild: newGuild });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to create guild" }, { status: 500 });
      }
    },
    "/api/guild/join": async (req: any) => {
      try {
        const body = await req.json();
        const charName = String(body.characterName || "").trim();
        const guildId = String(body.guildId || "").trim();
        const all = loadGuilds();
        const g = all.get(guildId);
        if (!g) return Response.json({ ok: false, error: "Guild not found" }, { status: 404 });
        if (g.members.length >= g.capacity) {
          return Response.json({ ok: false, error: "Guild has reached maximum member capacity" }, { status: 400 });
        }
        for (const other of all.values()) {
          if (other.members.some((m) => m.name.toLowerCase() === charName.toLowerCase())) {
            return Response.json({ ok: false, error: "Character is already in a guild" }, { status: 400 });
          }
        }
        const newMember: ServerGuildMember = {
          name: charName,
          level: Number(body.level || 1),
          job: String(body.job || "Beginner"),
          rank: 5,
          contribution: 0,
          online: true,
        };
        g.members.push(newMember);
        saveGuilds();

        for (const [_, p] of wsPlayers) {
          if (p.name.toLowerCase() === charName.toLowerCase()) {
            p.guildId = g.id;
            p.guildName = g.name;
            p.guildEmblem = g.emblem;
          }
        }

        const alertMsg = JSON.stringify({
          t: "chat",
          id: "sys",
          name: g.name,
          text: `[Guild] ${charName} has joined the guild! Welcome!`,
          kind: "guild",
          guildId: g.id,
        });
        for (const [c, p] of wsPlayers) {
          if (p.guildId === g.id) c.send(alertMsg);
        }

        return Response.json({ ok: true, guild: g });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to join guild" }, { status: 500 });
      }
    },
    "/api/guild/leave": async (req: any) => {
      try {
        const body = await req.json();
        const charName = String(body.characterName || "").trim();
        const guildId = String(body.guildId || "").trim();
        const all = loadGuilds();
        const g = all.get(guildId);
        if (!g) return Response.json({ ok: false, error: "Guild not found" }, { status: 404 });
        const idx = g.members.findIndex((m) => m.name.toLowerCase() === charName.toLowerCase());
        if (idx < 0) return Response.json({ ok: false, error: "Not a member of this guild" }, { status: 400 });

        const isMaster = g.master.toLowerCase() === charName.toLowerCase();
        if (isMaster) {
          if (g.members.length === 1) {
            all.delete(g.id);
            saveGuilds();
            return Response.json({ ok: true, disbanded: true });
          } else {
            g.members.splice(idx, 1);
            g.members.sort((a, b) => a.rank - b.rank);
            g.members[0].rank = 1;
            g.master = g.members[0].name;
          }
        } else {
          g.members.splice(idx, 1);
        }
        saveGuilds();

        for (const [_, p] of wsPlayers) {
          if (p.name.toLowerCase() === charName.toLowerCase()) {
            p.guildId = undefined;
            p.guildName = undefined;
            p.guildEmblem = undefined;
          }
        }
        return Response.json({ ok: true });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to leave guild" }, { status: 500 });
      }
    },
    "/api/guild/expel": async (req: any) => {
      try {
        const body = await req.json();
        const actorName = String(body.actorName || "").trim();
        const targetName = String(body.targetName || "").trim();
        const guildId = String(body.guildId || "").trim();
        const all = loadGuilds();
        const g = all.get(guildId);
        if (!g) return Response.json({ ok: false, error: "Guild not found" }, { status: 404 });
        const actor = g.members.find((m) => m.name.toLowerCase() === actorName.toLowerCase());
        if (!actor || actor.rank > 2) {
          return Response.json({ ok: false, error: "Only Master or Jr.Master can expel members" }, { status: 403 });
        }
        const target = g.members.find((m) => m.name.toLowerCase() === targetName.toLowerCase());
        if (!target) return Response.json({ ok: false, error: "Member not in guild" }, { status: 404 });
        if (target.rank <= actor.rank) {
          return Response.json({ ok: false, error: "Cannot expel member with equal or higher rank" }, { status: 403 });
        }
        g.members = g.members.filter((m) => m.name.toLowerCase() !== targetName.toLowerCase());
        saveGuilds();
        return Response.json({ ok: true });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to expel member" }, { status: 500 });
      }
    },
    "/api/guild/rank": async (req: any) => {
      try {
        const body = await req.json();
        const actorName = String(body.actorName || "").trim();
        const targetName = String(body.targetName || "").trim();
        const guildId = String(body.guildId || "").trim();
        const rank = Number(body.rank || 4) as 1 | 2 | 3 | 4 | 5;
        const all = loadGuilds();
        const g = all.get(guildId);
        if (!g) return Response.json({ ok: false, error: "Guild not found" }, { status: 404 });
        const actor = g.members.find((m) => m.name.toLowerCase() === actorName.toLowerCase());
        if (!actor || actor.rank > 2) {
          return Response.json({ ok: false, error: "Permission denied" }, { status: 403 });
        }
        const target = g.members.find((m) => m.name.toLowerCase() === targetName.toLowerCase());
        if (!target) return Response.json({ ok: false, error: "Member not found" }, { status: 404 });
        if (rank === 1 && actor.rank !== 1) {
          return Response.json({ ok: false, error: "Only current Master can transfer leadership" }, { status: 403 });
        }
        if (rank === 1) {
          actor.rank = 2;
          target.rank = 1;
          g.master = target.name;
        } else {
          target.rank = rank;
        }
        saveGuilds();
        return Response.json({ ok: true });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to change rank" }, { status: 500 });
      }
    },
    "/api/guild/notice": async (req: any) => {
      try {
        const body = await req.json();
        const actorName = String(body.actorName || "").trim();
        const guildId = String(body.guildId || "").trim();
        const notice = String(body.notice || "").trim().slice(0, 120);
        const all = loadGuilds();
        const g = all.get(guildId);
        if (!g) return Response.json({ ok: false, error: "Guild not found" }, { status: 404 });
        const actor = g.members.find((m) => m.name.toLowerCase() === actorName.toLowerCase());
        if (!actor || actor.rank > 2) {
          return Response.json({ ok: false, error: "Only Master or Jr.Master can edit guild notice" }, { status: 403 });
        }
        g.notice = notice;
        saveGuilds();

        const alertMsg = JSON.stringify({
          t: "chat",
          id: "sys",
          name: g.name,
          text: `[Guild Notice] ${notice}`,
          kind: "guild",
          guildId: g.id,
        });
        for (const [c, p] of wsPlayers) {
          if (p.guildId === g.id) c.send(alertMsg);
        }

        return Response.json({ ok: true, notice });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to update notice" }, { status: 500 });
      }
    },
    "/api/guild/emblem": async (req: any) => {
      try {
        const body = await req.json();
        const actorName = String(body.actorName || "").trim();
        const guildId = String(body.guildId || "").trim();
        const emblem = body.emblem;
        const all = loadGuilds();
        const g = all.get(guildId);
        if (!g) return Response.json({ ok: false, error: "Guild not found" }, { status: 404 });
        const actor = g.members.find((m) => m.name.toLowerCase() === actorName.toLowerCase());
        if (!actor || actor.rank !== 1) {
          return Response.json({ ok: false, error: "Only Guild Master can alter the guild emblem" }, { status: 403 });
        }
        g.emblem = emblem;
        saveGuilds();

        for (const [_, p] of wsPlayers) {
          if (p.guildId === g.id) p.guildEmblem = emblem;
        }

        return Response.json({ ok: true, emblem });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to update emblem" }, { status: 500 });
      }
    },
    "/api/guild/expand": async (req: any) => {
      try {
        const body = await req.json();
        const actorName = String(body.actorName || "").trim();
        const guildId = String(body.guildId || "").trim();
        const all = loadGuilds();
        const g = all.get(guildId);
        if (!g) return Response.json({ ok: false, error: "Guild not found" }, { status: 404 });
        const actor = g.members.find((m) => m.name.toLowerCase() === actorName.toLowerCase());
        if (!actor || actor.rank !== 1) {
          return Response.json({ ok: false, error: "Only Guild Master can expand guild capacity" }, { status: 403 });
        }
        if (g.capacity >= 100) {
          return Response.json({ ok: false, error: "Guild is already at maximum capacity (100 members)" }, { status: 400 });
        }
        g.capacity += 10;
        saveGuilds();
        return Response.json({ ok: true, newCapacity: g.capacity });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to expand capacity" }, { status: 500 });
      }
    },
    "/api/guild/ranks": async (req: any) => {
      try {
        const body = await req.json();
        const actorName = String(body.actorName || "").trim();
        const guildId = String(body.guildId || "").trim();
        const ranks = body.ranks;
        const all = loadGuilds();
        const g = all.get(guildId);
        if (!g) return Response.json({ ok: false, error: "Guild not found" }, { status: 404 });
        const actor = g.members.find((m) => m.name.toLowerCase() === actorName.toLowerCase());
        if (!actor || actor.rank !== 1) {
          return Response.json({ ok: false, error: "Only Guild Master can rename rank titles" }, { status: 403 });
        }
        if (Array.isArray(ranks) && ranks.length === 5) {
          g.ranks = ranks.map((r) => String(r || "").slice(0, 10)) as [string, string, string, string, string];
          saveGuilds();
        }
        return Response.json({ ok: true, ranks: g.ranks });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "Failed to rename ranks" }, { status: 500 });
      }
    },
  },
  // Unmatched requests: upgrade websocket or serve static files
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const shortId = "P-" + crypto.randomUUID().slice(0, 4).toUpperCase();
      const ok = srv.upgrade(req, {
        data: { id: shortId },
      });
      if (ok) return undefined;
    }
    const rel = decodeURIComponent(url.pathname);
    if (rel.includes("\0") || rel.includes(".."))
      return new Response("Forbidden", { status: 403 });
    const base = pathResolve(ROOT);
    const target = pathResolve(ROOT, "." + rel);
    if (!target.startsWith(base))
      return new Response("Forbidden", { status: 403 });
    const file = Bun.file(target);
    if (await file.exists()) return new Response(file);
    const pubRoot = pathResolve(ROOT, "public");
    const pub = pathResolve(pubRoot, "." + rel);
    if (pub.startsWith(pubRoot)) {
      const pf = Bun.file(pub);
      if (await pf.exists()) return new Response(pf);
    }
    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open(ws: any) {},
    message(ws: any, raw: string | Buffer) {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.t === "join") {
          const assignedId = ws.data?.id || ("P-" + crypto.randomUUID().slice(0, 4).toUpperCase());
          const username = msg.username ? String(msg.username).trim() : undefined;
          const charName = String(msg.name || assignedId).slice(0, 16);
          evictDuplicateSessions(ws, username, charName);
          const session: PlayerSession = {
            id: assignedId,
            username,
            name: charName,
            mapId: Number(msg.mapId || 910000000),
            x: Number(msg.x || 0),
            y: Number(msg.y || 0),
            face: Number(msg.face || 1),
            anim: String(msg.anim || "stand1"),
            frame: Number(msg.frame || 0),
            look: Array.isArray(msg.look) ? msg.look : [2000, 12000, 20000, 30030],
          };
          const g = getGuildForPlayer(session.name);
          if (g) {
            session.guildId = g.id;
            session.guildName = g.name;
            session.guildEmblem = g.emblem;
          }
          wsPlayers.set(ws, session);
          ws.send(JSON.stringify({ t: "welcome", id: session.id, guild: g }));
          const others = getMapRosterFor(ws, session);
          ws.send(JSON.stringify({ t: "roster", players: others }));
          const joinMsg = JSON.stringify({ t: "player_join", player: session });
          for (const [c, p] of wsPlayers) {
            if (c !== ws && p.mapId === session.mapId) c.send(joinMsg);
          }
        } else if (msg.t === "move") {
          const session = wsPlayers.get(ws);
          if (!session) return;
          session.x = Number(msg.x ?? session.x);
          session.y = Number(msg.y ?? session.y);
          session.face = Number(msg.face ?? session.face);
          session.anim = String(msg.anim ?? session.anim);
          session.frame = Number(msg.frame ?? session.frame);
          if (msg.mapId !== undefined) session.mapId = Number(msg.mapId);
          const moveMsg = JSON.stringify({
            t: "player_move",
            id: session.id,
            x: session.x,
            y: session.y,
            face: session.face,
            anim: session.anim,
            frame: session.frame,
          });
          for (const [c, p] of wsPlayers) {
            if (c !== ws && p.mapId === session.mapId) c.send(moveMsg);
          }
        } else if (msg.t === "action") {
          const session = wsPlayers.get(ws);
          if (!session) return;
          session.anim = String(msg.anim || session.anim);
          session.frame = Number(msg.frame ?? 0);
          session.face = Number(msg.face ?? session.face);
          session.x = Number(msg.x ?? session.x);
          session.y = Number(msg.y ?? session.y);
          const actMsg = JSON.stringify({
            t: "player_action",
            id: session.id,
            kind: msg.kind || "attack",
            skillId: msg.skillId || null,
            anim: session.anim,
            frame: session.frame,
            face: session.face,
            x: session.x,
            y: session.y,
          });
          for (const [c, p] of wsPlayers) {
            if (c !== ws && p.mapId === session.mapId) c.send(actMsg);
          }
        } else if (msg.t === "sync") {
          let session = wsPlayers.get(ws);
          const assignedId = ws.data?.id || ("P-" + crypto.randomUUID().slice(0, 4).toUpperCase());
          const username = msg.username ? String(msg.username).trim() : session?.username;
          const charName = String(msg.name || session?.name || assignedId).slice(0, 16);
          evictDuplicateSessions(ws, username, charName);
          if (!session) {
            session = {
              id: assignedId,
              username,
              name: charName,
              mapId: Number(msg.mapId || 910000000),
              x: Number(msg.x || 0),
              y: Number(msg.y || 0),
              face: Number(msg.face || 1),
              anim: String(msg.anim || "stand1"),
              frame: Number(msg.frame || 0),
              look: Array.isArray(msg.look) ? msg.look : [2000, 12000, 20000, 30030],
            };
            wsPlayers.set(ws, session);
          } else {
            if (username) session.username = username;
            if (msg.name) session.name = charName;
            if (msg.mapId !== undefined) session.mapId = Number(msg.mapId);
            if (msg.x !== undefined) session.x = Number(msg.x);
            if (msg.y !== undefined) session.y = Number(msg.y);
            if (msg.face !== undefined) session.face = Number(msg.face);
            if (msg.anim !== undefined) session.anim = String(msg.anim);
            if (msg.frame !== undefined) session.frame = Number(msg.frame);
            if (Array.isArray(msg.look)) session.look = msg.look;
          }
          const g = getGuildForPlayer(session.name);
          if (g) {
            session.guildId = g.id;
            session.guildName = g.name;
            session.guildEmblem = g.emblem;
          }
          ws.send(JSON.stringify({ t: "welcome", id: session.id, guild: g }));
          const others = getMapRosterFor(ws, session);
          ws.send(JSON.stringify({ t: "roster", players: others }));
          const joinMsg = JSON.stringify({ t: "player_join", player: session });
          for (const [c, p] of wsPlayers) {
            if (c !== ws && p.mapId === session.mapId) c.send(joinMsg);
          }
        } else if (msg.t === "map_change") {
          const session = wsPlayers.get(ws);
          if (!session) return;
          const oldMap = session.mapId;
          session.mapId = Number(msg.mapId);
          session.x = Number(msg.x ?? session.x);
          session.y = Number(msg.y ?? session.y);
          const leaveMsg = JSON.stringify({ t: "player_leave", id: session.id });
          for (const [c, p] of wsPlayers) {
            if (c !== ws && p.mapId === oldMap) c.send(leaveMsg);
          }
          const others = getMapRosterFor(ws, session);
          ws.send(JSON.stringify({ t: "roster", players: others }));
          const joinMsg = JSON.stringify({ t: "player_join", player: session });
          for (const [c, p] of wsPlayers) {
            if (c !== ws && p.mapId === session.mapId) c.send(joinMsg);
          }
        } else if (msg.t === "look") {
          const session = wsPlayers.get(ws);
          if (!session) return;
          session.look = Array.isArray(msg.look) ? msg.look : session.look;
          const lookMsg = JSON.stringify({ t: "player_look", id: session.id, look: session.look });
          for (const [c, p] of wsPlayers) {
            if (c !== ws && p.mapId === session.mapId) c.send(lookMsg);
          }
        } else if (msg.t === "name") {
          const session = wsPlayers.get(ws);
          if (!session) return;
          const clean = String(msg.name || "").trim().slice(0, 16);
          if (msg.username) session.username = String(msg.username).trim();
          if (clean) {
            evictDuplicateSessions(ws, session.username, clean);
            session.name = clean;
            const g = getGuildForPlayer(clean);
            if (g) {
              session.guildId = g.id;
              session.guildName = g.name;
              session.guildEmblem = g.emblem;
            } else {
              session.guildId = undefined;
              session.guildName = undefined;
              session.guildEmblem = undefined;
            }
            const renameMsg = JSON.stringify({
              t: "player_name",
              id: session.id,
              name: clean,
              guildName: session.guildName,
              guildEmblem: session.guildEmblem,
            });
            for (const [c, p] of wsPlayers) {
              if (p.mapId === session.mapId) c.send(renameMsg);
            }
          }
        } else if (msg.t === "chat") {
          const session = wsPlayers.get(ws);
          if (!session) return;
          const text = String(msg.text || "").slice(0, 200);
          if (!text) return;
          const kind = msg.kind || "say";
          const chatMsg = JSON.stringify({
            t: "chat",
            id: session.id,
            name: session.name,
            text,
            kind,
            itemLink: msg.itemLink || undefined,
            guildName: session.guildName,
          });
          if (kind === "notice" || msg.broadcast) {
            for (const [c] of wsPlayers) {
              c.send(chatMsg);
            }
          } else if (kind === "guild") {
            const gid = session.guildId || msg.guildId;
            for (const [c, p] of wsPlayers) {
              if (gid && p.guildId === gid) {
                c.send(chatMsg);
              }
            }
          } else if (kind === "whisper") {
            const target = String(msg.target || "").trim().toLowerCase();
            for (const [c, p] of wsPlayers) {
              if (c === ws || (target && p.name.toLowerCase() === target)) {
                c.send(chatMsg);
              }
            }
          } else {
            for (const [c, p] of wsPlayers) {
              if (p.mapId === session.mapId) c.send(chatMsg);
            }
          }
        } else if (msg.t === "ping") {
          ws.send(JSON.stringify({ t: "pong", sentAt: msg.sentAt }));
        }
      } catch {}
    },
    close(ws: any) {
      const session = wsPlayers.get(ws);
      if (session) {
        wsPlayers.delete(ws);
        const leaveMsg = JSON.stringify({ t: "player_leave", id: session.id, name: session.name });
        for (const [c, p] of wsPlayers) {
          if (p.mapId === session.mapId) c.send(leaveMsg);
        }
      }
    },
  },
});

console.log(`Maple Wayfarer running at http://localhost:${server.port}`);
const clientDir = findClientDir();
if (clientDir) {
  console.log(`MapleStory client found at: ${clientDir}`);
} else {
  console.warn(
    "No MapleStory client found. Set MAPLE_CLIENT_DIR to the folder holding Data/ or *.wz.",
  );
}

export { server };
