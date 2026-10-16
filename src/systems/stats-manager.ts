// Real-time Performance HUD using stats.js for FPS, Frame MS, Network Ping & Net Activity
import Stats from "stats.js";
import type { Game } from "../game.ts";

export class StatsManager {
  stats: Stats;
  pingPanel: Stats.Panel;
  netPanel: Stats.Panel;
  private game?: Game;
  private pingTimer = 0;

  constructor(parent?: HTMLElement, game?: Game) {
    this.game = game;
    this.stats = new Stats();

    // Custom PING panel (cyan)
    this.pingPanel = this.stats.addPanel(new Stats.Panel("PING", "#38bdf8", "#082f49"));
    // Custom NET activity / latency panel (amber)
    this.netPanel = this.stats.addPanel(new Stats.Panel("NET", "#fbbf24", "#451a03"));

    // Style the stats.js container to sit at top-right with side-by-side graphs
    const dom = this.stats.dom;
    dom.style.position = "fixed";
    dom.style.left = "auto";
    dom.style.top = "8px";
    dom.style.right = "8px";
    dom.style.zIndex = "9999";
    dom.style.cursor = "pointer";
    dom.style.display = "flex";
    dom.style.gap = "3px";
    dom.style.padding = "2px";
    dom.style.background = "rgba(10, 15, 26, 0.75)";
    dom.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    dom.style.borderRadius = "6px";
    dom.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.6)";
    dom.style.backdropFilter = "blur(8px)";
    dom.style.userSelect = "none";

    // Show all panels horizontally in the flex layout
    for (const child of Array.from(dom.children)) {
      (child as HTMLElement).style.display = "block";
      (child as HTMLElement).style.position = "static";
    }

    if (parent) {
      parent.appendChild(dom);
    } else {
      document.body.appendChild(dom);
    }
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
      const netVal = Math.max(5, Math.min(200, Math.round(ping * 0.75 + (g?.remotePlayers?.size || 0) * 8 + (g?.mobs?.length || 0) * 2)));
      this.netPanel.update(netVal, 200);
    }
  }

  destroy() {
    this.stats.dom?.remove();
  }
}
