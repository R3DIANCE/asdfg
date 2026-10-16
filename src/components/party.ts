// Party Component — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import type { Windows } from "../windows.ts";

export interface PartyComponentParam {
  game: Game;
  wins: Windows;
}

export class PartyComponent extends ComponentBase {
  public game!: Game;
  public wins!: Windows;

  constructor(param?: PartyComponentParam) {
    super();
    if (param?.game && param?.wins) {
      this.init(param);
    }
  }

  public override init(param?: PartyComponentParam): void {
    super.init(param);
    if (param?.game && param?.wins) {
      this.game = param.game;
      this.wins = param.wins;
    }
  }

  public get isOpen(): boolean {
    return !!this.wins?.partyWin && !this.wins.partyWin.classList.contains("hidden");
  }

  public open(): void {
    if (!this.isOpen && this.wins?.partyWin) {
      this.wins.toggle(this.wins.partyWin);
    }
  }

  public close(): void {
    if (this.isOpen && this.wins?.partyWin) {
      this.wins.toggle(this.wins.partyWin);
    }
  }

  public toggle(): void {
    if (this.wins?.partyWin) {
      this.wins.toggle(this.wins.partyWin);
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
