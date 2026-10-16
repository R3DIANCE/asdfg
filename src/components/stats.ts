// Stats Component — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import type { Windows } from "../windows.ts";

export interface StatsComponentParam {
  game: Game;
  wins: Windows;
}

export class StatsComponent extends ComponentBase {
  public game!: Game;
  public wins!: Windows;

  constructor(param?: StatsComponentParam) {
    super();
    if (param?.game && param?.wins) {
      this.init(param);
    }
  }

  public override init(param?: StatsComponentParam): void {
    super.init(param);
    if (param?.game && param?.wins) {
      this.game = param.game;
      this.wins = param.wins;
    }
  }

  public get isOpen(): boolean {
    return !!this.wins?.statWin && !this.wins.statWin.classList.contains("hidden");
  }

  public open(): void {
    if (!this.isOpen && this.wins?.statWin) {
      this.wins.toggle(this.wins.statWin);
    }
  }

  public close(): void {
    if (this.isOpen && this.wins?.statWin) {
      this.wins.toggle(this.wins.statWin);
    }
  }

  public toggle(): void {
    if (this.wins?.statWin) {
      this.wins.toggle(this.wins.statWin);
    }
  }

  public override start(): void {
    // Orillusion lifecycle start hook
  }

  public override onUpdate(): void {
    // Orillusion per-frame update hook
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
  }
}
