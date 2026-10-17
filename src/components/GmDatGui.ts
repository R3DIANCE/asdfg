// Advanced Modern GM Control Center & Moderation Drawer
// Replaces legacy dat.gui with a responsive, glassmorphic sliding drawer on the center-right screen edge
import type { Game } from "../game.ts";
import { PartyClient } from "../party.ts";
import { setUiMode, getUiMode, type UiMode } from "../systems/ui-mode.ts";
import { lucideIcon } from "../lucide.ts";
import { getMapDisplayName } from "../mapNames.ts";

export interface OnlinePlayerItem {
  id: string;
  name: string;
  level?: number;
  job?: string;
  mapId: number;
  mapName?: string;
  x: number;
  y: number;
  isLocal?: boolean;
  gmEffect?: boolean;
  godMode?: boolean;
  infiniteMp?: boolean;
  oneHitKill?: boolean;
  gmHide?: boolean;
  autoCombat?: boolean;
  speedMultiplier?: number;
  isGm?: boolean;
  online?: boolean;
}

const MAP_PRESETS: Record<string, number> = {
  "Free Market": 910000000,
  "Henesys Town": 100000000,
  "Henesys Hunting": 100010000,
  "Ellinia": 101000000,
  "Perion": 102000000,
  "Kerning City": 103000000,
  "Lith Harbor": 104000000,
  "Sleepywood": 105040300,
  "Orbis": 200000000,
  "Ludibrium": 220000000,
  "El Nath": 211000000,
  "Leafre": 240000000,
};

const MOB_PRESETS: Record<string, number> = {
  "Snail (Lv.1)": 100100,
  "Blue Snail (Lv.2)": 100101,
  "Red Snail (Lv.5)": 100002,
  "Slime (Lv.7)": 100006,
  "Orange Mushroom (Lv.8)": 1210102,
  "Ribbon Pig (Lv.10)": 1210101,
  "Green Mushroom (Lv.15)": 1110100,
  "Mano (Boss)": 9300184,
  "Mushmom (Boss)": 6130101,
  "Jr. Balrog (Boss)": 8130100,
  "Zakum (Boss)": 8800000,
};

type GmTab = "status" | "players" | "cheats" | "world" | "combat" | "settings";

export class GmDatGui {
  private game: Game;
  private root: HTMLElement;
  private drawer: HTMLElement;
  private handleBtn: HTMLButtonElement;
  private contentEl: HTMLElement;
  private countBadge: HTMLElement;

  private isVisible = true;
  private isOpen = false;
  private activeTab: GmTab = "status";
  private pollTimer = 0;
  private lastFetchTime = 0;

  private onlinePlayers: OnlinePlayerItem[] = [];
  private selectedPlayerName = "";
  private searchQuery = "";

  public params = {
    uiMode: getUiMode(),
    onlineStatus: "ACTIVE",
    onlineCount: 1,
    activeMaps: 1,
    selectedPlayer: "",
    godMode: false,
    infiniteMp: false,
    oneHitKill: false,
    gmHide: false,
    speedMul: 1.0,
    jumpMul: 1.0,
    targetMap: "Free Market",
    targetX: 0,
    targetY: 0,
    mobToSpawn: "Slime (Lv.7)",
    spawnAmount: 5,
  };

  constructor(game: Game) {
    this.game = game;

    this.isOpen = false;
    try {
      localStorage.setItem("ms_gm_drawer_open", "false");
    } catch {}

    // Root container pinned to right edge, centered vertically
    this.root = document.createElement("div");
    this.root.id = "gm-control-drawer-root";
    this.root.style.position = "fixed";
    this.root.style.right = "0";
    this.root.style.top = "50%";
    this.root.style.transform = "translateY(-50%)";
    this.root.style.zIndex = "9998";
    this.root.style.pointerEvents = "none";
    this.root.style.fontFamily = "'Segoe UI', system-ui, -apple-system, sans-serif";
    this.root.style.userSelect = "none";

    // Sliding Drawer Body (default hidden off-screen)
    this.drawer = document.createElement("div");
    this.drawer.className = "gm-drawer-body";
    this.drawer.style.position = "relative";
    this.drawer.style.width = "400px";
    this.drawer.style.maxHeight = "min(680px, calc(100vh - 100px))";
    this.drawer.style.height = "640px";
    this.drawer.style.display = "flex";
    this.drawer.style.flexDirection = "column";
    this.drawer.style.background = "rgba(15, 15, 18, 0.92)";
    this.drawer.style.backdropFilter = "blur(20px)";
    this.drawer.style.setProperty("-webkit-backdrop-filter", "blur(20px)");
    this.drawer.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    this.drawer.style.borderRight = "none";
    this.drawer.style.borderRadius = "14px 0 0 14px";
    this.drawer.style.boxShadow = "-12px 0 45px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.1)";
    this.drawer.style.transform = "translateX(100%)";
    this.drawer.style.transition = "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)";
    this.drawer.style.pointerEvents = "none";
    this.drawer.style.overflow = "visible";

    // Collapsed Trigger Tab (slides in/out with drawer, always visible on edge)
    this.handleBtn = document.createElement("button");
    this.handleBtn.className = "gm-drawer-handle";
    this.handleBtn.type = "button";
    this.handleBtn.style.position = "absolute";
    this.handleBtn.style.right = "100%";
    this.handleBtn.style.top = "50%";
    this.handleBtn.style.transform = "translateY(-50%)";
    this.handleBtn.style.zIndex = "100";
    this.handleBtn.style.display = "flex";
    this.handleBtn.style.alignItems = "center";
    this.handleBtn.style.gap = "6px";
    this.handleBtn.style.padding = "9px 10px";
    this.handleBtn.style.cursor = "pointer";
    this.handleBtn.style.background = "rgba(15, 15, 18, 0.90)";
    this.handleBtn.style.backdropFilter = "blur(14px)";
    this.handleBtn.style.setProperty("-webkit-backdrop-filter", "blur(14px)");
    this.handleBtn.style.border = "1px solid rgba(255, 255, 255, 0.14)";
    this.handleBtn.style.borderRight = "none";
    this.handleBtn.style.borderRadius = "8px 0 0 8px";
    this.handleBtn.style.boxShadow = "-6px 0 20px rgba(0, 0, 0, 0.55)";
    this.handleBtn.style.color = "#d4d4d8";
    this.handleBtn.style.pointerEvents = "auto";
    this.handleBtn.style.transition = "background 0.15s, padding 0.15s, color 0.15s";
    this.handleBtn.title = "Toggle GM Control Center (F1)";

    this.handleBtn.innerHTML = `
      ${lucideIcon("shield", 14, "text-sky-400")}
      <span style="font-size:11px;font-weight:800;letter-spacing:0.5px;color:#f8fafc;">GM</span>
      <span class="gm-badge-count" style="background:#0284c7;color:#fff;font-size:9.5px;font-weight:700;padding:1px 5px;border-radius:10px;font-family:monospace;">1</span>
      <span class="gm-chevron" style="display:flex;align-items:center;color:#71717a;">${lucideIcon(this.isOpen ? "chevron-right" : "chevron-left", 12)}</span>
    `;

    this.countBadge = this.handleBtn.querySelector(".gm-badge-count") as HTMLElement;

    this.handleBtn.addEventListener("click", () => {
      this.toggleDrawer();
    });

    this.handleBtn.addEventListener("mouseenter", () => {
      this.handleBtn.style.background = "rgba(24, 24, 27, 0.95)";
      this.handleBtn.style.color = "#ffffff";
    });
    this.handleBtn.addEventListener("mouseleave", () => {
      this.handleBtn.style.background = "rgba(15, 15, 18, 0.90)";
      this.handleBtn.style.color = "#d4d4d8";
    });

    this.drawer.appendChild(this.handleBtn);

    // Build Header, Tab Bar, and Content Body
    this.buildHeader();
    this.buildTabBar();

    this.contentEl = document.createElement("div");
    this.contentEl.className = "gm-drawer-content";
    this.contentEl.style.flex = "1";
    this.contentEl.style.overflowY = "auto";
    this.contentEl.style.padding = "10px 12px";
    this.contentEl.style.display = "flex";
    this.contentEl.style.flexDirection = "column";
    this.contentEl.style.gap = "10px";
    this.drawer.appendChild(this.contentEl);

    this.root.appendChild(this.drawer);
    document.body.appendChild(this.root);

    // Render active tab
    this.renderTabContent();

    // Hotkey F1 toggles GM GUI
    window.addEventListener("keydown", (e) => {
      if (e.key === "F1") {
        e.preventDefault();
        this.toggle();
      }
    });

    // Listen to GM force-open events
    window.addEventListener("toggle-debug-win", () => this.toggle());
    window.addEventListener("toggle-debug-win-force", () => this.show());

    this.syncVisibility();
    this.fetchPlayers();
  }

  private toggleDrawer() {
    this.isOpen = !this.isOpen;
    try {
      localStorage.setItem("ms_gm_drawer_open", String(this.isOpen));
    } catch {}
    this.root.style.display = "block";
    this.drawer.style.transform = this.isOpen ? "translateX(0)" : "translateX(100%)";
    this.drawer.style.pointerEvents = this.isOpen ? "auto" : "none";
    this.handleBtn.style.pointerEvents = "auto";
    const chev = this.handleBtn.querySelector(".gm-chevron");
    if (chev) {
      chev.innerHTML = lucideIcon(this.isOpen ? "chevron-right" : "chevron-left", 12);
    }
    if (this.isOpen) {
      this.fetchPlayers();
    }
  }

  public toggle() {
    this.toggleDrawer();
  }

  public show() {
    this.root.style.display = "block";
    if (!this.isOpen) this.toggleDrawer();
  }

  public hide() {
    if (this.isOpen) this.toggleDrawer();
  }

  public syncVisibility() {
    const isGm = this.game?.isGm?.() ?? true;
    this.root.style.display = isGm && this.isVisible ? "block" : "none";
  }

  private buildHeader() {
    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.justifyContent = "space-between";
    head.style.padding = "10px 12px";
    head.style.borderBottom = "1px solid rgba(255, 255, 255, 0.08)";
    head.style.background = "rgba(255, 255, 255, 0.02)";

    head.innerHTML = `
      <div style="display:flex;align-items:center;gap:7px;">
        ${lucideIcon("shield", 15, "text-sky-400")}
        <span style="font-size:12px;font-weight:800;letter-spacing:0.4px;color:#f8fafc;">GM CONTROL CENTER</span>
        <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:12px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#4ade80;font-family:monospace;">ACTIVE</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <button type="button" class="gm-btn-refresh-top" style="background:transparent;border:0;cursor:pointer;padding:4px;color:#94a3b8;border-radius:4px;" title="Refresh Roster">
          ${lucideIcon("refresh", 13)}
        </button>
        <button type="button" class="gm-btn-close-top" style="background:transparent;border:0;cursor:pointer;padding:4px;color:#94a3b8;border-radius:4px;" title="Slide Away (F1)">
          ${lucideIcon("chevron-right", 15)}
        </button>
      </div>
    `;

    head.querySelector(".gm-btn-refresh-top")?.addEventListener("click", () => this.fetchPlayers());
    head.querySelector(".gm-btn-close-top")?.addEventListener("click", () => this.toggleDrawer());

    this.drawer.appendChild(head);
  }

  private buildTabBar() {
    const tabs: { id: GmTab; label: string; icon: string }[] = [
      { id: "status", label: "Status", icon: "activity" },
      { id: "players", label: "Players", icon: "users" },
      { id: "cheats", label: "Powers", icon: "zap" },
      { id: "world", label: "Warp", icon: "map" },
      { id: "combat", label: "Combat", icon: "swords" },
      { id: "settings", label: "UI", icon: "sliders" },
    ];

    const bar = document.createElement("div");
    bar.className = "gm-tab-nav";
    bar.style.display = "flex";
    bar.style.alignItems = "center";
    bar.style.padding = "4px 8px";
    bar.style.gap = "4px";
    bar.style.background = "rgba(0, 0, 0, 0.25)";
    bar.style.borderBottom = "1px solid rgba(255, 255, 255, 0.06)";
    bar.style.overflowX = "auto";

    for (const t of tabs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.tab = t.id;
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.gap = "4px";
      btn.style.padding = "5px 8px";
      btn.style.borderRadius = "5px";
      btn.style.fontSize = "10.5px";
      btn.style.fontWeight = "700";
      btn.style.cursor = "pointer";
      btn.style.transition = "all 0.12s";
      btn.style.whiteSpace = "nowrap";

      const isActive = this.activeTab === t.id;
      this.styleTabBtn(btn, isActive);

      btn.innerHTML = `${lucideIcon(t.icon, 12)} <span>${t.label}</span>`;
      btn.addEventListener("click", () => {
        this.activeTab = t.id;
        bar.querySelectorAll("button").forEach((b) => {
          this.styleTabBtn(b as HTMLButtonElement, b.dataset.tab === this.activeTab);
        });
        this.renderTabContent();
      });

      bar.appendChild(btn);
    }

    this.drawer.appendChild(bar);
  }

  private switchTab(tab: GmTab) {
    this.activeTab = tab;
    this.drawer.querySelectorAll<HTMLButtonElement>(".gm-tab-nav button").forEach((b) => {
      this.styleTabBtn(b, b.dataset.tab === this.activeTab);
    });
    this.renderTabContent();
  }

  private styleTabBtn(btn: HTMLButtonElement, active: boolean) {
    if (active) {
      btn.style.background = "rgba(2, 132, 199, 0.35)";
      btn.style.color = "#38bdf8";
      btn.style.border = "1px solid rgba(56, 189, 248, 0.4)";
      btn.style.boxShadow = "0 0 10px rgba(56, 189, 248, 0.15)";
    } else {
      btn.style.background = "transparent";
      btn.style.color = "#94a3b8";
      btn.style.border = "1px solid transparent";
      btn.style.boxShadow = "none";
    }
  }

  private renderTabContent() {
    this.contentEl.innerHTML = "";

    switch (this.activeTab) {
      case "status":
        this.renderStatusTab();
        break;
      case "players":
        this.renderPlayersTab();
        break;
      case "cheats":
        this.renderCheatsTab();
        break;
      case "world":
        this.renderWorldTab();
        break;
      case "combat":
        this.renderCombatTab();
        break;
      case "settings":
        this.renderSettingsTab();
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 1. STATUS & SERVER OVERVIEW TAB
  // ─────────────────────────────────────────────────────────────
  private renderStatusTab() {
    const g = this.game;
    const ping = Math.max(1, Number(g.wsPing || 20));

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "10px";

    // 4-Tile High-Tech Metrics Grid
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "1fr 1fr";
    grid.style.gap = "4px";

    grid.innerHTML = `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:6px 8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;color:#64748b;font-size:8.5px;font-weight:700;">
          <span>PING / LATENCY</span>
          ${lucideIcon("wifi", 10, ping < 50 ? "text-emerald-400" : "text-amber-400")}
        </div>
        <div style="font-size:12px;font-weight:800;color:#f8fafc;margin-top:1px;font-family:monospace;">${ping} ms</div>
        <div style="font-size:7.5px;color:#22c55e;margin-top:1px;">WebSocket Live</div>
      </div>

      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:6px 8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;color:#64748b;font-size:8.5px;font-weight:700;">
          <span>ONLINE PLAYERS</span>
          ${lucideIcon("users", 10, "text-sky-400")}
        </div>
        <div style="font-size:12px;font-weight:800;color:#f8fafc;margin-top:1px;font-family:monospace;">${this.onlinePlayers.length} Active</div>
        <div style="font-size:7.5px;color:#38bdf8;margin-top:1px;">Across channels</div>
      </div>

      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:6px 8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;color:#64748b;font-size:8.5px;font-weight:700;">
          <span>ACTIVE MAPS</span>
          ${lucideIcon("map", 10, "text-indigo-400")}
        </div>
        <div style="font-size:12px;font-weight:800;color:#f8fafc;margin-top:1px;font-family:monospace;">${this.params.activeMaps} Maps</div>
        <div style="font-size:7.5px;color:#818cf8;margin-top:1px;">Synchronized</div>
      </div>

      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:6px 8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;color:#64748b;font-size:8.5px;font-weight:700;">
          <span>COORDINATES</span>
          ${lucideIcon("compass", 10, "text-amber-400")}
        </div>
        <div style="font-size:12px;font-weight:800;color:#f8fafc;margin-top:1px;font-family:monospace;">(${Math.round(g.p.x)}, ${Math.round(g.p.y)})</div>
        <div style="font-size:7.5px;color:#facc15;margin-top:1px;truncate;">Map: ${g.map?.id || 910000000}</div>
      </div>
    `;

    wrap.appendChild(grid);

    // Diagnostics Card
    const diag = document.createElement("div");
    diag.style.background = "rgba(255, 255, 255, 0.02)";
    diag.style.border = "1px solid rgba(255, 255, 255, 0.08)";
    diag.style.borderRadius = "7px";
    diag.style.padding = "8px 10px";
    diag.style.fontSize = "10.5px";

    diag.innerHTML = `
      <div style="font-size:9.5px;font-weight:800;color:#94a3b8;letter-spacing:0.5px;margin-bottom:6px;display:flex;align-items:center;gap:5px;">
        ${lucideIcon("server", 11, "text-sky-400")}
        <span>SERVER & ENGINE TELEMETRY</span>
      </div>
      <div style="display:flex;justify-content:space-between;color:#cbd5e1;padding:2px 0;">
        <span style="color:#64748b;">Game Engine:</span>
        <span style="font-weight:600;color:#38bdf8;">WebGPU 3D (Orillusion) / Canvas WZ</span>
      </div>
      <div style="display:flex;justify-content:space-between;color:#cbd5e1;padding:2px 0;">
        <span style="color:#64748b;">Data Persistence:</span>
        <span style="font-weight:600;color:#4ade80;">Bun SQLite + SpacetimeDB Dual-Sync</span>
      </div>
      <div style="display:flex;justify-content:space-between;color:#cbd5e1;padding:2px 0;">
        <span style="color:#64748b;">GM Authority:</span>
        <span style="font-weight:600;color:#facc15;">Rank 100 (Master Administrator)</span>
      </div>
    `;
    wrap.appendChild(diag);

    // Global Server Actions Header
    const actHead = document.createElement("div");
    actHead.style.fontSize = "9.5px";
    actHead.style.fontWeight = "800";
    actHead.style.color = "#94a3b8";
    actHead.style.letterSpacing = "0.5px";
    actHead.style.display = "flex";
    actHead.style.alignItems = "center";
    actHead.style.gap = "5px";
    actHead.innerHTML = `${lucideIcon("sliders", 11, "text-amber-400")} <span>GLOBAL SERVER ACTIONS</span>`;
    wrap.appendChild(actHead);

    // Actions Button Grid
    const actionsGrid = document.createElement("div");
    actionsGrid.style.display = "grid";
    actionsGrid.style.gridTemplateColumns = "1fr 1fr";
    actionsGrid.style.gap = "6px";

    const createActionBtn = (label: string, icon: string, color: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.style.display = "flex";
      b.style.alignItems = "center";
      b.style.gap = "6px";
      b.style.padding = "7px 9px";
      b.style.borderRadius = "6px";
      b.style.background = "rgba(255, 255, 255, 0.04)";
      b.style.border = "1px solid rgba(255, 255, 255, 0.1)";
      b.style.color = "#e2e8f0";
      b.style.fontSize = "10px";
      b.style.fontWeight = "700";
      b.style.cursor = "pointer";
      b.style.transition = "all 0.12s";

      b.innerHTML = `${lucideIcon(icon, 12, color)} <span style="truncate">${label}</span>`;
      b.addEventListener("click", onClick);
      b.addEventListener("mouseenter", () => {
        b.style.background = "rgba(255, 255, 255, 0.08)";
        b.style.borderColor = "rgba(255, 255, 255, 0.2)";
      });
      b.addEventListener("mouseleave", () => {
        b.style.background = "rgba(255, 255, 255, 0.04)";
        b.style.borderColor = "rgba(255, 255, 255, 0.1)";
      });
      return b;
    };

    actionsGrid.appendChild(
      createActionBtn("Broadcast Notice", "megaphone", "text-amber-400", () => this.broadcastNotice())
    );
    actionsGrid.appendChild(
      createActionBtn("Server Divine Heal", "sparkles", "text-emerald-400", () => this.serverHealAll())
    );
    actionsGrid.appendChild(
      createActionBtn("Clear Map Drops", "trash-2", "text-rose-400", () => this.clearMapDrops())
    );
    actionsGrid.appendChild(
      createActionBtn("Save World DB", "save", "text-sky-400", () => {
        g.onChange();
        g.onChat("notice", "[GM] World state and character persistence saved.");
      })
    );
    actionsGrid.appendChild(
      createActionBtn("Refresh Server Data", "refresh", "text-zinc-300", () => this.fetchPlayers())
    );
    actionsGrid.appendChild(
      createActionBtn("Map Alert Banner", "bell", "text-yellow-400", () => this.promptMapAlert())
    );

    wrap.appendChild(actionsGrid);
    this.contentEl.appendChild(wrap);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. PLAYERS & MODERATION TAB
  // ─────────────────────────────────────────────────────────────
  private renderPlayersTab() {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "8px";

    // Search bar
    const searchRow = document.createElement("div");
    searchRow.style.position = "relative";
    searchRow.style.display = "flex";
    searchRow.style.alignItems = "center";

    const sIcon = document.createElement("span");
    sIcon.style.position = "absolute";
    sIcon.style.left = "8px";
    sIcon.style.top = "0";
    sIcon.style.bottom = "0";
    sIcon.style.display = "flex";
    sIcon.style.alignItems = "center";
    sIcon.style.justifyContent = "center";
    sIcon.style.pointerEvents = "none";
    sIcon.style.color = "#64748b";
    sIcon.innerHTML = lucideIcon("search", 12);
    searchRow.appendChild(sIcon);

    const sInput = document.createElement("input");
    sInput.type = "text";
    sInput.value = this.searchQuery;
    sInput.placeholder = "Filter online players...";
    sInput.style.width = "100%";
    sInput.style.padding = "6px 8px 6px 28px";
    sInput.style.background = "rgba(0, 0, 0, 0.35)";
    sInput.style.border = "1px solid rgba(255, 255, 255, 0.1)";
    sInput.style.borderRadius = "6px";
    sInput.style.color = "#fff";
    sInput.style.fontSize = "10.5px";
    sInput.style.outline = "none";

    sInput.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
      this.renderPlayerRoster(rosterContainer);
    });

    searchRow.appendChild(sInput);
    wrap.appendChild(searchRow);

    // Player List scroll area
    const rosterContainer = document.createElement("div");
    rosterContainer.style.maxHeight = "160px";
    rosterContainer.style.overflowY = "auto";
    rosterContainer.style.display = "flex";
    rosterContainer.style.flexDirection = "column";
    rosterContainer.style.gap = "4px";
    rosterContainer.style.background = "rgba(0, 0, 0, 0.2)";
    rosterContainer.style.border = "1px solid rgba(255, 255, 255, 0.06)";
    rosterContainer.style.borderRadius = "6px";
    rosterContainer.style.padding = "4px";

    this.renderPlayerRoster(rosterContainer);
    wrap.appendChild(rosterContainer);

    // Selected Player Banner
    const selBanner = document.createElement("div");
    selBanner.style.background = "rgba(2, 132, 199, 0.12)";
    selBanner.style.border = "1px solid rgba(56, 189, 248, 0.25)";
    selBanner.style.borderRadius = "6px";
    selBanner.style.padding = "6px 8px";
    selBanner.style.display = "flex";
    selBanner.style.alignItems = "center";
    selBanner.style.justifyContent = "space-between";

    const target = this.getSelected();
    const targetMapName = target ? getMapDisplayName(target.mapId, target.mapName, this.game.map) : "";
    const targetStatus = !target ? "NONE" : "ONLINE";
    const targetStatusBg = !target ? "rgba(56,189,248,0.15)" : "rgba(34,197,94,0.2)";
    const targetStatusColor = !target ? "#38bdf8" : "#4ade80";
    selBanner.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;">
        ${lucideIcon("user", 13, "text-sky-400")}
        <div>
          <div style="font-size:11px;font-weight:800;color:#fff;">${target?.name || "None Selected"}</div>
          <div style="font-size:9px;color:#94a3b8;">${target ? `${targetMapName} · (${target.x}, ${target.y})` : "Select a player from list above"}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:8px;font-weight:700;color:${targetStatusColor};padding:2px 6px;border-radius:4px;background:${targetStatusBg};">${targetStatus}</span>
        <span style="font-size:8px;font-weight:700;color:#38bdf8;padding:2px 6px;border-radius:4px;background:rgba(56,189,248,0.15);">TARGET</span>
      </div>
    `;
    wrap.appendChild(selBanner);

    // Moderation Action Grid
    const modGrid = document.createElement("div");
    modGrid.style.display = "grid";
    modGrid.style.gridTemplateColumns = "1fr 1fr";
    modGrid.style.gap = "5px";

    const addModBtn = (label: string, icon: string, color: string, onClick: () => void, danger = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.style.display = "flex";
      b.style.alignItems = "center";
      b.style.gap = "6px";
      b.style.padding = "7px 8px";
      b.style.borderRadius = "5px";
      b.style.background = danger ? "rgba(239, 68, 68, 0.15)" : "rgba(255, 255, 255, 0.04)";
      b.style.border = danger ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(255, 255, 255, 0.08)";
      b.style.color = danger ? "#fca5a5" : "#e2e8f0";
      b.style.fontSize = "10px";
      b.style.fontWeight = "700";
      b.style.cursor = "pointer";
      b.style.transition = "all 0.12s";

      b.innerHTML = `${lucideIcon(icon, 12, color)} <span>${label}</span>`;
      b.addEventListener("click", onClick);
      b.addEventListener("mouseenter", () => {
        b.style.background = danger ? "rgba(239, 68, 68, 0.25)" : "rgba(255, 255, 255, 0.09)";
      });
      b.addEventListener("mouseleave", () => {
        b.style.background = danger ? "rgba(239, 68, 68, 0.15)" : "rgba(255, 255, 255, 0.04)";
      });
      return b;
    };

    modGrid.appendChild(addModBtn("Warp To Player", "navigation", "text-sky-400", () => this.warpToTarget()));
    modGrid.appendChild(addModBtn("Summon To GM", "map-pin", "text-amber-400", () => this.summonTarget()));
    modGrid.appendChild(
      addModBtn("Give Powers", "zap", "text-amber-300", () => {
        this.switchTab("cheats");
      })
    );
    modGrid.appendChild(
      addModBtn("Force Auto-Combat", "swords", "text-emerald-400", () => this.toggleAutoCombatTarget())
    );
    modGrid.appendChild(addModBtn("Divine Heal", "heart", "text-emerald-400", () => this.healTarget()));
    modGrid.appendChild(addModBtn("Send 1M Mesos", "coins", "text-yellow-400", () => this.mesoTarget(1000000)));
    modGrid.appendChild(addModBtn("Send 10M Mesos", "coins", "text-yellow-400", () => this.mesoTarget(10000000)));
    modGrid.appendChild(addModBtn("Send 100K EXP", "arrow-up-circle", "text-cyan-400", () => this.expTarget(100000)));
    modGrid.appendChild(addModBtn("Level Up Target", "arrow-up", "text-sky-400", () => this.levelUpTarget()));
    modGrid.appendChild(addModBtn("Whisper Target", "message-square", "text-indigo-400", () => this.whisperTarget()));
    modGrid.appendChild(addModBtn("Force Into Party", "users", "text-violet-400", () => this.forcePartyTarget()));
    modGrid.appendChild(addModBtn("Freeze / Thaw", "snowflake", "text-cyan-300", () => this.freezeTarget()));
    modGrid.appendChild(addModBtn("Mute Chat", "volumex", "text-amber-300", () => this.muteTarget()));
    modGrid.appendChild(addModBtn("Kick Player", "logout", "text-rose-400", () => this.kickTarget(), true));
    modGrid.appendChild(addModBtn("Ban Account", "ban", "text-rose-500", () => this.banTarget(), true));

    wrap.appendChild(modGrid);
    this.contentEl.appendChild(wrap);
  }

  private renderPlayerRoster(container: HTMLElement) {
    container.innerHTML = "";
    const filtered = this.onlinePlayers.filter((p) => {
      if (p.online === false) return false;
      if (!this.searchQuery) return true;
      const mName = getMapDisplayName(p.mapId, p.mapName, this.game.map).toLowerCase();
      return p.name.toLowerCase().includes(this.searchQuery) || mName.includes(this.searchQuery) || String(p.mapId).includes(this.searchQuery);
    });

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.style.padding = "10px";
      empty.style.textAlign = "center";
      empty.style.color = "#64748b";
      empty.style.fontSize = "10px";
      empty.textContent = "No players matching query.";
      container.appendChild(empty);
      return;
    }

    for (const p of filtered) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.padding = "5px 8px";
      row.style.borderRadius = "4px";
      row.style.cursor = "pointer";
      row.style.fontSize = "10px";
      row.style.transition = "all 0.1s";

      const isSel = p.name.toLowerCase() === (this.params.selectedPlayer || "").toLowerCase();
      if (isSel) {
        row.style.background = "rgba(2, 132, 199, 0.3)";
        row.style.border = "1px solid rgba(56, 189, 248, 0.4)";
      } else {
        row.style.background = "rgba(255, 255, 255, 0.02)";
        row.style.border = "1px solid transparent";
      }

      const mapName = getMapDisplayName(p.mapId, p.mapName, this.game.map, () => {
        if (this.activeTab === "players") this.renderPlayerRoster(container);
      });

      const iconName = p.isLocal ? "shield" : "user";
      const iconColor = p.isLocal ? "text-amber-400" : "text-sky-400";

      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
          ${lucideIcon(iconName, 11, iconColor)}
          <span style="font-weight:700;color:#f8fafc;truncate;">${p.name} ${p.isLocal ? "(YOU)" : ""}</span>
        </div>
        <div style="color:#64748b;font-family:monospace;font-size:9.5px;max-width:105px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${mapName}">
          ${mapName}
        </div>
      `;

      row.addEventListener("click", () => {
        this.params.selectedPlayer = p.name;
        this.renderTabContent();
      });

      container.appendChild(row);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. GM POWERS & CHEATS TAB (WITH TARGET PLAYER SELECTOR)
  // ─────────────────────────────────────────────────────────────
  private renderCheatsTab() {
    const g = this.game;
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "8px";

    if (this.onlinePlayers.length === 0) {
      this.fetchPlayers();
    }

    const target = this.getSelected() || {
      id: g.wsId || "LOCAL",
      name: g.stats.name || "Adventurer",
      level: g.stats.level || 1,
      job: g.stats.job || "Beginner",
      mapId: g.map?.id || 910000000,
      x: Math.round(g.p.x),
      y: Math.round(g.p.y),
      isLocal: true,
      gmEffect: Boolean(g.gmEffect),
      godMode: Boolean(g.godMode),
      infiniteMp: Boolean(g.infiniteMp),
      oneHitKill: Boolean(g.oneHitKill),
      gmHide: Boolean(g.gmHide),
      autoCombat: Boolean(g.auto?.battle),
      speedMultiplier: Number(g.speedMultiplier || 1.0),
      isGm: Boolean(g.isGm?.()),
    };
    const isSelf = Boolean(target.isLocal);

    // Target Player Selector Card inside Powers Menu
    const targetBox = document.createElement("div");
    targetBox.style.background = "rgba(24, 24, 27, 0.75)";
    targetBox.style.border = "1px solid rgba(56, 189, 248, 0.3)";
    targetBox.style.borderRadius = "6px";
    targetBox.style.padding = "8px 10px";
    targetBox.style.display = "flex";
    targetBox.style.flexDirection = "column";
    targetBox.style.gap = "6px";

    targetBox.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:5px;font-size:9.5px;font-weight:800;color:#38bdf8;letter-spacing:0.4px;">
          ${lucideIcon("users", 11, "text-sky-400")}
          <span>TARGET PLAYER FOR POWERS</span>
        </div>
        <button type="button" class="gm-powers-refresh-btn" title="Refresh Online Players" style="display:flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#cbd5e1;font-size:9px;font-weight:700;cursor:pointer;">
          ${lucideIcon("refresh", 10)} <span>Refresh</span>
        </button>
      </div>
      <select class="gm-power-target-select" style="width:100%;padding:5px 8px;background:rgba(9,9,11,0.9);border:1px solid rgba(255,255,255,0.15);border-radius:5px;color:#fff;font-size:10.5px;font-weight:700;outline:none;cursor:pointer;">
        ${this.onlinePlayers
          .map(
            (p) =>
              `<option value="${p.name}" ${p.name.toLowerCase() === target.name.toLowerCase() ? "selected" : ""}>${
                p.name
              } ${p.isLocal ? "(YOU)" : `· Lv.${p.level || 1} ${p.job || ""}`}</option>`
          )
          .join("")}
      </select>
      <div class="gm-power-player-pills" style="display:flex;flex-wrap:wrap;gap:4px;max-height:68px;overflow-y:auto;">
        ${this.onlinePlayers
          .map((p) => {
            const active = p.name.toLowerCase() === target.name.toLowerCase();
            return `<button type="button" data-player="${p.name}" style="display:flex;align-items:center;gap:4px;padding:3px 7px;border-radius:4px;font-size:9.5px;font-weight:700;cursor:pointer;border:1px solid ${
              active ? "#38bdf8" : "rgba(255,255,255,0.1)"
            };background:${
              active ? "rgba(2,132,199,0.32)" : "rgba(255,255,255,0.04)"
            };color:${active ? "#ffffff" : "#a1a1aa"};">
              <span>${p.name}</span>
              ${p.isLocal ? `<span style="font-size:8px;color:#38bdf8;">YOU</span>` : `<span style="font-size:8px;color:#fbbf24;">Lv.${p.level || 1}</span>`}
            </button>`;
          })
          .join("")}
      </div>
    `;

    targetBox.querySelector(".gm-powers-refresh-btn")?.addEventListener("click", async () => {
      await this.fetchPlayers();
      this.renderTabContent();
    });
    targetBox.querySelector(".gm-power-target-select")?.addEventListener("change", (e) => {
      this.params.selectedPlayer = (e.target as HTMLSelectElement).value;
      this.renderTabContent();
    });
    targetBox.querySelectorAll<HTMLElement>(".gm-power-player-pills button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.player;
        if (name) {
          this.params.selectedPlayer = name;
          this.renderTabContent();
        }
      });
    });

    wrap.appendChild(targetBox);

    // Helper to apply a power to either Self or Selected Remote Player
    const setTargetPower = async (power: string, val: any, label: string) => {
      if (isSelf) {
        if (power === "gmEffect") {
          g.gmEffect = Boolean(val);
          try { localStorage.setItem("ms_gm_effect", String(val)); } catch {}
          g.updateActiveItemEffs();
          g.refreshLook();
        } else if (power === "godMode") {
          g.godMode = Boolean(val);
          this.params.godMode = Boolean(val);
        } else if (power === "infiniteMp") {
          g.infiniteMp = Boolean(val);
          this.params.infiniteMp = Boolean(val);
        } else if (power === "oneHitKill") {
          g.oneHitKill = Boolean(val);
          this.params.oneHitKill = Boolean(val);
        } else if (power === "gmHide") {
          g.gmHide = Boolean(val);
          this.params.gmHide = Boolean(val);
        } else if (power === "autoCombat") {
          g.setAutoBattle(Boolean(val));
        } else if (power === "speedMultiplier") {
          g.speedMultiplier = Number(val || 1.0);
          this.params.speedMul = Number(val || 1.0);
        } else if (power === "grantGm") {
          g.setGm(Boolean(val));
        }
        g.syncAll();
        g.onChat("notice", `★ [GM Powers] ${label} (Self): ${typeof val === "boolean" ? (val ? "ON" : "OFF") : val}`);
        g.onChange();
      } else {
        (target as any)[power] = val;
        await this.executeGmAction("power", {
          targetId: target.id,
          targetName: target.name,
          power,
          value: val,
        });
        g.onChat(
          "notice",
          `★ [GM Powers] Granted ${label} (${typeof val === "boolean" ? (val ? "ON" : "OFF") : val}) to ${target.name}!`
        );
      }
      this.renderTabContent();
    };

    // Toggle row generator
    const addToggle = (label: string, icon: string, active: boolean, onChange: (val: boolean) => void) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.padding = "7px 10px";
      row.style.background = active ? "rgba(2, 132, 199, 0.15)" : "rgba(255, 255, 255, 0.03)";
      row.style.border = active ? "1px solid rgba(56, 189, 248, 0.35)" : "1px solid rgba(255, 255, 255, 0.08)";
      row.style.borderRadius = "6px";
      row.style.cursor = "pointer";

      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:7px;">
          ${lucideIcon(icon, 13, active ? "text-sky-400" : "text-zinc-400")}
          <span style="font-size:10.5px;font-weight:700;color:${active ? "#ffffff" : "#cbd5e1"};">${label}</span>
        </div>
        <div style="width:32px;height:18px;border-radius:10px;background:${active ? "#0284c7" : "rgba(255,255,255,0.15)"};position:relative;transition:all 0.15s;">
          <div style="width:14px;height:14px;border-radius:50%;background:#fff;position:absolute;top:2px;left:${active ? "16px" : "2px"};transition:all 0.15s;"></div>
        </div>
      `;

      row.addEventListener("click", () => {
        onChange(!active);
      });

      return row;
    };

    const curGmEffect = isSelf ? Boolean(g.gmEffect) : Boolean(target.gmEffect);
    const curGodMode = isSelf ? Boolean(g.godMode) : Boolean(target.godMode);
    const curInfiniteMp = isSelf ? Boolean(g.infiniteMp) : Boolean(target.infiniteMp);
    const curOneHitKill = isSelf ? Boolean(g.oneHitKill) : Boolean(target.oneHitKill);
    const curGmHide = isSelf ? Boolean(g.gmHide) : Boolean(target.gmHide);
    const curAutoCombat = isSelf ? Boolean(g.auto?.battle) : Boolean(target.autoCombat);
    const curSpeedMul = isSelf ? Number(g.speedMultiplier || 1.0) : Number(target.speedMultiplier || 1.0);

    wrap.appendChild(
      addToggle("GM Overhead Effect (Wizet Aura)", "sparkles", curGmEffect, (val) => {
        setTargetPower("gmEffect", val, "Wizet Overhead Effect");
      })
    );

    wrap.appendChild(
      addToggle("God Mode (Damage Immunity)", "shield", curGodMode, (val) => {
        setTargetPower("godMode", val, "God Mode");
      })
    );

    wrap.appendChild(
      addToggle("Infinite MP (0 Skill Cost)", "zap", curInfiniteMp, (val) => {
        setTargetPower("infiniteMp", val, "Infinite MP");
      })
    );

    wrap.appendChild(
      addToggle("1-Hit Kill (9.99M Damage)", "crosshair", curOneHitKill, (val) => {
        setTargetPower("oneHitKill", val, "1-Hit Kill");
      })
    );

    wrap.appendChild(
      addToggle("GM Hide (Invisibility)", "eye-off", curGmHide, (val) => {
        setTargetPower("gmHide", val, "GM Hide");
      })
    );

    wrap.appendChild(
      addToggle("Force Auto-Combat (AI Battle)", "swords", curAutoCombat, (val) => {
        setTargetPower("autoCombat", val, "Auto-Combat");
      })
    );

    if (!isSelf) {
      wrap.appendChild(
        addToggle("Grant GM Panel Privileges", "crown", Boolean(target.isGm), (val) => {
          setTargetPower("grantGm", val, "GM Privileges");
        })
      );
    }

    // Instant Stat Boosters
    const boostHead = document.createElement("div");
    boostHead.style.fontSize = "9.5px";
    boostHead.style.fontWeight = "800";
    boostHead.style.color = "#94a3b8";
    boostHead.style.letterSpacing = "0.5px";
    boostHead.style.marginTop = "4px";
    boostHead.innerHTML = `${lucideIcon("sparkles", 11, "text-yellow-400")} <span>INSTANT STAT BOOSTS (${target.name.toUpperCase()})</span>`;
    wrap.appendChild(boostHead);

    const boostGrid = document.createElement("div");
    boostGrid.style.display = "grid";
    boostGrid.style.gridTemplateColumns = "1fr 1fr";
    boostGrid.style.gap = "6px";

    const addBoostBtn = (label: string, icon: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.style.display = "flex";
      b.style.alignItems = "center";
      b.style.gap = "6px";
      b.style.padding = "7px 8px";
      b.style.borderRadius = "5px";
      b.style.background = "rgba(255, 255, 255, 0.04)";
      b.style.border = "1px solid rgba(255, 255, 255, 0.08)";
      b.style.color = "#e2e8f0";
      b.style.fontSize = "10px";
      b.style.fontWeight = "700";
      b.style.cursor = "pointer";
      b.innerHTML = `${lucideIcon(icon, 12, "text-sky-400")} <span>${label}</span>`;
      b.addEventListener("click", onClick);
      return b;
    };

    boostGrid.appendChild(
      addBoostBtn("Full HP / MP", "heart", async () => {
        if (isSelf) {
          g.stats.hp = g.stats.maxHp;
          g.stats.mp = g.stats.maxMp;
          g.onChat("notice", "[GM] Self HP/MP fully restored!");
          g.onChange();
        } else {
          await this.executeGmAction("heal", { targetId: target.id, targetName: target.name });
          g.onChat("notice", `[GM] Restored full HP/MP for ${target.name}!`);
        }
      })
    );
    boostGrid.appendChild(
      addBoostBtn("+10M Mesos", "coins", async () => {
        if (isSelf) {
          g.stats.meso = (g.stats.meso || 0) + 10000000;
          g.onChat("notice", "[GM] Added +10,000,000 mesos.");
          g.onChange();
        } else {
          await this.executeGmAction("meso", { targetId: target.id, targetName: target.name, amount: 10000000 });
          g.onChat("notice", `[GM] Sent +10,000,000 mesos to ${target.name}!`);
        }
      })
    );
    boostGrid.appendChild(
      addBoostBtn("Level Up (+1)", "arrow-up", async () => {
        if (isSelf) {
          g.stats.level = (g.stats.level || 1) + 1;
          g.stats.ap = (g.stats.ap || 0) + 5;
          g.stats.sp = (g.stats.sp || 0) + 3;
          g.stats.maxHp += 30;
          g.stats.hp = g.stats.maxHp;
          g.onChat("notice", `★ [GM Level Up] Advanced to Level ${g.stats.level}!`);
          g.onChange();
        } else {
          await this.executeGmAction("levelup", { targetId: target.id, targetName: target.name, levels: 1 });
          g.onChat("notice", `★ [GM] Granted +1 Level to ${target.name}!`);
        }
      })
    );
    boostGrid.appendChild(
      addBoostBtn("Max Class Skills", "star", async () => {
        if (isSelf) {
          if (typeof (g as any).maxAllSkills === "function") {
            (g as any).maxAllSkills();
          } else {
            g.onChat("notice", "[GM] Maxed out all current job skills.");
          }
        } else {
          await setTargetPower("maxSkills", true, "Max Class Skills");
        }
      })
    );

    wrap.appendChild(boostGrid);

    // Movement Multipliers (Pill select)
    const speedBox = document.createElement("div");
    speedBox.style.background = "rgba(255, 255, 255, 0.02)";
    speedBox.style.border = "1px solid rgba(255, 255, 255, 0.08)";
    speedBox.style.borderRadius = "6px";
    speedBox.style.padding = "7px 10px";

    speedBox.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:10px;font-weight:700;color:#94a3b8;">SPEED MULTIPLIER (${target.name.toUpperCase()})</span>
        <span class="speed-val" style="font-size:10px;font-weight:800;color:#38bdf8;font-family:monospace;">${curSpeedMul}x</span>
      </div>
      <div class="speed-pills" style="display:flex;gap:4px;">
        ${[1.0, 1.5, 2.0, 3.0]
          .map(
            (v) =>
              `<button type="button" data-val="${v}" style="flex:1;padding:4px;border-radius:4px;font-size:9.5px;font-weight:700;cursor:pointer;border:1px solid ${
                curSpeedMul === v ? "rgba(56,189,248,0.5)" : "rgba(255,255,255,0.1)"
              };background:${
                curSpeedMul === v ? "rgba(2,132,199,0.3)" : "rgba(255,255,255,0.03)"
              };color:${curSpeedMul === v ? "#38bdf8" : "#94a3b8"};">${v}x</button>`
          )
          .join("")}
      </div>
    `;

    speedBox.querySelectorAll(".speed-pills button").forEach((b) => {
      b.addEventListener("click", () => {
        const val = Number((b as HTMLElement).dataset.val || 1.0);
        setTargetPower("speedMultiplier", val, `Speed ${val}x`);
      });
    });

    wrap.appendChild(speedBox);
    this.contentEl.appendChild(wrap);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. WORLD TELEPORT TAB
  // ─────────────────────────────────────────────────────────────
  private renderWorldTab() {
    const g = this.game;
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "8px";

    const head = document.createElement("div");
    head.style.fontSize = "9.5px";
    head.style.fontWeight = "800";
    head.style.color = "#94a3b8";
    head.style.letterSpacing = "0.5px";
    head.innerHTML = `${lucideIcon("map", 11, "text-sky-400")} <span>TOWN & HUNTING DESTINATIONS</span>`;
    wrap.appendChild(head);

    // Preset Grid
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "1fr 1fr";
    grid.style.gap = "5px";

    for (const [name, mapId] of Object.entries(MAP_PRESETS)) {
      const b = document.createElement("button");
      b.type = "button";
      b.style.display = "flex";
      b.style.alignItems = "center";
      b.style.justifyContent = "space-between";
      b.style.padding = "6px 8px";
      b.style.borderRadius = "5px";
      b.style.background = "rgba(255, 255, 255, 0.04)";
      b.style.border = "1px solid rgba(255, 255, 255, 0.08)";
      b.style.color = "#e2e8f0";
      b.style.fontSize = "10px";
      b.style.fontWeight = "700";
      b.style.cursor = "pointer";

      b.innerHTML = `
        <div style="display:flex;align-items:center;gap:5px;min-width:0;">
          ${lucideIcon("navigation", 11, "text-sky-400")}
          <span style="truncate">${name}</span>
        </div>
        <span style="color:#64748b;font-size:8.5px;font-family:monospace;">${mapId}</span>
      `;

      b.addEventListener("click", async () => {
        await g.loadMap(mapId, "spawn");
        g.onChat("notice", `[GM] Warped to ${name}.`);
        this.renderTabContent();
      });

      grid.appendChild(b);
    }
    wrap.appendChild(grid);

    // Custom Coordinates Warper
    const coordBox = document.createElement("div");
    coordBox.style.background = "rgba(255, 255, 255, 0.02)";
    coordBox.style.border = "1px solid rgba(255, 255, 255, 0.08)";
    coordBox.style.borderRadius = "6px";
    coordBox.style.padding = "8px 10px";

    coordBox.innerHTML = `
      <div style="font-size:9.5px;font-weight:800;color:#94a3b8;margin-bottom:6px;">CUSTOM COORDINATES TELEPORT</div>
      <div style="display:flex;gap:6px;align-items:center;">
        <input type="number" class="gm-x-input" value="${Math.round(g.p.x)}" placeholder="X" style="flex:1;padding:5px 8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#fff;font-size:10.5px;outline:none;" />
        <input type="number" class="gm-y-input" value="${Math.round(g.p.y)}" placeholder="Y" style="flex:1;padding:5px 8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#fff;font-size:10.5px;outline:none;" />
        <button type="button" class="gm-btn-warp-coords" style="display:flex;align-items:center;gap:4px;padding:5px 10px;background:#0284c7;border:0;border-radius:4px;color:#fff;font-size:10px;font-weight:700;cursor:pointer;">
          ${lucideIcon("compass", 11)} <span>Warp</span>
        </button>
      </div>
    `;

    coordBox.querySelector(".gm-btn-warp-coords")?.addEventListener("click", async () => {
      const xIn = coordBox.querySelector(".gm-x-input") as HTMLInputElement;
      const yIn = coordBox.querySelector(".gm-y-input") as HTMLInputElement;
      const tx = Number(xIn?.value || 0);
      const ty = Number(yIn?.value || 0);
      await g.warpToLocation(g.map?.id || 910000000, tx, ty);
      g.onChat("notice", `[GM] Teleported to (${Math.round(g.p.x)}, ${Math.round(g.p.y)}).`);
    });

    wrap.appendChild(coordBox);
    this.contentEl.appendChild(wrap);
  }

  // ─────────────────────────────────────────────────────────────
  // 5. MOBS & COMBAT TAB
  // ─────────────────────────────────────────────────────────────
  private renderCombatTab() {
    const g = this.game;
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "8px";

    // Tactical Actions
    const tactHead = document.createElement("div");
    tactHead.style.fontSize = "9.5px";
    tactHead.style.fontWeight = "800";
    tactHead.style.color = "#94a3b8";
    tactHead.style.letterSpacing = "0.5px";
    tactHead.innerHTML = `${lucideIcon("swords", 11, "text-rose-400")} <span>TACTICAL MONSTER CONTROLS</span>`;
    wrap.appendChild(tactHead);

    const tactGrid = document.createElement("div");
    tactGrid.style.display = "grid";
    tactGrid.style.gridTemplateColumns = "1fr 1fr";
    tactGrid.style.gap = "6px";

    const addTactBtn = (label: string, icon: string, color: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.style.display = "flex";
      b.style.alignItems = "center";
      b.style.gap = "6px";
      b.style.padding = "8px 9px";
      b.style.borderRadius = "6px";
      b.style.background = "rgba(255, 255, 255, 0.04)";
      b.style.border = "1px solid rgba(255, 255, 255, 0.1)";
      b.style.color = "#e2e8f0";
      b.style.fontSize = "10px";
      b.style.fontWeight = "700";
      b.style.cursor = "pointer";

      b.innerHTML = `${lucideIcon(icon, 12, color)} <span>${label}</span>`;
      b.addEventListener("click", onClick);
      return b;
    };

    tactGrid.appendChild(
      addTactBtn("Vacuum All Mobs", "magnet", "text-sky-400", () => {
        let count = 0;
        for (const m of g.mobs) {
          if (m.state !== "dead" && m.state !== "die1") {
            m.x = g.p.x + (Math.random() * 40 - 20);
            m.y = g.p.y;
            count++;
          }
        }
        g.onChat("notice", `★ [GM Vacuum] Pulled ${count} monsters to your coordinates!`);
      })
    );

    tactGrid.appendChild(
      addTactBtn("Wipe All Mobs", "skull", "text-rose-400", () => {
        let count = 0;
        for (const m of g.mobs) {
          if (m.state !== "dead" && m.state !== "die1") {
            m.hp = 0;
            m.state = "die1";
            m.frame = 0;
            count++;
          }
        }
        g.onChat("notice", `★ [GM Wipe] Vanquished ${count} monsters on current map.`);
      })
    );

    wrap.appendChild(tactGrid);

    // Mob Spawner Box
    const spawnBox = document.createElement("div");
    spawnBox.style.background = "rgba(255, 255, 255, 0.02)";
    spawnBox.style.border = "1px solid rgba(255, 255, 255, 0.08)";
    spawnBox.style.borderRadius = "6px";
    spawnBox.style.padding = "8px 10px";
    spawnBox.style.display = "flex";
    spawnBox.style.flexDirection = "column";
    spawnBox.style.gap = "6px";

    spawnBox.innerHTML = `
      <div style="font-size:9.5px;font-weight:800;color:#94a3b8;">MONSTER / BOSS SPAWNER</div>
      <div style="display:flex;gap:6px;">
        <select class="gm-mob-select" style="flex:1;padding:5px 8px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#fff;font-size:10px;outline:none;">
          ${Object.keys(MOB_PRESETS)
            .map(
              (name) =>
                `<option value="${name}" ${this.params.mobToSpawn === name ? "selected" : ""}>${name}</option>`
            )
            .join("")}
        </select>
        <input type="number" class="gm-mob-count" min="1" max="50" value="${this.params.spawnAmount}" style="width:50px;padding:5px 8px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#fff;font-size:10px;outline:none;" />
      </div>
      <button type="button" class="gm-btn-spawn-now" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:7px;background:linear-gradient(180deg,#0284c7,#0369a1);border:1px solid #38bdf8;border-radius:4px;color:#fff;font-size:10.5px;font-weight:700;cursor:pointer;margin-top:2px;">
        ${lucideIcon("swords", 12)} <span>Spawn Mobs Here</span>
      </button>
    `;

    spawnBox.querySelector(".gm-btn-spawn-now")?.addEventListener("click", () => {
      const sel = spawnBox.querySelector(".gm-mob-select") as HTMLSelectElement;
      const cnt = spawnBox.querySelector(".gm-mob-count") as HTMLInputElement;
      const mobName = sel?.value || "Slime (Lv.7)";
      const count = Math.max(1, Math.min(50, Number(cnt?.value || 5)));
      const mobId = MOB_PRESETS[mobName] || 100100;
      g.spawnCustomMob(mobId, count);
      g.onChat("notice", `[GM] Spawned ${count}x ${mobName}.`);
    });

    wrap.appendChild(spawnBox);
    this.contentEl.appendChild(wrap);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. UI & SYSTEM SETTINGS TAB
  // ─────────────────────────────────────────────────────────────
  private renderSettingsTab() {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "8px";

    const head = document.createElement("div");
    head.style.fontSize = "9.5px";
    head.style.fontWeight = "800";
    head.style.color = "#94a3b8";
    head.style.letterSpacing = "0.5px";
    head.innerHTML = `${lucideIcon("sliders", 11, "text-sky-400")} <span>USER INTERFACE & RENDER SETTINGS</span>`;
    wrap.appendChild(head);

    const modeCard = document.createElement("div");
    modeCard.style.background = "rgba(255, 255, 255, 0.02)";
    modeCard.style.border = "1px solid rgba(255, 255, 255, 0.08)";
    modeCard.style.borderRadius = "6px";
    modeCard.style.padding = "8px 10px";

    const curMode = getUiMode();
    modeCard.innerHTML = `
      <div style="font-size:10.5px;font-weight:700;color:#fff;margin-bottom:4px;">HUD Interface Version</div>
      <div style="font-size:9px;color:#94a3b8;margin-bottom:8px;">Switch between modern glassmorphic DOM layout or WebGPU WZ HUD.</div>
      <div style="display:flex;gap:6px;">
        <button type="button" class="gm-ui-new" style="flex:1;padding:6px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;border:1px solid ${
          curMode === "new" ? "#38bdf8" : "rgba(255,255,255,0.1)"
        };background:${
      curMode === "new" ? "rgba(2,132,199,0.35)" : "rgba(255,255,255,0.03)"
    };color:${curMode === "new" ? "#38bdf8" : "#94a3b8"};">WebGPU Canvas (NEW)</button>
        <button type="button" class="gm-ui-old" style="flex:1;padding:6px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;border:1px solid ${
          curMode === "old" ? "#38bdf8" : "rgba(255,255,255,0.1)"
        };background:${
      curMode === "old" ? "rgba(2,132,199,0.35)" : "rgba(255,255,255,0.03)"
    };color:${curMode === "old" ? "#38bdf8" : "#94a3b8"};">Classic DOM (OLD)</button>
      </div>
    `;

    modeCard.querySelector(".gm-ui-new")?.addEventListener("click", () => {
      setUiMode("new");
      this.params.uiMode = "new";
      this.renderTabContent();
    });
    modeCard.querySelector(".gm-ui-old")?.addEventListener("click", () => {
      setUiMode("old");
      this.params.uiMode = "old";
      this.renderTabContent();
    });

    wrap.appendChild(modeCard);
    this.contentEl.appendChild(wrap);
  }

  // ─────────────────────────────────────────────────────────────
  // MODERATION ACTION DISPATCHERS
  // ─────────────────────────────────────────────────────────────
  public update(dt: number) {
    this.pollTimer += dt;
    if (this.pollTimer >= 2.0) {
      this.pollTimer = 0;
      this.syncVisibility();
      if (this.game?.isGm?.()) {
        this.fetchPlayers();
      }
    }
  }

  async fetchPlayers() {
    const g = this.game;
    if (!g) return;

    const byName = new Map<string, OnlinePlayerItem>();
    const selfName = g.stats.name || "Adventurer";
    byName.set(selfName.toLowerCase(), {
      id: g.wsId || "LOCAL",
      name: selfName,
      level: g.stats.level || 1,
      job: g.stats.job || "Beginner",
      mapId: g.map?.id || 910000000,
      mapName: g.map?.name,
      x: Math.round(g.p.x),
      y: Math.round(g.p.y),
      isLocal: true,
      online: true,
      gmEffect: Boolean(g.gmEffect),
      godMode: Boolean(g.godMode),
      infiniteMp: Boolean(g.infiniteMp),
      oneHitKill: Boolean(g.oneHitKill),
      gmHide: Boolean(g.gmHide),
      autoCombat: Boolean(g.auto?.battle),
      speedMultiplier: Number(g.speedMultiplier || 1),
      isGm: Boolean(g.isGm?.()),
    });

    for (const [id, rp] of g.remotePlayers) {
      const name = rp.name || id;
      if (name.toLowerCase() === selfName.toLowerCase()) continue;
      byName.set(name.toLowerCase(), {
        id,
        name,
        level: rp.level || 1,
        job: rp.job || "Beginner",
        mapId: g.map?.id || 910000000,
        mapName: g.map?.name,
        x: Math.round(rp.x),
        y: Math.round(rp.y),
        isLocal: false,
        online: true,
        gmEffect: Boolean(rp.gmEffect),
      });
    }

    try {
      const res = await fetch("/api/gm/players", { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.players)) {
          for (const sp of data.players) {
            if (sp.online === false) continue;
            const name = sp.name || sp.id;
            if (name.toLowerCase() === selfName.toLowerCase()) continue;
            byName.set(name.toLowerCase(), {
              id: sp.id,
              name,
              level: sp.level || 1,
              job: sp.job || "Beginner",
              mapId: sp.mapId,
              mapName: sp.mapName,
              x: sp.x,
              y: sp.y,
              isLocal: false,
              online: true,
              gmEffect: Boolean(sp.gmEffect),
              godMode: Boolean(sp.godMode),
              infiniteMp: Boolean(sp.infiniteMp),
              oneHitKill: Boolean(sp.oneHitKill),
              gmHide: Boolean(sp.gmHide),
              autoCombat: Boolean(sp.autoCombat),
              speedMultiplier: Number(sp.speedMultiplier || 1),
              isGm: Boolean(sp.isGm),
            });
          }
        }
        if (typeof data.activeMaps === "number") {
          this.params.activeMaps = data.activeMaps;
        }
      }
    } catch {}

    const list = Array.from(byName.values()).filter((p) => p.online !== false);
    const prevCount = this.onlinePlayers.length;
    this.onlinePlayers = list;
    this.params.onlineCount = list.length;
    if (this.countBadge) {
      this.countBadge.textContent = String(list.length);
    }

    if (!list.some((p) => p.name.toLowerCase() === (this.params.selectedPlayer || "").toLowerCase()) && list.length > 0) {
      this.params.selectedPlayer = list[0].name;
    }
    if (this.isOpen && (this.activeTab === "cheats" || this.activeTab === "players") && prevCount !== list.length) {
      this.renderTabContent();
    }
  }

  private getSelected(): OnlinePlayerItem | undefined {
    return this.onlinePlayers.find(
      (p) => p.name.toLowerCase() === (this.params.selectedPlayer || "").toLowerCase()
    );
  }

  private async warpToTarget() {
    await this.fetchPlayers();
    const target = this.getSelected();
    if (!target) {
      this.game.onChat("notice", "[GM] No target player selected.");
      return;
    }
    const g = this.game;
    if (target.isLocal) {
      g.onChat("notice", "[GM] Select another online player to warp to.");
      return;
    }
    let targetMapId = target.mapId || 910000000;
    let targetX = target.x;
    let targetY = target.y;
    for (const rp of g.remotePlayers.values()) {
      if ((rp.name || "").toLowerCase() === target.name.toLowerCase()) {
        targetMapId = g.map?.id || targetMapId;
        targetX = Math.round(rp.x);
        targetY = Math.round(rp.y);
        break;
      }
    }
    await g.warpToLocation(targetMapId, targetX, targetY);
    g.onChat("notice", `[GM] Warped to ${target.name} at (${Math.round(g.p.x)}, ${Math.round(g.p.y)}).`);
  }

  private async summonTarget() {
    await this.fetchPlayers();
    const target = this.getSelected();
    if (!target) {
      this.game.onChat("notice", "[GM] No target player selected.");
      return;
    }
    if (target.isLocal) {
      this.game.onChat("notice", "[GM] Select another online player to summon.");
      return;
    }
    const gmMapId = this.game.map?.id || 910000000;
    const gmX = Math.round(this.game.p.x);
    const gmY = Math.round(this.game.p.y);
    await this.executeGmAction("summon", {
      targetId: target.id,
      targetName: target.name,
      mapId: gmMapId,
      x: gmX,
      y: gmY,
    });
    for (const rp of this.game.remotePlayers.values()) {
      if ((rp.name || "").toLowerCase() === target.name.toLowerCase() || rp.id === target.id) {
        rp.x = gmX;
        rp.y = gmY;
        rp.targetX = gmX;
        rp.targetY = gmY;
      }
    }
    this.game.onChat("notice", `[GM] Summoned ${target.name} to your location (${gmX}, ${gmY}).`);
    this.fetchPlayers();
  }

  private async healTarget() {
    const target = this.getSelected();
    if (!target) return;
    await this.executeGmAction("heal", { targetId: target.id, targetName: target.name });
    this.game.onChat("notice", `[GM] Sent divine blessing to ${target.name}.`);
  }

  private async mesoTarget(amount = 1000000) {
    const target = this.getSelected();
    if (!target) return;
    await this.executeGmAction("meso", { targetId: target.id, targetName: target.name, amount });
    this.game.onChat("notice", `[GM] Sent +${amount.toLocaleString()} mesos to ${target.name}.`);
  }

  private async expTarget(amount = 100000) {
    const target = this.getSelected();
    if (!target) return;
    await this.executeGmAction("exp", { targetId: target.id, targetName: target.name, amount });
    this.game.onChat("notice", `[GM] Sent +${amount.toLocaleString()} EXP to ${target.name}.`);
  }

  private async levelUpTarget() {
    const target = this.getSelected();
    if (!target) return;
    await this.executeGmAction("levelup", { targetId: target.id, targetName: target.name, levels: 1 });
    this.game.onChat("notice", `[GM] Granted +1 Level to ${target.name}.`);
  }

  private async toggleAutoCombatTarget() {
    const target = this.getSelected();
    if (!target) return;
    if (target.isLocal) {
      const next = !Boolean(this.game.auto?.battle);
      this.game.setAutoBattle(next);
      this.game.onChat("notice", `★ [GM] Auto-Combat: ${next ? "ON" : "OFF"}`);
    } else {
      const next = !Boolean(target.autoCombat);
      target.autoCombat = next;
      await this.executeGmAction("autocombat", { targetId: target.id, targetName: target.name, enabled: next });
      this.game.onChat("notice", `★ [GM] Forced Auto-Combat ${next ? "ON" : "OFF"} for ${target.name}.`);
    }
    this.renderTabContent();
  }

  private whisperTarget() {
    const target = this.getSelected();
    if (!target) return;
    window.dispatchEvent(new CustomEvent("chat-quick-whisper", { detail: { name: target.name } }));
  }

  private async forcePartyTarget() {
    const target = this.getSelected();
    if (!target) return;
    const res = await PartyClient.forceJoin(this.game.stats.name, target.name);
    if (res.ok) {
      this.game.party = res.party ?? null;
      this.game.partyId = res.party?.id;
      this.game.onChat("notice", `★ [GM Action] Forced ${target.name} into your party!`);
      window.dispatchEvent(new CustomEvent("party-state-changed", { detail: { party: this.game.party } }));
      this.game.onChange();
    } else {
      this.game.onChat("notice", `[GM] Failed to force into party: ${res.error || "Unknown error"}`);
    }
  }

  private async freezeTarget() {
    const target = this.getSelected();
    if (!target) return;
    await this.executeGmAction("freeze", { targetId: target.id, targetName: target.name, frozen: true });
    this.game.onChat("notice", `[GM] Immobilized ${target.name}.`);
  }

  private async muteTarget() {
    const target = this.getSelected();
    if (!target) return;
    await this.executeGmAction("mute", { targetId: target.id, targetName: target.name });
    this.game.onChat("notice", `[GM] Muted chat for ${target.name}.`);
  }

  private async kickTarget() {
    const target = this.getSelected();
    if (!target) return;
    if (confirm(`Kick player "${target.name}" from server?`)) {
      await this.executeGmAction("kick", { targetId: target.id, targetName: target.name });
      this.game.onChat("notice", `[GM] Disconnected ${target.name}.`);
      this.fetchPlayers();
    }
  }

  private async banTarget() {
    const target = this.getSelected();
    if (!target) return;
    if (confirm(`PERMANENTLY BAN player "${target.name}" from Maple Wayfarer?`)) {
      await this.executeGmAction("ban", { targetId: target.id, targetName: target.name });
      this.game.onChat("notice", `[GM] Banned ${target.name} from server.`);
      this.fetchPlayers();
    }
  }

  private async broadcastNotice() {
    const text = prompt("Broadcast Server Notice:");
    if (text && text.trim()) {
      await this.executeGmAction("notice", { text: text.trim() });
      this.game.onChat("notice", `[Broadcast] ${text.trim()}`);
    }
  }

  private async promptMapAlert() {
    const text = prompt("Map Alert Message:");
    if (text && text.trim()) {
      this.game.onChat("notice", `★ [Map Alert] ${text.trim()}`);
    }
  }

  private async serverHealAll() {
    await this.executeGmAction("heal_all", {});
    this.game.onChat("notice", "[GM] Cast server-wide divine healing on all players!");
  }

  private async clearMapDrops() {
    await this.executeGmAction("cleardrops", { mapId: this.game.map?.id || 0 });
    if (Array.isArray(this.game.drops)) {
      this.game.drops = [];
    }
    this.game.onChat("notice", "[GM] Ground items cleared on current map.");
  }

  private async executeGmAction(action: string, payload: any) {
    try {
      await fetch("/api/gm/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
    } catch {}
  }

  public destroy() {
    this.root.remove();
  }
}
