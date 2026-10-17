// MapleStory Guild System — Authentic Guild Data, Emblems, and Management
// Models: Master, Jr.Master, Members (Ranks 1-5), GP Contribution, Capacity, Emblems & Notices

export interface GuildEmblem {
  bgShape: number; // 0-30 background pattern/shield from UI.wz/GuildMark.img/BackGround (00001000..00001030)
  bgColor: number; // 0-15 background color (1..16 in WZ)
  symbolShape: number; // 0-112 foreground icon from UI.wz/GuildMark.img/Mark (Animal, Plant, Pattern, Letter, Etc)
  symbolColor: number; // 0-15 symbol color (1..16 in WZ)
  beamEffect?: string; // Border beam palette: "gold" | "ocean" | "colorful" | "sunset" | "forest" | "candy" | "ice" | "purple" | "none"
  beamMotion?: string; // Border beam motion: "rotate" | "pulse" | "line"
}

export interface GuildMember {
  name: string;
  level: number;
  job: string;
  rank: 1 | 2 | 3 | 4 | 5; // 1: Master, 2: Jr.Master, 3: Veteran, 4: Member, 5: Recruit
  contribution: number;
  online: boolean;
  mapId?: number;
  look?: number[];
}

export interface Guild {
  id: string;
  name: string;
  master: string;
  notice: string;
  level: number;
  gp: number;
  capacity: number;
  emblem: GuildEmblem;
  ranks: [string, string, string, string, string];
  members: GuildMember[];
  createdAt: number;
}

/** Authentic 16 color palette from UI.wz/GuildMark.img (1..16) */
export const EMBLEM_COLORS = [
  { name: "Crimson Red", hex: "#ee1111" },
  { name: "Amber Orange", hex: "#dd8833" },
  { name: "Golden Yellow", hex: "#eecc11" },
  { name: "Sand Beige", hex: "#eeddbb" },
  { name: "Chestnut Brown", hex: "#995544" },
  { name: "Forest Moss", hex: "#446644" },
  { name: "Emerald Green", hex: "#118855" },
  { name: "Spring Olive", hex: "#77aa66" },
  { name: "Ocean Teal", hex: "#55aa99" },
  { name: "Sky Azure", hex: "#33aadd" },
  { name: "Cobalt Blue", hex: "#1133ee" },
  { name: "Steel Blue", hex: "#6688bb" },
  { name: "Royal Indigo", hex: "#664499" },
  { name: "Orchid Violet", hex: "#994499" },
  { name: "Pure White", hex: "#eeeeee" },
  { name: "Obsidian Black", hex: "#111111" },
];

/** All 31 background styles from UI.wz/GuildMark.img/BackGround (00001000..00001030) */
export const WZ_EMBLEM_BGS: { id: string; name: string }[] = [
  { id: "00001000", name: "Square" },
  { id: "00001001", name: "Two-line Square" },
  { id: "00001002", name: "Outlined Square" },
  { id: "00001003", name: "X Square" },
  { id: "00001004", name: "Quatrefoil" },
  { id: "00001005", name: "Vertical Stripes" },
  { id: "00001006", name: "Horizontal Stripes" },
  { id: "00001007", name: "Checkerboard" },
  { id: "00001008", name: "Biscuit Crest" },
  { id: "00001009", name: "Maze Square" },
  { id: "00001010", name: "Beveled Frame" },
  { id: "00001011", name: "Dotted Square" },
  { id: "00001012", name: "Vertical 2-line Square" },
  { id: "00001013", name: "Polka Dot Square" },
  { id: "00001014", name: "Diagonal Stripes" },
  { id: "00001015", name: "Corner Dot Square" },
  { id: "00001016", name: "Thick Outlined Square" },
  { id: "00001017", name: "Rounded Shield" },
  { id: "00001018", name: "Horizontal 2-line Square" },
  { id: "00001019", name: "Cushion Crest" },
  { id: "00001020", name: "Cross Pattern Square" },
  { id: "00001021", name: "Clover Pattern" },
  { id: "00001022", name: "Window Crest" },
  { id: "00001023", name: "Octagon Shield" },
  { id: "00001024", name: "Circle Shield" },
  { id: "00001025", name: "Bow-tie Crest" },
  { id: "00001026", name: "Tulip Crest" },
  { id: "00001027", name: "Dotted Frame" },
  { id: "00001028", name: "Diamond Shield" },
  { id: "00001029", name: "Oval Medallion" },
  { id: "00001030", name: "No Background" },
];

export const EMBLEM_BG_SHAPES: string[] = WZ_EMBLEM_BGS.map((b) => b.name);

/** All 113 foreground symbols from UI.wz/GuildMark.img/Mark across Animal, Plant, Pattern, Letter, Etc */
export const WZ_EMBLEM_MARKS: { cat: string; id: string; name: string }[] = [
  // Animal (00002000..00002020)
  { cat: "Animal", id: "00002000", name: "Eagle" },
  { cat: "Animal", id: "00002001", name: "Pigeon" },
  { cat: "Animal", id: "00002002", name: "Duck" },
  { cat: "Animal", id: "00002003", name: "Dragon Face" },
  { cat: "Animal", id: "00002004", name: "Dragon Profile" },
  { cat: "Animal", id: "00002005", name: "Dragon Crest" },
  { cat: "Animal", id: "00002006", name: "Horned Dragon" },
  { cat: "Animal", id: "00002007", name: "Dinosaur" },
  { cat: "Animal", id: "00002008", name: "Crab" },
  { cat: "Animal", id: "00002009", name: "Cat" },
  { cat: "Animal", id: "00002010", name: "Yawning Pig" },
  { cat: "Animal", id: "00002011", name: "Ribbon Pig" },
  { cat: "Animal", id: "00002012", name: "Scorpion" },
  { cat: "Animal", id: "00002013", name: "Angry Cat" },
  { cat: "Animal", id: "00002014", name: "Curious Cat" },
  { cat: "Animal", id: "00002015", name: "Cute Cat" },
  { cat: "Animal", id: "00002016", name: "Rabbit" },
  { cat: "Animal", id: "00002017", name: "Octopus" },
  { cat: "Animal", id: "00002018", name: "Bunny" },
  { cat: "Animal", id: "00002019", name: "Turtle" },
  { cat: "Animal", id: "00002020", name: "Butterfly" },
  // Plant (00003000..00003006)
  { cat: "Plant", id: "00003000", name: "Strawberry" },
  { cat: "Plant", id: "00003001", name: "Maple Leaf" },
  { cat: "Plant", id: "00003002", name: "Clover" },
  { cat: "Plant", id: "00003003", name: "Tree" },
  { cat: "Plant", id: "00003004", name: "Rose" },
  { cat: "Plant", id: "00003005", name: "Apple" },
  { cat: "Plant", id: "00003006", name: "Four-leaf Clover" },
  // Pattern (00004000..00004021)
  { cat: "Pattern", id: "00004000", name: "Skinny Cross" },
  { cat: "Pattern", id: "00004001", name: "Star" },
  { cat: "Pattern", id: "00004002", name: "Sacred Cross" },
  { cat: "Pattern", id: "00004003", name: "X Cross" },
  { cat: "Pattern", id: "00004004", name: "Prohibition Sign" },
  { cat: "Pattern", id: "00004005", name: "Key Square" },
  { cat: "Pattern", id: "00004006", name: "Inverted Omega" },
  { cat: "Pattern", id: "00004007", name: "Omega" },
  { cat: "Pattern", id: "00004008", name: "Winged Circle" },
  { cat: "Pattern", id: "00004009", name: "Scroll Frame" },
  { cat: "Pattern", id: "00004010", name: "Warning Sign" },
  { cat: "Pattern", id: "00004011", name: "X Mark" },
  { cat: "Pattern", id: "00004012", name: "Pirate Emblem" },
  { cat: "Pattern", id: "00004013", name: "Little Cross" },
  { cat: "Pattern", id: "00004014", name: "Four-point Star" },
  { cat: "Pattern", id: "00004015", name: "Clover Crest" },
  { cat: "Pattern", id: "00004016", name: "X-shaped Leaf" },
  { cat: "Pattern", id: "00004017", name: "T-shaped Cross" },
  { cat: "Pattern", id: "00004018", name: "Spade" },
  { cat: "Pattern", id: "00004019", name: "Three-leaf Emblem" },
  { cat: "Pattern", id: "00004020", name: "Angel Wings" },
  { cat: "Pattern", id: "00004021", name: "Horseshoe" },
  // Etc (00009000..00009026)
  { cat: "Etc", id: "00009000", name: "Skull" },
  { cat: "Etc", id: "00009001", name: "Heart" },
  { cat: "Etc", id: "00009002", name: "Smile" },
  { cat: "Etc", id: "00009003", name: "Sword" },
  { cat: "Etc", id: "00009004", name: "Royal Crown" },
  { cat: "Etc", id: "00009005", name: "Knight Shield" },
  { cat: "Etc", id: "00009006", name: "Flag" },
  { cat: "Etc", id: "00009007", name: "Evil Smile" },
  { cat: "Etc", id: "00009008", name: "Musical Note" },
  { cat: "Etc", id: "00009009", name: "Lightning Bolt" },
  { cat: "Etc", id: "00009010", name: "Dice" },
  { cat: "Etc", id: "00009011", name: "Alien" },
  { cat: "Etc", id: "00009012", name: "Anchor" },
  { cat: "Etc", id: "00009013", name: "Bomb" },
  { cat: "Etc", id: "00009014", name: "Spaceship" },
  { cat: "Etc", id: "00009015", name: "Worker" },
  { cat: "Etc", id: "00009016", name: "Pawprints" },
  { cat: "Etc", id: "00009017", name: "Medal" },
  { cat: "Etc", id: "00009018", name: "Blazing Fire" },
  { cat: "Etc", id: "00009019", name: "Fish Bone" },
  { cat: "Etc", id: "00009020", name: "Lightbulb" },
  { cat: "Etc", id: "00009021", name: "Diagonal Fish Bone" },
  { cat: "Etc", id: "00009022", name: "Rocket" },
  { cat: "Etc", id: "00009023", name: "Imperial Crown" },
  { cat: "Etc", id: "00009024", name: "Footprint" },
  { cat: "Etc", id: "00009025", name: "Face" },
  { cat: "Etc", id: "00009026", name: "No Mark" },
  // Letter (00005000..00005035: A-Z, 0-9)
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("").map((ch, idx) => ({
    cat: "Letter",
    id: String(5000 + idx).padStart(8, "0"),
    name: `Letter '${ch}'`,
  })),
];

export const EMBLEM_SYMBOLS: string[] = WZ_EMBLEM_MARKS.map((m) => `[${m.cat}] ${m.name}`);

/** Returns the server URL that renders the authentic 17x17 WZ GuildMark.img PNG */
export function guildEmblemUrl(emblem?: GuildEmblem): string {
  const bg = Math.max(0, Math.floor(emblem?.bgShape ?? 0)) % WZ_EMBLEM_BGS.length;
  const bgc = Math.max(0, Math.floor(emblem?.bgColor ?? 0)) % 16;
  const sym = Math.max(0, Math.floor(emblem?.symbolShape ?? 0)) % WZ_EMBLEM_MARKS.length;
  const symc = Math.max(0, Math.floor(emblem?.symbolColor ?? 0)) % 16;
  return `/wz/guild-emblem?bg=${bg}&bgc=${bgc}&sym=${sym}&symc=${symc}`;
}

/** Generates crisp pixelated WZ GuildMark image markup for a guild emblem */
export function renderEmblemSvg(emblem?: GuildEmblem, size = 18): string {
  if (!emblem) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" class="guild-emblem"><rect width="24" height="24" rx="4" fill="#334155"/><text x="12" y="16" font-size="12" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#94a3b8">G</text></svg>`;
  }
  const url = guildEmblemUrl(emblem);
  return `<img src="${url}" width="${size}" height="${size}" alt="Guild Emblem" class="guild-emblem select-none inline-block" style="width:${size}px;height:${size}px;image-rendering:pixelated;object-fit:contain;vertical-align:middle;" />`;
}

/** Client Guild API helper */
export class GuildClient {
  static async getGuildList(): Promise<Guild[]> {
    try {
      const res = await fetch("/api/guild/list");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.guilds) ? data.guilds : [];
    } catch {
      return [];
    }
  }

  static async getGuild(id: string): Promise<Guild | null> {
    try {
      const res = await fetch(`/api/guild/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.guild || null;
    } catch {
      return null;
    }
  }

  static async createGuild(masterName: string, guildName: string, emblem: GuildEmblem): Promise<{ ok: boolean; error?: string; guild?: Guild }> {
    try {
      const res = await fetch("/api/guild/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterName, guildName, emblem }),
      });
      const data = await res.json();
      return data;
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to create guild" };
    }
  }

  static async joinGuild(characterName: string, guildId: string, level = 1, job = "Beginner"): Promise<{ ok: boolean; error?: string; guild?: Guild }> {
    try {
      const res = await fetch("/api/guild/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterName, guildId, level, job }),
      });
      const data = await res.json();
      return data;
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to join guild" };
    }
  }

  static async leaveGuild(characterName: string, guildId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/guild/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterName, guildId }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to leave guild" };
    }
  }

  static async disbandGuild(masterName: string, guildId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/guild/disband", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterName, guildId }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to disband guild" };
    }
  }

  static async expelMember(actorName: string, targetName: string, guildId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/guild/expel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorName, targetName, guildId }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to expel member" };
    }
  }

  static async setRank(actorName: string, targetName: string, guildId: string, rank: 1 | 2 | 3 | 4 | 5): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/guild/rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorName, targetName, guildId, rank }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to set member rank" };
    }
  }

  static async updateNotice(actorName: string, guildId: string, notice: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/guild/notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorName, guildId, notice }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to update notice" };
    }
  }

  static async updateEmblem(actorName: string, guildId: string, emblem: GuildEmblem): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/guild/emblem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorName, guildId, emblem }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to update emblem" };
    }
  }

  static async expandCapacity(actorName: string, guildId: string): Promise<{ ok: boolean; error?: string; newCapacity?: number }> {
    try {
      const res = await fetch("/api/guild/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorName, guildId }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to expand capacity" };
    }
  }

  static async renameRanks(actorName: string, guildId: string, ranks: [string, string, string, string, string]): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/guild/ranks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorName, guildId, ranks }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to rename ranks" };
    }
  }
}
