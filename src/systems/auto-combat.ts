import type { Game } from "../game.ts";
import { FootholdTree, type Foothold } from "../physics.ts";
import { SKILL, SKILL_DEFS, type SkillDef } from "../skills.ts";
import { isRangedWeapon } from "../items.ts";
import { type Mob, BOSSES, FREE_MARKET_MAP } from "../game-types.ts";

export class AutoCombatSystem {
  public static isBoss(game: Game, m: Mob | null | undefined): boolean {
    if (!m) return false;
    if (game.boss === m) return true;
    if (m.boss) return true;
    if (m.data?.meta?.boss === 1 || m.data?.meta?.boss === true) return true;
    if (m.data?.id && BOSSES.includes(m.data.id)) return true;
    return false;
  }

  public static liveMobs(game: Game): Mob[] {
    return game.mobs.filter((m) => m.state !== "dead" && m.state !== "die1" && (m.alpha >= 0.35 || AutoCombatSystem.isBoss(game, m)));
  }

  public static hotbarSkills(game: Game): SkillDef[] {
    const ids = new Set<string>();
    let hasQuickSkills = false;
    for (const a of Object.values(game.quick)) {
      if (a?.t === "skill") {
        hasQuickSkills = true;
        if (game.isActionAuto(a)) ids.add(a.id);
      }
    }
    if (!hasQuickSkills) {
      for (const [id, lv] of Object.entries(game.skillLv)) {
        if (lv > 0 && !game.auto.disabledSkills?.[id]) ids.add(id);
      }
    }
    return SKILL_DEFS.filter((d) => ids.has(d.id) && game.lv(d.id) > 0 && game.skillEligible(d.id));
  }

  public static findBestSkillAttack(game: Game, preferredDir: -1 | 1): { id: string | null; range: number; face: -1 | 1; hitCount: number; score: number } {
    const s = game.stats, p = game.p;
    const [lo, hi] = game.damageRange();
    const avgBase = (lo + hi) / 2;
    const wepId = game.eq.weapon?.id ?? 1302000;
    const wepIsRanged = isRangedWeapon(wepId);
    const basicRange = wepIsRanged ? 360 : 90;
    const candidates: Array<{ d: SkillDef | null; lv: number; mp: number; range: number; targets: number; hits: number; dmgPct: number }> = [];

    for (const d of AutoCombatSystem.hotbarSkills(game)) {
      if (d.kind !== "attack" && d.kind !== "ranged") continue;
      if (game.skillCd[d.id]?.left > 0) continue;
      const lv = game.lv(d.id);
      const mp = d.mp(lv);
      if (!game.infiniteMp && s.mp < mp) continue;
      candidates.push({
        d,
        lv,
        mp,
        range: d.range ?? basicRange,
        targets: d.targets ?? 1,
        hits: d.hits ?? 1,
        dmgPct: d.dmg ? d.dmg(lv) : 100,
      });
    }

    if (Object.values(game.quick).some((a) => a?.t === "attack" && game.isActionAuto(a)) || candidates.length === 0) {
      candidates.push({
        d: null,
        lv: 1,
        mp: 0,
        range: basicRange,
        targets: 1,
        hits: 1,
        dmgPct: 100,
      });
    }

    const mobs = AutoCombatSystem.liveMobs(game);
    let best = { id: candidates[0]?.d?.id ?? null, range: candidates[0]?.range ?? basicRange, face: preferredDir, hitCount: 0, score: -1 };
    const directions: Array<-1 | 1> = [preferredDir, preferredDir === 1 ? -1 : 1];

    for (const dir of directions) {
      for (const cand of candidates) {
        const range = cand.range;
        const isRanged = cand.d ? cand.d.kind === "ranged" : wepIsRanged;
        const x0 = dir === 1 ? p.x - 15 : p.x - range;
        const x1 = dir === 1 ? p.x + range : p.x + 15;
        const y0 = p.y - (cand.d || isRanged ? 105 : 80);
        const y1 = p.y + 45;

        const inAoE = mobs.filter((m) => {
          const b = game.mobBox(m);
          return b.x1 > x0 && b.x0 < x1 && b.y1 > y0 && b.y0 < y1;
        });

        inAoE.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
        const hitMobs = inAoE.slice(0, cand.targets);
        const hitCount = hitMobs.length;

        const expectedDmg = avgBase * (cand.dmgPct / 100) * cand.hits;
        let kills = 0;
        let totalDmg = 0;
        for (const m of hitMobs) {
          totalDmg += Math.min(m.hp, expectedDmg);
          if (m.hp <= expectedDmg) kills++;
        }

        const hitsBoss = hitMobs.some((m) => AutoCombatSystem.isBoss(game, m));
        const dirBonus = dir === preferredDir ? 15 : 0;
        let score = 0;
        if (hitCount > 0) {
          score = (hitCount * 250) + (kills * 400) + (totalDmg * 0.1) - (cand.mp * 0.2) + dirBonus + (hitsBoss ? 50000 : 0);
        } else {
          score = (cand.targets * 15) + (expectedDmg * 0.05) + (range * 0.05) - (cand.mp * 0.1) + dirBonus;
        }

        if (score > best.score) {
          best = {
            id: cand.d ? cand.d.id : null,
            range,
            face: dir,
            hitCount,
            score,
          };
        }
      }
    }

    return best;
  }

  public static autoBuffHotbar(game: Game) {
    for (const d of AutoCombatSystem.hotbarSkills(game)) {
      if (d.kind !== "buff") continue;
      if (game.skillCd[d.id]?.left > 0) continue;
      const b = game.buffs[d.id];
      const mpCost = d.mp(game.lv(d.id));
      if ((!b || b.left < 3) && (game.infiniteMp || game.stats.mp >= mpCost)) {
        game.useAction({ t: "skill", id: d.id }, true);
        break;
      }
    }
  }

  public static platformBounds(tree: FootholdTree, fh: Foothold | null): { minX: number; maxX: number; leftWall: boolean; rightWall: boolean; y: number } {
    if (!fh) return { minX: -999999, maxX: 999999, leftWall: false, rightWall: false, y: 0 };
    let curr = fh;
    let minX = curr.x1;
    let leftWall = false;
    let guard = 0;
    while (curr.prev && guard++ < 32) {
      const prev = tree.byId.get(curr.prev);
      if (!prev) break;
      if (prev.x1 === prev.x2) {
        if (prev.y1 > prev.y2 && (prev.y1 - prev.y2) > 75) leftWall = true;
        break;
      }
      curr = prev;
      minX = curr.x1;
    }
    curr = fh;
    let maxX = curr.x2;
    let rightWall = false;
    guard = 0;
    while (curr.next && guard++ < 32) {
      const next = tree.byId.get(curr.next);
      if (!next) break;
      if (next.x1 === next.x2) {
        if (next.y2 < next.y1 && (next.y1 - next.y2) > 75) rightWall = true;
        break;
      }
      curr = next;
      maxX = curr.x2;
    }
    return { minX, maxX, leftWall, rightWall, y: (fh.y1 + fh.y2) / 2 };
  }

  public static isWallBlocking(tree: FootholdTree, x: number, y: number, dir: -1 | 1): boolean {
    for (const w of tree.walls) {
      const dx = (w.x1 - x) * dir;
      if (dx >= 0 && dx <= 25) {
        const top = Math.min(w.y1, w.y2);
        const bot = Math.max(w.y1, w.y2);
        if (y >= top && y <= bot + 20) {
          if (y - top > 75) return true;
        }
      }
    }
    return false;
  }

  private static tryAttack(game: Game, skillId: string | null, face: -1 | 1): boolean {
    game.p.face = face;
    if (game.startAttack(skillId, true)) return true;
    if (skillId !== null && game.startAttack(null, true)) return true;
    return false;
  }

  public static update(game: Game, dt: number) {
    const ai = game.ai, p = game.p, tree = game.tree;
    ai.keys.clear();

    const manualMove = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Left", "Right", "Up", "Down", "a", "A", "d", "D", "w", "W", "s", "S", "Alt", " ", "Space"].some(
      (k) => game.keys.has(k) || game.pressed.has(k)
    );
    const manualHoriz = ["ArrowLeft", "ArrowRight", "Left", "Right", "a", "A", "d", "D"].some(
      (k) => game.keys.has(k) || game.pressed.has(k)
    );

    if (manualMove) {
      // Immediately cancel any AI-initiated attack lock so player movement / jumping is instant
      if (p.aiAttack && p.attack > 0) {
        if (!p.hitDone) {
          p.hitDone = true;
          game.resolveAttack(p.skill);
        }
        p.attack = 0;
        p.aiAttack = false;
      }
      // If AI had grabbed a ladder/rope and player presses Left/Right, release ladder immediately
      if (ai.ladderIntent !== null && p.ladder && manualHoriz) {
        p.ladder = null;
      }
      ai.hold = 0.45;
      ai.retreatTime = 0;
      ai.ladderIntent = null;
      ai.ladderTopStuckTimer = 0;
    }

    if (!game.auto.battle || game.map?.id === FREE_MARKET_MAP) {
      ai.pressed.clear();
      ai.retreatTime = 0;
      ai.ladderIntent = null;
      ai.ladderTopStuckTimer = 0;
      return;
    }

    ai.hold = Math.max(0, ai.hold - dt);
    ai.jumpCooldown = Math.max(0, ai.jumpCooldown - dt);
    if (ai.hold > 0 || p.attack > 0) return;
    if (game.auto.loot) ai.keys.add("z");
    for (const [m, t] of ai.ban) if (t < game.time) ai.ban.delete(m);

    // Retreating state
    if (ai.retreatTime > 0) {
      ai.retreatTime -= dt;
      ai.keys.add(ai.retreatDir > 0 ? "ArrowRight" : "ArrowLeft");
      if (ai.jumpCooldown <= 0 && ai.retreatTime < 0.4) {
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.35;
      }
      return;
    }

    ai.think -= dt;
    const allAlive = AutoCombatSystem.liveMobs(game);
    const currentPlat = p.fh ? AutoCombatSystem.platformBounds(tree, p.fh) : null;

    // Check for active boss monster
    const activeBoss = (game.boss && game.boss.state !== "dead" && game.boss.state !== "die1")
      ? game.boss
      : allAlive.find((m) => AutoCombatSystem.isBoss(game, m));

    if (activeBoss) {
      ai.ban.delete(activeBoss);
      if (ai.target !== activeBoss) {
        ai.target = activeBoss;
        ai.stuck = 0;
      }
      ai.think = 0.5;
    } else if (allAlive.length > 0) {
      let alive = allAlive.filter((m) => !ai.ban.has(m));
      if (alive.length === 0) {
        ai.ban.clear();
        alive = allAlive;
      }

      // Target Selection: prioritize current platform mobs, then closest across entire map with elevation awareness
      const shouldRetarget = !p.ladder && (!ai.target || ai.target.state === "dead" || ai.target.state === "die1" || ai.think <= 0);
      const targetDeadOnLadder = p.ladder && (!ai.target || ai.target.state === "dead" || ai.target.state === "die1");
      if (shouldRetarget || targetDeadOnLadder) {
        ai.think = 0.35;
        let pool = alive;
        if (currentPlat) {
          const onCurrentPlat = alive.filter(
            (m) => m.x >= currentPlat.minX - 20 && m.x <= currentPlat.maxX + 20 && Math.abs(m.y - p.y) < 55
          );
          if (onCurrentPlat.length > 0) pool = onCurrentPlat;
        }

        let best: Mob | null = null, bs = Infinity;
        for (const m of pool) {
          const mdx = Math.abs(m.x - p.x);
          const mdy = m.y - p.y;
          const absMdy = Math.abs(mdy);

          let sc = mdx;
          if (absMdy < 65) {
            // Same floor or close platform elevation: lowest vertical penalty
            sc += absMdy * 0.8;
          } else if (mdy > 0) {
            // Target is below the player
            const belowFh = tree.below(p.x, p.y + 4, p.fh?.id);
            if (belowFh) {
              sc += absMdy * 1.5 + 60;
            } else {
              const hasLadderDown = currentPlat && game.map.ladders.some(
                (L) => L.y2 > p.y + 20 && Math.abs(L.y1 - p.y) < 45 && L.x >= currentPlat.minX - 35 && L.x <= currentPlat.maxX + 35
              );
              sc += absMdy * 2.8 + (hasLadderDown ? 140 : 450);
            }
          } else {
            // Target is above the player
            const canJumpUp = currentPlat && tree.floors.some((f) => {
              if (f.id === p.fh?.id) return false;
              const fy = (f.y1 + f.y2) / 2;
              const delta = fy - p.y;
              return delta < -15 && delta > -115 && Math.max(currentPlat.minX - 35, f.x1 - 35) <= Math.min(currentPlat.maxX + 35, f.x2 + 35);
            });
            const hasLadderUp = currentPlat && game.map.ladders.some(
              (L) => L.y1 < p.y - 15 && p.y >= L.y1 - 10 && p.y <= L.y2 + 80 && L.x >= currentPlat.minX - 35 && L.x <= currentPlat.maxX + 35
            );
            if (canJumpUp) {
              sc += absMdy * 1.8 + 80;
            } else if (hasLadderUp) {
              sc += absMdy * 2.2 + 120;
            } else {
              // No direct ascension path from here: penalize heavily so accessible floor mobs are cleared first!
              sc += absMdy * 4.2 + 550;
            }
          }

          if (sc < bs) { bs = sc; best = m; }
        }
        if (best !== ai.target) {
          ai.stuck = 0;
          ai.targetTimer = 0;
          ai.targetJumps = 0;
        }
        ai.target = best;
      }
    } else {
      ai.target = null;
    }

    // Target and Goal determination
    const t = (ai.target && ai.target.state !== "dead" && ai.target.state !== "die1") ? ai.target : null;
    const isTargetBoss = AutoCombatSystem.isBoss(game, t);
    const drop = (game.auto.loot && !isTargetBoss)
      ? game.drops.find((d) => !d.picked && d.fh && Math.abs(d.y - p.y) < 40 && Math.abs(d.x - p.x) < 220)
      : null;
    const nearMob = t && Math.abs(t.x - p.x) < 140 && Math.abs(t.y - p.y) < 60;
    const isLooting = Boolean(drop && !nearMob);
    const goal = isLooting && drop ? { x: drop.x, y: drop.y } : t ? { x: t.x, y: t.y } : null;

    if (!goal) {
      // If all mobs are currently respawning, gently patrol toward map center so character never freezes
      if (p.fh && game.mobs.length > 0) {
        const midX = (game.tree.minX + game.tree.maxX) / 2;
        if (Math.abs(p.x - midX) > 80) {
          ai.keys.add(midX > p.x ? "ArrowRight" : "ArrowLeft");
        }
      }
      return;
    }

    const dx = goal.x - p.x, dy = goal.y - p.y;
    const dir = (dx >= 0 ? 1 : -1) as -1 | 1;
    const mobDx = t ? t.x - p.x : dx;
    const mobDy = t ? t.y - p.y : dy;
    const mobDir = (mobDx >= 0 ? 1 : -1) as -1 | 1;

    // Target frustration / unreachable timeout:
    // If we've been struggling to reach a non-boss mob for > 3.5s or jumped >= 3 times towards it without landing a hit
    if (t) {
      ai.targetTimer = (ai.targetTimer || 0) + dt;
      if (!isTargetBoss && (ai.targetTimer > 3.5 || (ai.targetJumps || 0) >= 3)) {
        if (allAlive.filter((m) => !ai.ban.has(m) && m !== t).length > 0) {
          ai.ban.set(t, game.time + 7);
          ai.target = null;
          ai.targetTimer = 0;
          ai.targetJumps = 0;
          ai.stuck = 0;
          ai.jumpLoopCount = 0;
          ai.retreatTime = 0.6;
          ai.retreatDir = -dir as -1 | 1;
          return;
        }
      }
    } else {
      ai.targetTimer = 0;
      ai.targetJumps = 0;
    }

    // Instant attack trigger whenever any live mob is inside the attack hitbox
    const bestCombat = AutoCombatSystem.findBestSkillAttack(game, mobDir);
    if (bestCombat.hitCount > 0 && !p.ladder) {
      if (!isTargetBoss || Math.abs(mobDx) <= bestCombat.range * 1.1) {
        if (AutoCombatSystem.tryAttack(game, bestCombat.id, bestCombat.face)) {
          ai.targetTimer = 0;
          ai.targetJumps = 0;
          ai.jumpLoopCount = 0;
          ai.stuck = 0;
          return;
        }
      }
    }

    // Bounded jump loop detection across the platform
    if (p.fh && ai.lastJumpTime > 0 && game.time - ai.lastJumpTime > 0.22) {
      const landedOnSamePlat = p.fh.id === ai.lastJumpFhId || (currentPlat && p.x >= currentPlat.minX - 25 && p.x <= currentPlat.maxX + 25 && Math.abs(p.y - ai.lastJumpY) < 30);
      if (landedOnSamePlat) {
        ai.jumpLoopCount = (ai.jumpLoopCount || 0) + 1;
        if (ai.jumpLoopCount >= 2) {
          if (t && !AutoCombatSystem.isBoss(game, t) && allAlive.filter((m) => !ai.ban.has(m) && m !== t).length > 0) {
            ai.ban.set(t, game.time + 6);
            ai.target = null;
          }
          ai.jumpLoopCount = 0;
          ai.stuck = 0;
          ai.targetTimer = 0;
          ai.targetJumps = 0;
          ai.retreatTime = 0.85;
          ai.retreatDir = (currentPlat && p.x < (currentPlat.minX + currentPlat.maxX) / 2 ? 1 : -1) as -1 | 1;
          ai.lastJumpTime = 0;
          return;
        }
      } else {
        ai.jumpLoopCount = 0;
      }
      ai.lastJumpTime = 0;
    }

    // Ground reset
    if (p.fh) {
      ai.ladderIntent = null;
      ai.ladderTopStuckTimer = 0;
    }

    // Stuck detection
    if (Math.abs(p.x - ai.lastX) < 1.5 && !p.ladder) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt * 2);
    ai.lastX = p.x;
    if (ai.stuck > 1.6) {
      if (t && !AutoCombatSystem.isBoss(game, t) && allAlive.filter((m) => !ai.ban.has(m) && m !== t).length > 0) {
        ai.ban.set(t, game.time + 4);
        ai.target = null;
      }
      ai.stuck = 0;
      ai.targetTimer = 0;
      ai.targetJumps = 0;
      ai.retreatTime = 0.7;
      ai.retreatDir = -dir as -1 | 1;
      return;
    }

    if (ai.ladderCooldown > 0) ai.ladderCooldown -= dt;

    // Ladders & ropes climbing
    if (p.ladder) {
      const L = p.ladder;
      ai.ladderTimeout = Math.max(0, ai.ladderTimeout - dt);

      if (!ai.ladderIntent) {
        ai.ladderIntent = dy < 0 ? "up" : "down";
        ai.ladderTimeout = 5.0;
      }

      if (ai.ladderTimeout <= 0) {
        ai.keys.add(dx >= 0 ? "ArrowRight" : "ArrowLeft");
        ai.pressed.add(" ");
        ai.ladderCooldown = 0.8;
        ai.ladderIntent = null;
        ai.ladderTopStuckTimer = 0;
        return;
      }

      if (ai.ladderIntent === "up") {
        ai.keys.add("ArrowUp");
        if (p.y <= L.y1 + 8) {
          ai.ladderTopStuckTimer += dt;
          ai.keys.add("ArrowUp");
          ai.keys.add(dx >= 0 ? "ArrowRight" : "ArrowLeft");

          if (p.y <= L.y1 + 2 && ai.ladderTopStuckTimer > 0.22) {
            ai.pressed.add(" ");
            ai.ladderCooldown = 0.5;
            ai.ladderIntent = null;
            ai.ladderTopStuckTimer = 0;
          }
        } else {
          ai.ladderTopStuckTimer = 0;
        }
      } else {
        ai.keys.add("ArrowDown");
        if (p.y >= L.y2 - 8) {
          ai.keys.add("ArrowDown");
          ai.keys.add(dx >= 0 ? "ArrowRight" : "ArrowLeft");
        }
      }
      return;
    }

    // Airborne handling
    if (!p.fh) {
      if (Math.abs(dx) > 8) ai.keys.add(dir > 0 ? "ArrowRight" : "ArrowLeft");

      if (ai.ladderCooldown <= 0) {
        const airLadder = game.map.ladders.find(
          (L) => Math.abs(L.x - p.x) < 25 && p.y > L.y1 - 15 && p.y < L.y2 + 25 && ((dy < -10 && L.y1 < p.y) || (dy > 10 && L.y2 > p.y))
        );
        if (airLadder) {
          const intent = dy < 0 ? "up" : "down";
          ai.keys.add(intent === "up" ? "ArrowUp" : "ArrowDown");
          ai.ladderIntent = intent;
          ai.ladderTimeout = 5.0;
          return;
        }
      }

      if (p.coyote > 0 && ai.jumpCooldown <= 0) {
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.35;
        ai.lastJumpX = p.x;
        ai.lastJumpFhId = 0;
        ai.lastJumpTime = game.time;
        ai.targetJumps = (ai.targetJumps || 0) + 1;
        return;
      }

      if (!p.leapt && p.airTime >= 0.08 && (Math.abs(dx) > 35 || dy < -15)) {
        ai.pressed.add(" ");
      }
      return;
    }

    // Platform navigation
    const plat = currentPlat ?? AutoCombatSystem.platformBounds(tree, p.fh);

    // If walking to pick up a loot drop on this platform, walk all the way onto the drop
    if (isLooting && drop) {
      ai.keys.add("z");
      if (Math.abs(dx) > 12) {
        ai.keys.add(dir > 0 ? "ArrowRight" : "ArrowLeft");
      }
      return;
    }

    const onSamePlat = Boolean(t && t.x >= plat.minX - 20 && t.x <= plat.maxX + 20 && Math.abs(mobDy) < 55);

    if (onSamePlat && t) {
      const closeEnoughToHit = bestCombat.hitCount > 0 || (Math.abs(mobDx) <= Math.min(55, bestCombat.range * 0.75) && Math.abs(mobDy) <= 35);
      if (closeEnoughToHit) {
        if (AutoCombatSystem.tryAttack(game, bestCombat.id, mobDir)) {
          ai.targetTimer = 0;
          ai.targetJumps = 0;
          ai.jumpLoopCount = 0;
          ai.stuck = 0;
          return;
        }
      }
      ai.keys.add(mobDir > 0 ? "ArrowRight" : "ArrowLeft");
      if (ai.stuck > 0.6 && !AutoCombatSystem.isWallBlocking(tree, p.x, p.y, mobDir) && ai.jumpCooldown <= 0) {
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.45;
        ai.lastJumpX = p.x;
        ai.lastJumpY = p.y;
        ai.lastJumpFhId = p.fh?.id ?? 0;
        ai.lastJumpTime = game.time;
        ai.targetJumps = (ai.targetJumps || 0) + 1;
      }
      return;
    }

    // Target is NOT on the same platform
    // 1. Target is BELOW the player (dy > 20)
    if (dy > 20) {
      const below = tree.below(p.x, p.y + 4, p.fh.id);
      if (below && FootholdTree.yAt(below, p.x) - p.y < 550) {
        ai.keys.add("ArrowDown");
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.35;
        if (Math.abs(dx) > 15) ai.keys.add(dir > 0 ? "ArrowRight" : "ArrowLeft");
        return;
      }

      const ladderDown = game.map.ladders
        .filter((L) => L.y2 > p.y + 20 && Math.abs(L.y1 - p.y) < 45 && L.x >= plat.minX - 35 && L.x <= plat.maxX + 35)
        .sort((a, b) => {
          const scoreA = Math.abs(a.x - p.x) + Math.abs(a.x - goal.x);
          const scoreB = Math.abs(b.x - p.x) + Math.abs(b.x - goal.x);
          return scoreA - scoreB;
        })[0];

      if (ladderDown && ai.ladderCooldown <= 0) {
        const dist = ladderDown.x - p.x;
        if (Math.abs(dist) > 12) {
          ai.keys.add(dist > 0 ? "ArrowRight" : "ArrowLeft");
        } else {
          ai.keys.add("ArrowDown");
          if (Math.abs(dist) > 3) ai.keys.add(dist > 0 ? "ArrowRight" : "ArrowLeft");
          ai.ladderIntent = "down";
          ai.ladderTimeout = 5.0;
        }
        return;
      }
    }

    // 2. Target is ABOVE the player (dy < -20)
    if (dy < -20) {
      const accessibleLadder = game.map.ladders
        .filter((L) => {
          if (L.y1 >= p.y - 15) return false;
          if (p.y < L.y1 - 10 || p.y > L.y2 + 80) return false;
          return L.x >= plat.minX - 35 && L.x <= plat.maxX + 35;
        })
        .sort((a, b) => {
          const scoreA = Math.abs(a.x - p.x) + Math.abs(a.x - goal.x) * 1.2 + Math.abs(a.y1 - goal.y);
          const scoreB = Math.abs(b.x - p.x) + Math.abs(b.x - goal.x) * 1.2 + Math.abs(b.y1 - goal.y);
          return scoreA - scoreB;
        })[0];

      if (accessibleLadder && ai.ladderCooldown <= 0) {
        const dist = accessibleLadder.x - p.x;
        if (Math.abs(dist) > 12) {
          ai.keys.add(dist > 0 ? "ArrowRight" : "ArrowLeft");
        }
        if (Math.abs(dist) <= 22) {
          ai.keys.add("ArrowUp");
          ai.ladderIntent = "up";
          ai.ladderTimeout = 5.0;
          if (p.y > accessibleLadder.y2 + 18 && ai.jumpCooldown <= 0) {
            ai.pressed.add(" ");
            ai.jumpCooldown = 0.35;
            ai.lastJumpX = p.x;
            ai.lastJumpY = p.y;
            ai.lastJumpFhId = p.fh?.id ?? 0;
            ai.lastJumpTime = game.time;
            ai.targetJumps = (ai.targetJumps || 0) + 1;
          }
        }
        return;
      }

      const overhead = tree.floors
        .filter((f) => {
          if (f.id === p.fh?.id) return false;
          const fy = (f.y1 + f.y2) / 2;
          const deltaY = fy - p.y;
          if (deltaY > -15 || deltaY < -120) return false;
          const minOverlap = Math.max(plat.minX - 45, f.x1 - 45);
          const maxOverlap = Math.min(plat.maxX + 45, f.x2 + 45);
          return minOverlap <= maxOverlap;
        })
        .sort((a, b) => {
          const ay = (a.y1 + a.y2) / 2, by = (b.y1 + b.y2) / 2;
          return Math.abs(ay - goal.y) - Math.abs(by - goal.y);
        })[0];

      if (overhead) {
        const midOverhead = (overhead.x1 + overhead.x2) / 2;
        const clampedMin = Math.min(overhead.x1 + 15, midOverhead);
        const clampedMax = Math.max(overhead.x2 - 15, midOverhead);
        const landingX = Math.max(clampedMin, Math.min(clampedMax, p.x + (dx >= 0 ? 35 : -35)));
        const distToLanding = landingX - p.x;
        if (Math.abs(distToLanding) > 12) {
          ai.keys.add(distToLanding > 0 ? "ArrowRight" : "ArrowLeft");
        } else {
          ai.keys.add(dir > 0 ? "ArrowRight" : "ArrowLeft");
        }
        if (p.x >= overhead.x1 - 40 && p.x <= overhead.x2 + 40 && ai.jumpCooldown <= 0) {
          ai.pressed.add(" ");
          ai.jumpCooldown = 0.35;
          ai.lastJumpX = p.x;
          ai.lastJumpY = p.y;
          ai.lastJumpFhId = p.fh?.id ?? 0;
          ai.lastJumpTime = game.time;
          ai.targetJumps = (ai.targetJumps || 0) + 1;
        }
        return;
      }

      // 3. If no ladder or reachable overhead on this platform, navigate toward nearest ladder in the map that goes UP
      const anyLadderUp = game.map.ladders
        .filter((L) => L.y1 < p.y - 20 && p.y >= L.y1 - 10 && p.y <= L.y2 + 85)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (anyLadderUp) {
        const distToLadder = anyLadderUp.x - p.x;
        if (Math.abs(distToLadder) > 12) {
          ai.keys.add(distToLadder > 0 ? "ArrowRight" : "ArrowLeft");
          const canBridgeGap = !((distToLadder > 0 && plat.rightWall) || (distToLadder < 0 && plat.leftWall));
          if (canBridgeGap && ai.jumpCooldown <= 0 && ((distToLadder > 0 && p.x >= plat.maxX - 14) || (distToLadder < 0 && p.x <= plat.minX + 14) || ai.stuck > 0.6)) {
            ai.pressed.add(" ");
            ai.jumpCooldown = 0.35;
            ai.lastJumpX = p.x;
            ai.lastJumpY = p.y;
            ai.lastJumpFhId = p.fh?.id ?? 0;
            ai.lastJumpTime = game.time;
            ai.targetJumps = (ai.targetJumps || 0) + 1;
          }
        } else {
          ai.keys.add("ArrowUp");
          ai.ladderIntent = "up";
          ai.ladderTimeout = 5.0;
          if (p.y > anyLadderUp.y2 + 18 && ai.jumpCooldown <= 0) {
            ai.pressed.add(" ");
            ai.jumpCooldown = 0.35;
            ai.lastJumpX = p.x;
            ai.lastJumpY = p.y;
            ai.lastJumpFhId = p.fh?.id ?? 0;
            ai.lastJumpTime = game.time;
            ai.targetJumps = (ai.targetJumps || 0) + 1;
          }
        }
        return;
      }
    }

    // If horizontally aligned with a target on another platform that can't be reached directly from here,
    // move toward the nearest platform edge or map center to drop/jump to another level instead of oscillating in place
    let moveDir = dir;
    if (Math.abs(dx) < 24 && Math.abs(dy) >= 20) {
      const distLeft = Math.abs(p.x - plat.minX);
      const distRight = Math.abs(plat.maxX - p.x);
      moveDir = (!plat.leftWall && distLeft <= distRight) ? -1 : 1;
    }

    // Default horizontal traversal across platform towards goal
    if (moveDir > 0) {
      if (AutoCombatSystem.isWallBlocking(tree, p.x, p.y, 1)) {
        if (t && !AutoCombatSystem.isBoss(game, t) && allAlive.filter((m) => !ai.ban.has(m) && m !== t).length > 0) {
          ai.ban.set(t, game.time + 5);
          ai.target = null;
        }
        ai.retreatTime = 0.8;
        ai.retreatDir = -1;
        return;
      }
      ai.keys.add("ArrowRight");
      const atEdge = p.x >= plat.maxX - 14;
      // If target is below and there's no wall, simply walking off the edge drops us down smoothly without jumping
      if (atEdge && dy > 20 && !plat.rightWall) {
        // Drop down by walking off the ledge
      } else if (!plat.rightWall && (atEdge || ai.stuck > 0.6) && ai.jumpCooldown <= 0) {
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.35;
        ai.lastJumpX = p.x;
        ai.lastJumpY = p.y;
        ai.lastJumpFhId = p.fh?.id ?? 0;
        ai.lastJumpTime = game.time;
        ai.targetJumps = (ai.targetJumps || 0) + 1;
      }
    } else {
      if (AutoCombatSystem.isWallBlocking(tree, p.x, p.y, -1)) {
        if (t && !AutoCombatSystem.isBoss(game, t) && allAlive.filter((m) => !ai.ban.has(m) && m !== t).length > 0) {
          ai.ban.set(t, game.time + 5);
          ai.target = null;
        }
        ai.retreatTime = 0.8;
        ai.retreatDir = 1;
        return;
      }
      ai.keys.add("ArrowLeft");
      const atEdge = p.x <= plat.minX + 14;
      if (atEdge && dy > 20 && !plat.leftWall) {
        // Drop down by walking off the ledge
      } else if (!plat.leftWall && (atEdge || ai.stuck > 0.6) && ai.jumpCooldown <= 0) {
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.35;
        ai.lastJumpX = p.x;
        ai.lastJumpY = p.y;
        ai.lastJumpFhId = p.fh?.id ?? 0;
        ai.lastJumpTime = game.time;
        ai.targetJumps = (ai.targetJumps || 0) + 1;
      }
    }
  }
}
