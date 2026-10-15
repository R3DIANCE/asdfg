import { ComponentBase } from "@orillusion/core";
import { Assets, json, type Sprite } from "./assets.ts";
import type { Renderer, Tex } from "./gpu.ts";
import { FootholdTree, airMove, groundMove, type Foothold, type Ladder } from "./physics.ts";
import { AH_TAX, AuctionHouse, goodsName, type Goods } from "./auction.ts";
import {
  GEAR, MATS, MOB_MAT, ORES, cubeCost, gearStats, makeGear, randomGearFor, rollPotential, recipeGearId, starCost, starMat, starRate,
  npcSellPrice, type Gear, type Recipe, type Slot, RARITY, isHoverItem, gearIcon, matIcon,
} from "./items.ts";
import { DEFAULT_QUICK, ITEMS, SKILL, SKILL_DEFS, classFor, type ClassId, itemIcon, itemIconRaw, type Action, type SkillArt, type SkillDef } from "./skills.ts";
import { preloadIcon } from "./util.ts";

export * from "./game-types.ts";
import {
  type Back,
  type MapData,
  type MobData,
  type ItemEffFrame,
  type ItemEffData,
  type RemotePlayer,
  type Mob,
  type Drop,
  type Projectile,
  type Fx,
  type DmgText,
  type Portal,
  type Stats,
  type AutoSettings,
  type ChatKind,
  FREE_MARKET_MAP,
  HUNTING_AREAS,
  MAP_LINKS,
  BODY,
  DEFAULT_LOOK,
  charUrlFor,
  BOSSES,
  STAGE_KILLS,
  ANIMS,
  EXP_TABLE,
  expToLevel,
  WALK,
  JUMP,
  CLIMB,
  rand,
} from "./game-types.ts";
import { WorldRenderer } from "./systems/render-system.ts";
import { AutoCombatSystem } from "./systems/auto-combat.ts";
import { StageSystem } from "./systems/stage-system.ts";

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
    const id = item.item ?? item.mat ?? item.gear?.id;
    if (id) {
      if (this.assets) this.assets.load(itemIconRaw(id));
      preloadIcon(itemIcon(id));
    }
    this.drops.push({ x, y, vx, vy, fh: null, amount: 0, t: 0, picked: 0, ...item });
  }

  preloadItemIcons() {
    for (const idStr of Object.keys(this.inv)) preloadIcon(itemIcon(Number(idStr)));
    for (const idStr of Object.keys(this.mats)) preloadIcon(matIcon(Number(idStr)));
    for (const g of Object.values(this.eq)) if (g) preloadIcon(gearIcon(g.id));
    for (const g of Object.values(this.visualEq)) if (g) preloadIcon(gearIcon(g.id));
    for (const g of this.bag) if (g) preloadIcon(gearIcon(g.id));
    for (const a of Object.values(this.quick)) {
      if (a && a.t === "item") preloadIcon(itemIcon(a.id));
    }
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

  setGm(val: boolean) {
    try {
      if (val) localStorage.setItem("ms_is_gm", "true");
      else localStorage.removeItem("ms_is_gm");
    } catch {}
    this.onChange();
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
    ladderIntent: null as "up" | "down" | null,
    ladderTimeout: 0,
    ladderTopStuckTimer: 0,
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

  async initGame(startMap = FREE_MARKET_MAP) {
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
    for (const s of [...fxs, ...this.fxData.meso, ...this.fxData.portal, this.fxData.miss, ...(this.fxData.levelUp ?? [])] as Sprite[]) if (s) loads.push(this.assets.load(s.url));
    for (const a of Object.values(this.skillArt)) for (const f of [...a.effect, ...a.effect0, ...a.hit, ...(a.ball ?? [])]) this.assets.load(f.url);
    await this.loadMap(startMap, "spawn");
    this.updateActiveItemEffs();
    this.preloadItemIcons();
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
    this.onChange();

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
    if (c.tabs.length >= 5 && level >= c.tabLevel[4]) return c.tabs[4];
    if (c.tabs.length >= 4 && level >= c.tabLevel[3]) return c.tabs[3];
    if (c.tabs.length >= 3 && level >= c.tabLevel[2]) return c.tabs[2];
    if (c.tabs.length >= 2 && level >= c.tabLevel[1]) return c.tabs[1];
    return c.tabs[0];
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
    const oldName = this.stats.name;
    this.stats.name = clean;
    try {
      localStorage.setItem("ms_player_name", clean);
      localStorage.setItem("ms_current_character", clean);
      if (oldName && oldName !== clean) {
        const oldSave = localStorage.getItem(`maple-wayfarer-save-${oldName}`);
        if (oldSave) {
          localStorage.setItem(`maple-wayfarer-save-${clean}`, oldSave);
          localStorage.removeItem(`maple-wayfarer-save-${oldName}`);
        }
      }
    } catch {}
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "name", name: clean, oldName }));
    }
    fetch("/api/characters/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldName, newName: clean }),
    }).catch(() => null);
    window.dispatchEvent(new CustomEvent("character-renamed", { detail: { oldName, newName: clean } }));
    this.onChat("notice", `Character name has been changed to "${clean}".`);
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
        if (pr.target?.data && pr.target.state !== "dead" && pr.target.state !== "die1") {
          this.damageMob(pr.target, pr.dmg, pr.miss);
        }
        if (pr.skillId) {
          const art = this.skillArt[pr.skillId];
          if (art?.hit?.length) this.fx.push({ frames: art.hit, x: pr.target.x, y: pr.target.y - 25, flip: this.p.face === 1, t: 0 });
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
  liveMobs() { return AutoCombatSystem.liveMobs(this); }
  hotbarSkills() { return AutoCombatSystem.hotbarSkills(this); }
  findBestSkillAttack(preferredDir: -1 | 1) { return AutoCombatSystem.findBestSkillAttack(this, preferredDir); }
  bestAttack(dir: -1 | 1) {
    const res = AutoCombatSystem.findBestSkillAttack(this, dir);
    return { id: res.id, range: res.range };
  }
  isWallBlocking(x: number, y: number, dir: -1 | 1) { return AutoCombatSystem.isWallBlocking(this.tree, x, y, dir); }
  autoBuffHotbar() { AutoCombatSystem.autoBuffHotbar(this); }
  platformBounds(fh: Foothold) { return AutoCombatSystem.platformBounds(this.tree, fh); }
  runAuto(dt: number) { AutoCombatSystem.update(this, dt); }

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
        const land = tree.landingNear(L.x, L.y1 - 45, L.y1 + 45, 48) ?? tree.belowNear(L.x, L.y1 - 10, 48);
        if (land && Math.abs(land.y - L.y1) < 55) {
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
        const land = tree.landingNear(L.x, L.y2 - 30, L.y2 + 55, 48) ?? tree.belowNear(L.x, L.y2 - 10, 48);
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
    if (!m || !m.data || !m.data.books) {
      return { x0: (m?.x ?? 0) - 20, x1: (m?.x ?? 0) + 20, y0: (m?.y ?? 0) - 40, y1: m?.y ?? 0 };
    }
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
    if (!m || !m.data) return;
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
        this.ai.ladderIntent = null;
        this.ai.ladderCooldown = 0.6;
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
    if (!m || !m.data || !m.data.books) return;
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
      if (m.respawn <= 0) {
        const fresh = this.makeMob(m.spawn);
        if (fresh) Object.assign(m, fresh, { alpha: 0 });
      }
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
  stageMul(n = this.stage.n) { return StageSystem.stageMul(n); }
  get stageNeed() { return STAGE_KILLS; }
  bossReady() { return StageSystem.bossReady(this); }
  bossFor(n = this.stage.n) { return StageSystem.bossFor(n); }
  challengeBoss() { return StageSystem.challengeBoss(this); }
  endBoss(won: boolean) { return StageSystem.endBoss(this, won); }
  mobAtk(d: MobData) { return Math.max(1, (d.meta?.physicalDamage ?? 10) * 0.4 * this.stageMul().dmg); }
  offlineRewards(savedAt: number) { return StageSystem.offlineRewards(this, savedAt); }
  claimOffline(r: { kills: number; exp: number; meso: number; mats: Record<number, number>; gear: Gear[] }, mult = 1) {
    return StageSystem.claimOffline(this, r, mult);
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
    if (d.auto) {
      Object.assign(this.auto, d.auto);
      if (typeof d.auto.battle === "boolean") this.auto.battle = d.auto.battle;
      if (typeof d.auto.boss === "boolean") this.auto.boss = d.auto.boss;
    }
    if (d.mats) this.mats = d.mats;
    if (d.bag) this.bag = d.bag.filter((g: Gear) => GEAR.has(g.id));
    if (d.eq) { this.eq = {}; for (const [k, g] of Object.entries(d.eq as Record<string, Gear>)) if (g && GEAR.has(g.id)) this.eq[k as Slot] = g; }
    if (d.visualEq) { this.visualEq = {}; for (const [k, g] of Object.entries(d.visualEq as Record<string, Gear>)) if (g && GEAR.has(g.id)) this.visualEq[k as Slot] = g; }
    this.refreshLook();
    if (d.stage) Object.assign(this.stage, d.stage);
    if (d.idle) Object.assign(this.idle, d.idle);
    if (d.ah) this.ah.restore(d.ah);
    this.recalc();
    this.preloadItemIcons();
  }

  // ------------------------------------------------------------ rendering
  draw() {
    WorldRenderer.draw(this);
  }

  drawBacks(front: boolean, cx: number, cy: number) { WorldRenderer.drawBacks(this, front, cx, cy); }
  drawMob(m: Mob, cx: number, cy: number) { WorldRenderer.drawMob(this, m, cx, cy); }
  drawPlayer(cx: number, cy: number) { WorldRenderer.drawPlayer(this, cx, cy); }
}
