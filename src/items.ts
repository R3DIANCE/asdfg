// Gear (rarity, potential, star force), materials, crafting recipes and market prices.
import type { ClassId } from "./skills.ts";

export type Slot =
  | "weapon" | "hat" | "top" | "bottom" | "shoes" | "gloves" | "shield" | "cape" | "earrings"
  | "pendant" | "ring1" | "ring2" | "ring3" | "ring4" | "shoulder" | "belt" | "pocket" | "emblem" | "badge"
  | "face" | "eye";

/** Equip destination sockets in the order they appear in the Equipment panel (left to right). */
export const SLOTS: Slot[] = [
  "hat", "earrings", "ring1", "pendant", "weapon", "top", "bottom", "shield",
  "cape", "gloves", "shoes", "ring2", "ring3", "ring4", "shoulder", "belt", "pocket", "emblem", "badge",
  "face", "eye",
];

export const SLOT_NAME: Record<Slot, string> = {
  weapon: "Weapon", hat: "Hat", top: "Top", bottom: "Bottom", shoes: "Shoes", gloves: "Gloves", shield: "Shield",
  cape: "Cape", earrings: "Earrings", pendant: "Pendant", ring1: "Ring 1", ring2: "Ring 2", ring3: "Ring 3", ring4: "Ring 4",
  shoulder: "Shoulder", belt: "Belt", pocket: "Pocket", emblem: "Emblem", badge: "Badge",
  face: "Face Accessory", eye: "Eye Accessory",
};

/** The item-category name behind each socket (rings share a pool). */
export const SLOT_CATEGORY: Partial<Record<Slot, "ring">> = {
  ring1: "ring", ring2: "ring", ring3: "ring", ring4: "ring",
};
export const slotCategory = (s: Slot) => SLOT_CATEGORY[s] ?? (s as string);

export type ItemGender = "male" | "female" | "both";

export interface GearBase {
  id: number;
  name: string;
  slot: string;
  req: number;
  reqJob?: number;
  watk: number;
  str: number;
  dex: number;
  int: number;
  luk: number;
  hp: number;
  def: number;
  price: number;
  cosmetic?: boolean;
  cash?: boolean;
  gender?: ItemGender;
  overall?: boolean;
}

export interface Potential { stat: "att" | "str" | "dex" | "int" | "luk" | "hp" | "boss" | "meso" | "drop" | "exp"; pct: number }
export interface Gear { uid: string; id: number; rarity: number; star: number; pot: Potential[]; slot?: number; cosmetic?: boolean; cash?: boolean }

export const RARITY = ["Normal", "Rare", "Epic", "Unique", "Legendary"];
export const RARITY_COLOR = ["#ffffff", "#66d9ff", "#c77dff", "#ffcc33", "#5cff7a"];
/** Darker variants for text on light window backgrounds. */
export const RARITY_INK = ["#333333", "#0f7fb3", "#7a32c2", "#a87400", "#12893a"];
export const MAX_STAR = 15;

// Starter look (also real equips) plus everything gathered from the client data.
const STARTER: GearBase[] = [
  { id: 1302000, name: "Sword", slot: "weapon", req: 0, watk: 17, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 50 },
  { id: 1040002, name: "White Undershirt", slot: "top", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 3, price: 30 },
  { id: 1060002, name: "Blue Jean Shorts", slot: "bottom", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 2, price: 30 },
  { id: 1072001, name: "Red Rubber Boots", slot: "shoes", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 2, price: 30 },
];

export const COSMETICS: GearBase[] = [
  // Transparent & Special cosmetics (Strictly pure cosmetics with no combat bonus stats)
  { id: 1002140, name: "Wizet Invincible Hat", slot: "hat", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 999999, cosmetic: true, cash: true },
  { id: 1003142, name: "Wizet Invincible Hat", slot: "hat", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 999999, cosmetic: true, cash: true },
  { id: 1002186, name: "Transparent Hat", slot: "hat", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true, cash: true },
  { id: 1042003, name: "Wizet Plain Suit", slot: "top", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true, cash: true },
  { id: 1062007, name: "Wizet Plain Suit Pants", slot: "bottom", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true, cash: true },
  { id: 1060115, name: "Transparent Bottom", slot: "bottom", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true, cash: true },
  { id: 1072153, name: "Transparent Shoes", slot: "shoes", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true, cash: true },
  { id: 1082149, name: "Transparent Gloves", slot: "gloves", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true, cash: true },
  { id: 1102039, name: "Transparent Cape", slot: "cape", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true, cash: true },
  
  // Raven Persona Hats (Visual levitation effect only, no bonus stats)
  { id: 1003409, name: "Raven Persona", slot: "hat", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 50000, cosmetic: true, cash: true },
  { id: 1003422, name: "Garnet Raven Persona", slot: "hat", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 75000, cosmetic: true, cash: true },
  { id: 1004782, name: "Raven Persona", slot: "hat", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 50000, cosmetic: true, cash: true },
  { id: 1004646, name: "Royal Azure Feather Turban", slot: "hat", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 15000, cosmetic: true, cash: true },
  { id: 1103305, name: "[BTS] Swan Serenade", slot: "cape", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 20000, cosmetic: true, cash: true },
];

export const ICONIC_GEAR: GearBase[] = [
  // Hats & Bandanas & Ears
  { id: 1002008, name: "Green Bandana", slot: "hat", req: 0, watk: 0, str: 1, dex: 1, int: 0, luk: 0, hp: 10, def: 3, price: 500 },
  { id: 1002057, name: "White Bandana", slot: "hat", req: 0, watk: 0, str: 1, dex: 1, int: 1, luk: 1, hp: 10, def: 4, price: 500 },
  { id: 1002058, name: "Black Bandana", slot: "hat", req: 0, watk: 0, str: 2, dex: 2, int: 2, luk: 2, hp: 15, def: 5, price: 800 },
  { id: 1002064, name: "Red Bandana", slot: "hat", req: 0, watk: 0, str: 2, dex: 0, int: 0, luk: 0, hp: 10, def: 3, price: 500 },
  { id: 1002374, name: "Red Beret", slot: "hat", req: 0, watk: 0, str: 1, dex: 1, int: 1, luk: 1, hp: 20, def: 8, price: 1200 },
  { id: 1002274, name: "Chief Stan Hat", slot: "hat", req: 0, watk: 0, str: 3, dex: 3, int: 0, luk: 0, hp: 30, def: 12, price: 2000 },
  { id: 1003112, name: "Chaos Zakum Helmet", slot: "hat", req: 100, watk: 25, str: 21, dex: 21, int: 21, luk: 21, hp: 250, def: 180, price: 120000 },
  { id: 1002798, name: "Fox Ears", slot: "hat", req: 0, watk: 0, str: 3, dex: 3, int: 3, luk: 3, hp: 45, def: 12, price: 3500 },
  { id: 1002419, name: "Angelic Halo", slot: "hat", req: 0, watk: 2, str: 4, dex: 4, int: 4, luk: 4, hp: 80, def: 15, price: 5000 },
  { id: 1002067, name: "Skull Cap", slot: "hat", req: 0, watk: 0, str: 1, dex: 1, int: 0, luk: 0, hp: 15, def: 5, price: 600 },
  { id: 1002175, name: "Cat Hat", slot: "hat", req: 0, watk: 0, str: 2, dex: 2, int: 2, luk: 2, hp: 35, def: 10, price: 2500 },

  // Tops & Casual
  { id: 1040004, name: "Blue Sailor Shirt", slot: "top", req: 0, watk: 0, str: 1, dex: 1, int: 0, luk: 0, hp: 10, def: 6, price: 400 },
  { id: 1040008, name: "Orange T-Shirt", slot: "top", req: 0, watk: 0, str: 1, dex: 0, int: 0, luk: 1, hp: 10, def: 5, price: 350 },
  { id: 1040014, name: "Striped T-Shirt", slot: "top", req: 0, watk: 0, str: 0, dex: 1, int: 1, luk: 0, hp: 10, def: 5, price: 350 },
  { id: 1040036, name: "Red Cross Shirt", slot: "top", req: 0, watk: 0, str: 2, dex: 1, int: 0, luk: 0, hp: 20, def: 8, price: 800 },
  { id: 1050018, name: "Bath Towel (M)", slot: "top", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 50, def: 10, price: 1500 },
  { id: 1050037, name: "Red Kimono", slot: "top", req: 0, watk: 1, str: 3, dex: 3, int: 0, luk: 0, hp: 40, def: 15, price: 2800 },

  // Bottoms
  { id: 1060006, name: "Denim Jeans", slot: "bottom", req: 0, watk: 0, str: 1, dex: 1, int: 0, luk: 0, hp: 10, def: 5, price: 400 },
  { id: 1060014, name: "Blue Jean Pants", slot: "bottom", req: 0, watk: 0, str: 1, dex: 0, int: 0, luk: 1, hp: 10, def: 5, price: 400 },
  { id: 1060026, name: "Camo Pants", slot: "bottom", req: 0, watk: 0, str: 2, dex: 1, int: 0, luk: 0, hp: 15, def: 8, price: 800 },

  // Shoes
  { id: 1072005, name: "Red High Tops", slot: "shoes", req: 0, watk: 0, str: 1, dex: 1, int: 0, luk: 0, hp: 10, def: 4, price: 500 },
  { id: 1072008, name: "Blue High Tops", slot: "shoes", req: 0, watk: 0, str: 0, dex: 2, int: 0, luk: 0, hp: 10, def: 4, price: 500 },
  { id: 1072037, name: "Yellow Snowshoes", slot: "shoes", req: 0, watk: 0, str: 1, dex: 2, int: 0, luk: 0, hp: 15, def: 6, price: 900 },

  // Gloves
  { id: 1082002, name: "Work Gloves", slot: "gloves", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 2, price: 1000 },
  { id: 1082145, name: "Yellow Work Gloves", slot: "gloves", req: 0, watk: 1, str: 1, dex: 0, int: 0, luk: 0, hp: 0, def: 3, price: 2500 },
  { id: 1082146, name: "Red Work Gloves", slot: "gloves", req: 0, watk: 2, str: 2, dex: 0, int: 0, luk: 0, hp: 0, def: 4, price: 5000 },
  { id: 1082147, name: "Blue Work Gloves", slot: "gloves", req: 0, watk: 1, str: 0, dex: 2, int: 0, luk: 0, hp: 0, def: 3, price: 3000 },

  // Capes & Wings
  { id: 1102041, name: "Black Seraph's Cape", slot: "cape", req: 0, watk: 2, str: 3, dex: 3, int: 0, luk: 0, hp: 50, def: 15, price: 8000 },
  { id: 1102042, name: "White Seraph's Cape", slot: "cape", req: 0, watk: 2, str: 0, dex: 0, int: 3, luk: 3, hp: 50, def: 15, price: 8000 },
  { id: 1102084, name: "Pink Adventurer Cape", slot: "cape", req: 0, watk: 3, str: 2, dex: 2, int: 2, luk: 2, hp: 40, def: 12, price: 10000 },

  // Iconic Weapons
  { id: 1302001, name: "Wooden Club", slot: "weapon", req: 0, watk: 19, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100 },
  { id: 1302005, name: "Aluminum Baseball Bat", slot: "weapon", req: 0, watk: 25, str: 2, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 1500 },
  { id: 1302014, name: "Frozen Tuna", slot: "weapon", req: 0, watk: 60, str: 5, dex: 0, int: 0, luk: 0, hp: 50, def: 0, price: 15000 },
  { id: 1302016, name: "Red Whip", slot: "weapon", req: 0, watk: 38, str: 0, dex: 5, int: 0, luk: 0, hp: 0, def: 0, price: 8000 },
  { id: 1302063, name: "Pan Lid", slot: "shield", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 10, price: 2000 },
  { id: 1302066, name: "Frying Pan", slot: "weapon", req: 0, watk: 32, str: 3, dex: 0, int: 0, luk: 0, hp: 20, def: 0, price: 4000 },
  { id: 1302081, name: "Maple Sword", slot: "weapon", req: 0, watk: 48, str: 3, dex: 3, int: 0, luk: 0, hp: 30, def: 0, price: 12000 },

  // Additional Iconic Helms & Hats
  { id: 1002357, name: "Zakum Helmet", slot: "hat", req: 50, watk: 15, str: 15, dex: 15, int: 15, luk: 15, hp: 150, def: 50, price: 50000 },
  { id: 1002011, name: "Brown Bamboo Hat", slot: "hat", req: 25, watk: 0, str: 0, dex: 3, int: 0, luk: 0, hp: 20, def: 12, price: 3000 },
  { id: 1002012, name: "Blue Bamboo Hat", slot: "hat", req: 25, watk: 0, str: 0, dex: 0, int: 3, luk: 0, hp: 20, def: 12, price: 3000 },
  { id: 1002013, name: "Green Bamboo Hat", slot: "hat", req: 25, watk: 0, str: 0, dex: 0, int: 0, luk: 3, hp: 20, def: 12, price: 3000 },
  { id: 1002434, name: "Maple Hat", slot: "hat", req: 0, watk: 1, str: 2, dex: 2, int: 2, luk: 2, hp: 50, def: 15, price: 10000 },
  { id: 1002001, name: "Wizard Hat", slot: "hat", req: 0, watk: 0, str: 0, dex: 0, int: 5, luk: 2, hp: 30, def: 10, price: 2500 },

  // Iconic Capes & Cloaks
  { id: 1102046, name: "Cape of Warmth", slot: "cape", req: 25, watk: 0, str: 2, dex: 2, int: 2, luk: 2, hp: 50, def: 10, price: 4000 },
  { id: 1102085, name: "Yellow Adventurer Cape", slot: "cape", req: 50, watk: 2, str: 0, dex: 5, int: 0, luk: 0, hp: 40, def: 15, price: 12000 },
  { id: 1102086, name: "Black Adventurer Cape", slot: "cape", req: 50, watk: 3, str: 3, dex: 0, int: 0, luk: 3, hp: 40, def: 15, price: 15000 },

  // Iconic Weapons & Boards
  { id: 1442011, name: "Surfboard", slot: "weapon", req: 15, watk: 35, str: 2, dex: 0, int: 0, luk: 0, hp: 30, def: 0, price: 5000 },
  { id: 1442012, name: "Red Surfboard", slot: "weapon", req: 35, watk: 55, str: 5, dex: 0, int: 0, luk: 0, hp: 50, def: 0, price: 15000 },
  { id: 1442007, name: "Sky Snowboard", slot: "weapon", req: 18, watk: 40, str: 2, dex: 2, int: 0, luk: 0, hp: 20, def: 0, price: 6000 },
  { id: 1442010, name: "Blood Snowboard", slot: "weapon", req: 48, watk: 68, str: 6, dex: 2, int: 0, luk: 0, hp: 60, def: 0, price: 20000 },
  { id: 1332025, name: "Maple Wagner", slot: "weapon", req: 43, watk: 58, str: 0, dex: 0, int: 0, luk: 4, hp: 0, def: 0, price: 18000 },
  { id: 1382009, name: "Maple Staff", slot: "weapon", req: 35, watk: 48, str: 0, dex: 0, int: 5, luk: 2, hp: 100, def: 0, price: 14000 },
  { id: 1452016, name: "Maple Bow", slot: "weapon", req: 35, watk: 48, str: 0, dex: 4, int: 0, luk: 0, hp: 40, def: 0, price: 14000 },
  { id: 1472030, name: "Maple Claw", slot: "weapon", req: 35, watk: 24, str: 0, dex: 0, int: 0, luk: 4, hp: 0, def: 0, price: 14000 },

  // Authentic 1st Job Starter Weapons
  { id: 1302007, name: "Long Sword", slot: "weapon", req: 10, watk: 27, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 800 },
  { id: 1402001, name: "Wooden Sword", slot: "weapon", req: 10, watk: 30, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 1000 },
  { id: 1432000, name: "Spear", slot: "weapon", req: 10, watk: 32, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 1100 },
  { id: 1372005, name: "Wooden Wand", slot: "weapon", req: 8, watk: 15, str: 0, dex: 0, int: 2, luk: 0, hp: 20, def: 0, price: 800 },
  { id: 1382000, name: "Wooden Staff", slot: "weapon", req: 10, watk: 20, str: 0, dex: 0, int: 3, luk: 0, hp: 30, def: 0, price: 1000 },
  { id: 1452002, name: "War Bow", slot: "weapon", req: 10, watk: 25, str: 0, dex: 2, int: 0, luk: 0, hp: 10, def: 0, price: 900 },
  { id: 1462001, name: "Crossbow", slot: "weapon", req: 12, watk: 29, str: 0, dex: 2, int: 0, luk: 0, hp: 10, def: 0, price: 1100 },
  { id: 1472000, name: "Garnier", slot: "weapon", req: 10, watk: 10, str: 0, dex: 0, int: 0, luk: 2, hp: 0, def: 0, price: 800 },
  { id: 1332007, name: "Fruit Knife", slot: "weapon", req: 8, watk: 22, str: 0, dex: 0, int: 0, luk: 1, hp: 0, def: 0, price: 750 },
  { id: 1482000, name: "Steel Knuckler", slot: "weapon", req: 10, watk: 18, str: 1, dex: 1, int: 0, luk: 0, hp: 20, def: 0, price: 850 },
  { id: 1492000, name: "Pistol", slot: "weapon", req: 10, watk: 13, str: 0, dex: 2, int: 0, luk: 0, hp: 10, def: 0, price: 850 },

  // Authentic 1st Job Projectile Items & Ammunition (in USE)
  { id: 2060000, name: "Arrow for Bow", slot: "use", req: 0, watk: 1, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 1 },
  { id: 2061000, name: "Arrow for Crossbow", slot: "use", req: 0, watk: 1, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 1 },
  { id: 2070000, name: "Subi Throwing-Stars", slot: "use", req: 0, watk: 15, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 500 },
  { id: 2330000, name: "Bullet", slot: "use", req: 0, watk: 10, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100 },

  // Iconic Outfits & Robes
  { id: 1050014, name: "Sauna Robe (M)", slot: "top", req: 30, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 100, def: 20, price: 8000 },
  { id: 1051013, name: "Sauna Robe (F)", slot: "top", req: 30, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 100, def: 20, price: 8000 },
];

export type WeaponType =
  | "1h_sword" | "1h_axe" | "1h_blunt" | "dagger" | "katara" | "cane" | "wand" | "staff"
  | "2h_sword" | "2h_axe" | "2h_blunt" | "spear" | "polearm"
  | "bow" | "crossbow" | "dual_bowgun" | "ancient_bow"
  | "claw"
  | "knuckle" | "gun" | "cannon" | "soul_shooter"
  | "desperado" | "energy_sword" | "arm_cannon" | "scepter" | "cash";

export function getWeaponType(id: number): WeaponType {
  const p = Math.floor(id / 10000);
  switch (p) {
    case 121: return "scepter";
    case 122: return "soul_shooter";
    case 123: return "desperado";
    case 124: return "energy_sword";
    case 130: return "1h_sword";
    case 131: return "1h_axe";
    case 132: return "1h_blunt";
    case 133: return "dagger";
    case 134: return "katara";
    case 136: return "cane";
    case 137: return "wand";
    case 138: return "staff";
    case 140: return "2h_sword";
    case 141: return "2h_axe";
    case 142: return "2h_blunt";
    case 143: return "spear";
    case 144: return "polearm";
    case 145: return "bow";
    case 146: return "crossbow";
    case 147: return "claw";
    case 148: return "knuckle";
    case 149: return "gun";
    case 152: return "dual_bowgun";
    case 153: return "cannon";
    case 158: return "arm_cannon";
    case 159: return "ancient_bow";
    default: return "cash";
  }
}

/** Human-readable weapon type display names */
export const WEAPON_TYPE_NAME: Record<WeaponType, string> = {
  "1h_sword": "One-Handed Sword",
  "1h_axe": "One-Handed Axe",
  "1h_blunt": "One-Handed Blunt Weapon",
  "dagger": "Dagger",
  "katara": "Katara",
  "cane": "Cane",
  "wand": "Wand",
  "staff": "Staff",
  "2h_sword": "Two-Handed Sword",
  "2h_axe": "Two-Handed Axe",
  "2h_blunt": "Two-Handed Blunt Weapon",
  "spear": "Spear",
  "polearm": "Polearm",
  "bow": "Bow",
  "crossbow": "Crossbow",
  "dual_bowgun": "Dual Bowgun",
  "ancient_bow": "Ancient Bow",
  "claw": "Claw",
  "knuckle": "Knuckle",
  "gun": "Gun",
  "cannon": "Hand Cannon",
  "soul_shooter": "Soul Shooter",
  "desperado": "Desperado",
  "energy_sword": "Energy Sword",
  "arm_cannon": "Arm Cannon",
  "scepter": "Scepter",
  "cash": "Cosmetic Weapon",
};

/** Authentic MapleStory weapon types allowed for each class */
export const CLASS_ALLOWED_WEAPONS: Record<ClassId, WeaponType[]> = {
  beginner: ["1h_sword", "1h_blunt", "dagger", "cash"],
  warrior: ["1h_sword", "1h_axe", "1h_blunt", "2h_sword", "2h_axe", "2h_blunt", "spear", "polearm", "desperado", "arm_cannon", "cash"],
  magician: ["wand", "staff", "scepter", "cash"],
  bowman: ["bow", "crossbow", "dual_bowgun", "ancient_bow", "cash"],
  thief: ["claw", "dagger", "katara", "cane", "energy_sword", "cash"],
  pirate: ["knuckle", "gun", "cannon", "soul_shooter", "energy_sword", "cash"],
};

/** Reverse lookup: classes eligible to equip a given weapon type */
export const WEAPON_CLASS_MAP: Partial<Record<WeaponType, ClassId[]>> = {
  "1h_sword": ["warrior", "beginner"],
  "1h_axe": ["warrior"],
  "1h_blunt": ["warrior", "beginner"],
  "dagger": ["thief", "beginner"],
  "katara": ["thief"],
  "cane": ["thief"],
  "wand": ["magician"],
  "staff": ["magician"],
  "scepter": ["magician"],
  "2h_sword": ["warrior"],
  "2h_axe": ["warrior"],
  "2h_blunt": ["warrior"],
  "spear": ["warrior"],
  "polearm": ["warrior"],
  "desperado": ["warrior"],
  "arm_cannon": ["warrior"],
  "bow": ["bowman"],
  "crossbow": ["bowman"],
  "dual_bowgun": ["bowman"],
  "ancient_bow": ["bowman"],
  "claw": ["thief"],
  "knuckle": ["pirate"],
  "gun": ["pirate"],
  "cannon": ["pirate"],
  "soul_shooter": ["pirate"],
  "energy_sword": ["thief", "pirate"],
  "cash": ["beginner", "warrior", "magician", "bowman", "thief", "pirate"],
};

/** Returns true if the given class can equip this weapon */
export function canClassEquipWeapon(classId: ClassId, weaponId: number): boolean {
  const wType = getWeaponType(weaponId);
  if (wType === "cash") return true;
  const allowed = CLASS_ALLOWED_WEAPONS[classId];
  return allowed ? allowed.includes(wType) : true;
}

/** Returns the list of classes that can equip a given weapon */
export function getWeaponAllowedClasses(weaponId: number): ClassId[] {
  const wType = getWeaponType(weaponId);
  return WEAPON_CLASS_MAP[wType] ?? ["beginner", "warrior", "magician", "bowman", "thief", "pirate"];
}

/** Formatted string of allowed classes for tooltips and alerts (e.g. "Bowman", "Thief", etc.) */
export function getWeaponAllowedClassesDesc(weaponId: number): string {
  const classes = getWeaponAllowedClasses(weaponId);
  if (classes.length >= 6) return "All Classes";
  return classes.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(" / ");
}

/** Resolves eligible classes from MapleStory's reqJob bitmask (1=Warrior, 2=Magician, 4=Bowman, 8=Thief, 16=Pirate) */
export function getClassesForReqJob(reqJob?: number): ClassId[] {
  if (reqJob === undefined || reqJob === 0 || reqJob === -1) {
    return ["beginner", "warrior", "magician", "bowman", "thief", "pirate"];
  }
  const classes: ClassId[] = [];
  if (reqJob & 1) classes.push("warrior");
  if (reqJob & 2) classes.push("magician");
  if (reqJob & 4) classes.push("bowman");
  if (reqJob & 8) classes.push("thief");
  if (reqJob & 16) classes.push("pirate");
  return classes.length > 0 ? classes : ["beginner", "warrior", "magician", "bowman", "thief", "pirate"];
}

/** Returns the list of classes that can equip any item (weapon or armor/accessory) */
export function getItemAllowedClasses(b: GearBase): ClassId[] {
  if (b.cosmetic || b.cash) return ["beginner", "warrior", "magician", "bowman", "thief", "pirate"];
  if (b.slot === "weapon") {
    const wClasses = getWeaponAllowedClasses(b.id);
    if (b.reqJob && b.reqJob > 0) {
      const jobClasses = getClassesForReqJob(b.reqJob);
      const intersection = wClasses.filter((c) => jobClasses.includes(c));
      return intersection.length > 0 ? intersection : wClasses;
    }
    return wClasses;
  }
  if (b.reqJob && b.reqJob > 0) {
    return getClassesForReqJob(b.reqJob);
  }
  return ["beginner", "warrior", "magician", "bowman", "thief", "pirate"];
}

/** Returns true if the class can equip this item */
export function canClassEquipItem(classId: ClassId, b: GearBase): boolean {
  if (b.cosmetic || b.cash) return true;
  const allowed = getItemAllowedClasses(b);
  return allowed.includes(classId);
}

/** Returns formatted string description of allowed classes for tooltips */
export function getItemAllowedClassesDesc(b: GearBase): string {
  if (b.cosmetic || b.cash) return "Shared";
  const classes = getItemAllowedClasses(b);
  if (classes.length >= 6) return "Shared";
  return classes.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(" / ");
}

/** Returns true if an item is an Overall (Longcoat: covers both Top and Bottom) */
export function isOverallItem(id: number): boolean {
  return Math.floor(id / 10000) === 105;
}

/** Determines gender requirement for an equipment item based on MapleStory conventions */
export function getItemGender(id: number, name?: string): ItemGender {
  // 1. Explicit name flags (e.g. "Sauna Robe (M)", "Bath Towel (F)")
  if (name) {
    if (/\(M\)|\b\(Male\)\b/i.test(name)) return "male";
    if (/\(F\)|\b\(Female\)\b/i.test(name)) return "female";
  }

  // 2. Authentic MapleStory ID standard for Character equips:
  // Item ID: 1XXGYZZ, where G is gender digit: 0 = Male, 1 = Female, 2 = Both (Unisex)
  // Weapons (130-149) and accessories are always shared/unisex.
  const prefix = Math.floor(id / 10000);
  if (prefix >= 100 && prefix <= 119) {
    const genderDigit = Math.floor(id / 1000) % 10;
    if (genderDigit === 0) return "male";
    if (genderDigit === 1) return "female";
    return "both";
  }

  return "both";
}

/** Returns true if the character's gender can equip this item */
export function canGenderEquip(characterGender: string | undefined, itemGender: ItemGender): boolean {
  if (itemGender === "both") return true;
  const charG = (characterGender ?? "male").toLowerCase();
  return charG === itemGender;
}

export function isRangedWeapon(id: number): boolean {
  const t = getWeaponType(id);
  return (
    t === "bow" ||
    t === "crossbow" ||
    t === "dual_bowgun" ||
    t === "ancient_bow" ||
    t === "claw" ||
    t === "gun" ||
    t === "cannon" ||
    t === "soul_shooter"
  );
}

export function isMagicWeapon(id: number): boolean {
  const t = getWeaponType(id);
  return t === "wand" || t === "staff" || t === "scepter";
}

export function getWeaponAttackAnim(id: number): string {
  const t = getWeaponType(id);
  switch (t) {
    case "bow":
    case "crossbow":
    case "dual_bowgun":
    case "ancient_bow":
      return "shoot1";
    case "claw":
      return Math.random() < 0.5 ? "swingO1" : "swingO2";
    case "gun":
    case "cannon":
    case "soul_shooter":
      return "shoot1";
    case "spear":
      return Math.random() < 0.5 ? "stabT1" : "swingP1";
    case "polearm":
      return Math.random() < 0.5 ? "swingP1" : "swingP2";
    case "2h_sword":
    case "2h_axe":
    case "2h_blunt":
    case "desperado":
    case "arm_cannon":
      return Math.random() < 0.5 ? "swingT1" : "swingT2";
    case "dagger":
    case "katara":
    case "cane":
      return Math.random() < 0.5 ? "stabO1" : "swingO1";
    default:
      return Math.random() < 0.5 ? "swingO1" : "swingO2";
  }
}

export function getWeaponStandAnim(id: number): string {
  const t = getWeaponType(id);
  switch (t) {
    case "2h_sword":
    case "2h_axe":
    case "2h_blunt":
    case "spear":
    case "polearm":
    case "bow":
    case "crossbow":
    case "dual_bowgun":
    case "ancient_bow":
    case "knuckle":
    case "gun":
    case "cannon":
    case "soul_shooter":
    case "desperado":
    case "arm_cannon":
      return "stand2";
    default:
      return "stand1";
  }
}

export function getWeaponWalkAnim(id: number): string {
  const t = getWeaponType(id);
  switch (t) {
    case "2h_sword":
    case "2h_axe":
    case "2h_blunt":
    case "spear":
    case "polearm":
    case "bow":
    case "crossbow":
    case "dual_bowgun":
    case "ancient_bow":
    case "knuckle":
    case "gun":
    case "cannon":
    case "soul_shooter":
    case "desperado":
    case "arm_cannon":
      return "walk2";
    default:
      return "walk1";
  }
}

export const GEAR = new Map<number, GearBase>([...STARTER, ...ICONIC_GEAR, ...COSMETICS].map((g) => [g.id, { ...g }]));
export const MATS = new Map<number, string>();

export function loadItemData(d: { gear: (GearBase & { slot: string })[]; mats: { id: number; name: string }[] }) {
  for (const g of [...STARTER, ...ICONIC_GEAR, ...COSMETICS, ...d.gear]) {
    const isCash = Boolean((g as any).cash);
    const isCosmetic = Boolean((g as any).cosmetic || isCash);
    const b = { ...g, cash: isCash, cosmetic: isCosmetic } as GearBase;
    b.reqJob = (g as any).reqJob ?? 0;
    if (isCash || isCosmetic) {
      b.watk = 0; b.str = 0; b.dex = 0; b.int = 0; b.luk = 0; b.hp = 0; b.def = 0;
    } else {
      // Some accessories only carry magic defence in the data; give them level-scaled stats.
      if (!b.watk && !b.str && !b.dex && !b.hp && !b.def) { b.def = 2 + Math.round(b.req / 4); b.hp = b.req * 2; if (b.slot === "earrings") b.str = Math.round(b.req / 10); }
      if (b.slot === "weapon" && !b.watk) b.watk = 17 + b.req;
    }
    b.overall = isOverallItem(b.id);
    b.gender = getItemGender(b.id, b.name);
    b.price = Math.max(b.price, 40 + b.req * 60);
    GEAR.set(b.id, b);
  }
  for (const m of d.mats) MATS.set(m.id, m.name);
  MATS.set(4001886, "Crystal of Intense Power");
}

export const gearIcon = (id: number) => `/wz/item/${id}/iconRaw`;
let uidN = Date.now() % 100000;
export const newUid = () => `g${(uidN++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Rolls a rarity with an optional luck bonus (bosses, crafting). */
export function rollRarity(luck = 0) {
  const r = Math.random() * 100;
  const leg = 0.4 + luck * 0.6, uni = leg + 2 + luck * 2.5, epi = uni + 8 + luck * 6, rare = epi + 26 + luck * 8;
  return r < leg ? 4 : r < uni ? 3 : r < epi ? 2 : r < rare ? 1 : 0;
}

const POT_POOL: Record<string, Potential["stat"][]> = {
  weapon: ["att", "att", "str", "boss", "boss", "exp"],
  default: ["str", "dex", "hp", "hp", "att", "meso", "drop", "exp"],
};
export function rollPotential(slot: string, rarity: number): Potential[] {
  if (rarity <= 0) return [];
  const lines = rarity >= 3 ? 3 : rarity + 1;
  const pool = POT_POOL[slot === "weapon" ? "weapon" : "default"];
  const tierPct = [0, 3, 6, 9, 12][rarity];
  return Array.from({ length: lines }, (_, i) => {
    const stat = pick(pool);
    const scale = stat === "att" || stat === "boss" ? 1 : stat === "meso" || stat === "drop" || stat === "exp" ? 0.8 : 1.2;
    // First line always at tier, the rest may roll a tier lower (like real potential).
    const pct = Math.max(1, Math.round((i === 0 ? tierPct : tierPct - (Math.random() < 0.6 ? 3 : 0)) * scale));
    return { stat, pct };
  });
}

export function makeGear(id: number, luck = 0, minRarity = 0): Gear {
  const b = GEAR.get(id);
  if (b?.cash || b?.cosmetic) {
    return { uid: newUid(), id, rarity: 0, star: 0, pot: [], cosmetic: true, cash: true };
  }
  const rarity = Math.max(minRarity, rollRarity(luck));
  return { uid: newUid(), id, rarity, star: 0, pot: rollPotential(b?.slot ?? "hat", rarity) };
}

/** Picks a random gear base in player's level range up to player level + 10 for exciting progression upgrades */
export function randomGearFor(level: number, classId?: string) {
  const minReq = Math.max(0, level - 10);
  const maxReq = level + 10;
  
  // Filter gear in the range [level - 10, level + 10], ignoring basic starter weapon (1302000) and cosmetics, respecting class rules
  let list = [...GEAR.values()].filter(
    (g) => g.req <= maxReq && g.req >= minReq && g.id !== 1302000 && !g.cosmetic &&
      (!classId || canClassEquipItem(classId as ClassId, g))
  );
  
  // If list is small, widen lower bound
  if (list.length < 5) {
    list = [...GEAR.values()].filter(
      (g) => g.req <= maxReq && g.id !== 1302000 && !g.cosmetic &&
        (!classId || canClassEquipItem(classId as ClassId, g))
    );
  }

  // Weight items closer to or ahead of current level (upcoming upgrades level..level+10)
  const weighted: number[] = [];
  for (const g of list) {
    let weight = 1;
    if (g.req >= level && g.req <= maxReq) {
      weight = 4; // 4x chance for upcoming upgrade gear in [level, level + 10]!
    } else if (g.req >= level - 5) {
      weight = 2;
    }
    for (let i = 0; i < weight; i++) weighted.push(g.id);
  }

  if (weighted.length) {
    return weighted[Math.floor(Math.random() * weighted.length)];
  }
  return pick([...GEAR.values()]).id;
}

export interface GearStats { watk: number; str: number; dex: number; int: number; luk: number; hp: number; def: number }
export function gearStats(g: Gear): GearStats {
  const b = GEAR.get(g.id);
  if (!b || b.cash || b.cosmetic || g.cash || g.cosmetic) return { watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0 };
  const rb = 1 + g.rarity * 0.08; // higher rarity also rolls slightly better base stats
  const s = g.star;
  return {
    watk: Math.round(b.watk * rb + (b.slot === "weapon" ? s * Math.max(2, b.watk * 0.05) : s >= 5 ? s - 4 : 0)),
    str: Math.round(b.str * rb + s * 2),
    dex: Math.round(b.dex * rb + s * 2),
    int: Math.round((b.int ?? 0) * rb + s * 2),
    luk: Math.round((b.luk ?? 0) * rb + s * 2),
    hp: Math.round(b.hp * rb + s * 8),
    def: Math.round(b.def * rb + s * 2),
  };
}

/** Canonical MapleStory Equipment Type Order for sorting */
export const GEAR_TYPE_ORDER: Record<string, number> = {
  weapon: 1,
  hat: 2,
  top: 3,
  bottom: 4,
  shoes: 5,
  gloves: 6,
  cape: 7,
  shield: 8,
  shoulder: 9,
  belt: 10,
  ring: 11,
  ring1: 11,
  ring2: 11,
  ring3: 11,
  ring4: 11,
  pendant: 12,
  earrings: 13,
  face: 14,
  eye: 15,
  pocket: 16,
  emblem: 17,
  badge: 18,
};

/** Evaluates an individual gear instance's Combat Power (CP) contribution */
export function gearCombatPower(g: Gear): number {
  const b = GEAR.get(g.id);
  if (!b || b.cash || b.cosmetic || g.cash || g.cosmetic) return 0;

  const st = gearStats(g);
  // Main stat weight: prioritize highest primary stat, plus secondary contributions
  const maxStat = Math.max(st.str, st.dex, st.int, st.luk);
  const totalStats = st.str + st.dex + st.int + st.luk;
  // In MapleStory, 1 ATT is roughly equivalent to 4-5 main stat
  const attWeight = st.watk * 5;
  const statWeight = maxStat * 2 + totalStats;
  const hpWeight = Math.round(st.hp * 0.1);
  const defWeight = Math.round(st.def * 0.4);

  let potBonus = 0;
  if (g.pot && g.pot.length > 0) {
    for (const p of g.pot) {
      if (p.stat === "att") potBonus += p.pct * 40;
      else if (p.stat === "boss") potBonus += p.pct * 35;
      else if (["str", "dex", "int", "luk"].includes(p.stat)) potBonus += p.pct * 12;
      else if (p.stat === "hp") potBonus += p.pct * 4;
      else potBonus += p.pct * 8; // utility
    }
  }

  // Base raw combat score
  const baseScore = attWeight + statWeight + hpWeight + defWeight + potBonus;

  // Star Force scaling: exponential-like growth matching MapleStory Star Force power
  const sfMultiplier = 1 + g.star * 0.08 + (g.star >= 10 ? (g.star - 9) * 0.05 : 0);
  const rarityBonus = g.rarity * 40;

  // Required level tier multiplier (higher tier gear scales higher)
  const tierMultiplier = 1 + Math.floor((b.req ?? 0) / 20) * 0.15;

  const cp = Math.round((baseScore * sfMultiplier + rarityBonus + g.star * 20) * tierMultiplier);
  return Math.max(1, cp);
}

export const POT_LABEL: Record<Potential["stat"], string> = {
  att: "ATT", str: "STR", dex: "DEX", int: "INT", luk: "LUK", hp: "Max HP", boss: "Boss Damage", meso: "Meso Obtained", drop: "Item Drop Rate", exp: "EXP Obtained",
};

/** Equips that confer a floating / hovering levitation effect (ONLY Raven Persona hats) */
export const RAVEN_PERSONA_IDS = new Set<number>([
  1003409, // Raven Persona
  1003422, // Garnet Raven Persona
  1004782, // Raven Persona
]);
export const isRavenPersona = (id: number) => RAVEN_PERSONA_IDS.has(id);

export const HOVER_ITEM_IDS = new Set<number>([
  1003409, // Raven Persona
  1003422, // Garnet Raven Persona
  1004782, // Raven Persona
]);
export const isHoverItem = (id: number) => HOVER_ITEM_IDS.has(id);

/** Wizet GM hats conferring invulnerability and glowing GM item aura */
export const WIZET_INVINCIBLE_HAT_IDS = new Set<number>([
  1002140, // Wizet Invincible Hat
  1003142, // Wizet Invincible Hat
]);
export const isWizetHat = (id: number) => WIZET_INVINCIBLE_HAT_IDS.has(id);

// ------------------------------------------------------------- star force & cubes
export const starRate = (star: number) => Math.max(0.3, 0.95 - star * 0.045);
export const starCost = (g: Gear) => { const b = GEAR.get(g.id)!; return Math.round((100 + b.req * 25) * Math.pow(1.35, g.star)); };
export const starMat = (star: number) => (star < 5 ? 4011000 : star < 10 ? 4011001 : 4011002);
export const cubeCost = (g: Gear) => { const b = GEAR.get(g.id)!; return 400 + b.req * 40 + g.rarity * 300; };

// ------------------------------------------------------------- materials & recipes
/** Material dropped by each regular mob and boss. */
export const MOB_MAT: Record<number, number> = {
  1210102: 4000001, 1110100: 4000012, 210100: 4000010,
  2220000: 4000019, 3220000: 4000003, 6130101: 4000040, 9300003: 4000010, 8220007: 4000040, 5220000: 4000013, 6300005: 4000040,
};
export const ORES = [4010000, 4010001, 4010002, 4020000, 4020007];
export const MAT_PRICE: Record<number, number> = {
  4000001: 12, 4000010: 14, 4000012: 18, 4000019: 30, 4000003: 25, 4000013: 40, 4000040: 220,
  4010000: 60, 4010001: 110, 4010002: 180, 4011000: 700, 4011001: 1300, 4011002: 2100,
  4020000: 260, 4020007: 900, 4021000: 2800, 4021007: 9500, 4001126: 50,
  4001886: 2500000,
};
export const matIcon = (id: number) => `/wz/item/${id}/icon`;

export interface Recipe {
  id: string; name: string; kind: "refine" | "potion" | "gear";
  needs: [number, number][]; meso: number; level: number;
  out: { t: "mat"; id: number; n: number } | { t: "use"; id: number; n: number } | { t: "gear"; slot: Slot; tier: number };
}

export function recipes(): Recipe[] {
  const r: Recipe[] = [
    { id: "r-bronze", name: "Bronze Plate", kind: "refine", needs: [[4010000, 10]], meso: 300, level: 1, out: { t: "mat", id: 4011000, n: 1 } },
    { id: "r-steel", name: "Steel Plate", kind: "refine", needs: [[4010001, 10]], meso: 500, level: 1, out: { t: "mat", id: 4011001, n: 1 } },
    { id: "r-mithril", name: "Mithril Plate", kind: "refine", needs: [[4010002, 10]], meso: 800, level: 1, out: { t: "mat", id: 4011002, n: 1 } },
    { id: "r-garnet", name: "Garnet", kind: "refine", needs: [[4020000, 10]], meso: 1200, level: 1, out: { t: "mat", id: 4021000, n: 1 } },
    { id: "r-diamond", name: "Diamond", kind: "refine", needs: [[4020007, 10]], meso: 4000, level: 1, out: { t: "mat", id: 4021007, n: 1 } },
    { id: "p-red", name: "Red Potion ×20", kind: "potion", needs: [[4000001, 5]], meso: 100, level: 1, out: { t: "use", id: 2000000, n: 20 } },
    { id: "p-orange", name: "Orange Potion ×15", kind: "potion", needs: [[4000001, 10], [4000012, 5]], meso: 300, level: 1, out: { t: "use", id: 2000001, n: 15 } },
    { id: "p-white", name: "White Potion ×10", kind: "potion", needs: [[4000012, 10], [4000010, 5]], meso: 600, level: 1, out: { t: "use", id: 2000002, n: 10 } },
    { id: "p-blue", name: "Blue Potion ×20", kind: "potion", needs: [[4000010, 6]], meso: 150, level: 1, out: { t: "use", id: 2000003, n: 20 } },
    { id: "p-elixir", name: "Mana Elixir ×10", kind: "potion", needs: [[4000010, 10], [4000012, 6]], meso: 700, level: 1, out: { t: "use", id: 2000006, n: 10 } },
  ];
  // Gear: one recipe per slot per 10-level tier; crafted items are always at least Rare.
  const plates = [4011000, 4011000, 4011001, 4011001, 4011002, 4011002, 4011002, 4011002];
  for (const slot of SLOTS) {
    for (let tier = 1; tier <= 7; tier++) {
      const base = [...GEAR.values()].find((g) => g.slot === slot && Math.floor(g.req / 10) === tier);
      if (!base) continue;
      const mat = tier <= 2 ? 4000001 : tier <= 4 ? 4000012 : 4000010;
      const needs: [number, number][] = [[mat, 8 + tier * 4], [plates[tier], Math.ceil(tier / 2)]];
      if (tier >= 3) needs.push([tier >= 5 ? 4021007 : 4021000, tier >= 5 ? 1 : 2]);
      if (tier >= 4) needs.push([4000040, tier - 2]);
      r.push({ id: `g-${slot}-${tier}`, name: base.name, kind: "gear", needs, meso: 500 * tier * tier, level: base.req, out: { t: "gear", slot, tier } });
    }
  }
  return r;
}
export const recipeGearId = (slot: Slot, tier: number) => [...GEAR.values()].find((g) => g.slot === slot && Math.floor(g.req / 10) === tier)?.id;

// ------------------------------------------------------------- prices
export const USE_PRICE: Record<number, number> = { 2000000: 25, 2000001: 80, 2000002: 160, 2000003: 100, 2000006: 320 };
export function gearValue(g: Gear) {
  const b = GEAR.get(g.id);
  if (!b) return 100;
  return Math.round(b.price * (1 + g.rarity * g.rarity * 0.9) * (1 + g.star * 0.35) * 1.2);
}
export const npcSellPrice = (g: Gear) => Math.max(1, Math.round(gearValue(g) * 0.25));
export { rand, pick };
