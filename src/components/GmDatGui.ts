import { GUI } from "dat.gui";
import type { Game } from "../game.ts";
import { PartyClient } from "../party.ts";
import { setUiMode, getUiMode, type UiMode } from "../systems/ui-mode.ts";

export interface OnlinePlayerItem {
  id: string;
  name: string;
  mapId: number;
  x: number;
  y: number;
}

const MAP_PRESETS: Record<string, number> = {
  "Free Market": 910000000,
  "Henesys Town": 100000000,
  "Henesys Hunting": 100010000,
  "Ellinia": 101000000,
  "Perion": 102000000,
  "Kerning City": 103000000,
  "Lith Harbor": 104000000,
  "Sleepywood": 105040300,
};

const MOB_PRESETS: Record<string, number> = {
  "Snail (Lv.1)": 100100,
  "Blue Snail (Lv.2)": 100101,
  "Red Snail (Lv.5)": 100102,
  "Slime (Lv.7)": 100100,
  "Orange Mushroom (Lv.8)": 1110100,
  "Ribbon Pig (Lv.10)": 1210100,
  "Green Mushroom (Lv.15)": 1110101,
  "Mano (Boss)": 2220000,
  "Mushmom (Boss)": 6130101,
  "Jr. Balrog (Boss)": 8130100,
};

export class GmDatGui {
  public gui: GUI;
  private game: Game;
  private playersFolder!: GUI;
  private cheatsFolder!: GUI;
  private worldFolder!: GUI;
  private combatFolder!: GUI;
  private uiFolder!: GUI;

  private onlinePlayers: OnlinePlayerItem[] = [];
  private playerDropdownController: any = null;
  private pollTimer = 0;
  private isVisible = true;

  public params = {
    // UI Mode
    uiMode: getUiMode(),

    // Online status
    onlineStatus: "ACTIVE",
    onlineCount: 1,
    activeMaps: 1,
    selectedPlayer: "",

    // Cheats & GM Powers
    godMode: false,
    infiniteMp: false,
    oneHitKill: false,
    gmHide: false,
    speedMul: 1.0,
    jumpMul: 1.0,

    // World & Teleport
    targetMap: "Free Market",
    targetX: 0,
    targetY: 0,

    // Combat & Mobs
    mobToSpawn: "Slime (Lv.7)",
    spawnAmount: 5,
  };

  constructor(game: Game) {
    this.game = game;
    this.gui = new GUI({ autoPlace: true, width: 280 });
    this.gui.domElement.id = "gm-dat-gui";
    this.gui.domElement.style.position = "fixed";
    this.gui.domElement.style.top = "60px";
    this.gui.domElement.style.right = "10px";
    this.gui.domElement.style.zIndex = "9998";

    this.initControls();
    this.syncVisibility();
    this.fetchPlayers();

    // Hotkey F1 toggles GM GUI
    window.addEventListener("keydown", (e) => {
      if (e.key === "F1") {
        e.preventDefault();
        this.toggle();
      }
    });

    // Listen to GM force-open events
    window.addEventListener("toggle-debug-win", () => this.toggle());
    window.addEventListener("toggle-debug-win-force", () => this.show());
  }

  private initControls() {
    const g = this.game;

    // ── 1. Online Players & GM Status ─────────────────────────
    this.playersFolder = this.gui.addFolder("👥 Online Status & Players");
    this.playersFolder.add(this.params, "onlineStatus").name("GM Status").listen();
    this.playersFolder.add(this.params, "onlineCount").name("Online Users").listen();
    this.playersFolder.add(this.params, "activeMaps").name("Active Maps").listen();

    this.playerDropdownController = this.playersFolder
      .add(this.params, "selectedPlayer", [g.stats.name || "Adventurer"])
      .name("Target Player");

    this.playersFolder.add({ warp: () => this.warpToTarget() }, "warp").name("⚡ Warp To Player");
    this.playersFolder.add({ summon: () => this.summonTarget() }, "summon").name("📍 Summon To GM");
    this.playersFolder.add({ party: () => this.forcePartyTarget() }, "party").name("👥 Force Into Party");
    this.playersFolder.add({ heal: () => this.healTarget() }, "heal").name("✨ Divine Heal");
    this.playersFolder.add({ meso: () => this.mesoTarget() }, "meso").name("💰 Send 1M Mesos");
    this.playersFolder.add({ whisper: () => this.whisperTarget() }, "whisper").name("💬 Whisper Target");
    this.playersFolder.add({ kick: () => this.kickTarget() }, "kick").name("🚫 Kick Player");
    this.playersFolder.add({ broadcast: () => this.broadcastNotice() }, "broadcast").name("📢 Broadcast Notice");
    this.playersFolder.add({ refresh: () => this.fetchPlayers() }, "refresh").name("🔄 Refresh Roster");
    this.playersFolder.open();

    // ── 2. GM Cheats & Powers ─────────────────────────────────
    this.cheatsFolder = this.gui.addFolder("🛡️ GM Cheats & Powers");
    this.cheatsFolder.add(this.params, "godMode").name("God Mode (Immunity)").onChange((val: boolean) => {
      g.godMode = val;
      g.onChat("notice", `[GM] God Mode: ${val ? "ENABLED" : "DISABLED"}`);
    });
    this.cheatsFolder.add(this.params, "infiniteMp").name("Infinite MP").onChange((val: boolean) => {
      g.infiniteMp = val;
      g.onChat("notice", `[GM] Infinite MP: ${val ? "ENABLED" : "DISABLED"}`);
    });
    this.cheatsFolder.add(this.params, "oneHitKill").name("1-Hit Kill (9.99M)").onChange((val: boolean) => {
      g.oneHitKill = val;
      g.onChat("notice", `[GM] 1-Hit Kill: ${val ? "ENABLED" : "DISABLED"}`);
    });
    this.cheatsFolder.add(this.params, "gmHide").name("GM Hide / Invisibility").onChange((val: boolean) => {
      g.gmHide = val;
      g.onChat("notice", `[GM] GM Hide: ${val ? "ENABLED" : "DISABLED"}`);
    });
    this.cheatsFolder.add(this.params, "speedMul", 0.5, 4.0, 0.5).name("Speed (Haste)").onChange((val: number) => {
      g.speedMultiplier = val;
      g.onChat("notice", `[GM] Speed Multiplier: ${val}x`);
    });
    this.cheatsFolder.add({
      fullHeal: () => {
        g.stats.hp = g.stats.maxHp;
        g.stats.mp = g.stats.maxMp;
        g.onChat("notice", "[GM] Self HP/MP fully restored!");
        g.onChange();
      }
    }, "fullHeal").name("💖 Full Restore HP/MP");

    this.cheatsFolder.add({
      addMesos: () => {
        g.stats.meso = (g.stats.meso || 0) + 1000000;
        g.onChat("notice", "[GM] Added +1,000,000 mesos.");
        g.onChange();
      }
    }, "addMesos").name("💰 Add +1M Mesos");

    this.cheatsFolder.add({
      levelUp: () => {
        g.stats.level = (g.stats.level || 1) + 1;
        g.stats.ap = (g.stats.ap || 0) + 5;
        g.stats.sp = (g.stats.sp || 0) + 3;
        g.stats.maxHp += 30;
        g.stats.hp = g.stats.maxHp;
        g.onChat("notice", `★ [GM Level Up] Advanced to Level ${g.stats.level}!`);
        g.onChange();
      }
    }, "levelUp").name("⭐ Level Up (+1)");

    this.cheatsFolder.open();

    // ── 3. Combat & Mob Magnet ────────────────────────────────
    this.combatFolder = this.gui.addFolder("⚔️ Combat & Mob Magnet");
    this.combatFolder.add({
      vacuum: () => {
        let count = 0;
        for (const m of g.mobs) {
          if (m.state !== "dead" && m.state !== "die1") {
            m.x = g.p.x + (Math.random() * 40 - 20);
            m.y = g.p.y;
            count++;
          }
        }
        g.onChat("notice", `★ [GM Vacuum] Pulled ${count} monsters to your position!`);
      }
    }, "vacuum").name("🧲 Vacuum All Mobs");

    this.combatFolder.add({
      killAll: () => {
        let count = 0;
        for (const m of g.mobs) {
          if (m.state !== "dead" && m.state !== "die1") {
            m.hp = 0;
            m.state = "die1";
            m.frame = 0;
            count++;
          }
        }
        g.onChat("notice", `★ [GM Wipe] Vanquished ${count} monsters on current map.`);
      }
    }, "killAll").name("💀 Wipe All Mobs");

    this.combatFolder.add(this.params, "mobToSpawn", Object.keys(MOB_PRESETS)).name("Mob Type");
    this.combatFolder.add(this.params, "spawnAmount", 1, 20, 1).name("Spawn Count");
    this.combatFolder.add({
      spawn: () => {
        const mobId = MOB_PRESETS[this.params.mobToSpawn] || 100100;
        const count = this.params.spawnAmount || 5;
        g.spawnCustomMob(mobId, count);
        g.onChat("notice", `[GM] Spawned ${count}x ${this.params.mobToSpawn}.`);
      }
    }, "spawn").name("👾 Spawn Mobs Now");

    // ── 4. Map Teleport & Coordinates ─────────────────────────
    this.worldFolder = this.gui.addFolder("🗺️ Map Teleport");
    this.worldFolder.add(this.params, "targetMap", Object.keys(MAP_PRESETS)).name("Destination");
    this.worldFolder.add({
      warpMap: async () => {
        const mapId = MAP_PRESETS[this.params.targetMap];
        if (mapId) {
          await g.loadMap(mapId, "spawn");
          g.onChat("notice", `[GM] Warped to ${this.params.targetMap}.`);
        }
      }
    }, "warpMap").name("🚀 Teleport To Map");

    this.worldFolder.add(this.params, "targetX").name("Teleport X").listen();
    this.worldFolder.add(this.params, "targetY").name("Teleport Y").listen();
    this.worldFolder.add({
      warpCoords: () => {
        g.p.x = Number(this.params.targetX);
        g.p.y = Number(this.params.targetY);
        g.snapCamera();
        g.onChat("notice", `[GM] Teleported to (${g.p.x}, ${g.p.y}).`);
      }
    }, "warpCoords").name("🎯 Warp To Coords");

    // ── 5. Interface & UI Style ──────────────────────────────
    this.uiFolder = this.gui.addFolder("🖥️ Interface & UI Style");
    this.uiFolder.add(this.params, "uiMode", ["new", "old"]).name("UI Version").onChange((val: "new" | "old") => {
      setUiMode(val);
      g.onChat("notice", `★ [UI Mode] Switched to ${val.toUpperCase()} UI (${val === "new" ? "WebGPU Canvas WZ HUD" : "Classic Modern DOM HUD"}). Hotkey: F2.`);
    });
    this.uiFolder.add({
      toggleUi: () => {
        const next = this.params.uiMode === "new" ? "old" : "new";
        this.params.uiMode = next;
        setUiMode(next);
        g.onChat("notice", `★ [UI Mode] Switched to ${next.toUpperCase()} UI (${next === "new" ? "WebGPU Canvas WZ HUD" : "Classic Modern DOM HUD"}).`);
      }
    }, "toggleUi").name("⚡ Toggle UI (F2)");
    this.uiFolder.open();
  }

  public toggle() {
    this.isVisible = !this.isVisible;
    this.gui.domElement.style.display = this.isVisible ? "block" : "none";
  }

  public show() {
    this.isVisible = true;
    this.gui.domElement.style.display = "block";
    this.gui.open();
  }

  public hide() {
    this.isVisible = false;
    this.gui.domElement.style.display = "none";
  }

  public syncVisibility() {
    const isGm = this.game?.isGm?.() ?? false;
    this.gui.domElement.style.display = isGm && this.isVisible ? "block" : "none";
  }

  public update(dt: number) {
    this.pollTimer += dt;
    if (this.pollTimer >= 2.0) {
      this.pollTimer = 0;
      this.syncVisibility();
      if (this.game?.isGm?.()) {
        this.fetchPlayers();
      }
    }

    if (this.game) {
      this.params.targetX = Math.round(this.game.p.x);
      this.params.targetY = Math.round(this.game.p.y);
    }
  }

  async fetchPlayers() {
    const g = this.game;
    if (!g) return;

    const list: OnlinePlayerItem[] = [
      {
        id: g.wsId || "LOCAL",
        name: g.stats.name || "Adventurer",
        mapId: g.map?.id || 910000000,
        x: Math.round(g.p.x),
        y: Math.round(g.p.y),
      },
    ];

    for (const [id, rp] of g.remotePlayers) {
      const name = rp.name || id;
      if (name.toLowerCase() === (g.stats.name || "").toLowerCase()) continue;
      list.push({
        id,
        name,
        mapId: g.map?.id || 910000000,
        x: Math.round(rp.x),
        y: Math.round(rp.y),
      });
    }

    try {
      const res = await fetch("/api/gm/players", { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.players)) {
          for (const sp of data.players) {
            const name = sp.name || sp.id;
            if (name.toLowerCase() === (g.stats.name || "").toLowerCase()) continue;
            if (!list.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
              list.push({
                id: sp.id,
                name,
                mapId: sp.mapId,
                x: sp.x,
                y: sp.y,
              });
            }
          }
        }
        if (typeof data.activeMaps === "number") {
          this.params.activeMaps = data.activeMaps;
        }
      }
    } catch {}

    this.onlinePlayers = list;
    this.params.onlineCount = list.length;

    // Refresh player dropdown options
    const names = list.map((p) => p.name);
    if (!names.includes(this.params.selectedPlayer) && names.length > 0) {
      this.params.selectedPlayer = names[0];
    }

    if (this.playerDropdownController) {
      this.playersFolder.remove(this.playerDropdownController);
      this.playerDropdownController = this.playersFolder
        .add(this.params, "selectedPlayer", names)
        .name("Target Player");
    }
  }

  private getSelected(): OnlinePlayerItem | undefined {
    return this.onlinePlayers.find(
      (p) => p.name.toLowerCase() === (this.params.selectedPlayer || "").toLowerCase()
    );
  }

  private async warpToTarget() {
    const target = this.getSelected();
    if (!target) {
      alert("No target player selected.");
      return;
    }
    const g = this.game;
    if (g.map?.id !== target.mapId) {
      await g.loadMap(target.mapId, "spawn");
    }
    g.p.x = target.x;
    g.p.y = target.y;
    g.snapCamera();
    g.onChat("notice", `[GM] Warped to ${target.name} at (${target.x}, ${target.y}).`);
  }

  private async summonTarget() {
    const target = this.getSelected();
    if (!target) return;
    await this.executeGmAction("summon", {
      targetId: target.id,
      targetName: target.name,
      mapId: this.game.map?.id || 910000000,
      x: Math.round(this.game.p.x),
      y: Math.round(this.game.p.y),
    });
    this.game.onChat("notice", `[GM] Summoned ${target.name} to you.`);
  }

  private async forcePartyTarget() {
    const target = this.getSelected();
    if (!target) return;
    const res = await PartyClient.forceJoin(this.game.stats.name, target.name);
    if (res.ok) {
      this.game.party = res.party ?? null;
      this.game.partyId = res.party?.id;
      this.game.onChat("notice", `★ [GM Action] Forced ${target.name} into your party!`);
      window.dispatchEvent(new CustomEvent("party-state-changed", { detail: { party: this.game.party } }));
      this.game.onChange();
    } else {
      this.game.onChat("notice", `[GM] Failed to force into party: ${res.error || "Unknown error"}`);
    }
  }

  private async healTarget() {
    const target = this.getSelected();
    if (!target) return;
    await this.executeGmAction("heal", { targetId: target.id, targetName: target.name });
    this.game.onChat("notice", `[GM] Sent divine blessing to ${target.name}.`);
  }

  private async mesoTarget() {
    const target = this.getSelected();
    if (!target) return;
    await this.executeGmAction("meso", { targetId: target.id, targetName: target.name, amount: 1000000 });
    this.game.onChat("notice", `[GM] Sent +1,000,000 mesos to ${target.name}.`);
  }

  private whisperTarget() {
    const target = this.getSelected();
    if (!target) return;
    const chatField = document.querySelector(".chat-field") as HTMLInputElement;
    if (chatField) {
      chatField.focus();
      chatField.value = `/w ${target.name} `;
    }
  }

  private async kickTarget() {
    const target = this.getSelected();
    if (!target) return;
    if (confirm(`Kick player ${target.name} from server?`)) {
      await this.executeGmAction("kick", { targetId: target.id, targetName: target.name });
      this.game.onChat("notice", `[GM] Disconnected ${target.name}.`);
      this.fetchPlayers();
    }
  }

  private async broadcastNotice() {
    const text = prompt("Broadcast Server Notice:");
    if (text && text.trim()) {
      await this.executeGmAction("notice", { text: text.trim() });
      this.game.onChat("notice", `[Broadcast] ${text.trim()}`);
    }
  }

  private async executeGmAction(action: string, payload: any) {
    try {
      await fetch("/api/gm/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
    } catch {}
  }

  public destroy() {
    this.gui.destroy();
  }
}
