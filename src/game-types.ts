import type { Sprite } from "./assets.ts";
import type { Tex } from "./gpu.ts";
import type { Foothold, Ladder } from "./physics.ts";
import type { Gear, Slot } from "./items.ts";
import type { Action, ClassId } from "./skills.ts";
import type { GuildEmblem } from "./guild.ts";

export interface Back {
  sprite: Sprite;
  frames?: Sprite[];
  x: number;
  y: number;
  rx: number;
  ry: number;
  cx: number;
  cy: number;
  type: number;
  a: number;
  flip: boolean;
  front: boolean;
}

export interface AniObj {
  x: number;
  y: number;
  z: number;
  layer: number;
  f: boolean;
  frames: Sprite[];
}

export interface MapData {
  id: number;
  name: string;
  street: string;
  bgm: string;
  bgmUrl: string;
  mark: string;
  render: string;
  renderOrigin: { x: number; y: number };
  miniMap: { url: string; centerX: number; centerY: number; width: number; height: number; mag: number };
  footholds: Foothold[];
  ladders: Ladder[];
  spawns: { id: number; x: number; y: number; fh: number; rx0: number; rx1: number }[];
  backs: Back[];
  aniObjs?: AniObj[];
  portals?: Portal[];
}

export interface MobData {
  id: number;
  name: string;
  meta: any;
  books: Record<string, Sprite[]>;
}

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

export interface PetFrame {
  url: string;
  w: number;
  h: number;
  ox: number;
  oy: number;
  delay?: number;
}

export interface PetData {
  id: number;
  name: string;
  icon: string;
  actions: Record<string, PetFrame[]>;
}

export interface PetInstance {
  id: number;
  name: string;
  slotIndex: number; // 0, 1, 2 (max 3 pets)
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: -1 | 1;
  state: "stand0" | "move" | "jump" | "hang" | "rest0";
  animTimer: number;
  frame: number;
  fh: Foothold | null;
  targetX?: number;
  targetY?: number;
  lootCooldown?: number;
  lastTex?: Tex | null;
  lastFr?: PetFrame | null;
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
  guildId?: string;
  guildName?: string;
  guildEmblem?: GuildEmblem;
  fps?: number;
  ping?: number;
  damageSkin?: number | string;
  magnetActive?: boolean;
  magnetTimer?: number;
}

export const BODY = [2000, 12000, 20000, 30030];
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
export const STAGE_KILLS = 25;

export const ANIMS: Record<string, number[]> = {
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

export const EXP_TABLE = [
  15, 34, 57, 92, 135, 372, 560, 840, 1242, 1716, 2360, 3216, 4200, 5460, 7050, 8840,
  11040, 13716, 16680, 20216, 24402, 28980, 34320, 40512, 47216, 54900, 63666, 73080, 83720, 95700,
];

export const expToLevel = (lv: number) =>
  EXP_TABLE[Math.min(lv - 1, EXP_TABLE.length - 1)] * (lv > EXP_TABLE.length ? 1 + (lv - EXP_TABLE.length) * 0.15 : 1);

export const WALK = 135, JUMP = 560, CLIMB = 150;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

export interface Mob {
  data: MobData;
  spawn: MapData["spawns"][number];
  x: number;
  y: number;
  vx: number;
  vy: number;
  fh: Foothold | null;
  ignoreFh?: number;
  dir: -1 | 1;
  state: "stand" | "move" | "hit1" | "die1" | "dead";
  t: number;
  anim: number;
  frame: number;
  hp: number;
  maxHp: number;
  aggro: number;
  hpShow: number;
  respawn: number;
  alpha: number;
  mul: { exp: number; meso: number };
  atk: number;
  boss?: boolean;
  skillT?: number;
  attacking?: string;
  lastTex?: Tex | null;
  lastFr?: Sprite | null;
}

export interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fh: Foothold | null;
  amount: number;
  item?: number;
  mat?: number;
  gear?: Gear;
  t: number;
  picked: number;
  ignoreFh?: number;
  targetPlayer?: RemotePlayer;
  isCosmetic?: boolean;
}

export interface Projectile {
  x: number;
  y: number;
  target: Mob;
  dmg: number;
  miss: boolean;
  critical?: boolean;
  t: number;
  skillId?: string;
  isShadow?: boolean;
  arcY?: number;
}

export interface Fx {
  frames: Sprite[];
  x: number;
  y: number;
  flip: boolean;
  t: number;
  follow?: boolean;
  lastTex?: Tex | null;
  lastFr?: Sprite | null;
}

export interface DmgText {
  value: number;
  miss: boolean;
  hurt: boolean;
  critical?: boolean;
  skinId?: number | string;
  x: number;
  y: number;
  t: number;
}

export interface Portal {
  x: number;
  y: number;
  to: number;
  side: "left" | "right" | "market" | "secret" | "teleport" | "door";
  custom?: boolean;
  label?: string;
  pn?: string;
  tn?: string;
  pt?: number;
  targetX?: number;
  targetY?: number;
  secret?: boolean;
  secretType?: "tree" | "chimney" | "pipe" | "door" | "shortcut" | "springboard" | "portal";
  hint?: string;
}

export interface SecretObject {
  id: string;
  type: "chest" | "crate" | "barrel" | "springboard";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  broken: boolean;
  respawnTimer: number;
  hitTimer: number;
  label?: string;
}

export interface Stats {
  name: string;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  meso: number;
  job: string;
  classId: ClassId;
  str: number;
  dex: number;
  int: number;
  luk: number;
  ap: number;
  sp: number;
  baseHp: number;
  baseMp: number;
  fame: number;
}

export interface AutoSettings {
  battle: boolean;
  hp: boolean;
  hpPct: number;
  mp: boolean;
  mpPct: number;
  buff: boolean;
  loot: boolean;
  ap: boolean;
  boss: boolean;
  magnet: boolean;
}

export type ChatKind = "system" | "exp" | "meso" | "level" | "notice" | "say" | "item" | "whisper" | "party" | "guild";
