// MapleStory Guild System — Authentic Guild Data, Emblems, and Management
// Models: Master, Jr.Master, Members (Ranks 1-5), GP Contribution, Capacity, Emblems & Notices

export interface GuildEmblem {
  bgShape: number; // 0-15 background pattern/shield
  bgColor: number; // 0-15 background color
  symbolShape: number; // 0-15 foreground icon
  symbolColor: number; // 0-15 symbol color
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

export const EMBLEM_COLORS = [
  { name: "Crimson Red", hex: "#dc2626" },
  { name: "Flame Orange", hex: "#ea580c" },
  { name: "Golden Amber", hex: "#d97706" },
  { name: "Yellow Gold", hex: "#eab308" },
  { name: "Emerald Green", hex: "#16a34a" },
  { name: "Forest Pine", hex: "#15803d" },
  { name: "Turquoise Cyan", hex: "#06b6d4" },
  { name: "Sky Blue", hex: "#0284c7" },
  { name: "Royal Sapphire", hex: "#2563eb" },
  { name: "Violet Purple", hex: "#7c3aed" },
  { name: "Orchid Magenta", hex: "#c026d3" },
  { name: "Rose Pink", hex: "#e11d48" },
  { name: "Snow White", hex: "#f8fafc" },
  { name: "Silver Platinum", hex: "#94a3b8" },
  { name: "Charcoal Slate", hex: "#334155" },
  { name: "Obsidian Black", hex: "#0f172a" },
];

export const EMBLEM_BG_SHAPES = [
  "Crest Shield", "Round Shield", "Diamond", "Hexagon",
  "Circle", "Square", "Rounded Star", "Banner",
  "Winged Crest", "Crown Crest", "Heart Shield", "Floral Shield",
  "Cross Crest", "Octagon", "Kite Shield", "Spiked Crest"
];

export const EMBLEM_SYMBOLS = [
  "Maple Leaf", "Crossed Swords", "Royal Crown", "Dragon Crest",
  "Phoenix Wings", "Blazing Flame", "Radiant Star", "Pirate Skull",
  "Valentine Heart", "Sacred Cross", "Diamond", "Magic Potion",
  "Gold Coin", "Orange Mushroom", "Bouncy Slime", "Knight Shield"
];

/** Renders an SVG path string for a background shield/shape in a 24x24 viewBox */
export function getBgShapeSvgPath(shapeIndex: number): string {
  switch (shapeIndex % 16) {
    case 0: // Crest Shield
      return "M 12 1 L 21 4 L 20 15 Q 12 23 12 23 Q 12 23 4 15 L 3 4 Z";
    case 1: // Round Shield
      return "M 12 2 Q 22 2 22 12 Q 22 22 12 22 Q 2 22 2 12 Q 2 2 12 2 Z";
    case 2: // Diamond
      return "M 12 1 L 23 12 L 12 23 L 1 12 Z";
    case 3: // Hexagon
      return "M 12 1 L 22 6 L 22 18 L 12 23 L 2 18 L 2 6 Z";
    case 4: // Circle
      return "M 12 2 A 10 10 0 1 0 12 22 A 10 10 0 1 0 12 2 Z";
    case 5: // Rounded Square
      return "M 5 2 L 19 2 Q 22 2 22 5 L 22 19 Q 22 22 19 22 L 5 22 Q 2 22 2 19 L 2 5 Q 2 2 5 2 Z";
    case 6: // Rounded Star
      return "M 12 1 L 15 8 L 22 9 L 17 15 L 19 22 L 12 18 L 5 22 L 7 15 L 2 9 L 9 8 Z";
    case 7: // Banner / Pennant
      return "M 3 2 L 21 2 L 21 18 L 12 23 L 3 18 Z";
    case 8: // Winged Crest
      return "M 12 2 Q 18 1 23 6 L 20 16 L 12 23 L 4 16 L 1 6 Q 6 1 12 2 Z";
    case 9: // Crown Crest
      return "M 2 7 L 7 3 L 12 8 L 17 3 L 22 7 L 19 20 L 5 20 Z";
    case 10: // Heart Shield
      return "M 12 21 C 2 14 1 7 7 3 C 10 1 12 4 12 4 C 12 4 14 1 17 3 C 23 7 22 14 12 21 Z";
    case 11: // Floral Shield
      return "M 12 2 Q 17 6 22 5 Q 20 13 21 18 Q 14 19 12 23 Q 10 19 3 18 Q 4 13 2 5 Q 7 6 12 2 Z";
    case 12: // Cross Crest
      return "M 8 2 L 16 2 L 16 8 L 22 8 L 22 16 L 16 16 L 16 22 L 8 22 L 8 16 L 2 16 L 2 8 L 8 8 Z";
    case 13: // Octagon
      return "M 7 2 L 17 2 L 22 7 L 22 17 L 17 22 L 7 22 L 2 17 L 2 7 Z";
    case 14: // Kite Shield
      return "M 4 2 L 20 2 L 18 12 L 12 23 L 6 12 Z";
    case 15: // Spiked Crest
    default:
      return "M 12 1 L 18 4 L 22 11 L 17 19 L 12 23 L 7 19 L 2 11 L 6 4 Z";
  }
}

/** Renders an SVG path/shape for a symbol icon in a 24x24 viewBox */
export function getSymbolSvg(symbolIndex: number, color: string): string {
  switch (symbolIndex % 16) {
    case 0: // Maple Leaf
      return `<path d="M 12 3 L 13 8 L 17 5 L 16 10 L 21 11 L 17 14 L 18 19 L 13 16 L 12 22 L 11 16 L 6 19 L 7 14 L 3 11 L 8 10 L 7 5 L 11 8 Z" fill="${color}" />`;
    case 1: // Crossed Swords
      return `<path d="M 4 4 L 8 8 L 19 5 L 20 6 L 17 17 L 20 20 L 19 21 L 16 18 L 8 19 L 7 18 L 6 7 L 3 4 Z M 9 15 L 15 9 M 15 15 L 9 9" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" />`;
    case 2: // Royal Crown
      return `<path d="M 5 18 L 19 18 L 21 8 L 16 12 L 12 5 L 8 12 L 3 8 Z" fill="${color}" />`;
    case 3: // Dragon Head / Horns
      return `<path d="M 4 6 Q 9 9 12 4 Q 15 9 20 6 Q 18 14 12 20 Q 6 14 4 6 Z M 9 11 A 1.2 1.2 0 1 0 9 13 M 15 11 A 1.2 1.2 0 1 0 15 13" fill="${color}" />`;
    case 4: // Phoenix Wings
      return `<path d="M 12 16 Q 16 10 22 5 Q 18 15 12 20 Q 6 15 2 5 Q 8 10 12 16 Z" fill="${color}" />`;
    case 5: // Flame
      return `<path d="M 12 3 Q 17 8 15 14 Q 19 13 17 19 Q 12 22 7 19 Q 5 13 10 11 Q 8 8 12 3 Z" fill="${color}" />`;
    case 6: // Radiant Star
      return `<path d="M 12 4 L 14 9 L 20 10 L 15 14 L 17 20 L 12 16 L 7 20 L 9 14 L 4 10 L 10 9 Z" fill="${color}" />`;
    case 7: // Skull
      return `<path d="M 7 12 C 7 7 17 7 17 12 C 17 16 15 17 15 19 L 9 19 C 9 17 7 16 7 12 Z M 9 12 A 1.5 1.5 0 1 0 9 14 M 15 12 A 1.5 1.5 0 1 0 15 14 M 10 18 L 10 20 M 14 18 L 14 20" fill="${color}" />`;
    case 8: // Heart
      return `<path d="M 12 19 C 5 13 4 8 8 5 C 11 3 12 6 12 6 C 12 6 13 3 16 5 C 20 8 19 13 12 19 Z" fill="${color}" />`;
    case 9: // Sacred Cross
      return `<path d="M 10 5 L 14 5 L 14 9 L 19 9 L 19 13 L 14 13 L 14 20 L 10 20 L 10 13 L 5 13 L 5 9 L 10 9 Z" fill="${color}" />`;
    case 10: // Diamond
      return `<path d="M 7 6 L 17 6 L 21 10 L 12 20 L 3 10 Z M 7 6 L 12 20 L 17 6 M 3 10 L 21 10" stroke="${color}" fill="${color}" fill-opacity="0.6" stroke-width="1.2" />`;
    case 11: // Magic Potion
      return `<path d="M 10 5 L 14 5 L 14 8 Q 19 10 19 16 Q 19 20 12 20 Q 5 20 5 16 Q 5 10 10 8 Z" fill="${color}" />`;
    case 12: // Gold Coin
      return `<circle cx="12" cy="12" r="8" fill="${color}" /><circle cx="12" cy="12" r="6" stroke="#ffffff" stroke-width="1" fill="none" opacity="0.6"/><text x="12" y="15" font-size="8" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#ffffff">$</text>`;
    case 13: // Orange Mushroom
      return `<path d="M 4 12 C 4 6 20 6 20 12 Z M 9 12 L 9 18 Q 12 20 15 18 L 15 12 Z M 7 9 A 1 1 0 1 0 7 10 M 17 9 A 1 1 0 1 0 17 10" fill="${color}" />`;
    case 14: // Slime
      return `<path d="M 6 16 C 4 10 9 7 12 7 C 15 7 20 10 18 16 C 17 19 7 19 6 16 Z M 9 12 A 1 1 0 1 0 9 13 M 15 12 A 1 1 0 1 0 15 13" fill="${color}" />`;
    case 15: // Knight Shield
    default:
      return `<path d="M 6 5 L 18 5 L 17 13 L 12 18 L 7 13 Z" fill="${color}" /><path d="M 12 5 L 12 18 M 6 10 L 18 10" stroke="#ffffff" stroke-width="1.2" opacity="0.5" />`;
  }
}

/** Generates clean SVG markup for a guild emblem */
export function renderEmblemSvg(emblem?: GuildEmblem, size = 18): string {
  if (!emblem) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" class="guild-emblem"><rect width="24" height="24" rx="4" fill="#334155"/><text x="12" y="16" font-size="12" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#94a3b8">G</text></svg>`;
  }
  const bgColor = EMBLEM_COLORS[emblem.bgColor % 16]?.hex ?? "#dc2626";
  const symColor = EMBLEM_COLORS[emblem.symbolColor % 16]?.hex ?? "#ffffff";
  const bgPath = getBgShapeSvgPath(emblem.bgShape);
  const symbolSvg = getSymbolSvg(emblem.symbolShape, symColor);

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" class="guild-emblem select-none inline-block">
      <defs>
        <filter id="emblem-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-opacity="0.5"/>
        </filter>
      </defs>
      <path d="${bgPath}" fill="${bgColor}" stroke="rgba(255,255,255,0.4)" stroke-width="1" filter="url(#emblem-shadow)" />
      ${symbolSvg}
    </svg>
  `.trim();
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
