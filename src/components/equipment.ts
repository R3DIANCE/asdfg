// Equipment Component — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import type { Windows } from "../windows.ts";

export interface EquipmentComponentParam {
  game: Game;
  wins: Windows;
}

export class EquipmentComponent extends ComponentBase {
  public game!: Game;
  public wins!: Windows;

  constructor(param?: EquipmentComponentParam) {
    super();
    if (param?.game && param?.wins) {
      this.init(param);
    }
  }

  public override init(param?: EquipmentComponentParam): void {
    super.init(param);
    if (param?.game && param?.wins) {
      this.game = param.game;
      this.wins = param.wins;
    }
  }

  public get isOpen(): boolean {
    return !!this.wins?.ext?.equipWin && !this.wins.ext.equipWin.classList.contains("hidden");
  }

  public open(): void {
    this.wins?.ext?.open("equip");
  }

  public close(): void {
    if (this.isOpen && this.wins?.ext?.equipWin) {
      this.wins.toggle(this.wins.ext.equipWin);
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
