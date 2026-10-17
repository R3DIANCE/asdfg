import type { Game } from "../game.ts";
import rawPresets from "./damage-skin-presets.json";

export interface DamageSkinDef {
  id: number | string;
  name: string;
  dmg: Record<string, string>;
  dmgFirst: Record<string, string>;
  cri: Record<string, string>;
  criFirst: Record<string, string>;
  criEffect?: string;
  miss?: string;
}

export const DAMAGE_SKIN_PRESETS: { id: number | string; name: string }[] = rawPresets as { id: number | string; name: string }[];

const skinCache = new Map<string, DamageSkinDef>();

export class DamageSkinSystem {
  static getSkin(skinId: number | string = 0): DamageSkinDef {
    const key = String(skinId);
    const existing = skinCache.get(key);
    if (existing) return existing;

    let def: DamageSkinDef;

    if (key === "0" || key === "classic") {
      def = {
        id: 0,
        name: "Classic Maple",
        dmg: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoRed1/${i}`])),
        dmgFirst: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoRed1/${i}`])),
        cri: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoCri1/${i}`])),
        criFirst: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoCri1/${i}`])),
        criEffect: `/wz/sprite/Effect/BasicEff/NoCri1/effect`,
        miss: `/wz/sprite/Effect/BasicEff/NoRed0/Miss`,
      };
    } else if (key === "blue") {
      def = {
        id: "blue",
        name: "Arcane Blue",
        dmg: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoBlue1/${i}`])),
        dmgFirst: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoBlue1/${i}`])),
        cri: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoCri1/${i}`])),
        criFirst: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoCri1/${i}`])),
        criEffect: `/wz/sprite/Effect/BasicEff/NoCri1/effect`,
        miss: `/wz/sprite/Effect/BasicEff/NoRed0/Miss`,
      };
    } else if (key === "violet") {
      def = {
        id: "violet",
        name: "Shadow Violet",
        dmg: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoViolet1/${i}`])),
        dmgFirst: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoViolet1/${i}`])),
        cri: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoCri1/${i}`])),
        criFirst: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoCri1/${i}`])),
        criEffect: `/wz/sprite/Effect/BasicEff/NoCri1/effect`,
        miss: `/wz/sprite/Effect/BasicEff/NoViolet0/Miss`,
      };
    } else if (key === "green") {
      def = {
        id: "green",
        name: "Verdant Green",
        dmg: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoGreen1/${i}`])),
        dmgFirst: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoGreen1/${i}`])),
        cri: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoCri1/${i}`])),
        criFirst: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoCri1/${i}`])),
        criEffect: `/wz/sprite/Effect/BasicEff/NoCri1/effect`,
        miss: `/wz/sprite/Effect/BasicEff/NoRed0/Miss`,
      };
    } else if (key === "kite") {
      def = {
        id: "kite",
        name: "Kite Festival",
        dmg: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoKite0/${i}`])),
        dmgFirst: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/BasicEff/NoKite0/${i}`])),
        cri: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/DamageSkin/41/NoCri1/${i}`])),
        criFirst: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/DamageSkin/41/NoCri0/${i}`])),
        criEffect: `/wz/sprite/Effect/BasicEff/NoKite0/effect`,
        miss: `/wz/sprite/Effect/BasicEff/NoRed0/Miss`,
      };
    } else {
      // Custom damage skin from Effect/DamageSkin.img
      const sid = key;
      const preset = DAMAGE_SKIN_PRESETS.find((p) => String(p.id) === sid);
      const name = preset ? preset.name : `Damage Skin #${sid}`;
      def = {
        id: isNaN(Number(sid)) ? sid : Number(sid),
        name,
        dmg: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/DamageSkin/${sid}/NoRed1/${i}`])),
        dmgFirst: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/DamageSkin/${sid}/NoRed0/${i}`])),
        cri: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/DamageSkin/${sid}/NoCri1/${i}`])),
        criFirst: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/Effect/DamageSkin/${sid}/NoCri0/${i}`])),
        criEffect: `/wz/sprite/Effect/DamageSkin/${sid}/NoCri1/effect3`,
        miss: `/wz/sprite/Effect/DamageSkin/${sid}/NoRed0/Miss`,
      };
    }

    skinCache.set(key, def);
    return def;
  }

  static preloadSkin(game: Game, skinId: number | string = 0) {
    const skin = this.getSkin(skinId);
    for (const url of Object.values(skin.dmg)) game.assets.load(url);
    for (const url of Object.values(skin.dmgFirst)) game.assets.load(url);
    for (const url of Object.values(skin.cri)) game.assets.load(url);
    for (const url of Object.values(skin.criFirst)) game.assets.load(url);
    if (skin.criEffect) game.assets.load(skin.criEffect);
    if (skin.miss) game.assets.load(skin.miss);
  }
}
