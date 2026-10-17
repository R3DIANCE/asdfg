// Core GM System — GameMaster operations, debug commands, monster spawner, cheats and broadcasts
import type { Game } from "../game.ts";
import { FootholdTree } from "../physics.ts";
import { classFor, ITEMS, SKILL, type ClassId } from "../skills.ts";
import { GEAR, MATS, makeGear } from "../items.ts";
import { json } from "../assets.ts";
import { CombatSystem } from "./CombatSystem.ts";

export class GmSystem {
  static setLevel(game: Game, targetLevel: number) {
    const s = game.stats;
    const oldLevel = s.level;
    s.level = Math.max(1, Math.min(300, targetLevel));
    s.exp = 0;
    const delta = s.level - oldLevel;
    if (delta > 0) {
      s.ap += delta * 5;
      s.sp += delta * 3;
      s.baseHp += delta * 20;
      s.baseMp += delta * 5;
    }
    game.recalc();
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    game.fx.push({ frames: game.fxData.levelUp, x: game.p.x, y: game.p.y, flip: false, t: 0, follow: true });
    game.onChat("notice", `[DEBUG] Level set to ${s.level}.`);
    game.onChange();
  }

  static addExp(game: Game, n: number) {
    CombatSystem.gainExp(game, n);
  }

  static setJob(game: Game, classId: ClassId, jobName?: string) {
    const s = game.stats;
    const c = classFor(classId);
    s.classId = c.id;
    s.job = jobName || c.tabs[Math.min(c.tabs.length - 1, s.level >= 60 ? 3 : s.level >= 30 ? 2 : 1)] || c.name;
    game.recalc();
    game.onChat("notice", `[DEBUG] Class set to ${c.name} (${s.job}).`);
    game.onChange();
  }

  static giveMesos(game: Game, amt: number) {
    game.stats.meso = Math.max(0, Math.min(9999999999, game.stats.meso + amt));
    game.onGain("meso", `[DEBUG] Mesos adjusted by ${amt >= 0 ? "+" : ""}${amt.toLocaleString()}. Total: ${game.stats.meso.toLocaleString()}`);
    game.onChange();
  }

  static giveItem(game: Game, id: number, count = 1) {
    game.inv[id] = (game.inv[id] ?? 0) + count;
    game.onChat("item", `[DEBUG] Received ${count}x item (${ITEMS[id]?.name ?? id}).`);
    game.onChange();
  }

  static giveMat(game: Game, id: number, count = 1) {
    game.mats[id] = (game.mats[id] ?? 0) + count;
    game.onChat("item", `[DEBUG] Received ${count}x material (${MATS.get(id) ?? id}).`);
    game.onChange();
  }

  static giveAnyItem(game: Game, id: number, count = 1) {
    const c = Math.max(1, Math.min(999, count));
    if (id < 2000000 || GEAR.has(id)) {
      for (let i = 0; i < c; i++) {
        game.addGear(makeGear(id, 0));
      }
      game.onChat("item", `[GM] Spawned ${c}x gear (${GEAR.get(id)?.name ?? id}).`);
    } else if ((id >= 2000000 && id < 3000000) || ITEMS[id]) {
      GmSystem.giveItem(game, id, c);
    } else {
      GmSystem.giveMat(game, id, c);
    }
    game.onChange();
  }

  static async spawnCustomMob(game: Game, mobId: number, count = 1) {
    try {
      if (!game.mobData.has(mobId)) {
        game.mobData.set(mobId, await json(`/wz/data/mob/${mobId}`));
      }
      const data = game.mobData.get(mobId);
      if (!data) {
        game.onChat("notice", `[GM] Mob #${mobId} data not found.`);
        return;
      }
      await Promise.all(
        Object.values(data.books).flat().map((s) => Promise.resolve(game.assets.load(s.url)).catch(() => null))
      );
      const p = game.p;
      const spawnedCount = Math.max(1, Math.min(50, count));
      for (let i = 0; i < spawnedCount; i++) {
        const offset = (i - Math.floor(spawnedCount / 2)) * 50;
        const x = Math.max(game.tree.minX + 40, Math.min(game.tree.maxX - 40, p.x + offset));
        const fh = game.tree.landing(x, p.y - 100, p.y + 100) ?? p.fh;
        const y = fh ? FootholdTree.yAt(fh, x) : p.y;
        const spawn = { id: mobId, x, y, fh: fh?.id ?? 0, rx0: game.bounds.l + 30, rx1: game.bounds.r - 30 };
        const m = game.makeMob(spawn);
        if (m) {
          m.x = x;
          m.y = y;
          game.mobs.push(m);
        }
      }
      game.onChat("notice", `[GM] Summoned ${spawnedCount}x ${data.name.trim()} (${mobId})!`);
    } catch (e: any) {
      game.onChat("notice", `[GM] Failed to spawn mob #${mobId}: ${e?.message ?? e}`);
    }
  }

  static magnetMobs(game: Game) {
    const p = game.p;
    let count = 0;
    for (const m of game.mobs) {
      if (m.state !== "dead" && m.state !== "die1") {
        m.x = p.x + (Math.random() - 0.5) * 60;
        m.y = p.y;
        m.vx = 0;
        m.vy = 0;
        m.fh = p.fh;
        count++;
      }
    }
    game.onChat("notice", `[GM] Magnetized ${count} monsters to your coordinates.`);
  }

  static broadcastNotice(game: Game, text: string) {
    const clean = text.trim();
    if (!clean) return;
    const notice = `[Notice] ${clean}`;
    game.onChat("notice", notice);
    if (game.ws && game.ws.readyState === WebSocket.OPEN) {
      game.ws.send(JSON.stringify({ t: "chat", text: notice, kind: "notice", broadcast: true }));
    }
  }

  static setFame(game: Game, amt: number) {
    game.stats.fame = Math.max(0, amt);
    game.onChat("notice", `[GM] Fame set to ${game.stats.fame}.`);
    game.onChange();
  }

  static fullHeal(game: Game) {
    const healAmt = game.stats.maxHp - game.stats.hp;
    game.stats.hp = game.stats.maxHp;
    game.stats.mp = game.stats.maxMp;
    if (healAmt > 0) {
      game.dmg.push({
        value: healAmt,
        miss: false,
        hurt: false,
        heal: true,
        critical: false,
        x: game.p.x,
        y: game.p.y - 45,
        t: 0,
      });
    }
    game.onChat("notice", "[DEBUG] Fully restored HP and MP.");
    game.onChange();
  }

  static killAllMobs(game: Game) {
    let count = 0;
    for (const m of game.mobs) {
      if (m.state !== "dead" && m.state !== "die1") {
        CombatSystem.damageMob(game, m, 9999999, false);
        count++;
      }
    }
    game.onChat("notice", `[DEBUG] Instakilled ${count} monsters.`);
  }

  static maxAllSkills(game: Game) {
    const c = game.class;
    let count = 0;
    for (const tab of c.skillsByTab) {
      for (const sid of tab) {
        const def = SKILL[sid];
        if (def) {
          game.skillLv[sid] = def.maxLevel;
          count++;
        }
      }
    }
    game.recalc();
    game.onChat("notice", `[DEBUG] Maxed out ${count} skills for ${c.name}.`);
    game.onChange();
  }

  static spawnBossImmediate(game: Game) {
    game.stage.kills = game.stageNeed;
    game.challengeBoss();
  }

  static readyBossImmediate(game: Game) {
    game.stage.kills = game.stageNeed;
    game.onChat("notice", `[DEBUG] Stage ${game.stage.n} boss is now ready!`);
    game.onChange();
  }

  static advanceStageImmediate(game: Game) {
    game.areaBossDefeated = true;
    const pt = game.portals.find((p) => p.side === "right");
    if (pt) {
      game.loadMap(pt.to, "left");
      game.onChat("notice", "[DEBUG] Force advanced to next area.");
    }
  }
}
