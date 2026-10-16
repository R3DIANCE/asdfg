// Core Stats System — Character statistics, AP auto-assign, damage formula, class defaults, and skill learning
import type { Game } from "../game.ts";
import { WALK } from "../game-types.ts";
import { classFor, SKILL, type ClassId, type Action } from "../skills.ts";
import { gearStats, type Slot } from "../items.ts";

export const emptyGt = () => ({
  watk: 0,
  str: 0,
  dex: 0,
  int: 0,
  luk: 0,
  hp: 0,
  def: 0,
  att: 0,
  strP: 0,
  dexP: 0,
  intP: 0,
  lukP: 0,
  hpP: 0,
  boss: 0,
  meso: 0,
  drop: 0,
  exp: 0,
});

export class StatsSystem {
  static totalStat(game: Game, k: "str" | "dex" | "int" | "luk"): number {
    const passive = (k === "str" || k === "dex") ? game.lv("1100009") * 4 : 0;
    const pct = (k === "str" ? game.gt.strP : k === "dex" ? game.gt.dexP : k === "int" ? game.gt.intP : game.gt.lukP);
    return Math.round((game.stats[k] + passive + game.gt[k]) * (1 + pct / 100));
  }

  static primaryStat(game: Game): number {
    return StatsSystem.totalStat(game, game.class.primary);
  }

  static secondaryStat(game: Game): number {
    return StatsSystem.totalStat(game, game.class.secondary);
  }

  static watk(game: Game): number {
    return Math.round(
      ((game.eq.weapon ? game.gt.watk : 5 + game.gt.watk) + (game.buffs["1101006"] ? game.lv("1101006") * 2 : 0)) *
      (1 + game.gt.att / 100)
    );
  }

  static maxDamage(game: Game): number {
    return Math.max(1, ((4 * StatsSystem.primaryStat(game) + StatsSystem.secondaryStat(game)) * StatsSystem.watk(game)) / 40);
  }

  static combatPower(game: Game): number {
    return Math.round(
      StatsSystem.maxDamage(game) * 12 * (1 + game.gt.boss / 200) +
      game.stats.maxHp / 4 +
      game.gt.def * 4
    );
  }

  static mastery(game: Game): number {
    return Math.min(0.9, 0.15 + game.lv("1100000") * 0.05);
  }

  static damageRange(game: Game): [number, number] {
    const mx = StatsSystem.maxDamage(game);
    return [Math.max(1, Math.floor(mx * StatsSystem.mastery(game))), Math.floor(mx)];
  }

  static speed(game: Game): number {
    let mult = 1 + game.lv("1000009") * 0.01;
    for (const [id] of Object.entries(game.buffs)) {
      const d = SKILL[id];
      if (d?.buff?.speed) mult += (d.buff.speed + game.lv(id)) * 0.01;
    }
    if (game.buffs["0001002"]) mult += game.lv("0001002") * 0.1;
    return WALK * mult * (game.speedMultiplier || 1);
  }

  static jobFor(game: Game, level: number): string {
    const c = game.class;
    if (c.tabs.length >= 5 && level >= c.tabLevel[4]) return c.tabs[4];
    if (c.tabs.length >= 4 && level >= c.tabLevel[3]) return c.tabs[3];
    if (c.tabs.length >= 3 && level >= c.tabLevel[2]) return c.tabs[2];
    if (c.tabs.length >= 2 && level >= c.tabLevel[1]) return c.tabs[1];
    return c.tabs[0];
  }

  static recalc(game: Game) {
    const s = game.stats, gt = emptyGt();
    for (const [id] of Object.entries(game.buffs)) {
      const d = SKILL[id];
      if (!d?.buff) continue;
      const l = Math.max(1, game.lv(id));
      for (const k of ["att", "str", "dex", "int", "luk", "def"] as const) {
        if (d.buff[k]) gt[k] += d.buff[k]! * l;
      }
    }
    for (const g of Object.values(game.eq)) {
      if (!g) continue;
      const st = gearStats(g);
      gt.watk += st.watk;
      gt.str += st.str;
      gt.dex += st.dex;
      gt.int += st.int;
      gt.luk += st.luk;
      gt.hp += st.hp;
      gt.def += st.def;
      for (const p of g.pot) {
        const pctKey = `${p.stat}P` as keyof typeof gt;
        if (p.stat === "att") gt.att += p.pct;
        else if (pctKey in gt) (gt as any)[pctKey] += p.pct;
        else if (p.stat in gt) (gt as any)[p.stat] += p.pct;
      }
    }
    game.gt = gt;
    s.maxHp = Math.round((s.baseHp * (1 + game.lv("1000009") * 0.03) + gt.hp) * (1 + gt.hpP / 100));
    s.maxMp = Math.round(s.baseMp + s.int);
    s.hp = Math.min(s.hp, s.maxHp);
    s.mp = Math.min(s.mp, s.maxMp);
    s.job = StatsSystem.jobFor(game, s.level);
  }

  static addStat(game: Game, k: "str" | "dex" | "int" | "luk", n = 1) {
    const s = game.stats;
    n = Math.min(n, s.ap);
    if (n <= 0) return;
    s[k] += n;
    s.ap -= n;
    StatsSystem.recalc(game);
    game.onChange();
  }

  static autoAssign(game: Game) {
    const s = game.stats, c = game.class;
    while (s.ap > 0) {
      if (s[c.secondary] < 4 + s.level && (game.autoTick = !game.autoTick) === false) {
        StatsSystem.addStat(game, c.secondary);
      } else {
        StatsSystem.addStat(game, c.primary);
      }
    }
  }

  static skillEligible(game: Game, id: string): boolean {
    const d = SKILL[id];
    if (!d) return false;
    const c = game.class;
    const inClass = c.skillsByTab.some((tab) => tab.includes(id));
    return inClass && game.stats.level >= d.reqLevel;
  }

  static canLearn(game: Game, id: string): boolean {
    const d = SKILL[id];
    return !!d && StatsSystem.skillEligible(game, id) && game.stats.sp > 0 && game.lv(id) < d.maxLevel;
  }

  static learn(game: Game, id: string): boolean {
    if (!StatsSystem.canLearn(game, id)) return false;
    game.skillLv[id] = game.lv(id) + 1;
    game.stats.sp--;
    StatsSystem.recalc(game);
    game.onChange();
    return true;
  }

  static applyClassDefaults(game: Game, id: ClassId) {
    const c = classFor(id);
    game.stats.classId = c.id;
    game.stats.job = c.tabs[0];
    game.stats.baseHp = c.base.hp;
    game.stats.baseMp = c.base.mp;
    game.stats.str = c.base.str;
    game.stats.dex = c.base.dex;
    game.stats.int = c.base.int;
    game.stats.luk = c.base.luk;
    game.stats.hp = c.base.hp;
    game.stats.mp = c.base.mp;
    game.skillLv = {};
    const attackIds = c.defaultQuick as Record<string, Action>;
    const pick = (Object.values(attackIds) as Action[])
      .filter((a): a is { t: "skill"; id: string } => a?.t === "skill")
      .map((a) => a.id)
      .find((sid) => {
        const d = SKILL[sid];
        if (!d) return false;
        if (d.kind !== "attack" && d.kind !== "ranged") return false;
        if (game.stats.level < d.reqLevel) return false;
        if (!c.skillsByTab.some((tab: string[]) => tab.includes(sid))) return false;
        return true;
      });
    if (pick) game.skillLv[pick] = 1;
    game.quick = { ...c.defaultQuick };
    StatsSystem.recalc(game);
  }

  static canAdvanceJob(game: Game, tier?: number): boolean {
    const s = game.stats;
    if (tier === 1 || (!tier && s.classId === "beginner")) return s.level >= 10 && s.classId === "beginner";
    if (s.classId === "beginner") return false;
    const c = classFor(s.classId);
    if (tier === 2) return s.level >= 30 && s.job === c.tabs[1];
    if (tier === 3) return s.level >= 60 && s.job === c.tabs[2];
    return false;
  }

  static advanceJob(game: Game, id: ClassId) {
    const s = game.stats;
    const c = classFor(id);
    s.classId = c.id;
    let jobIndex = 1;
    if (s.level >= 60 && c.tabs.length > 3) jobIndex = 3;
    else if (s.level >= 30 && c.tabs.length > 2) jobIndex = 2;
    s.job = c.tabs[jobIndex] || c.tabs[1] || c.name;
    s.sp += 5;
    s.ap += 5;
    const firstSkill = c.skillsByTab[1]?.[0];
    if (firstSkill && !game.skillLv[firstSkill]) {
      game.skillLv[firstSkill] = 1;
      game.quick["Shift"] = { t: "skill", id: firstSkill };
    }
    const moveSkill = c.skillsByTab[1]?.find((sid: string) => sid === "1001008" || sid === "4001003");
    if (moveSkill && !game.skillLv[moveSkill]) {
      game.skillLv[moveSkill] = 1;
      game.quick["Space"] = { t: "skill", id: moveSkill };
    }
    StatsSystem.recalc(game);
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    game.fx.push({ frames: game.fxData.levelUp, x: game.p.x, y: game.p.y, flip: false, t: 0, follow: true });
    game.onGain("level", `Job Advancement complete! You are now a ${s.job}!`);
    game.onChat("level", `★ Job Advancement: You have advanced to ${s.job}! +5 SP & +5 AP awarded.`);
    game.onChange();
  }
}
