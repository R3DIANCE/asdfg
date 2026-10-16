import type { Portal } from "./game-types.ts";

export interface SecretTeleporterDef {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  label: string;
  secretType?: "tree" | "chimney" | "pipe" | "door" | "shortcut" | "springboard" | "portal";
  hint?: string;
}

/**
 * Authentic MapleStory secret intra-map teleporters (warps player from coordinate X to Y).
 * Classic hidden portals, tree hollows, chimneys, rooftops, sewer pipes, and chutes.
 */
export const SECRET_MAP_TELEPORTERS: Record<number, SecretTeleporterDef[]> = {
  // Henesys Town (100000000)
  100000000: [
    // Classic Mushroom House Chimney <-> High Tree Canopy Branch
    {
      x: 1136,
      y: 154,
      targetX: 5253,
      targetY: -54,
      label: "Mushroom Roof Chimney",
      secretType: "chimney",
      hint: "Secret warp to High Tree Canopy",
    },
    {
      x: 5253,
      y: -54,
      targetX: 1136,
      targetY: 154,
      label: "Treetop Branch Hollow",
      secretType: "tree",
      hint: "Drop back down to Mushroom Roof",
    },
    // Town Center Rooftop passage across town
    {
      x: 1974,
      y: -20,
      targetX: 4330,
      targetY: -18,
      label: "Rooftop Fast Track",
      secretType: "shortcut",
      hint: "Glide across Henesys rooftops",
    },
    {
      x: 4330,
      y: -18,
      targetX: 1974,
      targetY: -20,
      label: "East Rooftop Return",
      secretType: "shortcut",
      hint: "Return to Town Center rooftop",
    },
    // Town Secret Underground Tunnel
    {
      x: 2078,
      y: 336,
      targetX: 3445,
      targetY: 351,
      label: "Town Secret Tunnel",
      secretType: "pipe",
      hint: "Underground passage across Henesys",
    },
    {
      x: 3445,
      y: 351,
      targetX: 2078,
      targetY: 336,
      label: "Town Secret Tunnel Exit",
      secretType: "pipe",
      hint: "Return through secret tunnel",
    },
  ],

  // The Hill North of Henesys (100010000)
  100010000: [
    // Classic Hollow Tree trunk shortcut (climb through giant trunk)
    {
      x: -358,
      y: 405,
      targetX: -214,
      targetY: 291,
      label: "Hollow Tree Trunk",
      secretType: "tree",
      hint: "Climb through ancient hollow tree",
    },
    {
      x: -214,
      y: 291,
      targetX: -358,
      targetY: 405,
      label: "Upper Hollow Branch",
      secretType: "tree",
      hint: "Drop back through hollow tree",
    },
    // Secret High Ridge Vine shortcut
    {
      x: 1434,
      y: 264,
      targetX: 1568,
      targetY: -299,
      label: "High Ridge Secret Vine",
      secretType: "shortcut",
      hint: "Secret shortcut to upper ridge",
    },
    {
      x: 1568,
      y: -299,
      targetX: 1434,
      targetY: 264,
      label: "Ridge Dropdown",
      secretType: "shortcut",
      hint: "Descend back to lower clearing",
    },
  ],

  // Spore Hill (100020000)
  100020000: [
    // Bouncy Giant Mushroom Launch
    {
      x: -411,
      y: 440,
      targetX: 439,
      targetY: -333,
      label: "Giant Spore Launch",
      secretType: "springboard",
      hint: "Launch high up to Sky Canopy!",
    },
    {
      x: 439,
      y: -333,
      targetX: -411,
      targetY: 440,
      label: "Canopy Slide",
      secretType: "shortcut",
      hint: "Slide down to mushroom base",
    },
  ],

  // The Forest of Wisdom / Ellinia Tree (101010000)
  101010000: [
    // Ancient Root Tree Hollow <-> High Canopy
    {
      x: -855,
      y: 2145,
      targetX: -418,
      targetY: 1245,
      label: "Ancient Root Portal",
      secretType: "tree",
      hint: "Teleport up the giant ancient tree",
    },
    {
      x: -418,
      y: 1245,
      targetX: -855,
      targetY: 2145,
      label: "High Canopy Hollow",
      secretType: "tree",
      hint: "Drop back down to tree roots",
    },
  ],

  // Free Market Entrance / Hall (910000000)
  910000000: [
    // Mezzanine hidden portals (west <-> east market mezzanine)
    {
      x: 308,
      y: 38,
      targetX: 1578,
      targetY: 38,
      label: "Mezzanine Hidden Portal",
      secretType: "portal",
      hint: "Cross to East Market Hall",
    },
    {
      x: 1578,
      y: 38,
      targetX: 308,
      targetY: 38,
      label: "East Hidden Portal",
      secretType: "portal",
      hint: "Return to West Market Hall",
    },
    // Market Elevator Up
    {
      x: 410,
      y: 0,
      targetX: 458,
      targetY: -269,
      label: "Market Elevator Up",
      secretType: "shortcut",
      hint: "Elevator to upper market stalls",
    },
    // Express Balcony Chute Down
    {
      x: 1429,
      y: -269,
      targetX: 1476,
      targetY: 0,
      label: "Balcony Express Chute",
      secretType: "shortcut",
      hint: "Slide down to main concourse",
    },
    // Entrance to Trading Hall Walkway Shortcut
    {
      x: -537,
      y: -60,
      targetX: 104,
      targetY: 34,
      label: "Market Express Walkway",
      secretType: "shortcut",
      hint: "Fast route to trading halls",
    },
    {
      x: 104,
      y: 34,
      targetX: -537,
      targetY: -60,
      label: "Concourse Return",
      secretType: "shortcut",
      hint: "Return to market entrance",
    },
  ],

  // Ellinia Town (101000000)
  101000000: [
    {
      x: -665,
      y: 106,
      targetX: 520,
      targetY: -1090,
      label: "Magic Tree Trunk",
      secretType: "tree",
      hint: "Ascend to Ellinia high canopy",
    },
    {
      x: 520,
      y: -1090,
      targetX: -665,
      targetY: 106,
      label: "High Canopy Hollow",
      secretType: "tree",
      hint: "Descend to Ellinia ground",
    },
  ],

  // Perion Town (102000000)
  102000000: [
    {
      x: 2367,
      y: 1935,
      targetX: 918,
      targetY: 976,
      label: "Rocky Canyon Shortcut",
      secretType: "shortcut",
      hint: "Tunnel through Perion cliffs",
    },
    {
      x: 918,
      y: 976,
      targetX: 2367,
      targetY: 1935,
      label: "Cliff Ledge Return",
      secretType: "shortcut",
      hint: "Return to lower canyon",
    },
  ],

  // Kerning City (103000000)
  103000000: [
    {
      x: -1584,
      y: -202,
      targetX: 605,
      targetY: 69,
      label: "Underground Sewer Pipe",
      secretType: "pipe",
      hint: "Secret underground passage",
    },
    {
      x: 605,
      y: 69,
      targetX: -1584,
      targetY: -202,
      label: "Subway Sewer Exit",
      secretType: "pipe",
      hint: "Return to west street",
    },
    {
      x: -971,
      y: -776,
      targetX: -979,
      targetY: -910,
      label: "Construction Crane Pass",
      secretType: "shortcut",
      hint: "Hoist to top of crane",
    },
    {
      x: -979,
      y: -910,
      targetX: -971,
      targetY: -776,
      label: "Crane Descent",
      secretType: "shortcut",
      hint: "Climb down crane",
    },
  ],
};

/**
 * Returns all secret intra-map teleporters (X to Y) for a given map,
 * combining curated classic shortcuts with any parsed WZ intra-map portals.
 */
export function getMapSecretTeleporters(mapId: number, wzPortals?: any[]): Portal[] {
  const result: Portal[] = [];

  // 1. Add curated classic secrets
  const curated = SECRET_MAP_TELEPORTERS[mapId] ?? [];
  for (const s of curated) {
    result.push({
      x: s.x,
      y: s.y,
      to: mapId,
      side: "teleport",
      targetX: s.targetX,
      targetY: s.targetY,
      secret: true,
      secretType: s.secretType,
      label: s.label,
      hint: s.hint,
    });
  }

  // 2. Add WZ intra-map portals (where tn points to another portal in the same map)
  if (wzPortals && Array.isArray(wzPortals)) {
    for (const wp of wzPortals) {
      if (wp.tn && typeof wp.tn === "string" && wp.tn.length > 0) {
        const dest = wzPortals.find((d: any) => d.pn === wp.tn && d !== wp);
        if (dest && typeof dest.x === "number" && typeof dest.y === "number") {
          // Avoid duplicate if a curated secret already exists within 30px
          const alreadyExists = result.some(
            (p) => Math.hypot(p.x - wp.x, p.y - wp.y) < 30 && p.targetX !== undefined
          );
          if (!alreadyExists) {
            const isHidden = wp.pn.startsWith("hp") || wp.pn.startsWith("hidden") || wp.pt === 10;
            const isTrap = wp.pn.startsWith("trap") || wp.pt === 3;
            const isElevator = wp.pn.startsWith("up") || wp.pn.startsWith("dn");
            result.push({
              x: wp.x,
              y: wp.y,
              to: mapId,
              side: "teleport",
              targetX: dest.x,
              targetY: dest.y,
              pn: wp.pn,
              tn: wp.tn,
              pt: wp.pt,
              secret: true,
              secretType: isHidden ? "portal" : isTrap ? "shortcut" : isElevator ? "shortcut" : "portal",
              label: isHidden ? "Hidden Portal" : isTrap ? "Secret Chute" : isElevator ? "Express Way" : "Secret Teleport",
              hint: `Teleports to (${Math.round(dest.x)}, ${Math.round(dest.y)})`,
            });
          }
        }
      }
    }
  }

  return result;
}
