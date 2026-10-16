// Inventory Component — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import type { Windows } from "../windows.ts";

export interface InventoryComponentParam {
  game: Game;
  wins: Windows;
}

export class InventoryComponent extends ComponentBase {
  public game!: Game;
  public wins!: Windows;

  constructor(param?: InventoryComponentParam) {
    super();
    if (param?.game && param?.wins) {
      this.init(param);
    }
  }

  public override init(param?: InventoryComponentParam): void {
    super.init(param);
    if (param?.game && param?.wins) {
      this.game = param.game;
      this.wins = param.wins;
    }
  }

  public get isOpen(): boolean {
    return !!this.wins?.ext?.invWin && !this.wins.ext.invWin.classList.contains("hidden");
  }

  public open(tab?: string): void {
    if (tab && this.wins?.ext) {
      (this.wins.ext as any).invTab = { ...((this.wins.ext as any).invTab || {}), cur: tab };
    }
    this.wins?.ext?.open("inv");
  }

  public close(): void {
    if (this.isOpen && this.wins?.ext?.invWin) {
      this.wins.toggle(this.wins.ext.invWin);
    }
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
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
