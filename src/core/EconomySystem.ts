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

  static ahBuy(game: Game, lid: string, payWith?: "meso" | "nx"): boolean {
    const L = game.ah.listings.find((l) => l.lid === lid);
    if (!L) return false;
    if (L.seller && game.stats.name && L.seller.toLowerCase() === game.stats.name.toLowerCase()) {
      game.onChat("system", "You cannot buy your own listing. Cancel it in MY LISTINGS.");
      return false;
    }

    let useCurrency: "meso" | "nx" = "meso";
    if (L.currency === "nx") {
      useCurrency = "nx";
    } else if (L.currency === "both") {
      if (payWith === "nx" || (game.stats.meso < L.price && (game.stats.nx ?? 0) >= (L.priceNx ?? 0))) {
        useCurrency = "nx";
      } else {
        useCurrency = "meso";
      }
    }

    if (useCurrency === "nx") {
      const costNx = L.priceNx ?? L.price;
      if ((game.stats.nx ?? 0) < costNx) {
        game.onChat("system", "You don't have enough NX.");
        return false;
      }
      game.stats.nx = (game.stats.nx ?? 0) - costNx;
      EconomySystem.receive(game, L.goods);
      game.ah.listings = game.ah.listings.filter((l) => l !== L);
      game.onChat("item", `Bought ${goodsName(L.goods)} from ${L.seller} for ${costNx.toLocaleString()} NX.`);
    } else {
      if (game.stats.meso < L.price) {
        game.onChat("system", "You don't have enough mesos.");
        return false;
      }
      game.stats.meso -= L.price;
      EconomySystem.receive(game, L.goods);
      game.ah.listings = game.ah.listings.filter((l) => l !== L);
      game.onChat("item", `Bought ${goodsName(L.goods)} from ${L.seller} for ${L.price.toLocaleString()} mesos.`);
    }

    fetch("/api/auction/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lid,
        buyer: game.stats.name,
        payWith: useCurrency,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok) {
          if (Array.isArray(data.listings)) game.ah.listings = data.listings;
          game.onChange();
        }
      })
      .catch(() => {});

    game.onChange();
    return true;
  }

  static receive(game: Game, g: Goods) {
    if (g.t === "gear") InventorySystem.addGear(game, g.gear);
    else if (g.t === "mat") game.mats[g.id] = (game.mats[g.id] ?? 0) + g.n;
    else game.inv[g.id] = (game.inv[g.id] ?? 0) + g.n;
  }

  static ahList(
    game: Game,
    goods: Goods,
    priceMeso: number,
    priceNx?: number,
    currency: "meso" | "nx" | "both" = "meso",
    durationHours: 12 | 24 = 24
  ): boolean {
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

    const fee = currency === "nx" ? 100 : Math.ceil(priceMeso * 0.01);
    if (currency === "nx") {
      game.stats.nx = Math.max(0, (game.stats.nx ?? 0) - fee);
    } else {
      game.stats.meso = Math.max(0, game.stats.meso - fee);
    }

    const now = Date.now();
    const lid = `M${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const cleanPrice = Math.max(1, Math.round(priceMeso || 1));
    const cleanPriceNx = priceNx ? Math.max(1, Math.round(priceNx)) : undefined;
    const until = now + durationHours * 3600_000;

    const myEntry = {
      lid,
      goods,
      price: cleanPrice,
      priceNx: cleanPriceNx,
      currency,
      durationHours,
      listedAt: now,
      until,
      sold: false,
    };
    game.ah.mine.unshift(myEntry);
    game.ah.listings.push({
      lid,
      goods,
      price: cleanPrice,
      priceNx: cleanPriceNx,
      currency,
      durationHours,
      seller: game.stats.name,
      until,
    });
    game.ah.listings.sort((a, b) => a.price - b.price);

    fetch("/api/auction/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lid,
        seller: game.stats.name,
        goods,
        price: cleanPrice,
        priceNx: cleanPriceNx,
        currency,
        durationHours,
        listedAt: now,
        until,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok) {
          if (Array.isArray(data.listings)) game.ah.listings = data.listings;
          if (Array.isArray(data.mine)) game.ah.mine = data.mine;
          game.onChange();
        }
      })
      .catch(() => {});

    const priceLabel = currency === "both"
      ? `${priceMeso.toLocaleString()} mesos / ${(priceNx ?? 0).toLocaleString()} NX`
      : currency === "nx"
      ? `${(priceNx ?? priceMeso).toLocaleString()} NX`
      : `${priceMeso.toLocaleString()} mesos`;

    game.onChat("system", `Listed ${goodsName(goods)} for ${priceLabel} (${durationHours}h duration).`);
    game.onChange();
    return true;
  }

  static ahCollect(game: Game, lid: string) {
    const i = game.ah.mine.findIndex((m) => m.lid === lid);
    if (i < 0) return;
    const m = game.ah.mine[i];
    if (m.sold) {
      if (m.soldCurrency === "nx" || (!m.soldCurrency && m.currency === "nx")) {
        const netNx = Math.floor((m.priceNx ?? m.price) * (1 - AH_TAX));
        game.stats.nx = (game.stats.nx ?? 0) + netNx;
        game.onChat("notice", `★ [Auction House] Collected ${netNx.toLocaleString()} NX!`);
      } else {
        const netMeso = Math.floor(m.price * (1 - AH_TAX));
        game.stats.meso += netMeso;
        game.onGain("meso", `Collected ${netMeso.toLocaleString()} mesos from the Auction House.`);
      }
    } else {
      EconomySystem.receive(game, m.goods);
      const isExpired = m.until && Date.now() > m.until;
      game.onChat("system", isExpired ? `Retrieved expired listing for ${goodsName(m.goods)}.` : `Cancelled listing for ${goodsName(m.goods)}.`);
    }
    game.ah.mine.splice(i, 1);
    game.ah.listings = game.ah.listings.filter((l) => l.lid !== lid);

    fetch("/api/auction/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lid,
        seller: game.stats.name,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok) {
          if (Array.isArray(data.listings)) game.ah.listings = data.listings;
          if (Array.isArray(data.mine)) game.ah.mine = data.mine;
          game.onChange();
        }
      })
      .catch(() => {});

    game.onChange();
  }
}
