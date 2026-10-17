// MapleStory Dedicated Party UI Widget — On-screen Real-time Party HUD
// ComponentBase architecture for WebGPU/DOM HUD
import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import { el, esc } from "../util.ts";
import { lucideIcon } from "../lucide.ts";
import { PartyClient } from "../party.ts";
import { RUNE_SKILL_DEFS } from "../game-types.ts";

export class PartyWidget extends ComponentBase {
  root!: HTMLElement;
  container!: HTMLElement;
  collapsed = false;

  private parentEl!: HTMLElement;
  private game!: Game;
  private lastSig = "";

  constructor(param?: { parent: HTMLElement; game: Game }) {
    super();
    if (param?.parent && param?.game) {
      this.parentEl = param.parent;
      this.game = param.game;
      this.initComponent();
    }
  }

  public override init(param?: { parent: HTMLElement; game: Game }): void {
    super.init(param);
    if (param?.parent && param?.game && !this.root) {
      this.parentEl = param.parent;
      this.game = param.game;
      this.initComponent();
    }
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
    this.root?.remove();
  }

  private initComponent() {
    this.root = el(
      "div",
      "party-hud-widget fixed z-[15] select-none pointer-events-auto transition-all duration-200",
      this.parentEl
    );
    this.root.style.left = "8px";
    this.root.style.top = "236px";

    this.container = el(
      "div",
      "party-hud-container w-[176px] bg-zinc-950/85 border border-white/12 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[12px] overflow-visible flex flex-col font-sans",
      this.root
    );

    window.addEventListener("party-state-changed", () => {
      this.render();
    });

    this.render();
  }

  private updateTimer = 0;

  public update(dt = 0.016) {
    if (!this.game) return;
    this.updateTimer += dt;
    if (this.updateTimer < 0.2) return;
    this.updateTimer = 0;

    const pt = this.game.party;
    if (!pt) {
      if (this.lastSig !== "no-party") {
        this.lastSig = "no-party";
        this.render();
      }
      return;
    }

    const members = pt.members || [];
    const myBuffs = Object.keys(this.game.buffs).join(",");
    const curMap = this.game.map?.id || 910000000;
    const remoteNames = [...this.game.remotePlayers.values()].map((rp) => (rp.name || "").toLowerCase()).sort().join(",");
    const sig = `${pt.id}|${curMap}|${remoteNames}|${members.length}|${myBuffs}|${members.map((m) => `${m.name}:${m.online ? 1 : 0}:${m.hp}:${m.maxHp}:${m.mp ?? 0}:${m.mapId}:${(m.buffs || []).join("-")}`).join(",")}`;
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.render();
    }
  }

  public render() {
    if (!this.container || !this.game) return;
    const pt = this.game.party;
    const myName = this.game.stats.name;

    if (!pt) {
      this.container.innerHTML = `
        <div class="px-2.5 py-1.5 flex items-center justify-between hover:bg-white/5 cursor-pointer text-zinc-300 rounded-lg transition-colors" title="Open Party Window (P)">
          <div class="flex items-center gap-1.5">
            ${lucideIcon("users", 12, "text-sky-400")}
            <span class="text-[10px] font-bold text-zinc-200">Party</span>
          </div>
          <span class="text-[9px] font-mono text-zinc-400 bg-white/10 px-1.5 py-0.5 rounded border border-white/10">P</span>
        </div>
      `;
      this.container.onclick = () => {
        window.dispatchEvent(new CustomEvent("toggle-party-win"));
      };
      return;
    }

    this.container.onclick = null;
    const isLeader = pt.leaderName.toLowerCase() === myName.toLowerCase();
    const members = pt.members || [];
    const currentMapId = this.game.map?.id || 910000000;

    let memberRowsHtml = "";
    if (!this.collapsed) {
      memberRowsHtml = members.map((m) => {
        const isSelf = m.name.toLowerCase() === myName.toLowerCase();
        const isMemLeader = m.isLeader || m.name.toLowerCase() === pt.leaderName.toLowerCase();
        const remoteMatch = [...this.game.remotePlayers.values()].find(
          (rp) => (rp.name || "").toLowerCase() === m.name.toLowerCase()
        );
        const isOnline = isSelf || Boolean(remoteMatch) || Boolean(m.online);
        const inSameMap = isSelf || Boolean(remoteMatch) || (isOnline && (m.mapId || 910000000) === currentMapId);
        const isGrayed = !isOnline || !inSameMap;

        const curHp = isSelf ? this.game.stats.hp : (remoteMatch?.hp ?? m.hp ?? 50);
        const maxHp = isSelf ? this.game.stats.maxHp : (remoteMatch?.maxHp ?? m.maxHp ?? 50);
        const curMp = isSelf ? this.game.stats.mp : (remoteMatch?.mp ?? m.mp ?? 20);
        const maxMp = isSelf ? this.game.stats.maxMp : (remoteMatch?.maxMp ?? m.maxMp ?? 20);

        const hpPct = !isOnline ? 0 : Math.max(0, Math.min(100, Math.round((curHp / Math.max(1, maxHp)) * 100)));
        const mpPct = !isOnline ? 0 : Math.max(0, Math.min(100, Math.round((curMp / Math.max(1, maxMp)) * 100)));

        // Active Buffs List
        const buffIds = isSelf ? Object.keys(this.game.buffs) : (m.buffs || []);
        const runeBuff = isSelf && this.game.runeBuff && this.game.runeBuff.timeLeft > 0 ? this.game.runeBuff : null;
        const rDef = runeBuff ? RUNE_SKILL_DEFS[runeBuff.type] : null;

        let buffListHtml = "";
        if (buffIds.length === 0 && !rDef) {
          buffListHtml = `<span class="text-[8px] text-zinc-400 italic">No active buffs</span>`;
        } else {
          let runeRow = "";
          if (rDef && runeBuff) {
            const left = Math.ceil(runeBuff.timeLeft);
            const timeStr = left >= 60 ? `${Math.ceil(left / 60)}m` : `${left}s`;
            runeRow = `
              <div class="flex items-center gap-1.5">
                <img src="${rDef.iconUrl}" class="w-3.5 h-3.5 rounded-[2px] bg-black/40 border border-purple-400/30 object-contain flex-shrink-0" alt="" />
                <span class="text-[8px] text-purple-300 font-semibold truncate flex-1">${esc(rDef.name)}</span>
                <span class="text-[7.5px] font-mono text-purple-300 flex-shrink-0">${timeStr}</span>
              </div>
            `;
          }
          const regularBuffs = buffIds.slice(0, 5).map((id) => {
            const art = this.game.skillArt[id];
            const skillName = art?.name || `Buff ${id}`;
            const iconUrl = art?.icon?.url || "";
            let timeStr = "";
            if (isSelf && this.game.buffs[id]) {
              const left = Math.ceil(this.game.buffs[id].left);
              timeStr = left >= 60 ? `${Math.ceil(left / 60)}m` : `${left}s`;
            }
            return `
              <div class="flex items-center gap-1.5">
                ${iconUrl ? `<img src="${iconUrl}" class="w-3.5 h-3.5 rounded-[2px] bg-black/40 border border-white/10 object-contain flex-shrink-0" alt="" />` : `<span class="w-3.5 h-3.5 rounded-[2px] bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[7px] flex items-center justify-center flex-shrink-0">B</span>`}
                <span class="text-[8px] text-zinc-200 truncate flex-1">${esc(skillName)}</span>
                ${timeStr ? `<span class="text-[7.5px] font-mono text-amber-300/90 flex-shrink-0">${timeStr}</span>` : ""}
              </div>
            `;
          }).join("");
          buffListHtml = `<div class="flex flex-col gap-1">${runeRow}${regularBuffs}</div>`;
        }

        const statusTitle = !isOnline
          ? "Offline"
          : inSameMap
            ? "Online (Same Map)"
            : `Online (Map ${m.mapId || 910000000})`;

        return `
          <div class="party-hud-member relative group p-1.5 ${isGrayed ? "bg-zinc-950/60 opacity-55" : "bg-zinc-900/40 hover:bg-zinc-900/75"} border border-white/10 rounded-md transition-all shadow-sm" data-target-name="${esc(m.name)}">
            <!-- Row 1: Level, Name, Crown / Character Online Status Dot -->
            <div class="flex items-center justify-between gap-1 mb-1">
              <div class="flex items-center gap-1.5 min-w-0 ${isGrayed ? "grayscale" : ""}">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/35 font-mono text-[8.5px] font-bold leading-none shadow-sm">Lv.${m.level ?? 1}</span>
                <span class="font-bold text-[10.5px] ${isGrayed ? "text-zinc-400" : isSelf ? "text-amber-200" : "text-white"} truncate leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">${esc(m.name)}</span>
                ${isMemLeader ? `<span class="text-amber-400 flex-shrink-0" title="Leader">${lucideIcon("crown", 9)}</span>` : ""}
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <span class="w-2 h-2 rounded-full ${!isOnline ? "bg-zinc-600" : isGrayed ? "bg-zinc-400" : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"} flex-shrink-0 border border-zinc-950" title="${statusTitle}"></span>
              </div>
            </div>

            <!-- Row 2 & 3: Modern Shadcn Rectangular Gauges (HP & MP) -->
            <div class="flex flex-col gap-1 ${isGrayed ? "grayscale opacity-75" : ""}">
              <!-- HP Bar -->
              <div class="relative h-[5px] w-full bg-zinc-950/80 rounded-[2px] overflow-hidden border border-white/10 shadow-inner">
                <div class="h-full ${isGrayed ? "bg-zinc-500" : "bg-gradient-to-r from-rose-600 via-rose-500 to-rose-400"} rounded-[1px] transition-all duration-300" style="width: ${hpPct}%"></div>
              </div>

              <!-- MP Bar -->
              <div class="relative h-[5px] w-full bg-zinc-950/80 rounded-[2px] overflow-hidden border border-white/10 shadow-inner">
                <div class="h-full ${isGrayed ? "bg-zinc-600" : "bg-gradient-to-r from-sky-600 via-sky-500 to-cyan-400"} rounded-[1px] transition-all duration-300" style="width: ${mpPct}%"></div>
              </div>
            </div>

            <!-- Quick Action Strip on Hover -->
            <div class="party-quick-actions hidden group-hover:flex items-center justify-end gap-1 mt-1 pt-1 border-t border-white/10 transition-all">
              <button type="button" class="party-act-whisper px-1.5 py-0.5 rounded bg-white/10 hover:bg-sky-500/30 text-sky-300 text-[7.5px] font-semibold flex items-center gap-0.5 border border-white/10 transition-colors" title="Whisper player" data-name="${esc(m.name)}">
                ${lucideIcon("message-square", 8)} Msg
              </button>
              ${isOnline && !inSameMap ? `
                <button type="button" class="party-act-travel px-1.5 py-0.5 rounded bg-white/10 hover:bg-emerald-500/30 text-emerald-300 text-[7.5px] font-semibold flex items-center gap-0.5 border border-white/10 transition-colors" title="Travel to member map" data-map="${m.mapId || 910000000}">
                  ${lucideIcon("navigation", 8)} Warp
                </button>
              ` : ""}
              ${isLeader && !isSelf ? `
                <button type="button" class="party-act-promote px-1 py-0.5 rounded bg-white/10 hover:bg-amber-500/30 text-amber-300 text-[7.5px] font-semibold border border-white/10 transition-colors" title="Transfer Leadership" data-name="${esc(m.name)}">
                  ${lucideIcon("crown", 8)}
                </button>
                <button type="button" class="party-act-kick px-1 py-0.5 rounded bg-white/10 hover:bg-rose-500/30 text-rose-300 text-[7.5px] font-semibold border border-white/10 transition-colors" title="Expel from Party" data-name="${esc(m.name)}">
                  ${lucideIcon("x", 8)}
                </button>
              ` : ""}
              ${isSelf ? `
                <button type="button" class="party-act-leave px-1.5 py-0.5 rounded bg-white/10 hover:bg-rose-500/30 text-rose-300 text-[7.5px] font-semibold border border-white/10 transition-colors" title="Leave Party">
                  Leave
                </button>
              ` : ""}
            </div>

            <!-- Active Buffs Popover on Hover -->
            <div class="party-buff-popover absolute left-full top-0 ml-1.5 z-40 hidden group-hover:flex flex-col bg-zinc-950/95 border border-white/15 rounded-md shadow-2xl p-2 min-w-[120px] max-w-[160px] pointer-events-none backdrop-blur-md">
              <div class="text-[7.5px] font-bold text-zinc-300 uppercase tracking-wider mb-1 flex items-center gap-1 border-b border-white/10 pb-0.5">
                ${lucideIcon("sparkles", 8, "text-amber-400")} Active Buffs
              </div>
              ${buffListHtml}
            </div>
          </div>
        `;
      }).join("");
    }

    this.container.innerHTML = `
      <!-- Header -->
      <div class="px-2 py-1.5 bg-white/[0.04] border-b border-white/10 flex items-center justify-between rounded-t-md">
        <div class="flex items-center gap-1.5 min-w-0">
          ${lucideIcon("users", 11, "text-sky-400 flex-shrink-0")}
          <span class="font-bold text-[9.5px] text-white truncate font-mono">Party</span>
          <span class="text-[8.5px] text-zinc-400 font-mono">(${members.length}/6)</span>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button type="button" class="party-btn-win p-0.5 rounded hover:bg-white/10 text-zinc-300 hover:text-white" title="Party Window (P)">
            ${lucideIcon("settings", 10)}
          </button>
          <button type="button" class="party-btn-toggle p-0.5 rounded hover:bg-white/10 text-zinc-300 hover:text-white" title="${this.collapsed ? "Expand" : "Collapse"}">
            ${lucideIcon(this.collapsed ? "chevron-right" : "chevron-left", 10)}
          </button>
        </div>
      </div>

      <!-- Member Rows with Inside Padding -->
      ${memberRowsHtml ? `<div class="max-h-[250px] overflow-visible flex flex-col gap-1 p-1">${memberRowsHtml}</div>` : ""}
    `;

    // Event listeners
    this.container.querySelector(".party-btn-win")?.addEventListener("click", (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent("toggle-party-win"));
    });

    this.container.querySelector(".party-btn-toggle")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.collapsed = !this.collapsed;
      this.render();
    });

    // Quick Action Listeners
    this.container.querySelectorAll<HTMLElement>(".party-act-whisper").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const target = btn.dataset.name;
        if (target && target.toLowerCase() !== myName.toLowerCase()) {
          window.dispatchEvent(new CustomEvent("chat-quick-whisper", { detail: { name: target } }));
        }
      });
    });

    this.container.querySelectorAll<HTMLElement>(".party-act-travel").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const mapId = Number(btn.dataset.map);
        if (mapId) {
          this.game.loadMap(mapId, "spawn");
        }
      });
    });

    this.container.querySelectorAll<HTMLElement>(".party-act-promote").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const target = btn.dataset.name;
        if (target && confirm(`Transfer party leadership to ${target}?`)) {
          const res = await PartyClient.passLeader(myName, target);
          if (res.ok && res.party) {
            this.game.party = res.party;
            this.render();
          }
        }
      });
    });

    this.container.querySelectorAll<HTMLElement>(".party-act-kick").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const target = btn.dataset.name;
        if (target && confirm(`Expel ${target} from the party?`)) {
          const res = await PartyClient.expel(myName, target);
          if (res.ok && res.party) {
            this.game.party = res.party;
            this.render();
          }
        }
      });
    });

    this.container.querySelectorAll<HTMLElement>(".party-act-leave").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm("Leave current party?")) {
          const res = await PartyClient.leave(myName);
          if (res.ok) {
            this.game.party = null;
            this.game.partyId = undefined;
            this.render();
          }
        }
      });
    });
  }
}

