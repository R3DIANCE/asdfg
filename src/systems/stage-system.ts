import type { Game } from "../game.ts";
import { FootholdTree } from "../physics.ts";
import { json } from "../assets.ts";
import { GEAR, MOB_MAT, ORES, makeGear, randomGearFor, type Gear } from "../items.ts";
import { BOSSES, STAGE_KILLS, rand, type MobData } from "../game-types.ts";

export class StageSystem {
  public static stageMul(n: number) {
    const stageIdx = Math.max(0, n - 1);
    // Compound exponential & polynomial scaling: every stage gets meaningfully tougher to kill
    const hpExp = Math.pow(1.22, stageIdx);
    const hpPoly = 1 + stageIdx * 0.15 + Math.pow(stageIdx / 4, 1.8) * 0.1;
    const hp = Math.max(1, Math.round(hpExp * hpPoly));

    const dmgExp = Math.pow(1.10, stageIdx);
    const dmgPoly = 1 + stageIdx * 0.05;
    const dmg = dmgExp * dmgPoly;

    const expExp = Math.pow(1.14, stageIdx);
    const expPoly = 1 + stageIdx * 0.08;
    const exp = expExp * expPoly;

    const mesoExp = Math.pow(1.12, stageIdx);
    const meso = mesoExp * (1 + stageIdx * 0.06);

    const def = Math.round(stageIdx * 12 + Math.pow(stageIdx, 1.3) * 2);

    return { hp, dmg, exp, meso, def };
  }

  /** Stage Star Force requirement (modern MapleStory Arcane/Star Force scaling) */
  public static requiredStarForce(stageNum: number): number {
    return Math.max(0, (stageNum - 1) * 5);
  }

  /**
   * Authentic MapleStory Star Force / Arcane Force damage multiplier and defense effect:
   * >= 1.5x requirement -> 150% damage dealt (+50% Final Damage!), 1 damage taken!
   * >= 1.3x -> 130% damage
   * >= 1.0x -> 100% damage
   * < 1.0x -> penalty (down to 50%) and increased damage taken
   */
  public static starForceMultiplier(playerSF: number, reqSF: number): { dmgMul: number; damageReduction: boolean } {
    if (reqSF === 0) return { dmgMul: 1.0, damageReduction: false };
    const ratio = playerSF / reqSF;
    if (ratio >= 1.5) {
      return { dmgMul: 1.5, damageReduction: true };
    } else if (ratio >= 1.3) {
      return { dmgMul: 1.3, damageReduction: false };
    } else if (ratio >= 1.0) {
      return { dmgMul: 1.0, damageReduction: false };
    } else if (ratio >= 0.7) {
      return { dmgMul: 0.8, damageReduction: false };
    } else {
      return { dmgMul: 0.5, damageReduction: false };
    }
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
      m.maxHp = m.hp = Math.round(refHp * 40 * Math.pow(1.15, game.stage.n - 1) * (1 + game.stage.n * 0.12));
      m.atk = Math.round((ref?.atk ?? 15) * (2.4 + game.stage.n * 0.08));
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

      const bossSource = {
        id: m.data.id,
        name: `${m.data.name.trim()} (Boss)`,
        level: m.data.meta?.level ?? 1,
        elite: true,
      };

      for (let i = 0; i < 6; i++) {
        game.spawnDrop(
          { amount: Math.round(rand(20, 40) * m.mul.meso * (1 + game.gt.meso / 100)), sourceMob: bossSource },
          m.x + rand(-60, 60),
          m.y - 30,
          rand(-90, 90),
          -rand(380, 520)
        );
      }

      const gearN = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < gearN; i++) {
        game.spawnDrop(
          { gear: makeGear(randomGearFor(game.stats.level, game.stats.classId), 1.8, 1), sourceMob: bossSource },
          m.x + rand(-40, 40),
          m.y - 30,
          rand(-80, 80),
          -480
        );
      }

      const bm = MOB_MAT[m.data.id];
      if (bm) {
        for (let i = 0; i < 3; i++) {
          game.spawnDrop({ mat: bm, sourceMob: bossSource }, m.x + rand(-50, 50), m.y - 30, rand(-70, 70), -440);
        }
      }

      for (let i = 0; i < 2; i++) {
        game.spawnDrop(
          { mat: ORES[Math.min(ORES.length - 1, Math.floor(s.n / 3) % ORES.length)], sourceMob: bossSource },
          m.x + rand(-50, 50),
          m.y - 30,
          rand(-70, 70),
          -440
        );
      }

      // Modern MapleStory: Intense Power Crystal (Boss Crystal) Drop
      game.spawnDrop({ mat: 4001886, sourceMob: bossSource }, m.x, m.y - 30, 0, -500);
      game.onChat("notice", `★ [Boss Defeat] ${m.data.name.trim()} dropped a Crystal of Intense Power! Sell it for high mesos in the Auction House or shop!`);

      s.n++;
      s.kills = 0;
      s.best = Math.max(s.best, s.n);
      game.areaBossDefeated = true;
      game.onChat("level", `Stage cleared! Welcome to Stage ${s.n}. Monsters grow stronger — and so do their rewards.`);

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

  public static offlineRewards(game: Game, savedAt?: number) {
    const now = Date.now();
    const lastActive = Math.max(game.lastLogoutAt || 0, game.lastSavedAt || 0, savedAt || 0);
    const elapsed = lastActive > 0 ? Math.max(0, (now - lastActive) / 1000) : 0;

    // Accumulate offline progress if player was away for at least 60 seconds
    if (elapsed >= 60) {
      const seconds = Math.min(24 * 3600, elapsed);
      const killRate = Math.max(game.idle.killRate || 0, 0.05);
      const kills = Math.floor(seconds * killRate * 0.6);
      if (kills > 0) {
        const exp = Math.round(kills * Math.max(game.idle.expPerKill || 0, 15));
        const meso = Math.round(kills * Math.max(game.idle.mesoPerKill || 0, 12));
        const mats: Record<number, number> = {};
        const mm = game.map ? [...new Set(game.map.spawns.map((s) => MOB_MAT[s.id]).filter(Boolean))] : [4000001];
        for (const id of mm) mats[id] = Math.floor((kills * 0.35) / mm.length);
        mats[ORES[Math.floor(Math.random() * 3)]] = Math.floor(kills * 0.04);
        const gear: Gear[] = [];
        for (let i = 0; i < Math.min(8, Math.floor(kills / 120)); i++) {
          gear.push(makeGear(randomGearFor(game.stats.level, game.stats.classId), 0.4));
        }

        // Merge and accumulate onto any existing unclaimed rewards
        if (game.unclaimedOffline) {
          game.unclaimedOffline.seconds += Math.round(seconds);
          game.unclaimedOffline.kills += kills;
          game.unclaimedOffline.exp += exp;
          game.unclaimedOffline.meso += meso;
          for (const [id, count] of Object.entries(mats)) {
            game.unclaimedOffline.mats[+id] = (game.unclaimedOffline.mats[+id] || 0) + count;
          }
          const availableSlots = Math.max(0, 16 - game.unclaimedOffline.gear.length);
          if (availableSlots > 0 && gear.length > 0) {
            game.unclaimedOffline.gear.push(...gear.slice(0, availableSlots));
          }
        } else {
          game.unclaimedOffline = {
            seconds: Math.round(seconds),
            kills,
            exp,
            meso,
            mats,
            gear,
          };
        }
      }
      game.lastSavedAt = now;
      game.lastLogoutAt = 0;
    }

    // If there are accumulated unclaimed rewards, prompt the player
    if (game.unclaimedOffline && (game.unclaimedOffline.kills > 0 || game.unclaimedOffline.seconds >= 60)) {
      try {
        const charKey = game.stats.name ? `maple-offline-unclaimed-${game.stats.name}` : "maple-offline-unclaimed";
        localStorage.setItem(charKey, JSON.stringify(game.unclaimedOffline));
      } catch {}
      game.onOffline(game.unclaimedOffline);
    }
  }

  public static claimOffline(
    game: Game,
    r?: { seconds: number; kills: number; exp: number; meso: number; mats: Record<number, number>; gear: Gear[] },
    mult = 1
  ) {
    const rewards = r || game.unclaimedOffline;
    if (!rewards) return;
    if (game.lastOfflineClaimAt && (Date.now() - game.lastOfflineClaimAt < 1000)) return;

    // Enforce single claim: clear the accumulated pool immediately
    game.unclaimedOffline = null;
    try {
      const charKey = game.stats.name ? `maple-offline-unclaimed-${game.stats.name}` : "maple-offline-unclaimed";
      localStorage.removeItem(charKey);
      localStorage.removeItem("maple-offline-unclaimed");
    } catch {}

    game.stats.meso += Math.round(rewards.meso * mult);
    for (const [id, n] of Object.entries(rewards.mats)) {
      game.mats[+id] = (game.mats[+id] ?? 0) + Math.round(n * mult);
    }
    for (const g of rewards.gear) game.addGear(g);
    game.stage.kills = Math.min(STAGE_KILLS, game.stage.kills + rewards.kills);
    game.gainExp(Math.round(rewards.exp * mult));
    game.lastOfflineClaimAt = Date.now();
    game.lastSavedAt = Date.now();
    game.onGain?.("meso", `Claimed ${Math.round(rewards.meso * mult).toLocaleString()} mesos & ${Math.round(rewards.exp * mult).toLocaleString()} EXP from offline hunting!`);
    game.onChange();
    if (typeof (game as any).persist === "function") {
      try { (game as any).persist(); } catch {}
    }
  }
}
