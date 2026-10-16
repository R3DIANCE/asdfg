// Modern MapleStory Bottom HUD Controller — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
// Pure Tailwind CSS modern stylish glassmorphism architecture
import { ComponentBase } from "@orillusion/core";
import { el } from "../util.ts";

export interface StatusUpdateData {
  level: number;
  name: string;
  job?: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  exp: number;
  expNeed: number;
}

export class StatusCapsule extends ComponentBase {
  root!: HTMLElement;
  levelBadge!: HTMLElement;
  nameLabel!: HTMLElement;
  jobLabel!: HTMLElement;
  hpFill!: HTMLElement;
  hpValText!: HTMLElement;
  hpPctText!: HTMLElement;
  mpFill!: HTMLElement;
  mpValText!: HTMLElement;
  mpPctText!: HTMLElement;
  expBarRoot!: HTMLElement;
  expFill!: HTMLElement;
  expText!: HTMLElement;

  private parentEl!: HTMLElement;

  constructor(parent?: HTMLElement | { parent: HTMLElement }) {
    super();
    if (parent) {
      if (parent instanceof HTMLElement) {
        this.parentEl = parent;
        this.initComponent();
      } else if ((parent as any).parent) {
        this.parentEl = (parent as any).parent;
        this.initComponent();
      }
    }
  }

  public override init(param?: { parent: HTMLElement }): void {
    super.init(param);
    if (param?.parent && !this.root) {
      this.parentEl = param.parent;
      this.initComponent();
    }
  }

  public override start(): void {
    // Orillusion lifecycle hook
  }

  public override onUpdate(): void {
    // Orillusion lifecycle hook
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
    this.root?.remove();
    this.expBarRoot?.remove();
  }

  private initComponent() {
    // Modern Translucent Status Panel (HP/MP)
    this.root = el(
      "div",
      "ms-status-capsule flex flex-col gap-1.5 p-2 bg-slate-950/80 border border-white/10 rounded-lg backdrop-blur-[14px] shadow-[0_8px_32px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)] w-[270px] pointer-events-auto select-none transition-all",
      this.parentEl
    );

    // 1. Top Identity Row
    const topRow = el("div", "flex items-center justify-between px-0.5", this.root);
    const leftIdentity = el("div", "flex items-center gap-1.5 min-w-0", topRow);
    this.levelBadge = el("span", "ms-status-lv px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[10px] border border-amber-500/30 flex-shrink-0", leftIdentity);
    this.levelBadge.textContent = "Lv. 1";
    this.nameLabel = el("span", "ms-status-name font-bold text-[11.5px] text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]", leftIdentity);
    this.nameLabel.textContent = "Adventurer";
    this.jobLabel = el("span", "ms-status-job text-[10px] text-sky-300/90 font-semibold truncate flex-shrink-0", topRow);
    this.jobLabel.textContent = "Beginner";

    // 2. Dual Gauges Container
    const gaugesContainer = el("div", "flex flex-col gap-1", this.root);

    // HP Gauge
    const hpTrack = el("div", "relative h-[18px] w-full bg-slate-900/90 rounded border border-white/10 overflow-hidden shadow-inner cursor-pointer group", gaugesContainer);
    hpTrack.title = "Hit Points (HP)";
    this.hpFill = el("div", "ms-hp-fill h-full bg-gradient-to-r from-rose-600 via-rose-500 to-rose-400 rounded transition-all duration-300 relative shadow-[0_0_10px_rgba(244,63,94,0.35)]", hpTrack);
    this.hpFill.style.width = "100%";
    el("div", "absolute top-0 left-0 right-0 h-[35%] bg-gradient-to-b from-white/25 to-transparent pointer-events-none", this.hpFill);
    const hpOverlay = el("div", "absolute inset-0 flex items-center justify-between px-2 font-mono font-bold text-[9.5px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] pointer-events-none select-none", hpTrack);
    el("span", "text-rose-200 font-black text-[8.5px] tracking-wider", hpOverlay).textContent = "HP";
    this.hpValText = el("span", "ms-hp-val", hpOverlay);
    this.hpValText.textContent = "50 / 50";
    this.hpPctText = el("span", "ms-hp-pct text-rose-100 text-[8.5px]", hpOverlay);
    this.hpPctText.textContent = "100%";

    // MP Gauge
    const mpTrack = el("div", "relative h-[18px] w-full bg-slate-900/90 rounded border border-white/10 overflow-hidden shadow-inner cursor-pointer group", gaugesContainer);
    mpTrack.title = "Mana Points (MP)";
    this.mpFill = el("div", "ms-mp-fill h-full bg-gradient-to-r from-sky-600 via-cyan-500 to-sky-400 rounded transition-all duration-300 relative shadow-[0_0_10px_rgba(14,165,233,0.35)]", mpTrack);
    this.mpFill.style.width = "100%";
    el("div", "absolute top-0 left-0 right-0 h-[35%] bg-gradient-to-b from-white/25 to-transparent pointer-events-none", this.mpFill);
    const mpOverlay = el("div", "absolute inset-0 flex items-center justify-between px-2 font-mono font-bold text-[9.5px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] pointer-events-none select-none", mpTrack);
    el("span", "text-cyan-200 font-black text-[8.5px] tracking-wider", mpOverlay).textContent = "MP";
    this.mpValText = el("span", "ms-mp-val", mpOverlay);
    this.mpValText.textContent = "5 / 5";
    this.mpPctText = el("span", "ms-mp-pct text-cyan-100 text-[8.5px]", mpOverlay);
    this.mpPctText.textContent = "100%";

    // 3. Screen Bottom Translucent EXP Bar (Hidden in favor of WebGPU Canvas EXP bar)
    document.querySelectorAll(".ms-screen-exp-bar").forEach((e) => e.remove());
    this.expBarRoot = el(
      "div",
      "ms-screen-exp-bar fixed left-0 right-0 bottom-0 h-4 bg-slate-950/85 backdrop-blur-[10px] border-t border-white/10 z-[20] pointer-events-auto flex items-center justify-center select-none overflow-hidden cursor-default shadow-lg hidden",
      document.body
    );
    this.expBarRoot.style.display = "none";
    this.expFill = el(
      "div",
      "ms-exp-fill absolute left-0 top-0 bottom-0 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 transition-all duration-300 shadow-[0_0_12px_rgba(52,211,153,0.4)]",
      this.expBarRoot
    );
    this.expFill.style.width = "0%";
    el("div", "absolute top-0 left-0 right-0 h-[35%] bg-gradient-to-b from-white/30 to-transparent pointer-events-none", this.expFill);
    this.expText = el(
      "span",
      "ms-exp-text relative z-10 font-mono font-bold text-[9.5px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]",
      this.expBarRoot
    );
    this.expText.textContent = "EXP 0 / 15 [0.00%]";
  }

  update(d: StatusUpdateData) {
    const safeMaxHp = Math.max(1, d.maxHp || 50);
    const safeMaxMp = Math.max(1, d.maxMp || 5);
    const safeNeedExp = Math.max(1, d.expNeed || 15);

    const hpPct = Math.min(100, Math.max(0, (d.hp / safeMaxHp) * 100));
    const mpPct = Math.min(100, Math.max(0, (d.mp / safeMaxMp) * 100));
    const expPct = Math.min(100, Math.max(0, (d.exp / safeNeedExp) * 100));

    if (this.levelBadge) this.levelBadge.textContent = `Lv. ${d.level}`;
    if (this.nameLabel) this.nameLabel.textContent = d.name || "Adventurer";
    if (this.jobLabel && d.job) this.jobLabel.textContent = d.job;

    if (this.hpFill) this.hpFill.style.width = `${hpPct}%`;
    if (this.hpValText) this.hpValText.textContent = `${d.hp.toLocaleString()} / ${safeMaxHp.toLocaleString()}`;
    if (this.hpPctText) this.hpPctText.textContent = `${hpPct.toFixed(1)}%`;

    if (this.mpFill) this.mpFill.style.width = `${mpPct}%`;
    if (this.mpValText) this.mpValText.textContent = `${d.mp.toLocaleString()} / ${safeMaxMp.toLocaleString()}`;
    if (this.mpPctText) this.mpPctText.textContent = `${mpPct.toFixed(1)}%`;

    if (this.expFill) this.expFill.style.width = `${expPct}%`;
    if (this.expText) {
      this.expText.textContent = `EXP ${d.exp.toLocaleString()} / ${safeNeedExp.toLocaleString()} [${expPct.toFixed(2)}%]`;
    }
    if (this.expBarRoot) {
      const remaining = Math.max(0, safeNeedExp - d.exp);
      this.expBarRoot.title = `EXP: ${d.exp.toLocaleString()} / ${safeNeedExp.toLocaleString()} (${expPct.toFixed(2)}%)\nRemaining to Level Up: ${remaining.toLocaleString()} (${(100 - expPct).toFixed(2)}%)`;
    }
  }
}

export class PlayerStatusTag extends ComponentBase {
  root!: HTMLElement;
  levelVal!: HTMLElement;
  nameVal!: HTMLElement;

  private parentEl!: HTMLElement;

  constructor(parent?: HTMLElement | { parent: HTMLElement }) {
    super();
    if (parent) {
      if (parent instanceof HTMLElement) {
        this.parentEl = parent;
        this.initComponent();
      } else if ((parent as any).parent) {
        this.parentEl = (parent as any).parent;
        this.initComponent();
      }
    }
  }

  public override init(param?: { parent: HTMLElement }): void {
    super.init(param);
    if (param?.parent && !this.root) {
      this.parentEl = param.parent;
      this.initComponent();
    }
  }

  public override start(): void {
    // Orillusion lifecycle hook
  }

  public override onUpdate(): void {
    // Orillusion lifecycle hook
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
    this.root?.remove();
  }

  private initComponent() {
    this.root = el(
      "div",
      "ms-player-bar flex items-center h-[28px] bg-slate-950/80 border border-white/10 rounded-[6px] px-2.5 gap-2 backdrop-blur-[14px] shadow-[0_4px_16px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-auto select-none",
      this.parentEl
    );
    const lvBadge = el("div", "ms-player-lv flex items-baseline gap-0.5", this.root);
    el("span", "text-slate-400 font-bold text-[10.5px] leading-none", lvBadge).textContent = "Lv.";
    this.levelVal = el("span", "text-amber-300 font-black text-[12px] leading-none font-mono", lvBadge);
    this.nameVal = el("span", "ms-player-ign font-bold text-[12px] leading-none text-white tracking-[0.2px] drop-shadow-[0_1px_2px_#000]", this.root);
  }

  update(level: number, name: string) {
    if (this.levelVal) this.levelVal.textContent = `${level}`;
    if (this.nameVal) this.nameVal.textContent = name;
  }
}

export interface MenuItem {
  iconSvg: string;
  title: string;
  shortcut?: string;
  onClick: (btn: HTMLElement) => void;
  badge?: boolean;
}

export class MenuButtons extends ComponentBase {
  root!: HTMLElement;
  badges: Record<string, HTMLElement> = {};

  private parentEl!: HTMLElement;
  private items!: Record<string, MenuItem>;

  constructor(parent?: HTMLElement | { parent: HTMLElement; items: Record<string, MenuItem> }, items?: Record<string, MenuItem>) {
    super();
    if (parent instanceof HTMLElement && items) {
      this.parentEl = parent;
      this.items = items;
      this.initComponent();
    } else if (parent && (parent as any).parent && (parent as any).items) {
      this.parentEl = (parent as any).parent;
      this.items = (parent as any).items;
      this.initComponent();
    }
  }

  public override init(param?: { parent: HTMLElement; items: Record<string, MenuItem> }): void {
    super.init(param);
    if (param?.parent && param?.items && !this.root) {
      this.parentEl = param.parent;
      this.items = param.items;
      this.initComponent();
    }
  }

  public override start(): void {
    // Orillusion lifecycle hook
  }

  public override onUpdate(): void {
    // Orillusion lifecycle hook
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
    this.root?.remove();
  }

  private initComponent() {
    this.root = el(
      "div",
      "dock-menu flex items-center gap-1 p-1.5 bg-slate-950/80 border border-white/10 rounded-lg backdrop-blur-[14px] shadow-[0_8px_32px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-auto select-none",
      this.parentEl
    );

    for (const [key, item] of Object.entries(this.items)) {
      const b = el(
        "button",
        "ms-menu-btn relative w-8 h-8 rounded-md bg-white/5 hover:bg-white/15 active:translate-y-[1px] border border-white/10 hover:border-sky-400/50 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm group",
        this.root
      ) as HTMLButtonElement;
      b.type = "button";
      b.title = item.title;
      b.setAttribute("aria-label", item.title);
      b.innerHTML = `
        <span class="flex items-center justify-center group-hover:scale-110 transition-transform">${item.iconSvg}</span>
        ${item.shortcut ? `<span class="absolute -bottom-1 -right-0.5 px-0.5 font-mono text-[7px] font-bold bg-black/85 rounded border border-white/15 text-slate-400 group-hover:text-slate-200 pointer-events-none leading-none">${item.shortcut}</span>` : ""}
      `;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        item.onClick(b);
      });
      if (item.badge) {
        this.badges[key] = el(
          "span",
          "ms-badge-dot absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 border border-black shadow-[0_0_6px_#f59e0b] animate-pulse hidden pointer-events-none",
          b
        );
      }
    }
  }

  setBadge(key: string, visible: boolean) {
    if (this.badges[key]) {
      this.badges[key].classList.toggle("hidden", !visible);
    }
  }
}
