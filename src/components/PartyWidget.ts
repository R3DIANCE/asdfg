// MapleStory Dedicated Party UI Widget — On-screen Real-time Party HUD
// ComponentBase architecture for WebGPU/DOM HUD
import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import { el, esc } from "../util.ts";
import { lucideIcon } from "../lucide.ts";

const MAP_NAMES_LOCAL: Record<number, string> = {
  910000000: "Free Market",
  100010000: "Henesys Hunting",
  100020000: "Henesys Market",
  100000000: "Henesys Town",
  101000000: "Ellinia",
  102000000: "Perion",
  103000000: "Kerning City",
  104000000: "Lith Harbor",
  105040300: "Sleepywood",
};

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
      "party-hud-container w-[190px] bg-slate-950/75 border border-white/10 rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[12px] overflow-hidden flex flex-col",
      this.root
    );

    window.addEventListener("party-state-changed", () => {
      this.render();
    });

    this.render();
  }

  public update() {
    if (!this.game) return;
    const pt = this.game.party;
    if (!pt) {
      if (this.lastSig !== "no-party") {
        this.lastSig = "no-party";
        this.render();
      }
      return;
    }

    const members = pt.members || [];
    const sig = `${pt.id}|${members.length}|${members.map((m) => `${m.name}:${m.hp}:${m.maxHp}:${m.mp ?? 0}:${m.mapId}`).join(",")}`;
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
        <div class="px-2.5 py-1.5 flex items-center justify-between hover:bg-white/5 cursor-pointer text-slate-300" title="Open Party Window (P)">
          <div class="flex items-center gap-1.5">
            ${lucideIcon("users", 12, "text-sky-400")}
            <span class="text-[10px] font-bold text-slate-200 font-sans">Party</span>
          </div>
          <span class="text-[9px] font-mono text-slate-400 bg-white/10 px-1 py-0.2 rounded border border-white/10">P</span>
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
        const inSameMap = (m.mapId || 910000000) === currentMapId;
        const mapName = MAP_NAMES_LOCAL[m.mapId || 910000000] || `Map ${m.mapId || 910000000}`;

        const curHp = isSelf ? this.game.stats.hp : (m.hp ?? 50);
        const maxHp = isSelf ? this.game.stats.maxHp : (m.maxHp ?? 50);
        const curMp = isSelf ? this.game.stats.mp : (m.mp ?? 20);
        const maxMp = isSelf ? this.game.stats.maxMp : (m.maxMp ?? 20);

        const hpPct = Math.max(0, Math.min(100, Math.round((curHp / Math.max(1, maxHp)) * 100)));
        const mpPct = Math.max(0, Math.min(100, Math.round((curMp / Math.max(1, maxMp)) * 100)));

        return `
          <div class="party-hud-member px-2 py-1.5 border-b border-white/5 last:border-b-0 hover:bg-white/[0.04] transition-colors cursor-pointer" data-target-name="${esc(m.name)}" title="Click to whisper">
            <div class="flex items-center justify-between gap-1 mb-1">
              <div class="flex items-center gap-1 min-w-0">
                ${isMemLeader ? `<span class="text-amber-400 flex-shrink-0" title="Leader">${lucideIcon("crown", 9)}</span>` : `<span class="w-1.5 h-1.5 rounded-full ${inSameMap ? "bg-emerald-400" : "bg-slate-500"} flex-shrink-0"></span>`}
                <span class="font-bold text-[10.5px] ${isSelf ? "text-amber-200" : "text-white"} truncate">${esc(m.name)}</span>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <span class="text-[9px] text-amber-300 font-mono">Lv.${m.level ?? 1}</span>
              </div>
            </div>

            <!-- Mini Dual Gauges -->
            <div class="flex flex-col gap-0.5">
              <!-- HP Gauge -->
              <div class="flex items-center gap-1 text-[8px] font-mono">
                <span class="text-rose-400 w-3">H</span>
                <div class="flex-1 h-1.5 bg-black/60 rounded overflow-hidden relative border border-white/5">
                  <div class="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded transition-all duration-200" style="width: ${hpPct}%"></div>
                </div>
                <span class="text-slate-300 w-10 text-right">${curHp}</span>
              </div>

              <!-- MP Gauge -->
              <div class="flex items-center gap-1 text-[8px] font-mono">
                <span class="text-sky-400 w-3">M</span>
                <div class="flex-1 h-1 bg-black/60 rounded overflow-hidden relative border border-white/5">
                  <div class="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded transition-all duration-200" style="width: ${mpPct}%"></div>
                </div>
                <span class="text-slate-400 w-10 text-right">${curMp}</span>
              </div>
            </div>

            <div class="flex items-center justify-between text-[8px] text-slate-400 mt-1">
              <span class="truncate">${esc(m.job || "Beginner")}</span>
              <span class="${inSameMap ? "text-emerald-300 font-semibold" : "text-slate-500"} truncate">
                ${inSameMap ? "Same Map" : esc(mapName)}
              </span>
            </div>
          </div>
        `;
      }).join("");
    }

    this.container.innerHTML = `
      <!-- Header -->
      <div class="px-2 py-1.5 bg-white/[0.04] border-b border-white/10 flex items-center justify-between">
        <div class="flex items-center gap-1.5 min-w-0">
          ${lucideIcon("users", 11, "text-sky-400 flex-shrink-0")}
          <span class="font-bold text-[10px] text-white truncate font-mono">${esc(pt.id)}</span>
          <span class="text-[9px] text-slate-400 font-mono">(${members.length}/6)</span>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button type="button" class="party-btn-win p-0.5 rounded hover:bg-white/10 text-slate-300 hover:text-white" title="Party Window (P)">
            ${lucideIcon("settings", 10)}
          </button>
          <button type="button" class="party-btn-toggle p-0.5 rounded hover:bg-white/10 text-slate-300 hover:text-white" title="${this.collapsed ? "Expand" : "Collapse"}">
            ${lucideIcon(this.collapsed ? "chevron-right" : "chevron-left", 10)}
          </button>
        </div>
      </div>

      <!-- Member Rows -->
      ${memberRowsHtml ? `<div class="max-h-[220px] overflow-y-auto flex flex-col">${memberRowsHtml}</div>` : ""}

      <!-- Mini Footer (when expanded) -->
      ${!this.collapsed ? `
        <div class="px-2 py-1 bg-emerald-950/20 border-t border-emerald-500/15 flex items-center justify-between text-[8.5px] text-emerald-300">
          <span class="truncate">Shared EXP +50% Active</span>
          <button type="button" class="party-btn-invite text-sky-300 hover:text-sky-200 underline font-semibold" title="Invite Player">Invite</button>
        </div>
      ` : ""}
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

    this.container.querySelector(".party-btn-invite")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const target = prompt("Enter character name to invite to party:");
      if (target && this.game.partyId) {
        import("../party.ts").then(({ PartyClient }) => {
          PartyClient.invite(this.game.partyId!, this.game.stats.name, target.trim()).then((res) => {
            if (res.ok) {
              this.game.onChat("notice", `[Party] Invited ${target} to the party.`);
            } else {
              alert(res.error || "Failed to invite player.");
            }
          });
        });
      }
    });

    this.container.querySelectorAll<HTMLElement>(".party-hud-member").forEach((row) => {
      row.addEventListener("click", () => {
        const target = row.dataset.targetName;
        if (target && target.toLowerCase() !== myName.toLowerCase()) {
          const chatInput = document.querySelector(".chat-field") as HTMLInputElement;
          if (chatInput) {
            chatInput.focus();
            chatInput.value = `/w ${target} `;
          }
        }
      });
    });
  }
}
