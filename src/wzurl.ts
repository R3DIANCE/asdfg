// Client-side URL builders for locally-streamed WZ sprites.
//
// Every asset the game draws now comes from the Bun server reading the
// installed MapleStory client's .wz archives — no remote asset API.

/** Sprite stream base (same origin as the page). */
export const WZ = "/wz";

/** Category names as they appear in the client's Data tree. */
export type WzCategory = "Character" | "Item" | "Map" | "Mob" | "Npc" | "Skill" | "UI" | "Effect" | "Sound";

/**
 * A character look key: the ordered equip ids that make up the avatar.
 * Kept as a plain array now — the server resolves it against Character.wz.
 */
export type LookIds = number[];

/** Pad an equip id to the 8-digit image name used inside Character.wz. */
export const equipId = (id: number) => String(id).padStart(8, "0");

/** Character.wz subdirectory for an equip id (by id prefix). */
export function equipCategory(id: number): string {
  const p = Math.floor(id / 10000);
  if (p === 0) return "";
  if (p === 1 || p === 2 || p === 5) return "Face";
  if (p === 3 || p === 4 || p === 6) return "Hair";
  const map: Record<number, string> = {
    100: "Cap", 101: "Accessory", 102: "Accessory", 103: "Accessory",
    104: "Coat", 105: "Longcoat", 106: "Pants", 107: "Shoes", 108: "Glove",
    109: "Shield", 110: "Cape", 111: "Ring", 112: "Ring", 113: "Ring", 114: "Ring",
    115: "Android", 116: "Mechanic", 117: "Totem", 118: "Totem", 119: "Totem",
    120: "Totem", 121: "Weapon", 122: "Weapon", 123: "Weapon", 124: "Weapon",
    125: "Weapon", 126: "Weapon", 127: "Weapon", 128: "Weapon", 129: "Weapon",
    130: "Weapon", 131: "Weapon", 132: "Weapon", 133: "Weapon", 134: "Weapon",
    135: "Weapon", 136: "Weapon", 137: "Weapon", 138: "Weapon", 139: "Weapon",
    140: "Weapon", 141: "Weapon", 142: "Weapon", 143: "Weapon", 144: "Weapon",
    145: "Weapon", 146: "Weapon", 147: "Weapon", 148: "Weapon", 149: "Weapon",
    150: "Weapon", 151: "Weapon", 152: "Weapon", 153: "Weapon", 154: "Weapon",
    155: "Weapon", 156: "Weapon", 157: "Weapon", 158: "Weapon", 159: "Weapon",
    160: "Weapon", 170: "Weapon",
  };
  return map[p] ?? "";
}

/**
 * A character part URL: <category>/<id>/<action>/<frame>/<canvas>.
 * Body/Head live at the Character root; other equips nest under their dir.
 */
export function charPartUrl(id: number, action: string, frame: number, canvas = ""): string {
  const cat = equipCategory(id);
  const path = cat ? `${cat}/${equipId(id)}` : equipId(id);
  return `${WZ}/sprite/Character/${path}/${action}/${frame}${canvas ? "/" + canvas : ""}`;
}

/** Full character frame: composed server-side from a look + action + frame. */
export function charFrameUrl(ids: LookIds, action: string, frame: number): string {
  const eq = ids.join(",");
  return `${WZ}/char?eq=${eq}&action=${action}&frame=${frame}`;
}

/** Item icon (works for gear, use items, etc. — searched across Item.wz). */
export const itemIconUrl = (id: number) => `${WZ}/item/${id}/icon`;
export const itemIconRawUrl = (id: number) => `${WZ}/item/${id}/iconRaw`;
export const gearIconUrl = (id: number) => `${WZ}/item/${id}/icon`;

/** Mob frame. Mob ids are 7 digits inside Mob.wz. */
export const mobUrl = (id: number, action: string, frame: number) =>
  `${WZ}/sprite/Mob/${String(id).padStart(7, "0")}/${action}/${frame}`;

/** Mob animation manifest. */
export const mobAnimUrl = (id: number, action: string) =>
  `${WZ}/anim/Mob/${String(id).padStart(7, "0")}/${action}`;

/** Skill icon + effect frames (Skill.wz). */
export const skillIconUrl = (id: string) => `${WZ}/skill/${id}/icon`;
export const skillEffectUrl = (id: string, frame: number) => `${WZ}/skill/${id}/effect/${frame}`;

/** UI sprite: <image>/<slash path inside the .img>. */
export const uiUrl = (img: string, path: string) => `${WZ}/sprite/UI/${img}/${path}`;

/** Map preview render. */
export const mapRenderUrl = (id: number) => `${WZ}/map/${id}/render`;

/** Map data (footholds, spawns, portals, backs) as JSON. */
export const mapDataUrl = (id: number) => `${WZ}/map/${id}/data`;

/** Effect frame (Effect.wz). */
export const effectUrl = (img: string, path: string) => `${WZ}/sprite/Effect/${img}/${path}`;

/** Sound stream (Sound.wz) — mp3 passthrough. */
export const soundUrl = (img: string, path: string) => `${WZ}/sound/${img}/${path}`;
