// GM Monster Drop & Inventory Confirmation Audit Widget
// Real-time tracking and verification tool for GameMasters to audit monster item drops and confirm presence in inventory.
import { ComponentBase } from "@orillusion/core";
import type { Game, GmDropPickupRecord } from "../game.ts";
import type { Windows } from "../windows.ts";
import { el, esc } from "../util.ts";
import { lucideIcon } from "../lucide.ts";
import { RARITY, RARITY_INK, gearStats } from "../items.ts";

export class GmDropAuditWidget extends ComponentBase {
  root!: HTMLElement;
  pillBtn!: HTMLButtonElement;
  win!: HTMLElement;
  bodyEl!: HTMLElement;

  private game!: Game;
  private wins?: Windows;
  private isEnabled = false;
  private isOpen = false;
  private isMinimized = false;
  private isPaused = false;
  private filter: "all" | "gear" | "item" | "mat" | "meso" | "missing" = "all";
  private searchQuery = "";
  private autoScroll = true;

  constructor(param?: { parent: HTMLElement; game: Game; wins?: Windows }) {
    super();
    if (param?.parent && param?.game) {
      this.initComponent(param.parent, param.game, param.wins);
    }
  }

  public override init(param?: { parent: HTMLElement; game: Game; wins?: Windows }): void {
    super.init(param);
    if (param?.parent && param?.game && !this.root) {
      this.initComponent(param.parent, param.game, param.wins);
    }
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
    this.root?.remove();
    this.win?.remove();
  }

  private initComponent(parent: HTMLElement, game: Game, wins?: Windows) {
    this.game = game;
    this.wins = wins;

    // Disabled and hidden by default unless explicitly enabled via GM Control Panel
    try {
      this.isEnabled = localStorage.getItem("ms_gm_drop_widget_enabled") === "true";
      this.isOpen = this.isEnabled && (localStorage.getItem("ms_gm_drop_widget_open") === "true");
      this.isMinimized = localStorage.getItem("ms_gm_drop_widget_minimized") === "true";
    } catch {
      this.isEnabled = false;
      this.isOpen = false;
      this.isMinimized = false;
    }

    // 1. Floating Trigger Pill on Screen (strictly hidden unless widget is enabled)
    this.root = el(
      "div",
      "gm-drop-pill-container fixed z-[125] select-none pointer-events-auto transition-all duration-150",
      parent
    );
    this.root.style.left = "8px";
    this.root.style.top = "62px";
    this.root.style.display = (this.isEnabled && this.isOpen) ? "block" : "none";

    this.pillBtn = el(
      "button",
      "gm-drop-pill flex items-center gap-1.5 px-3 py-1.5 cursor-pointer bg-zinc-950/80 hover:bg-zinc-900/95 border border-amber-500/40 hover:border-amber-400 rounded-lg backdrop-blur-md shadow-[0_6px_20px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.1)] text-zinc-200 transition-all active:scale-95 font-sans",
      this.root
    ) as HTMLButtonElement;
    this.pillBtn.type = "button";
    this.pillBtn.title = "Toggle GM Monster Drop & Inventory Audit Widget (F6)";
    this.pillBtn.addEventListener("click", () => this.toggle());

    // 2. Main Audit Window
    const winLayer = wins?.layer || document.body;
    this.win = el("section", "win gm-drop-audit-win fixed z-[130] flex flex-col font-sans select-none pointer-events-auto rounded-xl overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)] border border-amber-500/40 backdrop-blur-xl bg-zinc-950/92", winLayer);
    this.win.style.width = "520px";
    this.win.style.maxWidth = "calc(100vw - 16px)";
    this.win.style.maxHeight = "calc(100vh - 80px)";
    this.win.style.left = "200px";
    this.win.style.top = "70px";

    if (!this.isOpen || !this.isEnabled) {
      this.win.classList.add("hidden");
    }

    this.buildWindowContent();

    // Event listeners
    window.addEventListener("gm-drop-pickup", () => {
      this.updatePillStatus();
      if (this.isOpen && this.isEnabled && !this.isPaused) {
        this.renderFeed();
      }
    });

    window.addEventListener("toggle-gm-drop-widget", () => {
      this.toggle();
    });

    window.addEventListener("set-gm-drop-widget-enabled", (e: any) => {
      const targetEnabled = typeof e.detail?.enabled === "boolean" ? e.detail.enabled : !this.isEnabled;
      this.setEnabled(targetEnabled);
    });

    this.updatePillStatus();
    if (this.isEnabled && this.isOpen) {
      this.render();
    }
  }

  public setEnabled(val: boolean) {
    if (!this.game?.isGm?.()) {
      this.game?.onChat?.("notice", "[GM] Access restricted. GameMaster privileges required.");
      return;
    }
    this.isEnabled = val;
    try {
      localStorage.setItem("ms_gm_drop_widget_enabled", String(val));
    } catch {}

    if (val) {
      this.isOpen = true;
      try {
        localStorage.setItem("ms_gm_drop_widget_open", "true");
      } catch {}
      this.win.classList.remove("hidden");
      this.render();
      this.bringToFront();
      this.game.onChat("notice", "★ [GM Tool] Monster Drop & Inventory Audit Widget enabled.");
    } else {
      this.isOpen = false;
      try {
        localStorage.setItem("ms_gm_drop_widget_open", "false");
      } catch {}
      this.win.classList.add("hidden");
      this.game.onChat("notice", "★ [GM Tool] Monster Drop & Inventory Audit Widget disabled and hidden.");
    }
    this.updatePillStatus();
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  public toggle(force?: boolean) {
    if (!this.game.isGm()) {
      this.game.onChat("notice", "[GM] Access restricted. GameMaster privileges required.");
      return;
    }
    if (!this.isEnabled) {
      this.setEnabled(true);
      return;
    }
    this.isOpen = typeof force === "boolean" ? force : !this.isOpen;
    try {
      localStorage.setItem("ms_gm_drop_widget_open", String(this.isOpen));
    } catch {}

    if (this.isOpen) {
      this.win.classList.remove("hidden");
      this.render();
      this.bringToFront();
    } else {
      this.win.classList.add("hidden");
    }
    this.updatePillStatus();
  }

  public open() {
    this.toggle(true);
  }

  public close() {
    this.toggle(false);
  }

  private bringToFront() {
    const maxZ = Math.max(130, ...(this.wins ? [this.wins.z + 2] : [135]));
    this.win.style.zIndex = String(maxZ);
    if (this.wins) this.wins.z = maxZ;
  }

  public updatePillStatus() {
    if (!this.game) return;
    if (!this.game.isGm() || !this.isEnabled || !this.isOpen) {
      this.root.style.display = "none";
      return;
    }
    this.root.style.display = "block";

    const logs = this.game.gmDropLogs || [];
    const missing = logs.filter((l) => !l.confirmedInInventory).length;

    let badgeClass = "text-emerald-400 bg-emerald-950/80 border-emerald-500/30";
    let badgeText = "100% OK";

    if (missing > 0) {
      badgeClass = "text-rose-400 bg-rose-950/90 border-rose-500/50 animate-pulse";
      badgeText = `⚠️ ${missing} MISSING`;
    }

    this.pillBtn.innerHTML = `
      <div class="flex items-center gap-1.5">
        <span class="text-amber-400 font-black text-xs">★</span>
        <span class="text-[11px] font-bold tracking-tight text-amber-200">GM Drops</span>
        <span class="text-[10px] font-mono text-zinc-400 bg-white/10 px-1 py-0.2 rounded border border-white/10">${logs.length}</span>
        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }

  private buildWindowContent() {
    this.win.innerHTML = "";

    // 1. Draggable Window Titlebar
    const titlebar = el(
      "div",
      "gm-drop-titlebar flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-amber-950/70 via-zinc-900/80 to-zinc-950/90 border-b border-amber-500/30 cursor-grab active:cursor-grabbing",
      this.win
    );

    const titleLeft = el("div", "flex items-center gap-2 pointer-events-none", titlebar);
    titleLeft.innerHTML = `
      <span class="text-amber-400 text-sm font-black">★</span>
      <div class="flex flex-col">
        <div class="flex items-center gap-2">
          <span class="text-xs font-black tracking-wide text-amber-300">MONSTER DROP & INVENTORY AUDIT</span>
          <span class="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">GM TOOL</span>
        </div>
        <span class="text-[9px] text-zinc-400">Live confirmation of ground loot vs actual player inventory</span>
      </div>
    `;

    const titleRight = el("div", "flex items-center gap-1", titlebar);

    const hideBtn = el(
      "button",
      "px-2 py-0.5 flex items-center gap-1 rounded text-[10px] font-bold text-amber-300 hover:text-white bg-amber-950/60 hover:bg-amber-900 border border-amber-500/40 transition-colors mr-1 cursor-pointer",
      titleRight
    ) as HTMLButtonElement;
    hideBtn.type = "button";
    hideBtn.title = "Disable and hide tool (Can be re-enabled from GM Control Panel)";
    hideBtn.innerHTML = `<span>Hide</span>`;
    hideBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setEnabled(false);
    });

    const minBtn = el(
      "button",
      "w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors text-xs font-bold",
      titleRight
    ) as HTMLButtonElement;
    minBtn.type = "button";
    minBtn.title = this.isMinimized ? "Expand" : "Minimize";
    minBtn.innerHTML = this.isMinimized ? "+" : "−";
    minBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.isMinimized = !this.isMinimized;
      try {
        localStorage.setItem("ms_gm_drop_widget_minimized", String(this.isMinimized));
      } catch {}
      this.render();
    });

    const closeBtn = el(
      "button",
      "w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-rose-300 hover:bg-rose-950/50 transition-colors text-xs font-bold",
      titleRight
    ) as HTMLButtonElement;
    closeBtn.type = "button";
    closeBtn.title = "Close (F6 to reopen)";
    closeBtn.innerHTML = "×";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.close();
    });

    // Make window draggable
    titlebar.addEventListener("pointerdown", (ev: PointerEvent) => {
      if ((ev.target as HTMLElement).tagName === "BUTTON") return;
      this.bringToFront();
      const ox = ev.clientX - this.win.offsetLeft;
      const oy = ev.clientY - this.win.offsetTop;

      const mv = (m: PointerEvent) => {
        const curW = this.win.offsetWidth || 520;
        const curH = this.win.offsetHeight || 300;
        const maxL = Math.max(4, innerWidth - curW - 4);
        const maxT = Math.max(4, innerHeight - curH - 68);
        this.win.style.left = `${Math.max(4, Math.min(maxL, m.clientX - ox))}px`;
        this.win.style.top = `${Math.max(4, Math.min(maxT, m.clientY - oy))}px`;
      };

      const up = () => {
        window.removeEventListener("pointermove", mv);
        window.removeEventListener("pointerup", up);
      };

      window.addEventListener("pointermove", mv);
      window.addEventListener("pointerup", up);
    });

    // 2. Main Body Container
    this.bodyEl = el("div", "gm-drop-body flex flex-col p-3 gap-2.5 overflow-hidden", this.win);
  }

  public render() {
    if (!this.bodyEl || !this.game) return;

    if (this.isMinimized) {
      this.bodyEl.innerHTML = `
        <div class="flex items-center justify-between text-xs text-zinc-300 px-1 py-0.5">
          <span>Tracking active (${this.game.gmDropLogs?.length ?? 0} drops)</span>
          <button class="text-[10px] text-amber-300 hover:underline cursor-pointer" id="btn-unmin">Expand Window</button>
        </div>
      `;
      this.bodyEl.querySelector("#btn-unmin")?.addEventListener("click", () => {
        this.isMinimized = false;
        this.render();
      });
      return;
    }

    const logs = this.game.gmDropLogs || [];
    const totalCount = logs.length;
    const confirmedCount = logs.filter((l) => l.confirmedInInventory).length;
    const missingCount = totalCount - confirmedCount;
    const confirmPct = totalCount > 0 ? Math.round((confirmedCount / totalCount) * 100) : 100;

    let mesoTotal = 0;
    let gearCount = 0;
    let itemCount = 0;
    let matCount = 0;

    for (const l of logs) {
      if (l.type === "meso") mesoTotal += l.amount;
      else if (l.type === "gear") gearCount += l.amount;
      else if (l.type === "item") itemCount += l.amount;
      else if (l.type === "mat") matCount += l.amount;
    }

    this.bodyEl.innerHTML = `
      <!-- Stats Summary Card Grid -->
      <div class="grid grid-cols-4 gap-2 text-center select-none font-sans">
        <div class="p-2 rounded-lg bg-zinc-900/70 border border-white/10 flex flex-col items-center justify-center">
          <span class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Total Looted</span>
          <span class="text-base font-black text-zinc-100">${totalCount}</span>
          <span class="text-[9px] text-zinc-500 font-mono">Drops</span>
        </div>
        <div class="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex flex-col items-center justify-center">
          <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">In Inventory</span>
          <span class="text-base font-black text-emerald-300">${confirmedCount} <span class="text-[11px] font-bold text-emerald-400/80">(${confirmPct}%)</span></span>
          <span class="text-[9px] text-emerald-400/70 font-mono">Confirmed</span>
        </div>
        <div class="p-2 rounded-lg ${missingCount > 0 ? "bg-rose-950/60 border-rose-500/60 animate-pulse" : "bg-zinc-900/70 border-white/10"} flex flex-col items-center justify-center">
          <span class="text-[10px] font-bold uppercase tracking-wider ${missingCount > 0 ? "text-rose-300" : "text-zinc-400"}">Missing / Lost</span>
          <span class="text-base font-black ${missingCount > 0 ? "text-rose-400" : "text-zinc-400"}">${missingCount}</span>
          <span class="text-[9px] ${missingCount > 0 ? "text-rose-400/80 font-bold" : "text-zinc-500"} font-mono">Unconfirmed</span>
        </div>
        <div class="p-2 rounded-lg bg-amber-950/30 border border-amber-500/30 flex flex-col items-center justify-center">
          <span class="text-[10px] font-bold uppercase tracking-wider text-amber-400">Total Mesos</span>
          <span class="text-xs font-black text-amber-300 tracking-tight">+${mesoTotal.toLocaleString()}</span>
          <span class="text-[9px] text-amber-400/70 font-mono">Current: ${(this.game.stats.meso || 0).toLocaleString()}</span>
        </div>
      </div>

      <!-- Quick Action Toolbar -->
      <div class="flex items-center justify-between gap-1.5 px-0.5">
        <div class="flex items-center gap-1.5">
          <button id="btn-spawn-test" type="button" class="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-md transition-all active:scale-95 cursor-pointer shadow-sm" title="Spawns 4 monster drops (Equip, Potion, Mat, Mesos) from Slime (Lv.7) to verify pickup & confirmation">
            ${lucideIcon("sparkles", 12, "text-amber-400")}
            <span>Spawn Test Mob Drops</span>
          </button>
          <button id="btn-reverify-all" type="button" class="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-sky-300 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 rounded-md transition-all active:scale-95 cursor-pointer" title="Re-scan all bags and wallet right now for all tracked items">
            ${lucideIcon("refresh", 12, "text-sky-400")}
            <span>Re-Verify Bags</span>
          </button>
        </div>

        <div class="flex items-center gap-1.5">
          <button id="btn-pause-toggle" type="button" class="px-2 py-1 text-[11px] font-bold ${this.isPaused ? "text-amber-300 bg-amber-950/50 border-amber-500/40" : "text-zinc-300 bg-zinc-800/60 hover:bg-zinc-700/60 border-white/10"} border rounded-md transition-all cursor-pointer">
            ${this.isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button id="btn-clear-logs" type="button" class="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-zinc-400 hover:text-rose-300 bg-zinc-800/40 hover:bg-rose-950/40 border border-white/10 rounded-md transition-all cursor-pointer" title="Clear drop history">
            ${lucideIcon("trash", 11)}
            <span>Clear</span>
          </button>
        </div>
      </div>

      <!-- Filters & Search Bar -->
      <div class="flex items-center justify-between gap-2 pt-0.5 border-t border-white/10">
        <!-- Filter Tabs -->
        <div class="flex items-center gap-1 overflow-x-auto py-0.5 text-[11px]" id="filter-tabs">
          <button data-filter="all" class="filter-tab px-2 py-0.5 rounded cursor-pointer transition-colors ${this.filter === "all" ? "bg-amber-500/30 text-amber-200 font-bold border border-amber-500/50" : "text-zinc-400 hover:text-zinc-200"}">All (${totalCount})</button>
          <button data-filter="gear" class="filter-tab px-2 py-0.5 rounded cursor-pointer transition-colors ${this.filter === "gear" ? "bg-amber-500/30 text-amber-200 font-bold border border-amber-500/50" : "text-zinc-400 hover:text-zinc-200"}">Equip (${gearCount})</button>
          <button data-filter="item" class="filter-tab px-2 py-0.5 rounded cursor-pointer transition-colors ${this.filter === "item" ? "bg-amber-500/30 text-amber-200 font-bold border border-amber-500/50" : "text-zinc-400 hover:text-zinc-200"}">Use (${itemCount})</button>
          <button data-filter="mat" class="filter-tab px-2 py-0.5 rounded cursor-pointer transition-colors ${this.filter === "mat" ? "bg-amber-500/30 text-amber-200 font-bold border border-amber-500/50" : "text-zinc-400 hover:text-zinc-200"}">Etc (${matCount})</button>
          <button data-filter="meso" class="filter-tab px-2 py-0.5 rounded cursor-pointer transition-colors ${this.filter === "meso" ? "bg-amber-500/30 text-amber-200 font-bold border border-amber-500/50" : "text-zinc-400 hover:text-zinc-200"}">Meso</button>
          <button data-filter="missing" class="filter-tab px-2 py-0.5 rounded cursor-pointer transition-colors ${this.filter === "missing" ? "bg-rose-500/30 text-rose-200 font-bold border border-rose-500/60" : "text-zinc-400 hover:text-rose-300"} ${missingCount > 0 ? "text-rose-400 font-bold" : ""}">⚠️ Missing (${missingCount})</button>
        </div>

        <!-- Search Input -->
        <div class="relative w-36">
          <input
            id="search-input"
            type="text"
            placeholder="Search drops..."
            value="${esc(this.searchQuery)}"
            class="w-full bg-zinc-900/80 border border-white/10 rounded px-2 py-0.5 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/60"
          />
        </div>
      </div>

      <!-- Feed Container -->
      <div id="drop-feed-container" class="flex-1 min-h-[220px] max-h-[360px] overflow-y-auto pr-1 flex flex-col gap-1.5 custom-scroll select-text">
        <!-- Rendered feed items -->
      </div>
    `;

    // Hook button listeners
    this.bodyEl.querySelector("#btn-spawn-test")?.addEventListener("click", () => {
      this.game.spawnTestMonsterDrop();
    });

    this.bodyEl.querySelector("#btn-reverify-all")?.addEventListener("click", () => {
      this.reverifyAll();
    });

    this.bodyEl.querySelector("#btn-pause-toggle")?.addEventListener("click", () => {
      this.isPaused = !this.isPaused;
      this.render();
    });

    this.bodyEl.querySelector("#btn-clear-logs")?.addEventListener("click", () => {
      this.game.gmDropLogs = [];
      this.updatePillStatus();
      this.render();
    });

    // Filter tabs
    this.bodyEl.querySelectorAll<HTMLElement>(".filter-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.filter = btn.dataset.filter as any;
        this.render();
      });
    });

    // Search input
    const searchInp = this.bodyEl.querySelector("#search-input") as HTMLInputElement;
    if (searchInp) {
      searchInp.addEventListener("input", () => {
        this.searchQuery = searchInp.value.trim().toLowerCase();
        this.renderFeed();
      });
    }

    this.renderFeed();
  }

  private reverifyAll() {
    if (!this.game || !this.game.gmDropLogs) return;
    let anyChanged = false;
    for (const r of this.game.gmDropLogs) {
      const res = this.game.verifyDropInInventory(r);
      if (r.confirmedInInventory !== res.confirmed || r.inventoryDetail !== res.detail) {
        r.confirmedInInventory = res.confirmed;
        r.inventoryDetail = res.detail;
        anyChanged = true;
      }
    }
    this.updatePillStatus();
    this.render();
    this.game.onChat("notice", `★ [GM Audit] Re-verified all ${this.game.gmDropLogs.length} tracked drops against current player bags.`);
  }

  private renderFeed() {
    const feedContainer = this.bodyEl?.querySelector("#drop-feed-container") as HTMLElement;
    if (!feedContainer || !this.game) return;

    const allLogs = this.game.gmDropLogs || [];
    let filtered = allLogs;

    // Filter by category
    if (this.filter === "gear") filtered = filtered.filter((l) => l.type === "gear");
    else if (this.filter === "item") filtered = filtered.filter((l) => l.type === "item");
    else if (this.filter === "mat") filtered = filtered.filter((l) => l.type === "mat");
    else if (this.filter === "meso") filtered = filtered.filter((l) => l.type === "meso");
    else if (this.filter === "missing") filtered = filtered.filter((l) => !l.confirmedInInventory);

    // Search query filter
    if (this.searchQuery) {
      const q = this.searchQuery;
      filtered = filtered.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          String(l.itemId ?? "").includes(q) ||
          (l.sourceMob?.name || "").toLowerCase().includes(q) ||
          l.inventoryDetail.toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      feedContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-10 text-center gap-2 text-zinc-500">
          <div class="w-10 h-10 rounded-full bg-zinc-900/60 border border-white/5 flex items-center justify-center text-zinc-600">
            ${lucideIcon("package", 20)}
          </div>
          <div class="flex flex-col gap-0.5">
            <span class="text-xs font-bold text-zinc-400">No Monster Drops In Log</span>
            <span class="text-[10px] text-zinc-500 max-w-xs">Defeat monsters in hunting areas, let magnet/pet loot, or click 'Spawn Test Mob Drops' above to test.</span>
          </div>
        </div>
      `;
      return;
    }

    let html = "";
    for (const record of filtered) {
      const isConfirmed = record.confirmedInInventory;
      const statusBadge = isConfirmed
        ? `<span class="bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 shadow-sm">
             <span class="text-emerald-400">✓</span> Confirmed in Inventory
           </span>`
        : `<span class="bg-rose-950/90 text-rose-300 border border-rose-500/60 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 animate-pulse shadow-sm">
             <span class="text-rose-400 font-black">✗</span> NOT IN INVENTORY (LOST!)
           </span>`;

      // Method badge
      let methodBadge = `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-950/70 text-sky-300 border border-sky-500/30">Manual [Z]</span>`;
      if (record.method === "magnet") {
        methodBadge = `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-950/70 text-purple-300 border border-purple-500/30">Auto-Magnet</span>`;
      } else if (record.method === "pet") {
        methodBadge = `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950/70 text-amber-300 border border-amber-500/30">Pet Loot</span>`;
      }

      // Source mob badge
      const mobName = record.sourceMob ? `${record.sourceMob.name}${record.sourceMob.level ? ` (Lv.${record.sourceMob.level})` : ""}` : "Player / Ground Item";
      const mobBadge = record.sourceMob?.elite
        ? `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-950/80 text-red-300 border border-red-500/40">☠ ${esc(mobName)}</span>`
        : `<span class="text-[9px] font-medium px-1.5 py-0.2 rounded bg-zinc-800/80 text-zinc-300 border border-white/10">👾 ${esc(mobName)}</span>`;

      // Item type styling
      let nameColor = "#e4e4e7";
      let typeLabel = "Item";
      if (record.type === "gear") {
        typeLabel = "Equipment";
        nameColor = record.rarity !== undefined ? RARITY_INK[record.rarity] || "#e4e4e7" : "#38bdf8";
      } else if (record.type === "meso") {
        typeLabel = "Currency";
        nameColor = "#fbbf24";
      } else if (record.type === "mat") {
        typeLabel = "Etc Material";
        nameColor = "#a3e635";
      } else if (record.type === "item") {
        typeLabel = "Use Potion";
        nameColor = "#38bdf8";
      }

      const amountText = record.type === "meso"
        ? `<span class="text-amber-300 font-bold font-mono text-[11px]">+${record.amount.toLocaleString()} Mesos</span>`
        : `<span class="text-zinc-300 font-bold font-mono text-[11px]">x${record.amount}</span>`;

      const iconImg = record.iconUrl
        ? `<img src="${record.iconUrl}" class="w-7 h-7 object-contain drop-shadow-sm" onerror="this.style.display='none'" />`
        : `<div class="w-7 h-7 flex items-center justify-center text-zinc-400 bg-white/5 rounded">${lucideIcon("package", 16)}</div>`;

      html += `
        <div class="drop-record-card p-2 rounded-lg ${isConfirmed ? "bg-zinc-900/60 border-white/10 hover:border-emerald-500/30" : "bg-rose-950/30 border-rose-500/50 hover:border-rose-400"} border transition-colors flex flex-col gap-1.5 font-sans" data-record-id="${record.id}">
          <!-- Top Row: Time, Mob, Method -->
          <div class="flex items-center justify-between text-[10px] text-zinc-400">
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-zinc-500 text-[10px]">${record.timeStr}</span>
              ${mobBadge}
              ${methodBadge}
            </div>
            ${statusBadge}
          </div>

          <!-- Middle Row: Item Icon, Name, Amount -->
          <div class="flex items-center justify-between gap-2 px-1">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded bg-zinc-950/80 border border-white/10 flex items-center justify-center p-0.5 shrink-0">
                ${iconImg}
              </div>
              <div class="flex flex-col min-w-0">
                <span class="text-xs font-black truncate" style="color: ${nameColor}">${esc(record.name)}</span>
                <span class="text-[9px] text-zinc-500 font-mono">${typeLabel}${record.itemId ? ` #${record.itemId}` : ""}${record.gearUid ? ` · UID: ${record.gearUid.slice(0, 8)}...` : ""}</span>
              </div>
            </div>
            <div class="shrink-0 flex items-center gap-2">
              ${amountText}
            </div>
          </div>

          <!-- Bottom Row: Inventory Confirmation Detail & Single Item Re-Check -->
          <div class="flex items-center justify-between text-[10px] px-1 py-1 rounded bg-black/40 border border-white/5">
            <div class="flex items-center gap-1 text-zinc-400 truncate">
              <span class="text-zinc-500 font-bold">Inv Status:</span>
              <span class="${isConfirmed ? "text-emerald-300 font-mono" : "text-rose-400 font-bold"} truncate">${esc(record.inventoryDetail)}</span>
            </div>
            <button data-check-id="${record.id}" class="btn-check-single px-1.5 py-0.5 text-[9px] font-bold text-zinc-300 hover:text-white bg-white/10 hover:bg-white/20 rounded cursor-pointer transition-colors shrink-0" title="Re-check item presence in bag right now">
              Verify Now
            </button>
          </div>
        </div>
      `;
    }

    feedContainer.innerHTML = html;

    // Hook single-item verify buttons
    feedContainer.querySelectorAll<HTMLButtonElement>(".btn-check-single").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.checkId;
        const rec = this.game.gmDropLogs?.find((l) => l.id === id);
        if (rec) {
          const res = this.game.verifyDropInInventory(rec);
          rec.confirmedInInventory = res.confirmed;
          rec.inventoryDetail = res.detail;
          this.updatePillStatus();
          this.render();
          this.game.onChat("notice", `★ [GM Audit] Verified '${rec.name}': ${res.detail}`);
        }
      });
    });
  }
}
