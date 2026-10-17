// Shared Map Names Dictionary & Dynamic Resolver
export const MAP_NAMES_FALLBACK: Record<number, string> = {
  // Town & Special Maps
  910000000: "Free Market",
  100000000: "Henesys Town",
  100010000: "Henesys Hunting Ground I",
  100020000: "Henesys Market",
  100030000: "Henesys Park",
  100040000: "Bowman Instructional School",
  100000100: "Henesys Mayor's House",
  100000101: "Henesys Hair Salon",
  100000102: "Henesys Plastic Surgery",
  100000103: "Henesys Skin Care",
  101000000: "Ellinia",
  101010000: "The Tree That Grew I",
  101010100: "The Tree That Grew II",
  101010101: "The Tree That Grew III",
  101020000: "Ellinia Magic Library",
  102000000: "Perion",
  102010000: "Perion Street",
  102020000: "Warriors' Sanctuary",
  103000000: "Kerning City",
  103010000: "Kerning City Middle Tower",
  103020000: "Kerning City Pharmacy",
  103000001: "Thieves' Hideout",
  104000000: "Lith Harbor",
  104010000: "Lith Harbor Coast",
  105040300: "Sleepywood",
  105050000: "Ant Tunnel I",
  105050100: "Ant Tunnel II",
  105050200: "Ant Tunnel III",
  105050300: "Ant Tunnel IV",
  105060000: "Evil Eye Cave I",
  120000000: "Nautilus Harbor",
  120000100: "Nautilus Navigation Room",
  110000000: "Florina Beach",
  200000000: "Orbis",
  200000100: "Orbis Station",
  211000000: "El Nath",
  211010000: "Ice Valley I",
  211020000: "Dead Mine I",
  220000000: "Ludibrium",
  220010000: "Eos Tower Entrance",
  230000000: "Aqua Road",
  240000000: "Leafre",
  250000000: "Mu Lung",
  260000000: "Ariant",
  270000000: "Temple of Time",
  600000000: "New Leaf City",
  800000000: "Mushroom Shrine",
  0: "Maple Island",
  10000: "Mushroom Town Training Camp",
  1010000: "Amherst",
  1020000: "Southperry",
};

export const mapNameCache = new Map<number, string>();
const fetchingMapNames = new Set<number>();

export function getMapDisplayName(
  mapId: number,
  serverMapName?: string,
  localGameMap?: { id: number; name?: string },
  onResolved?: (resolvedName: string) => void
): string {
  // 1. If server provided an authentic name, cache and use it
  if (serverMapName && !serverMapName.startsWith("Map ") && !serverMapName.startsWith("Area ")) {
    mapNameCache.set(mapId, serverMapName);
    return serverMapName;
  }

  // 2. If current local map matches, cache and use it
  if (localGameMap && localGameMap.id === mapId && localGameMap.name) {
    mapNameCache.set(mapId, localGameMap.name);
    return localGameMap.name;
  }

  // 3. If present in dynamic cache
  if (mapNameCache.has(mapId)) {
    return mapNameCache.get(mapId)!;
  }

  // 4. Fallback table of known MapleStory maps
  if (MAP_NAMES_FALLBACK[mapId]) {
    const name = MAP_NAMES_FALLBACK[mapId];
    mapNameCache.set(mapId, name);
    return name;
  }

  // 5. Query server-side map data API
  if (typeof window !== "undefined" && !fetchingMapNames.has(mapId)) {
    fetchingMapNames.add(mapId);
    fetch(`/wz/data/map/${mapId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.mapName) {
          mapNameCache.set(mapId, data.mapName);
          if (onResolved) onResolved(data.mapName);
        }
      })
      .catch(() => {})
      .finally(() => {
        fetchingMapNames.delete(mapId);
      });
  }

  return serverMapName || `Map ${mapId}`;
}
