// Core Inventory System — Equipment slots, visual NX equips, bag sorting, dropping items, Star Force & Potential Cubes
import type { Game } from "../game.ts";
import {
  GEAR,
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
  }

  static sortBag(game: Game, isCash = false) {
    const pool = game.bag.filter((x) => {
      const b = GEAR.get(x.id);
      return isCash ? Boolean(b?.cosmetic || b?.cash) : (!b?.cosmetic && !b?.cash);
    });
    pool.sort((a, b) => b.rarity - a.rarity || (GEAR.get(b.id)?.req ?? 0) - (GEAR.get(a.id)?.req ?? 0));
    pool.forEach((g, i) => { g.slot = i; });
    game.onChange();
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
