// Modular Minimap Component — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
// Parchment header, minimap scale, player dot & portal indicators
import { ComponentBase } from "@orillusion/core";
import type { MapData } from "../game.ts";
import { el, bg } from "../util.ts";

export type MinimapMode = "full" | "compact" | "hidden";

export class MinimapComponent extends ComponentBase {
  root!: HTMLElement;
  streetText!: HTMLElement;
  nameText!: HTMLElement;
  body!: HTMLElement;
  img: HTMLElement | null = null;
  dot: HTMLElement | null = null;
  remoteDots = new Map<string, HTMLElement>();
  portals: HTMLElement[] = [];
  mode: MinimapMode = "full";
  scale = 1;
  info: MapData["miniMap"] | null = null;

  private parentEl!: HTMLElement;
  private onModeChange?: (mode: MinimapMode) => void;

  constructor(parent?: HTMLElement | { parent: HTMLElement; onModeChange?: (mode: MinimapMode) => void }, onModeChange?: (mode: MinimapMode) => void) {
    super();
    if (parent && !(parent instanceof HTMLElement) && (parent as any).parent) {
      this.init(parent as any);
    } else if (parent instanceof HTMLElement) {
      this.parentEl = parent;
      this.onModeChange = onModeChange;
      this.initComponent();
    }
  }

  public override init(param?: { parent: HTMLElement; onModeChange?: (mode: MinimapMode) => void }): void {
    super.init(param);
    if (param?.parent && !this.root) {
      this.parentEl = param.parent;
      this.onModeChange = param.onModeChange;
      this.initComponent();
    }
  }

  public override start(): void {
    // Orillusion lifecycle start hook
  }

  public override onUpdate(): void {
    // Orillusion lifecycle per-frame update hook
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
    this.root?.remove();
  }

  private initComponent() {
    this.root = el("div", "minimap", this.parentEl);

    // Top control bar: [-][+]
    const topBar = el("div", "mini-top-bar", this.root);
    const zoomGroup = el("div", "mini-zoom-group", topBar);
    const minusBtn = el("button", "mini-btn mini-minus", zoomGroup) as HTMLButtonElement;
    minusBtn.type = "button";
    minusBtn.textContent = "-";
    minusBtn.title = "Zoom Out / Minimize (M)";
    minusBtn.addEventListener("click", () => this.toggle());

    const plusBtn = el("button", "mini-btn mini-plus", zoomGroup) as HTMLButtonElement;
    plusBtn.type = "button";
    plusBtn.textContent = "+";
    plusBtn.title = "Zoom In / Expand Minimap";
    plusBtn.addEventListener("click", () => this.setMode("full"));

    // Header inside minimap: Map Badge + 2 Lines: Street Name / Map Name
    const head = el("div", "mini-header", this.root);
    const badge = el("div", "mini-badge", head);
    badge.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22"><rect x="2" y="2" width="20" height="20" rx="3" fill="#334155" stroke="#64748b" stroke-width="1.5"/><path d="M5 8h14M7 8V6m5 2V6m5 2V6M8 18v-5a4 4 0 0 1 8 0v5" stroke="#94a3b8" stroke-width="1.5" fill="none"/></svg>`;

    const titles = el("div", "mini-titles", head);
    this.streetText = el("div", "mini-street", titles);
    this.nameText = el("div", "mini-name", titles);
    head.title = "Click to toggle Minimap (or press M)";
    head.addEventListener("click", () => this.toggle());

    // Viewport frame (Static Solid Map Box with faded corners)
    const viewFrame = el("div", "mini-viewframe", this.root);
    this.body = el("div", "mini-body", viewFrame);

    // Bottom fold tab
    const foldTab = el("div", "mini-fold-tab", this.root);
    foldTab.title = "Toggle Minimap Fold";
    foldTab.innerHTML = `<svg viewBox="0 0 12 12" width="8" height="8"><path d="M2 4l4 4 4-4" fill="currentColor"/></svg>`;
    foldTab.addEventListener("click", () => this.toggle());

  }

  setMode(mode: MinimapMode) {
    this.mode = mode;
    this.root.classList.toggle("compact", mode === "compact");
    this.root.classList.toggle("minimized", mode === "hidden");
    this.onModeChange?.(mode);
  }

  toggle() {
    if (this.mode === "full") this.setMode("compact");
    else if (this.mode === "compact") this.setMode("hidden");
    else this.setMode("full");
  }

  setMap(m: MapData, portals: { x: number; y: number }[]) {
    this.streetText.textContent = m.street || "Maple Road";
    this.nameText.textContent = m.name || "Mushroom Town";

    this.body.textContent = "";
    this.portals = [];
    for (const d of this.remoteDots.values()) d.remove();
    this.remoteDots.clear();
    const info = m.miniMap;
    this.info = info;

    if (!info?.url) {
      this.img = null;
      return;
    }

    const maxW = 220;
    const aspect = info.width / (info.height || 1);
    const cw = Math.min(maxW, Math.max(120, Math.round(info.width / 16)));
    const chh = Math.max(65, Math.min(140, Math.round(cw / aspect)));
    this.scale = cw / (info.width || 1);

    const viewFrame = this.root.querySelector(".mini-viewframe") as HTMLElement;
    if (viewFrame) {
      viewFrame.style.width = `${cw}px`;
      viewFrame.style.height = `${chh}px`;
    }

    this.img = el("div", "mini-img", this.body);
    Object.assign(this.img.style, { width: `${cw}px`, height: `${chh}px` });
    this.body.style.width = `${cw}px`;
    this.body.style.height = `${chh}px`;
    this.body.style.transform = "none";
    bg(this.img, info.url);

    // Portals
    for (const p of portals) {
      const pt = el("div", "mini-portal", this.img);
      const [x, y] = this.toMiniCoords(p.x, p.y);
      Object.assign(pt.style, { left: `${x}px`, top: `${y}px` });
      this.portals.push(pt);
    }

    this.dot = el("div", "mini-dot", this.img);
  }

  toMiniCoords(wx: number, wy: number): [number, number] {
    if (!this.info) return [0, 0];
    const mm = this.info;
    const cw = parseFloat(this.body.style.width) || 220;
    const chh = parseFloat(this.body.style.height) || 120;
    const normX = (wx + mm.centerX) / (mm.width || 1);
    const normY = (wy + mm.centerY) / (mm.height || 1);
    return [
      Math.max(0, Math.min(cw, normX * cw)),
      Math.max(0, Math.min(chh, normY * chh)),
    ];
  }

  updatePlayer(px: number, py: number, remotes?: Map<string, { x: number; y: number; name: string }>) {
    if (this.info && this.dot) {
      const [x, y] = this.toMiniCoords(px, py);
      // Static minimap: map does not move; player dot moves across the static solid map
      this.dot.style.transform = `translate(${x}px, ${y}px)`;
    }

    if (this.info && this.img && remotes) {
      const activeIds = new Set<string>();
      for (const [id, rp] of remotes) {
        activeIds.add(id);
        let d = this.remoteDots.get(id);
        if (!d) {
          d = el("div", "mini-dot other-player", this.img);
          d.title = rp.name || "Player";
          this.remoteDots.set(id, d);
        }
        const [rx, ry] = this.toMiniCoords(rp.x, rp.y);
        d.style.transform = `translate(${rx}px, ${ry}px)`;
      }
      for (const [id, d] of this.remoteDots) {
        if (!activeIds.has(id)) {
          d.remove();
          this.remoteDots.delete(id);
        }
      }
    }
  }
}
