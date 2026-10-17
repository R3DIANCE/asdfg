// MapleStory Cash Shop — Authentic NX Boutique with Categories, Avatar Fitting Room Previews & Multi-Currency Support
import type { Game } from "../game.ts";
import { GEAR, makeGear, gearIcon, type Gear, type Slot } from "../items.ts";
import { charUrlFor } from "../game-types.ts";
import { esc, fmt, el } from "../util.ts";
import { lucideIcon } from "../lucide.ts";
import { PET_CATALOG } from "../item-browser.ts";

export type CashCategory = "featured" | "apparel" | "weapon" | "accessory" | "pet" | "special";

export interface CashItem {
  id: number;
  name: string;
  category: CashCategory;
  slot?: Slot | "pet" | "package" | "consumable";
  priceNx: number;
  desc?: string;
  isNew?: boolean;
  isHot?: boolean;
}

export const CASH_CATALOG: CashItem[] = [
  // Featured & Bundles
  { id: 1003422, name: "Garnet Raven Persona", category: "featured", slot: "hat", priceNx: 3900, isHot: true, desc: "A distinguished royal feathered crimson mask." },
  { id: 1702786, name: "Death's Scythe", category: "featured", slot: "weapon", priceNx: 6900, isHot: true, desc: "A fearsome spectral scythe that overrides any equipped weapon." },
  { id: 1103305, name: "[BTS] Swan Serenade", category: "featured", slot: "cape", priceNx: 4500, isNew: true, desc: "Graceful swan wings radiating soft pastel starlight." },
  { id: 1050305, name: "Gothic Lolita Dress", category: "featured", slot: "top", priceNx: 4200, isHot: true, desc: "An intricate gothic Victorian layered dress." },
  { id: 5000047, name: "Jr. Balrog Pet", category: "featured", slot: "pet", priceNx: 6900, isHot: true, desc: "A loyal mini demon lord pet that auto-loots items and mesos." },
  { id: 1002186, name: "Transparent Hat", category: "featured", slot: "hat", priceNx: 1500, desc: "Hides your helmet while retaining all stats." },

  // Apparel (Hats, Overalls, Tops, Bottoms, Shoes, Gloves, Capes)
  { id: 1003409, name: "Raven Persona", category: "apparel", slot: "hat", priceNx: 3200, desc: "An elegant Venetian masquerade mask." },
  { id: 1004782, name: "Phantom Raven Persona", category: "apparel", slot: "hat", priceNx: 3500, desc: "A shadowy variant worn by phantom thieves." },
  { id: 1004646, name: "Royal Azure Turban", category: "apparel", slot: "hat", priceNx: 2800, desc: "Exotic Arabian silk headdress with a glowing sapphire." },
  { id: 1002140, name: "Wizet Invincible Hat", category: "apparel", slot: "hat", priceNx: 5000, desc: "The legendary Wizet administrator cap." },
  { id: 1042003, name: "Wizet Executive Suit", category: "apparel", slot: "top", priceNx: 2500, desc: "Crisp white tailored administrative suit." },
  { id: 1062007, name: "Wizet Suit Slacks", category: "apparel", slot: "bottom", priceNx: 2200, desc: "Matching slacks for the Wizet suit." },
  { id: 1052281, name: "Bunny Onesie Outfit", category: "apparel", slot: "top", priceNx: 3800, desc: "Cozy warm bunny pajama overall." },
  { id: 1002186, name: "Transparent Hat", category: "apparel", slot: "hat", priceNx: 1500, desc: "Hides your hat." },
  { id: 1060115, name: "Transparent Bottom", category: "apparel", slot: "bottom", priceNx: 1500, desc: "Hides your pants." },
  { id: 1072153, name: "Transparent Shoes", category: "apparel", slot: "shoes", priceNx: 1500, desc: "Hides your footwear." },
  { id: 1082149, name: "Transparent Gloves", category: "apparel", slot: "gloves", priceNx: 1500, desc: "Hides your gloves." },
  { id: 1102039, name: "Transparent Cape", category: "apparel", slot: "cape", priceNx: 1800, desc: "Hides your back cape." },
  { id: 1103305, name: "[BTS] Swan Serenade Wings", category: "apparel", slot: "cape", priceNx: 4500, desc: "Enchanted swan starlight wings." },

  // Weapon Covers (All-Weapon Compatible)
  { id: 1702786, name: "Death's Scythe", category: "weapon", slot: "weapon", priceNx: 6900, isHot: true, desc: "Overrides all weapons with spectral reaping slashes." },
  { id: 1702162, name: "Cuddly Teddy Bear", category: "weapon", slot: "weapon", priceNx: 4200, desc: "Bonks monsters with an oversized plush teddy." },
  { id: 1702223, name: "Crimson Arc Saber", category: "weapon", slot: "weapon", priceNx: 5500, isNew: true, desc: "A glowing red plasma energy blade." },
  { id: 1702334, name: "Holy Starlight Wand", category: "weapon", slot: "weapon", priceNx: 5200, desc: "Glittering constellation staff with shooting stars." },
  { id: 1702450, name: "Phantom Cane of Destiny", category: "weapon", slot: "weapon", priceNx: 6000, desc: "Sleek card-wielding cane that showers ace cards on strike." },
  { id: 1702588, name: "Celestial Katana", category: "weapon", slot: "weapon", priceNx: 5800, isNew: true, desc: "Forged in moonlight with sakura petal slashes." },

  // Accessories (Face, Eye, Ring, Effects)
  { id: 1012009, name: "Kiss Mark", category: "accessory", slot: "earrings", priceNx: 1200, desc: "Cute crimson lipstick kiss on your cheek." },
  { id: 1012379, name: "Flushed Cheeks", category: "accessory", slot: "earrings", priceNx: 1500, desc: "Soft rosy anime blush effect." },
  { id: 1012569, name: "Baby Binkie", category: "accessory", slot: "earrings", priceNx: 1800, desc: "Playful pastel baby pacifier." },
  { id: 1012698, name: "Meh Expression", category: "accessory", slot: "earrings", priceNx: 1600, desc: "Unbothered deadpan facial expression." },
  { id: 1022265, name: "Black Diamond Shades", category: "accessory", slot: "earrings", priceNx: 1400, desc: "Cool dark tinted sunglasses." },
  { id: 1032052, name: "Slime Earrings", category: "accessory", slot: "earrings", priceNx: 1200, desc: "Jiggly green slime dangle earrings." },

  // Pets
  { id: 5000000, name: "Brown Kitty", category: "pet", slot: "pet", priceNx: 4900, desc: "Playful kitten companion. Automatically loots items and mesos." },
  { id: 5000001, name: "Brown Puppy", category: "pet", slot: "pet", priceNx: 4900, desc: "Loyal puppy companion that follows you everywhere." },
  { id: 5000002, name: "Pink Bunny", category: "pet", slot: "pet", priceNx: 4900, desc: "Charming hopping bunny with a cute ribbon." },
  { id: 5000003, name: "Mini Kargo", category: "pet", slot: "pet", priceNx: 5500, desc: "A fierce mini dinosaur from the deep Sleepywood dungeons." },
  { id: 5000004, name: "Black Kitty", category: "pet", slot: "pet", priceNx: 4900, desc: "Sleek and mysterious black cat companion." },
  { id: 5000006, name: "Husky", category: "pet", slot: "pet", priceNx: 5500, desc: "Fluffy arctic snow dog with intense eyes." },
  { id: 5000008, name: "Panda", category: "pet", slot: "pet", priceNx: 5500, desc: "Adorable bamboo-munching giant panda." },
  { id: 5000020, name: "Mini Yeti", category: "pet", slot: "pet", priceNx: 5900, desc: "Fluffy snow yeti from the heights of El Nath." },
  { id: 5000047, name: "Jr. Balrog", category: "pet", slot: "pet", priceNx: 6900, isHot: true, desc: "Terrifying mini Balrog that swoops to gather spoils." },
  { id: 5000054, name: "Baby Dragon", category: "pet", slot: "pet", priceNx: 7900, isHot: true, desc: "Mystical dragon hatchling with glowing scales." },

  // Special / Consumables
  { id: 2022178, name: "VIP Teleport Rock", category: "special", slot: "consumable", priceNx: 1000, desc: "Instantly teleports you to any Maple World map or continent." },
  { id: 5072000, name: "Super Megaphone", category: "special", slot: "consumable", priceNx: 500, desc: "Broadcasts your message in gold text to every player in the world." },
  { id: 5062000, name: "Miracle Cube (×10)", category: "special", slot: "consumable", priceNx: 2500, desc: "A bundle of 10 Miracle Cubes to unlock and tier up item Potentials." },
  { id: 5050000, name: "AP Reset Scroll", category: "special", slot: "consumable", priceNx: 1500, desc: "Resets all distributed Ability Points back to base stats." },
  { id: 5050001, name: "SP Reset Scroll", category: "special", slot: "consumable", priceNx: 1500, desc: "Resets all distributed Skill Points for your current class." },
];

export class CashShop {
  win: HTMLElement;
  body: HTMLElement;
  curCat: CashCategory = "featured";
  search = "";
  previewLook: number[] = [];
  triedItems: CashItem[] = [];

  constructor(public parent: any) {
    this.win = parent.makeWindow("cashshop-win", 740, 520, "CASH SHOP", Math.max(20, Math.round(innerWidth / 2 - 370)), 50);
    this.win.classList.add("cashshop");
    this.body = this.win.querySelector(".x-body") as HTMLElement;
    if (!this.body) {
      this.body = document.createElement("div");
      this.body.className = "x-body";
      this.win.appendChild(this.body);
    }

    this.win.addEventListener("click", (e) => this.onClick(e as MouseEvent));
  }

  get game(): Game {
    return this.parent.w ? this.parent.w.game : this.parent.game;
  }

  open() {
    this.previewLook = [...(this.game.look && this.game.look.length ? this.game.look : [2000, 12000, 20000, 30030])];
    this.triedItems = [];
    this.parent.toggle(this.win);
    if (!this.win.classList.contains("hidden")) {
      this.render();
    }
  }

  tryOnItem(item: CashItem) {
    if (item.category === "pet" || item.category === "special") return;

    // Detect item slot type based on ID
    const id = item.id;
    let slotType = 0; // 1: hat, 2: top/overall, 3: bottom, 4: shoes, 5: weapon, 6: cape, 7: gloves, 8: earrings/face
    if (id >= 1000000 && id < 1010000) slotType = 1; // Hat
    else if (id >= 1010000 && id < 1040000) slotType = 8; // Face / eye / earrings
    else if (id >= 1040000 && id < 1050000) slotType = 2; // Top
    else if (id >= 1050000 && id < 1060000) slotType = 20; // Overall
    else if (id >= 1060000 && id < 1070000) slotType = 3; // Bottom
    else if (id >= 1070000 && id < 1080000) slotType = 4; // Shoes
    else if (id >= 1080000 && id < 1090000) slotType = 7; // Gloves
    else if (id >= 1100000 && id < 1110000) slotType = 6; // Cape
    else if (id >= 1700000 && id < 1800000) slotType = 5; // Cash Weapon cover

    // Filter out old equipment of matching slot
    let newLook = this.previewLook.filter((x) => {
      if (slotType === 1 && x >= 1000000 && x < 1010000) return false;
      if (slotType === 8 && x >= 1010000 && x < 1040000) return false;
      if (slotType === 2 && x >= 1040000 && x < 1060000) return false;
      if (slotType === 20 && x >= 1040000 && x < 1070000) return false;
      if (slotType === 3 && (x >= 1060000 && x < 1070000 || (x >= 1050000 && x < 1060000))) return false;
      if (slotType === 4 && x >= 1070000 && x < 1080000) return false;
      if (slotType === 7 && x >= 1080000 && x < 1090000) return false;
      if (slotType === 6 && x >= 1100000 && x < 1110000) return false;
      if (slotType === 5 && (x >= 1300000 && x < 1800000)) return false;
      return true;
    });

    newLook.push(id);
    this.previewLook = newLook;

    if (!this.triedItems.some((x) => x.id === item.id)) {
      this.triedItems.push(item);
    }

    this.updatePreviewAvatar();
  }

  clearFittingRoom() {
    this.previewLook = [...(this.game.look && this.game.look.length ? this.game.look : [2000, 12000, 20000, 30030])];
    this.triedItems = [];
    this.updatePreviewAvatar();
  }

  removeTriedItem(id: number) {
    this.previewLook = this.previewLook.filter((x) => x !== id);
    this.triedItems = this.triedItems.filter((x) => x.id !== id);
    this.updatePreviewAvatar();
  }

  updatePreviewAvatar() {
    const img = this.body.querySelector<HTMLImageElement>(".cs-mannequin-img");
    if (img) {
      img.src = charUrlFor(this.previewLook, "stand1", 0);
    }
    const triedList = this.body.querySelector<HTMLElement>(".cs-tried-list");
    if (triedList) {
      if (!this.triedItems.length) {
        triedList.innerHTML = `<span class="text-[9.5px] text-zinc-400 italic">No items tried on. Click "Try On" on any item!</span>`;
      } else {
        triedList.innerHTML = this.triedItems.map((item) => `
          <div class="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-zinc-200">
            <span class="truncate">${esc(item.name)}</span>
            <button type="button" class="text-rose-400 hover:text-rose-300 font-bold px-1" data-act="cs-remove-tried" data-id="${item.id}">✕</button>
          </div>
        `).join("");
      }
    }
  }

  buyItem(item: CashItem) {
    const g = this.game;
    const nx = g.stats.nx ?? 0;
    if (nx < item.priceNx) {
      alert(`You do not have enough NX to purchase ${item.name}!\n\nYour Balance: ${nx.toLocaleString()} NX\nRequired: ${item.priceNx.toLocaleString()} NX\n\nClick "+ 10,000 NX" at the top to charge free testing NX!`);
      return;
    }

    g.stats.nx = nx - item.priceNx;

    if (item.category === "pet") {
      g.equipPet(item.id);
    } else if (item.category === "special") {
      g.inv[item.id] = (g.inv[item.id] ?? 0) + (item.id === 5062000 ? 10 : 1);
    } else {
      // Create cash equipment
      const gear: Gear = {
        ...makeGear(item.id, 1, 0),
        cash: true,
        cosmetic: true,
      };

      // Add to bag
      g.bag.push(gear);

      // Option to immediately equip to visual cosmetics
      if (item.slot && item.slot !== "consumable" && item.slot !== "package" && item.slot !== "pet") {
        g.visualEq[item.slot as Slot] = gear;
      }
    }

    g.onChange();
    this.render();
  }

  chargeFreeNx(amount = 10000) {
    const g = this.game;
    g.stats.nx = (g.stats.nx ?? 0) + amount;
    g.onChange();
    this.render();
  }

  onClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!t) return;
    const act = t.dataset.act;

    if (act === "cs-cat") {
      this.curCat = (t.dataset.cat as CashCategory) || "featured";
      this.render();
    } else if (act === "cs-try") {
      const id = Number(t.dataset.id);
      const item = CASH_CATALOG.find((x) => x.id === id);
      if (item) this.tryOnItem(item);
    } else if (act === "cs-buy") {
      const id = Number(t.dataset.id);
      const item = CASH_CATALOG.find((x) => x.id === id);
      if (item) {
        if (confirm(`Purchase ${item.name} for ${item.priceNx.toLocaleString()} NX?`)) {
          this.buyItem(item);
        }
      }
    } else if (act === "cs-clear-tried") {
      this.clearFittingRoom();
    } else if (act === "cs-remove-tried") {
      const id = Number(t.dataset.id);
      this.removeTriedItem(id);
    } else if (act === "cs-charge-nx") {
      this.chargeFreeNx(10000);
    }
  }

  render() {
    const g = this.game;
    const nx = g.stats.nx ?? 50000;
    const meso = g.stats.meso ?? 0;

    const categories: { key: CashCategory; label: string; icon: string }[] = [
      { key: "featured", label: "FEATURED", icon: "sparkles" },
      { key: "apparel", label: "APPAREL", icon: "shirt" },
      { key: "weapon", label: "WEAPONS", icon: "swords" },
      { key: "accessory", label: "ACCESSORIES", icon: "sparkle" },
      { key: "pet", label: "PETS", icon: "heart" },
      { key: "special", label: "SPECIAL", icon: "box" },
    ];

    const tabsHtml = categories.map((c) => `
      <button type="button" class="px-2.5 py-1 text-[10px] font-bold rounded flex items-center gap-1.5 transition-all ${
        this.curCat === c.key
          ? "bg-gradient-to-r from-pink-600 to-rose-500 text-white shadow-md shadow-pink-500/20"
          : "text-zinc-300 hover:text-white hover:bg-white/5"
      }" data-act="cs-cat" data-cat="${c.key}">
        ${lucideIcon(c.icon as any, 11)}
        <span>${c.label}</span>
      </button>
    `).join("");

    // Filter items
    let items = CASH_CATALOG.filter((x) => x.category === this.curCat);
    if (this.search) {
      const q = this.search.toLowerCase();
      items = CASH_CATALOG.filter((x) => x.name.toLowerCase().includes(q));
    }

    const itemsGridHtml = items.map((item) => {
      const iconUrl = item.category === "pet" ? `/wz/item/${item.id}/icon` : gearIcon(item.id);
      const isAffordable = nx >= item.priceNx;

      return `
        <div class="cs-item-card relative bg-zinc-900/90 border border-white/10 hover:border-pink-500/40 rounded-lg p-2 flex flex-col justify-between shadow-lg transition-all group hover:scale-[1.01]">
          ${item.isHot ? `<span class="absolute top-1.5 right-1.5 px-1 py-0.2 rounded bg-rose-500 text-white font-bold text-[7.5px] tracking-wider uppercase shadow">HOT</span>` : ""}
          ${item.isNew ? `<span class="absolute top-1.5 right-1.5 px-1 py-0.2 rounded bg-sky-500 text-white font-bold text-[7.5px] tracking-wider uppercase shadow">NEW</span>` : ""}
          
          <div>
            <div class="flex items-center gap-2 mb-1.5">
              <div class="w-10 h-10 rounded-md bg-black/50 border border-white/10 flex items-center justify-center flex-shrink-0 p-1 group-hover:border-pink-400/30 transition-colors">
                <img src="${iconUrl}" class="max-w-full max-h-full object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" alt="" onerror="this.src='/wz/item/1002140/icon'" />
              </div>
              <div class="min-w-0 flex-1">
                <h4 class="font-bold text-[10.5px] text-white truncate group-hover:text-pink-300 transition-colors" title="${esc(item.name)}">${esc(item.name)}</h4>
                <span class="text-[8.5px] font-mono text-pink-300/80 uppercase font-semibold">${item.slot || item.category}</span>
              </div>
            </div>
            ${item.desc ? `<p class="text-[8px] text-zinc-400 line-clamp-2 mb-2 leading-snug">${esc(item.desc)}</p>` : ""}
          </div>

          <div class="pt-1.5 border-t border-white/5 flex items-center justify-between gap-1 mt-auto">
            <div class="flex flex-col">
              <span class="text-[7.5px] text-zinc-400 font-semibold leading-none">PRICE</span>
              <span class="font-mono font-bold text-[10px] text-amber-300 leading-tight">${fmt(item.priceNx)} <small class="text-[7.5px] text-pink-400">NX</small></span>
            </div>
            <div class="flex items-center gap-1">
              ${item.category !== "pet" && item.category !== "special" ? `
                <button type="button" class="px-1.5 py-1 rounded bg-white/10 hover:bg-white/20 text-zinc-200 text-[8.5px] font-bold border border-white/10 transition-colors cursor-pointer" data-act="cs-try" data-id="${item.id}" title="Try on in Fitting Room">
                  Try On
                </button>
              ` : ""}
              <button type="button" class="px-2 py-1 rounded ${isAffordable ? "bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white shadow-sm shadow-pink-500/20" : "bg-zinc-800 text-zinc-500 cursor-not-allowed"} text-[8.5px] font-bold transition-all cursor-pointer" data-act="cs-buy" data-id="${item.id}" ${isAffordable ? "" : "title='Not enough NX'"}>
                Buy
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    this.body.innerHTML = `
      <div class="flex flex-col h-full bg-zinc-950/95 text-white select-none box-border p-2.5 gap-2.5">
        <!-- Top Cash Shop Header (Logo, Search, NX Currency Balance & Charge Button) -->
        <div class="flex items-center justify-between pb-2 border-b border-white/10 gap-3">
          <div class="flex items-center gap-2 flex-shrink-0">
            <div class="w-6 h-6 rounded-md bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-md shadow-pink-500/30">
              ${lucideIcon("gem", 14)}
            </div>
            <div>
              <h2 class="font-bold text-[13px] text-white leading-none tracking-wide flex items-center gap-1.5 font-sans">
                MAPLE CASH SHOP
                <span class="text-[8px] font-mono px-1 py-0.2 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">NX BOUTIQUE</span>
              </h2>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <!-- Search bar -->
            <div class="relative w-44">
              <input type="text" placeholder="Search NX items..." value="${esc(this.search)}" class="cs-search-input w-full bg-zinc-900/90 border border-white/15 rounded-md px-2 py-1 text-[9.5px] text-white placeholder-zinc-500 focus:outline-none focus:border-pink-500 transition-colors" />
            </div>

            <!-- Currency Wallets -->
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-pink-950/40 border border-pink-500/30 shadow-inner">
                <span class="text-pink-400 font-bold text-[10px] font-mono">NX</span>
                <span class="font-mono font-bold text-[11px] text-pink-200">${fmt(nx)}</span>
              </div>
              <div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/40 border border-white/10 text-zinc-300">
                <span class="text-amber-400 font-bold text-[9px] font-mono">M</span>
                <span class="font-mono text-[10px] text-zinc-200">${fmt(meso)}</span>
              </div>
              <button type="button" class="px-2 py-1 rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold text-[9px] flex items-center gap-1 border border-emerald-400/30 shadow-sm shadow-emerald-500/20 transition-all cursor-pointer" data-act="cs-charge-nx" title="Charge +10,000 Free NX for testing">
                ${lucideIcon("plus-circle", 11)} +10K NX
              </button>
            </div>
          </div>
        </div>

        <!-- Main Body: Left Fitting Room / Mannequin + Right Catalog -->
        <div class="flex-1 flex gap-2.5 min-h-0">
          <!-- Left: Avatar Fitting Room -->
          <div class="w-[200px] flex-shrink-0 flex flex-col justify-between bg-zinc-900/90 border border-white/10 rounded-lg p-2.5 shadow-lg">
            <div>
              <div class="flex items-center justify-between pb-1.5 mb-2 border-b border-white/10">
                <span class="font-bold text-[10px] text-pink-300 uppercase tracking-wider flex items-center gap-1 font-sans">
                  ${lucideIcon("sparkles", 11, "text-pink-400")} Fitting Room
                </span>
                <button type="button" class="text-[8.5px] text-zinc-400 hover:text-white underline cursor-pointer" data-act="cs-clear-tried" title="Reset to your current equipped look">
                  Reset
                </button>
              </div>

              <!-- Mannequin Avatar Box -->
              <div class="w-full h-[180px] rounded-lg bg-gradient-to-b from-zinc-900/80 to-zinc-950/90 border border-white/10 shadow-inner flex items-center justify-center relative overflow-hidden mb-2">
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(244,63,94,0.1)_0%,transparent_70%)] pointer-events-none"></div>
                <img src="${charUrlFor(this.previewLook, "stand1", 0)}" class="cs-mannequin-img max-w-[130px] max-h-[140px] object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)]" style="image-rendering: pixelated; transform: scale(1.4);" alt="Preview Avatar" />
              </div>

              <!-- Tried On Items List -->
              <div class="flex flex-col gap-1">
                <span class="text-[8.5px] font-bold text-zinc-400 uppercase tracking-wider">Previewed Pieces (${this.triedItems.length})</span>
                <div class="cs-tried-list flex flex-col gap-1 max-h-[110px] overflow-y-auto pr-0.5">
                  ${!this.triedItems.length ? `<span class="text-[9px] text-zinc-500 italic">Try on items from the catalog!</span>` : this.triedItems.map((item) => `
                    <div class="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-zinc-200">
                      <span class="truncate">${esc(item.name)}</span>
                      <button type="button" class="text-rose-400 hover:text-rose-300 font-bold px-1" data-act="cs-remove-tried" data-id="${item.id}">✕</button>
                    </div>
                  `).join("")}
                </div>
              </div>
            </div>

            <div class="pt-2 border-t border-white/10">
              <button type="button" class="w-full py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-zinc-300 font-bold text-[9px] transition-colors cursor-pointer" data-act="cs-clear-tried">
                Clear Fitting Room
              </button>
            </div>
          </div>

          <!-- Right: Categories & Items Catalog -->
          <div class="flex-1 flex flex-col min-w-0 bg-zinc-900/60 border border-white/10 rounded-lg p-2.5 shadow-lg">
            <!-- Category Tabs -->
            <div class="flex items-center gap-1 pb-2 border-b border-white/10 overflow-x-auto mb-2">
              ${tabsHtml}
            </div>

            <!-- Items Grid -->
            <div class="cs-items-grid flex-1 overflow-y-auto grid grid-cols-3 gap-2 pr-1 content-start">
              ${itemsGridHtml || `<div class="col-span-3 text-center py-12 text-zinc-500 text-[11px] italic">No NX items found in this category.</div>`}
            </div>
          </div>
        </div>
      </div>
    `;

    // Search input listener
    const searchInput = this.body.querySelector<HTMLInputElement>(".cs-search-input");
    searchInput?.addEventListener("input", (e) => {
      this.search = (e.target as HTMLInputElement).value;
      this.render();
      const updated = this.body.querySelector<HTMLInputElement>(".cs-search-input");
      if (updated) {
        updated.focus();
        updated.setSelectionRange(this.search.length, this.search.length);
      }
    });
  }
}
