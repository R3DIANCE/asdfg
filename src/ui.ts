// Authentic MapleStory NEXT 2025 HUD Controller — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
import { ComponentBase, Object3D } from "@orillusion/core";
import type { ChatKind, Game, MapData } from "./game.ts";
import { expToLevel } from "./game.ts";
import { Windows } from "./windows.ts";
import { ChatComponent } from "./components/chat.ts";
import { MinimapComponent } from "./components/minimap.ts";
import { StatusCapsule, MenuButtons, PlayerStatusTag } from "./components/hud.ts";
import { QuickBarComponent } from "./components/quick-bar.ts";
import { GmOnlinePanel } from "./components/GmOnlinePanel.ts";
import type { Action } from "./skills.ts";
import { el, esc } from "./util.ts";

export type UiData = Record<string, any>;

export function createUIEntity<T extends ComponentBase>(
  _name: string,
  comp: new (...args: any[]) => T,
  param: any,
  _container?: Object3D[],
  _canUseOrillusion = false
): T {
  const inst = new comp(param);
  if (typeof (inst as any).init === "function" && !(inst as any).root) {
    (inst as any).init(param);
  }
  return inst;
}

export class Hud extends ComponentBase {
  root!: HTMLElement;
  dock!: HTMLElement;
  dockLeft!: HTMLElement;
  dockCenter!: HTMLElement;
  dockRight!: HTMLElement;
  quickWrap!: HTMLElement;

  playerTag!: PlayerStatusTag;
  status!: StatusCapsule;
  perfContainer!: HTMLElement;
  menu!: MenuButtons;
  quick!: QuickBarComponent;
  chat!: ChatComponent;
  mini!: MinimapComponent;
  gmPanel!: GmOnlinePanel;
  wins!: Windows;
  gain!: HTMLElement;
  noticeBanner!: HTMLElement;
  lastSig = "";

  childEntities: Object3D[] = [];

  constructor(public ui?: UiData, public game?: Game, public win?: any) {
    super();
    if (ui && game && win) {
      this.setup(ui, game, win);
    }
  }

  public override init(param?: any): void {
    super.init(param);
    if (param?.ui && param?.game && param?.win && !this.wins) {
      this.setup(param.ui, param.game, param.win);
    }
  }

  public setup(ui: UiData, game: Game, win: any) {
    this.ui = ui;
    this.game = game;
    this.win = win;

    this.root = el("div", "hud", document.body);

    // Floating Bottom Dock (Tailwind CSS exact match to MapleStory HUD)
    this.dock = el("div", "dock fixed left-0 right-0 bottom-[18px] min-h-[70px] flex items-end justify-between px-2.5 pb-0.5 pointer-events-none select-none z-[12]", this.root);
    this.dockLeft = el("div", "dock-left pointer-events-auto flex items-end gap-2 min-w-0 mb-0.5", this.dock);
    this.dockCenter = el("div", "dock-center pointer-events-auto flex items-center justify-center gap-1.5 min-w-0", this.dock);
    this.dockRight = el("div", "dock-right pointer-events-auto flex flex-col items-end gap-0.5 min-w-0", this.dock);

    // Windows Manager initialized before slots & menus
    this.wins = new Windows(game, win, this.root);

    const canOrillusion = (game as any)?.r?.backend === "webgpu" && !!(game as any)?.r?.scene;

    // Left: Player level, IGN
    this.playerTag = createUIEntity("PlayerStatusTag", PlayerStatusTag, { parent: this.dockLeft }, this.childEntities, canOrillusion);

    // Center: 8 Square Menu Buttons + Dual HP/MP Stacked Bars + Centered EXP
    this.menu = createUIEntity(
      "MenuButtons",
      MenuButtons,
      {
        parent: this.dockCenter,
        items: {
          gift: {
            title: "Daily Gift & Events",
            iconSvg: `<svg viewBox="0 0 24 24" class="menu-svg"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
            onClick: () => this.showDailyGift(),
          },
          char: {
            title: "Character Stats (S / U)",
            iconSvg: `<svg viewBox="0 0 24 24" class="menu-svg"><path d="M14.5 17.5 5 8M4 4l7.5 7.5M14.5 6.5l5-5 3 3-5 5-3-3zM2 22l5-5M9.5 14.5 17 7M9.5 17.5l-3 3-3-3 5-5 3 3zM22 2l-7.5 7.5"/></svg>`,
            badge: true,
            onClick: () => this.wins.toggle(this.wins.stat),
          },
          equip: {
            title: "Equipment (E)",
            iconSvg: `<svg viewBox="0 0 24 24" class="menu-svg"><path d="m14.5 17.5 5 5M4 4l7.5 7.5M14.5 6.5l5-5 3 3-5 5-3-3zM2 22l5-5M9.5 14.5 17 7M9.5 17.5l-3 3-3-3 5-5 3 3zM22 2l-7.5 7.5"/></svg>`,
            onClick: () => this.wins.toggle(this.wins.ext.equipWin),
          },
          inv: {
            title: "Item Inventory (I)",
            iconSvg: `<svg viewBox="0 0 24 24" class="menu-svg"><path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10z"/><path d="M9 6V4a3 3 0 0 1 6 0v2"/><path d="M8 12h8v4H8z"/></svg>`,
            onClick: () => this.wins.toggle(this.wins.ext.invWin),
          },
          skill: {
            title: "Skills (K)",
            iconSvg: `<svg viewBox="0 0 24 24" class="menu-svg"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/></svg>`,
            onClick: () => this.wins.toggle(this.wins.skill),
          },
          quest: {
            title: "Quest Notifier",
            iconSvg: `<svg viewBox="0 0 24 24" class="menu-svg"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4.9 12c.7.7 1.1 1.6 1.4 2.5h7c.3-.9.7-1.8 1.4-2.5A7 7 0 0 0 12 2z"/></svg>`,
            onClick: () => this.showDailyGift(),
          },
          auto: {
            title: "Auto Battle Settings (B)",
            iconSvg: `<svg viewBox="0 0 24 24" class="menu-svg"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
            onClick: () => this.wins.toggle(this.wins.autoWin),
          },
          guide: {
            title: "Game Guide & Codex (G)",
            iconSvg: `<svg viewBox="0 0 24 24" class="menu-svg"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/></svg>`,
            onClick: () => this.wins.toggle(this.wins.guideWin),
          },
          mainMenu: {
            title: "Main Menu",
            iconSvg: `<svg viewBox="0 0 24 24" class="menu-svg"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
            onClick: (btn: HTMLElement) => this.wins.ext.toggleMenu(btn),
          },
        },
      },
      this.childEntities,
      canOrillusion
    );

    this.status = createUIEntity("StatusCapsule", StatusCapsule, { parent: this.dockCenter }, this.childEntities, canOrillusion);
    this.perfContainer = el("div", "dock-perf-container select-none pointer-events-none", this.status.root);

    // Right: Action Controls Header + Quick Slots Keyboard
    const ctrlRow = el("div", "dock-controls-row flex items-center justify-end w-full mb-1 px-0.5 gap-2", this.dockRight);

    const autoGroup = el("div", "dock-auto-btns flex items-center gap-1.5", ctrlRow);
    autoGroup.appendChild(this.wins.autoBossBtn);
    autoGroup.appendChild(this.wins.autoBtn);

    this.quickWrap = el("div", "dock-quick-wrap", this.dockRight);
    this.quick = createUIEntity(
      "QuickBarComponent",
      QuickBarComponent,
      {
        parent: this.quickWrap,
        game,
        makeDraggable: (el: HTMLElement, getAction: () => Action | null, fromKey?: string, onClick?: () => void) => this.wins.draggable(el, getAction, fromKey, onClick),
        bindTip: (el: HTMLElement, getHtml: () => string | null) => this.wins.bindTip(el, getHtml),
        getActionTip: (a: Action) => this.wins.actionTip(a),
        getActionIcon: (a: Action, off?: boolean) => this.wins.iconFor(a, off)
      },
      this.childEntities,
      canOrillusion
    );

    // 4. Smart Idle/Expanded Chatbox
    this.chat = createUIEntity("ChatComponent", ChatComponent, { parent: this.root, game }, this.childEntities, canOrillusion);

    // 5. Parchment Minimap
    this.mini = createUIEntity("MinimapComponent", MinimapComponent, { parent: this.root, onModeChange: () => this.layout() }, this.childEntities, canOrillusion);

    // 6. Transient Gain Notifications
    this.gain = el("div", "gains", this.root);
    this.gain.style.display = "none";

    // 7. GM Notice Banner (MapleStory top banner)
    this.noticeBanner = el("div", "gm-notice-banner hidden", document.body);
    addEventListener("gm-broadcast-notice", (e: any) => {
      this.showNoticeBanner(e.detail?.text ?? "");
    });

    // 8. GM Online Count & Player List with Quick Action Menu (WebGPU Collapsible Side Panel)
    this.gmPanel = createUIEntity(
      "GmOnlinePanel",
      GmOnlinePanel,
      { parent: document.body, game, wins: this.wins },
      this.childEntities,
      canOrillusion
    );

    this.layout();
    addEventListener("resize", () => this.layout());
  }

  showNoticeBanner(text: string) {
    if (!this.noticeBanner) return;
    this.noticeBanner.innerHTML = `<span class="notice-prefix">[GM Notice]</span> <span class="notice-text">${esc(text)}</span>`;
    this.noticeBanner.classList.remove("hidden");
    this.noticeBanner.classList.remove("banner-active");
    void this.noticeBanner.offsetWidth; // re-flow
    this.noticeBanner.classList.add("banner-active");
    clearTimeout((this.noticeBanner as any)._timer);
    (this.noticeBanner as any)._timer = setTimeout(() => {
      this.noticeBanner.classList.remove("banner-active");
      setTimeout(() => this.noticeBanner.classList.add("hidden"), 400);
    }, 7000);
  }

  get chatInput() {
    return this.chat.input;
  }

  showDailyGift() {
    const g = this.game;
    if (!g) return;
    const kills = Math.floor(1800 * 0.4);
    this.wins.ext.showOffline({
      seconds: 1800,
      kills,
      exp: kills * (15 + g.stats.level * 8),
      meso: kills * (25 + g.stats.level * 10),
      mats: { 4000000: 5 },
      gear: [],
    });
  }

  expandChat() {
    this.chat.expand();
  }

  toggleChatMinimize() {
    this.chat.toggleMinimize();
    this.layout();
  }

  toggleMinimap() {
    this.mini.toggle();
    this.layout();
  }

  toggleQuickSlots() {
    this.quickWrap.classList.toggle("compact");
    this.layout();
  }

  setMap(m: MapData) {
    if (!this.game) return;
    this.mini.setMap(m, this.game.portals);
    this.addChat("notice", `Welcome to ${m.name || "Maple Road"}.`);
    this.layout();
  }

  addChat(kind: ChatKind | "say", text: string, itemLink?: any) {
    this.chat.addMessage(kind, text, itemLink);
  }

  showGain(kind: "level" | "meso" | "exp", text: string) {
    const g = this.gain;
    g.textContent = "";
    g.style.display = "";
    const line = el("div", `gain gain-${kind}`, g);
    line.textContent = text;
    const r = g.getBoundingClientRect();
    g.style.left = `${Math.min(innerWidth - r.width - 4, r.right + 12)}px`;
    g.style.top = `${Math.max(4, Math.min(innerHeight - r.height - 4, r.bottom + 12))}px`;
    g.style.transform = "translateY(0)";
    requestAnimationFrame(() => {
      g.style.transition = "transform .5s cubic-bezier(.2,.9,.3,1.2)";
      g.style.transform = "translateY(-14px)";
    });
    setTimeout(() => {
      g.style.transition = "opacity .5s, transform .5s";
      g.style.transform = "translateY(0)";
      g.style.opacity = "0";
    }, 400);
    setTimeout(() => {
      g.style.display = "none";
    }, 1000);
  }

  layout() {
    const W = innerWidth, H = innerHeight;
    const dockH = this.dock.offsetHeight || 34;
    const expH = 8;
    const above = expH + dockH + 3;
    this.root.style.setProperty("--dock-h", `${dockH}px`);

    // Chat sits bottom-left above dock
    Object.assign(this.chat.root.style, { left: "8px", bottom: `${above}px` });
    this.chat.root.style.display = W >= 480 && H >= 360 ? "" : "none";

    // Minimap sits top-left
    Object.assign(this.mini.root.style, { left: "8px", top: "8px" });

    const qr = this.quickWrap.getBoundingClientRect();
    this.wins.layoutLogs(W, H, qr.width, expH, dockH);
    this.lastSig = "";
  }

  update(dt: number) {
    const g = this.game;
    if (!g) return;
    const s = g.stats;
    const need = Math.round(expToLevel(s.level));
    const sig = `${s.level}|${s.hp}|${s.maxHp}|${s.mp}|${s.maxMp}|${s.exp}|${s.name}|${s.ap}|${s.sp}|${g.stage.kills}`;

    if (sig !== this.lastSig || performance.now() % 2000 < 20) {
      this.playerTag.update(s.level, s.name);
      this.status.update({
        level: s.level,
        name: s.name,
        hp: s.hp,
        maxHp: s.maxHp,
        mp: s.mp,
        maxMp: s.maxMp,
        exp: s.exp,
        expNeed: need,
      });

      // Orange dot badge when AP/SP available
      this.menu.setBadge("char", s.ap > 0 || s.sp > 0);
    }

    // Dynamic player marker tracking
    const p = g.p;
    this.wins.update(dt);
    this.mini.updatePlayer(p.x, p.y, g.remotePlayers);
    this.quick.render();
    this.gmPanel?.update(dt);
  }

  public override start(): void {
    if (this.object3D) {
      for (const child of this.childEntities) {
        this.object3D.addChild(child);
      }
    }
    this.layout();
  }

  public override onUpdate(): void {
    this.update(1 / 60);
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
    this.gmPanel?.destroy(force);
    for (const child of this.childEntities) {
      child.destroy(force);
    }
    this.root?.remove();
  }
}
