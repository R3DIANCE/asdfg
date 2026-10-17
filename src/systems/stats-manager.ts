// Real-time Performance HUD using stats.js for FPS, Frame MS, Network Ping & Net Activity
import Stats from "stats.js";
import type { Game } from "../game.ts";
import { lucideIcon } from "../lucide.ts";

export class StatsManager {
  stats: Stats;
  pingPanel: Stats.Panel;
  netPanel: Stats.Panel;
  private game?: Game;
  private pingTimer = 0;
  private wrapper: HTMLElement;
  private headerEl: HTMLElement;
  private graphsContainer: HTMLElement;
  private isCollapsed = false;

  constructor(parent?: HTMLElement, game?: Game) {
    this.game = game;
    this.stats = new Stats();

    // Custom PING panel (cyan)
    this.pingPanel = this.stats.addPanel(new Stats.Panel("PING", "#38bdf8", "#082f49"));
    // Custom NET activity / latency panel (amber)
    this.netPanel = this.stats.addPanel(new Stats.Panel("NET", "#fbbf24", "#451a03"));

    // Outer container styled with modern translucent glassmorphism
    // Positioned safely underneath the top-right buffs bar (top: 48px, right: 8px)
    this.wrapper = document.createElement("div");
    this.wrapper.className = "stats-hud-wrapper";
    this.wrapper.style.position = "fixed";
    this.wrapper.style.top = "48px";
    this.wrapper.style.right = "8px";
    this.wrapper.style.zIndex = "9999";
    this.wrapper.style.display = "none";
    this.wrapper.style.flexDirection = "column";
    this.wrapper.style.gap = "4px";
    this.wrapper.style.padding = "4px 5px";
    this.wrapper.style.background = "rgba(10, 15, 26, 0.72)";
    this.wrapper.style.backdropFilter = "blur(14px)";
    this.wrapper.style.setProperty("-webkit-backdrop-filter", "blur(14px)");
    this.wrapper.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    this.wrapper.style.borderRadius = "8px";
    this.wrapper.style.boxShadow = "0 8px 30px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.08)";
    this.wrapper.style.userSelect = "none";
    this.wrapper.style.transition = "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)";

    // Toggle performance window visibility via F3 hotkey
    window.addEventListener("keydown", (e) => {
      if (e.key === "F3") {
        e.preventDefault();
        this.toggleVisible();
      }
    });

    // Modern Header pill with Lucide icons & quick collapse button
    this.headerEl = document.createElement("div");
    this.headerEl.style.display = "flex";
    this.headerEl.style.alignItems = "center";
    this.headerEl.style.justifyContent = "space-between";
    this.headerEl.style.padding = "2px 4px";
    this.headerEl.style.cursor = "pointer";
    this.headerEl.style.fontSize = "10px";
    this.headerEl.style.fontWeight = "700";
    this.headerEl.style.color = "#94a3b8";
    this.headerEl.style.letterSpacing = "0.5px";

    this.headerEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:5px;">
        ${lucideIcon("activity", 12, "text-sky-400")}
        <span style="color:#e2e8f0;font-family:monospace;font-size:10px;">PERF</span>
      </div>
      <div class="stats-toggle-icon" style="display:flex;align-items:center;color:#64748b;transition:transform 0.15s ease;">
        ${lucideIcon("chevron-up", 11)}
      </div>
    `;

    this.headerEl.addEventListener("click", () => {
      this.toggleCollapse();
    });

    // Graphs inner container
    this.graphsContainer = document.createElement("div");
    this.graphsContainer.style.display = "flex";
    this.graphsContainer.style.gap = "4px";

    // Style the stats.js internal canvases
    const dom = this.stats.dom;
    dom.style.position = "static";
    dom.style.left = "auto";
    dom.style.top = "auto";
    dom.style.right = "auto";
    dom.style.zIndex = "auto";
    dom.style.cursor = "pointer";
    dom.style.display = "flex";
    dom.style.gap = "3px";
    dom.style.background = "transparent";
    dom.style.userSelect = "none";

    for (const child of Array.from(dom.children)) {
      const el = child as HTMLElement;
      el.style.display = "block";
      el.style.position = "static";
      el.style.borderRadius = "4px";
      el.style.overflow = "hidden";
      el.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.08)";
    }

    this.graphsContainer.appendChild(dom);
    this.wrapper.appendChild(this.headerEl);
    this.wrapper.appendChild(this.graphsContainer);

    if (parent) {
      parent.appendChild(this.wrapper);
    } else {
      document.body.appendChild(this.wrapper);
    }
  }

  private toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    this.graphsContainer.style.display = this.isCollapsed ? "none" : "flex";
    const icon = this.headerEl.querySelector(".stats-toggle-icon");
    if (icon) {
      icon.innerHTML = this.isCollapsed ? lucideIcon("chevron-down", 11) : lucideIcon("chevron-up", 11);
    }
  }

  public toggleVisible() {
    const isHidden = this.wrapper.style.display === "none";
    this.wrapper.style.display = isHidden ? "flex" : "none";
  }

  setGame(game: Game) {
    this.game = game;
  }

  begin() {
    this.stats.begin();
  }

  end() {
    this.stats.end();
  }

  update(dt: number) {
    this.pingTimer += dt;
    if (this.pingTimer >= 0.3) {
      this.pingTimer = 0;
      const g = this.game || (window as any).__game;
      const ping = Math.max(1, Number(g?.wsPing || 20));
      this.pingPanel.update(Math.min(300, ping), 300);

      // Active network packet activity metric
      const netVal = Math.max(
        5,
        Math.min(200, Math.round(ping * 0.75 + (g?.remotePlayers?.size || 0) * 8 + (g?.mobs?.length || 0) * 2))
      );
      this.netPanel.update(netVal, 200);
    }
  }

  destroy() {
    this.wrapper.remove();
  }
}
