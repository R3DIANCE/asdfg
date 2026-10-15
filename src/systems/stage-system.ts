import type { Game } from "../game.ts";
import { FootholdTree } from "../physics.ts";
import { json } from "../assets.ts";
import { GEAR, MOB_MAT, ORES, makeGear, randomGearFor, type Gear } from "../items.ts";
import { BOSSES, STAGE_KILLS, rand, type MobData } from "../game-types.ts";

export class StageSystem {
  public static stageMul(n: number) {
    return {
      hp: Math.pow(1.16, n - 1),
      dmg: Math.pow(1.07, n - 1),
      exp: Math.pow(1.11, n - 1),
      meso: Math.pow(1.1, n - 1),
    };
  }

  public static bossFor(n: number) {
    return BOSSES[(n - 1) % BOSSES.length];
  }

  public static bossReady(game: Game): boolean {
    return game.stage.kills >= STAGE_KILLS && !game.boss;
  }

  public static async challengeBoss(game: Game) {
    if (game.boss || game.bossLoading || !StageSystem.bossReady(game) || game.loadingMap) return;
    game.bossLoading = true;
    const id = StageSystem.bossFor(game.stage.n);
    try {
      if (!game.mobData.has(id)) game.mobData.set(id, await json(`/wz/data/mob/${id}`));
      const data = game.mobData.get(id)!;
      await Promise.race([
        Promise.all(
          Object.values(data.books)
            .flat()
            .map((s) => Promise.resolve(game.assets.load(s.url)).catch(() => null))
        ),
        new Promise((r) => setTimeout(r, 15000)),
      ]);

      const p = game.p;
      const ref = game.mobs.find((m) => !m.boss);
      const refHp = ref ? ref.maxHp : 100 * StageSystem.stageMul(game.stage.n).hp;
      const x = Math.max(game.tree.minX + 60, Math.min(game.tree.maxX - 60, p.x + p.face * 260));
      const fh = game.tree.landing(x, p.y - 200, p.y + 200) ?? p.fh;
      const spawn = {
        id,
        x,
        y: fh ? FootholdTree.yAt(fh, x) : p.y,
        fh: fh?.id ?? 0,
        rx0: game.bounds.l + 30,
        rx1: game.bounds.r - 30,
      };

      const m = game.makeMob(spawn)!;
      m.boss = true;
      m.maxHp = m.hp = Math.round(refHp * 28 * (1 + game.stage.n * 0.04));
      m.atk = Math.round((ref?.atk ?? 15) * 2.2);
      m.mul = { exp: (ref?.mul.exp ?? 1) * 1, meso: ref?.mul.meso ?? 1 };
      m.aggro = 999;
      m.skillT = 3;
      m.alpha = 0;

      game.mobs.push(m);
      game.boss = m;
      game.bossTimer = 120;
      game.onChat("notice", `Stage ${game.stage.n} boss: ${data.name.trim()} has appeared! Defeat it within 2 minutes.`);
      game.onBoss(m);
    } finally {
      game.bossLoading = false;
    }
  }

  public static endBoss(game: Game, won: boolean) {
    const m = game.boss;
    if (!m) return;
    game.boss = null;

    if (!won) {
      game.mobs = game.mobs.filter((x) => x !== m);
      game.onChat("notice", `${m.data.name.trim()} escaped. Gather your strength and challenge it again.`);
    } else {
      const s = game.stage;
      const ref = game.mobs.find((x) => !x.boss);
      const exp = Math.round((ref?.data.meta?.exp ?? 15) * (ref?.mul.exp ?? 1) * 18);
      game.gainExp(exp);

      for (let i = 0; i < 6; i++) {
        game.spawnDrop(
          { amount: Math.round(rand(20, 40) * m.mul.meso * (1 + game.gt.meso / 100)) },
          m.x + rand(-60, 60),
          m.y - 30,
          rand(-90, 90),
          -rand(380, 520)
        );
      }

      const gearN = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < gearN; i++) {
        game.spawnDrop(
          { gear: makeGear(randomGearFor(game.stats.level + 5), 1.6, 1) },
          m.x + rand(-40, 40),
          m.y - 30,
          rand(-80, 80),
          -480
        );
      }

      const bm = MOB_MAT[m.data.id];
      if (bm) {
        for (let i = 0; i < 3; i++) {
          game.spawnDrop({ mat: bm }, m.x + rand(-50, 50), m.y - 30, rand(-70, 70), -440);
        }
      }

      for (let i = 0; i < 2; i++) {
        game.spawnDrop(
          { mat: ORES[Math.min(ORES.length - 1, Math.floor(s.n / 3) % ORES.length)] },
          m.x + rand(-50, 50),
          m.y - 30,
          rand(-70, 70),
          -440
        );
      }

      s.n++;
      s.kills = 0;
      s.best = Math.max(s.best, s.n);
      game.areaBossDefeated = true;
      game.onChat("level", `Stage cleared! Welcome to Stage ${s.n}. Monsters grow stronger — and so do their rewards.`);
      game.onChat("notice", "★ Area Boss Defeated! Enter the right portal with Auto Combat ON to advance to the next area!");

      for (const x of game.mobs) {
        if (!x.boss) {
          const sc = StageSystem.stageMul(game.stage.n);
          x.maxHp = Math.round((x.data.meta?.maxHP ?? 50) * sc.hp);
          x.hp = Math.min(x.hp, x.maxHp);
          x.mul = { exp: sc.exp, meso: sc.meso };
          x.atk = game.mobAtk(x.data);
        }
      }
    }

    game.onBoss(null);
    game.onChange();
  }

  public static offlineRewards(game: Game, savedAt: number) {
    const seconds = Math.min(12 * 3600, Math.max(0, (Date.now() - savedAt) / 1000));
    if (seconds < 120) return;
    const kills = Math.floor(seconds * game.idle.killRate * 0.6);
    if (kills <= 0) return;
    const exp = Math.round(kills * game.idle.expPerKill);
    const meso = Math.round(kills * game.idle.mesoPerKill);
    const mats: Record<number, number> = {};
    const mm = game.map ? [...new Set(game.map.spawns.map((s) => MOB_MAT[s.id]).filter(Boolean))] : [4000001];
    for (const id of mm) mats[id] = Math.floor((kills * 0.35) / mm.length);
    mats[ORES[Math.floor(Math.random() * 3)]] = Math.floor(kills * 0.04);
    const gear: Gear[] = [];
    for (let i = 0; i < Math.min(8, Math.floor(kills / 120)); i++) {
      gear.push(makeGear(randomGearFor(game.stats.level), 0.4));
    }
    game.onOffline({ seconds, kills, exp, meso, mats, gear });
  }

  public static claimOffline(
    game: Game,
    r: { kills: number; exp: number; meso: number; mats: Record<number, number>; gear: Gear[] },
    mult = 1
  ) {
    game.stats.meso += Math.round(r.meso * mult);
    for (const [id, n] of Object.entries(r.mats)) {
      game.mats[+id] = (game.mats[+id] ?? 0) + Math.round(n * mult);
    }
    for (const g of r.gear) game.addGear(g);
    game.stage.kills = Math.min(STAGE_KILLS, game.stage.kills + r.kills);
    game.gainExp(Math.round(r.exp * mult));
    game.onChange();
  }
}
