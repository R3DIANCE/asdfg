// Player-to-Player Auction House: displays only real player listings synchronized with the server.
import { GEAR, MAT_PRICE, MATS, USE_PRICE, gearValue, type Gear } from "./items.ts";
import { ITEMS } from "./skills.ts";

export type CurrencyType = "meso" | "nx" | "both";
export type Goods = { t: "gear"; gear: Gear } | { t: "mat"; id: number; n: number } | { t: "use"; id: number; n: number };

export interface Listing {
  lid: string;
  goods: Goods;
  price: number; // Price in Mesos (when currency is "meso" or "both")
  priceNx?: number; // Price in NX (when currency is "nx" or "both")
  currency: CurrencyType;
  durationHours: 12 | 24;
  seller: string;
  until: number;
}

export interface MyListing {
  lid: string;
  goods: Goods;
  price: number;
  priceNx?: number;
  currency: CurrencyType;
  durationHours: 12 | 24;
  listedAt: number;
  until: number;
  sold: boolean;
  soldCurrency?: "meso" | "nx";
}

export function goodsValue(g: Goods) {
  if (g.t === "gear") return gearValue(g.gear);
  if (g.t === "mat") return (MAT_PRICE[g.id] ?? 20) * g.n;
  return (USE_PRICE[g.id] ?? 30) * g.n;
}
export function goodsName(g: Goods) {
  if (g.t === "gear") return GEAR.get(g.gear.id)?.name ?? "Equipment";
  if (g.t === "mat") return `${MATS.get(g.id) ?? "Material"} ×${g.n}`;
  return `${ITEMS[g.id]?.name ?? "Item"} ×${g.n}`;
}

export class AuctionHouse {
  listings: Listing[] = [];
  mine: MyListing[] = [];
  nextRefresh = 0;
  history: number[] = [];

  constructor(public level: () => number) {}

  refresh(now: number, sellerName?: string) {
    this.listings = this.listings.filter((l) => l.until > now);
    this.nextRefresh = now + 30_000;
    const seller = sellerName || (typeof localStorage !== "undefined" ? localStorage.getItem("ms_player_name") || "" : "");
    fetch(`/api/auction/listings?seller=${encodeURIComponent(seller)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seller, mine: this.mine }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok) {
          if (Array.isArray(data.listings)) {
            this.listings = data.listings;
          }
          if (Array.isArray(data.mine) && seller) {
            this.mine = data.mine;
          }
        }
      })
      .catch(() => {});
  }

  tick(now: number, _dtSec: number): MyListing | null {
    this.listings = this.listings.filter((l) => l.until > now);
    if (now > this.nextRefresh) {
      this.refresh(now);
    }
    return null;
  }

  save() { return { mine: this.mine }; }
  restore(d: any) {
    if (d?.mine) {
      this.mine = d.mine.map((m: any) => ({
        ...m,
        currency: m.currency || "meso",
        durationHours: m.durationHours || 24,
        until: m.until || (m.listedAt + (m.durationHours || 24) * 3600_000),
      }));
    }
  }
}
export const AH_TAX = 0.05;
