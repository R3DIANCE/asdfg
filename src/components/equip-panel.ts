// Modular Equipment Panel — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
// Exact replication of MapleStory Modern UI (dark slate steel, TOTEM side tab, EQUIP/CASH/PET/AD top tabs, paperdoll slots, animated preview)
import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import type { Windows } from "../windows.ts";
import type { ExtWindows } from "../windows2.ts";
import {
  GEAR, SLOTS, SLOT_NAME, gearIcon, type Gear, type Slot,
} from "../items.ts";
import { charUrlFor } from "../game.ts";
import { el, esc, icon } from "../util.ts";

export interface EquipPanelParam {
  windowEl: HTMLElement;
  game: Game;
  windows: Windows;
  ext: ExtWindows;
}

export type EquipTabType = "equip" | "cash" | "pet" | "ad";

export class EquipPanelComponent extends ComponentBase {
  public windowEl!: HTMLElement;
  public body!: HTMLElement;
  public game!: Game;
  public windows!: Windows;
  public ext!: ExtWindows;
  public activeTab: EquipTabType = "equip";
  public totemOpen = false;
  private animFrame = 0;
  private lastAnimTime = 0;
  private lastSig = "";

  constructor(param?: EquipPanelParam) {
    super();
    if (param) {
      this.initParam(param);
    }
  }

  public override init(param?: EquipPanelParam): void {
    super.init(param);
    if (param) {
      this.initParam(param);
    }
  }

  private initParam(param: EquipPanelParam) {
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
    this.render();
  }

  public override onUpdate(): void {
    if (!this.windowEl || this.windowEl.classList.contains("hidden")) return;
    const now = performance.now();
    if (now - this.lastAnimTime > 600) {
      this.animFrame = (this.animFrame + 1) % 3;
      this.lastAnimTime = now;
      const charImg = this.body.querySelector(".eprev-char") as HTMLImageElement;
      if (charImg) {
        charImg.src = charUrlFor(this.game.look, "stand1", this.animFrame);
      }
    }

    const g = this.game;
    const eqList = Object.entries(g.eq).map(([s, it]) => `${s}:${it?.uid || ""}:${it?.star || 0}`).join(",");
    const vList = Object.entries(g.visualEq).map(([s, it]) => `${s}:${it?.uid || ""}`).join(",");
    const sig = `${this.activeTab}|${this.totemOpen}|${eqList}|${vList}|${g.look}`;
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.render();
    }
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
    if (this.body) this.body.innerHTML = "";
  }

  public render(): void {
    if (!this.body) return;
    const g = this.game;
    const isVisual = this.activeTab === "cash";
    const isPet = this.activeTab === "pet";

    const leftCol1: Slot[] = ["ring1", "ring2", "ring3", "ring4", "pocket"];
    const leftCol2: Slot[] = ["pendant", "face", "eye", "earrings", "belt"];
    const rightCol1: Slot[] = ["hat", "top", "bottom", "shoes", "gloves"];
    const rightCol2: Slot[] = ["cape", "weapon", "shield", "shoulder", "emblem"];

    const cellFor = (s: Slot) => {
      const it = isVisual ? g.visualEq[s] : g.eq[s];
      if (!it) {
        const title = isVisual ? `Visual ${SLOT_NAME[s]}` : SLOT_NAME[s];
        const emptyLabel = isVisual ? "Empty Visual Slot (NX Cosmetic)" : "Empty Slot";
        return `
          <div class="eslot empty relative w-[36px] h-[36px] rounded-[3px] flex items-center justify-center select-none"
            data-slot="${s}"
            ${this.ext.tip("eslot-" + (isVisual ? "v-" : "") + s, () => `
              <div class="ms-tooltip-card p-2 min-w-[140px] text-center bg-[#131922] border border-[#3a4454] rounded shadow-lg">
                <div class="tt-title text-[11px] font-bold ${isVisual ? "text-purple-300" : "text-slate-200"}">${title}</div>
                <div class="text-[9px] text-slate-400 mt-1">${emptyLabel}</div>
              </div>
            `)}>
          </div>
        `;
      }
      const act = isVisual ? "unequip-visual" : "unequip";
      const note = isVisual ? "Click to unequip visual cosmetic" : "Click to unequip";
      return `
        <div class="eslot filled relative w-[36px] h-[36px] rounded-[3px] flex items-center justify-center cursor-pointer select-none"
          data-slot="${s}" data-act="${act}" data-uid="${it.uid}"
          ${this.ext.tip("g" + it.uid, () => this.ext.gearTip(it, note))}>
          ${this.ext.gearCell(it, act, note, `data-slot="${s}"`)}
        </div>
      `;
    };

    const tabs: { id: EquipTabType; label: string }[] = [
      { id: "equip", label: "EQUIP" },
      { id: "cash", label: "CASH" },
      { id: "pet", label: "PET" },
      { id: "ad", label: "AD" },
    ];

    const tabsHtml = tabs.map((t) => {
      const isActive = t.id === this.activeTab;
      return `
        <button type="button" data-act="equiptab" data-v="${t.id}"
          class="flex-1 py-1 text-center font-bold text-[10px] rounded-[3px] border transition-all cursor-pointer select-none ${isActive ? "bg-[#0ea5e9]/25 border-[#38bdf8] text-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.3)] font-black" : "bg-[#253042]/70 hover:bg-[#34445c]/90 border-[#3a4454] text-slate-300"}">
          ${t.label}
        </button>
      `;
    }).join("");

    this.body.innerHTML = `
      <div class="equip-inner-container relative flex flex-col gap-2 p-3 text-slate-200 select-none">
        <!-- Hanging TOTEM Side Tab -->
        <button type="button" data-act="toggle-totem"
          class="absolute -left-[24px] top-[40px] w-[24px] py-3 bg-[#1e2736] hover:bg-[#2e3e54] border-l border-y border-[#3a4454] rounded-l-[4px] text-[8.5px] font-black text-slate-300 hover:text-white flex flex-col items-center justify-center leading-tight shadow-md cursor-pointer transition-colors z-10"
          title="Toggle Totem Slots">
          <span>T</span><span>O</span><span>T</span><span>E</span><span>M</span>
        </button>

        <!-- Top Category Tabs: EQUIP, CASH, PET, AD -->
        <div class="equip-tabs-row flex items-center gap-1 p-1 bg-[#10151f]/80 border border-[#2b3444] rounded-[4px]">
          ${tabsHtml}
        </div>

        <!-- Sub Title Bar with Presets Indicator -->
        <div class="flex items-center justify-between px-2 py-1 bg-[#151c27] border border-[#2e3746] rounded-[3px]">
          <span class="text-[9.5px] font-black text-[#facc15] tracking-wider">${isVisual ? "CASH COSMETICS" : isPet ? "PET EQUIPMENT" : "REGULAR EQUIPMENT"}</span>
          <div class="flex items-center gap-1 text-[8.5px] text-slate-400">
            <span>PRESET</span>
            <div class="flex items-center gap-0.5">
              <span class="w-3.5 h-3.5 bg-[#0284c7] text-white rounded-[2px] flex items-center justify-center font-bold">1</span>
              <span class="w-3.5 h-3.5 bg-[#1f2937] text-slate-400 rounded-[2px] flex items-center justify-center">2</span>
              <span class="w-3.5 h-3.5 bg-[#1f2937] text-slate-400 rounded-[2px] flex items-center justify-center">3</span>
            </div>
          </div>
        </div>

        <!-- Paperdoll Slots Grid with Center Character Avatar Preview -->
        <div class="egrid-container flex items-center justify-between p-2 bg-[#121822]/95 border border-[#2b3444] rounded-[4px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
          <!-- Left Column 1 (Rings & Pocket) -->
          <div class="flex flex-col gap-1.5">${leftCol1.map(cellFor).join("")}</div>

          <!-- Left Column 2 (Pendant, Face, Eye, Earrings, Belt) -->
          <div class="flex flex-col gap-1.5">${leftCol2.map(cellFor).join("")}</div>

          <!-- Center Character Preview Pedestal -->
          <div class="eprev relative w-[80px] h-[190px] flex flex-col items-center justify-center">
            <div class="eprev-pedestal absolute bottom-2 w-[68px] h-[14px] bg-gradient-to-t from-[#0f172a] to-[#1e293b] border border-[#3a4454] rounded-full shadow-[0_0_12px_rgba(0,0,0,0.8)]"></div>
            <div class="eprev-aura absolute bottom-4 w-[50px] h-[20px] bg-sky-500/10 rounded-full blur-[4px]"></div>
            <div class="eprev-char-wrap relative z-[2] mb-4">
              <img alt="Character preview" class="eprev-char [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]" src="${charUrlFor(g.look, "stand1", this.animFrame)}" />
            </div>
          </div>

          <!-- Right Column 1 (Hat, Top, Bottom, Shoes, Gloves) -->
          <div class="flex flex-col gap-1.5">${rightCol1.map(cellFor).join("")}</div>

          <!-- Right Column 2 (Cape, Weapon, Shield, Shoulder, Emblem) -->
          <div class="flex flex-col gap-1.5">${rightCol2.map(cellFor).join("")}</div>
        </div>

        <!-- Bottom Action Buttons: EFFECT, SALON, SYMBOL -->
        <div class="equip-bottom-actions flex items-center justify-between mt-1 pt-1 border-t border-[#2a3444]">
          <button type="button" class="px-3 py-1 bg-[#253042] hover:bg-[#34445c] border border-[#3b4b62] hover:border-[#38bdf8]/60 rounded-[3px] text-slate-200 hover:text-white text-[10px] font-bold cursor-pointer transition-all shadow-sm">EFFECT</button>
          <button type="button" class="px-3 py-1 bg-[#253042] hover:bg-[#34445c] border border-[#3b4b62] hover:border-[#38bdf8]/60 rounded-[3px] text-slate-200 hover:text-white text-[10px] font-bold cursor-pointer transition-all shadow-sm">SALON</button>
          <button type="button" class="px-3 py-1 bg-[#1f2937] hover:bg-[#2e3e54] border border-[#3b4b62] hover:border-[#38bdf8] rounded-[3px] text-[#38bdf8] hover:text-white text-[10px] font-black cursor-pointer transition-all shadow-sm">SYMBOL &gt;</button>
        </div>
      </div>
    `;
  }
}
