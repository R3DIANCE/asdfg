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
import { existsSync } from "node:fs";
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
      const node = broot.get("back")?.get(String(no)) ?? broot.get("ani")?.get(String(no)) ?? broot.get(String(no));
      const targetNode = node instanceof WzSubProperty && !(node instanceof WzCanvasProperty) ? (node.get("0") ?? node) : node;
      const c = resolveCanvas(targetNode ?? null, (cat, img) => s.image(cat, img));
      if (!(c instanceof WzCanvasProperty)) continue;
      backs.push({
        sprite: spriteOf(`/wz/map/${id}/back/${file}/${no}`, c, s),
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
      .map((p) => ({ x: p.x, y: p.y, to: p.to, side: p.side })),
    backs,
  };
}
function fxData(s: SpriteStore) {
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
  return {
    dmg: digits("NoRed1"),
    dmgFirst: digits("NoRed0"),
    hurt: digits("NoViolet1"),
    hurtFirst: digits("NoViolet0"),
    miss: pick("Effect", "BasicEff", "NoRed0/Miss"),
    levelUp,
    portal,
    meso: Array.from({ length: 10 }, (_, i) =>
      pick("Effect", "BasicEff", `NoBlue1/${i}`),
    ).filter(Boolean),
  };
}
function uiData(s: SpriteStore) {
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
  return {
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
}
function windowsData(s: SpriteStore) {
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
}
function itemsData(s: SpriteStore) {
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
        }
        if (!info) continue;
        const v = (k: string) => (info.child(k) as any)?.value ?? 0;
        const icon = resolveUol(info.child("icon"));
        if (!(icon instanceof WzCanvasProperty)) continue;
        gear.push({
          id,
          name: nameMap[String(id).replace(/^0+/, "") || "0"] ?? String(id),
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
      }
    }
  }
  return { gear, mats };
}
/** * Skill data for the client's skill browser. * * Shape matches what game.ts expects from the old skills.json: *   Record<skillId, { id, name, desc, icon, iconMouseOver, iconDisabled, effect, effect0, hit }> * Icons come from Skill.wz/<job>.img/skill/<id>/icon*; effect/hit frames from * the same entry's effect/hit subproperties. */ function skillsData(
  s: SpriteStore,
) {
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
      if (!(skill instanceof WzSubProperty)) continue;
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

        out[id] = {
          id,
          name,
          desc,
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
    }
  }
  if (out["0001000"]?.ball?.[0]) {
    out.snailShell = out["0001000"].ball[0];
  }
  return out;
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

function itemEffData(s: SpriteStore, id: number) {
  for (const f of s.files("Effect")) {
    const img = f.root.images.get("ItemEff.img");
    if (!img) continue;
    const root = img.parse();
    const itemNode = root.child(String(id));
    if (!itemNode) continue;
    const eff = itemNode.child("effect");
    if (!(eff instanceof WzSubProperty)) continue;
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
  }
  return null;
}

function itemEffPng(s: SpriteStore, id: number, act: string, fr: string): Buffer | null {
  for (const f of s.files("Effect")) {
    const img = f.root.images.get("ItemEff.img");
    if (!img) continue;
    const node = img.parse().get(String(id))?.get("effect")?.get(act)?.get(fr);
    const c = resolveCanvas(node ?? null, (cat, img) => s.image(cat, img));
    if (c instanceof WzCanvasProperty) {
      return canvasToPng(c, img.file.reader.key);
    }
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
  if (png) minimapPngCache.set(id, png);
  return png;
}
interface PlayerSession {
  id: string;
  name: string;
  mapId: number;
  x: number;
  y: number;
  face: number;
  anim: string;
  frame: number;
  look: number[];
}

const wsPlayers = new Map<any, PlayerSession>();

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
      return d ? jsonNoStore(d) : Response.json({ error: "no effect" }, { status: 404 });
    }),
    "/wz/item-eff/:id/:act/:fr": guard((req) => {
      const s = getStore();
      if (!s) return noClient();
      const png = itemEffPng(s, Number(req.params.id), req.params.act, req.params.fr);
      return pngResponse(png, `item-eff ${req.params.id}`);
    }),
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
          const session: PlayerSession = {
            id: assignedId,
            name: String(msg.name || assignedId).slice(0, 16),
            mapId: Number(msg.mapId || 910000000),
            x: Number(msg.x || 0),
            y: Number(msg.y || 0),
            face: Number(msg.face || 1),
            anim: String(msg.anim || "stand1"),
            frame: Number(msg.frame || 0),
            look: Array.isArray(msg.look) ? msg.look : [2000, 12000, 20000, 30030],
          };
          wsPlayers.set(ws, session);
          ws.send(JSON.stringify({ t: "welcome", id: session.id }));
          const others = [...wsPlayers.entries()]
            .filter(([c, p]) => c !== ws && p.mapId === session.mapId)
            .map(([_, p]) => p);
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
        } else if (msg.t === "sync") {
          let session = wsPlayers.get(ws);
          const assignedId = ws.data?.id || ("P-" + crypto.randomUUID().slice(0, 4).toUpperCase());
          if (!session) {
            session = {
              id: assignedId,
              name: String(msg.name || assignedId).slice(0, 16),
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
            if (msg.name) session.name = String(msg.name).slice(0, 16);
            if (msg.mapId !== undefined) session.mapId = Number(msg.mapId);
            if (msg.x !== undefined) session.x = Number(msg.x);
            if (msg.y !== undefined) session.y = Number(msg.y);
            if (msg.face !== undefined) session.face = Number(msg.face);
            if (msg.anim !== undefined) session.anim = String(msg.anim);
            if (msg.frame !== undefined) session.frame = Number(msg.frame);
            if (Array.isArray(msg.look)) session.look = msg.look;
          }
          ws.send(JSON.stringify({ t: "welcome", id: session.id }));
          const others = [...wsPlayers.entries()]
            .filter(([c, p]) => c !== ws && p.mapId === session.mapId)
            .map(([_, p]) => p);
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
          const others = [...wsPlayers.entries()]
            .filter(([c, p]) => c !== ws && p.mapId === session.mapId)
            .map(([_, p]) => p);
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
          if (clean) {
            session.name = clean;
            const renameMsg = JSON.stringify({ t: "player_name", id: session.id, name: clean });
            for (const [c, p] of wsPlayers) {
              if (p.mapId === session.mapId) c.send(renameMsg);
            }
          }
        } else if (msg.t === "chat") {
          const session = wsPlayers.get(ws);
          if (!session) return;
          const text = String(msg.text || "").slice(0, 100);
          if (!text) return;
          const chatMsg = JSON.stringify({
            t: "chat",
            id: session.id,
            name: session.name,
            text,
            kind: msg.kind || "say",
          });
          for (const [c, p] of wsPlayers) {
            if (p.mapId === session.mapId) c.send(chatMsg);
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
