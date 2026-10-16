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
  hpZone!: HTMLElement;
  mpZone!: HTMLElement;

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
    document.querySelectorAll(".ms-screen-exp-bar").forEach((e) => e.remove());
  }

  private initComponent() {
    // Anchor container sized 424px to house both the HP/MP status panel (204px) and WebGPU menu buttons (210px)
    this.root = el(
      "div",
      "ms-hud-center relative w-[424px] h-[70px] pointer-events-auto select-none cursor-default flex flex-col justify-between",
      this.parentEl
    );

    // Interactive tooltip regions over the WebGPU-drawn authentic WZ HP and MP bars
    this.hpZone = el(
      "div",
      "ms-hp-zone absolute left-[24px] top-[26px] w-[171px] h-[16px] cursor-pointer z-[10]",
      this.root
    );
    this.mpZone = el(
      "div",
      "ms-mp-zone absolute left-[24px] top-[42px] w-[171px] h-[16px] cursor-pointer z-[10]",
      this.root
    );

    // Remove any legacy HTML EXP bars so the WebGPU WZ EXP bar renders cleanly
    document.querySelectorAll(".ms-screen-exp-bar").forEach((e) => e.remove());
  }

  update(d: StatusUpdateData) {
    const hpPct = Math.min(100, Math.max(0, (d.hp / d.maxHp) * 100));
    const mpPct = Math.min(100, Math.max(0, (d.mp / d.maxMp) * 100));

    if (this.hpZone) {
      this.hpZone.title = `HP: ${d.hp.toLocaleString()} / ${d.maxHp.toLocaleString()} (${hpPct.toFixed(1)}%)`;
    }
    if (this.mpZone) {
      this.mpZone.title = `MP: ${d.mp.toLocaleString()} / ${d.maxMp.toLocaleString()} (${mpPct.toFixed(1)}%)`;
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
      "ms-player-bar flex items-center h-[28px] bg-[#1a2332]/85 border border-[#9ca8b8]/40 rounded-[4px] px-2.5 gap-2 backdrop-blur-[4px] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_5px_rgba(0,0,0,0.4)] pointer-events-auto select-none",
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
        "ms-menu-btn relative w-[28px] h-[28px] bg-[#1a2332]/85 hover:bg-[#2b3749] active:translate-y-[1px] border border-[#9ca8b8]/40 hover:border-[#38bdf8] rounded-[4px] flex items-center justify-center text-slate-200 hover:text-white cursor-pointer p-0 backdrop-blur-[4px] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_5px_rgba(0,0,0,0.4)] transition-all duration-100",
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
