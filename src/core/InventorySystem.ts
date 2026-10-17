// Core Inventory System — Equipment slots, visual NX equips, bag sorting, dropping items, Star Force & Potential Cubes
import type { Game } from "../game.ts";
import {
  GEAR,
  GEAR_TYPE_ORDER,
  gearCombatPower,
  canClassEquipWeapon,
  getWeaponType,
  WEAPON_TYPE_NAME,
  getWeaponAllowedClassesDesc,
  canClassEquipItem,
  getItemAllowedClassesDesc,
  isOverallItem,
  getItemGender,
  canGenderEquip,
  MATS,
  RARITY,
  cubeCost,
  npcSellPrice,
  rollPotential,
  starCost,
  starMat,
  starRate,
  type Gear,
  type Slot,
} from "../items.ts";
import { ITEMS } from "../skills.ts";

export class InventorySystem {
  static equip(game: Game, uid: string): boolean {
    const i = game.bag.findIndex((g) => g.uid === uid);
    if (i < 0) return false;
    const g = game.bag[i], b = GEAR.get(g.id);
    if (!b) return false;
    if (b.cosmetic || b.cash) {
      return InventorySystem.equipVisual(game, uid);
    }
    if (game.stats.level < b.req) {
      game.onChat("system", `You need to be Lv. ${b.req} to equip ${b.name}.`);
      return false;
    }
    // Gender lock enforcement
    const itemGender = b.gender ?? getItemGender(b.id, b.name);
    if (!canGenderEquip(game.stats.gender, itemGender)) {
      const reqGender = itemGender.charAt(0).toUpperCase() + itemGender.slice(1);
      const charG = (game.stats.gender ?? "male").charAt(0).toUpperCase() + (game.stats.gender ?? "male").slice(1);
      game.onChat("system", `❌ ${charG} characters cannot equip ${reqGender}-only items (${b.name}).`);
      return false;
    }
    // Class / Job requirement enforcement (weapons, armors, accessories)
    if (!canClassEquipItem(game.stats.classId, b)) {
      const allowed = getItemAllowedClassesDesc(b);
      const playerClass = game.stats.classId.charAt(0).toUpperCase() + game.stats.classId.slice(1);
      game.onChat("system", `❌ ${playerClass} cannot equip ${b.name}. Required Job: ${allowed}.`);
      return false;
    }

    // Overall / Pants mutual exclusion
    if (isOverallItem(b.id)) {
      // Overalls take the 'top' slot and unequip any equipped pants/bottom
      if (game.eq.bottom) {
        const bot = game.eq.bottom;
        delete game.eq.bottom;
        InventorySystem.addGear(game, bot);
        game.onChat("notice", "Unequipped pants: overalls cover both top and bottom.");
      }
    } else if (b.slot === "bottom") {
      // Equipping pants unequips any equipped overall in the top slot
      if (game.eq.top && isOverallItem(game.eq.top.id)) {
        const ov = game.eq.top;
        delete game.eq.top;
        InventorySystem.addGear(game, ov);
        game.onChat("notice", "Unequipped overall to wear pants.");
      }
    }

    const sockets = game.socketsFor(b.slot);
    let target: Slot | null = null;
    for (const s of sockets) {
      if (!game.eq[s]) { target = s; break; }
    }
    if (!target) target = sockets[0];
    game.bag.splice(i, 1);
    const old = game.eq[target];
    game.eq[target] = g;
    if (old) InventorySystem.addGear(game, old);
    game.recalc(); game.refreshLook(); game.onChange();
    return true;
  }

  static unequip(game: Game, slot: Slot) {
    const g = game.eq[slot];
    if (!g) return;
    delete game.eq[slot];
    InventorySystem.addGear(game, g);
    game.recalc(); game.refreshLook(); game.onChange();
  }

  static equipVisual(game: Game, uid: string): boolean {
    const i = game.bag.findIndex((g) => g.uid === uid);
    if (i < 0) return false;
    const g = game.bag[i];
    const b = GEAR.get(g.id);
    if (!b) return false;
    if (!b.cosmetic && !b.cash) {
      return InventorySystem.equip(game, uid);
    }
    // Gender lock enforcement
    const itemGender = b.gender ?? getItemGender(b.id, b.name);
    if (!canGenderEquip(game.stats.gender, itemGender)) {
      const reqGender = itemGender.charAt(0).toUpperCase() + itemGender.slice(1);
      const charG = (game.stats.gender ?? "male").charAt(0).toUpperCase() + (game.stats.gender ?? "male").slice(1);
      game.onChat("system", `❌ ${charG} characters cannot equip ${reqGender}-only items (${b.name}).`);
      return false;
    }

    // Visual Overall / Pants mutual exclusion
    if (isOverallItem(b.id)) {
      if (game.visualEq.bottom) {
        const bot = game.visualEq.bottom;
        delete game.visualEq.bottom;
        InventorySystem.addGear(game, bot);
        game.onChat("notice", "Unequipped visual pants: overalls cover both top and bottom.");
      }
    } else if (b.slot === "bottom") {
      if (game.visualEq.top && isOverallItem(game.visualEq.top.id)) {
        const ov = game.visualEq.top;
        delete game.visualEq.top;
        InventorySystem.addGear(game, ov);
        game.onChat("notice", "Unequipped visual overall to wear pants.");
      }
    }

    const sockets = game.socketsFor(b.slot);
    let target: Slot | null = null;
    for (const s of sockets) {
      if (!game.visualEq[s]) { target = s; break; }
    }
    if (!target) target = sockets[0];
    game.bag.splice(i, 1);
    const old = game.visualEq[target];
    game.visualEq[target] = g;
    if (old) InventorySystem.addGear(game, old);
    game.refreshLook(); game.onChange();
    return true;
  }

  static unequipVisual(game: Game, slot: Slot) {
    const g = game.visualEq[slot];
    if (!g) return;
    delete game.visualEq[slot];
    InventorySystem.addGear(game, g);
    game.refreshLook(); game.onChange();
  }

  static sellGear(game: Game, uid: string) {
    const i = game.bag.findIndex((g) => g.uid === uid);
    if (i < 0) return;
    const g = game.bag[i], price = npcSellPrice(g);
    game.bag.splice(i, 1);
    game.stats.meso += price;
    game.onGain("meso", `Sold ${GEAR.get(g.id)?.name} for ${price.toLocaleString()} mesos.`);
    game.onChange();
  }

  static sellJunk(game: Game) {
    const junk = game.bag.filter((g) => g.rarity === 0 && g.star === 0);
    let total = 0;
    for (const g of junk) total += npcSellPrice(g);
    game.bag = game.bag.filter((g) => !junk.includes(g));
    game.stats.meso += total;
    game.onGain("meso", junk.length ? `Sold ${junk.length} Normal items for ${total.toLocaleString()} mesos.` : "No Normal-grade items to sell.");
    game.onChange();
  }

  static findGear(game: Game, uid: string): Gear | null {
    return game.bag.find((g) => g.uid === uid) ??
      Object.values(game.eq).find((g) => g?.uid === uid) ??
      Object.values(game.visualEq).find((g) => g?.uid === uid) ??
      null;
  }

  static addGear(game: Game, g: Gear) {
    const isCosmetic = Boolean(GEAR.get(g.id)?.cosmetic || GEAR.get(g.id)?.cash);
    const pool = game.bag.filter((x) => {
      const b = GEAR.get(x.id);
      return isCosmetic ? Boolean(b?.cosmetic || b?.cash) : (!b?.cosmetic && !b?.cash);
    });
    const occupied = new Set(pool.map((x) => x.slot).filter((s): s is number => typeof s === "number"));
    if (typeof g.slot !== "number" || occupied.has(g.slot)) {
      let s = 0;
      while (occupied.has(s)) s++;
      g.slot = s;
    }
    game.bag.push(g);
    game.onChange();
  }

  static moveBagSlot(game: Game, fromSlot: number, toSlot: number, isCash = false) {
    const pool = game.bag.filter((x) => {
      const b = GEAR.get(x.id);
      return isCash ? Boolean(b?.cosmetic || b?.cash) : (!b?.cosmetic && !b?.cash);
    });
    const itemA = pool.find((x) => x.slot === fromSlot);
    if (!itemA) return;
    const itemB = pool.find((x) => x.slot === toSlot);
    if (itemB) {
      itemB.slot = fromSlot;
    }
    itemA.slot = toSlot;
    game.onChange();
    InventorySystem.persist(game);
  }

  static sortBag(game: Game, isCash = false) {
    const pool = game.bag.filter((x) => {
      const b = GEAR.get(x.id);
      return isCash ? Boolean(b?.cosmetic || b?.cash) : (!b?.cosmetic && !b?.cash);
    });

    pool.sort((a, b) => {
      const bA = GEAR.get(a.id);
      const bB = GEAR.get(b.id);

      // 1. Sort by Type (canonical equipment slot category order: weapon, hat, top, bottom, shoes, etc.)
      const slotA = bA?.slot ?? "";
      const slotB = bB?.slot ?? "";
      const typeA = GEAR_TYPE_ORDER[slotA] ?? 999;
      const typeB = GEAR_TYPE_ORDER[slotB] ?? 999;
      if (typeA !== typeB) return typeA - typeB;

      // 2. Sort by Level (required level descending: highest level gear first)
      const reqA = bA?.req ?? 0;
      const reqB = bB?.req ?? 0;
      if (reqB !== reqA) return reqB - reqA;

      // 3. Sort by Combat Power (CP descending: highest battle prowess first)
      const cpA = gearCombatPower(a);
      const cpB = gearCombatPower(b);
      if (cpB !== cpA) return cpB - cpA;

      // Tie-breakers: rarity, star force, and name
      if (b.rarity !== a.rarity) return b.rarity - a.rarity;
      if (b.star !== a.star) return b.star - a.star;
      return (bA?.name ?? "").localeCompare(bB?.name ?? "");
    });

    pool.forEach((g, i) => {
      g.slot = i;
    });

    // Re-order game.bag array to match the sorted slots as well
    const otherItems = game.bag.filter((x) => !pool.includes(x));
    game.bag = [...pool, ...otherItems];

    game.onChat("notice", "📦 Inventory organized: sorted by Type, Level, and Combat Power (CP).");
    game.onChange();
    InventorySystem.persist(game);
  }

  /** Automatically selects and equips the highest Combat Power (CP) gear for the character's class */
  static autoEquipBest(game: Game): { equippedCount: number; oldCp: number; newCp: number } {
    const oldCp = game.combatPower();
    let equippedCount = 0;

    const singleSlots: Slot[] = [
      "weapon", "hat", "shoes", "gloves", "shield", "cape",
      "earrings", "pendant", "shoulder", "belt", "pocket", "emblem", "badge",
      "face", "eye",
    ];

    const compareGear = (a: Gear, b: Gear): number => {
      const cpA = gearCombatPower(a);
      const cpB = gearCombatPower(b);
      if (cpA !== cpB) return cpB - cpA; // Higher CP first
      if (a.rarity !== b.rarity) return b.rarity - a.rarity;
      if (a.star !== b.star) return b.star - a.star;
      const baseA = GEAR.get(a.id);
      const baseB = GEAR.get(b.id);
      return (baseB?.req ?? 0) - (baseA?.req ?? 0);
    };

    // Helper to test if gear is valid for character's level, gender, and class
    const isValidGear = (g: Gear | undefined, targetSlot: string): boolean => {
      if (!g || g.cosmetic || g.cash) return false;
      const b = GEAR.get(g.id);
      if (!b || b.cosmetic || b.cash) return false;
      if (b.slot !== targetSlot) return false;
      if (game.stats.level < b.req) return false;
      const itemGender = b.gender ?? getItemGender(b.id, b.name);
      if (!canGenderEquip(game.stats.gender, itemGender)) return false;
      if (!canClassEquipItem(game.stats.classId, b)) return false;
      return true;
    };

    // 1. Process non-torso single equipment sockets
    for (const slot of singleSlots) {
      const current = game.eq[slot];
      const currentValid = isValidGear(current, slot);

      const bagCandidates = game.bag.filter((g) => isValidGear(g, slot));
      const allCandidates = currentValid && current ? [current, ...bagCandidates] : [...bagCandidates];

      if (allCandidates.length === 0) {
        if (current && !currentValid) {
          delete game.eq[slot];
          InventorySystem.addGear(game, current);
          equippedCount++;
        }
        continue;
      }

      allCandidates.sort(compareGear);
      const best = allCandidates[0];

      if (!current || current.uid !== best.uid) {
        const bagIdx = game.bag.findIndex((x) => x.uid === best.uid);
        if (bagIdx >= 0) {
          game.bag.splice(bagIdx, 1);
        }
        if (current) {
          InventorySystem.addGear(game, current);
        }
        game.eq[slot] = best;
        equippedCount++;
      }
    }

    // 2. Torso & Bottoms: Compare Overalls vs (Top + Bottom)
    const curTop = game.eq.top;
    const curBottom = game.eq.bottom;
    const curTopValid = isValidGear(curTop, "top");
    const curBottomValid = isValidGear(curBottom, "bottom");

    // Separate Tops candidates (no overalls)
    const separateTopCandidates = game.bag.filter((g) => isValidGear(g, "top") && !isOverallItem(g.id));
    if (curTop && curTopValid && !isOverallItem(curTop.id)) separateTopCandidates.push(curTop);
    separateTopCandidates.sort(compareGear);
    const bestSeparateTop = separateTopCandidates[0] ?? null;

    // Separate Bottoms candidates
    const bottomCandidates = game.bag.filter((g) => isValidGear(g, "bottom"));
    if (curBottom && curBottomValid) bottomCandidates.push(curBottom);
    bottomCandidates.sort(compareGear);
    const bestBottom = bottomCandidates[0] ?? null;

    // Overall candidates (takes top slot)
    const overallCandidates = game.bag.filter((g) => isValidGear(g, "top") && isOverallItem(g.id));
    if (curTop && curTopValid && isOverallItem(curTop.id)) overallCandidates.push(curTop);
    overallCandidates.sort(compareGear);
    const bestOverall = overallCandidates[0] ?? null;

    const separateCp = (bestSeparateTop ? gearCombatPower(bestSeparateTop) : 0) + (bestBottom ? gearCombatPower(bestBottom) : 0);
    const overallCp = bestOverall ? gearCombatPower(bestOverall) : 0;

    if (bestOverall && overallCp > separateCp) {
      // Overalls win! Equip overall in top, unequip bottom
      if (!curTop || curTop.uid !== bestOverall.uid) {
        const bagIdx = game.bag.findIndex((x) => x.uid === bestOverall.uid);
        if (bagIdx >= 0) game.bag.splice(bagIdx, 1);
        if (curTop) InventorySystem.addGear(game, curTop);
        game.eq.top = bestOverall;
        equippedCount++;
      }
      if (curBottom) {
        delete game.eq.bottom;
        InventorySystem.addGear(game, curBottom);
        equippedCount++;
      }
    } else {
      // Separate top + bottom win!
      if (bestSeparateTop) {
        if (!curTop || curTop.uid !== bestSeparateTop.uid) {
          const bagIdx = game.bag.findIndex((x) => x.uid === bestSeparateTop.uid);
          if (bagIdx >= 0) game.bag.splice(bagIdx, 1);
          if (curTop) InventorySystem.addGear(game, curTop);
          game.eq.top = bestSeparateTop;
          equippedCount++;
        }
      } else if (curTop && (!curTopValid || isOverallItem(curTop.id))) {
        delete game.eq.top;
        InventorySystem.addGear(game, curTop);
        equippedCount++;
      }

      if (bestBottom) {
        if (!curBottom || curBottom.uid !== bestBottom.uid) {
          const bagIdx = game.bag.findIndex((x) => x.uid === bestBottom.uid);
          if (bagIdx >= 0) game.bag.splice(bagIdx, 1);
          if (curBottom) InventorySystem.addGear(game, curBottom);
          game.eq.bottom = bestBottom;
          equippedCount++;
        }
      } else if (curBottom && !curBottomValid) {
        delete game.eq.bottom;
        InventorySystem.addGear(game, curBottom);
        equippedCount++;
      }
    }

    // 3. Process Rings (up to 4 ring sockets: ring1, ring2, ring3, ring4)
    const ringSlots: Slot[] = ["ring1", "ring2", "ring3", "ring4"];
    const currentRings = ringSlots.map((s) => game.eq[s]).filter((r): r is Gear => {
      if (!r || r.cosmetic || r.cash) return false;
      const b = GEAR.get(r.id);
      return Boolean(b && !b.cosmetic && !b.cash && game.stats.level >= b.req && canGenderEquip(game.stats.gender, b.gender ?? getItemGender(b.id, b.name)) && canClassEquipItem(game.stats.classId, b));
    });

    const bagRings = game.bag.filter((g) => {
      const b = GEAR.get(g.id);
      return Boolean(b && b.slot === "ring" && !b.cosmetic && !b.cash && !g.cosmetic && !g.cash && game.stats.level >= b.req && canGenderEquip(game.stats.gender, b.gender ?? getItemGender(b.id, b.name)) && canClassEquipItem(game.stats.classId, b));
    });

    const allRings = [...currentRings, ...bagRings];
    const uniqueRingsMap = new Map<string, Gear>();
    for (const r of allRings) uniqueRingsMap.set(r.uid, r);
    const uniqueRings = [...uniqueRingsMap.values()];
    uniqueRings.sort(compareGear);

    const bestRings = uniqueRings.slice(0, 4);
    const currentRingUids = new Set(currentRings.map((r) => r.uid));
    const bestRingUids = new Set(bestRings.map((r) => r.uid));

    let ringsChanged = currentRings.length !== bestRings.length;
    if (!ringsChanged) {
      for (const r of bestRings) {
        if (!currentRingUids.has(r.uid)) {
          ringsChanged = true;
          break;
        }
      }
    }

    if (ringsChanged) {
      for (const s of ringSlots) {
        const r = game.eq[s];
        if (r) {
          delete game.eq[s];
          if (!bestRingUids.has(r.uid)) {
            InventorySystem.addGear(game, r);
          }
        }
      }
      for (let i = 0; i < bestRings.length; i++) {
        const ring = bestRings[i];
        const bIdx = game.bag.findIndex((x) => x.uid === ring.uid);
        if (bIdx >= 0) {
          game.bag.splice(bIdx, 1);
        }
        game.eq[ringSlots[i]] = ring;
      }
      equippedCount += bestRings.length;
    }

    if (equippedCount > 0) {
      game.recalc();
      game.refreshLook();
      game.onChange();
      InventorySystem.persist(game);
      const newCp = game.combatPower();
      const diff = newCp - oldCp;
      game.onChat("system", `⚡ Equipped best Combat Power gear! Total CP: ${newCp.toLocaleString()} (${diff >= 0 ? "+" : ""}${diff.toLocaleString()}).`);
      return { equippedCount, oldCp, newCp };
    } else {
      game.onChat("notice", "You already have the highest Combat Power gear equipped for your class!");
      return { equippedCount: 0, oldCp, newCp: oldCp };
    }
  }

  static persist(game: Game) {
    try {
      if (typeof localStorage === "undefined") return;
      const full = game.save();
      const charSaveKey = game.stats.name ? `maple-wayfarer-save-${game.stats.name}` : "maple-wayfarer-save";
      localStorage.setItem(charSaveKey, JSON.stringify(full));
      localStorage.setItem("maple-wayfarer-save", JSON.stringify(full));
    } catch (e) {
      console.warn("Failed to persist save:", e);
    }
  }

  static dropGear(game: Game, uid: string): boolean {
    const i = game.bag.findIndex((x) => x.uid === uid);
    if (i < 0) return false;
    const gear = game.bag.splice(i, 1)[0];
    const vx = (Math.random() - 0.5) * 80;
    const vy = -160;
    game.drops.push({
      x: game.p.x,
      y: game.p.y - 15,
      vx,
      vy,
      fh: null,
      amount: 1,
      t: 0,
      picked: 0,
      gear,
    });
    game.onChat("item", `You dropped ${GEAR.get(gear.id)?.name ?? "equipment"} on the ground.`);
    game.onChange();
    return true;
  }

  static dropUseItem(game: Game, id: number, count = 1): boolean {
    const have = game.inv[id] ?? 0;
    if (have < count) return false;
    game.inv[id] -= count;
    if (game.inv[id] <= 0) delete game.inv[id];
    const vx = (Math.random() - 0.5) * 80;
    const vy = -160;
    game.drops.push({
      x: game.p.x,
      y: game.p.y - 15,
      vx,
      vy,
      fh: null,
      amount: count,
      t: 0,
      picked: 0,
      item: id,
    });
    game.onChat("item", `You dropped ${ITEMS[id]?.name ?? "item"} on the ground.`);
    game.onChange();
    return true;
  }

  static dropMat(game: Game, id: number, count = 1): boolean {
    const have = game.mats[id] ?? 0;
    if (have < count) return false;
    game.mats[id] -= count;
    if (game.mats[id] <= 0) delete game.mats[id];
    const vx = (Math.random() - 0.5) * 80;
    const vy = -160;
    game.drops.push({
      x: game.p.x,
      y: game.p.y - 15,
      vx,
      vy,
      fh: null,
      amount: count,
      t: 0,
      picked: 0,
      mat: id,
    });
    game.onChat("item", `You dropped ${MATS.get(id) ?? "material"} on the ground.`);
    game.onChange();
    return true;
  }

  static enhance(game: Game, uid: string): "success" | "fail" | "max" | "cost" | null {
    const g = InventorySystem.findGear(game, uid);
    if (!g) return null;
    if (g.star >= 15) return "max";
    const cost = starCost(g), mat = starMat(g.star);
    if (game.stats.meso < cost || (game.mats[mat] ?? 0) < 1) return "cost";
    game.stats.meso -= cost;
    game.mats[mat]--;
    const ok = Math.random() < starRate(g.star);
    if (ok) g.star++;
    game.recalc(); game.onChange();
    game.onChat(ok ? "level" : "system", ok ? `Star Force succeeded! ${GEAR.get(g.id)?.name} is now ★${g.star}.` : `Star Force failed. ${GEAR.get(g.id)?.name} stays at ★${g.star}.`);
    return ok ? "success" : "fail";
  }

  static cube(game: Game, uid: string): boolean {
    const g = InventorySystem.findGear(game, uid);
    if (!g) return false;
    const cost = cubeCost(g);
    if (game.stats.meso < cost || (game.mats[4000010] ?? 0) < 5) return false;
    game.stats.meso -= cost;
    game.mats[4000010] -= 5;
    const up = [0.3, 0.1, 0.04, 0.015, 0][g.rarity];
    const tier = Math.random() < up;
    if (tier) g.rarity++;
    g.pot = rollPotential(GEAR.get(g.id)!.slot, Math.max(1, g.rarity));
    if (g.rarity === 0) g.rarity = 1;
    game.recalc(); game.onChange();
    game.onChat(tier ? "level" : "item", tier ? `Potential tier up! ${GEAR.get(g.id)?.name} is now ${RARITY[g.rarity]}.` : `Potential reset on ${GEAR.get(g.id)?.name}.`);
    return true;
  }
}
