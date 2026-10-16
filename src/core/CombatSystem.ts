// Core Combat System — Attack execution, skills, damage formula, projectiles, mob contact, player defeat
import type { Game } from "../game.ts";
import {
  WALK,
  JUMP,
  rand,
  STAGE_KILLS,
  expToLevel,
  type Mob,
} from "../game-types.ts";
import { ITEMS, SKILL, type Action, type SkillDef } from "../skills.ts";
import { MOB_MAT, ORES, makeGear, randomGearFor, getWeaponAttackAnim, isRangedWeapon } from "../items.ts";
import { groundMove } from "../physics.ts";

export class CombatSystem {
  static skillCooldown(game: Game, id: string): number {
    const d = SKILL[id];
    if (d?.cooldown) return d.cooldown(game.lv(id));
    const art = game.skillArt[id];
    if (art?.cooltime && art.cooltime > 0) return art.cooltime;
    return 0;
  }

  static triggerCooldown(game: Game, id: string) {
    const total = CombatSystem.skillCooldown(game, id);
    if (total > 0) {
      game.skillCd[id] = { left: total, total };
    }
  }

  static useAction(game: Game, a: Action | null | undefined, quiet = false): boolean {
    if (!a) return false;
    const p = game.p, s = game.stats;
    if (a.t === "item") {
      const it = ITEMS[a.id], n = game.inv[a.id] ?? 0;
      if (!it || n <= 0) {
        if (!quiet) game.onChat("system", `You don't have any ${it?.name ?? "of that item"}.`);
        return false;
      }
      if ((it.hp && s.hp >= s.maxHp && !it.mp) || (it.mp && s.mp >= s.maxMp && !it.hp)) return false;
      if (it.hpPct && s.hp >= s.maxHp && !it.mpPct) return false;
      if (it.type !== "star" && it.type !== "arrow" && it.type !== "bullet") {
        game.inv[a.id] = n - 1;
      }
      if (it.hp) s.hp = Math.min(s.maxHp, s.hp + it.hp);
      if (it.mp) s.mp = Math.min(s.maxMp, s.mp + it.mp);
      if (it.hpPct) s.hp = Math.min(s.maxHp, Math.round(s.hp + s.maxHp * (it.hpPct / 100)));
      if (it.mpPct) s.mp = Math.min(s.maxMp, Math.round(s.mp + s.maxMp * (it.mpPct / 100)));
      game.onChange();
      return true;
    }
    if (a.t === "attack") return CombatSystem.startAttack(game, null);
    const d = SKILL[a.id], lv = game.lv(a.id);
    if (!d) return false;
    if (lv <= 0) {
      if (!quiet) game.onChat("system", "You haven't learned that skill yet.");
      return false;
    }
    if (!game.skillEligible(a.id)) {
      if (!quiet) game.onChat("system", "That skill doesn't belong to your class.");
      return false;
    }
    if (d.kind === "passive") return false;

    const cd = game.skillCd[a.id];
    if (cd && cd.left > 0) {
      if (!quiet) game.onChat("system", `Skill is on cooldown (${cd.left.toFixed(1)}s remaining).`);
      return false;
    }

    const cost = game.infiniteMp ? 0 : d.mp(lv);
    if (d.kind === "buff") {
      if (p.attack > 0 || p.ladder) return false;
      if (!game.infiniteMp && s.mp < cost) {
        if (!quiet) game.onChat("system", "Not enough MP.");
        return false;
      }
      if (!game.infiniteMp) s.mp -= cost;
      game.buffs[a.id] = { left: d.duration!(lv), dur: d.duration!(lv) };
      const art = game.skillArt[a.id];
      if (art?.effect.length) game.fx.push({ frames: art.effect, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
      else if (art?.effect0?.length) game.fx.push({ frames: art.effect0, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
      p.alert = 2;
      CombatSystem.triggerCooldown(game, a.id);
      game.sendAction("skill", a.id, p.anim);
      game.recalc(); game.onChange();
      return true;
    }
    if (d.kind === "move") {
      if (p.ladder || (!game.infiniteMp && s.mp < cost)) return false;
      // If already airborne, allow at most one mid-air leap until landing
      if (!p.fh && p.leapt) return false;
      if (!game.infiniteMp) s.mp -= cost;
      p.leapt = true;
      p.fh = null; // Unlatch from ground foothold so momentum takes effect immediately

      if (a.id === "2001009") {
        // Magician Teleport: instantly warps horizontally
        const dist = 160 + lv * 8;
        p.x += p.face * dist;
        p.vx = p.face * 100;
        p.vy = -60;
      } else {
        const dexBoost = (s.dex || 0) * 0.003;
        const lukBoost = (s.luk || 0) * 0.0015;
        const spdBoost = (game.speed() / WALK - 1) * 0.35;
        const lvBoost = (s.level || 1) * 0.004;
        const boost = Math.min(2.5, 1.8 + dexBoost + lukBoost + spdBoost + lvBoost + lv * 0.05);
        const vyFactor = 0.45 + Math.min(0.3, dexBoost * 0.3 + spdBoost * 0.2);
        p.vy = -JUMP * vyFactor;
        p.vx = p.face * game.speed() * boost;
      }
      const art = game.skillArt[a.id];
      if (art?.effect?.length) game.fx.push({ frames: art.effect, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
      else if (art?.effect0?.length) game.fx.push({ frames: art.effect0, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
      CombatSystem.triggerCooldown(game, a.id);
      game.sendAction("skill", a.id, "jump");
      return true;
    }
    return CombatSystem.startAttack(game, a.id);
  }

  static startAttack(game: Game, id: string | null, fromAi = false): boolean {
    const p = game.p, s = game.stats;
    if (p.attack > 0 || p.ladder || game.loadingMap) return false;
    if (id) {
      const cd = game.skillCd[id];
      if (cd && cd.left > 0) return false;
    }
    const d = id ? SKILL[id] : null;
    if (d) {
      const cost = game.infiniteMp ? 0 : d.mp(game.lv(d.id));
      if (!game.infiniteMp && s.mp < cost) {
        game.onChat("system", "Not enough MP.");
        return false;
      }
      if (!game.infiniteMp) s.mp -= cost;
    }
    if (id) CombatSystem.triggerCooldown(game, id);
    p.skill = id;
    p.attack = d ? 0.75 : 0.6; p.aiAttack = fromAi; p.hitDone = false; p.alert = 3;
    const wepId = game.eq.weapon?.id ?? 1302000;
    const wepAnim = getWeaponAttackAnim(wepId);
    p.attackAnim = d ? (d.kind === "ranged" ? (isRangedWeapon(wepId) ? wepAnim : "swingO1") : wepAnim) : wepAnim;
    p.frame = 0; p.ft = 0;
    const art = id ? game.skillArt[id] : null;
    if (art?.effect.length) game.fx.push({ frames: art.effect, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
    else if (art?.effect0.length) game.fx.push({ frames: art.effect0, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
    game.sendAction(id ? "skill" : "attack", id, p.attackAnim);
    return true;
  }

  static mobBox(m: Mob) {
    if (!m || !m.data || !m.data.books) {
      return { x0: (m?.x ?? 0) - 20, x1: (m?.x ?? 0) + 20, y0: (m?.y ?? 0) - 40, y1: m?.y ?? 0 };
    }
    const st = m.data.books.stand?.[0] ?? m.data.books.move?.[0];
    const w = st ? st.w * 0.7 : 40, h = st ? st.h * 0.85 : 40;
    return { x0: m.x - w / 2, x1: m.x + w / 2, y0: m.y - h, y1: m.y };
  }

  static rollDamage(game: Game, pct: number, mob: Mob) {
    const [lo, hi] = game.damageRange();
    const mobLv = mob.data.meta?.level ?? 1;
    const missChance = Math.max(0.02, Math.min(0.5, 0.06 + (mobLv - game.stats.level) * 0.03 - game.totalDex() * 0.002 - game.lv("1100000") * 0.004));
    const stageDef = game.stageMul().def || 0;
    const def = ((mob.data.meta?.PDDamage ?? 0) * 0.5 + stageDef) * (mob.boss ? 1.6 : 1);
    const bossMul = mob.boss ? 1 + game.gt.boss / 100 : 1;

    let critRate = 0.08;
    if (game.lv("3100001")) critRate += game.lv("3100001") * 0.02;
    if (game.lv("4100001")) critRate += game.lv("4100001") * 0.03;
    if (game.lv("2111000")) critRate += game.lv("2111000") * 0.03;
    if (game.lv("4120002")) critRate += 0.15;
    if (game.totalLuk) critRate += Math.min(0.25, game.totalLuk() * 0.0005);
    critRate = Math.min(1.0, Math.max(0.05, critRate));

    const isCritical = Math.random() < critRate;
    const critMul = isCritical ? 1.45 : 1.0;

    const baseDmg = (rand(lo, hi) * pct / 100) * bossMul - def;
    const dmg = Math.max(1, Math.round(baseDmg * critMul));
    return { dmg, miss: false, critical: isCritical };
  }

  static resolveAttack(game: Game, id: string | null) {
    const p = game.p;
    const d: SkillDef | null = id ? SKILL[id] : null;
    const lv = id ? game.lv(id) : 0;
    const wepId = game.eq.weapon?.id ?? 1302000;
    const isRanged = d ? (d.kind === "ranged") : isRangedWeapon(wepId);
    const range = d?.range ?? (isRanged ? 360 : 90);
    const x0 = p.face === 1 ? p.x - 10 : p.x - range, x1 = p.face === 1 ? p.x + range : p.x + 10;
    const y0 = p.y - (d || isRanged ? 100 : 70), y1 = p.y + 10;
    const targets = game.liveMobs()
      .filter((m) => { const b = game.mobBox(m); return b.x1 > x0 && b.x0 < x1 && b.y1 > y0 && b.y0 < y1; })
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))
      .slice(0, d?.targets ?? 1);
    const pct = d?.dmg ? d.dmg(lv) : 100;
    if (isRanged) {
      const hits = d?.hits ?? 1;
      for (const m of targets) {
        for (let h = 0; h < hits; h++) {
          const r = CombatSystem.rollDamage(game, pct, m);
          const arcSpread = (h - (hits - 1) / 2) * 12;
          game.projectiles.push({
            x: p.x + p.face * 20,
            y: p.y - 35,
            target: m,
            dmg: r.dmg,
            miss: r.miss,
            critical: r.critical,
            t: -h * 0.08,
            skillId: id ?? undefined,
            arcY: arcSpread,
          });
        }
        if (game.buffs["4111002"]) {
          const shadowPct = Math.round(pct * 0.5);
          for (let h = 0; h < hits; h++) {
            const r = CombatSystem.rollDamage(game, shadowPct, m);
            if (Math.random() < 0.18) r.miss = true;
            const arcSpread = (h - (hits - 1) / 2) * 16 + (Math.sin(game.time * 8 + h) * 12);
            game.projectiles.push({
              x: p.x + (p.face === 1 ? 2 : -2) + p.face * 16,
              y: p.y - 35 + (Math.cos(game.time * 7 + h) * 5),
              target: m,
              dmg: r.dmg,
              miss: r.miss,
              critical: r.critical,
              t: -h * 0.08,
              skillId: id ?? undefined,
              isShadow: true,
              arcY: arcSpread,
            });
          }
        }
      }
      return;
    }
    const art = id ? game.skillArt[id] : null;
    for (const m of targets) {
      for (let h = 0; h < (d?.hits ?? 1); h++) {
        if (m.state === "die1" || m.state === "dead") break;
        const r = CombatSystem.rollDamage(game, pct, m);
        CombatSystem.damageMob(game, m, r.dmg, r.miss, r.critical);
      }
      if (game.buffs["4111002"]) {
        const shadowPct = Math.round(pct * 0.5);
        for (let h = 0; h < (d?.hits ?? 1); h++) {
          if (m.state === "die1" || m.state === "dead") break;
          const r = CombatSystem.rollDamage(game, shadowPct, m);
          if (Math.random() < 0.18) r.miss = true;
          CombatSystem.damageMob(game, m, r.dmg, r.miss, r.critical);
        }
      }
      if (art?.hit.length) game.fx.push({ frames: art.hit, x: m.x, y: m.y - 25, flip: p.face === 1, t: 0 });
    }
  }

  static damageMob(game: Game, m: Mob, dmg: number, miss: boolean, critical = false) {
    if (!m || !m.data) return;
    if (game.oneHitKill) {
      dmg = 9999999;
      miss = false;
      critical = true;
    }
    const box = game.mobBox(m);
    const stack = game.dmg.filter((d) => !d.hurt && Math.abs(d.x - m.x) < 30 && d.t < 0.4).length;
    const dmgY = box.y0 - 6 - stack * 30;
    game.dmg.push({ value: dmg, miss, hurt: false, critical, skinId: game.damageSkin, x: m.x, y: dmgY, t: 0 });

    if (game.ws && game.ws.readyState === WebSocket.OPEN) {
      game.ws.send(JSON.stringify({
        t: "damage",
        value: dmg,
        miss,
        hurt: false,
        critical,
        skinId: game.damageSkin,
        x: Math.round(m.x),
        y: Math.round(dmgY),
      }));
    }
    if (miss) return;
    m.hp -= dmg;
    m.hpShow = 4;
    m.aggro = 6;
    m.dir = game.p.x < m.x ? -1 : 1;
    if (m.hp <= 0) {
      m.state = "die1"; m.anim = 0; m.frame = 0;
      if (m.boss) { game.endBoss(true); return; }
      const exp = Math.max(1, Math.round((m.data.meta?.exp ?? 5) * m.mul.exp * (1 + game.gt.exp / 100)));
      CombatSystem.gainExp(game, exp);
      if (game.partyId && game.ws && game.ws.readyState === WebSocket.OPEN) {
        game.ws.send(JSON.stringify({
          t: "party_exp",
          partyId: game.partyId,
          exp,
          mobName: m.data.meta?.name || "Monster",
        }));
      }
      if (game.stage.kills < STAGE_KILLS) {
        game.stage.kills++;
        if (game.stage.kills === STAGE_KILLS) game.onChat("notice", `Stage ${game.stage.n} boss is ready! Press the BOSS button${game.auto.boss ? " (Auto Boss will challenge it for you)" : ""}.`);
      }
      const id = game.idle;
      id.expPerKill = id.expPerKill * 0.9 + exp * 0.1;
      if (game.auto.battle) id.autoKills++;
      const dropMul = 1 + game.gt.drop / 100, mat = MOB_MAT[m.data.id];
      if (mat && Math.random() < 0.45 * dropMul) game.spawnDrop({ mat }, m.x + rand(-10, 10), m.y - 20, rand(-50, 50));
      if (Math.random() < 0.05 * dropMul) game.spawnDrop({ mat: ORES[Math.floor(Math.random() * Math.min(ORES.length, 2 + Math.floor(game.stage.n / 4)))] }, m.x, m.y - 20, rand(-50, 50), -420);
      if (Math.random() < 0.045 * dropMul) game.spawnDrop({ gear: makeGear(randomGearFor(game.stats.level, game.stats.classId)) }, m.x, m.y - 20, rand(-50, 50), -420);
      if (Math.random() < 0.14) {
        const pool = [2000000, 2000000, 2000000, 2000003, 2000003, 2000001, 2000002, 2000006];
        game.spawnDrop({ item: pool[Math.floor(Math.random() * pool.length)] }, m.x, m.y - 20, rand(-40, 40), -380);
      }
      if (Math.random() < 0.75) {
        const lv = m.data.meta?.level ?? 5, amt = Math.round(rand(lv * 1.5, lv * 3.5) * m.mul.meso * (1 + game.gt.meso / 100));
        game.idle.mesoPerKill = game.idle.mesoPerKill * 0.9 + amt * 0.75 * 0.1;
        game.spawnDrop({ amount: amt }, m.x, m.y - 20, rand(-40, 40), -380);
      }
    } else {
      if (!m.boss || Math.random() < 0.12) {
        m.state = "hit1"; m.t = m.boss ? 0.25 : 0.5; m.anim = 0; m.frame = 0; m.attacking = undefined;
        if (m.fh && !m.boss) groundMove(game.tree, m, game.p.face * 14, true);
      }
    }
  }

  static gainExp(game: Game, n: number) {
    const s = game.stats;
    s.exp += n;
    game.onGain("exp", `You have gained experience (+${n})`);
    while (s.exp >= expToLevel(s.level)) {
      s.exp -= expToLevel(s.level);
      s.level++;
      const oldJob = s.job;
      s.baseHp += Math.round(rand(18, 22)); s.baseMp += Math.round(rand(4, 6));
      s.ap += 5; s.sp += 3;
      game.recalc();
      s.hp = s.maxHp; s.mp = s.maxMp;
      if (game.auto.ap) game.autoAssign();
      else game.onChat("notice", `You have ${s.ap} Ability Points and ${s.sp} Skill Points. Press S and K to spend them.`);
      if (s.job !== oldJob) game.onChat("level", `You have advanced to ${s.job}! New skills are available in the Skill window (K).`);
      game.onChange();
      game.fx.push({ frames: game.fxData.levelUp, x: game.p.x, y: game.p.y, flip: false, t: 0, follow: true });
      game.onGain("level", `Congratulations! You have reached Level ${s.level}.`);
      if (s.level >= 10 && s.classId === "beginner") {
        game.onJobAdvancementReady?.(1);
        game.onChat("notice", "★ 1st Job Advancement available! Choose your path: Warrior, Magician, Bowman, or Thief!");
      } else if (s.level >= 30 && game.canAdvanceJob(2)) {
        game.onJobAdvancementReady?.(2);
      } else if (s.level >= 60 && game.canAdvanceJob(3)) {
        game.onJobAdvancementReady?.(3);
      }
    }
  }

  static checkMobContact(game: Game) {
    const p = game.p;
    if (p.invuln > 0 || game.godMode || game.gmHide || game.hasWizetHat()) return;
    for (const m of game.mobs) {
      if (m.state === "die1" || m.state === "dead" || m.alpha < 1) continue;
      const b = game.mobBox(m);
      if (p.x + 12 > b.x0 && p.x - 12 < b.x1 && p.y > b.y0 + 6 && p.y - 60 < b.y1) {
        const dmg = CombatSystem.hurtAmount(game, m.atk);
        game.stats.hp = Math.max(0, game.stats.hp - dmg);
        const hurtY = p.y - 75;
        game.dmg.push({ value: dmg, miss: false, hurt: true, critical: false, x: p.x, y: hurtY, t: 0 });
        if (game.ws && game.ws.readyState === WebSocket.OPEN) {
          game.ws.send(JSON.stringify({
            t: "damage",
            value: dmg,
            miss: false,
            hurt: true,
            critical: false,
            x: Math.round(p.x),
            y: Math.round(hurtY),
          }));
        }
        p.invuln = 2; p.alert = 3;
        const away = p.x < m.x ? -1 : 1;
        p.ladder = null; p.fh = null; p.vx = away * 130; p.vy = -260; p.attack = 0;
        game.ai.ladderIntent = null;
        game.ai.ladderCooldown = 0.6;
        if (game.stats.hp <= 0) CombatSystem.die(game);
        return;
      }
    }
  }

  static hurtAmount(game: Game, atk: number): number {
    const reduce = (1 - game.lv("1000003") * 0.02) * (100 / (100 + game.gt.def));
    return Math.max(1, Math.round((atk * rand(0.8, 1.2) - game.stats.level * 0.5) * reduce));
  }

  static die(game: Game) {
    if (game.boss) game.endBoss(false);
    const s = game.stats;
    const lost = Math.floor(s.exp * 0.1);
    s.exp -= lost;
    s.hp = Math.round(s.maxHp * 0.5); s.mp = Math.round(s.maxMp * 0.5);
    game.onChat("notice", `You have been defeated and lost ${lost} EXP. Returning to the town spawn.`);
    game.loadMap(game.map.id, "spawn").then(() => { game.p.invuln = 3; });
  }

  static updateBuffs(game: Game, dt: number) {
    const s = game.stats, t = game.timers;
    let changed = false;
    for (const [id, b] of Object.entries(game.buffs)) {
      b.left -= dt;
      if (b.left <= 0) { delete game.buffs[id]; changed = true; }
    }
    if (changed) { game.recalc(); game.onChange(); }
    t.regen += dt;
    if (t.regen > 6) {
      t.regen = 0;
      s.hp = Math.min(s.maxHp, s.hp + 3 + Math.floor(s.level / 2));
      s.mp = Math.min(s.maxMp, s.mp + 3 + Math.floor(s.level / 2));
    }
    if (game.buffs["0001001"]) {
      t.recovery += dt;
      if (t.recovery > 2) {
        t.recovery = 0;
        s.hp = Math.min(s.maxHp, s.hp + 8 * game.lv("0001001"));
      }
    }
    const sr = game.lv("1110000");
    if (sr > 0) {
      t.self += dt;
      if (t.self > 4) {
        t.self = 0;
        s.hp = Math.min(s.maxHp, s.hp + 30 * sr);
        s.mp = Math.min(s.maxMp, s.mp + 10 * sr);
      }
    }
    game.potCd = Math.max(0, game.potCd - dt);
    if (game.potCd <= 0) {
      if (game.auto.hp && s.hp / s.maxHp * 100 < game.auto.hpPct) {
        for (const id of [2000000, 2000001, 2000002]) {
          if (CombatSystem.useAction(game, { t: "item", id }, true)) { game.potCd = 0.6; break; }
        }
      }
      if (game.potCd <= 0 && game.auto.mp && s.mp / s.maxMp * 100 < game.auto.mpPct) {
        for (const id of [2000003, 2000006]) {
          if (CombatSystem.useAction(game, { t: "item", id }, true)) { game.potCd = 0.6; break; }
        }
      }
    }
    if (game.auto.buff && game.p.attack <= 0 && !game.p.ladder) game.autoBuffHotbar();
  }

  static updateProjectiles(game: Game, dt: number) {
    for (const pr of game.projectiles) {
      pr.t += dt;
      if (pr.t < 0) continue;
      if (pr.target.state === "dead" || pr.target.state === "die1") {
        const next = game.liveMobs().sort((a, b) => Math.hypot(a.x - pr.x, a.y - pr.y) - Math.hypot(b.x - pr.x, b.y - pr.y))[0];
        if (next) pr.target = next;
      }
      const arcOffset = (pr.arcY ?? 0) * Math.sin(Math.min(1, pr.t * 3.5) * Math.PI);
      const tx = pr.target.x;
      const ty = pr.target.y - 25 + arcOffset;
      const dx = tx - pr.x, dy = ty - pr.y;
      const dist = Math.hypot(dx, dy);
      const speed = 720;
      const step = speed * dt;
      if (dist <= step || (dist < 22 && (pr.target.state === "dead" || pr.target.state === "die1"))) {
        if (pr.target?.data && pr.target.state !== "dead" && pr.target.state !== "die1") {
          CombatSystem.damageMob(game, pr.target, pr.dmg, pr.miss, pr.critical);
        }
        if (pr.skillId) {
          const art = game.skillArt[pr.skillId];
          if (art?.hit?.length) game.fx.push({ frames: art.hit, x: pr.target.x, y: pr.target.y - 25, flip: game.p.face === 1, t: 0 });
        }
        pr.t = 99;
      } else {
        pr.x += (dx / dist) * step;
        pr.y += (dy / dist) * step;
      }
    }
    game.projectiles = game.projectiles.filter((p) => p.t < 2);
  }
}
