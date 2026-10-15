// Modular Character Stats Panel — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
// Exact replication of MapleStory Modern UI (dark slate steel, gold/amber badges, segmented bars, expandable DETAIL)
import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import type { Windows } from "../windows.ts";
import { el, fmt, esc } from "../util.ts";

export interface StatPanelParam {
  windowEl: HTMLElement;
  game: Game;
  windows: Windows;
}

export class StatPanelComponent extends ComponentBase {
  public windowEl!: HTMLElement;
  public body!: HTMLElement;
  public game!: Game;
  public windows!: Windows;
  public isDetailed = false;
  private lastSig = "";

  constructor(param?: StatPanelParam) {
    super();
    if (param) {
      this.initParam(param);
    }
  }

  public override init(param?: StatPanelParam): void {
    super.init(param);
    if (param) {
      this.initParam(param);
    }
  }

  private initParam(param: StatPanelParam) {
    this.windowEl = param.windowEl;
    this.game = param.game;
    this.windows = param.windows;
    let b = this.windowEl.querySelector(".stat-body") as HTMLElement;
    if (!b) {
      b = el("div", "stat-body", this.windowEl);
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
      const s = g.stats;

      if (act === "toggle-hyper") {
        this.windows.toggle(this.windows.hyperStatWin);
      } else if (act === "toggle-ability") {
        this.windows.toggle(this.windows.abilityWin);
      } else if (act === "toggle-detail") {
        this.isDetailed = !this.isDetailed;
        this.lastSig = "";
        this.render();
      } else if (act === "add-stat") {
        const stat = t.dataset.stat as "str" | "dex" | "int" | "luk" | "hp" | "mp";
        if (s.ap > 0 && stat) {
          s.ap--;
          if (stat === "hp") s.baseHp += 20;
          else if (stat === "mp") s.baseMp += 10;
          else s[stat]++;
          g.recalc();
          g.onChange();
          this.lastSig = "";
          this.render();
        }
      } else if (act === "auto-ap") {
        g.autoAssign();
        g.onChange();
        this.lastSig = "";
        this.render();
      } else if (act === "fame-up") {
        s.fame++;
        g.onChat("notice", "Fame increased by 1!");
        g.onChange();
        this.lastSig = "";
        this.render();
      } else if (act === "open-job-adv") {
        this.windows.openJobAdvancement(s.classId === "beginner" ? 1 : s.level >= 60 ? 3 : 2);
      }
    });
  }

  public override start(): void {
    this.render();
  }

  public override onUpdate(): void {
    if (!this.windowEl || this.windowEl.classList.contains("hidden")) return;
    const g = this.game;
    const s = g.stats;
    const [lo, hi] = g.damageRange();
    const cp = g.combatPower();
    const sig = `${s.hp}|${s.maxHp}|${s.mp}|${s.maxMp}|${s.str}|${s.dex}|${s.int}|${s.luk}|${s.ap}|${s.fame}|${s.level}|${s.job}|${lo}|${hi}|${cp}|${this.isDetailed}`;
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
    const s = g.stats;
    const gt = g.gt;
    const [lo, hi] = g.damageRange();
    const cp = g.combatPower();
    const canAdv = g.canAdvanceJob();

    const hpPct = Math.min(100, Math.max(0, (s.hp / s.maxHp) * 100));
    const mpPct = Math.min(100, Math.max(0, (s.mp / s.maxMp) * 100));

    const totalStr = s.str + (gt?.str || 0);
    const totalDex = s.dex + (gt?.dex || 0);
    const totalInt = s.int + (gt?.int || 0);
    const totalLuk = s.luk + (gt?.luk || 0);

    let html = `
      <div class="stat-inner-container flex flex-col gap-2 p-3 text-slate-200 select-none">
        <!-- Top Info Header: NAME, JOB, GUILD, FAME -->
        <div class="stat-top-grid grid grid-cols-2 gap-1.5 p-2 bg-[#171f2b]/90 border border-[#3a4454] rounded-[4px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
          <div class="stat-meta-row flex items-center justify-between px-2 py-1 bg-[#10151f]/80 rounded-[3px] border border-[#2b3444]">
            <span class="text-[9.5px] font-bold text-[#eab308] tracking-wider">NAME</span>
            <span class="text-[11px] font-extrabold text-white truncate max-w-[90px]">${esc(s.name || "Player")}</span>
          </div>
          <div class="stat-meta-row flex items-center justify-between px-2 py-1 bg-[#10151f]/80 rounded-[3px] border border-[#2b3444]">
            <span class="text-[9.5px] font-bold text-[#eab308] tracking-wider">JOB</span>
            <div class="flex items-center gap-1">
              <span class="text-[11px] font-extrabold text-sky-300 truncate max-w-[85px]">${esc(s.job || "Beginner")}</span>
              ${canAdv ? `<button type="button" class="px-1 py-0.5 text-[8px] bg-sky-500 hover:bg-sky-400 text-white rounded font-black animate-pulse" data-act="open-job-adv">ADV</button>` : ""}
            </div>
          </div>
          <div class="stat-meta-row flex items-center justify-between px-2 py-1 bg-[#10151f]/80 rounded-[3px] border border-[#2b3444]">
            <span class="text-[9.5px] font-bold text-[#eab308] tracking-wider">GUILD</span>
            <span class="text-[11px] font-bold text-slate-300">Maple</span>
          </div>
          <div class="stat-meta-row flex items-center justify-between px-2 py-1 bg-[#10151f]/80 rounded-[3px] border border-[#2b3444]">
            <span class="text-[9.5px] font-bold text-[#eab308] tracking-wider">FAME</span>
            <div class="flex items-center gap-1">
              <span class="text-[11px] font-black text-amber-200">${s.fame}</span>
              <button type="button" class="w-4 h-4 flex items-center justify-center bg-[#253042] hover:bg-[#34445c] text-[#38bdf8] border border-[#3b4b62] rounded text-[10px] font-bold cursor-pointer transition-colors" data-act="fame-up" title="Raise Fame">+</button>
            </div>
          </div>
        </div>

        <!-- DAMAGE Range Badge -->
        <div class="stat-dmg-box flex items-center justify-between px-3 py-2 bg-gradient-to-r from-[#171f2b] to-[#1e2736] border border-[#3a4454] rounded-[4px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]">
          <div class="flex items-center gap-1.5">
            <span class="px-1.5 py-0.5 bg-[#eab308]/20 border border-[#eab308]/50 text-[#facc15] font-black text-[9px] rounded-[3px] tracking-wider">DAMAGE</span>
            <span class="text-[9px] text-slate-400 font-semibold">RANGE</span>
          </div>
          <span class="text-[13px] font-black text-white tracking-wide text-shadow">${fmt(lo)} ~ ${fmt(hi)}</span>
        </div>

        <!-- HP & MP Segmented Gauges -->
        <div class="stat-gauges flex flex-col gap-1.5 p-2 bg-[#151c27]/85 border border-[#2e3746] rounded-[4px]">
          <!-- HP Row -->
          <div class="flex items-center gap-2">
            <div class="w-[30px] h-[18px] bg-[#991b1b]/35 border border-[#ef4444]/60 rounded-[3px] flex items-center justify-center text-[9px] font-black text-[#f87171] shadow-inner">HP</div>
            <div class="relative flex-1 h-[18px] bg-[#0b0f16] border border-[#2c3545] rounded-[3px] overflow-hidden">
              <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-[#b91c1c] to-[#ef4444] transition-all duration-200" style="width: ${hpPct}%"></div>
              <div class="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white drop-shadow-[0_1px_2px_#000]">
                ${s.hp.toLocaleString()} / ${s.maxHp.toLocaleString()}
              </div>
            </div>
            <button type="button" class="w-[18px] h-[18px] bg-[#253042] hover:bg-[#38bdf8]/30 disabled:opacity-30 border border-[#3b4b62] rounded text-[11px] font-black text-[#38bdf8] flex items-center justify-center transition-all ${s.ap > 0 ? "cursor-pointer" : "cursor-default"}" data-act="add-stat" data-stat="hp" ${s.ap > 0 ? "" : "disabled"} title="Add 20 HP">+</button>
          </div>

          <!-- MP Row -->
          <div class="flex items-center gap-2">
            <div class="w-[30px] h-[18px] bg-[#1e40af]/35 border border-[#3b82f6]/60 rounded-[3px] flex items-center justify-center text-[9px] font-black text-[#60a5fa] shadow-inner">MP</div>
            <div class="relative flex-1 h-[18px] bg-[#0b0f16] border border-[#2c3545] rounded-[3px] overflow-hidden">
              <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] transition-all duration-200" style="width: ${mpPct}%"></div>
              <div class="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white drop-shadow-[0_1px_2px_#000]">
                ${s.mp.toLocaleString()} / ${s.maxMp.toLocaleString()}
              </div>
            </div>
            <button type="button" class="w-[18px] h-[18px] bg-[#253042] hover:bg-[#38bdf8]/30 disabled:opacity-30 border border-[#3b4b62] rounded text-[11px] font-black text-[#38bdf8] flex items-center justify-center transition-all ${s.ap > 0 ? "cursor-pointer" : "cursor-default"}" data-act="add-stat" data-stat="mp" ${s.ap > 0 ? "" : "disabled"} title="Add 10 MP">+</button>
          </div>
        </div>

        <!-- Ability Point Row with AUTO-ASSIGN -->
        <div class="stat-ap-card flex items-center justify-between px-3 py-1.5 bg-[#171f2b]/90 border border-[#3a4454] rounded-[4px]">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold text-slate-300">ABILITY POINT</span>
            <span class="text-[12px] font-black ${s.ap > 0 ? "text-[#facc15] animate-pulse" : "text-slate-400"}">${s.ap}</span>
          </div>
          <button type="button" class="px-2.5 py-1 bg-gradient-to-r from-[#0284c7] to-[#0ea5e9] hover:from-[#0369a1] hover:to-[#0284c7] disabled:from-slate-700 disabled:to-slate-800 disabled:opacity-40 text-white font-extrabold text-[9.5px] rounded-[3px] border border-[#38bdf8]/50 shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all ${s.ap > 0 ? "cursor-pointer" : "cursor-default"}" data-act="auto-ap" ${s.ap > 0 ? "" : "disabled"}>AUTO-ASSIGN</button>
        </div>

        <!-- 4 Primary Stats: STR, DEX, INT, LUK -->
        <div class="stat-attrs-grid grid grid-cols-1 gap-1 p-2 bg-[#121822]/90 border border-[#2b3444] rounded-[4px]">
          <!-- STR -->
          <div class="flex items-center justify-between px-2.5 py-1 bg-[#18212e]/70 border border-[#2a3545] rounded-[3px] hover:border-[#38bdf8]/40 transition-colors">
            <div class="flex items-center gap-2">
              <span class="w-[30px] text-[11px] font-extrabold text-amber-300">STR</span>
              <button type="button" class="w-[18px] h-[18px] bg-[#253042] hover:bg-[#38bdf8]/40 disabled:opacity-30 border border-[#3b4b62] rounded text-[11px] font-black text-[#38bdf8] flex items-center justify-center transition-all ${s.ap > 0 ? "cursor-pointer" : "cursor-default"}" data-act="add-stat" data-stat="str" ${s.ap > 0 ? "" : "disabled"} title="Add 1 STR">+</button>
            </div>
            <div class="text-right">
              <span class="text-[12px] font-black text-white">${totalStr.toLocaleString()}</span>
              <span class="text-[9.5px] text-slate-400 font-semibold ml-1">( ${s.str} + ${gt?.str || 0} )</span>
            </div>
          </div>

          <!-- DEX -->
          <div class="flex items-center justify-between px-2.5 py-1 bg-[#18212e]/70 border border-[#2a3545] rounded-[3px] hover:border-[#38bdf8]/40 transition-colors">
            <div class="flex items-center gap-2">
              <span class="w-[30px] text-[11px] font-extrabold text-emerald-300">DEX</span>
              <button type="button" class="w-[18px] h-[18px] bg-[#253042] hover:bg-[#38bdf8]/40 disabled:opacity-30 border border-[#3b4b62] rounded text-[11px] font-black text-[#38bdf8] flex items-center justify-center transition-all ${s.ap > 0 ? "cursor-pointer" : "cursor-default"}" data-act="add-stat" data-stat="dex" ${s.ap > 0 ? "" : "disabled"} title="Add 1 DEX">+</button>
            </div>
            <div class="text-right">
              <span class="text-[12px] font-black text-white">${totalDex.toLocaleString()}</span>
              <span class="text-[9.5px] text-slate-400 font-semibold ml-1">( ${s.dex} + ${gt?.dex || 0} )</span>
            </div>
          </div>

          <!-- INT -->
          <div class="flex items-center justify-between px-2.5 py-1 bg-[#18212e]/70 border border-[#2a3545] rounded-[3px] hover:border-[#38bdf8]/40 transition-colors">
            <div class="flex items-center gap-2">
              <span class="w-[30px] text-[11px] font-extrabold text-sky-300">INT</span>
              <button type="button" class="w-[18px] h-[18px] bg-[#253042] hover:bg-[#38bdf8]/40 disabled:opacity-30 border border-[#3b4b62] rounded text-[11px] font-black text-[#38bdf8] flex items-center justify-center transition-all ${s.ap > 0 ? "cursor-pointer" : "cursor-default"}" data-act="add-stat" data-stat="int" ${s.ap > 0 ? "" : "disabled"} title="Add 1 INT">+</button>
            </div>
            <div class="text-right">
              <span class="text-[12px] font-black text-white">${totalInt.toLocaleString()}</span>
              <span class="text-[9.5px] text-slate-400 font-semibold ml-1">( ${s.int} + ${gt?.int || 0} )</span>
            </div>
          </div>

          <!-- LUK -->
          <div class="flex items-center justify-between px-2.5 py-1 bg-[#18212e]/70 border border-[#2a3545] rounded-[3px] hover:border-[#38bdf8]/40 transition-colors">
            <div class="flex items-center gap-2">
              <span class="w-[30px] text-[11px] font-extrabold text-purple-300">LUK</span>
              <button type="button" class="w-[18px] h-[18px] bg-[#253042] hover:bg-[#38bdf8]/40 disabled:opacity-30 border border-[#3b4b62] rounded text-[11px] font-black text-[#38bdf8] flex items-center justify-center transition-all ${s.ap > 0 ? "cursor-pointer" : "cursor-default"}" data-act="add-stat" data-stat="luk" ${s.ap > 0 ? "" : "disabled"} title="Add 1 LUK">+</button>
            </div>
            <div class="text-right">
              <span class="text-[12px] font-black text-white">${totalLuk.toLocaleString()}</span>
              <span class="text-[9.5px] text-slate-400 font-semibold ml-1">( ${s.luk} + ${gt?.luk || 0} )</span>
            </div>
          </div>
        </div>

        <!-- Bottom Action Buttons: HYPER STAT & DETAIL > -->
        <div class="stat-footer-bar flex items-center justify-between mt-1 pt-1 border-t border-[#2a3545]">
          <button type="button" class="px-3 py-1 bg-[#253042] hover:bg-[#34445c] border border-[#3b4b62] hover:border-[#38bdf8]/60 rounded-[3px] text-slate-200 hover:text-white text-[10px] font-bold cursor-pointer transition-all shadow-sm" data-act="toggle-hyper">HYPER STAT</button>
          <button type="button" class="px-3 py-1 bg-[#1f2937] hover:bg-[#2e3e54] border border-[#3b4b62] hover:border-[#38bdf8] rounded-[3px] text-[#38bdf8] hover:text-white text-[10px] font-black cursor-pointer transition-all shadow-sm flex items-center gap-1" data-act="toggle-detail">
            <span>DETAIL</span>
            <span class="text-[9px]">${this.isDetailed ? "▲" : "▼"}</span>
          </button>
        </div>

        <!-- Expandable Detail Combat Stats Panel -->
        ${this.isDetailed ? `
          <div class="stat-detail-expanded flex flex-col gap-1 p-2 bg-[#0e131b]/95 border border-[#2e3746] rounded-[4px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] animate-in fade-in duration-200">
            <div class="flex items-center justify-between px-2 py-0.5 text-[9.5px] border-b border-[#1f2937]">
              <span class="text-slate-400">COMBAT POWER</span>
              <b class="text-amber-300 font-black">${fmt(cp)}</b>
            </div>
            <div class="flex items-center justify-between px-2 py-0.5 text-[9.5px] border-b border-[#1f2937]">
              <span class="text-slate-400">FINAL DAMAGE</span>
              <b class="text-white">188.53%</b>
            </div>
            <div class="flex items-center justify-between px-2 py-0.5 text-[9.5px] border-b border-[#1f2937]">
              <span class="text-slate-400">BOSS DAMAGE</span>
              <b class="text-amber-200">140.00%</b>
            </div>
            <div class="flex items-center justify-between px-2 py-0.5 text-[9.5px] border-b border-[#1f2937]">
              <span class="text-slate-400">IGNORE DEFENSE</span>
              <b class="text-sky-300">84.28%</b>
            </div>
            <div class="flex items-center justify-between px-2 py-0.5 text-[9.5px] border-b border-[#1f2937]">
              <span class="text-slate-400">ATTACK POWER</span>
              <b class="text-white">${g.watk()}</b>
            </div>
            <div class="flex items-center justify-between px-2 py-0.5 text-[9.5px] border-b border-[#1f2937]">
              <span class="text-slate-400">CRITICAL RATE</span>
              <b class="text-emerald-300">100%</b>
            </div>
            <div class="flex items-center justify-between px-2 py-0.5 text-[9.5px] border-b border-[#1f2937]">
              <span class="text-slate-400">CRITICAL DAMAGE</span>
              <b class="text-purple-300">74.00%</b>
            </div>
            <div class="flex items-center justify-between px-2 py-0.5 text-[9.5px]">
              <span class="text-slate-400">STAR FORCE</span>
              <b class="text-yellow-400">★ 135</b>
            </div>
          </div>
        ` : ""}
      </div>
    `;

    this.body.innerHTML = html;
  }
}
