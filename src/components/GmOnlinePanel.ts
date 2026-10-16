// Compact Translucent Player List with Lucide Icons
// WebGPU / Orillusion ComponentBase architecture
import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import type { Windows } from "../windows.ts";
import { el } from "../util.ts";
import { lucideIcon } from "../lucide.ts";

export interface OnlinePlayerInfo {
  id: string;
  name: string;
  mapId: number;
  x: number;
  y: number;
  anim?: string;
  frame?: number;
  face?: number;
  look: number[];
  isLocal?: boolean;
}

const MAP_NAMES: Record<number, string> = {
  910000000: "Free Market",
  100010000: "Henesys Hunting",
  100020000: "Henesys Market",
  101010000: "Ellinia Outskirts",
  100000000: "Henesys Town",
};

export class GmOnlinePanel extends ComponentBase {
  root!: HTMLElement;
  tabBtn!: HTMLButtonElement;
  panelBox!: HTMLElement;
  playerListEl!: HTMLElement;
  countBadge!: HTMLElement;
  tabCountBadge!: HTMLElement;
  searchInput!: HTMLInputElement;

  private parentEl!: HTMLElement;
  private game!: Game;
  private wins?: Windows;
  private collapsed = true;
  private players: OnlinePlayerInfo[] = [];
  private searchQuery = "";
  private pollTimer = 0;
  private lastFetchTime = 0;

  constructor(opts?: { parent: HTMLElement; game: Game; wins?: Windows }) {
    super();
    if (opts) {
      this.parentEl = opts.parent;
      this.game = opts.game;
      this.wins = opts.wins;
      this.initComponent();
    }
  }

  public override init(param?: { parent: HTMLElement; game: Game; wins?: Windows }): void {
    super.init(param);
    if (param?.parent && param?.game && !this.root) {
      this.parentEl = param.parent;
      this.game = param.game;
      this.wins = param.wins;
      this.initComponent();
    }
  }

  private initComponent() {
    try {
      this.collapsed = localStorage.getItem("ms_gm_panel_collapsed") !== "false";
    } catch {
      this.collapsed = true;
    }

    this.root = el(
      "div",
      "gm-online-container fixed right-0 top-[60px] z-[120] pointer-events-auto select-none font-sans transition-all duration-150",
      this.parentEl
    );

    // Collapsed Trigger Tab (Compact translucent pill on right edge)
    this.tabBtn = el(
      "button",
      "gm-collapse-tab flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer bg-slate-950/65 hover:bg-slate-900/80 border-l border-t border-b border-white/10 rounded-l-md backdrop-blur-[14px] shadow-lg text-slate-300 transition-all active:translate-x-[-1px]",
      this.root
    ) as HTMLButtonElement;
    this.tabBtn.type = "button";
    this.tabBtn.title = "Online Players";
    this.tabBtn.innerHTML = `
      ${lucideIcon("users", 13, "text-sky-400")}
      <span class="gm-tab-count font-mono font-bold text-[10px] text-white">1</span>
      ${lucideIcon("chevron-left", 12, "text-slate-400")}
    `;
    this.tabCountBadge = this.tabBtn.querySelector(".gm-tab-count") as HTMLElement;
    this.tabBtn.addEventListener("click", () => {
      this.toggleCollapse(false);
    });

    // Expanded Translucent Panel Box
    this.panelBox = el(
      "div",
      "gm-panel-box flex flex-col w-[268px] max-h-[calc(100vh-130px)] bg-slate-950/65 border-l border-t border-b border-white/10 rounded-l-lg backdrop-blur-[16px] shadow-[0_12px_40px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden hidden",
      this.root
    );

    // Compact Header (No "GM Panel" text)
    const header = el("div", "flex items-center justify-between px-2.5 py-2 bg-white/[0.03] border-b border-white/10", this.panelBox);
    header.innerHTML = `
      <div class="flex items-center gap-1.5 min-w-0">
        ${lucideIcon("users", 13, "text-sky-400 flex-shrink-0")}
        <span class="gm-panel-count font-mono font-bold text-[11px] text-white truncate">1 Online</span>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <button type="button" class="gm-btn-broadcast p-1 rounded hover:bg-white/10 text-slate-300 hover:text-amber-300 transition-colors" title="Broadcast Notice">
          ${lucideIcon("megaphone", 12)}
        </button>
        <button type="button" class="gm-btn-refresh p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors" title="Refresh">
          ${lucideIcon("refresh", 12)}
        </button>
        <button type="button" class="gm-btn-collapse p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Collapse">
          ${lucideIcon("chevron-right", 13)}
        </button>
      </div>
    `;

    this.countBadge = header.querySelector(".gm-panel-count") as HTMLElement;
    header.querySelector(".gm-btn-collapse")?.addEventListener("click", () => this.toggleCollapse(true));
    header.querySelector(".gm-btn-refresh")?.addEventListener("click", () => this.fetchPlayers());
    header.querySelector(".gm-btn-broadcast")?.addEventListener("click", () => this.promptBroadcast());

    // Minimal Search bar
    const searchRow = el("div", "relative px-2 py-1.5 bg-black/20 border-b border-white/5 flex items-center", this.panelBox);
    const searchIcon = el("span", "absolute left-3.5 pointer-events-none text-slate-400 flex items-center", searchRow);
    searchIcon.innerHTML = lucideIcon("search", 11);
    this.searchInput = el("input", "w-full pl-6 pr-2 py-1 bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 focus:border-sky-400/50 rounded text-[10.5px] text-white placeholder-slate-500 outline-none transition-colors font-sans", searchRow) as HTMLInputElement;
    this.searchInput.placeholder = "Filter players or maps...";
    this.searchInput.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
      this.renderPlayers();
    });

    // Player List scroll area
    this.playerListEl = el("div", "gm-player-list flex-1 overflow-y-auto p-1.5 flex flex-col gap-1.5 max-h-[50vh]", this.panelBox);

    this.updateCollapseUI();
    this.syncVisibility();
    this.fetchPlayers();
  }

  private toggleCollapse(collapsed: boolean) {
    this.collapsed = collapsed;
    try {
      localStorage.setItem("ms_gm_panel_collapsed", String(collapsed));
    } catch {}
    this.updateCollapseUI();
    if (!collapsed) {
      this.fetchPlayers();
    }
  }

  private updateCollapseUI() {
    if (this.collapsed) {
      this.tabBtn?.classList.remove("hidden");
      this.panelBox?.classList.add("hidden");
    } else {
      this.tabBtn?.classList.add("hidden");
      this.panelBox?.classList.remove("hidden");
    }
  }

  public syncVisibility() {
    if (!this.root) return;
    const isGm = this.game?.isGm?.() ?? false;
    this.root.style.display = isGm ? "block" : "none";
  }

  public update(dt: number) {
    this.pollTimer += dt;
    if (this.pollTimer >= 3) {
      this.pollTimer = 0;
      this.syncVisibility();
      if (this.game?.isGm?.()) {
        this.fetchPlayers();
      }
    }
  }

  async fetchPlayers() {
    if (!this.game) return;
    const now = Date.now();
    if (now - this.lastFetchTime < 1000) return;
    this.lastFetchTime = now;

    // 1. Local Player
    const localPlayer: OnlinePlayerInfo = {
      id: this.game.wsId || "LOCAL",
      name: this.game.stats.name || "Adventurer",
      mapId: this.game.map?.id || 910000000,
      x: Math.round(this.game.p.x),
      y: Math.round(this.game.p.y),
      anim: this.game.p.anim,
      frame: this.game.p.frame,
      face: this.game.p.face,
      look: this.game.look,
      isLocal: true,
    };

    const playerMap = new Map<string, OnlinePlayerInfo>();
    playerMap.set(localPlayer.name.toLowerCase(), localPlayer);

    // 2. Add remote players in local map
    for (const [id, rp] of this.game.remotePlayers) {
      const name = rp.name || id;
      if (name.toLowerCase() === localPlayer.name.toLowerCase()) continue;
      playerMap.set(name.toLowerCase(), {
        id,
        name,
        mapId: this.game.map?.id || 910000000,
        x: Math.round(rp.x),
        y: Math.round(rp.y),
        anim: rp.anim,
        frame: rp.frame,
        face: rp.face,
        look: rp.look,
        isLocal: false,
      });
    }

    // 3. Query server-wide sessions
    try {
      const res = await fetch("/api/gm/players", { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.players)) {
          for (const sp of data.players) {
            const name = sp.name || sp.id;
            if (name.toLowerCase() === localPlayer.name.toLowerCase()) continue;
            playerMap.set(name.toLowerCase(), {
              id: sp.id,
              name,
              mapId: sp.mapId,
              x: sp.x,
              y: sp.y,
              anim: sp.anim,
              frame: sp.frame,
              face: sp.face,
              look: sp.look || [2000, 12000, 20000, 30030],
              isLocal: false,
            });
          }
        }
      }
    } catch {}

    this.players = [...playerMap.values()];
    this.renderPlayers();
  }

  private renderPlayers() {
    if (!this.playerListEl) return;
    const totalCount = this.players.length;

    if (this.countBadge) {
      this.countBadge.textContent = `${totalCount} Online`;
    }
    if (this.tabCountBadge) {
      this.tabCountBadge.textContent = String(totalCount);
    }

    const q = this.searchQuery;
    const filtered = this.players.filter((p) => {
      if (!q) return true;
      const mapName = (MAP_NAMES[p.mapId] || `Map ${p.mapId}`).toLowerCase();
      return p.name.toLowerCase().includes(q) || mapName.includes(q) || String(p.mapId).includes(q);
    });

    if (filtered.length === 0) {
      this.playerListEl.innerHTML = `
        <div class="p-3 text-center text-slate-500 text-[10.5px] bg-white/[0.02] rounded border border-white/5">
          No players found.
        </div>
      `;
      return;
    }

    this.playerListEl.innerHTML = "";

    for (const p of filtered) {
      const card = el("div", "gm-player-card bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 rounded p-1.5 transition-colors flex flex-col gap-1", this.playerListEl);

      const mapName = MAP_NAMES[p.mapId] || `Map ${p.mapId}`;
      const avatarUrl = `/wz/char?eq=${(p.look || [2000, 12000, 20000, 30030]).join(",")}&action=stand1&frame=0`;

      const topRow = el("div", "flex items-center gap-1.5", card);
      topRow.innerHTML = `
        <div class="relative w-7 h-7 rounded bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
          <img src="${avatarUrl}" class="w-full h-full object-contain image-rendering-pixelated" alt="${p.name}" onerror="this.src='/wz/sprite/Mob/0100100/stand/0'" />
          ${p.isLocal ? `<span class="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-amber-400"></span>` : ""}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1">
            <span class="font-bold text-[11px] text-slate-100 truncate">${p.name}</span>
            ${p.isLocal ? `<span class="px-1 py-0 rounded bg-amber-500/20 text-amber-300 font-mono text-[8px] border border-amber-500/30">YOU</span>` : ""}
          </div>
          <div class="text-[9px] text-slate-400 flex items-center gap-1 truncate">
            <span class="text-cyan-300 truncate">${mapName}</span>
            <span class="text-slate-500 font-mono">(${p.x},${p.y})</span>
          </div>
        </div>
      `;

      // Compact Lucide Icon Action Buttons (No clunky labels)
      const actionsRow = el("div", "flex items-center justify-end gap-1 pt-0.5 border-t border-white/5", card);

      if (p.isLocal) {
        actionsRow.innerHTML = `
          <button type="button" class="gm-act-btn heal p-1 rounded bg-white/5 hover:bg-emerald-500/25 text-emerald-300 border border-white/10" title="Full Heal">
            ${lucideIcon("sparkles", 11)}
          </button>
          <button type="button" class="gm-act-btn meso p-1 rounded bg-white/5 hover:bg-amber-500/25 text-amber-300 border border-white/10" title="+1M Mesos">
            ${lucideIcon("coins", 11)}
          </button>
          <button type="button" class="gm-act-btn switch-char p-1 rounded bg-white/5 hover:bg-white/15 text-slate-300 border border-white/10" title="Switch Character">
            ${lucideIcon("logout", 11)}
          </button>
        `;

        actionsRow.querySelector(".heal")?.addEventListener("click", () => {
          this.game.stats.hp = this.game.stats.maxHp;
          this.game.stats.mp = this.game.stats.maxMp;
          this.game.onChat("notice", "[GM] Self HP/MP fully restored!");
          this.game.onChange();
        });
        actionsRow.querySelector(".meso")?.addEventListener("click", () => {
          this.game.stats.meso = (this.game.stats.meso || 0) + 1000000;
          this.game.onChat("notice", "[GM] Added +1,000,000 mesos.");
          this.game.onChange();
        });
        actionsRow.querySelector(".switch-char")?.addEventListener("click", async () => {
          if (window.__persist) {
            try { await window.__persist(); } catch {}
          }
          sessionStorage.setItem("ms_skip_autologin", "1");
          location.reload();
        });
      } else {
        actionsRow.innerHTML = `
          <button type="button" class="gm-act-btn warp p-1 rounded bg-white/5 hover:bg-sky-500/25 text-sky-300 border border-white/10" title="Warp to player">
            ${lucideIcon("zap", 11)}
          </button>
          <button type="button" class="gm-act-btn summon p-1 rounded bg-white/5 hover:bg-purple-500/25 text-purple-300 border border-white/10" title="Summon to GM">
            ${lucideIcon("map-pin", 11)}
          </button>
          <button type="button" class="gm-act-btn dm p-1 rounded bg-white/5 hover:bg-white/15 text-slate-300 border border-white/10" title="Whisper">
            ${lucideIcon("message", 11)}
          </button>
          <button type="button" class="gm-act-btn heal p-1 rounded bg-white/5 hover:bg-emerald-500/25 text-emerald-300 border border-white/10" title="Divine Heal">
            ${lucideIcon("sparkles", 11)}
          </button>
          <button type="button" class="gm-act-btn meso p-1 rounded bg-white/5 hover:bg-amber-500/25 text-amber-300 border border-white/10" title="+1M Mesos">
            ${lucideIcon("coins", 11)}
          </button>
          <button type="button" class="gm-act-btn kick p-1 rounded bg-white/5 hover:bg-rose-500/25 text-rose-400 border border-white/10" title="Kick from server">
            ${lucideIcon("kick", 11)}
          </button>
        `;

        actionsRow.querySelector(".warp")?.addEventListener("click", async () => {
          if (this.game.map?.id !== p.mapId) {
            await this.game.loadMap(p.mapId, "spawn");
          }
          this.game.p.x = p.x;
          this.game.p.y = p.y;
          this.game.snapCamera();
          this.game.onChat("notice", `[GM] Warped to ${p.name}.`);
        });

        actionsRow.querySelector(".summon")?.addEventListener("click", async () => {
          await this.executeGmAction("summon", {
            targetId: p.id,
            targetName: p.name,
            mapId: this.game.map?.id || 910000000,
            x: Math.round(this.game.p.x),
            y: Math.round(this.game.p.y),
          });
          this.game.onChat("notice", `[GM] Summoned ${p.name} to you.`);
        });

        actionsRow.querySelector(".dm")?.addEventListener("click", () => {
          const chatField = document.querySelector(".chat-field") as HTMLInputElement;
          if (chatField) {
            chatField.focus();
            chatField.value = `/w ${p.name} `;
          }
        });

        actionsRow.querySelector(".heal")?.addEventListener("click", async () => {
          await this.executeGmAction("heal", { targetId: p.id, targetName: p.name });
          this.game.onChat("notice", `[GM] Sent divine blessing to ${p.name}.`);
        });

        actionsRow.querySelector(".meso")?.addEventListener("click", async () => {
          await this.executeGmAction("meso", { targetId: p.id, targetName: p.name, amount: 1000000 });
          this.game.onChat("notice", `[GM] Sent +1,000,000 mesos to ${p.name}.`);
        });

        actionsRow.querySelector(".kick")?.addEventListener("click", async () => {
          if (confirm(`Kick player ${p.name}?`)) {
            await this.executeGmAction("kick", { targetId: p.id, targetName: p.name });
            this.game.onChat("notice", `[GM] Disconnected ${p.name}.`);
            this.fetchPlayers();
          }
        });
      }
    }
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

  private async promptBroadcast() {
    const text = prompt("Broadcast Server Notice:");
    if (text && text.trim()) {
      await this.executeGmAction("notice", { text: text.trim() });
      this.game.onChat("notice", `[Broadcast] ${text.trim()}`);
    }
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
    this.root?.remove();
  }
}
