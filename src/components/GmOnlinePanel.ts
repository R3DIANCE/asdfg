// Compact Translucent Player List with Lucide Icons
// WebGPU / Orillusion ComponentBase architecture
import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import type { Windows } from "../windows.ts";
import { el } from "../util.ts";
import { lucideIcon } from "../lucide.ts";
import { PartyClient } from "../party.ts";
import { getMapDisplayName } from "../mapNames.ts";

export interface OnlinePlayerInfo {
  id: string;
  name: string;
  level?: number;
  job?: string;
  mapId: number;
  mapName?: string;
  x: number;
  y: number;
  anim?: string;
  frame?: number;
  face?: number;
  look: number[];
  isLocal?: boolean;
  online?: boolean;
  autoCombat?: boolean;
  godMode?: boolean;
  gmEffect?: boolean;
}

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
      "gm-collapse-tab flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer bg-zinc-950/65 hover:bg-zinc-900/80 border-l border-t border-b border-white/10 rounded-l-md backdrop-blur-[14px] shadow-lg text-zinc-300 transition-all active:translate-x-[-1px]",
      this.root
    ) as HTMLButtonElement;
    this.tabBtn.type = "button";
    this.tabBtn.title = "Online Players";
    this.tabBtn.innerHTML = `
      ${lucideIcon("users", 13, "text-sky-400")}
      <span class="gm-tab-count font-mono font-bold text-[10px] text-white">1</span>
      ${lucideIcon("chevron-left", 12, "text-zinc-400")}
    `;
    this.tabCountBadge = this.tabBtn.querySelector(".gm-tab-count") as HTMLElement;
    this.tabBtn.addEventListener("click", () => {
      this.toggleCollapse(false);
    });

    // Expanded Translucent Panel Box (Shadcn Glass Card)
    this.panelBox = el(
      "div",
      "gm-panel-box flex flex-col w-[290px] max-h-[calc(100vh-130px)] bg-zinc-950/85 border-l border-t border-b border-white/10 rounded-l-xl backdrop-blur-md shadow-[0_16px_48px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden hidden",
      this.root
    );

    // Compact Header (Shadcn style with subtle glass)
    const header = el("div", "flex items-center justify-between px-3 py-2 bg-white/[0.03] border-b border-white/10", this.panelBox);
    header.innerHTML = `
      <div class="flex items-center gap-1.5 min-w-0">
        ${lucideIcon("users", 13, "text-sky-400 flex-shrink-0")}
        <span class="gm-panel-count font-mono font-bold text-[11px] text-white truncate">1 Online</span>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <button type="button" class="gm-btn-broadcast p-1 rounded hover:bg-white/10 text-zinc-300 hover:text-amber-300 transition-colors" title="Broadcast Notice">
          ${lucideIcon("megaphone", 12)}
        </button>
        <button type="button" class="gm-btn-refresh p-1 rounded hover:bg-white/10 text-zinc-300 hover:text-white transition-colors" title="Refresh">
          ${lucideIcon("refresh", 12)}
        </button>
        <button type="button" class="gm-btn-collapse p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors" title="Collapse">
          ${lucideIcon("chevron-right", 13)}
        </button>
      </div>
    `;

    this.countBadge = header.querySelector(".gm-panel-count") as HTMLElement;
    header.querySelector(".gm-btn-collapse")?.addEventListener("click", () => this.toggleCollapse(true));
    header.querySelector(".gm-btn-refresh")?.addEventListener("click", () => this.fetchPlayers());
    header.querySelector(".gm-btn-broadcast")?.addEventListener("click", () => this.promptBroadcast());

    // Clean Shadcn Search Bar with high-visibility aligned Lucide Search Icon
    const searchRow = el("div", "p-2 bg-zinc-950/40 border-b border-white/10", this.panelBox);
    const searchWrap = el("div", "relative flex items-center w-full", searchRow);
    const searchIcon = el(
      "span",
      "absolute left-2.5 inset-y-0 flex items-center justify-center pointer-events-none text-zinc-400 z-10",
      searchWrap
    );
    searchIcon.innerHTML = lucideIcon("search", 12.5, "text-zinc-400");
    this.searchInput = el(
      "input",
      "flex h-7 w-full rounded-md border border-white/15 bg-zinc-950/60 pl-8 pr-2.5 text-[11px] text-white shadow-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 focus-visible:border-sky-400 transition-colors block box-border",
      searchWrap
    ) as HTMLInputElement;
    this.searchInput.placeholder = "Filter operatives or maps...";
    this.searchInput.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
      this.renderPlayers();
    });

    // Player List scroll area
    this.playerListEl = el("div", "gm-player-list flex-1 overflow-y-auto p-2 flex flex-col gap-2 max-h-[50vh]", this.panelBox);

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
      level: this.game.stats.level || 1,
      job: this.game.stats.job || "Beginner",
      mapId: this.game.map?.id || 910000000,
      mapName: this.game.map?.name,
      x: Math.round(this.game.p.x),
      y: Math.round(this.game.p.y),
      anim: this.game.p.anim,
      frame: this.game.p.frame,
      face: this.game.p.face,
      look: this.game.look,
      isLocal: true,
      online: true,
      autoCombat: Boolean(this.game.auto?.battle),
      godMode: Boolean(this.game.godMode),
      gmEffect: Boolean(this.game.gmEffect),
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
        level: rp.level || 1,
        job: rp.job || "Beginner",
        mapId: this.game.map?.id || 910000000,
        mapName: this.game.map?.name,
        x: Math.round(rp.x),
        y: Math.round(rp.y),
        anim: rp.anim,
        frame: rp.frame,
        face: rp.face,
        look: rp.look,
        isLocal: false,
        online: true,
      });
    }

    // 3. Query server-wide sessions
    try {
      const res = await fetch("/api/gm/players", { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.players)) {
          for (const sp of data.players) {
            if (sp.online === false) continue;
            const name = sp.name || sp.id;
            if (name.toLowerCase() === localPlayer.name.toLowerCase()) continue;
            playerMap.set(name.toLowerCase(), {
              id: sp.id,
              name,
              level: sp.level || 1,
              job: sp.job || "Beginner",
              mapId: sp.mapId,
              mapName: sp.mapName,
              x: sp.x,
              y: sp.y,
              anim: sp.anim,
              frame: sp.frame,
              face: sp.face,
              look: sp.look || [2000, 12000, 20000, 30030],
              isLocal: false,
              online: true,
              autoCombat: Boolean(sp.autoCombat),
              godMode: Boolean(sp.godMode),
              gmEffect: Boolean(sp.gmEffect),
            });
          }
        }
      }
    } catch {}

    this.players = [...playerMap.values()].filter((p) => p.online !== false);
    this.renderPlayers();
  }

  private renderPlayers() {
    if (!this.playerListEl) return;
    const count = this.players.filter((p) => p.online !== false).length;

    if (this.countBadge) {
      this.countBadge.textContent = `${count} Online`;
    }
    if (this.tabCountBadge) {
      this.tabCountBadge.textContent = String(count);
    }

    const q = this.searchQuery;
    const filtered = this.players.filter((p) => {
      if (p.online === false) return false;
      if (!q) return true;
      const mapName = getMapDisplayName(p.mapId, p.mapName, this.game.map).toLowerCase();
      return p.name.toLowerCase().includes(q) || mapName.includes(q) || String(p.mapId).includes(q);
    });

    if (filtered.length === 0) {
      this.playerListEl.innerHTML = `
        <div class="p-3 text-center text-zinc-500 text-[10.5px] bg-white/[0.02] rounded border border-white/5">
          No players found.
        </div>
      `;
      return;
    }

    this.playerListEl.innerHTML = "";

    for (const p of filtered) {
      const card = el(
        "div",
        `gm-player-card bg-zinc-900/60 hover:bg-zinc-900/85 border border-white/10 rounded-lg p-2 transition-all flex flex-col gap-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.35)]`,
        this.playerListEl
      );

      const mapName = getMapDisplayName(p.mapId, p.mapName, this.game.map, () => this.renderPlayers());
      const avatarUrl = `/wz/char?eq=${(p.look || [2000, 12000, 20000, 30030]).join(",")}&action=stand1&frame=0&portrait=1`;
      const isAutoOn = p.isLocal ? Boolean(this.game.auto?.battle) : Boolean(p.autoCombat);
      const isGodOn = p.isLocal ? Boolean(this.game.godMode) : Boolean(p.godMode);

      const avatarIndicator = p.isLocal
        ? `<span class="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full ${isGodOn ? "bg-amber-400 animate-pulse" : "bg-emerald-400"} border border-zinc-950"></span>`
        : `<span class="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-zinc-950" title="Online Player"></span>`;

      const topRow = el("div", "flex items-center gap-2", card);
      topRow.innerHTML = `
        <div class="relative w-8 h-8 rounded-md bg-zinc-950/90 border border-white/15 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-inner">
          <img src="${avatarUrl}" class="w-full h-full object-contain image-rendering-pixelated" alt="${p.name}" onerror="this.src='/wz/sprite/Mob/0100100/stand/0'" />
          ${avatarIndicator}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span class="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/35 font-mono text-[9px] font-bold tracking-tight shadow-sm">Lv. ${p.level ?? 1}</span>
            <span class="font-bold text-[11px] text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">${p.name}</span>
            ${p.isLocal ? `<span class="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[7.5px] border border-sky-500/30 font-bold">YOU</span>` : ""}
            ${isGodOn ? `<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[7.5px] border border-amber-500/30 font-bold">GOD</span>` : ""}
            ${isAutoOn ? `<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[7.5px] border border-emerald-500/30 font-bold">AUTO</span>` : ""}
          </div>
          <div class="text-[9px] text-zinc-400 flex items-center gap-1.5 truncate">
            <span class="text-sky-300 truncate font-medium">${mapName}</span>
            <span class="text-zinc-500 font-mono">(${p.x},${p.y})</span>
          </div>
        </div>
      `;

      // Compact Lucide Icon Action Buttons Grid - Equal sized boxes
      const actionsRow = el("div", "w-full pt-1.5 border-t border-white/10", card);

      if (p.isLocal) {
        actionsRow.innerHTML = `
          <div class="flex items-center gap-1.5 flex-wrap">
            <button type="button" class="gm-act-btn heal" title="Full Heal">
              ${lucideIcon("sparkles", 11, "text-emerald-400")}
            </button>
            <button type="button" class="gm-act-btn meso" title="+1M Mesos">
              ${lucideIcon("coins", 11, "text-amber-400")}
            </button>
            <button type="button" class="gm-act-btn autocombat ${isAutoOn ? "border-emerald-400/60 bg-emerald-500/25 text-emerald-300" : "text-zinc-400"}" title="Force Toggle Auto-Combat (${isAutoOn ? "ON" : "OFF"})">
              ${lucideIcon("swords", 11, isAutoOn ? "text-emerald-300" : "text-zinc-400")}
            </button>
            <button type="button" class="gm-act-btn gmeffect ${this.game.gmEffect ? "border-amber-400/60 bg-amber-500/25 text-amber-300" : "text-zinc-400"}" title="Toggle Wizet GM Overhead Effect">
              ${lucideIcon("crown", 11, this.game.gmEffect ? "text-amber-300" : "text-zinc-400")}
            </button>
            <button type="button" class="gm-act-btn godmode ${this.game.godMode ? "border-yellow-400/60 bg-yellow-500/25 text-yellow-300" : "text-zinc-400"}" title="Toggle God Mode (Invincible)">
              ${lucideIcon("shield", 11, this.game.godMode ? "text-yellow-300" : "text-zinc-400")}
            </button>
            <button type="button" class="gm-act-btn switch-char" title="Switch Character">
              ${lucideIcon("logout", 11, "text-zinc-300")}
            </button>
          </div>
        `;

        actionsRow.querySelector(".autocombat")?.addEventListener("click", () => {
          const next = !Boolean(this.game.auto?.battle);
          this.game.setAutoBattle(next);
          this.game.onChat("notice", `★ [GM] Auto-Combat: ${next ? "ON" : "OFF"}`);
          this.renderPlayers();
        });
        actionsRow.querySelector(".gmeffect")?.addEventListener("click", () => {
          this.game.toggleGmEffect();
          this.renderPlayers();
        });
        actionsRow.querySelector(".godmode")?.addEventListener("click", () => {
          this.game.godMode = !this.game.godMode;
          this.game.syncAll();
          this.game.onChat("notice", `[GM] God Mode (Invincible): ${this.game.godMode ? "ON" : "OFF"}`);
          this.renderPlayers();
        });
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
          <div class="flex items-center gap-1.5 flex-wrap">
            <button type="button" class="gm-act-btn warp" title="Warp to player">
              ${lucideIcon("zap", 11, "text-sky-400")}
            </button>
            <button type="button" class="gm-act-btn summon" title="Summon to GM">
              ${lucideIcon("map-pin", 11, "text-purple-400")}
            </button>
            <button type="button" class="gm-act-btn autocombat ${isAutoOn ? "border-emerald-400/60 bg-emerald-500/25 text-emerald-300" : "text-zinc-400"}" title="Force Toggle Auto-Combat (${isAutoOn ? "ON" : "OFF"})">
              ${lucideIcon("swords", 11, isAutoOn ? "text-emerald-300" : "text-zinc-400")}
            </button>
            <button type="button" class="gm-act-btn dm" title="Quick Whisper (@${p.name})">
              ${lucideIcon("message", 11, "text-zinc-300")}
            </button>
            <button type="button" class="gm-act-btn heal" title="Divine Heal">
              ${lucideIcon("sparkles", 11, "text-emerald-400")}
            </button>
            <button type="button" class="gm-act-btn meso" title="+1M Mesos">
              ${lucideIcon("coins", 11, "text-amber-400")}
            </button>
            <button type="button" class="gm-act-btn force-party" title="Force into Party">
              ${lucideIcon("user-plus", 11, "text-indigo-400")}
            </button>
            <button type="button" class="gm-act-btn kick" title="Kick from server">
              ${lucideIcon("kick", 11, "text-rose-400")}
            </button>
          </div>
        `;

        actionsRow.querySelector(".autocombat")?.addEventListener("click", async () => {
          const next = !Boolean(p.autoCombat);
          p.autoCombat = next;
          await this.executeGmAction("autocombat", { targetId: p.id, targetName: p.name, enabled: next });
          this.game.onChat("notice", `★ [GM] Forced Auto-Combat ${next ? "ON" : "OFF"} for ${p.name}.`);
          this.renderPlayers();
        });

        actionsRow.querySelector(".force-party")?.addEventListener("click", async () => {
          const res = await PartyClient.forceJoin(this.game.stats.name, p.name);
          if (res.ok) {
            this.game.party = res.party ?? null;
            this.game.partyId = res.party?.id;
            this.game.onChat("notice", `★ [GM Action] Forced ${p.name} into your party!`);
            window.dispatchEvent(new CustomEvent("party-state-changed", { detail: { party: this.game.party } }));
            this.game.onChange();
          } else {
            this.game.onChat("notice", `[GM] Failed to force into party: ${res.error || "Unknown error"}`);
          }
        });

        actionsRow.querySelector(".warp")?.addEventListener("click", async () => {
          let targetMapId = p.mapId || 910000000;
          let targetX = p.x;
          let targetY = p.y;
          try {
            const res = await fetch("/api/gm/players", { signal: AbortSignal.timeout(1200) });
            if (res.ok) {
              const data = await res.json();
              const fresh = Array.isArray(data.players)
                ? data.players.find((sp: any) => (sp.name || "").toLowerCase() === p.name.toLowerCase() || sp.id === p.id)
                : null;
              if (fresh) {
                targetMapId = Number(fresh.mapId || targetMapId);
                targetX = Number(fresh.x ?? targetX);
                targetY = Number(fresh.y ?? targetY);
              }
            }
          } catch {}
          for (const rp of this.game.remotePlayers.values()) {
            if ((rp.name || "").toLowerCase() === p.name.toLowerCase()) {
              targetMapId = this.game.map?.id || targetMapId;
              targetX = Math.round(rp.x);
              targetY = Math.round(rp.y);
              break;
            }
          }
          await this.game.warpToLocation(targetMapId, targetX, targetY);
          this.game.onChat("notice", `[GM] Warped to ${p.name} at (${Math.round(this.game.p.x)}, ${Math.round(this.game.p.y)}).`);
          this.fetchPlayers();
        });

        actionsRow.querySelector(".summon")?.addEventListener("click", async () => {
          const gmMapId = this.game.map?.id || 910000000;
          const gmX = Math.round(this.game.p.x);
          const gmY = Math.round(this.game.p.y);
          await this.executeGmAction("summon", {
            targetId: p.id,
            targetName: p.name,
            mapId: gmMapId,
            x: gmX,
            y: gmY,
          });
          for (const rp of this.game.remotePlayers.values()) {
            if ((rp.name || "").toLowerCase() === p.name.toLowerCase() || rp.id === p.id) {
              rp.x = gmX;
              rp.y = gmY;
              rp.targetX = gmX;
              rp.targetY = gmY;
            }
          }
          this.game.onChat("notice", `[GM] Summoned ${p.name} to your location (${gmX}, ${gmY}).`);
          this.fetchPlayers();
        });

        actionsRow.querySelector(".dm")?.addEventListener("click", () => {
          window.dispatchEvent(new CustomEvent("chat-quick-whisper", { detail: { name: p.name } }));
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
