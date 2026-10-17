// Modern MapleStory Bottom HUD Controller — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
// Shadcn UI Architecture & Tailwind styling
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
    // Status Panel (HP/MP) — Unified Modern Shadcn Glass Card
    this.root = el(
      "div",
      "ms-status-capsule flex flex-col justify-between p-2 bg-zinc-950/85 hover:bg-zinc-950/95 border border-white/10 hover:border-white/20 rounded-lg backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)] w-[240px] h-[62px] box-border pointer-events-auto select-none transition-all overflow-hidden",
      this.parentEl
    );

    // 1. Top Identity Row (Level, Name)
    const topRow = el("div", "flex items-center justify-between px-0.5 h-[16px]", this.root);
    const leftIdentity = el("div", "flex items-center gap-2 min-w-0", topRow);

    // Shadcn Gold Level Badge
    this.levelBadge = el(
      "span",
      "ms-status-lv inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/15 text-amber-300 font-mono font-black text-[9.5px] px-2.5 py-0.5 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] tracking-tight flex-shrink-0 shadow-sm",
      leftIdentity
    );
    this.levelBadge.textContent = "Lv. 1";

    // Player IGN
    this.nameLabel = el(
      "span",
      "ms-status-name font-bold text-[11.5px] text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] tracking-wide leading-none",
      leftIdentity
    );
    this.nameLabel.textContent = "Adventurer";

    // Subtle Job Indicator (hidden by default unless set)
    this.jobLabel = el(
      "span",
      "ms-status-job font-mono text-[9px] text-zinc-400 truncate leading-none hidden",
      topRow
    );

    // 2. Dual Gauges Container (Sleek Rectangular Shadcn Progress Bars)
    const gaugesContainer = el("div", "flex flex-col gap-1.5 h-[34px] justify-center", this.root);

    // HP Gauge
    const hpTrack = el(
      "div",
      "relative h-[15px] w-full bg-zinc-950/90 rounded-[3px] border border-white/10 overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] cursor-pointer group",
      gaugesContainer
    );
    hpTrack.title = "Hit Points (HP)";
    this.hpFill = el(
      "div",
      "ms-hp-fill h-full bg-gradient-to-r from-rose-600 via-rose-500 to-rose-400 rounded-[2px] relative shadow-[0_0_8px_rgba(244,63,94,0.35)] transition-all duration-300",
      hpTrack
    );
    this.hpFill.style.width = "100%";
    el("div", "absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-b from-white/30 to-transparent pointer-events-none", this.hpFill);

    const hpOverlay = el(
      "div",
      "absolute inset-0 flex items-center justify-between px-2 font-mono font-bold text-[8px] text-white drop-shadow-[0_1px_2px_#000] pointer-events-none select-none tabular-nums leading-none",
      hpTrack
    );
    const hpLeft = el("span", "flex items-center gap-1.5", hpOverlay);
    el("span", "text-rose-200 font-black text-[7.5px] bg-rose-500/25 px-1.5 py-0.5 rounded-[3px] border border-rose-400/30 leading-none", hpLeft).textContent = "HP";
    this.hpValText = el("span", "ms-hp-val", hpLeft);
    this.hpValText.textContent = "50 / 50";
    this.hpPctText = el("span", "ms-hp-pct text-rose-200 font-bold text-[8px] tabular-nums", hpOverlay);
    this.hpPctText.textContent = "100%";

    // MP Gauge
    const mpTrack = el(
      "div",
      "relative h-[15px] w-full bg-zinc-950/90 rounded-[3px] border border-white/10 overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] cursor-pointer group",
      gaugesContainer
    );
    mpTrack.title = "Mana Points (MP)";
    this.mpFill = el(
      "div",
      "ms-mp-fill h-full bg-gradient-to-r from-sky-600 via-sky-500 to-cyan-400 rounded-[2px] relative shadow-[0_0_8px_rgba(56,189,248,0.35)] transition-all duration-300",
      mpTrack
    );
    this.mpFill.style.width = "100%";
    el("div", "absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-b from-white/30 to-transparent pointer-events-none", this.mpFill);

    const mpOverlay = el(
      "div",
      "absolute inset-0 flex items-center justify-between px-2 font-mono font-bold text-[8px] text-white drop-shadow-[0_1px_2px_#000] pointer-events-none select-none tabular-nums leading-none",
      mpTrack
    );
    const mpLeft = el("span", "flex items-center gap-1.5", mpOverlay);
    el("span", "text-cyan-200 font-black text-[7.5px] bg-cyan-500/25 px-1.5 py-0.5 rounded-[3px] border border-cyan-400/30 leading-none", mpLeft).textContent = "MP";
    this.mpValText = el("span", "ms-mp-val", mpLeft);
    this.mpValText.textContent = "5 / 5";
    this.mpPctText = el("span", "ms-mp-pct text-cyan-200 font-bold text-[8px] tabular-nums", mpOverlay);
    this.mpPctText.textContent = "100%";

    // 3. Screen Bottom Static Translucent EXP Bar (Always visible 9px height, tabular numbers never shifting)
    document.querySelectorAll(".ms-screen-exp-bar").forEach((e) => e.remove());
    this.expBarRoot = el(
      "div",
      "ms-screen-exp-bar fixed left-0 right-0 bottom-0 h-[9px] bg-zinc-950/95 backdrop-blur-md border-t border-white/10 z-[20] pointer-events-auto flex items-center justify-center select-none overflow-hidden cursor-pointer shadow-lg",
      document.body
    );
    this.expFill = el(
      "div",
      "ms-exp-fill absolute left-0 top-0 bottom-0 bg-gradient-to-r from-emerald-600 via-teal-400 to-emerald-400 transition-all duration-300 shadow-[0_0_10px_rgba(52,211,153,0.4)]",
      this.expBarRoot
    );
    this.expFill.style.width = "0%";
    el("div", "absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-b from-white/35 to-transparent pointer-events-none", this.expFill);
    this.expText = el(
      "span",
      "ms-exp-text relative z-10 font-mono font-bold text-[7.5px] leading-none text-emerald-100 drop-shadow-[0_1px_2px_rgba(0,0,0,1)] tracking-normal tabular-nums select-none",
      this.expBarRoot
    );
    this.expText.textContent = "0 / 15 [0.00%]";
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
    if (this.jobLabel && d.job) {
      this.jobLabel.textContent = d.job;
      this.jobLabel.classList.remove("hidden");
    }

    if (this.hpFill) this.hpFill.style.width = `${hpPct}%`;
    if (this.hpValText) this.hpValText.textContent = `${d.hp.toLocaleString()} / ${safeMaxHp.toLocaleString()}`;
    if (this.hpPctText) this.hpPctText.textContent = `${hpPct.toFixed(1)}%`;

    if (this.mpFill) this.mpFill.style.width = `${mpPct}%`;
    if (this.mpValText) this.mpValText.textContent = `${d.mp.toLocaleString()} / ${safeMaxMp.toLocaleString()}`;
    if (this.mpPctText) this.mpPctText.textContent = `${mpPct.toFixed(1)}%`;

    if (this.expFill) this.expFill.style.width = `${expPct}%`;
    if (this.expText) {
      this.expText.textContent = `${d.exp.toLocaleString()} / ${safeNeedExp.toLocaleString()} [${expPct.toFixed(2)}%]`;
    }
    if (this.expBarRoot) {
      const remaining = Math.max(0, safeNeedExp - d.exp);
      this.expBarRoot.title = `${d.exp.toLocaleString()} / ${safeNeedExp.toLocaleString()} (${expPct.toFixed(2)}%)\nRemaining to Level Up: ${remaining.toLocaleString()} (${(100 - expPct).toFixed(2)}%)`;
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
      "ms-player-bar flex items-center h-[28px] bg-zinc-950/80 border border-white/10 rounded-[6px] px-2.5 gap-2 backdrop-blur-[14px] shadow-[0_4px_16px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-auto select-none",
      this.parentEl
    );
    const lvBadge = el("div", "ms-player-lv inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/35 shadow-sm", this.root);
    el("span", "text-amber-400/80 font-bold text-[10px] leading-none", lvBadge).textContent = "Lv.";
    this.levelVal = el("span", "text-amber-300 font-black text-[11.5px] leading-none font-mono", lvBadge);
    this.nameVal = el("span", "ms-player-ign font-bold text-[12px] leading-none text-white tracking-[0.2px] drop-shadow-[0_1px_2px_#000] ml-0.5", this.root);
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

export class MenuButtonComponent extends ComponentBase {
  public root!: HTMLButtonElement;
  public badgeEl?: HTMLElement;
  public item!: MenuItem;
  public key!: string;

  constructor(parent?: HTMLElement | { parent: HTMLElement; key: string; item: MenuItem }, key?: string, item?: MenuItem) {
    super();
    if (parent instanceof HTMLElement && key && item) {
      this.init({ parent, key, item });
    } else if (parent && !(parent instanceof HTMLElement) && (parent as any).parent) {
      this.init(parent as any);
    }
  }

  public override init(param?: { parent: HTMLElement; key: string; item: MenuItem }): void {
    super.init(param);
    if (!param?.parent || !param?.key || !param?.item || this.root) return;
    this.key = param.key;
    this.item = param.item;
    this.render(param.parent);
  }

  private render(parent: HTMLElement) {
    const item = this.item;
    this.root = el(
      "button",
      "ms-menu-btn relative w-[29px] h-[29px] rounded-md bg-zinc-900/80 hover:bg-zinc-800 active:translate-y-[1px] border border-white/10 hover:border-sky-400/50 flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer backdrop-blur-sm shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] group select-none",
      parent
    ) as HTMLButtonElement;
    this.root.type = "button";
    this.root.dataset.menuKey = this.key;
    this.root.title = item.title;
    this.root.setAttribute("aria-label", item.title);
    this.root.innerHTML = `
      <span class="flex items-center justify-center group-hover:scale-110 transition-transform">${item.iconSvg}</span>
      ${item.shortcut ? `<span class="slot-key absolute left-[2px] top-[1.5px] font-mono text-[7px] font-bold text-zinc-400 group-hover:text-zinc-200 drop-shadow-[0_1px_2px_#000] pointer-events-none leading-none z-[3]">${item.shortcut}</span>` : ""}
    `;
    this.root.addEventListener("click", (e) => {
      e.stopPropagation();
      item.onClick(this.root);
    });
    if (item.badge) {
      this.badgeEl = el(
        "span",
        "ms-badge-dot absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 border border-zinc-950 shadow-[0_0_6px_#f59e0b] hidden pointer-events-none",
        this.root
      );
    }
  }

  public setBadge(visible: boolean) {
    if (this.badgeEl) {
      this.badgeEl.classList.toggle("hidden", !visible);
    }
  }

  public setActive(active: boolean) {
    if (this.root) {
      this.root.classList.toggle("border-sky-400", active);
      this.root.classList.toggle("bg-zinc-800", active);
      this.root.classList.toggle("shadow-[0_0_8px_rgba(56,189,248,0.4)]", active);
    }
  }

  public trigger() {
    this.item?.onClick(this.root);
  }

  public override start(): void { }
  public override onUpdate(): void { }
  public override destroy(force?: boolean): void {
    super.destroy(force);
    this.root?.remove();
  }
}

export class ChatMenuButton extends MenuButtonComponent { }
export class InventoryMenuButton extends MenuButtonComponent { }
export class EquipmentMenuButton extends MenuButtonComponent { }
export class StatsMenuButton extends MenuButtonComponent { }
export class PartyMenuButton extends MenuButtonComponent { }

export class MenuButtons extends ComponentBase {
  root!: HTMLElement;
  badges: Record<string, HTMLElement> = {};
  buttonComponents: Map<string, MenuButtonComponent> = new Map();

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
    for (const btn of this.buttonComponents.values()) {
      btn.start();
    }
  }

  public override onUpdate(): void {
    for (const btn of this.buttonComponents.values()) {
      btn.onUpdate();
    }
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
    for (const btn of this.buttonComponents.values()) {
      btn.destroy(force);
    }
    this.buttonComponents.clear();
    this.root?.remove();
  }

  private initComponent() {
    this.root = el(
      "div",
      "dock-menu grid grid-cols-5 grid-rows-2 gap-1 h-[62px] p-0 bg-transparent border-0 shadow-none pointer-events-auto select-none",
      this.parentEl
    );

    for (const [key, item] of Object.entries(this.items)) {
      let btnComp: MenuButtonComponent;
      if (key === "chat") btnComp = new ChatMenuButton({ parent: this.root, key, item });
      else if (key === "inv") btnComp = new InventoryMenuButton({ parent: this.root, key, item });
      else if (key === "equip") btnComp = new EquipmentMenuButton({ parent: this.root, key, item });
      else if (key === "stat") btnComp = new StatsMenuButton({ parent: this.root, key, item });
      else if (key === "party") btnComp = new PartyMenuButton({ parent: this.root, key, item });
      else btnComp = new MenuButtonComponent({ parent: this.root, key, item });

      this.buttonComponents.set(key, btnComp);
      if (btnComp.badgeEl) {
        this.badges[key] = btnComp.badgeEl;
      }
    }
  }

  getButton(key: string): MenuButtonComponent | undefined {
    return this.buttonComponents.get(key);
  }

  get chatBtn(): ChatMenuButton | undefined {
    return this.buttonComponents.get("chat") as ChatMenuButton | undefined;
  }

  get invBtn(): InventoryMenuButton | undefined {
    return this.buttonComponents.get("inv") as InventoryMenuButton | undefined;
  }

  get equipBtn(): EquipmentMenuButton | undefined {
    return this.buttonComponents.get("equip") as EquipmentMenuButton | undefined;
  }

  get statBtn(): StatsMenuButton | undefined {
    return this.buttonComponents.get("stat") as StatsMenuButton | undefined;
  }

  get partyBtn(): PartyMenuButton | undefined {
    return this.buttonComponents.get("party") as PartyMenuButton | undefined;
  }

  setBadge(key: string, visible: boolean) {
    this.buttonComponents.get(key)?.setBadge(visible);
    if (this.badges[key]) {
      this.badges[key].classList.toggle("hidden", !visible);
    }
  }

  setActive(key: string, active: boolean) {
    this.buttonComponents.get(key)?.setActive(active);
  }
}
