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

export interface PetBonus {
  level: number;
  type: "watk" | "matk" | "all_stat" | "speed" | "jump" | "hp" | "mp" | "meso_rate" | "drop_rate";
  value: number;
  label: string;
}

export interface PetItem {
  uid: string;
  id: number;
  name: string;
  level: number;
  exp: number;
  maxExp: number;
  rarity: number; // 0: Normal, 1: Rare, 2: Epic, 3: Unique, 4: Legendary
  bonuses: PetBonus[];
  slotIndex?: number; // 0, 1, 2 if equipped
}

export interface PetInstance {
  uid?: string;
  id: number;
  name: string;
  slotIndex: number; // 0, 1, 2 (max 3 pets)
  level: number;
  exp: number;
  maxExp: number;
  rarity: number;
  bonuses: PetBonus[];
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
  isLocal?: boolean;
  ownerId?: string;
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
  level?: number;
  job?: string;
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
  targetAnim?: string;
  lastAnim?: string;
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
  gmEffect?: boolean;
  hp?: number;
  maxHp?: number;
  mp?: number;
  maxMp?: number;
  vy?: number;
  isClimbing?: boolean;
  charComp?: any;
  pets?: PetInstance[];
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

export const expToLevel = (lv: number): number => {
  const safeLv = Math.max(1, Math.floor(lv));
  if (safeLv <= EXP_TABLE.length) {
    return EXP_TABLE[safeLv - 1];
  }
  // Balanced progressive curve calibrated to MapleStory progression:
  // Lv. 30: 95.7K
  // Lv. 70: ~2.1M
  // Lv. 120: ~28M
  // Lv. 200: ~2.2B
  // Lv. 250: ~45B
  // Lv. 276: ~385B (avoids the previous 23 quadrillion overflow and stays safely within JavaScript integers)
  // Lv. 300: ~2.8T
  if (safeLv <= 70) {
    const diff = safeLv - 30;
    return Math.round(95700 * Math.pow(1.075, diff) * (1 + diff * 0.04));
  }
  if (safeLv <= 120) {
    const diff = safeLv - 70;
    return Math.round(2100000 * Math.pow(1.045, diff) * (1 + diff * 0.02));
  }
  if (safeLv <= 200) {
    const diff = safeLv - 120;
    return Math.round(28000000 * Math.pow(1.055, diff) * (1 + diff * 0.01));
  }
  if (safeLv <= 250) {
    const diff = safeLv - 200;
    return Math.round(2200000000 * Math.pow(1.062, diff));
  }
  const diff = safeLv - 250;
  return Math.round(45000000000 * Math.pow(1.085, diff));
};

export const WALK = 135, JUMP = 560, CLIMB = 150;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

export type RuneType = "swiftness" | "might" | "thunder" | "destruction";

export interface RuneSkillDef {
  skillId: number;
  name: string;
  desc: string;
  iconUrl: string;
}

export const RUNE_SKILL_DEFS: Record<RuneType, RuneSkillDef> = {
  swiftness: {
    skillId: 80001427,
    name: "Rune of Swiftness",
    desc: "Liberated Rune Power: Movement Speed, Jump & Attack Speed increased. EXP +100% (2x EXP).",
    iconUrl: "/wz/skill/80001427/icon",
  },
  might: {
    skillId: 80001752,
    name: "Rune of Might",
    desc: "Liberated Rune Power: Gigantism size & crushing damage. EXP +100% (2x EXP).",
    iconUrl: "/wz/skill/80001752/icon",
  },
  thunder: {
    skillId: 80001753,
    name: "Rune of Thunder",
    desc: "Liberated Rune Power: Periodic lightning strikes target nearby monsters. EXP +100% (2x EXP).",
    iconUrl: "/wz/skill/80001753/icon",
  },
  destruction: {
    skillId: 80001432,
    name: "Rune of Destruction",
    desc: "Liberated Rune Power: Attack Power increased by +50%. EXP +100% (2x EXP).",
    iconUrl: "/wz/skill/80001432/icon",
  },
};

export interface ActiveRune {
  x: number;
  y: number;
  type: RuneType;
  t: number;
}

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
  elite?: boolean;
  elitePrefix?: string;
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
  dropId?: string;
  sourceMob?: {
    id: number;
    name: string;
    level?: number;
    elite?: boolean;
  };
}

export interface GmDropPickupRecord {
  id: string;
  timestamp: number;
  timeStr: string;
  type: "gear" | "item" | "mat" | "meso";
  itemId?: number;
  gearUid?: string;
  name: string;
  iconUrl?: string;
  amount: number;
  rarity?: number;
  method: "manual" | "magnet" | "pet";
  sourceMob?: {
    id: number;
    name: string;
    level?: number;
    elite?: boolean;
  };
  confirmedInInventory: boolean;
  inventoryDetail: string;
  preCount?: number;
  postCount?: number;
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
  heal?: boolean;
  poison?: boolean;
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
  nx: number;
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
  gender?: "male" | "female" | string;
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
  disabledSkills?: Record<string, boolean>;
}

export type ChatKind = "system" | "exp" | "meso" | "level" | "notice" | "say" | "item" | "whisper" | "party" | "guild";
