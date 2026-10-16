import { ComponentBase } from "@orillusion/core";
import { Assets, json, type Sprite } from "./assets.ts";
import type { Renderer, Tex } from "./gpu.ts";
import { FootholdTree, airMove, groundMove, type Foothold, type Ladder } from "./physics.ts";
import { AH_TAX, AuctionHouse, goodsName, type Goods } from "./auction.ts";
import {
  GEAR, MATS, MOB_MAT, ORES, cubeCost, gearStats, makeGear, randomGearFor, rollPotential, recipeGearId, starCost, starMat, starRate,
  npcSellPrice, type Gear, type Recipe, type Slot, RARITY, isHoverItem, isWizetHat, isRavenPersona, gearIcon, matIcon,
  getWeaponStandAnim, getWeaponWalkAnim,
} from "./items.ts";
import { DEFAULT_QUICK, ITEMS, SKILL, SKILL_DEFS, classFor, type ClassId, itemIcon, itemIconRaw, type Action, type SkillArt, type SkillDef } from "./skills.ts";
import { preloadIcon } from "./util.ts";

import { type Guild, type GuildEmblem, GuildClient } from "./guild.ts";
import { type Party, PartyClient } from "./party.ts";
import { DamageSkinSystem, DAMAGE_SKIN_PRESETS } from "./systems/damage-skin-system.ts";
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
  type PetInstance,
} from "./game-types.ts";
import { WorldRenderer, STATUS_UI, EXP_UI, MENU_UI } from "./systems/render-system.ts";
import { AutoCombatSystem } from "./systems/auto-combat.ts";
import { StageSystem } from "./systems/stage-system.ts";
import { PetSystem } from "./systems/pet-system.ts";
import {
  NetworkSystem,
  CombatSystem,
  InventorySystem,
  MobSystem,
  StatsSystem,
  GmSystem,
  EconomySystem,
  emptyGt,
} from "./core/index.ts";
import { getMapSecretTeleporters } from "./secret-teleporters.ts";

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
  pets: PetInstance[] = [];
  portals: Portal[] = [];
  teleportCooldown = 0;
  lastPortalTex: Tex | null = null;
  lastPortalFr: Sprite | null = null;
  fxData: any;
  bounds = { l: 0, r: 0, t: 0, b: 0 };
  cam = { x: 0, y: 0 };
  time = 0;
  loadingMap = false;
  fade = 1;
  onChat: (kind: ChatKind, text: string, itemLink?: any) => void = () => {};
  onLog: (kind: ChatKind, text: string) => void = () => {};
  onGain: (kind: "level" | "meso" | "exp", text: string) => void = () => {};
  onMapChange: (m: MapData) => void = () => {};
  guild: Guild | null = null;
  guildId?: string;
  guildName?: string;
  guildEmblem?: GuildEmblem;
  party: Party | null = null;
  partyId?: string;

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
    MobSystem.spawnDrop(this, item, x, y, vx, vy);
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
  sessionReplaced = false;
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
  hud: any = null;
  windows: any = null;
  shadowPartnerArt: Record<string, Sprite[]> = {};
  fps = 60;
  damageSkin: number | string = 0;
  lastMagnetBroadcast = 0;

  setDamageSkin(skinId: number | string) {
    this.damageSkin = isNaN(Number(skinId)) ? skinId : Number(skinId);
    try {
      localStorage.setItem("ms_damage_skin", String(this.damageSkin));
    } catch {}
    DamageSkinSystem.preloadSkin(this, this.damageSkin);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "damage_skin", skinId: this.damageSkin }));
    }
    const def = DamageSkinSystem.getSkin(this.damageSkin);
    this.onChat("notice", `[Damage Skin] Active skin set to: ${def.name} (#${def.id})`);
    this.onChange();
  }

  hasWizetHat(look?: number[]): boolean {
    if (look) {
      for (const id of look) {
        if (isWizetHat(id)) return true;
      }
      return false;
    }
    if (this.eq?.hat && isWizetHat(this.eq.hat.id)) return true;
    if (this.visualEq?.hat && isWizetHat(this.visualEq.hat.id)) return true;
    return false;
  }

  isGm(): boolean {
    if (this.hasWizetHat()) return true;
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
    ladder: null as Ladder | null, attack: 0, aiAttack: false, attackAnim: "swingO1", hitDone: false, skill: null as string | null,
    invuln: 0, prone: false, alert: 0, regen: 0, dead: false, leapt: false,
    coyote: 0, airTime: 0,
  };

  keys = new Set<string>();
  pressed = new Set<string>();
  savedPosition: { x: number; y: number; face?: number } | null = null;

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

  async init(startMapOrParam: any, spawnPos?: { x: number; y: number }) {
    if (typeof startMapOrParam === "number") {
      return this.initGame(startMapOrParam, spawnPos);
    }
    super.init(startMapOrParam);
    if (startMapOrParam?.r && !this.r) {
      this.r = startMapOrParam.r;
      this.assets = new Assets(this.r);
    }
  }

  async initGame(startMap = FREE_MARKET_MAP, spawnPos?: { x: number; y: number }) {
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
    try {
      const savedSkin = localStorage.getItem("ms_damage_skin");
      if (savedSkin) {
        this.damageSkin = isNaN(Number(savedSkin)) ? savedSkin : Number(savedSkin);
      }
    } catch {}
    DamageSkinSystem.preloadSkin(this, this.damageSkin);
    DamageSkinSystem.preloadSkin(this, 0);
    const statusSprites = [
      STATUS_UI.backgrnd,
      STATUS_UI.cover,
      STATUS_UI.hpBar,
      STATUS_UI.mpBar,
      STATUS_UI.lvTag,
      STATUS_UI.gaugeSlash,
      ...STATUS_UI.aniHp,
      ...STATUS_UI.lvNum,
      ...STATUS_UI.gaugeNum,
      EXP_UI.backgrnd,
      EXP_UI.effect,
      ...Object.values(EXP_UI.res).flatMap((r) => [r.back, r.gauge, r.cover]),
      ...Object.values(EXP_UI.num),
      ...MENU_UI.buttons.flatMap((b) => [
        MENU_UI.sprites(b.name, "normal"),
        MENU_UI.sprites(b.name, "mouseOver"),
        MENU_UI.sprites(b.name, "pressed"),
      ]),
      ...MENU_UI.notify,
      ...Object.entries(MENU_UI.submenu.items).flatMap(([cat, items]) =>
        items.flatMap((it) => [
          MENU_UI.submenu.sprite(cat, it.label, "normal"),
          MENU_UI.submenu.sprite(cat, it.label, "mouseOver"),
        ])
      ),
    ];
    for (const url of statusSprites) loads.push(this.assets.load(url));
    try {
      await this.loadMap(startMap, "spawn", spawnPos);
    } catch (e) {
      console.warn("Initial map load failed, falling back to Free Market:", e);
      if (startMap !== FREE_MARKET_MAP) {
        await this.loadMap(FREE_MARKET_MAP, "spawn");
      }
    }
    this.updateActiveItemEffs();
    this.preloadItemIcons();
    await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 25000))]);
  }

  // ------------------------------------------------------------ websocket networking
  initWs() { NetworkSystem.initWs(this); }
  sendJoin() { NetworkSystem.sendJoin(this); }
  syncAll(forceReconnect = false) { NetworkSystem.syncAll(this, forceReconnect); }
  sendAction(kind: "attack" | "skill", skillId: string | null, anim: string) { NetworkSystem.sendAction(this, kind, skillId, anim); }
  syncMove() { NetworkSystem.syncMove(this); }

  handleWsMessage(msg: any) { NetworkSystem.handleWsMessage(this, msg); }

  // ------------------------------------------------------------ map loading
  async loadMap(id: number, arrive: "spawn" | "left" | "right" | "market" = "spawn", spawnPos?: { x: number; y: number }) {
    if (this.boss) this.endBoss(false);
    this.loadingMap = true;
    try {
      const m = await json<MapData>(`/wz/data/map/${id}`);
      await Promise.all([...new Set(m.spawns.map((s) => s.id))].map(async (mid) => {
        if (!this.mobData.has(mid)) this.mobData.set(mid, await json(`/wz/data/mob/${mid}`));
      }));
      const renderTex = this.assets.load(m.render);
      const backLoads = m.backs.map((b) => this.assets.load(b.sprite.url));
      const backFrameLoads = m.backs.flatMap((b) => (b.frames ? b.frames.map((f) => this.assets.load(f.url)) : []));
      const aniObjLoads = (m.aniObjs ?? []).flatMap((o) => o.frames.map((f) => this.assets.load(f.url)));
      const mobLoads = [...this.mobData.values()].flatMap((d) => Object.values(d.books).flat().map((s) => this.assets.load(s.url)));
      await Promise.race([
        Promise.all([renderTex, ...backLoads, ...backFrameLoads, ...aniObjLoads, ...mobLoads]),
        new Promise((r) => setTimeout(r, 20000)),
      ]);
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
        const returnMap = this.prevHuntingMap || 100000000;
        // Central authentic Free Market portal doorway (with custom animated sign)
        this.portals.push({ x: -417, y: 32, to: returnMap, side: "left", custom: true });
      } else if (id === 100000000) {
        // Henesys Town:
        // Left portal to The Hill North of Henesys (100010000)
        // Right portal to Spore Hill (100020000)
        // Authentic Market Place Portal at the town market entrance (x: 2931, y: 334)
        this.portals.push(
          { ...L, to: 100010000, side: "left" },
          { ...R, to: 100020000, side: "right" },
          { x: 2931, y: 334, to: FREE_MARKET_MAP, side: "market", label: "Free Market" }
        );
      } else {
        const idx = HUNTING_AREAS.indexOf(id);
        const nextArea = idx >= 0 ? HUNTING_AREAS[(idx + 1) % HUNTING_AREAS.length] : 100010000;
        this.portals.push({ ...L, to: FREE_MARKET_MAP, side: "left" }, { ...R, to: nextArea, side: "right" });
      }

      // Secret intra-map teleporters (teleports player from coordinate X to Y)
      const secretTeleporters = getMapSecretTeleporters(id, m.portals);
      this.portals.push(...secretTeleporters);

      // Player placement.
      const p = this.p;
      let px: number, py: number;
      const targetPos = spawnPos ?? this.savedPosition;
      if (targetPos && typeof targetPos.x === "number" && typeof targetPos.y === "number") {
        px = targetPos.x;
        py = targetPos.y;
        this.savedPosition = null;
      } else if (id === FREE_MARKET_MAP) {
        px = -417; py = 32;
      } else if (arrive === "market" && id === 100000000) {
        px = 2931; py = 334;
      } else if (arrive === "left") ({ x: px, y: py } = this.portals[0] ? { x: this.portals[0].x + 30, y: this.portals[0].y } : { x: 0, y: 0 });
      else if (arrive === "right") ({ x: px, y: py } = this.portals[1] ? { x: this.portals[1].x - 30, y: this.portals[1].y } : { x: 0, y: 0 });
      else if (id === 100000000) {
        px = 2931; py = 334;
      } else ({ x: px, y: py } = this.portals[0] ? { x: this.portals[0].x + 40, y: this.portals[0].y } : (m.spawns[0] ?? { x: 0, y: 0 }));
      p.x = px; p.y = py - 5; p.vx = 0; p.vy = 0; p.ladder = null;
      p.attack = 0; p.aiAttack = false; p.hitDone = true; p.skill = null;
      this.ai.keys.clear();
      this.ai.pressed.clear();
      this.ai.target = null;
      this.ai.retreatTime = 0;
      this.ai.ladderIntent = null;
      this.ai.ladderTopStuckTimer = 0;
      this.ai.stuck = 0;
      p.fh = this.tree.landing(p.x, p.y - 20, p.y + 60) ?? this.tree.below(p.x, p.y - 20);
      if (p.fh) p.y = FootholdTree.yAt(p.fh, p.x);

      // Snap active pets to player on map load
      for (const pet of this.pets) {
        pet.x = p.x - p.face * (35 + pet.slotIndex * 32);
        pet.y = p.y;
        pet.fh = p.fh;
        pet.vx = 0;
        pet.vy = 0;
        pet.state = "stand0";
      }

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
    } catch (err) {
      console.error("Failed to load map:", id, err);
      throw err;
    } finally {
      this.loadingMap = false;
      this.fade = 0;
    }
  }

  makeMob(s: MapData["spawns"][number]): Mob | null { return MobSystem.makeMob(this, s); }

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
  totalStat(k: "str" | "dex" | "int" | "luk") { return StatsSystem.totalStat(this, k); }
  totalStr() { return this.totalStat("str"); }
  totalDex() { return this.totalStat("dex"); }
  totalInt() { return this.totalStat("int"); }
  totalLuk() { return this.totalStat("luk"); }
  primaryStat() { return StatsSystem.primaryStat(this); }
  secondaryStat() { return StatsSystem.secondaryStat(this); }
  watk() { return StatsSystem.watk(this); }
  maxDamage() { return StatsSystem.maxDamage(this); }
  combatPower() { return StatsSystem.combatPower(this); }
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
  applyClassDefaults(id: ClassId) { StatsSystem.applyClassDefaults(this, id); }

  onJobAdvancementReady?: (tier: number) => void;

  canAdvanceJob(tier?: number): boolean { return StatsSystem.canAdvanceJob(this, tier); }

  advanceJob(id: ClassId) { StatsSystem.advanceJob(this, id); }
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
    if (look) {
      for (const id of look) {
        if (isHoverItem(id)) return true;
      }
      return false;
    }
    if (this.eq?.hat && isHoverItem(this.eq.hat.id)) return true;
    if (this.visualEq?.hat && isHoverItem(this.visualEq.hat.id)) return true;
    return false;
  }

  async updateActiveItemEffs() {
    const prioritySlots: Slot[] = ["weapon", "hat", "cape", "overall" as any, "top", "bottom", "ring1", "ring2", "ring3", "ring4"];
    const orderedIds: number[] = [];
    for (const slot of prioritySlots) {
      const v = this.visualEq[slot]?.id;
      if (v && v !== 1042003 && v !== 1062007 && !orderedIds.includes(v)) orderedIds.push(v);
      const e = this.eq[slot]?.id;
      if (e && e !== 1042003 && e !== 1062007 && !orderedIds.includes(e)) orderedIds.push(e);
    }
    for (const g of Object.values(this.visualEq)) {
      if (g && g.id !== 1042003 && g.id !== 1062007 && !orderedIds.includes(g.id)) orderedIds.push(g.id);
    }
    for (const g of Object.values(this.eq)) {
      if (g && g.id !== 1042003 && g.id !== 1062007 && !orderedIds.includes(g.id)) orderedIds.push(g.id);
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
  mastery() { return StatsSystem.mastery(this); }
  damageRange() { return StatsSystem.damageRange(this); }
  speed() { return StatsSystem.speed(this); }
  jobFor(level: number) { return StatsSystem.jobFor(this, level); }
  recalc() { StatsSystem.recalc(this); }
  addStat(k: "str" | "dex" | "int" | "luk", n = 1) { StatsSystem.addStat(this, k, n); }
  autoAssign() { StatsSystem.autoAssign(this); }
  autoTick = false;
  skillEligible(id: string) { return StatsSystem.skillEligible(this, id); }
  canLearn(id: string) { return StatsSystem.canLearn(this, id); }
  learn(id: string) { return StatsSystem.learn(this, id); }
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

  say(text: string, itemLink?: any) {
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
    this.onChat("say", `${this.stats.name} : ${text}`, itemLink);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "chat", text, kind: "say", itemLink }));
    }
  }

  sendChat(text: string, kind: ChatKind = "say", itemLink?: any) {
    if (kind === "say") {
      this.say(text, itemLink);
    } else {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ t: "chat", text, kind, itemLink, guildId: this.guildId, partyId: this.partyId }));
      }
      this.onChat(kind, `${this.stats.name} : ${text}`, itemLink);
    }
  }

  async loadGuild() {
    try {
      const charName = this.stats.name;
      const guilds = await GuildClient.getGuildList();
      for (const g of guilds) {
        const full = await GuildClient.getGuild(g.id);
        if (full && full.members.some((m) => m.name.toLowerCase() === charName.toLowerCase())) {
          this.guild = full;
          this.guildId = full.id;
          this.guildName = full.name;
          this.guildEmblem = full.emblem;
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ t: "guild_sync", guildId: full.id, guildName: full.name, guildEmblem: full.emblem }));
          }
          this.onChange();
          return full;
        }
      }
      this.guild = null;
      this.guildId = undefined;
      this.guildName = undefined;
      this.guildEmblem = undefined;
      this.onChange();
      return null;
    } catch {
      return null;
    }
  }

  async loadParty(): Promise<Party | null> {
    try {
      const charName = this.stats.name;
      const pt = await PartyClient.getPartyForPlayer(charName);
      if (pt) {
        this.party = pt;
        this.partyId = pt.id;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            t: "party_sync",
            partyId: pt.id,
            hp: this.stats.hp,
            maxHp: this.stats.maxHp,
            level: this.stats.level,
            job: this.stats.job,
            mapId: this.map?.id || 910000000,
          }));
        }
      } else {
        this.party = null;
        this.partyId = undefined;
      }
      this.onChange();
      return pt;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------ actions (quick slots, keys, auto)
  skillCooldown(id: string): number { return CombatSystem.skillCooldown(this, id); }
  triggerCooldown(id: string) { CombatSystem.triggerCooldown(this, id); }
  useAction(a: Action | null | undefined, quiet = false): boolean { return CombatSystem.useAction(this, a, quiet); }
  startAttack(id: string | null, fromAi = false): boolean { return CombatSystem.startAttack(this, id, fromAi); }

  // ------------------------------------------------------------ update
  update(dt: number) {
    this.time += dt;
    if (dt > 0.0001) {
      this.fps = Math.round(this.fps * 0.95 + (1 / dt) * 0.05);
    }
    if (this.teleportCooldown > 0) this.teleportCooldown -= dt;
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
    PetSystem.updatePets(this, dt);
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
      if (rp.magnetTimer && rp.magnetTimer > 0) {
        rp.magnetTimer -= dt;
        if (rp.magnetTimer <= 0) rp.magnetActive = false;
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
          rp.frame = (animKey.startsWith("swing") || animKey.startsWith("stab") || animKey.startsWith("shoot"))
            ? Math.min(rp.frame + 1, d.length - 1)
            : (rp.frame + 1) % d.length;
        }
      }
      if (rp.attackTimer && rp.attackTimer <= 0 && (animKey.startsWith("swing") || animKey.startsWith("stab") || animKey.startsWith("shoot"))) {
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

  updateBuffs(dt: number) { CombatSystem.updateBuffs(this, dt); }
  updateProjectiles(dt: number) { CombatSystem.updateProjectiles(this, dt); }

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
    const jumpHeld = jump || this.down("Alt", " ", "Space");
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
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              t: "loot",
              x: Math.round(d.x),
              y: Math.round(d.y),
              amount: d.amount,
              item: d.item,
              mat: d.mat,
              gear: d.gear?.id,
              magnet: false,
            }));
          }
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

    // Portals & Secret Teleporters.
    if (up && p.fh && p.attack <= 0 && this.teleportCooldown <= 0) {
      for (const pt of this.portals) {
        if (Math.abs(pt.x - p.x) < 45 && Math.abs(pt.y - p.y) < 60) {
          // Secret Intra-Map Teleporter (teleport x to y!)
          if (pt.targetX !== undefined && pt.targetY !== undefined) {
            this.teleportCooldown = 0.55;
            const oldX = p.x;
            const oldY = p.y;
            p.x = pt.targetX;
            p.y = pt.targetY;
            p.vx = 0;
            p.vy = 0;
            p.ladder = null;

            // Re-anchor landing foothold
            p.fh = this.tree.landing(p.x, p.y - 20, p.y + 60) ?? this.tree.below(p.x, p.y - 20);
            if (p.fh) p.y = FootholdTree.yAt(p.fh, p.x);

            // Snap active pets alongside player
            for (const pet of this.pets) {
              pet.x = p.x - p.face * (35 + pet.slotIndex * 32);
              pet.y = p.y;
              pet.fh = p.fh;
              pet.vx = 0;
              pet.vy = 0;
              pet.state = "stand0";
            }

            // Spawn visual portal effects at origin and destination
            if (this.fxData?.portal?.length) {
              this.fx.push({ frames: this.fxData.portal, x: oldX, y: oldY, flip: false, t: 0 });
              this.fx.push({ frames: this.fxData.portal, x: p.x, y: p.y, flip: false, t: 0 });
            }

            this.snapCamera();
            this.onChat("notice", `★ [Secret Teleport] Traveled via ${pt.label ?? "Secret Shortcut"} to (${Math.round(p.x)}, ${Math.round(p.y)})!`);
            return;
          }

          if (pt.side === "market" || (pt.to === FREE_MARKET_MAP && this.map.id !== FREE_MARKET_MAP)) {
            this.prevHuntingMap = this.map.id;
            this.onChat("notice", "Entering Free Market...");
            this.loadMap(FREE_MARKET_MAP, "spawn");
            return;
          } else if (pt.side === "left") {
            if (this.map.id !== FREE_MARKET_MAP) {
              if (pt.to === FREE_MARKET_MAP) {
                this.prevHuntingMap = this.map.id;
                this.onChat("notice", "Entering Free Market...");
                this.loadMap(FREE_MARKET_MAP, "spawn");
              } else {
                this.onChat("notice", "Traveling to " + (pt.to === 100010000 ? "The Hill North of Henesys..." : "next area..."));
                this.loadMap(pt.to, "right");
              }
            } else {
              const returnMap = this.prevHuntingMap || 100000000;
              this.onChat("notice", "Returning to " + (returnMap === 100000000 ? "Henesys..." : "hunting area..."));
              this.loadMap(returnMap, returnMap === 100000000 ? "market" : "left");
            }
            return;
          } else if (pt.side === "right") {
            if (this.map.id === FREE_MARKET_MAP) {
              const returnMap = this.prevHuntingMap || 100000000;
              this.onChat("notice", "Returning to " + (returnMap === 100000000 ? "Henesys..." : "hunting area..."));
              this.loadMap(returnMap, returnMap === 100000000 ? "market" : "left");
              return;
            }
            if (this.mobs.length > 0) {
              if (!this.auto.battle) {
                this.onChat("system", "Auto Combat must be ON to advance to the next area!");
                return;
              }
              if (!this.areaBossDefeated) {
                this.onChat("system", `Defeat the stage boss first before advancing to the next area! (Kills: ${this.stage.kills}/${this.stageNeed})`);
                return;
              }
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
      if (p.attack <= 0) p.aiAttack = false;
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
      if (downK && jumpHeld && p.attack <= 0) {
        const below = tree.below(p.x, p.y + 4, p.fh.id);
        if (below && FootholdTree.yAt(below, p.x) - p.y < 600) {
          p.ignoreFh = p.fh.id; p.fh = null; p.vy = -120; p.vx = 0; p.coyote = 0;
        }
      } else if (jumpHeld && p.attack <= 0) {
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
      const standAnim = this.eq.weapon ? getWeaponStandAnim(this.eq.weapon.id) : "stand1";
      const walkAnim = this.eq.weapon ? getWeaponWalkAnim(this.eq.weapon.id) : "walk1";
      const anim = p.attack > 0 ? p.attackAnim : p.prone ? "prone" : Math.abs(p.vx) > 10 ? walkAnim : p.alert > 0 ? "alert" : standAnim;
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
      const isAttack = anim.startsWith("swing") || anim.startsWith("stab") || anim.startsWith("shoot");
      p.frame = isAttack ? Math.min(p.frame + 1, d.length - 1) : (p.frame + 1) % d.length;
    }
  }

  mobBox(m: Mob) { return CombatSystem.mobBox(m); }
  rollDamage(pct: number, mob: Mob) { return CombatSystem.rollDamage(this, pct, mob); }
  resolveAttack(id: string | null) { CombatSystem.resolveAttack(this, id); }
  damageMob(m: Mob, dmg: number, miss: boolean) { CombatSystem.damageMob(this, m, dmg, miss); }
  gainExp(n: number) { CombatSystem.gainExp(this, n); }
  checkMobContact() { CombatSystem.checkMobContact(this); }
  hurtAmount(atk: number) { return CombatSystem.hurtAmount(this, atk); }
  die() { CombatSystem.die(this); }

  // ------------------------------------------------------------ debug GM commands
  setLevel(targetLevel: number) { GmSystem.setLevel(this, targetLevel); }
  addExp(n: number) { GmSystem.addExp(this, n); }
  setJob(classId: ClassId, jobName?: string) { GmSystem.setJob(this, classId, jobName); }
  giveMesos(amt: number) { GmSystem.giveMesos(this, amt); }
  giveItem(id: number, count = 1) { GmSystem.giveItem(this, id, count); }
  giveMat(id: number, count = 1) { GmSystem.giveMat(this, id, count); }
  giveAnyItem(id: number, count = 1) { GmSystem.giveAnyItem(this, id, count); }
  spawnCustomMob(mobId: number, count = 1) { return GmSystem.spawnCustomMob(this, mobId, count); }
  magnetMobs() { GmSystem.magnetMobs(this); }
  broadcastNotice(text: string) { GmSystem.broadcastNotice(this, text); }
  setFame(amt: number) { GmSystem.setFame(this, amt); }
  fullHeal() { GmSystem.fullHeal(this); }
  killAllMobs() { GmSystem.killAllMobs(this); }
  maxAllSkills() { GmSystem.maxAllSkills(this); }
  spawnBossImmediate() { GmSystem.spawnBossImmediate(this); }
  readyBossImmediate() { GmSystem.readyBossImmediate(this); }
  advanceStageImmediate() { GmSystem.advanceStageImmediate(this); }

  updateMob(m: Mob, dt: number) { MobSystem.updateMob(this, m, dt); }
  updateBoss(m: Mob, dt: number, play: (book: string, loop: boolean) => boolean) { MobSystem.updateBoss(this, m, dt, play); }
  updateDrops(dt: number) { MobSystem.updateDrops(this, dt); }

  // ------------------------------------------------------------ equipment
  equip(uid: string): boolean { return InventorySystem.equip(this, uid); }
  unequip(slot: Slot) { InventorySystem.unequip(this, slot); }
  equipVisual(uid: string): boolean { return InventorySystem.equipVisual(this, uid); }
  unequipVisual(slot: Slot) { InventorySystem.unequipVisual(this, slot); }
  sellGear(uid: string) { InventorySystem.sellGear(this, uid); }
  sellJunk() { InventorySystem.sellJunk(this); }
  findGear(uid: string) { return InventorySystem.findGear(this, uid); }
  addGear(g: Gear) { InventorySystem.addGear(this, g); }
  moveBagSlot(fromSlot: number, toSlot: number, isCash = false) { InventorySystem.moveBagSlot(this, fromSlot, toSlot, isCash); }
  sortBag(isCash = false) { InventorySystem.sortBag(this, isCash); }
  dropGear(uid: string): boolean { return InventorySystem.dropGear(this, uid); }
  dropUseItem(id: number, count = 1): boolean { return InventorySystem.dropUseItem(this, id, count); }
  dropMat(id: number, count = 1): boolean { return InventorySystem.dropMat(this, id, count); }
  equipPet(id: number, slotIndex?: number) { return PetSystem.equipPet(this, id, slotIndex); }
  unequipPet(slotIndex: number) { PetSystem.unequipPet(this, slotIndex); }

  // ------------------------------------------------------------ crafting
  canCraft(r: Recipe) { return EconomySystem.canCraft(this, r); }
  craft(r: Recipe) { return EconomySystem.craft(this, r); }
  enhance(uid: string): "success" | "fail" | "max" | "cost" | null { return InventorySystem.enhance(this, uid); }
  cube(uid: string): boolean { return InventorySystem.cube(this, uid); }

  // ------------------------------------------------------------ auction house
  ahBuy(lid: string) { return EconomySystem.ahBuy(this, lid); }
  receive(g: Goods) { EconomySystem.receive(this, g); }
  ahList(goods: Goods, price: number) { return EconomySystem.ahList(this, goods, price); }
  ahCollect(lid: string) { EconomySystem.ahCollect(this, lid); }

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
      p: { x: Math.round(this.p.x), y: Math.round(this.p.y), face: this.p.face },
      mats: this.mats, bag: this.bag, eq: this.eq, visualEq: this.visualEq, pets: this.pets.map((p) => ({ id: p.id, slotIndex: p.slotIndex })), stage: this.stage, idle: this.idle, ah: this.ah.save(), savedAt: Date.now(),
    };
  }
  restore(d: any) {
    if (!d || d.v !== 1) return;
    Object.assign(this.stats, d.stats ?? {});
    if (d.p && typeof d.p.x === "number" && typeof d.p.y === "number") {
      this.savedPosition = { x: d.p.x, y: d.p.y, face: d.p.face ?? -1 };
      this.p.x = d.p.x;
      this.p.y = d.p.y;
      if (d.p.face) this.p.face = d.p.face;
    }
    if (d.inv) this.inv = d.inv;
    if (d.skillLv) this.skillLv = d.skillLv;
    if (d.quick) this.quick = d.quick;
    if (d.auto) {
      Object.assign(this.auto, d.auto);
      if (typeof d.auto.battle === "boolean") this.auto.battle = d.auto.battle;
      if (typeof d.auto.boss === "boolean") this.auto.boss = d.auto.boss;
    }
    if (d.mats) this.mats = d.mats;
    if (d.bag) {
      this.bag = d.bag.filter((g: Gear) => GEAR.has(g.id));
      const seen = new Set<number>();
      for (let i = 0; i < this.bag.length; i++) {
        const item = this.bag[i];
        if (typeof item.slot !== "number" || seen.has(item.slot)) {
          let s = 0;
          while (seen.has(s)) s++;
          item.slot = s;
        }
        seen.add(item.slot);
      }
    }
    this.eq = {};
    this.visualEq = {};
    if (d.eq) {
      for (const [k, g] of Object.entries(d.eq as Record<string, Gear>)) {
        if (!g || !GEAR.has(g.id)) continue;
        const b = GEAR.get(g.id);
        if (b?.cosmetic || b?.cash) {
          if (!this.visualEq[k as Slot]) this.visualEq[k as Slot] = g;
          else this.addGear(g);
        } else {
          this.eq[k as Slot] = g;
        }
      }
    }
    if (d.visualEq) {
      for (const [k, g] of Object.entries(d.visualEq as Record<string, Gear>)) {
        if (!g || !GEAR.has(g.id)) continue;
        const b = GEAR.get(g.id);
        if (!b?.cosmetic && !b?.cash) {
          if (!this.eq[k as Slot]) this.eq[k as Slot] = g;
          else this.addGear(g);
        } else {
          this.visualEq[k as Slot] = g;
        }
      }
    }
    if (Array.isArray(d.pets)) {
      for (const p of d.pets) {
        if (p && typeof p.id === "number") {
          this.equipPet(p.id, p.slotIndex);
        }
      }
    }
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
