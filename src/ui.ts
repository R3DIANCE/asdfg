// Authentic MapleStory NEXT 2025 HUD Controller — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
import { ComponentBase, Object3D } from "@orillusion/core";
import type { ChatKind, Game, MapData } from "./game.ts";
import { expToLevel } from "./game.ts";
import { Windows } from "./windows.ts";
import { ChatComponent } from "./components/chat.ts";
import { MinimapComponent } from "./components/minimap.ts";
import {
  StatusCapsule,
  MenuButtons,
  PlayerStatusTag,
  MenuButtonComponent,
  ChatMenuButton,
  InventoryMenuButton,
  EquipmentMenuButton,
  StatsMenuButton,
  PartyMenuButton,
} from "./components/hud.ts";
import { StatsComponent } from "./components/stats.ts";
import { InventoryComponent } from "./components/inventory.ts";
import { EquipmentComponent } from "./components/equipment.ts";
import { PartyComponent } from "./components/party.ts";
import { QuickBarComponent } from "./components/quick-bar.ts";
import { GmOnlinePanel } from "./components/GmOnlinePanel.ts";
import { PartyWidget } from "./components/PartyWidget.ts";
import { GmDropAuditWidget } from "./components/GmDropAuditWidget.ts";
import type { Action } from "./skills.ts";
import { el, esc } from "./util.ts";
import { lucideIcon } from "./lucide.ts";

export type UiData = Record<string, any>;

export function createUIEntity<T extends ComponentBase>(
  name: string,
  comp: new (...args: any[]) => T,
  param: any,
  container?: Object3D[],
  canUseOrillusion = false
): T {
  if (canUseOrillusion) {
    try {
      const obj = new Object3D();
      obj.name = name;
      const inst = obj.addComponent(comp);
      if (container) container.push(obj);
      if (typeof (inst as any).init === "function" && !(inst as any).root) {
        (inst as any).init(param);
      }
      return inst;
    } catch {
      // Graceful fallback to regular instantiation
    }
  }
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

  playerTag?: PlayerStatusTag;
  status!: StatusCapsule;
  perfContainer!: HTMLElement;
  menu?: MenuButtons;
  quick!: QuickBarComponent;
  chat!: ChatComponent;
  mini!: MinimapComponent;
  gmPanel!: GmOnlinePanel;
  partyWidget!: PartyWidget;
  gmDropWidget!: GmDropAuditWidget;
  statsComp!: StatsComponent;
  invComp!: InventoryComponent;
  equipComp!: EquipmentComponent;
  partyComp!: PartyComponent;
  wins!: Windows;
  gain!: HTMLElement;
  noticeBanner?: HTMLElement;
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

    // Floating Bottom Dock (Governed dynamically by UI Mode)
    this.dock = el("div", "dock fixed left-0 right-0 bottom-[14px] min-h-[58px] flex items-end justify-between px-3 pointer-events-none select-none z-[12]", this.root);
    this.dockLeft = el("div", "dock-left pointer-events-auto flex items-end gap-2 min-w-0", this.dock);
    this.dockCenter = el("div", "dock-center pointer-events-none fixed left-1/2 bottom-[15px] -translate-x-1/2 flex items-center gap-2 z-[12]", this.dock);
    this.dockRight = el("div", "dock-right pointer-events-auto flex flex-col items-end gap-1 min-w-0", this.dock);

    // Windows Manager initialized before slots & menus
    this.wins = new Windows(game, win, this.root);

    const canOrillusion = (game as any)?.r?.backend === "webgpu" && !!(game as any)?.r?.scene;

    // Center: Modern Stylish Status Capsule (HP/MP) + Modern Menu Buttons
    this.status = createUIEntity("StatusCapsule", StatusCapsule, { parent: this.dockCenter }, this.childEntities, canOrillusion);

    // Core Orillusion System Components
    this.statsComp = createUIEntity(
      "StatsComponent",
      StatsComponent,
      { game, wins: this.wins },
      this.childEntities,
      canOrillusion
    );
    this.invComp = createUIEntity(
      "InventoryComponent",
      InventoryComponent,
      { game, wins: this.wins },
      this.childEntities,
      canOrillusion
    );
    this.equipComp = createUIEntity(
      "EquipmentComponent",
      EquipmentComponent,
      { game, wins: this.wins },
      this.childEntities,
      canOrillusion
    );
    this.partyComp = createUIEntity(
      "PartyComponent",
      PartyComponent,
      { game, wins: this.wins },
      this.childEntities,
      canOrillusion
    );

    const menuItems: Record<string, any> = {
      chat: {
        iconSvg: lucideIcon("message-square", 13),
        title: "Chat (Enter / C)",
        shortcut: "Enter",
        onClick: () => this.chat.toggle(),
      },
      stat: {
        iconSvg: lucideIcon("user", 13),
        title: "Character Stats (S)",
        shortcut: "S",
        badge: true,
        onClick: () => this.statsComp.toggle(),
      },
      skill: {
        iconSvg: lucideIcon("sparkles", 13),
        title: "Skills (K)",
        shortcut: "K",
        badge: true,
        onClick: () => this.wins.toggle(this.wins.skill),
      },
      equip: {
        iconSvg: lucideIcon("shield", 13),
        title: "Equipment (E)",
        shortcut: "E",
        onClick: () => this.equipComp.toggle(),
      },
      inv: {
        iconSvg: lucideIcon("package", 13),
        title: "Inventory (I)",
        shortcut: "I",
        onClick: () => this.invComp.toggle(),
      },
      party: {
        iconSvg: lucideIcon("users", 13),
        title: "Party (P)",
        shortcut: "P",
        onClick: () => this.partyComp.toggle(),
      },
      guild: {
        iconSvg: lucideIcon("flag", 13),
        title: "Guild (G)",
        shortcut: "G",
        onClick: () => this.wins.toggle(this.wins.guildWin),
      },
      craft: {
        iconSvg: lucideIcon("hammer", 13),
        title: "Crafting (J)",
        shortcut: "J",
        onClick: () => this.wins.ext.open("craft"),
      },
      ah: {
        iconSvg: lucideIcon("shopping-bag", 13),
        title: "Auction House (H)",
        shortcut: "H",
        onClick: () => this.wins.ext.open("ah"),
      },
      cashshop: {
        iconSvg: lucideIcon("gem", 13, "text-pink-400"),
        title: "Cash Shop (NX)",
        shortcut: "CS",
        onClick: () => this.wins.ext.openCashShop(),
      },
    };

    const menuSlot = el("div", "menu-slot pointer-events-auto flex items-center whitespace-nowrap", this.dockCenter);
    this.menu = createUIEntity("MenuButtons", MenuButtons, { parent: menuSlot, items: menuItems }, this.childEntities, canOrillusion);
    this.perfContainer = el("div", "dock-perf-container select-none pointer-events-none fixed top-2.5 right-4 z-50", this.root);

    // Right: Action Controls Header + Quick Slots Keyboard
    const ctrlRow = el("div", "dock-controls-row flex items-center justify-end w-full mb-1 px-0.5 gap-2", this.dockRight);

    const autoGroup = el("div", "dock-auto-btns flex items-center gap-1.5", ctrlRow);
    autoGroup.appendChild(this.wins.autoBtn);
    autoGroup.appendChild(this.wins.autoBossBtn);

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

    // 7. GM Online Count & Player List with Quick Action Menu (WebGPU Collapsible Side Panel)
    this.gmPanel = createUIEntity(
      "GmOnlinePanel",
      GmOnlinePanel,
      { parent: document.body, game, wins: this.wins },
      this.childEntities,
      canOrillusion
    );

    // 8. Dedicated On-Screen Party UI Widget
    this.partyWidget = createUIEntity(
      "PartyWidget",
      PartyWidget,
      { parent: this.root, game },
      this.childEntities,
      canOrillusion
    );

    // 9. GM Monster Drop & Inventory Confirmation Audit Widget
    this.gmDropWidget = createUIEntity(
      "GmDropAuditWidget",
      GmDropAuditWidget,
      { parent: this.root, game, wins: this.wins },
      this.childEntities,
      canOrillusion
    );

    if (canOrillusion && (this.game as any)?.r?.scene) {
      for (const obj of this.childEntities) {
        try {
          (this.game as any).r.scene.addChild(obj);
        } catch {}
      }
    }

    this.layout();
    addEventListener("resize", () => this.layout());
  }

  showNoticeBanner(_text: string) {
    // Chat notices are kept inside the chat window only
  }

  get chatInput() {
    return this.chat.input;
  }

  showDailyGift() {
    const g = this.game;
    if (!g) return;
    if (g.unclaimedOffline && (g.unclaimedOffline.kills > 0 || g.unclaimedOffline.seconds >= 60)) {
      this.wins.ext.showOffline(g.unclaimedOffline);
    } else {
      g.onChat("notice", "★ [Welcome Back] No accumulated offline rewards right now. Offline rewards accumulate while logged out (up to 24h) and can be claimed when you log back in!");
    }
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
    const above = 18;
    this.root.style.setProperty("--dock-h", "0px");

    // Chat sits bottom-left above exp bar
    Object.assign(this.chat.root.style, { left: "8px", bottom: `${above}px` });
    this.chat.root.style.display = W >= 480 && H >= 360 ? "" : "none";

    // Minimap sits top-left
    Object.assign(this.mini.root.style, { left: "8px", top: "8px" });

    this.wins.layoutLogs(W, H, 562, 10, 0);
    this.lastSig = "";
  }

  update(dt: number) {
    const g = this.game;
    if (!g) return;
    const s = g.stats;
    const need = Math.round(expToLevel(s.level));
    const sig = `${s.level}|${s.hp}|${s.maxHp}|${s.mp}|${s.maxMp}|${s.exp}|${s.name}|${s.ap}|${s.sp}|${g.stage.kills}`;

    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.playerTag?.update(s.level, s.name);
      this.status.update({
        level: s.level,
        name: s.name,
        job: s.job,
        hp: s.hp,
        maxHp: s.maxHp,
        mp: s.mp,
        maxMp: s.maxMp,
        exp: s.exp,
        expNeed: need,
      });

      // Orange dot badge when AP/SP available
      this.menu?.setBadge?.("stat", s.ap > 0);
      this.menu?.setBadge?.("skill", s.sp > 0);
    }

    // Dynamic player marker tracking
    const p = g.p;
    this.wins.update(dt);
    this.mini.updatePlayer(p.x, p.y, g.remotePlayers);
    this.gmPanel?.update(dt);
    this.partyWidget?.update(dt);
    if (g.uiMode === "old") {
      this.quick.render();
      if (this.menu) {
        this.menu.setActive("chat", this.chat?.isOpen ?? false);
        this.menu.setActive("stat", this.statsComp?.isOpen ?? false);
        this.menu.setActive("equip", this.equipComp?.isOpen ?? false);
        this.menu.setActive("inv", this.invComp?.isOpen ?? false);
        this.menu.setActive("party", this.partyComp?.isOpen ?? false);
      }
    }
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
    this.partyWidget?.destroy(force);
    this.statsComp?.destroy(force);
    this.invComp?.destroy(force);
    this.equipComp?.destroy(force);
    this.partyComp?.destroy(force);
    for (const child of this.childEntities) {
      child.destroy(force);
    }
    this.root?.remove();
  }
}
