// Modern MapleStory NEXT Bottom HUD Controller — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
// Exact 1:1 match to reference using Tailwind CSS and Orillusion ComponentBase
import { ComponentBase } from "@orillusion/core";
import { el } from "../util.ts";

export interface StatusUpdateData {
  level: number;
  name: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  exp: number;
  expNeed: number;
}

export class StatusCapsule extends ComponentBase {
  root!: HTMLElement;
  hpFill!: HTMLElement;
  hpText!: HTMLElement;
  mpFill!: HTMLElement;
  mpText!: HTMLElement;
  expText!: HTMLElement;
  expBottomFill!: HTMLElement;

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
    this.root = el("div", "ms-hud-center relative flex flex-col justify-center items-center gap-[3px] pointer-events-auto select-none", this.parentEl);

    // HP Bar Row — sleek solid advanced HUD design without gradients
    const hpRow = el(
      "div",
      "ms-bar-row flex items-center w-[290px] h-[20px] bg-[#161c24] border border-[#283344] rounded-[4px] p-[2px] gap-[4px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] transition-all",
      this.root
    );
    // Left Key Badge matching quick slot badges
    const hpBadge = el(
      "span",
      "slot-badge flex-shrink-0 w-[24px] h-[16px] font-black text-[8px] leading-[16px] rounded-[2px] text-center uppercase tracking-[0.2px] bg-[#d90429] text-white shadow-[0_1px_2px_rgba(0,0,0,0.4)] select-none",
      hpRow
    );
    hpBadge.textContent = "HP";

    const hpTrack = el(
      "div",
      "ms-bar-track relative flex-1 h-[16px] bg-[#0c1017] border border-[#1b222d] rounded-[2px] overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,0,0.7)]",
      hpRow
    );
    this.hpFill = el(
      "div",
      "ms-bar-fill hp absolute left-0 top-0 bottom-0 w-full transition-[width] duration-200 ease-out bg-[#e63946] border-r-2 border-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]",
      hpTrack
    );
    this.hpText = el(
      "div",
      "ms-bar-text absolute inset-0 flex items-center justify-center font-mono font-bold text-[10.5px] leading-[16px] text-white tracking-[0.3px] drop-shadow-[0_1px_2px_#000] z-[2] pointer-events-none select-none tabular-nums",
      hpTrack
    );

    // MP Bar Row — sleek solid advanced HUD design without gradients
    const mpRow = el(
      "div",
      "ms-bar-row flex items-center w-[290px] h-[20px] bg-[#161c24] border border-[#283344] rounded-[4px] p-[2px] gap-[4px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] transition-all",
      this.root
    );
    const mpBadge = el(
      "span",
      "slot-badge flex-shrink-0 w-[24px] h-[16px] font-black text-[8px] leading-[16px] rounded-[2px] text-center uppercase tracking-[0.2px] bg-[#0284c7] text-white shadow-[0_1px_2px_rgba(0,0,0,0.4)] select-none",
      mpRow
    );
    mpBadge.textContent = "MP";

    const mpTrack = el(
      "div",
      "ms-bar-track relative flex-1 h-[16px] bg-[#0c1017] border border-[#1b222d] rounded-[2px] overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,0,0.7)]",
      mpRow
    );
    this.mpFill = el(
      "div",
      "ms-bar-fill mp absolute left-0 top-0 bottom-0 w-full transition-[width] duration-200 ease-out bg-[#0284c7] border-r-2 border-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]",
      mpTrack
    );
    this.mpText = el(
      "div",
      "ms-bar-text absolute inset-0 flex items-center justify-center font-mono font-bold text-[10.5px] leading-[16px] text-white tracking-[0.3px] drop-shadow-[0_1px_2px_#000] z-[2] pointer-events-none select-none tabular-nums",
      mpTrack
    );

    // Full screen width bottom EXP bar matching quick slots glass style & badges
    let fullExp = document.querySelector(".ms-screen-exp-bar") as HTMLElement;
    if (!fullExp) {
      fullExp = el(
        "div",
        "ms-screen-exp-bar fixed left-0 right-0 bottom-0 w-screen h-[14px] bg-[#0c1017]/95 border-t border-[#283344] shadow-[0_-1px_3px_rgba(0,0,0,0.6)] z-[100] flex items-center px-1.5 backdrop-blur-[2px] box-border pointer-events-none overflow-hidden",
        document.body
      );
    }
    const expBadge = el(
      "span",
      "slot-badge relative flex-shrink-0 h-[10px] px-1.5 font-black text-[6.5px] leading-[10px] rounded-[2px] text-center uppercase tracking-[0.2px] bg-[#65a30d] text-white shadow-[0_1px_2px_rgba(0,0,0,0.5)] mr-1.5 z-[3] select-none",
      fullExp
    );
    expBadge.textContent = "EXP";

    // Segment marks every 10%
    for (let i = 1; i < 10; i++) {
      const tick = el("div", "ms-exp-tick absolute top-0 bottom-0 w-[1px] bg-black/40 z-[2] pointer-events-none", fullExp);
      tick.style.left = `${i * 10}%`;
    }

    this.expBottomFill = el(
      "div",
      "ms-screen-exp-fill absolute left-0 top-0 bottom-0 bg-[#84cc16] border-r-2 border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-[width] duration-250 pointer-events-none",
      fullExp
    );
    this.expText = el(
      "div",
      "ms-screen-exp-text absolute inset-0 flex items-center justify-center font-mono font-bold text-[8.5px] leading-[14px] text-white tracking-[0.2px] drop-shadow-[0_1px_2px_#000] z-[3] pointer-events-none select-none tabular-nums",
      fullExp
    );
  }

  update(d: StatusUpdateData) {
    const hpPct = Math.min(100, Math.max(0, (d.hp / d.maxHp) * 100));
    const mpPct = Math.min(100, Math.max(0, (d.mp / d.maxMp) * 100));
    const expPct = Math.min(100, Math.max(0, (d.exp / d.expNeed) * 100));

    this.hpFill.style.width = `${hpPct}%`;
    this.mpFill.style.width = `${mpPct}%`;
    this.expBottomFill.style.width = `${expPct}%`;

    this.hpText.textContent = `${d.hp.toLocaleString()} / ${d.maxHp.toLocaleString()}`;
    this.mpText.textContent = `${d.mp.toLocaleString()} / ${d.maxMp.toLocaleString()}`;
    this.expText.textContent = `EXP ${d.exp.toLocaleString()} [${expPct.toFixed(2)}%]`;

    // Critical HP warning pulse on bar border
    const hpRow = this.root.querySelector(".ms-bar-row") as HTMLElement | null;
    if (hpRow) {
      if (hpPct <= 25 && d.hp > 0) {
        hpRow.classList.add("border-rose-500", "shadow-[0_0_8px_rgba(244,63,94,0.5)]");
      } else {
        hpRow.classList.remove("border-rose-500", "shadow-[0_0_8px_rgba(244,63,94,0.5)]");
      }
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
      "ms-player-bar flex items-center h-[26px] bg-[#3a4454]/85 border border-[#9ca8b8]/40 rounded-[4px] px-2.5 gap-2 backdrop-blur-[4px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] pointer-events-auto select-none",
      this.parentEl
    );
    const lvBadge = el("div", "ms-player-lv flex items-baseline gap-0.5", this.root);
    el("span", "text-slate-400 font-bold text-[11px] leading-none", lvBadge).textContent = "Lv.";
    this.levelVal = el("span", "text-white font-black text-[12.5px] leading-none", lvBadge);
    this.nameVal = el("span", "ms-player-ign font-bold text-[12.5px] leading-none text-white tracking-[0.2px] drop-shadow-[0_1px_2px_#000]", this.root);
  }

  update(level: number, name: string) {
    this.levelVal.textContent = `${level}`;
    this.nameVal.textContent = name;
  }
}


export interface MenuItem {
  iconSvg: string;
  title: string;
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
      "dock-menu flex items-center gap-[3px] p-0 bg-transparent border-0 shadow-none",
      this.parentEl
    );
    for (const [key, item] of Object.entries(this.items)) {
      const b = el(
        "button",
        "ms-menu-btn relative w-[27px] h-[27px] bg-[#3a4454]/80 hover:bg-[#4f5e77] active:translate-y-[1px] border border-[#9ca8b8]/40 hover:border-[#9ca8b8] rounded-[4px] flex items-center justify-center text-slate-200 hover:text-white cursor-pointer p-0 backdrop-blur-[3px] shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-100",
        this.root
      ) as HTMLButtonElement;
      b.type = "button";
      b.title = item.title;
      b.setAttribute("aria-label", item.title);
      b.innerHTML = item.iconSvg;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        item.onClick(b);
      });
      if (item.badge) {
        this.badges[key] = el(
          "span",
          "ms-badge-dot absolute right-[2px] top-[2px] w-[5px] h-[5px] rounded-full bg-[#ff9f1c] border border-black shadow-[0_0_4px_#ff9f1c] hidden",
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
