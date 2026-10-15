import { ComponentBase } from "@orillusion/core";
import { Assets, json, type Sprite } from "./assets.ts";
import type { Renderer, Tex } from "./gpu.ts";
import { FootholdTree, airMove, groundMove, type Foothold, type Ladder } from "./physics.ts";
import { AH_TAX, AuctionHouse, goodsName, type Goods } from "./auction.ts";
import {
  GEAR, MATS, MOB_MAT, ORES, cubeCost, gearStats, makeGear, randomGearFor, rollPotential, recipeGearId, starCost, starMat, starRate,
  npcSellPrice, type Gear, type Recipe, type Slot, RARITY, isHoverItem,
} from "./items.ts";
import { DEFAULT_QUICK, ITEMS, SKILL, SKILL_DEFS, classFor, type ClassId, itemIconRaw, type Action, type SkillArt, type SkillDef } from "./skills.ts";

// ---------------------------------------------------------------- data types
interface Back { sprite: Sprite; x: number; y: number; rx: number; ry: number; cx: number; cy: number; type: number; a: number; flip: boolean; front: boolean }
export interface MapData {
  id: number; name: string; street: string; bgm: string; bgmUrl: string; mark: string;
  render: string; renderOrigin: { x: number; y: number };
  miniMap: { url: string; centerX: number; centerY: number; width: number; height: number; mag: number };
  footholds: Foothold[]; ladders: Ladder[];
  spawns: { id: number; x: number; y: number; fh: number; rx0: number; rx1: number }[];
  backs: Back[];
}
interface MobData { id: number; name: string; meta: any; books: Record<string, Sprite[]> }

export interface ItemEffFrame {
  url: string;
  w: number;
  h: number;
  ox: number;
  oy: number;
  delay?: number;
  z?: number;
  pos?: number;
  fixed?: boolean;
}
export interface ItemEffData {
  id: number;
  z: number;
  pos?: number;
  fixed?: boolean;
  actions: Record<string, ItemEffFrame[]>;
}

// World links and constants
export const FREE_MARKET_MAP = 910000000;
export const HUNTING_AREAS = [100010000, 100020000, 101010000, 100000000];

export const MAP_LINKS: Record<number, { left: number; right: number }> = {
  100010000: { left: FREE_MARKET_MAP, right: 100020000 },
  100020000: { left: FREE_MARKET_MAP, right: 101010000 },
  101010000: { left: FREE_MARKET_MAP, right: 100000000 },
  100000000: { left: FREE_MARKET_MAP, right: 100010000 },
  910000000: { left: 100010000, right: 100010000 },
};

export interface RemotePlayer {
  id: string;
  name: string;
  mapId: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  face: number;
  anim: string;
  frame: number;
  look: number[];
  balloon?: { text: string; t: number };
  lastTex?: Tex | null;
  attackTimer?: number;
  animTimer?: number;
}

const textTexCache = new Map<string, Tex>();
const textTexPending = new Set<string>();

const balloonSlices: Record<string, HTMLImageElement> = {};
let balloonSlicesLoaded = false;
let balloonSlicesLoading = false;

function loadBalloonSlices() {
  if (balloonSlicesLoaded || balloonSlicesLoading || typeof Image === "undefined") return;
  balloonSlicesLoading = true;
  const parts = ["nw", "n", "ne", "w", "c", "e", "sw", "s", "se", "arrow"];
  let loaded = 0;
  for (const p of parts) {
    const img = new Image();
    img.src = `/wz/ui/ChatBalloon/0/${p}`;
    img.onload = () => {
      loaded++;
      if (loaded === parts.length) {
        balloonSlicesLoaded = true;
        balloonSlicesLoading = false;
        // Invalidate fallback textures
        for (const [k] of textTexCache) {
          if (k.startsWith("balloon:")) textTexCache.delete(k);
        }
      }
    };
    img.onerror = () => {
      balloonSlicesLoading = false;
    };
    balloonSlices[p] = img;
  }
}
loadBalloonSlices();

function renderTextTexture(r: Renderer, text: string, type: "name" | "balloon"): Tex | null {
  const key = `${type}:${text}`;
  const hit = textTexCache.get(key);
  if (hit) return hit;
  if (textTexPending.has(key)) return null;
  textTexPending.add(key);

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (type === "name") {
      ctx.font = "bold 11px Tahoma, Arial, sans-serif";
      const tm = ctx.measureText(text);
      const tw = Math.ceil(tm.width);
      const padX = 6;
      const w = Math.max(24, tw + padX * 2);
      const h = 16;
      canvas.width = w;
      canvas.height = h;

      ctx.font = "bold 11px Tahoma, Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";

      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      ctx.beginPath();
      if ((ctx as any).roundRect) (ctx as any).roundRect(0, 0, w, h, 3);
      else ctx.rect(0, 0, w, h);
      ctx.fill();

      ctx.strokeStyle = "rgba(60, 60, 60, 0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, w / 2, h / 2 + 0.5);
    } else {
      ctx.font = "bold 12px Arial, Tahoma, sans-serif";
      const tm = ctx.measureText(text);
      const tw = Math.ceil(tm.width);

      const padX = 6;
      const contentW = Math.max(14, tw + padX * 2);
      const contentH = 14;

      const cornerW = 6;
      const cornerH = 6;
      const arrowW = 13;
      const arrowH = 13;

      const bubbleW = cornerW + contentW + cornerW;
      const bubbleH = cornerH + contentH + cornerH;
      const totalW = Math.max(bubbleW, arrowW);
      const totalH = bubbleH + arrowH - 5;

      canvas.width = totalW;
      canvas.height = totalH;

      ctx.imageSmoothingEnabled = false;

      if (balloonSlicesLoaded) {
        const { nw, n, ne, w, c, e, sw, s, se, arrow } = balloonSlices;
        const bx = Math.round((totalW - bubbleW) / 2);
        const by = 0;

        // Corners
        ctx.drawImage(nw, bx, by, cornerW, cornerH);
        ctx.drawImage(ne, bx + cornerW + contentW, by, cornerW, cornerH);
        ctx.drawImage(sw, bx, by + cornerH + contentH, cornerW, cornerH);
        ctx.drawImage(se, bx + cornerW + contentW, by + cornerH + contentH, cornerW, cornerH);

        // Borders
        ctx.drawImage(n, bx + cornerW, by, contentW, cornerH);
        ctx.drawImage(s, bx + cornerW, by + cornerH + contentH, contentW, cornerH);
        ctx.drawImage(w, bx, by + cornerH, cornerW, contentH);
        ctx.drawImage(e, bx + cornerW + contentW, by + cornerH, cornerW, contentH);

        // Center
        ctx.drawImage(c, bx + cornerW, by + cornerH, contentW, contentH);

        // Arrow tail pointing towards speaker (overlap bottom border by 5px for seamless ribbon connection)
        const ax = Math.round((totalW - arrowW) / 2);
        const ay = by + bubbleH - 5;
        ctx.drawImage(arrow, ax, ay, arrowW, arrowH);
      } else {
        loadBalloonSlices();
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#2b2b2b";
        ctx.lineWidth = 1.2;
        if ((ctx as any).roundRect) (ctx as any).roundRect(1, 1, totalW - 2, bubbleH - 2, 4);
        else ctx.rect(1, 1, totalW - 2, bubbleH - 2);
        ctx.fill();
        ctx.stroke();
      }

      // Authentic MapleStory chat text (black, bold, centered)
      ctx.font = "bold 12px Arial, Tahoma, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = "#000000";
      ctx.fillText(text, totalW / 2, cornerH + contentH / 2 + 1);
    }

    createImageBitmap(canvas).then((bmp) => {
      const tex = r.texture(bmp);
      textTexCache.set(key, tex);
      textTexPending.delete(key);
    }).catch(() => {
      textTexPending.delete(key);
    });
  } catch {
    textTexPending.delete(key);
  }

  return null;
}

const BODY = [2000, 12000, 20000, 30030];
/** The default avatar: body, head, hair, face (equip ids). */
export const DEFAULT_LOOK = [2000, 12000, 20000, 30030];

/**
 * A character frame URL. The server composes the equipped parts from the
 * local client's Character.wz — no remote asset service.
 */
export const charUrlFor = (look: number[], anim: string, f: number, expr = "default", ef = 0) => {
  let url = `/wz/char?eq=${look.join(",")}&action=${anim}&frame=${f}`;
  if (expr !== "default") url += `&expr=${expr}`;
  if (ef !== 0) url += `&ef=${ef}`;
  return url;
};
export const BOSSES = [2220000, 3220000, 6130101, 9300003, 8220007, 5220000, 6300005];
const STAGE_KILLS = 25;
/**
 * Frame timing per animation, in ms. This is the FALLBACK used until the
 * real per-frame delays arrive from the server; the counts must not exceed
 * what the body actually ships or the extra frames 404 and the loop stalls
 * (the classic "idle animation freezes" bug — stand1 has 3 frames, not 4).
 */
const ANIMS: Record<string, number[]> = {
  stand1: [500, 500, 500], stand2: [500, 500, 500],
  walk1: [180, 180, 180, 180], walk2: [180, 180, 180, 180],
  alert: [500, 500, 500], jump: [200], prone: [100],
  ladder: [250, 250], rope: [250, 250],
  swingO1: [300, 150, 350], swingO2: [300, 150, 350], swingO3: [300, 150, 350],
  swingOF: [200, 100, 100, 300], stabO1: [350, 450], stabO2: [350, 450], stabOF: [250, 150, 300],
  swingT1: [300, 150, 350], swingT2: [300, 150, 350], swingT3: [300, 150, 350],
  swingP1: [300, 150, 350], swingP2: [300, 150, 350],
  shoot1: [300, 150, 350], shoot2: [300, 150, 350],
  heal: [300, 150, 350], fly: [300, 300], sit: [100],
};

export const EXP_TABLE = [15, 34, 57, 92, 135, 372, 560, 840, 1242, 1716, 2360, 3216, 4200, 5460, 7050, 8840, 11040, 13716, 16680, 20216, 24402, 28980, 34320, 40512, 47216, 54900, 63666, 73080, 83720, 95700];
export const expToLevel = (lv: number) => EXP_TABLE[Math.min(lv - 1, EXP_TABLE.length - 1)] * (lv > EXP_TABLE.length ? 1 + (lv - EXP_TABLE.length) * 0.15 : 1);

const WALK = 135, JUMP = 560, CLIMB = 150;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- entities
interface Mob {
  data: MobData; spawn: MapData["spawns"][number];
  x: number; y: number; vx: number; vy: number; fh: Foothold | null; ignoreFh?: number;
  dir: -1 | 1; state: "stand" | "move" | "hit1" | "die1" | "dead";
  t: number; anim: number; frame: number; hp: number; maxHp: number;
  aggro: number; hpShow: number; respawn: number; alpha: number;
  mul: { exp: number; meso: number }; atk: number; boss?: boolean; skillT?: number; attacking?: string;
  lastTex?: Tex | null; lastFr?: Sprite | null;
}
interface Drop { x: number; y: number; vx: number; vy: number; fh: Foothold | null; amount: number; item?: number; mat?: number; gear?: Gear; t: number; picked: number; ignoreFh?: number }
interface Projectile { x: number; y: number; target: Mob; dmg: number; miss: boolean; t: number; skillId?: string; isShadow?: boolean; arcY?: number }
interface Fx { frames: Sprite[]; x: number; y: number; flip: boolean; t: number; follow?: boolean }
interface DmgText { value: number; miss: boolean; hurt: boolean; x: number; y: number; t: number }
interface Portal { x: number; y: number; to: number; side: "left" | "right" }

export interface Stats {
  name: string; level: number; exp: number; hp: number; maxHp: number; mp: number; maxMp: number; meso: number; job: string; classId: ClassId;
  str: number; dex: number; int: number; luk: number; ap: number; sp: number; baseHp: number; baseMp: number; fame: number;
}
export interface AutoSettings { battle: boolean; hp: boolean; hpPct: number; mp: boolean; mpPct: number; buff: boolean; loot: boolean; ap: boolean; boss: boolean; magnet: boolean }

export type ChatKind = "system" | "exp" | "meso" | "level" | "notice" | "say" | "item";

const emptyGt = () => ({ watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, att: 0, strP: 0, dexP: 0, intP: 0, lukP: 0, hpP: 0, boss: 0, meso: 0, drop: 0, exp: 0 });

export class Game extends ComponentBase {
  r!: Renderer;
  assets!: Assets;
  map!: MapData;
  tree!: FootholdTree;
  mobs: Mob[] = [];
  mobData = new Map<number, MobData>();
  drops: Drop[] = [];
  fx: Fx[] = [];
  dmg: DmgText[] = [];
  portals: Portal[] = [];
  lastPortalTex: Tex | null = null;
  lastPortalFr: Sprite | null = null;
  fxData: any;
  bounds = { l: 0, r: 0, t: 0, b: 0 };
  cam = { x: 0, y: 0 };
  time = 0;
  loadingMap = false;
  fade = 1;
  onChat: (kind: ChatKind, text: string) => void = () => {};
  onLog: (kind: ChatKind, text: string) => void = () => {};
  onGain: (kind: "level" | "meso" | "exp", text: string) => void = () => {};
  onMapChange: (m: MapData) => void = () => {};

  stats: Stats = {
    name: (() => {
      try { return localStorage.getItem("ms_player_name") || "Player"; } catch { return "Player"; }
    })(),
    level: 1, exp: 0, hp: 50, maxHp: 50, mp: 30, maxMp: 30, meso: 0, job: "Warrior", classId: "warrior",
    str: 12, dex: 5, int: 4, luk: 4, ap: 0, sp: 2, baseHp: 50, baseMp: 30, fame: 0,
  };
  get class() { return classFor(this.stats.classId); }
  inv: Record<number, number> = { 2000000: 30, 2000001: 10, 2000002: 5, 2000003: 30, 2000006: 5 };
  mats: Record<number, number> = { 4010000: 10, 4000001: 10 };
  bag: Gear[] = [];
  eq: Partial<Record<Slot, Gear>> = {};
  visualEq: Partial<Record<Slot, Gear>> = {};
  look: number[] = [...DEFAULT_LOOK, 1040002, 1060002, 1072001, 1302000];
  lookWant: number[] = [];
  prevLook: number[] = [];
  lastPlayerTex: import("./gpu.ts").Tex | null = null;
  itemEffCache = new Map<number, ItemEffData | null>();
  activeItemEffs: ItemEffData[] = [];
  gt = emptyGt();

  spawnDrop(item: Partial<Drop>, x: number, y = this.p.y - 20, vx = rand(-40, 40), vy = -400) {
    this.drops.push({ x, y, vx, vy, fh: null, amount: 0, t: 0, picked: 0, ...item });
  }
  stage = { n: 1, kills: 0, best: 1 };
  boss: Mob | null = null;
  bossTimer = 0;
  bossLoading = false;
  idle = { autoTime: 0, autoKills: 0, killRate: 0.06, expPerKill: 15, mesoPerKill: 12 };
  ah = new AuctionHouse(() => this.stats.level);
  onOffline: (r: { seconds: number; kills: number; exp: number; meso: number; mats: Record<number, number>; gear: Gear[] }) => void = () => {};
  onBoss: (m: Mob | null) => void = () => {};
  skillLv: Record<string, number> = { "1001005": 1, "0001000": 1 };
  skillArt: Record<string, SkillArt> = {};
  snailShell: Sprite | null = null;
  throwingStarFrames: Sprite[] = [];
  buffs: Record<string, { left: number; dur: number }> = {};
  skillCd: Record<string, { left: number; total: number }> = {};
  quick: Record<string, Action | null> = { ...DEFAULT_QUICK };
  auto: AutoSettings = { battle: true, hp: true, hpPct: 50, mp: true, mpPct: 30, buff: true, loot: true, ap: true, boss: true, magnet: true };
  balloon = { text: "", t: 0 };
  ws: WebSocket | null = null;
  wsId: string | null = null;
  wsPing = 0;
  wsPingTimer: any = null;
  remotePlayers = new Map<string, RemotePlayer>();
  lastMoveSync = 0;
  lastSyncedState = { x: 0, y: 0, face: 1, anim: "", frame: 0 };
  prevHuntingMap = 100010000;
  areaBossDefeated = false;
  godMode = false;
  infiniteMp = false;
  oneHitKill = false;
  gmHide = false;
  speedMultiplier = 1;
  projectiles: Projectile[] = [];
  fullyLoaded = false;
  shadowPartnerArt: Record<string, Sprite[]> = {};

  isGm(): boolean {
    const u = (localStorage.getItem("ms_current_user") || "").toLowerCase().trim();
    const n = (this.stats.name || "").toLowerCase().trim();
    const flag = localStorage.getItem("ms_is_gm") === "true";
    return (
      flag ||
      u.startsWith("gm") ||
      u.startsWith("admin") ||
      u === "maplehero" ||
      n.startsWith("gm") ||
      n.startsWith("admin")
    );
  }
  potCd = 0;
  ahT = 0;
  timers = { regen: 0, recovery: 0, self: 0 };
  onChange: () => void = () => {};
  ai = {
    keys: new Set<string>(),
    pressed: new Set<string>(),
    target: null as Mob | null,
    think: 0,
    stuck: 0,
    lastX: 0,
    hold: 0,
    ban: new Map<Mob, number>(),
    jumpCooldown: 0,
    ladderCooldown: 0,
    jumpLoopCount: 0,
    lastJumpX: 0,
    lastJumpY: 0,
    lastJumpTime: 0,
    retreatTime: 0,
    retreatDir: 1 as -1 | 1,
  };

  p = {
    x: 0, y: 0, vx: 0, vy: 0, fh: null as Foothold | null, ignoreFh: undefined as number | undefined,
    face: -1 as -1 | 1, anim: "stand1", frame: 0, ft: 0,
    expr: "default", exprFrame: 0, blinkTimer: 3.5, blinkStep: -1, blinkFrameTimer: 0,
    ladder: null as Ladder | null, attack: 0, attackAnim: "swingO1", hitDone: false, skill: null as string | null,
    invuln: 0, prone: false, alert: 0, regen: 0, dead: false, leapt: false,
    coyote: 0, airTime: 0,
  };

  keys = new Set<string>();
  pressed = new Set<string>();

  constructor(r?: Renderer) {
    super();
    if (r) {
      this.r = r;
      this.assets = new Assets(r);
    }
  }

  public override start(): void {
    // Orillusion lifecycle start hook
  }

  public override onUpdate(): void {
    // Ticked by main render loop
  }

  public override onLateUpdate(): void {
    // Orillusion lifecycle late-update draw hook
    this.draw();
  }

  async init(startMapOrParam: any) {
    if (typeof startMapOrParam === "number") {
      return this.initGame(startMapOrParam);
    }
    super.init(startMapOrParam);
    if (startMapOrParam?.r && !this.r) {
      this.r = startMapOrParam.r;
      this.assets = new Assets(this.r);
    }
  }

  async initGame(startMap: number) {
    this.fxData = await json("/wz/data/fx");
    const sk = await json<Record<string, any>>("/wz/data/skills");
    this.snailShell = sk.snailShell ?? null;
    const star0: Sprite = { url: "/wz/sprite/Item/0207/02070006/bullet/0", w: 27, h: 27, ox: 13, oy: 13 };
    const star1: Sprite = { url: "/wz/sprite/Item/0207/02070006/bullet/1", w: 27, h: 27, ox: 13, oy: 13 };
    this.throwingStarFrames = [star0, star1];
    for (const d of SKILL_DEFS) if (sk[d.id]) this.skillArt[d.id] = sk[d.id];
    try {
      const spData = await json<Record<string, Sprite[]>>("/wz/data/shadow-partner");
      if (spData) this.shadowPartnerArt = spData;
    } catch {}
    this.recalc();
    // Warm up character frames (rendered server-side, so they can be slow the first time).
    const loads: Promise<unknown>[] = [this.assets.load(star0.url), this.assets.load(star1.url)];
    if (!Object.keys(this.eq).length) {
      const c = this.class;
      for (const id of [c.startingGear.weapon, c.startingGear.top, c.startingGear.bottom, c.startingGear.shoes]) {
        const b = GEAR.get(id);
        if (b) {
          const sockets = this.socketsFor(b.slot);
          this.eq[sockets[0]] = makeGear(id, -10);
        }
      }
    }
    this.recalc();
    this.look = this.computeLook();
    for (const [a, fr] of Object.entries(ANIMS)) fr.forEach((_, i) => loads.push(this.assets.load(charUrlFor(this.look, a, i))));
    const fxs = [this.fxData.dmg, this.fxData.dmgFirst, this.fxData.hurt, this.fxData.hurtFirst].flatMap((o: any) => Object.values(o));
    for (const s of [...fxs, ...this.fxData.meso, ...this.fxData.portal, this.fxData.miss] as Sprite[]) if (s) loads.push(this.assets.load(s.url));
    for (const a of Object.values(this.skillArt)) for (const f of [...a.effect, ...a.effect0, ...a.hit, ...(a.ball ?? [])]) this.assets.load(f.url);
    await this.loadMap(startMap, "spawn");
    this.updateActiveItemEffs();
    await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 25000))]);
  }

  // ------------------------------------------------------------ websocket networking
  initWs() {
    if (!this.fullyLoaded) return;
    if (this.wsPingTimer) {
      clearInterval(this.wsPingTimer);
      this.wsPingTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    try {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const host = location.host || "localhost:3000";
      const ws = new WebSocket(`${proto}//${host}/ws`);
      this.ws = ws;

      ws.onopen = () => {
        this.sendJoin();
        // Start ping heartbeat
        if (this.wsPingTimer) clearInterval(this.wsPingTimer);
        this.wsPingTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ t: "ping", sentAt: performance.now() }));
          }
        }, 1000);
        ws.send(JSON.stringify({ t: "ping", sentAt: performance.now() }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          this.handleWsMessage(msg);
        } catch {}
      };

      ws.onclose = () => {
        if (this.wsPingTimer) {
          clearInterval(this.wsPingTimer);
          this.wsPingTimer = null;
        }
        this.ws = null;
        setTimeout(() => {
          if (!this.ws) this.initWs();
        }, 3000);
      };

      ws.onerror = () => {
        if (this.wsPingTimer) {
          clearInterval(this.wsPingTimer);
          this.wsPingTimer = null;
        }
        try { ws.close(); } catch {}
      };
    } catch {}
  }

  sendJoin() {
    if (!this.fullyLoaded || this.loadingMap || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      t: "join",
      name: this.stats.name,
      mapId: this.map?.id || FREE_MARKET_MAP,
      x: Math.round(this.p.x),
      y: Math.round(this.p.y),
      face: this.p.face,
      anim: this.p.anim,
      frame: this.p.frame,
      look: this.look,
    }));
  }

  syncAll(forceReconnect = false) {
    if (!this.fullyLoaded || this.loadingMap) return;
    if (forceReconnect || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.initWs();
      return;
    }
    this.ws.send(JSON.stringify({
      t: "sync",
      name: this.stats.name,
      mapId: this.map?.id || FREE_MARKET_MAP,
      x: Math.round(this.p.x),
      y: Math.round(this.p.y),
      face: this.p.face,
      anim: this.p.anim,
      frame: this.p.frame,
      look: this.look,
    }));
  }

  sendAction(kind: "attack" | "skill", skillId: string | null, anim: string) {
    if (!this.fullyLoaded || this.loadingMap || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      t: "action",
      kind,
      skillId,
      anim,
      face: this.p.face,
      x: Math.round(this.p.x),
      y: Math.round(this.p.y),
      frame: this.p.frame,
    }));
  }

  syncMove() {
    if (!this.fullyLoaded || this.loadingMap || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    const p = this.p;
    const dx = Math.abs(p.x - this.lastSyncedState.x);
    const dy = Math.abs(p.y - this.lastSyncedState.y);
    const animChanged = p.anim !== this.lastSyncedState.anim || p.frame !== this.lastSyncedState.frame || p.face !== this.lastSyncedState.face;
    const isMoving = Math.abs(p.vx) > 0.1 || Math.abs(p.vy) > 0.1;
    const stoppedMoving = !isMoving && (this.lastSyncedState.anim.startsWith("walk") || this.lastSyncedState.anim === "jump");

    if ((now - this.lastMoveSync > 50 && (dx > 2 || dy > 2 || animChanged)) || stoppedMoving || (now - this.lastMoveSync > 2000)) {
      this.lastMoveSync = now;
      this.lastSyncedState = { x: Math.round(p.x), y: Math.round(p.y), face: p.face, anim: p.anim, frame: p.frame };
      this.ws.send(JSON.stringify({
        t: "move",
        mapId: this.map?.id || FREE_MARKET_MAP,
        x: Math.round(p.x),
        y: Math.round(p.y),
        face: p.face,
        anim: p.anim,
        frame: p.frame,
      }));
    }
  }

  handleWsMessage(msg: any) {
    if (!msg || !msg.t) return;
    if (msg.t === "welcome") {
      this.wsId = msg.id;
      // Preserve character name from database / character selection
      const current = (this.stats.name || "").trim();
      const hasRealName = current && current !== "Player" && !current.startsWith("P-");
      let activeName = hasRealName ? current : "";
      if (!activeName) {
        try {
          const saved = (localStorage.getItem("ms_player_name") || "").trim();
          if (saved && saved !== "Player" && !saved.startsWith("P-")) activeName = saved;
        } catch {}
      }
      if (!activeName && msg.id) {
        activeName = msg.id.length > 8 ? `P-${msg.id.slice(0, 4).toUpperCase()}` : msg.id;
      }
      if (activeName) {
        this.stats.name = activeName;
        try { localStorage.setItem("ms_player_name", activeName); } catch {}
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ t: "name", name: activeName }));
        }
        this.onChange();
      }
    } else if (msg.t === "player_name") {
      if (msg.id === this.wsId) return;
      const rp = this.remotePlayers.get(msg.id);
      if (rp) {
        rp.name = msg.name;
        this.onChange();
      }
    } else if (msg.t === "roster") {
      this.remotePlayers.clear();
      if (Array.isArray(msg.players)) {
        for (const p of msg.players) {
          if (p.id !== this.wsId) {
            this.remotePlayers.set(p.id, {
              ...p,
              targetX: p.x,
              targetY: p.y,
            });
            this.assets.load(charUrlFor(p.look, p.anim || "stand1", p.frame || 0));
          }
        }
      }
    } else if (msg.t === "player_join") {
      if (msg.player && msg.player.id !== this.wsId) {
        this.remotePlayers.set(msg.player.id, {
          ...msg.player,
          targetX: msg.player.x,
          targetY: msg.player.y,
        });
        this.onChat("system", `${msg.player.name} entered the map.`);
        this.assets.load(charUrlFor(msg.player.look, msg.player.anim || "stand1", msg.player.frame || 0));
      }
    } else if (msg.t === "player_move") {
      if (msg.id === this.wsId) return;
      const rp = this.remotePlayers.get(msg.id);
      if (rp) {
        rp.targetX = msg.x;
        rp.targetY = msg.y;
        rp.face = msg.face;
        if (!rp.attackTimer || rp.attackTimer <= 0) {
          rp.anim = msg.anim;
          rp.frame = msg.frame;
        }
        this.assets.load(charUrlFor(rp.look, rp.anim, rp.frame));
      } else {
        this.syncAll(false);
      }
    } else if (msg.t === "player_action") {
      if (msg.id === this.wsId) return;
      const rp = this.remotePlayers.get(msg.id);
      if (rp) {
        rp.anim = msg.anim || "swingO1";
        rp.frame = 0;
        rp.animTimer = 0;
        rp.attackTimer = 0.65;
        rp.face = msg.face ?? rp.face;
        rp.targetX = msg.x ?? rp.targetX;
        rp.targetY = msg.y ?? rp.targetY;
        this.assets.load(charUrlFor(rp.look, rp.anim, rp.frame));
        if (msg.skillId) {
          const art = this.skillArt[msg.skillId];
          if (art?.effect?.length) {
            this.fx.push({ frames: art.effect, x: rp.x, y: rp.y, flip: rp.face === 1, t: 0 });
          } else if (art?.effect0?.length) {
            this.fx.push({ frames: art.effect0, x: rp.x, y: rp.y, flip: rp.face === 1, t: 0 });
          }
          const d = SKILL[msg.skillId];
          if (d?.kind === "ranged" && this.throwingStarFrames.length > 0) {
            const hits = d.hits ?? 1;
            for (let h = 0; h < hits; h++) {
              this.projectiles.push({
                x: rp.x + rp.face * 20,
                y: rp.y - 35,
                target: { x: rp.x + rp.face * 220, y: rp.y - 20, state: "alive" } as any,
                dmg: 0,
                miss: false,
                t: -h * 0.08,
                skillId: msg.skillId,
                arcY: (h - (hits - 1) / 2) * 12,
              });
            }
          }
        }
      }
    } else if (msg.t === "player_leave") {
      if (msg.id === this.wsId) return;
      const rp = this.remotePlayers.get(msg.id);
      if (rp) {
        this.onChat("system", `${rp.name || "A player"} left the map.`);
        this.remotePlayers.delete(msg.id);
      }
    } else if (msg.t === "player_look") {
      if (msg.id === this.wsId) return;
      const rp = this.remotePlayers.get(msg.id);
      if (rp) {
        rp.look = msg.look;
        this.assets.load(charUrlFor(rp.look, rp.anim || "stand1", rp.frame || 0));
      }
    } else if (msg.t === "chat") {
      if (msg.id === this.wsId) return;
      const rp = this.remotePlayers.get(msg.id);
      if (rp) {
        rp.balloon = { text: msg.text, t: 5 };
      }
      this.onChat((msg.kind as ChatKind) || "say", msg.kind === "say" ? `${msg.name} : ${msg.text}` : msg.text);
      if (msg.kind === "notice") {
        window.dispatchEvent(new CustomEvent("gm-broadcast-notice", { detail: { text: msg.text.replace(/^\[Notice\]\s*/, "") } }));
      }
    } else if (msg.t === "pong") {
      if (typeof msg.sentAt === "number") {
        this.wsPing = Math.max(0, Math.round(performance.now() - msg.sentAt));
      }
    }
  }

  // ------------------------------------------------------------ map loading
  async loadMap(id: number, arrive: "spawn" | "left" | "right") {
    if (this.boss) this.endBoss(false);
    this.loadingMap = true;
    const m = await json<MapData>(`/wz/data/map/${id}`);
    await Promise.all([...new Set(m.spawns.map((s) => s.id))].map(async (mid) => {
      if (!this.mobData.has(mid)) this.mobData.set(mid, await json(`/wz/data/mob/${mid}`));
    }));
    const renderTex = this.assets.load(m.render);
    const backLoads = m.backs.map((b) => this.assets.load(b.sprite.url));
    const mobLoads = [...this.mobData.values()].flatMap((d) => Object.values(d.books).flat().map((s) => this.assets.load(s.url)));
    await Promise.race([Promise.all([renderTex, ...backLoads, ...mobLoads]), new Promise((r) => setTimeout(r, 20000))]);
    const tex = await renderTex;

    this.map = m;
    this.tree = new FootholdTree(m.footholds);
    const ox = m.renderOrigin.x, oy = m.renderOrigin.y;
    this.bounds = tex
      ? { l: -ox, t: -oy, r: tex.w - ox, b: tex.h - oy }
      : { l: this.tree.minX - 50, r: this.tree.maxX + 50, t: this.tree.minY - 200, b: this.tree.maxY + 100 };

    // Edge portals on the lowest floors.
    this.portals = [];
    const groundAt = (x: number) => { const f = this.tree.below(x, this.tree.minY - 1000); return f ? FootholdTree.yAt(f, x) : this.tree.maxY; };
    const lowest = (fromLeft: boolean) => {
      const xs = this.tree.floors.map((f) => (fromLeft ? f.x1 : f.x2));
      const edge = fromLeft ? Math.min(...xs) : Math.max(...xs);
      const x = edge + (fromLeft ? 70 : -70);
      let best = -Infinity;
      for (const f of this.tree.floors) if (x >= f.x1 && x <= f.x2) best = Math.max(best, FootholdTree.yAt(f, x));
      return { x, y: best > -Infinity ? best : groundAt(x) };
    };
    const L = lowest(true), R = lowest(false);
    if (id === FREE_MARKET_MAP) {
      const returnMap = this.prevHuntingMap || 100010000;
      this.portals.push({ ...L, to: returnMap, side: "left" }, { ...R, to: returnMap, side: "right" });
    } else {
      const idx = HUNTING_AREAS.indexOf(id);
      const nextArea = idx >= 0 ? HUNTING_AREAS[(idx + 1) % HUNTING_AREAS.length] : 100010000;
      this.portals.push({ ...L, to: FREE_MARKET_MAP, side: "left" }, { ...R, to: nextArea, side: "right" });
    }

    // Player placement.
    const p = this.p;
    let px: number, py: number;
    if (arrive === "left") ({ x: px, y: py } = this.portals[0] ? { x: this.portals[0].x + 30, y: this.portals[0].y } : { x: 0, y: 0 });
    else if (arrive === "right") ({ x: px, y: py } = this.portals[1] ? { x: this.portals[1].x - 30, y: this.portals[1].y } : { x: 0, y: 0 });
    else ({ x: px, y: py } = this.portals[0] ? { x: this.portals[0].x + 40, y: this.portals[0].y } : (m.spawns[0] ?? { x: 0, y: 0 }));
    p.x = px; p.y = py - 5; p.vx = 0; p.vy = 0; p.ladder = null;
    p.attack = 0; p.hitDone = true; p.skill = null;
    p.fh = this.tree.landing(p.x, p.y - 20, p.y + 40);
    if (p.fh) p.y = FootholdTree.yAt(p.fh, p.x);

    // Reset area boss defeated status when entering a new hunting area
    if (id !== FREE_MARKET_MAP) {
      this.areaBossDefeated = false;
    }

    // Monsters.
    this.mobs = id === FREE_MARKET_MAP ? [] : m.spawns.map((s) => this.makeMob(s)).filter(Boolean) as Mob[];
    this.boss = null;
    this.bossTimer = 0;
    this.drops = []; this.fx = []; this.dmg = [];
    this.snapCamera();
    this.loadingMap = false;
    this.fade = 1;
    this.onMapChange(m);

    // WebSocket map change broadcast (only when game is fully loaded and map assets/state are ready)
    if (this.fullyLoaded && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        t: "map_change",
        mapId: id,
        x: Math.round(p.x),
        y: Math.round(p.y),
      }));
      this.remotePlayers.clear();
    }
  }

  makeMob(s: MapData["spawns"][number]): Mob | null {
    const data = this.mobData.get(s.id);
    if (!data) return null;
    const fh = this.tree.landing(s.x, s.y - 30, s.y + 30) ?? this.tree.below(s.x, s.y - 30);
    const sc = this.stageMul();
    const maxHp = Math.round((data.meta?.maxHP ?? 50) * sc.hp);
    return {
      data, spawn: s, x: s.x, y: fh ? FootholdTree.yAt(fh, s.x) : s.y, vx: 0, vy: 0, fh,
      dir: Math.random() < 0.5 ? -1 : 1, state: "stand", t: rand(0.5, 2.5), anim: 0, frame: 0,
      hp: maxHp, maxHp, aggro: 0, hpShow: 0, respawn: 0, alpha: 1,
      mul: { exp: sc.exp, meso: sc.meso }, atk: this.mobAtk(data),
    };
  }

  snapCamera() {
    const W = this.r.width, H = this.r.height;
    this.cam.x = this.p.x - W / 2;
    this.cam.y = this.p.y - H / 2 - 60;
    this.clampCam();
  }
  clampCam() {
    const W = this.r.width, H = this.r.height, b = this.bounds;
    if (b.r - b.l <= W) this.cam.x = (b.l + b.r) / 2 - W / 2;
    else this.cam.x = Math.max(b.l, Math.min(b.r - W, this.cam.x));
    if (b.b - b.t <= H) {
      this.cam.y = (b.t + b.b) / 2 - H / 2;
    } else {
      this.cam.y = Math.max(b.t, Math.min(b.b - H, this.cam.y));
    }
  }

  // ------------------------------------------------------------ input helpers
  down(...k: string[]) { return k.some((x) => this.keys.has(x) || this.ai.keys.has(x)); }
  hit(...k: string[]) { return k.some((x) => this.pressed.has(x) || this.ai.pressed.has(x)); }

  // ------------------------------------------------------------ character stats
  lv(id: string) { return this.skillLv[id] ?? 0; }
  totalStat(k: "str" | "dex" | "int" | "luk") {
    const passive = (k === "str" || k === "dex") ? this.lv("1100009") * 4 : 0;
    const pct = (k === "str" ? this.gt.strP : k === "dex" ? this.gt.dexP : k === "int" ? this.gt.intP : this.gt.lukP);
    return Math.round((this.stats[k] + passive + this.gt[k]) * (1 + pct / 100));
  }
  totalStr() { return this.totalStat("str"); }
  totalDex() { return this.totalStat("dex"); }
  totalInt() { return this.totalStat("int"); }
  totalLuk() { return this.totalStat("luk"); }
  primaryStat() { return this.totalStat(this.class.primary); }
  secondaryStat() { return this.totalStat(this.class.secondary); }
  watk() { return Math.round(((this.eq.weapon ? this.gt.watk : 5 + this.gt.watk) + (this.buffs["1101006"] ? this.lv("1101006") * 2 : 0)) * (1 + this.gt.att / 100)); }
  maxDamage() {
    // Real MapleStory's per-class damage formulas, simplified to use the class's primary stat.
    return Math.max(1, ((4 * this.primaryStat() + this.secondaryStat()) * this.watk()) / 40);
  }
  combatPower() { return Math.round(this.maxDamage() * 12 * (1 + this.gt.boss / 200) + this.stats.maxHp / 4 + this.gt.def * 4); }
  computeLook(): number[] {
    const order: Slot[] = ["cape", "shoes", "bottom", "top", "gloves", "hat", "earrings", "face", "eye", "shield", "weapon"];
    const worn = order.map((k) => this.visualEq[k]?.id ?? this.eq[k]?.id).filter((x): x is number => !!x);
    // Always include the base body parts so the avatar is never headless.
    return [...DEFAULT_LOOK, ...worn];
  }

  /** Destination sockets a gear item of the given category can be placed into. */
  socketsFor(category: string): Slot[] {
    if (category === "ring") return ["ring1", "ring2", "ring3", "ring4"];
    return [category as Slot];
  }

  /** Applies class-specific starting stats, skills and hotbar for a brand-new character. */
  applyClassDefaults(id: ClassId) {
    const c = classFor(id);
    this.stats.classId = c.id;
    this.stats.job = c.tabs[0];
    this.stats.baseHp = c.base.hp;
    this.stats.baseMp = c.base.mp;
    this.stats.str = c.base.str;
    this.stats.dex = c.base.dex;
    this.stats.int = c.base.int;
    this.stats.luk = c.base.luk;
    this.stats.hp = c.base.hp;
    this.stats.mp = c.base.mp;
    // Fresh characters start with NO learned skills, then learn one usable
    // attack skill that is already on their default hotbar and eligible at level 1.
    this.skillLv = {};
    const attackIds = c.defaultQuick;
    const pick = Object.values(attackIds)
      .filter((a): a is { t: "skill"; id: string } => a?.t === "skill")
      .map((a) => a.id)
      .find((sid) => {
        const d = SKILL[sid];
        if (!d) return false;
        if (d.kind !== "attack" && d.kind !== "ranged") return false;
        if (this.stats.level < d.reqLevel) return false;
        if (!c.skillsByTab.some((tab) => tab.includes(sid))) return false;
        return true;
      });
    if (pick) this.skillLv[pick] = 1;
    this.quick = { ...c.defaultQuick };
    this.recalc();
  }

  onJobAdvancementReady?: (tier: number) => void;

  canAdvanceJob(tier?: number): boolean {
    const s = this.stats;
    if (tier === 1 || (!tier && s.classId === "beginner")) return s.level >= 10 && s.classId === "beginner";
    if (s.classId === "beginner") return false;
    const c = classFor(s.classId);
    if (tier === 2) return s.level >= 30 && s.job === c.tabs[1];
    if (tier === 3) return s.level >= 60 && s.job === c.tabs[2];
    return false;
  }

  advanceJob(id: ClassId) {
    const s = this.stats;
    const c = classFor(id);
    s.classId = c.id;
    let jobIndex = 1;
    if (s.level >= 60 && c.tabs.length > 3) jobIndex = 3;
    else if (s.level >= 30 && c.tabs.length > 2) jobIndex = 2;
    s.job = c.tabs[jobIndex] || c.tabs[1] || c.name;
    s.sp += 5;
    s.ap += 5;
    // Learn initial job attack skill
    const firstSkill = c.skillsByTab[1]?.[0];
    if (firstSkill && !this.skillLv[firstSkill]) {
      this.skillLv[firstSkill] = 1;
      this.quick["Shift"] = { t: "skill", id: firstSkill };
    }
    const moveSkill = c.skillsByTab[1]?.find((sid) => sid === "1001008" || sid === "4001003");
    if (moveSkill && !this.skillLv[moveSkill]) {
      this.skillLv[moveSkill] = 1;
      this.quick["Space"] = { t: "skill", id: moveSkill };
    }
    this.recalc();
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    this.fx.push({ frames: this.fxData.levelUp, x: this.p.x, y: this.p.y, flip: false, t: 0, follow: true });
    this.onGain("level", `Job Advancement complete! You are now a ${s.job}!`);
    this.onChat("level", `★ Job Advancement: You have advanced to ${s.job}! +5 SP & +5 AP awarded.`);
    this.onChange();
  }
  /** Re-renders the character with new equipment; keeps the old look until the new frames are ready. */
  refreshLook() {
    const want = this.computeLook();
    const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
    if (same(want, this.look) && same(want, this.lookWant)) return;
    this.prevLook = this.look;
    this.look = want;
    this.lookWant = want;
    this.lastPlayerTex = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "look", look: this.look }));
    }
    this.onChange();
    // Preload stand1/walk1 and blink frames with high priority so character updates immediately
    const key = Object.entries(ANIMS).filter(([a]) => a === "stand1" || a === "walk1");
    const priorityLoads: Promise<unknown>[] = [];
    for (const [a, fr] of key) fr.forEach((_, i) => priorityLoads.push(Promise.resolve(this.assets.load(charUrlFor(want, a, i))).catch(() => null)));
    for (let ef = 0; ef < 3; ef++) priorityLoads.push(Promise.resolve(this.assets.load(charUrlFor(want, "stand1", 0, "blink", ef))).catch(() => null));
    
    // Also preload all other animation frames in background
    const allLoads: Promise<unknown>[] = [...priorityLoads];
    for (const [a, fr] of Object.entries(ANIMS)) {
      if (a !== "stand1" && a !== "walk1") {
        fr.forEach((_, i) => allLoads.push(Promise.resolve(this.assets.load(charUrlFor(want, a, i))).catch(() => null)));
      }
    }

    Promise.race([Promise.all(priorityLoads), new Promise((r) => setTimeout(r, 2000))]).then(() => {
      this.lookWant = [];
      this.onChange();
    });
    Promise.race([Promise.all(allLoads), new Promise((r) => setTimeout(r, 8000))]).then(() => {
      this.prevLook = [];
      this.onChange();
    });
    this.updateActiveItemEffs();
  }

  hasHoverEffect(look?: number[]): boolean {
    const ids = look ?? this.look;
    for (const id of ids) {
      if (isHoverItem(id)) return true;
    }
    return false;
  }

  async updateActiveItemEffs() {
    const prioritySlots: Slot[] = ["weapon", "hat", "cape", "overall" as any, "top", "bottom", "ring1", "ring2", "ring3", "ring4"];
    const orderedIds: number[] = [];
    for (const slot of prioritySlots) {
      const v = this.visualEq[slot]?.id;
      if (v && !orderedIds.includes(v)) orderedIds.push(v);
      const e = this.eq[slot]?.id;
      if (e && !orderedIds.includes(e)) orderedIds.push(e);
    }
    for (const id of this.look) {
      if (!orderedIds.includes(id)) orderedIds.push(id);
    }
    for (const g of Object.values(this.visualEq)) {
      if (g && !orderedIds.includes(g.id)) orderedIds.push(g.id);
    }
    for (const g of Object.values(this.eq)) {
      if (g && !orderedIds.includes(g.id)) orderedIds.push(g.id);
    }

    const effs: ItemEffData[] = [];
    for (const id of orderedIds) {
      if (!this.itemEffCache.has(id)) {
        try {
          const res = await fetch(`/wz/data/item-eff/${id}`);
          if (res.ok) {
            const data: ItemEffData = await res.json();
            this.itemEffCache.set(id, data);
            for (const act of Object.values(data.actions)) {
              for (const fr of act) this.assets.load(fr.url);
            }
          } else {
            this.itemEffCache.set(id, null);
          }
        } catch {
          this.itemEffCache.set(id, null);
        }
      }
      const cached = this.itemEffCache.get(id);
      if (cached && !effs.some((e) => e.id === cached.id)) {
        effs.push(cached);
      }
    }
    this.activeItemEffs = effs;
  }
  mastery() { return Math.min(0.9, 0.15 + this.lv("1100000") * 0.05); }
  damageRange() { const mx = this.maxDamage(); return [Math.max(1, Math.floor(mx * this.mastery())), Math.floor(mx)]; }
  speed() {
    let mult = 1 + this.lv("1000009") * 0.01;
    for (const [id] of Object.entries(this.buffs)) {
      const d = SKILL[id];
      if (d?.buff?.speed) mult += (d.buff.speed + this.lv(id)) * 0.01;
    }
    if (this.buffs["0001002"]) mult += this.lv("0001002") * 0.1;
    return WALK * mult * (this.speedMultiplier || 1);
  }
  jobFor(level: number) {
    const c = this.class;
    return level >= c.tabLevel[3] ? c.tabs[3] : level >= c.tabLevel[2] ? c.tabs[2] : c.tabs[1];
  }
  recalc() {
    const s = this.stats, gt = emptyGt();
    for (const [id] of Object.entries(this.buffs)) {
      const d = SKILL[id];
      if (!d?.buff) continue;
      const l = Math.max(1, this.lv(id));
      for (const k of ["att", "str", "dex", "int", "luk", "def"] as const) {
        if (d.buff[k]) gt[k] += d.buff[k]! * l;
      }
    }
    for (const g of Object.values(this.eq)) {
      if (!g) continue;
      const st = gearStats(g);
      gt.watk += st.watk; gt.str += st.str; gt.dex += st.dex; gt.int += st.int; gt.luk += st.luk; gt.hp += st.hp; gt.def += st.def;
      for (const p of g.pot) {
        const pctKey = `${p.stat}P` as keyof typeof gt;
        if (p.stat === "att") gt.att += p.pct;
        else if (pctKey in gt) (gt as any)[pctKey] += p.pct;
        else if (p.stat in gt) (gt as any)[p.stat] += p.pct;
      }
    }
    this.gt = gt;
    s.maxHp = Math.round((s.baseHp * (1 + this.lv("1000009") * 0.03) + gt.hp) * (1 + gt.hpP / 100));
    s.maxMp = Math.round(s.baseMp + s.int);
    s.hp = Math.min(s.hp, s.maxHp); s.mp = Math.min(s.mp, s.maxMp);
    s.job = this.jobFor(s.level);
  }
  addStat(k: "str" | "dex" | "int" | "luk", n = 1) {
    const s = this.stats;
    n = Math.min(n, s.ap);
    if (n <= 0) return;
    s[k] += n; s.ap -= n;
    this.recalc(); this.onChange();
  }
  autoAssign() {
    const s = this.stats, c = this.class;
    while (s.ap > 0) {
      // Real MapleStory: 4/3 of points to primary stat, rest to secondary. Simplified here
      // to a 3-then-1 rotation so the panel stays readable at every level.
      if (s[c.secondary] < 4 + s.level && (this.autoTick = !this.autoTick) === false) {
        this.addStat(c.secondary);
      } else {
        this.addStat(c.primary);
      }
    }
  }
  autoTick = false;
  /** A skill is learnable only if it belongs to this class's tabs and the player meets the level. */
  skillEligible(id: string) {
    const d = SKILL[id];
    if (!d) return false;
    const c = this.class;
    const inClass = c.skillsByTab.some((tab) => tab.includes(id));
    return inClass && this.stats.level >= d.reqLevel;
  }
  canLearn(id: string) {
    const d = SKILL[id];
    return !!d && this.skillEligible(id) && this.stats.sp > 0 && this.lv(id) < d.maxLevel;
  }
  learn(id: string) {
    if (!this.canLearn(id)) return false;
    this.skillLv[id] = this.lv(id) + 1; this.stats.sp--;
    this.recalc(); this.onChange();
    return true;
  }
  setName(name: string) {
    const clean = name.trim().slice(0, 16);
    if (!clean) return;
    this.stats.name = clean;
    try {
      localStorage.setItem("ms_player_name", clean);
    } catch {}
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "name", name: clean }));
    }
    this.onChat("notice", `Your character name has been changed to "${clean}".`);
    this.onChange();
  }

  say(text: string) {
    if (text.startsWith("/name ") || text.startsWith("/nick ") || text.startsWith("/rename ")) {
      const newName = text.replace(/^\/(name|nick|rename)\s+/, "").trim();
      if (newName) {
        this.setName(newName);
      } else {
        this.onChat("system", "Usage: /name <newName>");
      }
      return;
    }
    this.balloon = { text, t: 5 };
    this.onChat("say", `${this.stats.name} : ${text}`);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "chat", text, kind: "say" }));
    }
  }

  sendChat(text: string, kind: ChatKind = "say") {
    if (kind === "say") {
      this.say(text);
    } else {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ t: "chat", text, kind }));
      }
    }
  }

  // ------------------------------------------------------------ actions (quick slots, keys, auto)
  skillCooldown(id: string): number {
    const d = SKILL[id];
    if (d?.cooldown) return d.cooldown(this.lv(id));
    const art = this.skillArt[id];
    if (art?.cooltime && art.cooltime > 0) return art.cooltime;
    return 0;
  }

  triggerCooldown(id: string) {
    const total = this.skillCooldown(id);
    if (total > 0) {
      this.skillCd[id] = { left: total, total };
    }
  }

  useAction(a: Action | null | undefined, quiet = false): boolean {
    if (!a) return false;
    const p = this.p, s = this.stats;
    if (a.t === "item") {
      const it = ITEMS[a.id], n = this.inv[a.id] ?? 0;
      if (!it || n <= 0) { if (!quiet) this.onChat("system", `You don't have any ${it?.name ?? "of that item"}.`); return false; }
      if ((it.hp && s.hp >= s.maxHp && !it.mp) || (it.mp && s.mp >= s.maxMp && !it.hp)) return false;
      if (it.hpPct && s.hp >= s.maxHp && !it.mpPct) return false;
      if (it.type !== "star" && it.type !== "arrow" && it.type !== "bullet") {
        this.inv[a.id] = n - 1;
      }
      if (it.hp) s.hp = Math.min(s.maxHp, s.hp + it.hp);
      if (it.mp) s.mp = Math.min(s.maxMp, s.mp + it.mp);
      if (it.hpPct) s.hp = Math.min(s.maxHp, Math.round(s.hp + s.maxHp * (it.hpPct / 100)));
      if (it.mpPct) s.mp = Math.min(s.maxMp, Math.round(s.mp + s.maxMp * (it.mpPct / 100)));
      this.onChange();
      return true;
    }
    if (a.t === "attack") return this.startAttack(null);
    const d = SKILL[a.id], lv = this.lv(a.id);
    if (!d) return false;
    if (lv <= 0) { if (!quiet) this.onChat("system", "You haven't learned that skill yet."); return false; }
    if (!this.skillEligible(a.id)) { if (!quiet) this.onChat("system", "That skill doesn't belong to your class."); return false; }
    if (d.kind === "passive") return false;

    const cd = this.skillCd[a.id];
    if (cd && cd.left > 0) {
      if (!quiet) this.onChat("system", `Skill is on cooldown (${cd.left.toFixed(1)}s remaining).`);
      return false;
    }

    const cost = this.infiniteMp ? 0 : d.mp(lv);
    if (d.kind === "buff") {
      if (p.attack > 0 || p.ladder) return false;
      if (!this.infiniteMp && s.mp < cost) { if (!quiet) this.onChat("system", "Not enough MP."); return false; }
      if (!this.infiniteMp) s.mp -= cost;
      this.buffs[a.id] = { left: d.duration!(lv), dur: d.duration!(lv) };
      const art = this.skillArt[a.id];
      if (art?.effect.length) this.fx.push({ frames: art.effect, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
      else if (art?.effect0?.length) this.fx.push({ frames: art.effect0, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
      p.alert = 2;
      this.triggerCooldown(a.id);
      this.sendAction("skill", a.id, p.anim);
      this.recalc(); this.onChange();
      return true;
    }
    if (d.kind === "move") {
      if (p.fh || p.ladder || p.leapt || (!this.infiniteMp && s.mp < cost)) return false;
      if (!this.infiniteMp) s.mp -= cost; p.leapt = true;
      // War Leap / Flash Jump: launch horizontally with visual effects scaling with stats
      const dexBoost = (s.dex || 0) * 0.003;
      const lukBoost = (s.luk || 0) * 0.0015;
      const spdBoost = (this.speed() / WALK - 1) * 0.35;
      const lvBoost = (s.level || 1) * 0.004;
      const boost = Math.min(2.5, 1.8 + dexBoost + lukBoost + spdBoost + lvBoost + lv * 0.05);
      const vyFactor = 0.45 + Math.min(0.3, dexBoost * 0.3 + spdBoost * 0.2);
      p.vy = -JUMP * vyFactor;
      p.vx = p.face * this.speed() * boost;
      const art = this.skillArt[a.id];
      if (art?.effect?.length) this.fx.push({ frames: art.effect, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
      else if (art?.effect0?.length) this.fx.push({ frames: art.effect0, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
      this.triggerCooldown(a.id);
      this.sendAction("skill", a.id, "jump");
      return true;
    }
    return this.startAttack(a.id);
  }

  startAttack(id: string | null): boolean {
    const p = this.p, s = this.stats;
    if (p.attack > 0 || p.ladder || this.loadingMap) return false;
    if (id) {
      const cd = this.skillCd[id];
      if (cd && cd.left > 0) return false;
    }
    const d = id ? SKILL[id] : null;
    if (d) {
      const cost = this.infiniteMp ? 0 : d.mp(this.lv(d.id));
      if (!this.infiniteMp && s.mp < cost) { this.onChat("system", "Not enough MP."); return false; }
      if (!this.infiniteMp) s.mp -= cost;
    }
    if (id) this.triggerCooldown(id);
    p.skill = id;
    p.attack = d ? 0.75 : 0.6; p.hitDone = false; p.alert = 3;
    p.attackAnim = d && d.kind !== "ranged" ? "swingO2" : "swingO1";
    p.frame = 0; p.ft = 0;
    const art = id ? this.skillArt[id] : null;
    if (art?.effect.length) this.fx.push({ frames: art.effect, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
    else if (art?.effect0.length) this.fx.push({ frames: art.effect0, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
    this.sendAction(id ? "skill" : "attack", id, p.attackAnim);
    return true;
  }

  // ------------------------------------------------------------ update
  update(dt: number) {
    this.time += dt;
    if (this.loadingMap || !this.map) { this.pressed.clear(); return; }
    this.fade = Math.max(0, this.fade - dt * 2.5);
    for (const [id, cd] of Object.entries(this.skillCd)) {
      cd.left -= dt;
      if (cd.left <= 0) delete this.skillCd[id];
    }
    this.updateBuffs(dt);
    this.runAuto(dt);
    this.updatePlayer(dt);
    this.updateProjectiles(dt);
    this.balloon.t = Math.max(0, this.balloon.t - dt);
    if (this.boss) { this.bossTimer -= dt; if (this.bossTimer <= 0) this.endBoss(false); }
    else if (this.auto.boss && this.bossReady() && !this.p.ladder && this.map?.id !== FREE_MARKET_MAP) this.challengeBoss();
    if (this.auto.battle) { this.idle.autoTime += dt; if (this.idle.autoTime > 120) { this.idle.killRate = this.idle.autoKills / this.idle.autoTime; } if (this.idle.autoTime > 1800) { this.idle.autoTime /= 2; this.idle.autoKills /= 2; } }
    this.ahT = (this.ahT ?? 0) + dt;
    if (this.ahT > 5) { const sold = this.ah.tick(Date.now(), this.ahT); this.ahT = 0; if (sold) { this.onGain("meso", `Auction House: your ${goodsName(sold.goods)} sold for ${sold.price.toLocaleString()} mesos!`); this.onChat("system", `Auction House: your ${goodsName(sold.goods)} sold for ${sold.price.toLocaleString()} mesos! Collect it in the Auction House (H).`); this.onChange(); } }
    for (const m of this.mobs) this.updateMob(m, dt);
    this.updateDrops(dt);
    for (const f of this.fx) f.t += dt * 1000;
    this.fx = this.fx.filter((f) => f.t < f.frames.reduce((a, s) => a + (s.delay ?? 100), 0));
    for (const d of this.dmg) d.t += dt;
    this.dmg = this.dmg.filter((d) => d.t < 1.5);

    // Update remote players (smooth movement, animation frame advancement, attack timers, balloon timers)
    for (const rp of this.remotePlayers.values()) {
      const dx = rp.targetX - rp.x;
      const dy = rp.targetY - rp.y;
      const dist = Math.hypot(dx, dy);
      rp.x += dx * Math.min(1, dt * 15);
      rp.y += dy * Math.min(1, dt * 15);

      if (rp.attackTimer && rp.attackTimer > 0) {
        rp.attackTimer -= dt;
      }

      // Smooth frame advancement
      rp.animTimer = (rp.animTimer ?? 0) + dt * 1000;
      let animKey = rp.anim || "stand1";
      if ((!rp.attackTimer || rp.attackTimer <= 0) && !animKey.startsWith("jump") && !animKey.startsWith("ladder") && !animKey.startsWith("rope")) {
        animKey = dist > 1.5 ? "walk1" : "stand1";
        rp.anim = animKey;
      }
      const d = ANIMS[animKey] ?? ANIMS.stand1;
      if (d?.length) {
        while (rp.animTimer > (d[rp.frame] ?? 120)) {
          rp.animTimer -= d[rp.frame] ?? 120;
          rp.frame = (animKey.startsWith("swing") || animKey.startsWith("stab"))
            ? Math.min(rp.frame + 1, d.length - 1)
            : (rp.frame + 1) % d.length;
        }
      }
      if (rp.attackTimer && rp.attackTimer <= 0 && (animKey.startsWith("swing") || animKey.startsWith("stab"))) {
        rp.anim = dist > 1.5 ? "walk1" : "stand1";
        rp.frame = 0;
      }
      if (rp.balloon) {
        rp.balloon.t = Math.max(0, rp.balloon.t - dt);
      }
    }
    this.syncMove();

    // Camera follow.
    const W = this.r.width, H = this.r.height;
    const tx = this.p.x - W / 2, ty = this.p.y - H / 2 - 60;
    const k = 1 - Math.exp(-dt * 6);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.clampCam();
    this.pressed.clear();
    this.ai.pressed.clear();
  }

  updateBuffs(dt: number) {
    const s = this.stats, t = this.timers;
    let changed = false;
    for (const [id, b] of Object.entries(this.buffs)) {
      b.left -= dt;
      if (b.left <= 0) { delete this.buffs[id]; changed = true; }
    }
    if (changed) { this.recalc(); this.onChange(); }
    t.regen += dt;
    if (t.regen > 6) { t.regen = 0; s.hp = Math.min(s.maxHp, s.hp + 3 + Math.floor(s.level / 2)); s.mp = Math.min(s.maxMp, s.mp + 3 + Math.floor(s.level / 2)); }
    if (this.buffs["0001001"]) { t.recovery += dt; if (t.recovery > 2) { t.recovery = 0; s.hp = Math.min(s.maxHp, s.hp + 8 * this.lv("0001001")); } }
    const sr = this.lv("1110000");
    if (sr > 0) { t.self += dt; if (t.self > 4) { t.self = 0; s.hp = Math.min(s.maxHp, s.hp + 30 * sr); s.mp = Math.min(s.maxMp, s.mp + 10 * sr); } }
    // Auto potions run independently of auto battle.
    this.potCd = Math.max(0, this.potCd - dt);
    if (this.potCd <= 0) {
      if (this.auto.hp && s.hp / s.maxHp * 100 < this.auto.hpPct) {
        for (const id of [2000000, 2000001, 2000002]) if (this.useAction({ t: "item", id }, true)) { this.potCd = 0.6; break; }
      }
      if (this.potCd <= 0 && this.auto.mp && s.mp / s.maxMp * 100 < this.auto.mpPct) {
        for (const id of [2000003, 2000006]) if (this.useAction({ t: "item", id }, true)) { this.potCd = 0.6; break; }
      }
    }
    if (this.auto.buff && this.p.attack <= 0 && !this.p.ladder) this.autoBuffHotbar();
  }

  updateProjectiles(dt: number) {
    for (const pr of this.projectiles) {
      pr.t += dt;
      if (pr.t < 0) continue;
      // Retarget to nearest live mob if current target is dead or dying
      if (pr.target.state === "dead" || pr.target.state === "die1") {
        const next = this.liveMobs().sort((a, b) => Math.hypot(a.x - pr.x, a.y - pr.y) - Math.hypot(b.x - pr.x, b.y - pr.y))[0];
        if (next) pr.target = next;
      }
      const arcOffset = (pr.arcY ?? 0) * Math.sin(Math.min(1, pr.t * 3.5) * Math.PI);
      const tx = pr.target.x;
      const ty = pr.target.y - 25 + arcOffset;
      const dx = tx - pr.x, dy = ty - pr.y;
      const dist = Math.hypot(dx, dy);
      const speed = 720;
      const step = speed * dt;
      if (dist <= step || (dist < 22 && (pr.target.state === "dead" || pr.target.state === "die1"))) {
        if (pr.target.state !== "dead" && pr.target.state !== "die1") {
          this.damageMob(pr.target, pr.dmg, pr.miss);
          if (pr.skillId) {
            const art = this.skillArt[pr.skillId];
            if (art?.hit?.length) this.fx.push({ frames: art.hit, x: pr.target.x, y: pr.target.y - 25, flip: this.p.face === 1, t: 0 });
          }
        }
        pr.t = 99;
      } else {
        pr.x += (dx / dist) * step;
        pr.y += (dy / dist) * step;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.t < 2);
  }

  // ------------------------------------------------------------ auto battle
  liveMobs() { return this.mobs.filter((m) => m.state !== "dead" && m.state !== "die1" && m.alpha >= 1); }

  /** Skills currently on the hotbar that this character has learned and is eligible for. */
  hotbarSkills(): SkillDef[] {
    const ids = new Set<string>();
    for (const a of Object.values(this.quick)) {
      if (a?.t === "skill") ids.add(a.id);
    }
    return SKILL_DEFS.filter((d) => ids.has(d.id) && this.lv(d.id) > 0 && this.skillEligible(d.id));
  }

  /**
   * Evaluates all hotbar attack/ranged skills (and basic attack) against live mobs
   * in both directions (dir and -dir), calculating exact AoE coverage, hit counts,
   * estimated kills, and total damage.
   * Returns the attack option that maximizes damage and kills as many monsters as possible.
   */
  findBestSkillAttack(preferredDir: -1 | 1): { id: string | null; range: number; face: -1 | 1; hitCount: number; score: number } {
    const s = this.stats, p = this.p;
    const [lo, hi] = this.damageRange();
    const avgBase = (lo + hi) / 2;
    const candidates: Array<{ d: SkillDef | null; lv: number; mp: number; range: number; targets: number; hits: number; dmgPct: number }> = [];

    for (const d of this.hotbarSkills()) {
      if (d.kind !== "attack" && d.kind !== "ranged") continue;
      if (this.skillCd[d.id]?.left > 0) continue;
      const lv = this.lv(d.id);
      const mp = d.mp(lv);
      if (s.mp < mp) continue;
      candidates.push({
        d,
        lv,
        mp,
        range: d.range ?? 90,
        targets: d.targets ?? 1,
        hits: d.hits ?? 1,
        dmgPct: d.dmg ? d.dmg(lv) : 100,
      });
    }

    if (Object.values(this.quick).some((a) => a?.t === "attack") || candidates.length === 0) {
      candidates.push({
        d: null,
        lv: 1,
        mp: 0,
        range: 85,
        targets: 1,
        hits: 1,
        dmgPct: 100,
      });
    }

    const mobs = this.liveMobs();
    let best = { id: candidates[0]?.d?.id ?? null, range: candidates[0]?.range ?? 85, face: preferredDir, hitCount: 0, score: -1 };

    const directions: Array<-1 | 1> = [preferredDir, preferredDir === 1 ? -1 : 1];

    for (const dir of directions) {
      for (const cand of candidates) {
        const range = cand.range;
        const x0 = dir === 1 ? p.x - 10 : p.x - range;
        const x1 = dir === 1 ? p.x + range : p.x + 10;
        const y0 = p.y - (cand.d ? 100 : 70);
        const y1 = p.y + 10;

        const inAoE = mobs.filter((m) => {
          const b = this.mobBox(m);
          return b.x1 > x0 && b.x0 < x1 && b.y1 > y0 && b.y0 < y1;
        });

        inAoE.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
        const hitMobs = inAoE.slice(0, cand.targets);
        const hitCount = hitMobs.length;

        const expectedDmg = avgBase * (cand.dmgPct / 100) * cand.hits;
        let kills = 0;
        let totalDmg = 0;
        for (const m of hitMobs) {
          totalDmg += Math.min(m.hp, expectedDmg);
          if (m.hp <= expectedDmg) kills++;
        }

        const dirBonus = dir === preferredDir ? 15 : 0;
        let score = 0;
        if (hitCount > 0) {
          score = (hitCount * 250) + (kills * 400) + (totalDmg * 0.1) - (cand.mp * 0.2) + dirBonus;
        } else {
          score = (cand.targets * 15) + (expectedDmg * 0.05) + (range * 0.05) - (cand.mp * 0.1) + dirBonus;
        }

        if (score > best.score) {
          best = {
            id: cand.d ? cand.d.id : null,
            range,
            face: dir,
            hitCount,
            score,
          };
        }
      }
    }

    return best;
  }

  /** Picks the best attack among only the skills the player has assigned to their hotbar. */
  bestAttack(dir: -1 | 1): { id: string | null; range: number } {
    const res = this.findBestSkillAttack(dir);
    return { id: res.id, range: res.range };
  }

  /** Checks if an impassable wall (height > 75px) blocks horizontal movement in direction dir. */
  isWallBlocking(x: number, y: number, dir: -1 | 1): boolean {
    for (const w of this.tree.walls) {
      const dx = (w.x1 - x) * dir;
      if (dx >= 0 && dx <= 25) {
        const top = Math.min(w.y1, w.y2);
        const bot = Math.max(w.y1, w.y2);
        if (y >= top && y <= bot + 20) {
          if (y - top > 75) return true;
        }
      }
    }
    return false;
  }

  /** Auto-buffs only skills on the hotbar. */
  autoBuffHotbar() {
    for (const d of this.hotbarSkills()) {
      if (d.kind !== "buff") continue;
      if (this.skillCd[d.id]?.left > 0) continue;
      const b = this.buffs[d.id];
      if ((!b || b.left < 3) && this.stats.mp >= d.mp(this.lv(d.id)) + 10) {
        this.useAction({ t: "skill", id: d.id }, true);
        break;
      }
    }
  }

  /** Finds the horizontal span of the contiguous walkable platform for a foothold. */
  platformBounds(fh: Foothold): { minX: number; maxX: number; leftWall: boolean; rightWall: boolean } {
    const tree = this.tree;
    let curr = fh;
    let minX = curr.x1;
    let leftWall = false;
    let guard = 0;
    while (curr.prev && guard++ < 32) {
      const prev = tree.byId.get(curr.prev);
      if (!prev) break;
      if (prev.x1 === prev.x2) {
        if (prev.y1 > prev.y2 && (prev.y1 - prev.y2) > 75) leftWall = true;
        break;
      }
      curr = prev;
      minX = curr.x1;
    }
    curr = fh;
    let maxX = curr.x2;
    let rightWall = false;
    guard = 0;
    while (curr.next && guard++ < 32) {
      const next = tree.byId.get(curr.next);
      if (!next) break;
      if (next.x1 === next.x2) {
        if (next.y2 < next.y1 && (next.y1 - next.y2) > 75) rightWall = true;
        break;
      }
      curr = next;
      maxX = curr.x2;
    }
    return { minX, maxX, leftWall, rightWall };
  }

  runAuto(dt: number) {
    const ai = this.ai, p = this.p, tree = this.tree;
    ai.keys.clear();
    if (!this.auto.battle || this.map?.id === FREE_MARKET_MAP) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "A", "d", "D", "w", "W", "s", "S", "Alt", " ", "c", "C", "x", "X", "z", "Z"].some((k) => this.keys.has(k)) || Object.keys(this.quick).some((k) => this.pressed.has(k))) ai.hold = 1.2;
    ai.hold = Math.max(0, ai.hold - dt);
    ai.jumpCooldown = Math.max(0, ai.jumpCooldown - dt);
    if (ai.hold > 0 || p.attack > 0) return;
    if (this.auto.loot) ai.keys.add("z");
    for (const [m, t] of ai.ban) if (t < this.time) ai.ban.delete(m);

    // Active retreat to break out of jump loops or obstacles
    if (ai.retreatTime > 0) {
      ai.retreatTime -= dt;
      ai.keys.add(ai.retreatDir > 0 ? "ArrowRight" : "ArrowLeft");
      return;
    }

    // If area boss is defeated and auto-combat is ON, navigate to the right portal to advance to the next area!
    if (this.areaBossDefeated && this.map.id !== FREE_MARKET_MAP) {
      const rightPortal = this.portals.find((pt) => pt.side === "right");
      if (rightPortal) {
        if (Math.abs(rightPortal.x - p.x) < 35 && Math.abs(rightPortal.y - p.y) < 55) {
          ai.keys.add("ArrowUp");
          return;
        }
        const pDir = rightPortal.x > p.x ? "ArrowRight" : "ArrowLeft";
        ai.keys.add(pDir);
        if (rightPortal.y < p.y - 40 && ai.jumpCooldown <= 0) {
          ai.keys.add("Alt");
          ai.jumpCooldown = 0.6;
        }
        return;
      }
    }

    ai.think -= dt;
    const alive = this.liveMobs().filter((m) => !ai.ban.has(m));

    // ---- Smarter target selection -------------------------------------------
    // 1. Prioritize live mobs on the CURRENT contiguous platform first (edge to edge clearing).
    // 2. Next, prefer mobs on the same horizontal band.
    // 3. Finally, pick closest reachable mob.
    const currentPlat = p.fh ? this.platformBounds(p.fh) : null;
    if (!ai.target || ai.target.state === "dead" || ai.target.state === "die1" || ai.think <= 0) {
      ai.think = 0.35;
      let pool = alive;
      if (currentPlat) {
        const onCurrentPlat = alive.filter(
          (m) => m.x >= currentPlat.minX - 15 && m.x <= currentPlat.maxX + 15 && Math.abs(m.y - p.y) < 30
        );
        if (onCurrentPlat.length > 0) pool = onCurrentPlat;
      }
      if (pool === alive) {
        const sameBand = alive.filter((m) => Math.abs(m.y - p.y) < 65);
        pool = sameBand.length ? sameBand : alive;
      }
      let best: Mob | null = null, bs = Infinity;
      for (const m of pool) {
        const sc = Math.abs(m.x - p.x) + Math.abs(m.y - p.y) * 2.8;
        if (sc < bs) { bs = sc; best = m; }
      }
      if (best !== ai.target) ai.stuck = 0;
      ai.target = best;
    }

    // Loot nearby drops when nothing is immediately pressing
    const drop = this.auto.loot ? this.drops.find((d) => !d.picked && d.fh && Math.abs(d.y - p.y) < 30 && Math.abs(d.x - p.x) < 220) : null;
    const t = ai.target;
    const near = t && Math.abs(t.x - p.x) < 140 && Math.abs(t.y - p.y) < 60;
    const goal = drop && !near ? { x: drop.x, y: drop.y } : t ? { x: t.x, y: t.y } : null;
    if (!goal) return;
    const dx = goal.x - p.x, dy = goal.y - p.y;
    const dir = (dx >= 0 ? 1 : -1) as -1 | 1;

    // ---- Area of Effect (AoE) Skill Combat Evaluation -----------------------
    // Calculate best skill in either direction. If any skill hits monsters RIGHT NOW,
    // face that direction and fire immediately!
    const bestCombat = this.findBestSkillAttack(dir);
    if (bestCombat.hitCount > 0) {
      p.face = bestCombat.face;
      this.startAttack(bestCombat.id);
      return;
    }

    // Jump loop detection: jumping repeatedly in place without horizontal progress
    if (p.fh && ai.lastJumpTime > 0 && this.time - ai.lastJumpTime > 0.28) {
      if (Math.abs(p.x - ai.lastJumpX) < 18 && Math.abs(p.y - ai.lastJumpY) < 15) {
        ai.jumpLoopCount++;
        if (ai.jumpLoopCount >= 2) {
          if (t) {
            ai.ban.set(t, this.time + 6); // Ban target so we switch targets
            ai.target = null;
          }
          ai.jumpLoopCount = 0;
          ai.stuck = 0;
          ai.retreatTime = 1.0;
          ai.retreatDir = -dir as -1 | 1;
          ai.lastJumpTime = 0;
          return;
        }
      } else {
        ai.jumpLoopCount = 0;
      }
      ai.lastJumpTime = 0;
    }

    // Stuck detection
    if (Math.abs(p.x - ai.lastX) < 1.5 && !p.ladder) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt * 2);
    ai.lastX = p.x;
    if (ai.stuck > 3.0 && t) {
      ai.ban.set(t, this.time + 6);
      ai.target = null;
      ai.stuck = 0;
      ai.retreatTime = 0.9;
      ai.retreatDir = -dir as -1 | 1;
      return;
    }

    if (ai.ladderCooldown > 0) ai.ladderCooldown -= dt;

    // Ladders & ropes climbing
    if (p.ladder) {
      const L = p.ladder;
      if (dy < -12) {
        // Target is higher up: climb upwards until we land on the top floor
        ai.keys.add("ArrowUp");
        // Near top of ladder: step or jump off towards horizontal goal
        if (p.y <= L.y1 + 4) {
          ai.keys.add(dx >= 0 ? "ArrowRight" : "ArrowLeft");
          ai.pressed.add(" ");
          ai.ladderCooldown = 0.6;
        }
      } else if (dy > 12) {
        // Target is lower down: climb downwards
        ai.keys.add("ArrowDown");
        // Near bottom of ladder: step or jump off
        if (p.y >= L.y2 - 6) {
          ai.keys.add(dx >= 0 ? "ArrowRight" : "ArrowLeft");
          ai.ladderCooldown = 0.6;
        }
      } else {
        // At approximately target's vertical level: dismount horizontally towards target
        ai.keys.add(dx >= 0 ? "ArrowRight" : "ArrowLeft");
        ai.pressed.add(" ");
        ai.ladderCooldown = 0.6;
      }
      return;
    }

    // Airborne handling: air control, ladder grabbing, coyote jump, and War Leap double jump
    if (!p.fh) {
      if (Math.abs(dx) > 8) ai.keys.add(dir > 0 ? "ArrowRight" : "ArrowLeft");

      // Mid-air ladder grab if intersecting a ladder leading toward goal (only if cooldown expired)
      if (ai.ladderCooldown <= 0) {
        const airLadder = this.map.ladders.find(
          (L) => Math.abs(L.x - p.x) < 25 && p.y > L.y1 - 15 && p.y < L.y2 + 15 && ((dy < -10 && L.y1 < p.y) || (dy > 10 && L.y2 > p.y))
        );
        if (airLadder) {
          ai.keys.add(dy < 0 ? "ArrowUp" : "ArrowDown");
          return;
        }
      }

      // Coyote jump if stepped 1px off platform edge
      if (p.coyote > 0 && ai.jumpCooldown <= 0) {
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.35;
        ai.lastJumpX = p.x;
        ai.lastJumpY = p.y;
        ai.lastJumpTime = this.time;
        return;
      }

      // Double jump (War Leap) across gaps or upwards
      const leapOnHotbar = Object.values(this.quick).some((a) => a?.t === "skill" && a.id === "1001008");
      if (leapOnHotbar && !p.leapt && this.lv("1001008") > 0 && p.airTime >= 0.08 && (Math.abs(dx) > 35 || dy < -15)) {
        ai.pressed.add(" ");
      }
      return;
    }

    // Platform navigation
    const plat = currentPlat ?? this.platformBounds(p.fh);
    const onSamePlat = t && (t.x >= plat.minX - 15 && t.x <= plat.maxX + 15 && Math.abs(t.y - p.y) < 30);

    if (onSamePlat) {
      // Target is on the same platform: walk directly toward it and attack when in AoE range
      if (Math.abs(dx) <= bestCombat.range * 0.9) {
        p.face = dir;
        this.startAttack(bestCombat.id);
        return;
      }
      ai.keys.add(dir > 0 ? "ArrowRight" : "ArrowLeft");
      if (ai.stuck > 0.8 && !this.isWallBlocking(p.x, p.y, dir) && ai.jumpCooldown <= 0) {
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.45;
        ai.lastJumpX = p.x;
        ai.lastJumpY = p.y;
        ai.lastJumpTime = this.time;
      }
      return;
    }

    // Target is NOT on the same platform:
    // 1. Drop down or take ladder down if target is below
    if (dy > 25) {
      // 1a. Check for accessible ladder leading down from current platform
      const ladderDown = this.map.ladders
        .filter((L) => L.y2 > p.y + 20 && Math.abs(L.y1 - p.y) < 35 && L.x >= plat.minX - 35 && L.x <= plat.maxX + 35)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (ladderDown && ai.ladderCooldown <= 0) {
        const dist = ladderDown.x - p.x;
        if (Math.abs(dist) > 12) {
          ai.keys.add(dist > 0 ? "ArrowRight" : "ArrowLeft");
        } else {
          ai.keys.add("ArrowDown");
        }
        if (Math.abs(dist) <= 22) {
          ai.keys.add("ArrowDown");
        }
        return;
      }
      // 1b. Drop down through floor if possible
      const below = tree.below(p.x, p.y + 4, p.fh.id);
      if (below && FootholdTree.yAt(below, p.x) - p.y < 600 && Math.abs(dx) < 260) {
        ai.keys.add("ArrowDown");
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.35;
        return;
      }
    }

    // 2. Target is above (dy < -25): prioritize ladder leading up, otherwise overhead platform jump
    if (dy < -25) {
      // 2a. Check for accessible ladder on this platform that leads upward toward the target
      const accessibleLadder = this.map.ladders
        .filter((L) => {
          if (L.y1 >= p.y - 20) return false; // Must lead up
          if (p.y < L.y1 - 10 || p.y > L.y2 + 25) return false; // Must be vertically reachable
          return L.x >= plat.minX - 35 && L.x <= plat.maxX + 35;
        })
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];

      if (accessibleLadder && ai.ladderCooldown <= 0) {
        const dist = accessibleLadder.x - p.x;
        if (Math.abs(dist) > 12) {
          ai.keys.add(dist > 0 ? "ArrowRight" : "ArrowLeft");
        } else {
          ai.keys.add("ArrowUp");
        }
        if (Math.abs(dist) <= 22) {
          ai.keys.add("ArrowUp");
        }
        return;
      }

      // 2b. Check for overhead platforms within jump reach (DeltaY between -20 and -135)
      const overhead = tree.floors
        .filter((f) => {
          if (f.id === p.fh?.id) return false;
          const fy = (f.y1 + f.y2) / 2;
          const deltaY = fy - p.y;
          if (deltaY > -20 || deltaY < -135) return false;
          const minOverlap = Math.max(plat.minX - 40, f.x1 - 40);
          const maxOverlap = Math.min(plat.maxX + 40, f.x2 + 40);
          return minOverlap <= maxOverlap;
        })
        .sort((a, b) => {
          const ay = (a.y1 + a.y2) / 2, by = (b.y1 + b.y2) / 2;
          return Math.abs(ay - goal.y) - Math.abs(by - goal.y);
        })[0];

      if (overhead) {
        const landingX = Math.max(overhead.x1 + 15, Math.min(overhead.x2 - 15, p.x + (dx >= 0 ? 35 : -35)));
        const distToLanding = landingX - p.x;
        if (Math.abs(distToLanding) > 15) {
          ai.keys.add(distToLanding > 0 ? "ArrowRight" : "ArrowLeft");
        }
        if (p.x >= overhead.x1 - 25 && p.x <= overhead.x2 + 25 && ai.jumpCooldown <= 0) {
          ai.pressed.add(" ");
          ai.jumpCooldown = 0.35;
          ai.lastJumpX = p.x;
          ai.lastJumpY = p.y;
          ai.lastJumpTime = this.time;
          return;
        }
      }
    }

    // 3. Edge-to-edge traversal: walk right to the platform edge before leaping across or down
    if (dir > 0) {
      if (plat.rightWall || this.isWallBlocking(plat.maxX, p.y, 1)) {
        if (t) ai.ban.set(t, this.time + 5);
        ai.retreatTime = 0.9;
        ai.retreatDir = -1;
        return;
      }
      ai.keys.add("ArrowRight");
      // Jump at the very edge of the platform to leap across
      if (p.x >= plat.maxX - 14 && ai.jumpCooldown <= 0) {
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.35;
        ai.lastJumpX = p.x;
        ai.lastJumpY = p.y;
        ai.lastJumpTime = this.time;
        return;
      }
    } else {
      if (plat.leftWall || this.isWallBlocking(plat.minX, p.y, -1)) {
        if (t) ai.ban.set(t, this.time + 5);
        ai.retreatTime = 0.9;
        ai.retreatDir = 1;
        return;
      }
      ai.keys.add("ArrowLeft");
      // Jump at the very edge of the platform to leap across
      if (p.x <= plat.minX + 14 && ai.jumpCooldown <= 0) {
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.35;
        ai.lastJumpX = p.x;
        ai.lastJumpY = p.y;
        ai.lastJumpTime = this.time;
        return;
      }
    }
  }

  updatePlayer(dt: number) {
    const p = this.p, s = this.stats, tree = this.tree;
    p.invuln = Math.max(0, p.invuln - dt);
    p.alert = Math.max(0, p.alert - dt);

    // Eye blink animation cycle
    if (p.blinkStep >= 0) {
      p.blinkFrameTimer -= dt;
      if (p.blinkFrameTimer <= 0) {
        p.blinkStep++;
        if (p.blinkStep > 2) {
          p.blinkStep = -1;
          p.expr = "default";
          p.exprFrame = 0;
          p.blinkTimer = 3.0 + Math.random() * 2.5;
        } else {
          p.expr = "blink";
          p.exprFrame = p.blinkStep;
          p.blinkFrameTimer = p.blinkStep === 1 ? 0.12 : 0.08;
        }
      }
    } else {
      p.blinkTimer -= dt;
      if (p.blinkTimer <= 0 && p.attack <= 0 && !p.dead) {
        p.blinkStep = 0;
        p.expr = "blink";
        p.exprFrame = 0;
        p.blinkFrameTimer = 0.08;
      }
    }
    if (p.dead || p.invuln > 1.2) {
      p.expr = "hit";
      p.exprFrame = 0;
    } else if (p.blinkStep < 0) {
      p.expr = "default";
      p.exprFrame = 0;
    }

    const left = this.down("ArrowLeft", "Left", "a", "A");
    const right = this.down("ArrowRight", "Right", "d", "D");
    const up = this.down("ArrowUp", "Up", "w", "W");
    const downK = this.down("ArrowDown", "Down", "s", "S");
    const jump = this.hit("Alt", " ", "Space");
    const dir = (right ? 1 : 0) - (left ? 1 : 0);

    // Quick slots: attacks repeat while held, everything else fires once per press.
    for (const [k, a] of Object.entries(this.quick)) {
      if (!a) continue;
      const isAttack = a.t === "attack" || (a.t === "skill" && (SKILL[a.id]?.kind === "attack" || SKILL[a.id]?.kind === "ranged"));
      if (this.pressed.has(k) || (isAttack && this.keys.has(k) && p.attack <= 0)) this.useAction(a);
    }
    if (this.down("x") && p.attack <= 0) this.startAttack(null);

    // Pick up.
    if (this.down("z", "Z")) {
      for (const d of this.drops) {
        if (d.picked || !d.fh) continue;
        if (Math.abs(d.x - p.x) < 40 && Math.abs(d.y - p.y) < 40) {
          d.picked = 0.001;
          if (d.gear) {
            this.addGear(d.gear);
            this.onChat("item", `You have gained ${RARITY[d.gear.rarity]} ${GEAR.get(d.gear.id)?.name ?? "equipment"}.`);
          } else if (d.mat) {
            this.mats[d.mat] = (this.mats[d.mat] ?? 0) + 1;
            this.onChat("item", `You have gained an item (${MATS.get(d.mat) ?? d.mat})`);
          } else if (d.item) {
            this.inv[d.item] = (this.inv[d.item] ?? 0) + 1;
            this.onChat("item", `You have gained an item (${ITEMS[d.item]?.name ?? d.item})`);
          } else {
            s.meso += d.amount;
            this.onGain("meso", `You have gained mesos (+${d.amount})`);
          }
          this.onChange();
          break;
        }
      }
    }

    // Portals.
    if (up && p.fh && p.attack <= 0) {
      for (const pt of this.portals) {
        if (Math.abs(pt.x - p.x) < 40 && Math.abs(pt.y - p.y) < 60) {
          if (pt.side === "left") {
            if (this.map.id !== FREE_MARKET_MAP) {
              this.prevHuntingMap = this.map.id;
              this.onChat("notice", "Entering Free Market...");
              this.loadMap(FREE_MARKET_MAP, "spawn");
            } else {
              const returnMap = this.prevHuntingMap || 100010000;
              this.onChat("notice", "Returning to hunting area...");
              this.loadMap(returnMap, "left");
            }
            return;
          } else if (pt.side === "right") {
            if (this.map.id === FREE_MARKET_MAP) {
              const returnMap = this.prevHuntingMap || 100010000;
              this.onChat("notice", "Returning to hunting area...");
              this.loadMap(returnMap, "left");
              return;
            }
            if (!this.auto.battle) {
              this.onChat("system", "Auto Combat must be ON to advance to the next area!");
              return;
            }
            if (!this.areaBossDefeated) {
              this.onChat("system", `Defeat the stage boss first before advancing to the next area! (Kills: ${this.stage.kills}/${this.stageNeed})`);
              return;
            }
            this.areaBossDefeated = false;
            this.onChat("notice", "Advancing to next area!");
            this.loadMap(pt.to, "left");
            return;
          }
        }
      }
    }

    // Attacks.
    if (p.attack > 0) {
      p.attack -= dt;
      if (!p.hitDone && p.attack < (p.skill ? 0.45 : 0.32)) { p.hitDone = true; this.resolveAttack(p.skill); }
    }

    // Ladders & ropes.
    if (p.ladder) {
      const L = p.ladder;
      const vy = (downK ? 1 : 0) - (up ? 1 : 0);
      p.y += vy * CLIMB * dt;
      p.x = L.x;

      // Jump dismount: with direction hops off strongly, alone drops off
      if (jump) {
        p.ladder = null;
        if (dir !== 0) {
          p.vx = dir * this.speed() * 1.15;
          p.vy = -JUMP * 0.72;
          p.face = dir as -1 | 1;
        } else {
          p.vx = 0;
          p.vy = -120;
        }
        return;
      }

      // Reaching the top of a ladder/rope
      if (p.y <= L.y1) {
        const land = tree.landingNear(L.x, L.y1 - 35, L.y1 + 35, 32) ?? tree.belowNear(L.x, L.y1 - 10, 32);
        if (land && Math.abs(land.y - L.y1) < 45) {
          p.ladder = null;
          p.fh = land.fh;
          p.x = land.x;
          p.y = land.y;
          p.vy = 0;
        } else {
          p.y = L.y1; // Stop at the top of the rope if no top platform exists
        }
      } else if (p.y >= L.y2) {
        // Reaching the bottom of a ladder/rope
        const land = tree.landingNear(L.x, L.y2 - 25, L.y2 + 45, 32) ?? tree.belowNear(L.x, L.y2 - 10, 32);
        p.ladder = null;
        if (land) {
          p.fh = land.fh;
          p.x = land.x;
          p.y = land.y;
        } else {
          p.vy = 0;
        }
      }
      this.animate(dt, L.isLadder ? "ladder" : "rope", vy !== 0);
      this.checkMobContact();
      return;
    }

    const nearLadder = (yTest: (L: Ladder) => boolean) =>
      tree && this.map.ladders.find((L) => Math.abs(L.x - p.x) < 25 && yTest(L));

    if (p.fh) {
      p.coyote = 0.16;
      p.airTime = 0;
      p.prone = false;
      // Grab ladder upwards / downwards from ground
      if (up && p.attack <= 0) {
        const L = nearLadder((L) => p.y >= L.y1 - 15 && p.y <= L.y2 + 20);
        if (L) { p.ladder = L; p.fh = null; p.x = L.x; p.y = Math.min(p.y - 4, L.y2); this.animate(dt, L.isLadder ? "ladder" : "rope", false); return; }
      }
      if (downK && p.attack <= 0) {
        const L = nearLadder((L) => (Math.abs(L.y1 - p.y) < 30) || (p.y >= L.y1 - 5 && p.y <= L.y2));
        if (L) { p.ladder = L; p.fh = null; p.x = L.x; p.y = Math.max(L.y1 + 12, Math.min(p.y + 10, L.y2)); this.animate(dt, L.isLadder ? "ladder" : "rope", false); return; }
      }
      if (downK && jump && p.attack <= 0) {
        const below = tree.below(p.x, p.y + 4, p.fh.id);
        if (below && FootholdTree.yAt(below, p.x) - p.y < 600) {
          p.ignoreFh = p.fh.id; p.fh = null; p.vy = -120; p.vx = 0; p.coyote = 0;
        }
      } else if (jump && p.attack <= 0) {
        p.fh = null;
        p.vy = -JUMP;
        p.vx = dir !== 0 ? dir * this.speed() : 0;
        p.leapt = false;
        p.coyote = 0;
        p.airTime = 0;
      }
    }

    if (p.fh) {
      const canMove = p.attack <= 0 && !downK;
      const target = canMove ? dir * this.speed() : 0;
      p.leapt = false;
      p.vx += (target - p.vx) * Math.min(1, dt * (target === 0 ? 18 : 12));
      if (Math.abs(p.vx) < 2 && target === 0) p.vx = 0;
      if (dir !== 0 && p.attack <= 0) p.face = dir as -1 | 1;
      const res = groundMove(tree, p, p.vx * dt);
      if (res === "blocked") p.vx = 0;
      p.x = tree.wallClamp(p.x, p.x, p.y);
      if (res === "air") p.vy = 0;
      p.prone = downK && p.attack <= 0;
      const anim = p.attack > 0 ? p.attackAnim : p.prone ? "prone" : Math.abs(p.vx) > 10 ? "walk1" : p.alert > 0 ? "alert" : "stand1";
      this.animate(dt, anim, true);
    } else {
      p.coyote = Math.max(0, p.coyote - dt);
      p.airTime += dt;
      // Airborne: double jump if jump skill learned or double-tapping jump; otherwise single jump arc in place
      if (jump && !downK && p.coyote > 0 && p.attack <= 0) {
        // Coyote jump right off the edge!
        p.vy = -JUMP;
        p.vx = dir !== 0 ? dir * this.speed() : 0;
        p.leapt = false;
        p.coyote = 0;
      } else if (jump && !downK && !p.leapt && p.attack <= 0 && p.airTime > 0.05) {
        p.leapt = true;
        const jumpSkills = ["4001014", "4001011", "1001008", "3001007", "3000008", "5001010", "2001009"];
        const learned = jumpSkills.find((sid) => this.lv(sid) > 0);

        const s = this.stats;
        const dexBoost = (s.dex || 0) * 0.003;
        const lukBoost = (s.luk || 0) * 0.0015;
        const spdBoost = (this.speed() / WALK - 1) * 0.35;
        const lvBoost = (s.level || 1) * 0.004;
        const boost = Math.min(2.5, 1.8 + dexBoost + lukBoost + spdBoost + lvBoost);
        const vyFactor = 0.45 + Math.min(0.3, dexBoost * 0.3 + spdBoost * 0.2);

        const jumpDir = dir !== 0 ? dir : p.face;
        p.face = jumpDir as -1 | 1;
        p.vx = jumpDir * this.speed() * boost;
        p.vy = -JUMP * vyFactor;

        // Visual effect for Flash Jump / War Leap
        const artId = learned ?? "4001014";
        const art = this.skillArt[artId] ?? this.skillArt["1001008"];
        if (art?.effect?.length) {
          this.fx.push({ frames: art.effect, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
        } else if (art?.effect0?.length) {
          this.fx.push({ frames: art.effect0, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
        }
        this.sendAction("skill", artId, "jump");
      }
      const vmax = p.leapt ? Math.max(Math.abs(p.vx), this.speed() * 1.5) : this.speed();
      if (dir !== 0) {
        p.vx += dir * 750 * dt;
        p.vx = Math.max(-vmax, Math.min(vmax, p.vx));
        if (p.attack <= 0) p.face = dir as -1 | 1;
      }
      if ((up || downK) && p.attack <= 0) {
        const L = nearLadder((L) => p.y >= L.y1 - 15 && p.y <= L.y2 + 15);
        if (L) {
          p.ladder = L;
          p.vx = 0;
          p.vy = 0;
          p.x = L.x;
          this.animate(dt, L.isLadder ? "ladder" : "rope", false);
          return;
        }
      }
      airMove(tree, p, dt);
      this.animate(dt, p.attack > 0 ? p.attackAnim : "jump", true);
    }
    this.checkMobContact();
  }

  animate(dt: number, anim: string, advance: boolean) {
    const p = this.p;
    if (p.anim !== anim) { p.anim = anim; p.frame = 0; p.ft = 0; return; }
    if (!advance) return;
    p.ft += dt * 1000;
    const d = ANIMS[anim];
    while (p.ft > d[p.frame]) {
      p.ft -= d[p.frame];
      p.frame = anim.startsWith("swing") ? Math.min(p.frame + 1, d.length - 1) : (p.frame + 1) % d.length;
    }
  }

  mobBox(m: Mob) {
    const st = m.data.books.stand?.[0] ?? m.data.books.move?.[0];
    const w = st ? st.w * 0.7 : 40, h = st ? st.h * 0.85 : 40;
    return { x0: m.x - w / 2, x1: m.x + w / 2, y0: m.y - h, y1: m.y };
  }

  rollDamage(pct: number, mob: Mob) {
    const [lo, hi] = this.damageRange();
    const mobLv = mob.data.meta?.level ?? 1;
    const missChance = Math.max(0.02, Math.min(0.5, 0.06 + (mobLv - this.stats.level) * 0.03 - this.totalDex() * 0.002 - this.lv("1100000") * 0.004));
    if (Math.random() < missChance) return { dmg: 0, miss: true };
    const def = (mob.data.meta?.PDDamage ?? 0) * 0.5;
    const bossMul = mob.boss ? 1 + this.gt.boss / 100 : 1;
    return { dmg: Math.max(1, Math.round((rand(lo, hi) * pct / 100) * bossMul - def)), miss: false };
  }

  resolveAttack(id: string | null) {
    const p = this.p;
    const d: SkillDef | null = id ? SKILL[id] : null;
    const lv = id ? this.lv(id) : 0;
    const range = d?.range ?? 90;
    const x0 = p.face === 1 ? p.x - 10 : p.x - range, x1 = p.face === 1 ? p.x + range : p.x + 10;
    const y0 = p.y - (d ? 100 : 70), y1 = p.y + 10;
    const targets = this.liveMobs()
      .filter((m) => { const b = this.mobBox(m); return b.x1 > x0 && b.x0 < x1 && b.y1 > y0 && b.y0 < y1; })
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))
      .slice(0, d?.targets ?? 1);
    const pct = d?.dmg ? d.dmg(lv) : 100;
    if (d?.kind === "ranged") {
      const hits = d?.hits ?? 1;
      for (const m of targets) {
        for (let h = 0; h < hits; h++) {
          const r = this.rollDamage(pct, m);
          const arcSpread = (h - (hits - 1) / 2) * 12;
          this.projectiles.push({
            x: p.x + p.face * 20,
            y: p.y - 35,
            target: m,
            dmg: r.dmg,
            miss: r.miss,
            t: -h * 0.08,
            skillId: id ?? undefined,
            arcY: arcSpread,
          });
        }
        // Shadow Partner bonus ranged attack (50% damage, less accurate)
        if (this.buffs["4111002"]) {
          const shadowPct = Math.round(pct * 0.5);
          for (let h = 0; h < hits; h++) {
            const r = this.rollDamage(shadowPct, m);
            if (Math.random() < 0.18) r.miss = true;
            const arcSpread = (h - (hits - 1) / 2) * 16 + (Math.sin(this.time * 8 + h) * 12);
            this.projectiles.push({
              x: p.x + (p.face === 1 ? 2 : -2) + p.face * 16,
              y: p.y - 35 + (Math.cos(this.time * 7 + h) * 5),
              target: m,
              dmg: r.dmg,
              miss: r.miss,
              t: -h * 0.08,
              skillId: id ?? undefined,
              isShadow: true,
              arcY: arcSpread,
            });
          }
        }
      }
      return;
    }
    const art = id ? this.skillArt[id] : null;
    for (const m of targets) {
      for (let h = 0; h < (d?.hits ?? 1); h++) {
        if (m.state === "die1" || m.state === "dead") break;
        const r = this.rollDamage(pct, m);
        this.damageMob(m, r.dmg, r.miss);
      }
      // Shadow Partner bonus melee attack (50% damage, less accurate)
      if (this.buffs["4111002"]) {
        const shadowPct = Math.round(pct * 0.5);
        for (let h = 0; h < (d?.hits ?? 1); h++) {
          if (m.state === "die1" || m.state === "dead") break;
          const r = this.rollDamage(shadowPct, m);
          if (Math.random() < 0.18) r.miss = true;
          this.damageMob(m, r.dmg, r.miss);
        }
      }
      if (art?.hit.length) this.fx.push({ frames: art.hit, x: m.x, y: m.y - 25, flip: p.face === 1, t: 0 });
    }
  }

  damageMob(m: Mob, dmg: number, miss: boolean) {
    if (this.oneHitKill) {
      dmg = 9999999;
      miss = false;
    }
    const box = this.mobBox(m);
    const stack = this.dmg.filter((d) => !d.hurt && Math.abs(d.x - m.x) < 30 && d.t < 0.4).length;
    this.dmg.push({ value: dmg, miss, hurt: false, x: m.x, y: box.y0 - 6 - stack * 30, t: 0 });
    if (miss) return;
    m.hp -= dmg;
    m.hpShow = 4;
    m.aggro = 6;
    m.dir = this.p.x < m.x ? -1 : 1;
    if (m.hp <= 0) {
      m.state = "die1"; m.anim = 0; m.frame = 0;
      if (m.boss) { this.endBoss(true); return; }
      const exp = Math.max(1, Math.round((m.data.meta?.exp ?? 5) * m.mul.exp * (1 + this.gt.exp / 100)));
      this.gainExp(exp);
      if (this.stage.kills < STAGE_KILLS) {
        this.stage.kills++;
        if (this.stage.kills === STAGE_KILLS) this.onChat("notice", `Stage ${this.stage.n} boss is ready! Press the BOSS button${this.auto.boss ? " (Auto Boss will challenge it for you)" : ""}.`);
      }
      // Idle tracking (used for offline rewards).
      const id = this.idle;
      id.expPerKill = id.expPerKill * 0.9 + exp * 0.1;
      if (this.auto.battle) id.autoKills++;
      const dropMul = 1 + this.gt.drop / 100, mat = MOB_MAT[m.data.id];
      if (mat && Math.random() < 0.45 * dropMul) this.spawnDrop({ mat }, m.x + rand(-10, 10), m.y - 20, rand(-50, 50));
      if (Math.random() < 0.05 * dropMul) this.spawnDrop({ mat: ORES[Math.floor(Math.random() * Math.min(ORES.length, 2 + Math.floor(this.stage.n / 4)))] }, m.x, m.y - 20, rand(-50, 50), -420);
      if (Math.random() < 0.035 * dropMul) this.spawnDrop({ gear: makeGear(randomGearFor(this.stats.level)) }, m.x, m.y - 20, rand(-50, 50), -420);
      if (Math.random() < 0.14) {
        const pool = [2000000, 2000000, 2000000, 2000003, 2000003, 2000001, 2000002, 2000006];
        this.spawnDrop({ item: pool[Math.floor(Math.random() * pool.length)] }, m.x, m.y - 20, rand(-40, 40), -380);
      }
      if (Math.random() < 0.75) {
        const lv = m.data.meta?.level ?? 5, amt = Math.round(rand(lv * 1.5, lv * 3.5) * m.mul.meso * (1 + this.gt.meso / 100));
        this.idle.mesoPerKill = this.idle.mesoPerKill * 0.9 + amt * 0.75 * 0.1;
        this.spawnDrop({ amount: amt }, m.x, m.y - 20, rand(-40, 40), -380);
      }
    } else {
      if (!m.boss || Math.random() < 0.12) {
        m.state = "hit1"; m.t = m.boss ? 0.25 : 0.5; m.anim = 0; m.frame = 0; m.attacking = undefined;
        if (m.fh && !m.boss) groundMove(this.tree, m, this.p.face * 14, true);
      }
    }
  }

  gainExp(n: number) {
    const s = this.stats;
    s.exp += n;
    this.onGain("exp", `You have gained experience (+${n})`);
    while (s.exp >= expToLevel(s.level)) {
      s.exp -= expToLevel(s.level);
      s.level++;
      const oldJob = s.job;
      s.baseHp += Math.round(rand(18, 22)); s.baseMp += Math.round(rand(4, 6));
      s.ap += 5; s.sp += 3;
      this.recalc();
      s.hp = s.maxHp; s.mp = s.maxMp;
      if (this.auto.ap) this.autoAssign();
      else this.onChat("notice", `You have ${s.ap} Ability Points and ${s.sp} Skill Points. Press S and K to spend them.`);
      if (s.job !== oldJob) this.onChat("level", `You have advanced to ${s.job}! New skills are available in the Skill window (K).`);
      this.onChange();
      this.fx.push({ frames: this.fxData.levelUp, x: this.p.x, y: this.p.y, flip: false, t: 0, follow: true });
      this.onGain("level", `Congratulations! You have reached Level ${s.level}.`);
      if (s.level >= 10 && s.classId === "beginner") {
        this.onJobAdvancementReady?.(1);
        this.onChat("notice", "★ 1st Job Advancement available! Choose your path: Warrior, Magician, Bowman, or Thief!");
      } else if (s.level >= 30 && this.canAdvanceJob(2)) {
        this.onJobAdvancementReady?.(2);
      } else if (s.level >= 60 && this.canAdvanceJob(3)) {
        this.onJobAdvancementReady?.(3);
      }
    }
  }

  checkMobContact() {
    const p = this.p;
    if (p.invuln > 0 || this.godMode || this.gmHide) return;
    for (const m of this.mobs) {
      if (m.state === "die1" || m.state === "dead" || m.alpha < 1) continue;
      const b = this.mobBox(m);
      if (p.x + 12 > b.x0 && p.x - 12 < b.x1 && p.y > b.y0 + 6 && p.y - 60 < b.y1) {
        const dmg = this.hurtAmount(m.atk);
        this.stats.hp = Math.max(0, this.stats.hp - dmg);
        this.dmg.push({ value: dmg, miss: false, hurt: true, x: p.x, y: p.y - 75, t: 0 });
        p.invuln = 2; p.alert = 3;
        const away = p.x < m.x ? -1 : 1;
        p.ladder = null; p.fh = null; p.vx = away * 130; p.vy = -260; p.attack = 0;
        if (this.stats.hp <= 0) this.die();
        return;
      }
    }
  }

  hurtAmount(atk: number) {
    const reduce = (1 - this.lv("1000003") * 0.02) * (100 / (100 + this.gt.def));
    return Math.max(1, Math.round((atk * rand(0.8, 1.2) - this.stats.level * 0.5) * reduce));
  }

  die() {
    if (this.boss) this.endBoss(false);
    const s = this.stats;
    const lost = Math.floor(s.exp * 0.1);
    s.exp -= lost;
    s.hp = Math.round(s.maxHp * 0.5); s.mp = Math.round(s.maxMp * 0.5);
    this.onChat("notice", `You have been defeated and lost ${lost} EXP. Returning to the town spawn.`);
    this.loadMap(this.map.id, "spawn").then(() => { this.p.invuln = 3; });
  }

  // ------------------------------------------------------------ debug GM commands
  setLevel(targetLevel: number) {
    const s = this.stats;
    const oldLevel = s.level;
    s.level = Math.max(1, Math.min(300, targetLevel));
    s.exp = 0;
    const delta = s.level - oldLevel;
    if (delta > 0) {
      s.ap += delta * 5;
      s.sp += delta * 3;
      s.baseHp += delta * 20;
      s.baseMp += delta * 5;
    }
    this.recalc();
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    this.fx.push({ frames: this.fxData.levelUp, x: this.p.x, y: this.p.y, flip: false, t: 0, follow: true });
    this.onChat("notice", `[DEBUG] Level set to ${s.level}.`);
    this.onChange();
  }

  addExp(n: number) {
    this.gainExp(n);
  }

  setJob(classId: ClassId, jobName?: string) {
    const s = this.stats;
    const c = classFor(classId);
    s.classId = c.id;
    s.job = jobName || c.tabs[Math.min(c.tabs.length - 1, s.level >= 60 ? 3 : s.level >= 30 ? 2 : 1)] || c.name;
    this.recalc();
    this.onChat("notice", `[DEBUG] Class set to ${c.name} (${s.job}).`);
    this.onChange();
  }

  giveMesos(amt: number) {
    this.stats.meso = Math.max(0, Math.min(9999999999, this.stats.meso + amt));
    this.onGain("meso", `[DEBUG] Mesos adjusted by ${amt >= 0 ? "+" : ""}${amt.toLocaleString()}. Total: ${this.stats.meso.toLocaleString()}`);
    this.onChange();
  }

  giveItem(id: number, count = 1) {
    this.inv[id] = (this.inv[id] ?? 0) + count;
    this.onChat("item", `[DEBUG] Received ${count}x item (${ITEMS[id]?.name ?? id}).`);
    this.onChange();
  }

  giveMat(id: number, count = 1) {
    this.mats[id] = (this.mats[id] ?? 0) + count;
    this.onChat("item", `[DEBUG] Received ${count}x material (${MATS.get(id) ?? id}).`);
    this.onChange();
  }

  giveAnyItem(id: number, count = 1) {
    const c = Math.max(1, Math.min(999, count));
    if (id < 2000000 || GEAR.has(id)) {
      for (let i = 0; i < c; i++) {
        this.addGear(makeGear(id, 0));
      }
      this.onChat("item", `[GM] Spawned ${c}x gear (${GEAR.get(id)?.name ?? id}).`);
    } else if ((id >= 2000000 && id < 3000000) || ITEMS[id]) {
      this.giveItem(id, c);
    } else {
      this.giveMat(id, c);
    }
    this.onChange();
  }

  async spawnCustomMob(mobId: number, count = 1) {
    try {
      if (!this.mobData.has(mobId)) {
        this.mobData.set(mobId, await json(`/wz/data/mob/${mobId}`));
      }
      const data = this.mobData.get(mobId);
      if (!data) {
        this.onChat("notice", `[GM] Mob #${mobId} data not found.`);
        return;
      }
      await Promise.all(
        Object.values(data.books).flat().map((s) => Promise.resolve(this.assets.load(s.url)).catch(() => null))
      );
      const p = this.p;
      const spawnedCount = Math.max(1, Math.min(50, count));
      for (let i = 0; i < spawnedCount; i++) {
        const offset = (i - Math.floor(spawnedCount / 2)) * 50;
        const x = Math.max(this.tree.minX + 40, Math.min(this.tree.maxX - 40, p.x + offset));
        const fh = this.tree.landing(x, p.y - 100, p.y + 100) ?? p.fh;
        const y = fh ? FootholdTree.yAt(fh, x) : p.y;
        const spawn = { id: mobId, x, y, fh: fh?.id ?? 0, rx0: this.bounds.l + 30, rx1: this.bounds.r - 30 };
        const m = this.makeMob(spawn);
        if (m) {
          m.x = x;
          m.y = y;
          this.mobs.push(m);
        }
      }
      this.onChat("notice", `[GM] Summoned ${spawnedCount}x ${data.name.trim()} (${mobId})!`);
    } catch (e: any) {
      this.onChat("notice", `[GM] Failed to spawn mob #${mobId}: ${e?.message ?? e}`);
    }
  }

  magnetMobs() {
    const p = this.p;
    let count = 0;
    for (const m of this.mobs) {
      if (m.state !== "dead" && m.state !== "die1") {
        m.x = p.x + (Math.random() - 0.5) * 60;
        m.y = p.y;
        m.vx = 0;
        m.vy = 0;
        m.fh = p.fh;
        count++;
      }
    }
    this.onChat("notice", `[GM] Magnetized ${count} monsters to your coordinates.`);
  }

  broadcastNotice(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const notice = `[Notice] ${clean}`;
    this.onChat("notice", notice);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "chat", text: notice, kind: "notice", broadcast: true }));
    }
    window.dispatchEvent(new CustomEvent("gm-broadcast-notice", { detail: { text: clean } }));
  }

  setFame(amt: number) {
    this.stats.fame = Math.max(0, amt);
    this.onChat("notice", `[GM] Fame set to ${this.stats.fame}.`);
    this.onChange();
  }

  fullHeal() {
    this.stats.hp = this.stats.maxHp;
    this.stats.mp = this.stats.maxMp;
    this.onChat("notice", "[DEBUG] Fully restored HP and MP.");
    this.onChange();
  }

  killAllMobs() {
    let count = 0;
    for (const m of this.mobs) {
      if (m.state !== "dead" && m.state !== "die1") {
        this.damageMob(m, 9999999, false);
        count++;
      }
    }
    this.onChat("notice", `[DEBUG] Instakilled ${count} monsters.`);
  }

  maxAllSkills() {
    const c = this.class;
    let count = 0;
    for (const tab of c.skillsByTab) {
      for (const sid of tab) {
        const def = SKILL[sid];
        if (def) {
          this.skillLv[sid] = def.maxLevel;
          count++;
        }
      }
    }
    this.recalc();
    this.onChat("notice", `[DEBUG] Maxed out ${count} skills for ${c.name}.`);
    this.onChange();
  }

  spawnBossImmediate() {
    this.stage.kills = this.stageNeed;
    this.challengeBoss();
  }

  readyBossImmediate() {
    this.stage.kills = this.stageNeed;
    this.onChat("notice", `[DEBUG] Stage ${this.stage.n} boss is now ready!`);
    this.onChange();
  }

  advanceStageImmediate() {
    this.areaBossDefeated = true;
    const pt = this.portals.find((p) => p.side === "right");
    if (pt) {
      this.loadMap(pt.to, "left");
      this.onChat("notice", "[DEBUG] Force advanced to next area.");
    }
  }

  updateMob(m: Mob, dt: number) {
    const tree = this.tree;
    m.hpShow = Math.max(0, m.hpShow - dt);
    m.aggro = Math.max(0, m.aggro - dt);
    const books = m.data.books;
    const play = (book: string, loop: boolean) => {
      const fr = books[book] ?? books.stand;
      if (!fr?.length) return true;
      if (m.frame >= fr.length) m.frame = 0;
      m.anim += dt * 1000;
      while (m.anim > (fr[m.frame]?.delay ?? 150)) {
        m.anim -= (fr[m.frame]?.delay ?? 150);
        if (m.frame + 1 >= fr.length) {
          if (!loop) {
            m.frame = fr.length - 1;
            return true;
          }
          m.frame = 0;
        } else {
          m.frame++;
        }
      }
      return false;
    };

    if (m.state === "dead") {
      m.respawn -= dt;
      if (m.boss) { this.mobs = this.mobs.filter((x) => x !== m); return; }
      if (m.respawn <= 0) Object.assign(m, this.makeMob(m.spawn), { alpha: 0 });
      return;
    }
    if (m.alpha < 1) m.alpha = Math.min(1, m.alpha + dt * 1.5);
    if (m.state === "die1") {
      if (play("die1", false)) { m.state = "dead"; m.respawn = rand(6, 9); }
      return;
    }
    if (!m.fh) {
      airMove(tree, m, dt);
      play("stand", true);
      return;
    }
    if (m.state === "hit1") {
      m.t -= dt;
      play("hit1", true);
      if (m.t <= 0) { m.state = "move"; m.t = rand(1, 3); m.frame = 0; m.anim = 0; }
      return;
    }
    if (m.boss) { this.updateBoss(m, dt, play); return; }
    m.t -= dt;
    if (this.gmHide) m.aggro = 0;
    if (m.aggro > 0) {
      m.state = "move";
      m.dir = this.p.x < m.x ? -1 : 1;
    } else if (m.t <= 0) {
      m.state = Math.random() < 0.4 ? "stand" : "move";
      m.dir = Math.random() < 0.5 ? -1 : 1;
      m.t = rand(1.2, 3.5);
      m.frame = 0; m.anim = 0;
    }
    if (m.state === "move") {
      const speed = 70 * (1 + (m.data.meta?.speed ?? 0) / 100) * (m.aggro > 0 ? 1.25 : 1);
      const res = groundMove(tree, m, m.dir * speed * dt, true);
      const lo = Math.min(m.spawn.rx0, m.spawn.rx1), hi = Math.max(m.spawn.rx0, m.spawn.rx1);
      if (res === "blocked" || (hi > lo && (m.x < lo || m.x > hi))) {
        m.dir = (m.dir * -1) as -1 | 1;
        if (hi > lo) m.x = Math.max(lo, Math.min(hi, m.x));
        if (m.fh) m.y = FootholdTree.yAt(m.fh, Math.max(m.fh.x1, Math.min(m.fh.x2, m.x)));
      }
      play(books.move ? "move" : "stand", true);
    } else play("stand", true);
  }

  /** Bosses chase the player and periodically use their real attack/skill animations as an area hit. */
  updateBoss(m: Mob, dt: number, play: (book: string, loop: boolean) => boolean) {
    const p = this.p, books = m.data.books;
    const dx = p.x - m.x;
    if (m.attacking) {
      if (play(m.attacking, false)) {
        if (Math.abs(dx) < 230 && Math.abs(p.y - m.y) < 140 && p.invuln <= 0 && this.stats.hp > 0) {
          const dmg = this.hurtAmount(m.atk * 1.6);
          this.stats.hp = Math.max(0, this.stats.hp - dmg);
          this.dmg.push({ value: dmg, miss: false, hurt: true, x: p.x, y: p.y - 75, t: 0 });
          p.invuln = 1.5; p.alert = 3; p.ladder = null; p.fh = null; p.vx = (dx < 0 ? -1 : 1) * 200; p.vy = -320; p.attack = 0;
          if (this.stats.hp <= 0) this.die();
        }
        m.attacking = undefined; m.skillT = rand(3, 5.5); m.frame = 0; m.anim = 0;
      }
      return;
    }
    m.skillT = (m.skillT ?? 3) - dt;
    m.dir = dx < 0 ? -1 : 1;
    const atkBook = ["attack1", "skill1"].filter((b) => books[b]?.length);
    if (m.skillT <= 0 && Math.abs(dx) < 280 && atkBook.length) {
      m.attacking = atkBook[Math.floor(Math.random() * atkBook.length)]; m.frame = 0; m.anim = 0;
      return;
    }
    if (m.skillT <= 0) { m.skillT = rand(3, 5); if (books.jump && m.fh) { m.vy = -480; m.fh = null; return; } }
    if (Math.abs(dx) > 50) {
      const res = groundMove(this.tree, m, m.dir * 75 * dt, true);
      if (res === "blocked") m.skillT = Math.min(m.skillT, 0.3);
      play(books.move ? "move" : "stand", true);
      if (m.state !== "move") { m.state = "move"; }
    } else { if (m.state !== "stand") { m.state = "stand"; m.frame = 0; m.anim = 0; } play("stand", true); }
  }

  updateDrops(dt: number) {
    const magnet = this.auto.battle && this.auto.magnet;
    for (const d of this.drops) {
      d.t += dt;
      if (d.picked) {
        d.picked += dt;
        d.x += (this.p.x - d.x) * Math.min(1, dt * 14);
        d.y += (this.p.y - 25 - d.y) * Math.min(1, dt * 14);
        continue;
      }
      // Meso magnet: resting drops and airborne drops are swiftly drawn toward the player
      if (magnet && (d.t > 0.12 || d.fh)) {
        const dx = this.p.x - d.x, dy = (this.p.y - 20) - d.y, dist = Math.hypot(dx, dy) || 1;
        const mt = Math.min(2.0, d.t);
        const baseSpeed = 420 + mt * mt * 850; // starts fast at 420 px/s, quickly ramping to 1200+ px/s
        const speed = Math.min(dist, baseSpeed * dt);
        d.x += (dx / dist) * speed;
        d.y += (dy / dist) * speed;
        d.fh = null; // in flight toward the player; physics stays off
        d.ignoreFh = undefined;
        d.vx = 0; d.vy = 0;
      } else if (!d.fh) {
        airMove(this.tree, d, dt);
        if (d.fh) d.vx = 0;
      }
    }
    this.drops = this.drops.filter((d) => (d.picked ? d.picked < 0.22 : d.t < 60));
    // Magnet collects anything it has pulled onto the player.
    if (magnet) {
      for (const d of this.drops) {
        if (d.picked) continue;
        if (Math.abs(d.x - this.p.x) < 36 && Math.abs(d.y - (this.p.y - 20)) < 36) d.picked = 0.001;
      }
    }
  }

  // ------------------------------------------------------------ equipment
  equip(uid: string) {
    const i = this.bag.findIndex((g) => g.uid === uid);
    if (i < 0) return false;
    const g = this.bag[i], b = GEAR.get(g.id)!;
    if (this.stats.level < b.req) { this.onChat("system", `You need to be Lv. ${b.req} to equip ${b.name}.`); return false; }
    // Find the first empty destination socket for this item's category.
    const sockets = this.socketsFor(b.slot);
    let target: Slot | null = null;
    for (const s of sockets) {
      if (!this.eq[s]) { target = s; break; }
    }
    if (!target) target = sockets[0]; // all full: swap into the first socket
    this.bag.splice(i, 1);
    const old = this.eq[target];
    if (old) this.bag.push(old);
    this.eq[target] = g;
    this.recalc(); this.refreshLook(); this.onChange();
    return true;
  }
  unequip(slot: Slot) {
    const g = this.eq[slot];
    if (!g) return;
    delete this.eq[slot];
    this.bag.push(g);
    this.recalc(); this.refreshLook(); this.onChange();
  }
  equipVisual(uid: string) {
    const i = this.bag.findIndex((g) => g.uid === uid);
    if (i < 0) return false;
    const g = this.bag[i];
    const b = GEAR.get(g.id);
    if (!b) return false;
    const sockets = this.socketsFor(b.slot);
    let target: Slot | null = null;
    for (const s of sockets) {
      if (!this.visualEq[s]) { target = s; break; }
    }
    if (!target) target = sockets[0];
    this.bag.splice(i, 1);
    const old = this.visualEq[target];
    if (old) this.bag.push(old);
    this.visualEq[target] = g;
    this.refreshLook(); this.onChange();
    return true;
  }
  unequipVisual(slot: Slot) {
    const g = this.visualEq[slot];
    if (!g) return;
    delete this.visualEq[slot];
    this.bag.push(g);
    this.refreshLook(); this.onChange();
  }
  sellGear(uid: string) {
    const i = this.bag.findIndex((g) => g.uid === uid);
    if (i < 0) return;
    const g = this.bag[i], price = npcSellPrice(g);
    this.bag.splice(i, 1); this.stats.meso += price;
    this.onGain("meso", `Sold ${GEAR.get(g.id)?.name} for ${price.toLocaleString()} mesos.`);
    this.onChange();
  }
  sellJunk() {
    const junk = this.bag.filter((g) => g.rarity === 0 && g.star === 0);
    let total = 0;
    for (const g of junk) total += npcSellPrice(g);
    this.bag = this.bag.filter((g) => !junk.includes(g));
    this.stats.meso += total;
    this.onGain("meso", junk.length ? `Sold ${junk.length} Normal items for ${total.toLocaleString()} mesos.` : "No Normal-grade items to sell.");
    this.onChange();
  }
  findGear(uid: string) {
    return this.bag.find((g) => g.uid === uid) ??
      Object.values(this.eq).find((g) => g?.uid === uid) ??
      Object.values(this.visualEq).find((g) => g?.uid === uid) ??
      null;
  }
  addGear(g: Gear) {
    this.bag.push(g);
    this.onChange();
  }

  // ------------------------------------------------------------ crafting
  canCraft(r: Recipe) {
    return this.stats.level >= r.level && this.stats.meso >= r.meso && r.needs.every(([id, n]) => (this.mats[id] ?? 0) >= n);
  }
  craft(r: Recipe) {
    if (!this.canCraft(r)) return null;
    for (const [id, n] of r.needs) this.mats[id] -= n;
    this.stats.meso -= r.meso;
    let msg = "";
    if (r.out.t === "mat") { this.mats[r.out.id] = (this.mats[r.out.id] ?? 0) + r.out.n; msg = `Crafted ${MATS.get(r.out.id)} ×${r.out.n}.`; }
    else if (r.out.t === "use") { this.inv[r.out.id] = (this.inv[r.out.id] ?? 0) + r.out.n; msg = `Crafted ${r.name}.`; }
    else {
      const id = recipeGearId(r.out.slot, r.out.tier);
      if (!id) return null;
      const g = makeGear(id, 1.2, 1);
      this.addGear(g);
      msg = `Crafted ${RARITY[g.rarity]} ${GEAR.get(id)?.name}!`;
    }
    this.onChat("item", msg); this.onChange();
    return msg;
  }
  enhance(uid: string): "success" | "fail" | "max" | "cost" | null {
    const g = this.findGear(uid);
    if (!g) return null;
    if (g.star >= 15) return "max";
    const cost = starCost(g), mat = starMat(g.star);
    if (this.stats.meso < cost || (this.mats[mat] ?? 0) < 1) return "cost";
    this.stats.meso -= cost; this.mats[mat]--;
    const ok = Math.random() < starRate(g.star);
    if (ok) g.star++;
    this.recalc(); this.onChange();
    this.onChat(ok ? "level" : "system", ok ? `Star Force succeeded! ${GEAR.get(g.id)?.name} is now ★${g.star}.` : `Star Force failed. ${GEAR.get(g.id)?.name} stays at ★${g.star}.`);
    return ok ? "success" : "fail";
  }
  cube(uid: string): boolean {
    const g = this.findGear(uid);
    if (!g) return false;
    const cost = cubeCost(g);
    if (this.stats.meso < cost || (this.mats[4000010] ?? 0) < 5) return false;
    this.stats.meso -= cost; this.mats[4000010] -= 5;
    const up = [0.3, 0.1, 0.04, 0.015, 0][g.rarity];
    const tier = Math.random() < up;
    if (tier) g.rarity++;
    g.pot = rollPotential(GEAR.get(g.id)!.slot, Math.max(1, g.rarity));
    if (g.rarity === 0) g.rarity = 1;
    this.recalc(); this.onChange();
    this.onChat(tier ? "level" : "item", tier ? `Potential tier up! ${GEAR.get(g.id)?.name} is now ${RARITY[g.rarity]}.` : `Potential reset on ${GEAR.get(g.id)?.name}.`);
    return true;
  }

  // ------------------------------------------------------------ auction house
  ahBuy(lid: string) {
    const L = this.ah.listings.find((l) => l.lid === lid);
    if (!L) return false;
    if (this.stats.meso < L.price) { this.onChat("system", "You don't have enough mesos."); return false; }
    this.stats.meso -= L.price;
    this.receive(L.goods);
    this.ah.listings = this.ah.listings.filter((l) => l !== L);
    this.onChat("item", `Bought ${goodsName(L.goods)} from ${L.seller} for ${L.price.toLocaleString()} mesos.`);
    this.onChange();
    return true;
  }
  receive(g: Goods) {
    if (g.t === "gear") this.addGear(g.gear);
    else if (g.t === "mat") this.mats[g.id] = (this.mats[g.id] ?? 0) + g.n;
    else this.inv[g.id] = (this.inv[g.id] ?? 0) + g.n;
  }
  ahList(goods: Goods, price: number) {
    // Remove the goods from the player's inventory first.
    if (goods.t === "gear") { const i = this.bag.findIndex((x) => x.uid === goods.gear.uid); if (i < 0) return false; this.bag.splice(i, 1); }
    else if (goods.t === "mat") { if ((this.mats[goods.id] ?? 0) < goods.n) return false; this.mats[goods.id] -= goods.n; }
    else { if ((this.inv[goods.id] ?? 0) < goods.n) return false; this.inv[goods.id] -= goods.n; }
    const fee = Math.ceil(price * 0.01);
    this.stats.meso = Math.max(0, this.stats.meso - fee);
    this.ah.mine.push({ lid: `M${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, goods, price: Math.max(1, Math.round(price)), listedAt: Date.now(), sold: false });
    this.onChat("system", `Listed ${goodsName(goods)} for ${price.toLocaleString()} mesos (fee ${fee}).`);
    this.onChange();
    return true;
  }
  ahCollect(lid: string) {
    const i = this.ah.mine.findIndex((m) => m.lid === lid);
    if (i < 0) return;
    const m = this.ah.mine[i];
    if (m.sold) { const net = Math.floor(m.price * (1 - AH_TAX)); this.stats.meso += net; this.onGain("meso", `Collected ${net.toLocaleString()} mesos from the Auction House.`); }
    else { this.receive(m.goods); this.onChat("system", `Cancelled your listing for ${goodsName(m.goods)}.`); }
    this.ah.mine.splice(i, 1);
    this.onChange();
  }

  // ------------------------------------------------------------ stages & bosses
  stageMul(n = this.stage.n) { return { hp: Math.pow(1.16, n - 1), dmg: Math.pow(1.07, n - 1), exp: Math.pow(1.11, n - 1), meso: Math.pow(1.1, n - 1) }; }
  get stageNeed() { return STAGE_KILLS; }
  bossReady() { return this.stage.kills >= STAGE_KILLS && !this.boss; }
  bossFor(n = this.stage.n) { return BOSSES[(n - 1) % BOSSES.length]; }

  async challengeBoss() {
    if (this.boss || this.bossLoading || !this.bossReady() || this.loadingMap) return;
    this.bossLoading = true;
    const id = this.bossFor();
    try {
      if (!this.mobData.has(id)) this.mobData.set(id, await json(`/wz/data/mob/${id}`));
      const data = this.mobData.get(id)!;
      await Promise.race([Promise.all(Object.values(data.books).flat().map((s) => Promise.resolve(this.assets.load(s.url)).catch(() => null))), new Promise((r) => setTimeout(r, 15000))]);
      const p = this.p;
      const ref = this.mobs.find((m) => !m.boss);
      const refHp = ref ? ref.maxHp : 100 * this.stageMul().hp;
      const x = Math.max(this.tree.minX + 60, Math.min(this.tree.maxX - 60, p.x + p.face * 260));
      const fh = this.tree.landing(x, p.y - 200, p.y + 200) ?? p.fh;
      const spawn = { id, x, y: fh ? FootholdTree.yAt(fh, x) : p.y, fh: fh?.id ?? 0, rx0: this.bounds.l + 30, rx1: this.bounds.r - 30 };
      const m = this.makeMob(spawn)!;
      m.boss = true;
      m.maxHp = m.hp = Math.round(refHp * 28 * (1 + this.stage.n * 0.04));
      m.atk = Math.round((ref?.atk ?? 15) * 2.2);
      m.mul = { exp: (ref?.mul.exp ?? 1) * 1, meso: ref?.mul.meso ?? 1 };
      m.aggro = 999; m.skillT = 3; m.alpha = 0;
      this.mobs.push(m);
      this.boss = m;
      this.bossTimer = 120;
      this.onChat("notice", `Stage ${this.stage.n} boss: ${data.name.trim()} has appeared! Defeat it within 2 minutes.`);
      this.onBoss(m);
    } finally { this.bossLoading = false; }
  }
  endBoss(won: boolean) {
    const m = this.boss;
    if (!m) return;
    this.boss = null;
    if (!won) {
      this.mobs = this.mobs.filter((x) => x !== m);
      this.onChat("notice", `${m.data.name.trim()} escaped. Gather your strength and challenge it again.`);
    } else {
      const s = this.stage;
      const ref = this.mobs.find((x) => !x.boss);
      const exp = Math.round((ref?.data.meta?.exp ?? 15) * (ref?.mul.exp ?? 1) * 18);
      this.gainExp(exp);
      for (let i = 0; i < 6; i++) this.spawnDrop({ amount: Math.round(rand(20, 40) * m.mul.meso * (1 + this.gt.meso / 100)) }, m.x + rand(-60, 60), m.y - 30, rand(-90, 90), -rand(380, 520));
      const gearN = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < gearN; i++) this.spawnDrop({ gear: makeGear(randomGearFor(this.stats.level + 5), 1.6, 1) }, m.x + rand(-40, 40), m.y - 30, rand(-80, 80), -480);
      const bm = MOB_MAT[m.data.id];
      if (bm) for (let i = 0; i < 3; i++) this.spawnDrop({ mat: bm }, m.x + rand(-50, 50), m.y - 30, rand(-70, 70), -440);
      for (let i = 0; i < 2; i++) this.spawnDrop({ mat: ORES[Math.min(ORES.length - 1, Math.floor(s.n / 3) % ORES.length)] }, m.x + rand(-50, 50), m.y - 30, rand(-70, 70), -440);
      s.n++; s.kills = 0; s.best = Math.max(s.best, s.n);
      this.areaBossDefeated = true;
      this.onChat("level", `Stage cleared! Welcome to Stage ${s.n}. Monsters grow stronger — and so do their rewards.`);
      this.onChat("notice", "★ Area Boss Defeated! Enter the right portal with Auto Combat ON to advance to the next area!");
      for (const x of this.mobs) if (!x.boss) { const sc = this.stageMul(); x.maxHp = Math.round((x.data.meta?.maxHP ?? 50) * sc.hp); x.hp = Math.min(x.hp, x.maxHp); x.mul = { exp: sc.exp, meso: sc.meso }; x.atk = this.mobAtk(x.data); }
    }
    this.onBoss(null);
    this.onChange();
  }
  mobAtk(d: MobData) { return Math.max(1, (d.meta?.physicalDamage ?? 10) * 0.4 * this.stageMul().dmg); }

  /** Grants progress earned while the game was closed (auto battle at 60% efficiency, up to 12 h). */
  offlineRewards(savedAt: number) {
    const seconds = Math.min(12 * 3600, Math.max(0, (Date.now() - savedAt) / 1000));
    if (seconds < 120) return;
    const kills = Math.floor(seconds * this.idle.killRate * 0.6);
    if (kills <= 0) return;
    const exp = Math.round(kills * this.idle.expPerKill);
    const meso = Math.round(kills * this.idle.mesoPerKill);
    const mats: Record<number, number> = {};
    const mm = this.map ? [...new Set(this.map.spawns.map((s) => MOB_MAT[s.id]).filter(Boolean))] : [4000001];
    for (const id of mm) mats[id] = Math.floor((kills * 0.35) / mm.length);
    mats[ORES[Math.floor(Math.random() * 3)]] = Math.floor(kills * 0.04);
    const gear: Gear[] = [];
    for (let i = 0; i < Math.min(8, Math.floor(kills / 120)); i++) gear.push(makeGear(randomGearFor(this.stats.level), 0.4));
    this.onOffline({ seconds, kills, exp, meso, mats, gear });
  }
  claimOffline(r: { kills: number; exp: number; meso: number; mats: Record<number, number>; gear: Gear[] }, mult = 1) {
    this.stats.meso += Math.round(r.meso * mult);
    for (const [id, n] of Object.entries(r.mats)) this.mats[+id] = (this.mats[+id] ?? 0) + Math.round(n * mult);
    for (const g of r.gear) this.addGear(g);
    this.stage.kills = Math.min(STAGE_KILLS, this.stage.kills + r.kills);
    this.gainExp(Math.round(r.exp * mult));
    this.onChange();
  }

  // ------------------------------------------------------------ save data
  save() {
    return {
      v: 1, stats: this.stats, inv: this.inv, skillLv: this.skillLv, quick: this.quick, auto: this.auto, map: this.map?.id,
      mats: this.mats, bag: this.bag, eq: this.eq, visualEq: this.visualEq, stage: this.stage, idle: this.idle, ah: this.ah.save(), savedAt: Date.now(),
    };
  }
  restore(d: any) {
    if (!d || d.v !== 1) return;
    Object.assign(this.stats, d.stats ?? {});
    if (d.inv) this.inv = d.inv;
    if (d.skillLv) this.skillLv = d.skillLv;
    if (d.quick) this.quick = d.quick;
    if (d.auto) Object.assign(this.auto, d.auto, { battle: true });
    if (d.mats) this.mats = d.mats;
    if (d.bag) this.bag = d.bag.filter((g: Gear) => GEAR.has(g.id));
    if (d.eq) { this.eq = {}; for (const [k, g] of Object.entries(d.eq as Record<string, Gear>)) if (g && GEAR.has(g.id)) this.eq[k as Slot] = g; }
    if (d.visualEq) { this.visualEq = {}; for (const [k, g] of Object.entries(d.visualEq as Record<string, Gear>)) if (g && GEAR.has(g.id)) this.visualEq[k as Slot] = g; }
    this.refreshLook();
    if (d.stage) Object.assign(this.stage, d.stage);
    if (d.idle) Object.assign(this.idle, d.idle);
    if (d.ah) this.ah.restore(d.ah);
    this.recalc();
  }

  // ------------------------------------------------------------ rendering
  draw() {
    const r = this.r;
    r.resize();
    r.begin();
    if (!this.map) { r.end(); return; }
    const cx = Math.round(this.cam.x), cy = Math.round(this.cam.y);
    this.drawBacks(false, cx, cy);
    const mt = this.assets.get(this.map.render);
    if (mt) r.draw(mt, -this.map.renderOrigin.x - cx, -this.map.renderOrigin.y - cy);

    // Portals.
    const pf: Sprite[] = this.fxData?.portal;
    if (pf?.length && this.portals.length) {
      const ready = pf.filter((f) => f.w > 2 && f.h > 2);
      let fr: Sprite | null = null;
      let tex: Tex | null = null;
      if (ready.length) {
        const total = ready.reduce((n, f) => n + (f.delay ?? 100), 0) || 700;
        let t = (this.time * 1000) % total;
        fr = ready[ready.length - 1];
        for (const f of ready) {
          const d = f.delay ?? 100;
          if (t < d) { fr = f; break; }
          t -= d;
        }
        tex = this.assets.get(fr.url);
        if (tex) {
          this.lastPortalTex = tex;
          this.lastPortalFr = fr;
        }
      }
      if (!tex && this.lastPortalTex && this.lastPortalFr) {
        tex = this.lastPortalTex;
        fr = this.lastPortalFr;
      }
      if (tex && fr) {
        for (const pt of this.portals) {
          r.draw(tex, Math.round(pt.x - fr.ox - cx), Math.round(pt.y - fr.oy - cy), fr.w, fr.h);
        }
      }
    }

    for (const m of this.mobs) this.drawMob(m, cx, cy);
    for (const d of this.drops) {
      if (d.item || d.mat || d.gear) {
        const t = this.assets.get(itemIconRaw(d.item ?? d.mat ?? d.gear!.id));
        if (t && d.gear && d.gear.rarity > 0) {
          const c = [[1, 1, 1], [0.4, 0.85, 1], [0.78, 0.49, 1], [1, 0.8, 0.2], [0.36, 1, 0.48]][d.gear.rarity];
          const pulse = 0.35 + 0.25 * Math.sin(this.time * 6);
          r.rect(Math.round(d.x - 12 - cx), Math.round(d.y - 4 - cy), 24, 4, [c[0], c[1], c[2], pulse]);
        }
        if (t) r.draw(t, Math.round(d.x - t.w / 2 - cx), Math.round(d.y - t.h - cy - (d.fh ? Math.abs(Math.sin(d.t * 3)) * 3 : 0)), t.w, t.h, { alpha: d.picked ? Math.max(0, 1 - d.picked / 0.45) : 1 });
        continue;
      }
      const fr: Sprite = this.fxData.meso[Math.floor(d.t * 8) % this.fxData.meso.length];
      const t = fr && this.assets.get(fr.url);
      if (t) r.draw(t, d.x - fr.ox - cx, d.y - fr.oy - cy - (d.fh ? Math.abs(Math.sin(d.t * 3)) * 3 : 0), fr.w, fr.h, { alpha: d.picked ? Math.max(0, 1 - d.picked / 0.45) : 1 });
    }
    for (const rp of this.remotePlayers.values()) {
      this.drawRemotePlayer(rp, cx, cy);
    }
    this.drawPlayer(cx, cy);
    for (const f of this.fx) this.drawFx(f, cx, cy);
    // Projectiles render with the skill's real ball frame when available, otherwise
    // the first effect frame or shared snail-shell sprite.
    for (const pr of this.projectiles) {
      if (pr.t < 0) continue;
      let fr: Sprite | null = null;
      if (pr.skillId) {
        const art = this.skillArt[pr.skillId];
        if (art?.ball?.length) {
          fr = art.ball[Math.floor(pr.t * 12) % art.ball.length];
        } else if (this.throwingStarFrames.length > 0 && (pr.skillId.startsWith("4") || this.stats.classId === "thief")) {
          fr = this.throwingStarFrames[Math.floor(this.time * 24) % this.throwingStarFrames.length];
        } else if (art?.effect?.length) {
          fr = art.effect[0];
        }
      }
      if (!fr && this.throwingStarFrames.length > 0 && (this.stats.classId === "thief" || this.p.skill?.startsWith("4"))) {
        fr = this.throwingStarFrames[Math.floor(this.time * 24) % this.throwingStarFrames.length];
      }
      if (!fr) fr = this.snailShell;
      if (!fr) continue;
      const st = this.assets.get(fr.url);
      if (st) {
        const ox = fr.ox ?? Math.round(fr.w / 2);
        const oy = fr.oy ?? Math.round(fr.h / 2);
        const art = pr.skillId ? this.skillArt[pr.skillId] : null;
        const isStar = this.throwingStarFrames.includes(fr);
        const movingRight = pr.target ? pr.target.x >= pr.x : this.p.face === 1;
        const flip = (art?.ball && art.ball.length > 1) ? (Math.floor(pr.t * 12) % 2 === 0) : (isStar ? (Math.floor(this.time * 20) % 2 === 0) : movingRight);
        r.draw(st, Math.round(pr.x - ox - cx), Math.round(pr.y - oy - cy), fr.w, fr.h, { flip, alpha: 1.0 });
      } else {
        this.assets.load(fr.url);
      }
    }
    for (const m of this.mobs) this.drawMobHp(m, cx, cy);
    for (const d of this.dmg) this.drawDamage(d, cx, cy);
    this.drawBacks(true, cx, cy);
    if (this.fade > 0) r.rect(0, 0, r.width, r.height, [0, 0, 0, this.fade]);
    if (this.loadingMap) r.rect(0, 0, r.width, r.height, [0, 0, 0, 1]);
    r.end();
  }

  drawBacks(front: boolean, cx: number, cy: number) {
    const r = this.r, W = r.width, H = r.height;
    const WO = W / 2, HO = H / 2;
    const camCenterX = cx + WO;
    const camCenterY = cy + HO;
    for (const b of this.map.backs) {
      if (b.front !== front) continue;
      const s = b.sprite, t = this.assets.get(s.url);
      if (!t) continue;
      const cxx = b.cx || s.w, cyy = b.cy || s.h;
      const hmove = b.type === 4 || b.type === 6, vmove = b.type === 5 || b.type === 7;
      const htile = [1, 3, 4, 6, 7].includes(b.type), vtile = [2, 3, 5, 6, 7].includes(b.type);
      const ox = b.flip ? s.w - s.ox : s.ox;
      const baseX = (hmove ? b.x + this.time * b.rx * 5 - cx : b.x + WO + (b.rx * cx) / 100) - ox;
      const baseY = (vmove ? b.y + this.time * b.ry * 5 - cy : b.y + Math.min(HO, 300) + (b.ry * (camCenterY - 300)) / 100) - s.oy;

      const minI = htile ? Math.floor(-baseX / cxx) : 0;
      const maxI = htile ? Math.ceil((W - baseX) / cxx) : 0;
      const allowVTile = vtile || (b.type === 1 && s.h >= 600);
      const minJ = allowVTile ? Math.floor(-baseY / cyy) : 0;
      const maxJ = allowVTile ? Math.ceil((H - baseY) / cyy) : 0;

      for (let i = minI; i <= maxI; i++) {
        for (let j = minJ; j <= maxJ; j++) {
          r.draw(t, Math.round(baseX + i * cxx), Math.round(baseY + j * cyy), s.w, s.h, { flip: b.flip, alpha: b.a / 255 });
        }
      }
    }
  }

  drawNameTag(name: string, x: number, y: number, cx: number, cy: number) {
    const tex = renderTextTexture(this.r, name, "name");
    if (tex) {
      this.r.draw(tex, Math.round(x - tex.w / 2 - cx), Math.round(y + 2 - cy), tex.w, tex.h);
    }
  }

  drawSpeechBalloon(text: string, x: number, y: number, cx: number, cy: number) {
    const tex = renderTextTexture(this.r, text, "balloon");
    if (tex) {
      this.r.draw(tex, Math.round(x - tex.w / 2 - cx), Math.round(y - 75 - tex.h - cy), tex.w, tex.h);
    }
  }

  drawItemEffect(eff: ItemEffData, x: number, y: number, face: number, anim: string, cx: number, cy: number, layer: "back" | "front") {
    let actionFrames: ItemEffFrame[] | undefined;
    if (anim === "ladder" || anim === "rope") {
      if (layer === "back") {
        actionFrames = eff.actions[anim] ?? eff.actions.backDefault ?? eff.actions.default;
      } else {
        actionFrames = eff.actions[anim + "2"];
      }
    } else {
      const candidate = eff.actions[anim] ?? eff.actions.default;
      if (candidate?.length) {
        const isBack = (candidate[0]?.z ?? 0) < 0;
        if ((layer === "back" && isBack) || (layer === "front" && !isBack)) {
          actionFrames = candidate;
        }
      }
    }
    if (!actionFrames?.length) return;
    const totalDelay = actionFrames.reduce((acc, f) => acc + (f.delay ?? 100), 0) || 800;
    let t = (this.time * 1000) % totalDelay;
    let fr = actionFrames[0];
    for (const f of actionFrames) {
      const d = f.delay ?? 100;
      if (t < d) { fr = f; break; }
      t -= d;
    }
    const tex = this.assets.get(fr.url);
    if (!tex) {
      this.assets.load(fr.url);
      return;
    }
    const isFixed = Boolean(fr.fixed ?? eff.fixed);
    const flip = isFixed ? false : face === 1;
    const drawX = flip ? Math.round(x - (fr.w - fr.ox) - cx) : Math.round(x - fr.ox - cx);
    const anchorY = fr.pos === 1 ? y - 48 : fr.pos === 2 ? y - 25 : fr.pos === 3 ? y - 65 : y;
    const drawY = Math.round(anchorY - fr.oy - cy);
    this.r.draw(tex, drawX, drawY, fr.w, fr.h, { flip });
  }

  drawRemotePlayer(rp: RemotePlayer, cx: number, cy: number) {
    const isFloating = this.hasHoverEffect(rp.look) && rp.anim !== "jump" && rp.anim !== "ladder" && rp.anim !== "rope";
    const hoverY = isFloating ? Math.round(Math.sin(this.time * 3.2) * 5 - 10) : 0;
    if (hoverY !== 0) {
      const shadowW = Math.max(12, 28 + Math.round(hoverY * 0.4));
      const shadowAlpha = Math.max(0.15, 0.35 + (hoverY / 30));
      this.r.rect(Math.round(rp.x - shadowW / 2 - cx), Math.round(rp.y - 2 - cy), shadowW, 4, [0, 0, 0, shadowAlpha * 0.6]);
      this.r.rect(Math.round(rp.x - (shadowW - 8) / 2 - cx), Math.round(rp.y - 1 - cy), Math.max(4, shadowW - 8), 2, [0, 0, 0, shadowAlpha]);
    }

    const drawPosY = rp.y + hoverY;

    const remoteEffs: ItemEffData[] = [];
    for (const id of rp.look) {
      if (!this.itemEffCache.has(id)) {
        this.itemEffCache.set(id, null);
        fetch(`/wz/data/item-eff/${id}`).then((r) => r.ok ? r.json() : null).then((data) => {
          if (data) {
            this.itemEffCache.set(id, data);
            for (const act of Object.values(data.actions as Record<string, ItemEffFrame[]>)) {
              for (const fr of act) this.assets.load(fr.url);
            }
          }
        }).catch(() => {});
      }
      const cached = this.itemEffCache.get(id);
      if (cached && !remoteEffs.some((e) => e.id === cached.id)) remoteEffs.push(cached);
    }
    for (const eff of remoteEffs) {
      this.drawItemEffect(eff, rp.x, drawPosY, rp.face, rp.anim, cx, cy, "back");
    }
    let t = this.assets.get(charUrlFor(rp.look, rp.anim, rp.frame))
      ?? this.assets.get(charUrlFor(rp.look, "stand1", 0));
    if (t) {
      rp.lastTex = t;
    } else if (rp.lastTex) {
      t = rp.lastTex;
    }
    if (t) {
      const ox = Math.round(t.w / 2);
      const oy = t.w === 96 && t.h === 96 ? 88 : t.h === 384 ? 256 : Math.round(t.h * (256 / 384));
      this.r.draw(t, Math.round(rp.x - ox - cx), Math.round(drawPosY - oy - cy), t.w, t.h, { flip: rp.face === 1 });
    }
    for (const eff of remoteEffs) {
      this.drawItemEffect(eff, rp.x, drawPosY, rp.face, rp.anim, cx, cy, "front");
    }
    this.drawNameTag(rp.name, rp.x, drawPosY, cx, cy);
    if (rp.balloon && rp.balloon.t > 0 && rp.balloon.text) {
      this.drawSpeechBalloon(rp.balloon.text, rp.x, drawPosY, cx, cy);
    }
  }

  drawPlayer(cx: number, cy: number) {
    const p = this.p;
    const isFloating = this.hasHoverEffect() && !!p.fh && !p.ladder;
    const hoverY = isFloating ? Math.round(Math.sin(this.time * 3.2) * 5 - 10) : 0;
    if (hoverY !== 0) {
      const shadowW = Math.max(12, 28 + Math.round(hoverY * 0.4));
      const shadowAlpha = Math.max(0.15, 0.35 + (hoverY / 30));
      this.r.rect(Math.round(p.x - shadowW / 2 - cx), Math.round(p.y - 2 - cy), shadowW, 4, [0, 0, 0, shadowAlpha * 0.6]);
      this.r.rect(Math.round(p.x - (shadowW - 8) / 2 - cx), Math.round(p.y - 1 - cy), Math.max(4, shadowW - 8), 2, [0, 0, 0, shadowAlpha]);
    }

    const drawPosY = p.y + hoverY;

    // 1. Back item effects (drawn before character sprite)
    for (const eff of this.activeItemEffs) {
      this.drawItemEffect(eff, p.x, drawPosY, p.face, p.anim, cx, cy, "back");
    }

    // 2. Character sprite
    const currentUrl = charUrlFor(this.look, p.anim, p.frame, p.expr, p.exprFrame);
    let t = this.assets.get(currentUrl)
      ?? this.assets.get(charUrlFor(this.look, p.anim, p.frame))
      ?? this.assets.get(charUrlFor(this.look, "stand1", 0))
      ?? (this.prevLook.length ? this.assets.get(charUrlFor(this.prevLook, p.anim, p.frame)) : null);
    if (!this.assets.get(currentUrl)) {
      this.assets.load(currentUrl);
    }
    if (t) {
      this.lastPlayerTex = t;
    } else if (this.lastPlayerTex) {
      t = this.lastPlayerTex;
    }
    if (t) {
      const invulnBlink = p.invuln > 0 && Math.floor(this.time * 16) % 2 === 0;
      const isDarkSight = !!this.buffs["4001003"];
      const baseAlpha = invulnBlink ? 0.35 : (isDarkSight || this.gmHide ? 0.45 : 1);

      // Fixed anchor for character sprites: 96x96 has origin centered horizontally at 48, feet at 88; 384x384 has center at 192, feet at 256
      const ox = Math.round(t.w / 2);
      const oy = t.w === 96 && t.h === 96 ? 88 : t.h === 384 ? 256 : Math.round(t.h * (256 / 384));

      // Shadow Partner clone: authentic .wz sprite from 411.img special, no delay, original opacity
      if (this.buffs["4111002"]) {
        const shadowAnim = p.anim;
        const shadowFrame = p.frame;
        const shadowFace = p.face;
        const shadowOffset = shadowFace === 1 ? -18 : 18;
        const shadowDrawX = p.x + shadowOffset;
        const shadowDrawY = drawPosY;

        const actionFrames = this.shadowPartnerArt[shadowAnim] ?? this.shadowPartnerArt.stand1;
        const fr = actionFrames?.[shadowFrame % (actionFrames?.length || 1)];
        let drawn = false;

        if (fr) {
          const st = this.assets.get(fr.url);
          if (st) {
            const shOx = shadowFace === 1 ? (st.w - fr.ox) : fr.ox;
            const shOy = fr.oy;
            this.r.draw(st, Math.round(shadowDrawX - shOx - cx), Math.round(shadowDrawY - shOy - cy), st.w, st.h, {
              flip: shadowFace === 1,
              alpha: baseAlpha,
            });
            drawn = true;
          } else {
            this.assets.load(fr.url);
          }
        }
        if (!drawn) {
          let shadowTex = this.assets.get(charUrlFor(this.look, shadowAnim, shadowFrame, p.expr, p.exprFrame))
            ?? this.assets.get(charUrlFor(this.look, shadowAnim, shadowFrame))
            ?? t;
          this.r.draw(shadowTex, Math.round(shadowDrawX - ox - cx), Math.round(shadowDrawY - oy - cy), shadowTex.w, shadowTex.h, {
            flip: shadowFace === 1,
            alpha: baseAlpha,
          });
        }
      }

      this.r.draw(t, Math.round(p.x - ox - cx), Math.round(drawPosY - oy - cy), t.w, t.h, {
        flip: p.face === 1,
        alpha: baseAlpha,
      });
    }

    // 3. Front item effects (drawn after character sprite)
    for (const eff of this.activeItemEffs) {
      this.drawItemEffect(eff, p.x, drawPosY, p.face, p.anim, cx, cy, "front");
    }

    this.drawNameTag(this.stats.name, p.x, drawPosY, cx, cy);

    if (this.balloon && this.balloon.t > 0 && this.balloon.text) {
      this.drawSpeechBalloon(this.balloon.text, p.x, drawPosY, cx, cy);
    }
  }

  drawMob(m: Mob, cx: number, cy: number) {
    if (m.state === "dead") return;
    const book = m.attacking ?? (m.state === "move" ? (m.data.books.move ? "move" : "stand") : m.state);
    const bookFrames = m.data.books[book] ?? m.data.books.stand;
    if (!bookFrames?.length) return;
    const safeFrame = Math.max(0, Math.min(bookFrames.length - 1, m.frame));
    const fr = bookFrames[safeFrame] ?? bookFrames[0];
    if (!fr) return;
    let t = this.assets.get(fr.url);
    let useFr = fr;
    // Fallback if current animation frame is loading: prevent flickering/blinking
    if (!t) {
      const altFr = bookFrames.find((f) => this.assets.get(f.url))
        ?? m.data.books.stand?.find((f) => this.assets.get(f.url));
      if (altFr) {
        t = this.assets.get(altFr.url);
        useFr = altFr;
      } else if (m.lastTex && m.lastFr) {
        t = m.lastTex;
        useFr = m.lastFr;
      }
    }
    if (!t) return;
    m.lastTex = t;
    m.lastFr = useFr;
    const flip = m.dir === 1;
    const left = flip ? m.x - (useFr.w - useFr.ox) : m.x - useFr.ox;
    this.r.draw(t, Math.round(left - cx), Math.round(m.y - useFr.oy - cy), useFr.w, useFr.h, { flip, alpha: m.alpha });
  }

  /** Render authentic MapleStory ladders and ropes matching map vectors */
  drawLadders(cx: number, cy: number) {
    if (!this.map?.ladders?.length) return;
    const r = this.r;
    for (const L of this.map.ladders) {
      const x = Math.round(L.x - cx);
      const y1 = Math.round(L.y1 - cy);
      const y2 = Math.round(L.y2 - cy);
      const h = y2 - y1;
      if (h <= 0) continue;
      // Skip if off screen
      if (x < -40 || x > r.width + 40 || y2 < -20 || y1 > r.height + 20) continue;

      if (L.isLadder) {
        // --- Authentic MapleStory Wooden Ladder ---
        const halfW = 10;
        const lx = x - halfW;
        const rx = x + halfW - 3;

        // Vertical Rails (3px wide each)
        r.rect(lx, y1, 3, h, [0.18, 0.12, 0.08, 1]); // outer shadow
        r.rect(lx + 1, y1, 2, h, [0.55, 0.38, 0.22, 1]); // wood core
        r.rect(lx + 1, y1, 1, h, [0.76, 0.56, 0.35, 1]); // highlight

        r.rect(rx, y1, 3, h, [0.18, 0.12, 0.08, 1]); // outer shadow
        r.rect(rx + 1, y1, 2, h, [0.55, 0.38, 0.22, 1]); // wood core
        r.rect(rx + 1, y1, 1, h, [0.76, 0.56, 0.35, 1]); // highlight

        // Top Metal Brackets / Hooks
        r.rect(lx - 2, y1 - 3, 5, 4, [0.3, 0.32, 0.38, 1]);
        r.rect(rx, y1 - 3, 5, 4, [0.3, 0.32, 0.38, 1]);

        // Horizontal Rungs every 16px
        const rungW = rx - (lx + 3);
        const rungStep = 16;
        const startY = y1 + 8;
        for (let ry = startY; ry < y2 - 4; ry += rungStep) {
          r.rect(lx + 3, ry + 1, rungW, 2, [0.22, 0.15, 0.1, 1]);
          r.rect(lx + 3, ry, rungW, 1, [0.82, 0.62, 0.4, 1]);
        }
      } else {
        // --- Authentic MapleStory Twisted Hemp Rope ---
        const rox = x - 3;

        // Top Mounting Ring
        r.rect(x - 5, y1 - 6, 10, 4, [0.25, 0.25, 0.28, 1]);
        r.rect(x - 3, y1 - 5, 6, 2, [0.45, 0.48, 0.52, 1]);

        // Rope Body
        r.rect(rox, y1, 6, h, [0.32, 0.22, 0.12, 1]); // dark hemp outline
        r.rect(rox + 1, y1, 4, h, [0.72, 0.54, 0.33, 1]); // golden-brown cord

        // Diagonal braids every 6px
        for (let ry = y1; ry < y2; ry += 6) {
          const segH = Math.min(3, y2 - ry);
          r.rect(rox + 1, ry, 3, segH, [0.88, 0.72, 0.48, 1]);
          if (ry + 3 < y2) {
            r.rect(rox + 2, ry + 3, 3, Math.min(3, y2 - (ry + 3)), [0.48, 0.34, 0.19, 1]);
          }
        }

        // Bottom knot / tassel
        r.rect(x - 4, y2 - 2, 8, 6, [0.55, 0.38, 0.22, 1]);
        r.rect(x - 2, y2 + 4, 4, 4, [0.75, 0.58, 0.36, 1]);
      }
    }
  }

  drawMobHp(m: Mob, cx: number, cy: number) {
    if (m.hpShow <= 0 || m.state === "dead" || m.state === "die1") return;
    const b = this.mobBox(m);
    const w = 50, x = Math.round(m.x - w / 2 - cx), y = Math.round(b.y0 - 14 - cy);
    this.r.rect(x - 1, y - 1, w + 2, 7, [0.1, 0.1, 0.1, 0.85]);
    this.r.rect(x, y, w, 5, [0.35, 0.05, 0.05, 1]);
    this.r.rect(x, y, Math.max(0, (m.hp / m.maxHp) * w), 5, [0.95, 0.2, 0.25, 1]);
  }

  drawFx(f: Fx, cx: number, cy: number) {
    let t = f.t, i = 0;
    while (i < f.frames.length && t > (f.frames[i].delay ?? 100)) { t -= f.frames[i].delay ?? 100; i++; }
    const fr = f.frames[i];
    if (!fr) return;
    const tex = this.assets.get(fr.url);
    if (!tex) {
      this.assets.load(fr.url);
      return;
    }
    const x = f.follow ? this.p.x : f.x, y = f.follow ? this.p.y : f.y;
    const left = f.flip ? x - (fr.w - fr.ox) : x - fr.ox;
    this.r.draw(tex, Math.round(left - cx), Math.round(y - fr.oy - cy), fr.w, fr.h, { flip: f.flip });
  }

  drawDamage(d: DmgText, cx: number, cy: number) {
    const fx = this.fxData;
    const rise = Math.min(1, d.t / 1.0) * 40;
    const alpha = d.t > 0.9 ? Math.max(0, 1 - (d.t - 0.9) / 0.6) : 1;
    if (d.miss) {
      const s: Sprite = fx.miss, t = s && this.assets.get(s.url);
      if (t) this.r.draw(t, Math.round(d.x - s.w / 2 - cx), Math.round(d.y - rise - s.h - cy), s.w, s.h, { alpha });
      return;
    }
    const str = String(d.value);
    const glyphs: Sprite[] = [...str].map((c, i) => (i === 0 ? (d.hurt ? fx.hurtFirst : fx.dmgFirst)[c] : (d.hurt ? fx.hurt : fx.dmg)[c]));
    const overlap = 6;
    const total = glyphs.reduce((a, g) => a + (g?.w ?? 20) - overlap, overlap);
    let x = d.x - total / 2;
    const base = d.y - rise;
    glyphs.forEach((g, i) => {
      if (!g) return;
      const t = this.assets.get(g.url);
      if (t) this.r.draw(t, Math.round(x - cx), Math.round(base - g.h - (i === 0 ? 4 : 0) - cy), g.w, g.h, { alpha });
      x += g.w - overlap;
    });
  }
}
