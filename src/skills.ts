// Gameplay definitions for the skills whose art/strings come from public/data/skills.json.
import type { Sprite } from "./assets.ts";

export type SkillKind = "attack" | "ranged" | "buff" | "passive" | "move";

export interface SkillDef {
  id: string;
  kind: SkillKind;
  tab: 0 | 1 | 2 | 3 | 4; // Beginner, 1st, 2nd, 3rd, 4th job
  reqLevel: number;
  maxLevel: number;
  mp: (lv: number) => number;
  /** Damage % of the base attack. */
  dmg?: (lv: number) => number;
  hits?: number;
  targets?: number;
  range?: number;
  /** Cooldown in seconds. */
  cooldown?: (lv: number) => number;
  /** Buff duration in seconds. */
  duration?: (lv: number) => number;
  /** Flat stat bonuses this buff grants while active (per level). */
  buff?: { att?: number; str?: number; dex?: number; int?: number; luk?: number; hp?: number; def?: number; speed?: number };
  summary: (lv: number) => string;
}

export interface SkillArt {
  id: string; name: string; desc: string; cooltime?: number;
  icon: Sprite; iconMouseOver: Sprite | null; iconDisabled: Sprite | null;
  effect: Sprite[]; effect0: Sprite[]; hit: Sprite[]; ball?: Sprite[];
}

// ----------------------------------------------------------------- classes

export type ClassId = "beginner" | "warrior" | "magician" | "bowman" | "thief" | "pirate";

export interface ClassDef {
  id: ClassId;
  name: string;
  /** Which stat drives this class's damage + is auto-assigned on level-up. */
  primary: "str" | "dex" | "int" | "luk";
  /** Which stat improves accuracy. */
  secondary: "str" | "dex" | "int" | "luk";
  tabs: string[]; // Beginner, 1st job, 2nd job, 3rd job, 4th job
  tabLevel: number[];
  /** Skill IDs for each tab. */
  skillsByTab: string[][];
  /** Starting equipment (weapon, top, bottom, shoes) ids. */
  startingGear: { weapon: number; top: number; bottom: number; shoes: number };
  /** Default hotbar assignments when a new character starts. */
  defaultQuick: Record<string, Action>;
  /** Base stats for a fresh character (HP/MP/STR/DEX/INT/LUK). */
  base: { hp: number; mp: number; str: number; dex: number; int: number; luk: number };
}

/** Classes in the game. New characters always start as Beginner and advance at Lv. 10! */
export const CLASSES: ClassDef[] = [
  {
    id: "beginner", name: "Beginner", primary: "str", secondary: "dex",
    tabs: ["Beginner"], tabLevel: [1, 10, 30, 60, 100],
    skillsByTab: [
      ["0001000", "0001001", "0001002", "0001005", "0001007", "0001009", "0001011"],
    ],
    startingGear: { weapon: 1302000, top: 1040002, bottom: 1060002, shoes: 1072001 },
    defaultQuick: {
      Control: { t: "attack" },
      Shift: { t: "skill", id: "0001000" }, // Three Snails
      "1": { t: "skill", id: "0001001" }, // Recovery
      "2": { t: "skill", id: "0001002" }, // Nimble Feet
      Delete: { t: "item", id: 2000000 }, // Red Potion
      End: { t: "item", id: 2000003 }, // Blue Potion
      PageDown: { t: "item", id: 2000001 }, // Orange Potion
    },
    base: { hp: 50, mp: 20, str: 4, dex: 4, int: 4, luk: 4 },
  },
  {
    id: "warrior", name: "Warrior", primary: "str", secondary: "dex",
    tabs: ["Beginner", "Warrior", "Fighter", "Crusader", "Hero"], tabLevel: [1, 10, 30, 60, 100],
    skillsByTab: [
      ["0001000", "0001001", "0001002", "0001005", "0001007", "0001009", "0001011"],
      ["1001005", "1001008", "1001010", "1000003", "1000009", "1000007"],
      ["1101011", "1101012", "1101013", "1101004", "1101006", "1100000", "1100002", "1100009"],
      ["1111010", "1111012", "1111003", "1111008", "1111015", "1110013", "1110000", "1110009", "1110011"],
      ["1121008", "1121010", "1121000", "1121011"],
    ],
    startingGear: { weapon: 1302007, top: 1040002, bottom: 1060002, shoes: 1072001 },
    defaultQuick: {
      Shift: { t: "skill", id: "1001005" }, Insert: { t: "skill", id: "1101011" },
      Home: { t: "skill", id: "1111010" }, PageUp: { t: "skill", id: "0001000" },
      Control: { t: "attack" }, Delete: { t: "item", id: 2000000 }, End: { t: "item", id: 2000003 },
      PageDown: { t: "item", id: 2000001 }, "1": { t: "skill", id: "0001001" },
      "2": { t: "skill", id: "0001002" }, "3": { t: "skill", id: "1101006" },
    },
    base: { hp: 80, mp: 30, str: 25, dex: 10, int: 4, luk: 4 },
  },
  {
    id: "magician", name: "Magician", primary: "int", secondary: "int",
    tabs: ["Beginner", "Magician", "Wizard (F/P)", "Mage", "Arch Mage (F/P)"], tabLevel: [1, 10, 30, 60, 100],
    skillsByTab: [
      ["0001000", "0001001", "0001002", "0001005", "0001007", "0001009", "0001011"],
      ["2001008", "2001002", "2001009", "2000010", "2000006", "2000007"],
      ["2101004", "2101005", "2101001", "2101008", "2101010", "2100006", "2100007", "2100000", "2100009"],
      ["2111002", "2111003", "2111010", "2111011", "2111008", "2111007", "2110012", "2110001", "2110009", "2110000"],
      ["2121006", "2121007", "2121003", "2121000"],
    ],
    startingGear: { weapon: 1372005, top: 1040002, bottom: 1060002, shoes: 1072001 },
    defaultQuick: {
      Shift: { t: "skill", id: "2001008" }, Insert: { t: "skill", id: "2101004" },
      Home: { t: "skill", id: "2111002" }, PageUp: { t: "skill", id: "0001000" },
      Control: { t: "attack" }, Delete: { t: "item", id: 2000000 }, End: { t: "item", id: 2000003 },
      PageDown: { t: "item", id: 2000001 }, "1": { t: "skill", id: "0001001" },
      "2": { t: "skill", id: "0001002" }, "3": { t: "skill", id: "2101001" },
    },
    base: { hp: 45, mp: 100, str: 4, dex: 4, int: 25, luk: 6 },
  },
  {
    id: "bowman", name: "Bowman", primary: "dex", secondary: "str",
    tabs: ["Beginner", "Archer", "Hunter", "Ranger", "Bowmaster"], tabLevel: [1, 10, 30, 60, 100],
    skillsByTab: [
      ["0001000", "0001001", "0001002", "0001005", "0001007", "0001009", "0001011"],
      ["3001004", "3001007", "3000001", "3000002", "3000006", "3000008"],
      ["3101005", "3101008", "3101004", "3101009", "3100002", "3100000", "3100001", "3100006"],
      ["3111013", "3111003", "3111009", "3111005", "3111010", "3111011", "3110001", "3110012", "3110007", "3110014"],
      ["3121015", "3121002", "3121000", "3121009"],
    ],
    startingGear: { weapon: 1452002, top: 1040002, bottom: 1060002, shoes: 1072001 },
    defaultQuick: {
      Shift: { t: "skill", id: "3001004" }, Insert: { t: "skill", id: "3101005" },
      Home: { t: "skill", id: "3111013" }, PageUp: { t: "skill", id: "0001000" },
      Control: { t: "attack" }, Delete: { t: "item", id: 2000000 }, End: { t: "item", id: 2000003 },
      PageDown: { t: "item", id: 2000001 }, "1": { t: "skill", id: "0001001" },
      "2": { t: "skill", id: "0001002" }, "3": { t: "skill", id: "3101004" },
    },
    base: { hp: 60, mp: 50, str: 10, dex: 25, int: 4, luk: 4 },
  },
  {
    id: "thief", name: "Thief", primary: "luk", secondary: "dex",
    tabs: ["Beginner", "Rogue", "Assassin", "Hermit", "Night Lord"], tabLevel: [1, 10, 30, 60, 100],
    skillsByTab: [
      ["0001000", "0001001", "0001002", "0001005", "0001007", "0001009", "0001011"],
      ["4001334", "4001344", "4001005", "4001003", "4001014", "4001011", "4000000", "4000010", "4000012", "4001013"],
      ["4101008", "4101011", "4101010", "4101003", "4100000", "4100001", "4100007"],
      ["4111010", "4111015", "4111007", "4111003", "4111002", "4111009", "4110008", "4110011", "4110012", "4110014"],
      ["4121013", "4121015", "4121000", "4121009"],
    ],
    startingGear: { weapon: 1472000, top: 1040002, bottom: 1060002, shoes: 1072001 },
    defaultQuick: {
      Shift: { t: "skill", id: "4001344" }, Insert: { t: "skill", id: "4101008" },
      Home: { t: "skill", id: "4111010" }, PageUp: { t: "skill", id: "0001000" },
      Control: { t: "attack" }, Delete: { t: "item", id: 2000000 }, End: { t: "item", id: 2000003 },
      PageDown: { t: "item", id: 2000001 }, "1": { t: "skill", id: "0001001" },
      "2": { t: "skill", id: "0001002" }, "3": { t: "skill", id: "4001005" },
    },
    base: { hp: 55, mp: 50, str: 4, dex: 10, int: 4, luk: 25 },
  },
  {
    id: "pirate", name: "Pirate", primary: "str", secondary: "dex",
    tabs: ["Beginner", "Pirate", "Brawler", "Marauder", "Buccaneer"], tabLevel: [1, 10, 30, 60, 100],
    skillsByTab: [
      ["0001000", "0001001", "0001002", "0001005", "0001007", "0001009", "0001011"],
      ["5001002", "5001003", "5001010", "5001005", "5000007", "5000000", "5000006"],
      ["5101012", "5101004", "5101006", "5101014", "5100015", "5100016", "5100001", "5100009", "5100010", "5100013", "5100011"],
      ["5111009", "5111002", "5111012", "5111007", "5111013", "5110014", "5110010", "5110011", "5110000"],
      ["5121007", "5121001", "5121009", "5121000"],
    ],
    startingGear: { weapon: 1482000, top: 1040002, bottom: 1060002, shoes: 1072001 },
    defaultQuick: {
      Shift: { t: "skill", id: "5001002" }, Insert: { t: "skill", id: "5101012" },
      Home: { t: "skill", id: "5111009" }, PageUp: { t: "skill", id: "0001000" },
      Control: { t: "attack" }, Delete: { t: "item", id: 2000000 }, End: { t: "item", id: 2000003 },
      PageDown: { t: "item", id: 2000001 }, "1": { t: "skill", id: "0001001" },
      "2": { t: "skill", id: "0001002" }, "3": { t: "skill", id: "5101006" },
    },
    base: { hp: 70, mp: 40, str: 20, dex: 15, int: 4, luk: 4 },
  },
];

export const CLASS_MAP = Object.fromEntries(CLASSES.map((c) => [c.id, c])) as Record<ClassId, ClassDef>;
export const classFor = (id: string | null | undefined): ClassDef => CLASS_MAP[(id ?? "beginner") as ClassId] ?? CLASSES[0];

/** Legacy aliases used before the class system was introduced. */
export const JOB_TABS = ["Beginner", "Warrior", "Fighter", "Crusader", "Hero"] as const;
export const TAB_LEVEL = [1, 10, 30, 60, 100];

// ----------------------------------------------------------------- skill defs

export const SKILL_DEFS: SkillDef[] = [
  // ---- Beginner (shared across all classes)
  { id: "0001000", kind: "ranged", tab: 0, reqLevel: 1, maxLevel: 3, mp: (l) => 4 + l * 2, dmg: (l) => 70 + l * 20, hits: 1, targets: 1, range: 320,
    summary: (l) => `Throws a snail shell. Damage ${70 + l * 20}%, range 320.` },
  { id: "0001001", kind: "buff", tab: 0, reqLevel: 1, maxLevel: 3, mp: () => 10, duration: (l) => 20 + l * 10,
    summary: (l) => `Recovers ${8 * l} HP every 2 seconds for ${20 + l * 10} sec.` },
  { id: "0001002", kind: "buff", tab: 0, reqLevel: 1, maxLevel: 3, mp: () => 10, duration: (l) => 30 + l * 15, buff: { speed: 10 },
    summary: (l) => `Movement speed +${l * 10}% for ${30 + l * 15} sec.` },
  { id: "0001005", kind: "buff", tab: 0, reqLevel: 1, maxLevel: 5, mp: () => 30, duration: (l) => 120 + l * 30, buff: { att: 4 },
    summary: (l) => `Echo of Hero: Weapon & Magic ATT +${l * 4} for ${120 + l * 30} sec.` },
  { id: "0001007", kind: "passive", tab: 0, reqLevel: 1, maxLevel: 3, mp: () => 0,
    summary: (l) => `Maker: unlocks legendary crafting techniques and item enhancements.` },
  { id: "0001009", kind: "attack", tab: 0, reqLevel: 1, maxLevel: 5, mp: (l) => 15 + l * 2, dmg: (l) => 150 + l * 15, hits: 2, targets: 6, range: 350,
    summary: (l) => `Bamboo Rain: rains bamboo arrows on up to 6 enemies. Damage ${150 + l * 15}%.` },
  { id: "0001011", kind: "attack", tab: 0, reqLevel: 1, maxLevel: 5, mp: (l) => 20 + l * 2, dmg: (l) => 180 + l * 20, hits: 1, targets: 8, range: 300,
    summary: (l) => `Power Explosion: releases concentrated power hitting up to 8 enemies. Damage ${180 + l * 20}%.` },

  // ---- Warrior 1st Job (Warrior)
  { id: "1001005", kind: "attack", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 8 + Math.floor(l / 4), dmg: (l) => 100 + l * 5, hits: 1, targets: 6, range: 170,
    summary: (l) => `Slash Blast: attacks up to 6 enemies in front of you. Damage ${100 + l * 5}%.` },
  { id: "1001008", kind: "move", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => Math.max(2, 6 - Math.floor(l / 2)),
    summary: (l) => `War Leap: launch much farther horizontally while in the air. Range +${l * 12}%.` },
  { id: "1001010", kind: "attack", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 10 + Math.floor(l / 4), dmg: (l) => 120 + l * 6, hits: 1, targets: 4, range: 180,
    summary: (l) => `Leap Attack: jump and slam into foes from above. Damage ${120 + l * 6}%.` },
  { id: "1000003", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `Iron Body: permanently reduces damage taken by ${l * 2}%, DEF +${l * 15}.` },
  { id: "1000009", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `Warrior Mastery: Max HP +${l * 3}%, Speed +${l}%.` },
  { id: "1000007", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `Guardian Armor: grants bonus armor and resistance to knockback.` },

  // ---- Warrior 2nd Job (Fighter)
  { id: "1101011", kind: "attack", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 12 + Math.floor(l / 2), dmg: (l) => 140 + l * 6, hits: 2, targets: 4, range: 160,
    summary: (l) => `Brandish: strikes up to 4 enemies twice. Damage ${140 + l * 6}%.` },
  { id: "1101012", kind: "attack", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 14 + Math.floor(l / 2), dmg: (l) => 150 + l * 7, hits: 2, targets: 6, range: 240,
    summary: (l) => `Combo Fury: pulls up to 6 enemies towards you. Damage ${150 + l * 7}%.` },
  { id: "1101013", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 15 + l, duration: (l) => 100 + l * 10, buff: { att: 4 },
    summary: (l) => `Combo Attack: generates combo orbs boosting damage by +${l * 2}%.` },
  { id: "1101004", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 12 + l, duration: (l) => 100 + l * 15,
    summary: (l) => `Weapon Booster: increases weapon attack speed by 2 levels.` },
  { id: "1101006", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 16 + l, duration: (l) => 60 + l * 12, buff: { att: 3 },
    summary: (l) => `Rage: Weapon ATT +${l * 3} for ${60 + l * 12} sec.` },
  { id: "1100000", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `Weapon Mastery: Weapon Mastery +${l * 5}%, Accuracy +${l * 2}.` },
  { id: "1100002", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 20, mp: () => 0,
    summary: (l) => `Final Attack: 40% chance of delivering a secondary blow of ${100 + l * 5}%.` },
  { id: "1100009", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 5, mp: () => 0,
    summary: (l) => `Physical Training: permanently increases STR and DEX by ${l * 6}.` },

  // ---- Warrior 3rd Job (Crusader)
  { id: "1111010", kind: "attack", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 18 + Math.floor(l / 2), dmg: (l) => 180 + l * 7, hits: 3, targets: 8, range: 240,
    summary: (l) => `Intrepid Slash: slashes up to 8 enemies three times. Damage ${180 + l * 7}%.` },
  { id: "1111012", kind: "attack", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 15 + l, dmg: (l) => 130 + l * 6, hits: 1, targets: 10, range: 300,
    summary: (l) => `Rush: charges forward, pushing and damaging up to 10 monsters.` },
  { id: "1111003", kind: "attack", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 22 + l, dmg: (l) => 250 + l * 10, hits: 1, targets: 1, range: 170,
    summary: (l) => `Panic: delivers a crushing blow that inflicts darkness on target. Damage ${250 + l * 10}%.` },
  { id: "1111008", kind: "attack", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 20 + l, dmg: (l) => 160 + l * 6, hits: 1, targets: 10, range: 350,
    summary: (l) => `Shout: roars loudly to damage and stun up to 10 enemies on screen.` },
  { id: "1111015", kind: "move", tab: 3, reqLevel: 20, maxLevel: 5, mp: (l) => 10,
    summary: (l) => `Upward Charge: launches into the air with a forceful vertical leap.` },
  { id: "1110013", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Combo Synergy: raises combo orb damage bonus to +${l * 3}% each.` },
  { id: "1110000", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Self Recovery: constantly recovers ${l * 40} HP and ${l * 15} MP every 4 sec.` },
  { id: "1110009", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Chance Attack: deals +${l * 3}% bonus damage to stunned or blinded foes.` },
  { id: "1110011", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Endure: increases abnormal status resistance and elemental resistance.` },

  // ---- Magician 1st Job (Magician)
  { id: "2001008", kind: "ranged", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 10 + Math.floor(l / 2), dmg: (l) => 120 + l * 6, hits: 1, targets: 1, range: 400,
    summary: (l) => `Energy Bolt: fires a condensed orb of magic at one enemy. Damage ${120 + l * 6}%.` },
  { id: "2001002", kind: "buff", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => 12 + l, duration: (l) => 60 + l * 12, buff: { def: 4 },
    summary: (l) => `Magic Guard: diverts ${(l * 8)}% of incoming damage to MP for ${60 + l * 12} sec.` },
  { id: "2001009", kind: "move", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => Math.max(4, 18 - Math.floor(l / 2)),
    summary: (l) => `Teleport: warp across horizontal space instantly.` },
  { id: "2000010", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `Magic Armor: increases physical and magic defense by +${l * 20}.` },
  { id: "2000006", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `MP Boost: permanently increases maximum MP by +${l * 5}%.` },
  { id: "2000007", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 5, mp: () => 0,
    summary: (l) => `Elemental Weakness: increases elemental spell efficiency.` },

  // ---- Magician 2nd Job (Wizard F/P)
  { id: "2101004", kind: "ranged", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 16 + Math.floor(l / 2), dmg: (l) => 160 + l * 7, hits: 2, targets: 4, range: 420,
    summary: (l) => `Flame Orb: hurls an orb of flame piercing through up to 4 enemies.` },
  { id: "2101005", kind: "ranged", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 14 + Math.floor(l / 2), dmg: (l) => 140 + l * 6, hits: 3, targets: 3, range: 380,
    summary: (l) => `Poison Breath: breathes a toxic poison mist at up to 3 foes.` },
  { id: "2101001", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 14 + l, duration: (l) => 60 + l * 15, buff: { int: 5 },
    summary: (l) => `Meditation: increases Magic ATT +${l * 3} for ${60 + l * 15} sec.` },
  { id: "2101008", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 15 + l, duration: (l) => 100 + l * 10,
    summary: (l) => `Magic Booster: increases spell casting speed by 2 levels.` },
  { id: "2101010", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `Ignite: fire spells leave persistent burning flames on impact.` },
  { id: "2100006", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `Spell Mastery: magic mastery +${l * 5}%, Magic ATT +${l * 2}.` },
  { id: "2100007", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 5, mp: () => 0,
    summary: (l) => `High Wisdom: permanently increases INT by +${l * 8}.` },
  { id: "2100000", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `MP Eater: absorbs MP from enemies when striking them.` },
  { id: "2100009", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 5, mp: () => 0,
    summary: (l) => `Elemental Drain: deals +${l * 3}% extra damage per active burn stack.` },

  // ---- Magician 3rd Job (Mage F/P)
  { id: "2111002", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 24 + l, dmg: (l) => 210 + l * 9, hits: 2, targets: 8, range: 420,
    summary: (l) => `Explosion: detonates a massive fire burst hitting up to 8 enemies.` },
  { id: "2111003", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 22 + Math.floor(l / 2), dmg: (l) => 170 + l * 7, hits: 3, targets: 6, range: 380,
    summary: (l) => `Poison Mist: creates an expansive noxious cloud poisoning foes.` },
  { id: "2111010", kind: "attack", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 25 + l, dmg: (l) => 180 + l * 8, hits: 2, targets: 6, range: 320,
    summary: (l) => `Viral Slime: infects targets with toxic slimes that multiply.` },
  { id: "2111011", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 20 + l, duration: (l) => 100 + l * 15,
    summary: (l) => `Elemental Adaptation: forms a barrier shielding against abnormal statuses.` },
  { id: "2111008", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Elemental Decrease: partially ignores enemy elemental resistances.` },
  { id: "2111007", kind: "move", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => Math.max(6, 18 - l), dmg: (l) => 140 + l * 6, hits: 1, targets: 4,
    summary: (l) => `Teleport Mastery: deals damage and stuns enemies at teleport destination.` },
  { id: "2110012", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Mana Burn: burns through enemy defenses on every spell hit.` },
  { id: "2110001", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Element Amplification: consumes 30% more MP to deal +${l * 4}% spell damage.` },
  { id: "2110009", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Arcane Overdrive: critical rate +${l * 3}%, critical damage +${l * 2}%.` },
  { id: "2110000", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Burning Magic: drastically increases damage against burning targets.` },

  // ---- Bowman 1st Job (Archer)
  { id: "3001004", kind: "ranged", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 10 + Math.floor(l / 2), dmg: (l) => 130 + l * 6, hits: 1, targets: 3, range: 420,
    summary: (l) => `Arrow Blow: fires a penetrating arrow striking up to 3 enemies.` },
  { id: "3000008", kind: "move", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => Math.max(4, 16 - l),
    summary: (l) => `Double Jump: leap forward through the air with a second jump.` },
  { id: "3001007", kind: "move", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => Math.max(4, 16 - l),
    summary: (l) => `Double Jump (Glide): propel horizontally through the air.` },
  { id: "3000001", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 20, mp: () => 0,
    summary: (l) => `Critical Shot: grants +${l * 2}% critical rate.` },
  { id: "3000002", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `Archery Mastery: increases arrow range by +${l * 15} and accuracy by +${l * 10}.` },
  { id: "3000006", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 5, mp: () => 0,
    summary: (l) => `Nature's Balance: enhances evasive agility and movement speed.` },

  // ---- Bowman 2nd Job (Hunter)
  { id: "3101005", kind: "ranged", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 16 + Math.floor(l / 2), dmg: (l) => 160 + l * 7, hits: 2, targets: 6, range: 440,
    summary: (l) => `Arrow Bomb: fires an explosive arrow stunning up to 6 enemies.` },
  { id: "3101008", kind: "ranged", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 15 + l, dmg: (l) => 170 + l * 7, hits: 2, targets: 4, range: 420,
    summary: (l) => `Covering Fire: leaps backward while unleashing a volley of arrows.` },
  { id: "3101004", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 14 + l, duration: (l) => 100 + l * 15, buff: { att: 3 },
    summary: (l) => `Soul Arrow: grants free arrows and +${l * 3} ATT for ${100 + l * 15} sec.` },
  { id: "3101009", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 15 + l, duration: (l) => 90 + l * 15,
    summary: (l) => `Quiver Cartridge: equips special magic, blood, and poison arrows.` },
  { id: "3100002", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 12 + l, duration: (l) => 100 + l * 15,
    summary: (l) => `Agile Bows: increases bow attack speed by 2 levels.` },
  { id: "3100000", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `Bow Mastery: bow mastery +${l * 5}%, accuracy +${l * 5}.` },
  { id: "3100001", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 20, mp: () => 0,
    summary: (l) => `Final Attack : Bow: 40% chance of delivering a secondary arrow of ${100 + l * 5}%.` },
  { id: "3100006", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 5, mp: () => 0,
    summary: (l) => `Physical Training: permanently boosts STR and DEX by +${l * 6}.` },

  // ---- Bowman 3rd Job (Ranger)
  { id: "3111013", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 22 + l, dmg: (l) => 190 + l * 8, hits: 3, targets: 6, range: 450,
    summary: (l) => `Arrow Blaster: fires an intense barrage of arrows at up to 6 enemies.` },
  { id: "3111003", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 20 + Math.floor(l / 2), dmg: (l) => 180 + l * 8, hits: 2, targets: 6, range: 420,
    summary: (l) => `Flame Surge: loose fiery arrows incinerating up to 6 targets.` },
  { id: "3111009", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 18 + l, dmg: (l) => 150 + l * 6, hits: 4, targets: 2, range: 440,
    summary: (l) => `Hurricane: unleashes a continuous hurricane of arrows at lightning speed.` },
  { id: "3111005", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 25 + l, duration: (l) => 100 + l * 20, buff: { att: 5 },
    summary: (l) => `Phoenix: summons a blazing phoenix that attacks nearby foes.` },
  { id: "3111010", kind: "move", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 12,
    summary: (l) => `Hookshot: fires a grappling hook pulling yourself toward enemies.` },
  { id: "3111011", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 20 + l, duration: (l) => 90 + l * 15, buff: { att: 6 },
    summary: (l) => `Reckless Hunt: Bow: reduces defense to gain massive Weapon ATT.` },
  { id: "3110001", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Mortal Blow: chance to land fatal critical blows on low-HP monsters.` },
  { id: "3110012", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Focused Fury: landing critical hits grants stacking attack bonuses.` },
  { id: "3110007", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Evasion Boost: permanently increases dodge and evasion rate.` },
  { id: "3110014", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Marksmanship: ignores ${l * 3}% of enemy defense and boosts damage.` },

  // ---- Thief 1st Job (Rogue)
  { id: "4001334", kind: "attack", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 10 + Math.floor(l / 2), dmg: (l) => 120 + l * 5, hits: 2, targets: 1, range: 150,
    summary: (l) => `Double Stab: rapidly stabs one enemy twice with deadly precision.` },
  { id: "4001344", kind: "ranged", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 12 + Math.floor(l / 2), dmg: (l) => 140 + l * 6, hits: 2, targets: 1, range: 400,
    summary: (l) => `Lucky Seven: throws two lucky throwing stars driven by LUK.` },
  { id: "4001005", kind: "buff", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => 12 + l, duration: (l) => 80 + l * 15, buff: { speed: 15 },
    summary: (l) => `Haste: increases movement speed and jump height for ${80 + l * 15} sec.` },
  { id: "4001003", kind: "buff", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => 10 + l, duration: (l) => 60 + l * 15,
    summary: (l) => `Dark Sight: hide in shadows, avoiding monster touch damage.` },
  { id: "4001014", kind: "move", tab: 1, reqLevel: 1, maxLevel: 5, mp: (l) => Math.max(4, 12 - l),
    summary: (l) => `Flash Jump: propel forward through the air with a second mid-air leap.` },
  { id: "4001011", kind: "move", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => Math.max(4, 14 - l),
    summary: (l) => `Flash Jump (Classic): blink forward instantly.` },
  { id: "4000000", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `Nimble Body: permanently increases accuracy and avoidability.` },
  { id: "4000010", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 5, mp: () => 0,
    summary: (l) => `Magic Theft: chance to steal positive effects from targets.` },
  { id: "4000012", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 5, mp: () => 0,
    summary: (l) => `Side Step: permanently increases dodge and evasion.` },
  { id: "4001013", kind: "attack", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => 10 + l, dmg: (l) => 130 + l * 6, hits: 1, targets: 4, range: 170,
    summary: (l) => `Bandit Slash: slashes up to 4 enemies in front of you.` },

  // ---- Thief 2nd Job (Assassin)
  { id: "4101008", kind: "ranged", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 16 + Math.floor(l / 2), dmg: (l) => 160 + l * 7, hits: 3, targets: 4, range: 400,
    summary: (l) => `Shuriken Burst: throws explosive shurikens detonating on up to 4 enemies.` },
  { id: "4101011", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `Assassin's Mark: marks targets with an assassin crest, firing homing stars.` },
  { id: "4101010", kind: "attack", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 15 + l, dmg: (l) => 150 + l * 7, hits: 2, targets: 6, range: 280,
    summary: (l) => `Gust Charm: summons paper talismans pushing back up to 6 enemies.` },
  { id: "4101003", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 14 + l, duration: (l) => 100 + l * 15,
    summary: (l) => `Claw Booster: increases claw throwing speed by 2 levels.` },
  { id: "4100000", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `Claw Mastery: claw mastery +${l * 5}%, maximum star capacity +${l * 100}.` },
  { id: "4100001", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `Critical Throw: grants +${l * 3}% critical rate with claw weapons.` },
  { id: "4100007", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 5, mp: () => 0,
    summary: (l) => `Physical Training: permanently increases LUK and DEX by +${l * 6}.` },

  // ---- Thief 3rd Job (Hermit)
  { id: "4111010", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 22 + l, dmg: (l) => 190 + l * 8, hits: 3, targets: 1, range: 420,
    summary: (l) => `Triple Throw: hurls 3 lethal stars simultaneously at one enemy.` },
  { id: "4111015", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 24 + l, dmg: (l) => 180 + l * 8, hits: 3, targets: 6, range: 400,
    summary: (l) => `Shade Splitter: shadow clones barrage up to 6 targets with stars.` },
  { id: "4111007", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 22 + l, duration: (l) => 90 + l * 20, buff: { def: 6 },
    summary: (l) => `Dark Flare: summons a giant cursed shuriken reflecting damage to monsters.` },
  { id: "4111003", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 20 + Math.floor(l / 2), dmg: (l) => 170 + l * 8, hits: 2, targets: 4, range: 380,
    summary: (l) => `Shadow Web: binds up to 4 enemies in a sticky spiderweb.` },
  { id: "4111002", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 25 + l, duration: (l) => 100 + l * 20, buff: { att: 5 },
    summary: (l) => `Shadow Partner: summons a shadow clone that mimics all attacks.` },
  { id: "4111009", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 22 + l, duration: (l) => 100 + l * 20,
    summary: (l) => `Shadow Stars: allows throwing stars without consuming your rechargeable count.` },
  { id: "4110008", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Enveloping Darkness: increases Max HP +${l * 3}% and status resistance.` },
  { id: "4110011", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Venom: coats throwing stars with deadly poison dealing damage over time.` },
  { id: "4110012", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Expert Throwing Star Handling: boosts damage and recharge capacity.` },
  { id: "4110014", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Alchemic Adrenaline: boosts potion recovery efficacy by +${l * 10}%.` },

  // ---- Pirate 1st Job (Pirate)
  { id: "5001002", kind: "attack", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 10 + Math.floor(l / 2), dmg: (l) => 140 + l * 6, hits: 1, targets: 6, range: 190,
    summary: (l) => `Somersault Kick: executes a backflip kick striking up to 6 enemies.` },
  { id: "5001003", kind: "ranged", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 10 + Math.floor(l / 2), dmg: (l) => 120 + l * 5, hits: 2, targets: 1, range: 400,
    summary: (l) => `Double Shot: fires two rapid pistol bullets at one enemy.` },
  { id: "5001010", kind: "move", tab: 1, reqLevel: 1, maxLevel: 5, mp: (l) => Math.max(4, 12 - l),
    summary: (l) => `Octopush: leap in mid-air to jump a second or third time.` },
  { id: "5001005", kind: "move", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => Math.max(3, 10 - l), buff: { speed: 20 },
    summary: (l) => `Dash: grants a burst of high-speed running across platforms.` },
  { id: "5000007", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `Shadow Heart: grants +${l * 2}% critical rate and minimum critical damage.` },
  { id: "5000000", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `Bullet Time: permanently increases accuracy, avoidability, and speed.` },
  { id: "5000006", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `Fortune's Favor: permanently increases Max HP and defensive fortitude.` },

  // ---- Pirate 2nd Job (Brawler)
  { id: "5101012", kind: "attack", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 15 + Math.floor(l / 2), dmg: (l) => 160 + l * 7, hits: 3, targets: 6, range: 220,
    summary: (l) => `Tornado Uppercut: leaps upward with a spiraling punch hitting up to 6 foes.` },
  { id: "5101004", kind: "attack", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 14 + Math.floor(l / 2), dmg: (l) => 150 + l * 6, hits: 1, targets: 8, range: 260,
    summary: (l) => `Corkscrew Blow: charges forward with a spinning punch pushing all mobs.` },
  { id: "5101006", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 14 + l, duration: (l) => 100 + l * 15,
    summary: (l) => `Knuckle Booster: increases knuckle attack speed by 2 levels.` },
  { id: "5101014", kind: "attack", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 16 + l, dmg: (l) => 170 + l * 7, hits: 2, targets: 6, range: 280,
    summary: (l) => `Energy Vortex: generates an energy sphere dragging enemies in.` },
  { id: "5100015", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 20, mp: () => 0, duration: (l) => 80 + l * 5, buff: { att: 4 },
    summary: (l) => `Energy Charge: builds energy on attacks to enter a supercharged state.` },
  { id: "5100016", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 5, mp: () => 0,
    summary: (l) => `Advanced Dash: permanently increases movement speed and dash distance.` },
  { id: "5100001", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `Knuckle Mastery: knuckle mastery +${l * 5}%, accuracy +${l * 5}.` },
  { id: "5100009", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `HP Boost: permanently increases maximum HP by +${l * 3}%.` },
  { id: "5100010", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 5, mp: () => 0,
    summary: (l) => `Physical Training: permanently increases STR and DEX by +${l * 6}.` },
  { id: "5100013", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `Perseverance: constantly regenerates HP over time.` },
  { id: "5100011", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `Dark Clarity: permanently increases Weapon ATT +${l * 2} and accuracy.` },

  // ---- Pirate 3rd Job (Marauder)
  { id: "5111009", kind: "attack", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 22 + l, dmg: (l) => 200 + l * 8, hits: 3, targets: 6, range: 260,
    summary: (l) => `Spiral Assault: dives forward in a spiraling drill tearing through monsters.` },
  { id: "5111002", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 24 + l, dmg: (l) => 220 + l * 9, hits: 2, targets: 6, range: 380,
    summary: (l) => `Energy Burst: expels stored energy in a massive concussive explosion.` },
  { id: "5111012", kind: "attack", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 20 + l, dmg: (l) => 180 + l * 8, hits: 2, targets: 8, range: 300,
    summary: (l) => `Static Thumper: pounds the earth sending shockwaves through up to 8 foes.` },
  { id: "5111007", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 25 + l, duration: (l) => 100 + l * 20, buff: { att: 6 },
    summary: (l) => `Roll of the Dice: rolls a die granting random blessings of power.` },
  { id: "5111013", kind: "attack", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 22 + l, dmg: (l) => 190 + l * 8, hits: 4, targets: 4, range: 240,
    summary: (l) => `Hedgehog Buster: unleashes a relentless flurry of devastating strikes.` },
  { id: "5110014", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Supercharge: doubles energy capacity and grants massive damage in supercharge.` },
  { id: "5110010", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Admiral's Wings: reduces all incoming damage by ${l * 3}%.` },
  { id: "5110011", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Precision Strikes: increases critical rate +${l * 3}% and critical damage.` },
  { id: "5110000", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Stun Mastery: delivers +${l * 4}% bonus damage against stunned targets.` },

  // ---- Warrior 4th Job (Hero)
  { id: "1121008", kind: "attack", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 25 + l, dmg: (l) => 240 + l * 8, hits: 4, targets: 8, range: 280,
    summary: (l) => `Raging Blow: deal consecutive blows to multiple enemies in front of you. Damage ${240 + l * 8}% x 4.` },
  { id: "1121010", kind: "buff", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 30 + l, duration: (l) => 120 + l * 10, buff: { att: 10 },
    summary: (l) => `Enrage: focus power to boost Weapon ATT +${l * 10} for ${120 + l * 10} sec.` },
  { id: "1121000", kind: "buff", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 40 + l, duration: (l) => 180 + l * 10, buff: { str: 4, dex: 4, int: 4, luk: 4 },
    summary: (l) => `Maple Warrior: temporarily increases all base stats by +${l * 4} for ${180 + l * 10} sec.` },
  { id: "1121011", kind: "buff", tab: 4, reqLevel: 60, maxLevel: 5, mp: () => 30, duration: () => 30,
    summary: (l) => `Hero's Will: hones your resolve to ignore abnormal status effects.` },

  // ---- Magician 4th Job (Arch Mage F/P)
  { id: "2121006", kind: "ranged", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 30 + l, dmg: (l) => 260 + l * 9, hits: 4, targets: 8, range: 360,
    summary: (l) => `Paralyze: surrounds multiple enemies with fire/paralysis inflicting heavy damage ${260 + l * 9}% x 4.` },
  { id: "2121007", kind: "attack", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 50 + l * 2, dmg: (l) => 450 + l * 15, hits: 6, targets: 15, range: 500,
    summary: (l) => `Meteor Shower: summons devastating meteorites to annihilate up to 15 enemies. Damage ${450 + l * 15}% x 6.` },
  { id: "2121003", kind: "attack", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 35 + l, dmg: (l) => 350 + l * 12, hits: 5, targets: 8, range: 320,
    summary: (l) => `Mist Eruption: explodes poison clouds dealing fatal damage. Damage ${350 + l * 12}% x 5.` },
  { id: "2121000", kind: "buff", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 40 + l, duration: (l) => 180 + l * 10, buff: { str: 4, dex: 4, int: 4, luk: 4 },
    summary: (l) => `Maple Warrior: temporarily increases all base stats by +${l * 4} for ${180 + l * 10} sec.` },

  // ---- Bowman 4th Job (Bowmaster)
  { id: "3121015", kind: "ranged", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 28 + l, dmg: (l) => 220 + l * 7, hits: 5, targets: 8, range: 480,
    summary: (l) => `Arrow Stream: shoots a wild flurry of arrows straight ahead. Damage ${220 + l * 7}% x 5.` },
  { id: "3121002", kind: "buff", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 35 + l, duration: (l) => 180 + l * 10, buff: { att: 8 },
    summary: (l) => `Sharp Eyes: grants party members keen insight into enemy weak spots. Critical ATT +${l * 8}.` },
  { id: "3121000", kind: "buff", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 40 + l, duration: (l) => 180 + l * 10, buff: { str: 4, dex: 4, int: 4, luk: 4 },
    summary: (l) => `Maple Warrior: temporarily increases all base stats by +${l * 4} for ${180 + l * 10} sec.` },
  { id: "3121009", kind: "buff", tab: 4, reqLevel: 60, maxLevel: 5, mp: () => 30, duration: () => 30,
    summary: (l) => `Hero's Will: hones your resolve to ignore abnormal status effects.` },

  // ---- Thief 4th Job (Night Lord)
  { id: "4121013", kind: "ranged", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 26 + l, dmg: (l) => 210 + l * 8, hits: 4, targets: 1, range: 420,
    summary: (l) => `Quad Star: masterfully unleash four throwing stars in rapid succession. Damage ${210 + l * 8}% x 4.` },
  { id: "4121015", kind: "buff", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 35 + l, duration: (l) => 60 + l * 5, buff: { att: 6 },
    summary: (l) => `Frailty Curse: summons an barrier decreasing monster defenses and increasing boss damage +${l * 6}.` },
  { id: "4121000", kind: "buff", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 40 + l, duration: (l) => 180 + l * 10, buff: { str: 4, dex: 4, int: 4, luk: 4 },
    summary: (l) => `Maple Warrior: temporarily increases all base stats by +${l * 4} for ${180 + l * 10} sec.` },
  { id: "4121009", kind: "buff", tab: 4, reqLevel: 60, maxLevel: 5, mp: () => 30, duration: () => 30,
    summary: (l) => `Hero's Will: hones your resolve to ignore abnormal status effects.` },

  // ---- Pirate 4th Job (Buccaneer)
  { id: "5121007", kind: "attack", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 30 + l, dmg: (l) => 220 + l * 8, hits: 8, targets: 1, range: 200,
    summary: (l) => `Octopunch: pummels enemies with eight supernatural punches. Damage ${220 + l * 8}% x 8.` },
  { id: "5121001", kind: "attack", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 40 + l * 2, dmg: (l) => 380 + l * 12, hits: 4, targets: 10, range: 400,
    summary: (l) => `Dragon Strike: awakens an ancient dragon from beneath to obliterate enemies. Damage ${380 + l * 12}% x 4.` },
  { id: "5121009", kind: "buff", tab: 4, reqLevel: 60, maxLevel: 20, mp: (l) => 40 + l, duration: (l) => 120 + l * 10, buff: { speed: 15, att: 5 },
    summary: (l) => `Speed Infusion: doubles weapon attack speed and grants +${l * 5} ATT for ${120 + l * 10} sec.` },
  { id: "5121000", kind: "buff", tab: 4, reqLevel: 60, maxLevel: 30, mp: (l) => 40 + l, duration: (l) => 180 + l * 10, buff: { str: 4, dex: 4, int: 4, luk: 4 },
    summary: (l) => `Maple Warrior: temporarily increases all base stats by +${l * 4} for ${180 + l * 10} sec.` },
];

export const SKILL = Object.fromEntries(SKILL_DEFS.map((s) => [s.id, s])) as Record<string, SkillDef>;

export interface ItemDef {
  id: number;
  name: string;
  hp?: number;
  mp?: number;
  hpPct?: number;
  mpPct?: number;
  att?: number;
  type?: "potion" | "star" | "arrow" | "bullet";
}
export const ITEMS: Record<number, ItemDef> = {
  // Potions & Consumables
  2000000: { id: 2000000, name: "Red Potion", hp: 50, type: "potion" },
  2000001: { id: 2000001, name: "Orange Potion", hp: 150, type: "potion" },
  2000002: { id: 2000002, name: "White Potion", hp: 300, type: "potion" },
  2000003: { id: 2000003, name: "Blue Potion", mp: 100, type: "potion" },
  2000004: { id: 2000004, name: "Elixir", hpPct: 50, mpPct: 50, type: "potion" },
  2000005: { id: 2000005, name: "Power Elixir", hpPct: 100, mpPct: 100, type: "potion" },
  2000006: { id: 2000006, name: "Mana Elixir", mp: 300, type: "potion" },
  2001000: { id: 2001000, name: "Hamburger", hp: 400, type: "potion" },
  2001001: { id: 2001001, name: "Hot Dog", hp: 500, type: "potion" },
  2001002: { id: 2001002, name: "Pizza", hp: 400, mp: 400, type: "potion" },
  2020000: { id: 2020000, name: "Salad", mp: 200, type: "potion" },
  2020001: { id: 2020001, name: "Fried Chicken", hp: 800, type: "potion" },
  2020012: { id: 2020012, name: "Ginger Ale", hpPct: 75, mpPct: 75, type: "potion" },
  2022000: { id: 2022000, name: "Reindeer Milk", hp: 5000, type: "potion" },
  2022001: { id: 2022001, name: "Sunset Dew", mp: 5000, type: "potion" },
  2022003: { id: 2022003, name: "Sunrise Dew", mp: 4000, type: "potion" },
  2050004: { id: 2050004, name: "All Cure Potion", hp: 0, type: "potion" },

  // Arrows
  2060000: { id: 2060000, name: "Arrow for Bow", att: 1, type: "arrow" },
  2060001: { id: 2060001, name: "Bronze Arrow for Bow", att: 2, type: "arrow" },
  2060002: { id: 2060002, name: "Steel Arrow for Bow", att: 4, type: "arrow" },
  2061000: { id: 2061000, name: "Arrow for Crossbow", att: 1, type: "arrow" },
  2061001: { id: 2061001, name: "Bronze Arrow for Crossbow", att: 2, type: "arrow" },
  2061002: { id: 2061002, name: "Steel Arrow for Crossbow", att: 4, type: "arrow" },

  // Throwing Stars
  2070000: { id: 2070000, name: "Subi Throwing-Stars", att: 15, type: "star" },
  2070001: { id: 2070001, name: "Wolbi Throwing-Stars", att: 17, type: "star" },
  2070002: { id: 2070002, name: "Mokbi Throwing-Stars", att: 19, type: "star" },
  2070003: { id: 2070003, name: "Kumbi Throwing-Stars", att: 21, type: "star" },
  2070004: { id: 2070004, name: "Tobi Throwing-Stars", att: 23, type: "star" },
  2070005: { id: 2070005, name: "Steely Throwing-Knives", att: 25, type: "star" },
  2070006: { id: 2070006, name: "Ilbi Throwing-Stars", att: 27, type: "star" },
  2070007: { id: 2070007, name: "Hwabi Throwing-Stars", att: 27, type: "star" },
  2070016: { id: 2070016, name: "Crystal Ilbi", att: 29, type: "star" },

  // Bullets
  2330000: { id: 2330000, name: "Bullet", att: 10, type: "bullet" },
  2330001: { id: 2330001, name: "Split Bullet", att: 12, type: "bullet" },
  2330002: { id: 2330002, name: "Mighty Bullet", att: 14, type: "bullet" },
  2330003: { id: 2330003, name: "Vital Bullet", att: 16, type: "bullet" },
  2330004: { id: 2330004, name: "Shiny Bullet", att: 18, type: "bullet" },
  2330005: { id: 2330005, name: "Eternal Bullet", att: 20, type: "bullet" },
};
export const itemIcon = (id: number) => `/wz/item/${id}/icon`;
export const itemIconRaw = (id: number) => `/wz/item/${id}/iconRaw`;
export const WEAPON_ICON = "/wz/item/1302000/icon";

export type Action = { t: "skill"; id: string } | { t: "item"; id: number } | { t: "attack" };

/** Quick-slot keys (KeyboardEvent-normalised names) in on-screen order, two rows of 16. */
export const QUICK_KEYS = [
  "Shift", "Insert", "Home", "PageUp", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=",
  "Control", "Delete", "End", "PageDown", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
];
export const KEY_LABEL: Record<string, string> = {
  Shift: "Shift", Insert: "Ins", Home: "Hm", PageUp: "Pup",
  Control: "Ctrl", Delete: "Del", End: "End", PageDown: "Pdn",
  "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9", "0": "0", "-": "-", "=": "=",
  F1: "Q", F2: "W", F3: "E", F4: "R", F5: "T", F6: "Y", F7: "U", F8: "I", F9: "O", F10: "P", F11: "[", F12: "]",
};

export const KEY_BADGES: Record<string, { text: string; color: "green" | "blue" | "orange" | "yellow" }> = {
  Shift: { text: "ATTACK", color: "green" },
  Insert: { text: "TO ALL", color: "green" },
  Home: { text: "TO PARTY", color: "green" },
  PageUp: { text: "TO BUDDY", color: "green" },
  Control: { text: "ATTACK", color: "green" },
  Delete: { text: "TO GUILD", color: "green" },
  End: { text: "TO ALLIANCE", color: "green" },
  PageDown: { text: "TO ALL", color: "green" },
  "-": { text: "SKILL", color: "blue" },
  "=": { text: "QUEST", color: "orange" },
  F10: { text: "GUILD", color: "green" },
  F11: { text: "WORLD MAP", color: "yellow" },
  F12: { text: "MINI MAP", color: "orange" },
};

export const DEFAULT_QUICK: Record<string, Action> = {
  Shift: { t: "skill", id: "1001005" },
  Insert: { t: "skill", id: "1101011" },
  Home: { t: "skill", id: "1111010" },
  PageUp: { t: "skill", id: "0001000" },
  Control: { t: "attack" },
  Delete: { t: "item", id: 2000000 },
  End: { t: "item", id: 2000003 },
  PageDown: { t: "item", id: 2000001 },
  "1": { t: "skill", id: "0001001" },
  "2": { t: "skill", id: "0001002" },
  "3": { t: "skill", id: "1101006" },
};

/** Strip MapleStory string markup (#c...#, \n, #mpCon etc.). */
export function cleanDesc(s: string) {
  return s.replace(/\\n|\\r/g, " ").replace(/#[a-zA-Z]+/g, "").replace(/#/g, "").replace(/\s+/g, " ").trim();
}
