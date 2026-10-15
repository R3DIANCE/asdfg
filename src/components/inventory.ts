// Modular Inventory Component — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
// Exact match to QuickBar style (dark steel slate, glassmorphism, quick-slot cell borders & key badges)
import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import type { Windows } from "../windows.ts";
import type { ExtWindows } from "../windows2.ts";
import {
  GEAR, MATS, gearIcon, matIcon, npcSellPrice, type Gear,
} from "../items.ts";
import { ITEMS, itemIcon } from "../skills.ts";
import { renderGearTooltip, renderUseTooltip, renderMatTooltip } from "../tooltip.ts";
import { el, fmt, esc, icon } from "../util.ts";
import { lucideIcon } from "../lucide.ts";

export interface InventoryParam {
  windowEl: HTMLElement;
  game: Game;
  windows: Windows;
  ext: ExtWindows;
}

export type InventoryTab = "equip" | "use" | "etc" | "setup" | "cash" | "dec";

export class InventoryComponent extends ComponentBase {
  public windowEl!: HTMLElement;
  public body!: HTMLElement;
  public game!: Game;
  public windows!: Windows;
  public ext!: ExtWindows;
  private lastSig = "";

  constructor(param?: InventoryParam) {
    super();
    if (param) {
      this.initParam(param);
    }
  }

  public override init(param?: InventoryParam): void {
    super.init(param);
    if (param) {
      this.initParam(param);
    }
  }

  private initParam(param: InventoryParam) {
    this.windowEl = param.windowEl;
    this.game = param.game;
    this.windows = param.windows;
    this.ext = param.ext;
    let b = this.windowEl.querySelector(".x-body") as HTMLElement;
    if (!b) {
      b = el("div", "x-body", this.windowEl);
    }
    this.body = b;
  }

  public override start(): void {
    // Orillusion lifecycle start hook
    this.render();
  }

  public override onUpdate(): void {
    // Orillusion lifecycle per-frame update hook
    if (!this.windowEl || this.windowEl.classList.contains("hidden")) return;
    const g = this.game;
    const sig = `${this.ext.invTab.cur}|${g.bag.length}|${g.bag.map((b) => b.uid + b.star + b.rarity).join()}|${g.stats.meso}|${this.ext.invSearch}`;
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.render();
    }
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
    this.body.innerHTML = "";
  }

  public render(): void {
    if (!this.body) return;
    const g = this.game;
    const tab = this.ext.invTab.cur;
    const q = this.ext.invSearch.trim().toLowerCase();

    // Category Tabs styled in the exact quick-slot button style
    const tabList: { id: InventoryTab; label: string; badge?: string; badgeColor?: string }[] = [
      { id: "equip", label: "Equip", badge: "EQ", badgeColor: "badge-blue" },
      { id: "use", label: "Use", badge: "USE", badgeColor: "badge-green" },
      { id: "etc", label: "Etc.", badge: "ETC", badgeColor: "badge-orange" },
      { id: "setup", label: "Set-up", badge: "SET", badgeColor: "badge-yellow" },
      { id: "cash", label: "Cash", badge: "NX", badgeColor: "badge-red" },
      { id: "dec", label: "Dec.", badge: "DEC", badgeColor: "badge-purple" },
    ];

    const tabsHtml = tabList.map((t) => {
      const isActive = t.id === tab;
      return `
        <button type="button" data-act="invtab" data-v="${t.id}"
          class="inv-tab-pill relative px-2.5 py-1 bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 hover:border-[#9ca8b8]/70 rounded-[3px] text-slate-200 hover:text-white font-bold text-[10px] select-none backdrop-blur-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] transition-all cursor-pointer ${isActive ? "on bg-[#0ea5e9]/25 border-[#38bdf8] text-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.3)]" : ""}">
          <span>${t.label}</span>
          ${t.badge ? `<span class="slot-badge ${t.badgeColor} ml-1 text-[6px] px-1 py-0.2 rounded-[2px] leading-tight font-black uppercase">${t.badge}</span>` : ""}
        </button>
      `;
    }).join("");

    let gridHtml = "";
    let curCount = 0;

    // Render Slots based on active tab
    if (tab === "equip") {
      let bag = [...g.bag].sort((a, b) => b.rarity - a.rarity || (GEAR.get(b.id)?.req ?? 0) - (GEAR.get(a.id)?.req ?? 0));
      if (q) bag = bag.filter((it) => (GEAR.get(it.id)?.name ?? "").toLowerCase().includes(q));
      curCount = bag.length;

      for (const it of bag) {
        const note = `Click to equip · right-click to sell (${fmt(npcSellPrice(it))} mesos)`;
        gridHtml += this.renderGearCell(it, "equip", note);
      }
      const targetPad = Math.max(32, Math.ceil(bag.length / 8) * 8 + 8);
      for (let i = bag.length; i < targetPad; i++) {
        gridHtml += `<div class="gcell slot blank relative w-[38px] h-[38px] bg-[#242c38]/45 border border-[#9ca8b8]/15 rounded-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] cursor-default select-none"></div>`;
      }
    } else if (tab === "use") {
      let ids = Object.keys(ITEMS).map(Number).filter((id) => (g.inv[id] ?? 0) > 0);
      if (q) ids = ids.filter((id) => (ITEMS[id]?.name ?? "").toLowerCase().includes(q));
      curCount = ids.length;

      for (const id of ids) {
        const it = ITEMS[id];
        const isThrowable = it?.type === "star" || it?.type === "arrow" || it?.type === "bullet";
        const countHtml = isThrowable ? `<span class="slot-count absolute right-[2px] bottom-[1px] font-bold text-[8.5px] leading-[10px] text-white drop-shadow-[0_1px_2px_#000] pointer-events-none z-[4]">∞</span>` : `<span class="slot-count absolute right-[2px] bottom-[1px] font-bold text-[8.5px] leading-[10px] text-white drop-shadow-[0_1px_2px_#000] pointer-events-none z-[4]">${g.inv[id]}</span>`;
        const tipKey = "u" + id;
        this.ext.tips.set(tipKey, () => renderUseTooltip(id, g.inv[id] ?? 0));
        gridHtml += `
          <div class="gcell slot relative w-[38px] h-[38px] bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 hover:border-[#9ca8b8]/70 rounded-[3px] cursor-pointer select-none backdrop-blur-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] transition-all flex items-center justify-center"
            data-use="${id}" data-tip="${tipKey}">
            <div class="slot-icon absolute inset-[2px] bg-center bg-no-repeat bg-contain [image-rendering:pixelated] z-[2]" style="background-image: url('${itemIcon(id)}');"></div>
            ${countHtml}
          </div>
        `;
      }
      const targetPad = Math.max(32, Math.ceil(ids.length / 8) * 8 + 8);
      for (let i = ids.length; i < targetPad; i++) {
        gridHtml += `<div class="gcell slot blank relative w-[38px] h-[38px] bg-[#242c38]/45 border border-[#9ca8b8]/15 rounded-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] cursor-default select-none"></div>`;
      }
    } else if (tab === "etc") {
      let entries = Object.entries(g.mats).filter(([_, n]) => n > 0);
      if (q) entries = entries.filter(([id]) => (MATS.get(+id) ?? "").toLowerCase().includes(q));
      curCount = entries.length;

      for (const [idStr, n] of entries) {
        const id = +idStr;
        const tipKey = "m" + id;
        this.ext.tips.set(tipKey, () => renderMatTooltip(id, n));
        gridHtml += `
          <div class="gcell slot relative w-[38px] h-[38px] bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 hover:border-[#9ca8b8]/70 rounded-[3px] cursor-pointer select-none backdrop-blur-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] transition-all flex items-center justify-center"
            data-tip="${tipKey}">
            <div class="slot-icon absolute inset-[2px] bg-center bg-no-repeat bg-contain [image-rendering:pixelated] z-[2]" style="background-image: url('${matIcon(id)}');"></div>
            <span class="slot-count absolute right-[2px] bottom-[1px] font-bold text-[8.5px] leading-[10px] text-white drop-shadow-[0_1px_2px_#000] pointer-events-none z-[4]">${n}</span>
          </div>
        `;
      }
      const targetPad = Math.max(32, Math.ceil(entries.length / 8) * 8 + 8);
      for (let i = entries.length; i < targetPad; i++) {
        gridHtml += `<div class="gcell slot blank relative w-[38px] h-[38px] bg-[#242c38]/45 border border-[#9ca8b8]/15 rounded-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] cursor-default select-none"></div>`;
      }
    } else if (tab === "cash" || tab === "dec") {
      let bag = g.bag.filter((it) => {
        const b = GEAR.get(it.id);
        return Boolean(b?.cosmetic || b?.cash);
      });
      if (q) bag = bag.filter((it) => (GEAR.get(it.id)?.name ?? "").toLowerCase().includes(q));
      curCount = bag.length;

      for (const it of bag) {
        gridHtml += this.renderGearCell(it, "equip-visual", `Click to equip visual costume · right-click to sell (${fmt(npcSellPrice(it))} mesos)`);
      }
      const targetPad = Math.max(32, Math.ceil(bag.length / 8) * 8 + 8);
      for (let i = bag.length; i < targetPad; i++) {
        gridHtml += `<div class="gcell slot blank relative w-[38px] h-[38px] bg-[#242c38]/45 border border-[#9ca8b8]/15 rounded-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] cursor-default select-none"></div>`;
      }
    } else {
      for (let i = 0; i < 32; i++) {
        gridHtml += `<div class="gcell slot blank relative w-[38px] h-[38px] bg-[#242c38]/45 border border-[#9ca8b8]/15 rounded-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] cursor-default select-none"></div>`;
      }
    }

    this.body.innerHTML = `
      <div class="inv-header-bar flex items-center justify-between pb-1 mb-1 border-b border-[#9ca8b8]/20">
        <div class="inv-tabs flex items-center gap-1">${tabsHtml}</div>
        <div class="inv-slot-top-badge bg-[#242c38]/85 border border-[#9ca8b8]/35 rounded-[3px] px-2 py-0.5 font-bold text-[9px] text-slate-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] select-none">
          SLOT <span class="slot-active text-cyan-400 font-black">${curCount}</span> / ∞
        </div>
      </div>

      <div class="inv-sub-bar flex items-center justify-between mb-1.5">
        <div class="inv-sub-actions flex items-center gap-1.5">
          <button type="button" class="inv-pill-btn cyan px-2 py-0.5 bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 hover:border-[#9ca8b8]/70 rounded-[3px] text-[10px] font-bold text-white flex items-center gap-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] cursor-pointer" data-act="sort">
            <span class="inv-ico">${lucideIcon("sort", 12)}</span> Sort
          </button>
          <button type="button" class="inv-pill-btn slate px-2 py-0.5 bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 hover:border-[#9ca8b8]/70 rounded-[3px] text-[10px] font-bold text-slate-300 flex items-center gap-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] cursor-pointer" data-act="lock">
            <span class="inv-ico">${lucideIcon("lock", 12)}</span> Lock
          </button>
        </div>
        <div class="inv-plus-slot px-2 py-0.5 bg-[#0284c7]/80 text-white rounded-[3px] font-black text-[9px] border border-[#38bdf8]/50 shadow-[0_1px_3px_rgba(0,0,0,0.4)] select-none" title="Infinite Bag Storage Enabled">
          ∞ SLOTS
        </div>
      </div>

      <div class="inv-grid-wrap flex-1 bg-[#18202c]/90 border border-[#9ca8b8]/30 rounded-[4px] p-1.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col">
        <div class="inv-grid grid grid-cols-8 gap-[3px] w-full flex-1 overflow-y-auto align-content-start pr-0.5">
          ${gridHtml}
        </div>
      </div>

      <div class="inv-finance-row flex items-center justify-between mt-2 pt-1.5 border-t border-[#9ca8b8]/20">
        <div class="flex items-center gap-2">
          <div class="inv-meso-badge bg-[#242c38]/85 border border-[#9ca8b8]/35 rounded-[4px] px-2.5 py-1 text-[#facc15] font-mono text-[10px] font-bold flex items-center gap-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] select-none">
            <span class="coin-dot gold flex items-center">${lucideIcon("coins", 13)}</span> ${fmt(g.stats.meso || 0)} ⛃
          </div>
          <div class="inv-points-badge bg-[#242c38]/85 border border-[#9ca8b8]/35 rounded-[4px] px-2.5 py-1 text-slate-200 font-mono text-[10px] font-bold flex items-center gap-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] select-none">
            <span class="coin-dot silver flex items-center">${lucideIcon("star", 12)}</span> 5,100 ★
          </div>
        </div>
        <div class="inv-actions-right flex items-center gap-1.5">
          <button type="button" class="inv-action-btn slate px-2 py-1 bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 rounded-[3px] text-[10px] font-bold text-slate-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] cursor-pointer" data-act="selljunk">Extract</button>
          <button type="button" class="inv-action-btn cyan px-2.5 py-1 bg-[#0284c7]/80 hover:bg-[#0369a1] border border-[#38bdf8]/50 rounded-[3px] text-[10px] font-bold text-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] cursor-pointer" data-act="crafttab" data-v="star">Transfer</button>
          <button type="button" class="inv-action-btn cyan px-2.5 py-1 bg-[#0284c7]/80 hover:bg-[#0369a1] border border-[#38bdf8]/50 rounded-[3px] text-[10px] font-bold text-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] cursor-pointer" data-act="crafttab" data-v="star">Enhance</button>
        </div>
      </div>

      <div class="inv-quick-footer flex flex-col gap-1.5 mt-2 pt-1.5 border-t border-[#9ca8b8]/20">
        <div class="inv-search-box relative w-full">
          <input type="text" placeholder="Search inventory items..." class="inv-search-input w-full h-[22px] bg-[#1a222d]/90 border border-[#9ca8b8]/35 rounded-[3px] text-white text-[10px] px-2 pr-7 outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] focus:border-[#38bdf8]" value="${esc(this.ext.invSearch)}" />
          <span class="inv-search-icon absolute right-2 top-1 text-slate-400 pointer-events-none">${lucideIcon("search", 13)}</span>
        </div>
        <div class="inv-footer-buttons flex gap-1 justify-between">
          <button type="button" class="inv-foot-btn flex-1 py-1 bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 rounded-[3px] text-[9.5px] font-bold text-slate-200 hover:text-white flex items-center justify-center gap-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] cursor-pointer" data-act="open-equip">${lucideIcon("equip", 12)} Equip</button>
          <button type="button" class="inv-foot-btn flex-1 py-1 bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 rounded-[3px] text-[9.5px] font-bold text-slate-200 hover:text-white flex items-center justify-center gap-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] cursor-pointer" data-act="open-shop">${lucideIcon("shop", 12)} Shop</button>
          <button type="button" class="inv-foot-btn flex-1 py-1 bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 rounded-[3px] text-[9.5px] font-bold text-slate-200 hover:text-white flex items-center justify-center gap-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] cursor-pointer" data-act="open-storage">${lucideIcon("storage", 12)} Storage</button>
          <button type="button" class="inv-foot-btn flex-1 py-1 bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 rounded-[3px] text-[9.5px] font-bold text-slate-200 hover:text-white flex items-center justify-center gap-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] cursor-pointer" data-act="open-boss">${lucideIcon("boss", 12)} Boss</button>
          <button type="button" class="inv-foot-btn flex-1 py-1 bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 rounded-[3px] text-[9.5px] font-bold text-slate-200 hover:text-white flex items-center justify-center gap-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] cursor-pointer" data-act="open-bag">${lucideIcon("bag", 12)} Bag</button>
        </div>
      </div>
    `;

    // Search input listener
    const searchInp = this.body.querySelector(".inv-search-input") as HTMLInputElement;
    if (searchInp) {
      searchInp.addEventListener("input", () => {
        this.ext.invSearch = searchInp.value;
        const pos = searchInp.selectionStart ?? this.ext.invSearch.length;
        this.render();
        const nextInp = this.body.querySelector(".inv-search-input") as HTMLInputElement;
        if (nextInp) {
          nextInp.focus();
          nextInp.setSelectionRange(pos, pos);
        }
      });
    }

    // Draggable hook for potions and consumable items
    for (const c of this.body.querySelectorAll<HTMLElement>("[data-use]")) {
      const id = Number(c.dataset.use);
      this.windows.draggable(c, () => ({ t: "item", id }), undefined, () => g.useAction({ t: "item", id }));
    }
  }

  private renderGearCell(g: Gear, action: string, note: string, extra = ""): string {
    const tipKey = "g" + g.uid;
    const isEquipped = Object.values(this.game.eq).some((eq) => eq?.uid === g.uid);
    this.ext.tips.set(tipKey, () => renderGearTooltip(g, isEquipped, note, this.game.stats.level));

    const rarityClass = g.rarity > 0 ? `r${g.rarity}` : "";

    return `
      <div class="gcell slot ${rarityClass} relative w-[38px] h-[38px] bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 hover:border-[#9ca8b8]/70 rounded-[3px] cursor-pointer select-none backdrop-blur-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] transition-all flex items-center justify-center"
        data-act="${action}" data-uid="${g.uid}" data-tip="${tipKey}" ${extra}>
        <div class="slot-icon absolute inset-[2px] bg-center bg-no-repeat bg-contain [image-rendering:pixelated] z-[2]" style="background-image: url('${gearIcon(g.id)}');"></div>
        ${g.star ? `<span class="gstar absolute right-[2px] top-[1px] font-bold text-[8px] text-[#facc15] drop-shadow-[0_1px_2px_#000] pointer-events-none z-[4]">★${g.star}</span>` : ""}
      </div>
    `;
  }
}
