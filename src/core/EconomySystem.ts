// Core Economy System — Crafting recipes, material refining, and player-to-player Auction House
import type { Game } from "../game.ts";
import { AH_TAX, goodsName, type Goods } from "../auction.ts";
import { GEAR, MATS, RARITY, makeGear, recipeGearId, type Recipe } from "../items.ts";
import { InventorySystem } from "./InventorySystem.ts";

export class EconomySystem {
  static canCraft(game: Game, r: Recipe): boolean {
    return game.stats.level >= r.level && game.stats.meso >= r.meso && r.needs.every(([id, n]) => (game.mats[id] ?? 0) >= n);
  }

  static craft(game: Game, r: Recipe): string | null {
    if (!EconomySystem.canCraft(game, r)) return null;
    for (const [id, n] of r.needs) game.mats[id] -= n;
    game.stats.meso -= r.meso;
    let msg = "";
    if (r.out.t === "mat") {
      game.mats[r.out.id] = (game.mats[r.out.id] ?? 0) + r.out.n;
      msg = `Crafted ${MATS.get(r.out.id)} ×${r.out.n}.`;
    } else if (r.out.t === "use") {
      game.inv[r.out.id] = (game.inv[r.out.id] ?? 0) + r.out.n;
      msg = `Crafted ${r.name}.`;
    } else {
      const id = recipeGearId(r.out.slot, r.out.tier);
      if (!id) return null;
      const g = makeGear(id, 1.2, 1);
      InventorySystem.addGear(game, g);
      msg = `Crafted ${RARITY[g.rarity]} ${GEAR.get(id)?.name}!`;
    }
    game.onChat("item", msg);
    game.onChange();
    return msg;
  }

  static ahBuy(game: Game, lid: string): boolean {
    const L = game.ah.listings.find((l) => l.lid === lid);
    if (!L) return false;
    if (game.stats.meso < L.price) {
      game.onChat("system", "You don't have enough mesos.");
      return false;
    }
    game.stats.meso -= L.price;
    EconomySystem.receive(game, L.goods);
    game.ah.listings = game.ah.listings.filter((l) => l !== L);
    game.onChat("item", `Bought ${goodsName(L.goods)} from ${L.seller} for ${L.price.toLocaleString()} mesos.`);
    game.onChange();
    return true;
  }

  static receive(game: Game, g: Goods) {
    if (g.t === "gear") InventorySystem.addGear(game, g.gear);
    else if (g.t === "mat") game.mats[g.id] = (game.mats[g.id] ?? 0) + g.n;
    else game.inv[g.id] = (game.inv[g.id] ?? 0) + g.n;
  }

  static ahList(game: Game, goods: Goods, price: number): boolean {
    if (goods.t === "gear") {
      const i = game.bag.findIndex((x) => x.uid === goods.gear.uid);
      if (i < 0) return false;
      game.bag.splice(i, 1);
    } else if (goods.t === "mat") {
      if ((game.mats[goods.id] ?? 0) < goods.n) return false;
      game.mats[goods.id] -= goods.n;
    } else {
      if ((game.inv[goods.id] ?? 0) < goods.n) return false;
      game.inv[goods.id] -= goods.n;
    }
    const fee = Math.ceil(price * 0.01);
    game.stats.meso = Math.max(0, game.stats.meso - fee);
    game.ah.mine.push({
      lid: `M${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      goods,
      price: Math.max(1, Math.round(price)),
      listedAt: Date.now(),
      sold: false,
    });
    game.onChat("system", `Listed ${goodsName(goods)} for ${price.toLocaleString()} mesos (fee ${fee}).`);
    game.onChange();
    return true;
  }

  static ahCollect(game: Game, lid: string) {
    const i = game.ah.mine.findIndex((m) => m.lid === lid);
    if (i < 0) return;
    const m = game.ah.mine[i];
    if (m.sold) {
      const net = Math.floor(m.price * (1 - AH_TAX));
      game.stats.meso += net;
      game.onGain("meso", `Collected ${net.toLocaleString()} mesos from the Auction House.`);
    } else {
      EconomySystem.receive(game, m.goods);
      game.onChat("system", `Cancelled your listing for ${goodsName(m.goods)}.`);
    }
    game.ah.mine.splice(i, 1);
    game.onChange();
  }
}
