// Modular Skill Panel — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
// Exact replication of MapleStory Modern UI (dark slate steel, roman numeral tabs I-IV/HYPER, 2-column cards, SP badge)
import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import type { Windows } from "../windows.ts";
import { SKILL, type SkillDef } from "../skills.ts";
import { el, bg, esc } from "../util.ts";

export interface SkillPanelParam {
  windowEl: HTMLElement;
  game: Game;
  windows: Windows;
}

export class SkillPanelComponent extends ComponentBase {
  public windowEl!: HTMLElement;
  public body!: HTMLElement;
  public game!: Game;
  public windows!: Windows;
  public activeTab: 0 | 1 | 2 | 3 = 1;
  private lastSig = "";

  constructor(param?: SkillPanelParam) {
    super();
    if (param) {
      this.initParam(param);
    }
  }

  public override init(param?: SkillPanelParam): void {
    super.init(param);
    if (param) {
      this.initParam(param);
    }
  }

  private initParam(param: SkillPanelParam) {
    this.windowEl = param.windowEl;
    this.game = param.game;
    this.windows = param.windows;
    let b = this.windowEl.querySelector(".skill-win-body") as HTMLElement;
    if (!b) {
      b = el("div", "skill-win-body", this.windowEl);
    }
    this.body = b;
    this.bindEvents();
  }

  private bindEvents() {
    this.windowEl.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
      if (!t) return;
      const act = t.dataset.act;
      const g = this.game;

      if (act === "skill-tab") {
        const tab = Number(t.dataset.tab) as 0 | 1 | 2 | 3;
        this.activeTab = tab;
        this.lastSig = "";
        this.render();
      } else if (act === "learn-skill") {
        const id = t.dataset.skillId;
        if (id && g.learn(id)) {
          this.lastSig = "";
          this.render();
        }
      } else if (act === "build-skill") {
        // Auto-assign remaining SP across available skills
        const c = g.class;
        const skills = (c.skillsByTab[this.activeTab] ?? []).map((id) => SKILL[id]).filter(Boolean);
        let changed = false;
        for (const d of skills) {
          while (g.stats.sp > 0 && g.canLearn(d.id)) {
            if (g.learn(d.id)) changed = true;
            else break;
          }
        }
        if (changed) {
          this.lastSig = "";
          this.render();
        }
      }
    });
  }

  public override start(): void {
    this.render();
  }

  public override onUpdate(): void {
    if (!this.windowEl || this.windowEl.classList.contains("hidden")) return;
    const g = this.game;
    const sig = `${this.activeTab}|${g.stats.sp}|${g.stats.level}|${g.stats.classId}|${Object.entries(g.skillLv).map(([k, v]) => `${k}:${v}`).join(",")}`;
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
    const c = g.class;
    const tab = this.activeTab;

    // Tabs: Beginner (B), 1st (I), 2nd (II), 3rd (III)
    const romanLabels = ["B", "I", "II", "III"];
    const tabList = romanLabels.map((label, i) => {
      const isLocked = i > 0 && g.stats.level < ((c.tabLevel as number[])[i] ?? 999);
      const isActive = i === tab;
      const jobName = c.tabs[i] ?? "Skills";
      return {
        index: i as 0 | 1 | 2 | 3,
        label,
        jobName,
        isLocked,
        isActive,
      };
    });

    const tabsHtml = tabList.map((t) => {
      const cls = t.isActive
        ? "bg-[#0ea5e9]/25 border-[#38bdf8] text-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.35)] font-black"
        : t.isLocked
          ? "bg-[#18202c]/50 border-[#2a3444] text-slate-500 opacity-60 font-medium"
          : "bg-[#253042]/70 hover:bg-[#34445c]/90 border-[#3a4454] text-slate-300 font-bold";
      return `
        <button type="button" data-act="skill-tab" data-tab="${t.index}"
          class="flex-1 py-1.5 px-2 text-center rounded-[3px] border text-[11px] select-none transition-all cursor-pointer ${cls}"
          title="${t.jobName} (Req Lv. ${c.tabLevel[t.index] ?? 1})">
          ${t.label}
        </button>
      `;
    }).join("");

    const firstSkill = c.skillsByTab[tab]?.[0];
    const bannerIconUrl = (firstSkill ? g.skillArt[firstSkill]?.icon?.url : "") || "";
    const activeTabName = c.tabs[tab] ?? "Skills";
    const reqLv = (c.tabLevel as number[])[tab] ?? 1;
    const isTabUnlocked = g.stats.level >= reqLv;

    const defs = (c.skillsByTab[tab] ?? []).map((id) => SKILL[id]).filter(Boolean);

    let cardsHtml = "";
    if (defs.length === 0) {
      cardsHtml = `
        <div class="col-span-2 flex flex-col items-center justify-center p-8 text-slate-400 text-xs">
          <span>No skills registered in this tier yet.</span>
        </div>
      `;
    } else {
      cardsHtml = defs.map((d) => {
        const lv = g.lv(d.id);
        const art = g.skillArt[d.id];
        const isMax = lv >= d.maxLevel;
        const canLearn = g.canLearn(d.id);
        const iconUrl = (lv > 0 ? art?.icon?.url : art?.iconDisabled?.url) ?? art?.icon?.url ?? "";
        const isPassive = d.kind === "passive";
        const isDraggable = lv > 0 && !isPassive;

        return `
          <div class="skill-card flex items-center justify-between p-2 bg-[#171f2b]/85 hover:bg-[#1e2736]/95 border border-[#2e3746] hover:border-[#38bdf8]/40 rounded-[4px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] transition-all select-none" data-skill-id="${d.id}">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="skill-icon-cell relative w-[36px] h-[36px] bg-[#10151f] border border-[#3a4454] rounded-[3px] flex items-center justify-center overflow-hidden flex-shrink-0 ${isDraggable ? "cursor-grab grab" : ""}"
                data-skill-icon="${d.id}">
                ${iconUrl ? `<div class="absolute inset-[2px] bg-center bg-no-repeat bg-contain [image-rendering:pixelated]" style="background-image: url('${iconUrl}');"></div>` : ""}
                ${isPassive ? `<span class="absolute bottom-0 right-0 px-0.5 bg-[#475569]/80 text-[7px] text-white font-bold leading-tight rounded-tl">P</span>` : ""}
              </div>
              <div class="flex flex-col min-w-0">
                <span class="text-[11px] font-extrabold text-white truncate max-w-[120px]" title="${esc(art?.name ?? d.id)}">${esc(art?.name ?? d.id)}</span>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-[9.5px] font-black ${isMax ? "text-amber-300" : "text-sky-300"}">${lv}/${d.maxLevel}</span>
                  ${isPassive ? `<span class="text-[8px] text-slate-400 font-semibold">Passive</span>` : ""}
                </div>
              </div>
            </div>
            <button type="button" class="w-[20px] h-[20px] rounded-[3px] border flex items-center justify-center text-[12px] font-black transition-all ${canLearn ? "bg-[#15803d] hover:bg-[#16a34a] border-[#22c55e] text-white cursor-pointer shadow-[0_0_6px_rgba(34,197,94,0.4)]" : "bg-[#1f2937]/50 border-[#374151] text-slate-600 cursor-default opacity-40"}"
              data-act="learn-skill" data-skill-id="${d.id}" ${canLearn ? "" : "disabled"} title="Allocate SP">+</button>
          </div>
        `;
      }).join("");
    }

    this.body.innerHTML = `
      <div class="skill-inner-container flex flex-col gap-2 p-3 text-slate-200 select-none">
        <!-- Top Roman Tabs: I, II, III, IV, HYPER -->
        <div class="skill-tabs-row flex items-center gap-1.5 p-1 bg-[#10151f]/80 border border-[#2b3444] rounded-[4px]">
          ${tabsHtml}
        </div>

        <!-- Banner Card: Job Name + Remaining SP -->
        <div class="skill-banner-card flex items-center justify-between px-3 py-2 bg-gradient-to-r from-[#171f2b] to-[#1e2736] border border-[#3a4454] rounded-[4px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
          <div class="flex items-center gap-2">
            ${bannerIconUrl ? `<div class="w-6 h-6 bg-center bg-no-repeat bg-contain [image-rendering:pixelated]" style="background-image: url('${bannerIconUrl}')"></div>` : ""}
            <div class="flex flex-col">
              <span class="text-[11px] font-black text-white">${activeTabName}</span>
              <span class="text-[8.5px] text-slate-400">${isTabUnlocked ? "Skills available" : `Unlocks at Lv. ${reqLv}`}</span>
            </div>
          </div>
          <div class="flex items-center gap-1.5 px-2.5 py-1 bg-[#0f172a]/80 border border-[#38bdf8]/40 rounded-[3px]">
            <span class="text-[9px] font-bold text-slate-300">SKILL POINTS</span>
            <span class="text-[12px] font-black ${g.stats.sp > 0 ? "text-[#facc15] animate-pulse" : "text-slate-400"}">${g.stats.sp}</span>
          </div>
        </div>

        <!-- 2-Column Skill Cards Grid -->
        <div class="skill-cards-grid grid grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto p-1 bg-[#121822]/90 border border-[#2b3444] rounded-[4px] custom-scrollbar">
          ${cardsHtml}
        </div>

        <!-- Bottom Action Buttons: BUILD SKILL, MOUNT, MACRO > -->
        <div class="skill-bottom-bar flex items-center justify-between mt-1 pt-1 border-t border-[#2a3444]">
          <button type="button" class="px-3 py-1 bg-[#253042] hover:bg-[#34445c] border border-[#3b4b62] hover:border-[#38bdf8]/60 rounded-[3px] text-slate-200 hover:text-white text-[10px] font-bold cursor-pointer transition-all shadow-sm" data-act="build-skill">BUILD SKILL</button>
          <div class="flex items-center gap-1.5">
            <button type="button" class="px-2.5 py-1 bg-[#1e2736] hover:bg-[#2e3e54] border border-[#3b4b62] rounded-[3px] text-slate-300 hover:text-white text-[10px] font-semibold cursor-pointer transition-all">MOUNT</button>
            <button type="button" class="px-2.5 py-1 bg-[#1e2736] hover:bg-[#2e3e54] border border-[#3b4b62] hover:border-[#38bdf8] rounded-[3px] text-[#38bdf8] hover:text-white text-[10px] font-black cursor-pointer transition-all flex items-center gap-1">MACRO &gt;</button>
          </div>
        </div>
      </div>
    `;

    // Bind tooltips and drag events
    this.body.querySelectorAll<HTMLElement>("[data-skill-icon]").forEach((el) => {
      const id = el.dataset.skillIcon!;
      const d = SKILL[id];
      if (!d) return;
      const lv = g.lv(id);
      if (lv > 0 && d.kind !== "passive") {
        this.windows.draggable(el, () => ({ t: "skill", id }));
      }
      this.windows.bindTip(el, () => this.windows.skillTip(id));
    });
  }
}
