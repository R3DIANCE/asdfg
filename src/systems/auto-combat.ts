import type { Game } from "../game.ts";
import { FootholdTree, type Foothold } from "../physics.ts";
import { SKILL, SKILL_DEFS, type SkillDef } from "../skills.ts";
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
    return game.mobs.filter((m) => m.state !== "dead" && m.state !== "die1" && (m.alpha >= 1 || AutoCombatSystem.isBoss(game, m)));
  }

  public static hotbarSkills(game: Game): SkillDef[] {
    const ids = new Set<string>();
    for (const a of Object.values(game.quick)) {
      if (a?.t === "skill") ids.add(a.id);
    }
    return SKILL_DEFS.filter((d) => ids.has(d.id) && game.lv(d.id) > 0 && game.skillEligible(d.id));
  }

  public static findBestSkillAttack(game: Game, preferredDir: -1 | 1): { id: string | null; range: number; face: -1 | 1; hitCount: number; score: number } {
    const s = game.stats, p = game.p;
    const [lo, hi] = game.damageRange();
    const avgBase = (lo + hi) / 2;
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
        range: d.range ?? 90,
        targets: d.targets ?? 1,
        hits: d.hits ?? 1,
        dmgPct: d.dmg ? d.dmg(lv) : 100,
      });
    }

    if (Object.values(game.quick).some((a) => a?.t === "attack") || candidates.length === 0) {
      candidates.push({
        d: null,
        lv: 1,
        mp: 0,
        range: 85,
        targets: 1,
        hits: 1,
        dmgPct: 100,
      });
    }

    const mobs = AutoCombatSystem.liveMobs(game);
    let best = { id: candidates[0]?.d?.id ?? null, range: candidates[0]?.range ?? 85, face: preferredDir, hitCount: 0, score: -1 };
    const directions: Array<-1 | 1> = [preferredDir, preferredDir === 1 ? -1 : 1];

    for (const dir of directions) {
      for (const cand of candidates) {
        const range = cand.range;
        const x0 = dir === 1 ? p.x - 10 : p.x - range;
        const x1 = dir === 1 ? p.x + range : p.x + 10;
        const y0 = p.y - (cand.d ? 100 : 70);
        const y1 = p.y + 10;

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
      if ((!b || b.left < 3) && (game.infiniteMp || game.stats.mp >= d.mp(game.lv(d.id)) + 10)) {
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

  public static update(game: Game, dt: number) {
    const ai = game.ai, p = game.p, tree = game.tree;
    ai.keys.clear();

    const manualMove = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Left", "Right", "Up", "Down", "a", "A", "d", "D", "w", "W", "s", "S", "Alt", " ", "Space"].some(
      (k) => game.keys.has(k) || game.pressed.has(k)
    );
    const manualHoriz = ["ArrowLeft", "ArrowRight", "Left", "Right", "a", "A", "d", "D"].some(
      (k) => game.keys.has(k) || game.pressed.has(k)
    );
    const manualAct = ["c", "C", "x", "X", "z", "Z"].some((k) => game.keys.has(k) || game.pressed.has(k)) ||
      Object.keys(game.quick).some((k) => game.pressed.has(k) || game.keys.has(k));

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
      ai.hold = 1.5;
      ai.retreatTime = 0;
      ai.ladderIntent = null;
      ai.ladderTopStuckTimer = 0;
    } else if (manualAct) {
      ai.hold = 1.5;
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

    // Portal navigation if area boss is defeated
    if (game.areaBossDefeated) {
      const rightPortal = game.portals.find((pt) => pt.side === "right");
      if (rightPortal) {
        const pDist = rightPortal.x - p.x;
        const pDir = (pDist >= 0 ? "ArrowRight" : "ArrowLeft") as "ArrowRight" | "ArrowLeft";
        if (Math.abs(pDist) < 22 && Math.abs(rightPortal.y - p.y) < 30) {
          ai.keys.add("ArrowUp");
          return;
        }
        ai.keys.add(pDir);
        if (rightPortal.y < p.y - 40 && ai.jumpCooldown <= 0) {
          ai.keys.add("Alt");
          ai.jumpCooldown = 0.6;
        }
        return;
      }
    }

    ai.think -= dt;
    const allAlive = AutoCombatSystem.liveMobs(game);
    if (allAlive.length === 0) return;

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
    } else {
      let alive = allAlive.filter((m) => !ai.ban.has(m));
      if (alive.length === 0) {
        ai.ban.clear();
        alive = allAlive;
      }

      // Target Selection: prioritize current platform mobs, then closest across entire map
      const currentPlat = p.fh ? AutoCombatSystem.platformBounds(tree, p.fh) : null;
      const shouldRetarget = !p.ladder && (!ai.target || ai.target.state === "dead" || ai.target.state === "die1" || ai.think <= 0);
      const targetDeadOnLadder = p.ladder && (!ai.target || ai.target.state === "dead" || ai.target.state === "die1");
      if (shouldRetarget || targetDeadOnLadder) {
        ai.think = 0.35;
        let pool = alive;
        if (currentPlat) {
          const onCurrentPlat = alive.filter(
            (m) => m.x >= currentPlat.minX - 15 && m.x <= currentPlat.maxX + 15 && Math.abs(m.y - p.y) < 30
          );
          if (onCurrentPlat.length > 0) pool = onCurrentPlat;
        }

        let best: Mob | null = null, bs = Infinity;
        for (const m of pool) {
          const sc = Math.abs(m.x - p.x) + Math.abs(m.y - p.y) * 2.0;
          if (sc < bs) { bs = sc; best = m; }
        }
        if (best !== ai.target) ai.stuck = 0;
        ai.target = best;
      }
    }

    // Target and Goal determination
    const t = ai.target;
    const isTargetBoss = AutoCombatSystem.isBoss(game, t);
    const drop = (game.auto.loot && !isTargetBoss) ? game.drops.find((d) => !d.picked && d.fh && Math.abs(d.y - p.y) < 30 && Math.abs(d.x - p.x) < 220) : null;
    const near = t && Math.abs(t.x - p.x) < 140 && Math.abs(t.y - p.y) < 60;
    const goal = drop && !near ? { x: drop.x, y: drop.y } : t ? { x: t.x, y: t.y } : null;
    if (!goal) return;
    const dx = goal.x - p.x, dy = goal.y - p.y;
    const dir = (dx >= 0 ? 1 : -1) as -1 | 1;

    // Instant attack trigger: if boss is prioritized, sprint to it before pausing to attack
    const bestCombat = AutoCombatSystem.findBestSkillAttack(game, dir);
    if (bestCombat.hitCount > 0) {
      if (!isTargetBoss || Math.abs(dx) <= bestCombat.range * 1.1) {
        p.face = bestCombat.face;
        game.startAttack(bestCombat.id, true);
        return;
      }
    }

    // Jump loop detection
    if (p.fh && ai.lastJumpTime > 0 && game.time - ai.lastJumpTime > 0.28) {
      if (Math.abs(p.x - ai.lastJumpX) < 18 && Math.abs(p.y - ai.lastJumpY) < 15) {
        ai.jumpLoopCount++;
        if (ai.jumpLoopCount >= 2) {
          if (t && !AutoCombatSystem.isBoss(game, t) && allAlive.filter((m) => !ai.ban.has(m) && m !== t).length > 0) {
            ai.ban.set(t, game.time + 3);
            ai.target = null;
          }
          ai.jumpLoopCount = 0;
          ai.stuck = 0;
          ai.retreatTime = 0.8;
          ai.retreatDir = -dir as -1 | 1;
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
    if (ai.stuck > 2.5 && t) {
      if (!AutoCombatSystem.isBoss(game, t) && allAlive.filter((m) => !ai.ban.has(m) && m !== t).length > 0) {
        ai.ban.set(t, game.time + 3);
        ai.target = null;
      }
      ai.stuck = 0;
      ai.retreatTime = 0.8;
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
          (L) => Math.abs(L.x - p.x) < 25 && p.y > L.y1 - 10 && p.y < L.y2 + 10 && ((dy < -10 && L.y1 < p.y) || (dy > 10 && L.y2 > p.y))
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
        ai.lastJumpY = p.y;
        ai.lastJumpTime = game.time;
        return;
      }

      const jumpSkills = ["4001014", "4001011", "1001008", "3001007", "3000008", "5001010", "2001009"];
      const hasJumpSkill = jumpSkills.some((sid) => game.lv(sid) > 0);
      if (hasJumpSkill && !p.leapt && p.airTime >= 0.08 && (Math.abs(dx) > 35 || dy < -15)) {
        ai.pressed.add(" ");
      }
      return;
    }

    // Platform navigation
    const currentPlat = p.fh ? AutoCombatSystem.platformBounds(tree, p.fh) : null;
    const plat = currentPlat ?? AutoCombatSystem.platformBounds(tree, p.fh);
    const onSamePlat = t && (t.x >= plat.minX - 15 && t.x <= plat.maxX + 15 && Math.abs(t.y - p.y) < 30);

    if (onSamePlat || (t && Math.abs(dx) <= bestCombat.range * 0.9 && Math.abs(dy) < 25)) {
      if (Math.abs(dx) <= bestCombat.range * 0.9) {
        p.face = dir;
        game.startAttack(bestCombat.id, true);
        return;
      }
      ai.keys.add(dir > 0 ? "ArrowRight" : "ArrowLeft");
      if (ai.stuck > 0.8 && !AutoCombatSystem.isWallBlocking(tree, p.x, p.y, dir) && ai.jumpCooldown <= 0) {
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.45;
        ai.lastJumpX = p.x;
        ai.lastJumpY = p.y;
        ai.lastJumpTime = game.time;
      }
      return;
    }

    // Target is NOT on the same platform
    // 1. Target is BELOW the player (dy > 20)
    if (dy > 20) {
      const below = tree.below(p.x, p.y + 4, p.fh.id);
      if (below && FootholdTree.yAt(below, p.x) - p.y < 500) {
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
          if (p.y < L.y1 - 10 || p.y > L.y2 + 25) return false;
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
        }
        return;
      }

      const overhead = tree.floors
        .filter((f) => {
          if (f.id === p.fh?.id) return false;
          const fy = (f.y1 + f.y2) / 2;
          const deltaY = fy - p.y;
          if (deltaY > -15 || deltaY < -180) return false;
          const minOverlap = Math.max(plat.minX - 45, f.x1 - 45);
          const maxOverlap = Math.min(plat.maxX + 45, f.x2 + 45);
          return minOverlap <= maxOverlap;
        })
        .sort((a, b) => {
          const ay = (a.y1 + a.y2) / 2, by = (b.y1 + b.y2) / 2;
          return Math.abs(ay - goal.y) - Math.abs(by - goal.y);
        })[0];

      if (overhead) {
        const landingX = Math.max(overhead.x1 + 15, Math.min(overhead.x2 - 15, p.x + (dx >= 0 ? 35 : -35)));
        const distToLanding = landingX - p.x;
        if (Math.abs(distToLanding) > 15) {
          ai.keys.add(distToLanding > 0 ? "ArrowRight" : "ArrowLeft");
        }
        if (p.x >= overhead.x1 - 35 && p.x <= overhead.x2 + 35 && ai.jumpCooldown <= 0) {
          ai.pressed.add(" ");
          ai.jumpCooldown = 0.35;
          ai.lastJumpX = p.x;
          ai.lastJumpY = p.y;
          ai.lastJumpTime = game.time;
          return;
        }
      }

      // 3. If no ladder or overhead on this platform, navigate toward nearest ladder in the map that goes UP
      if (!accessibleLadder && !overhead) {
        const anyLadderUp = game.map.ladders
          .filter((L) => L.y1 < p.y - 20 && p.y >= L.y1 - 10 && p.y <= L.y2 + 25)
          .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
        if (anyLadderUp) {
          const distToLadder = anyLadderUp.x - p.x;
          if (Math.abs(distToLadder) > 10) {
            ai.keys.add(distToLadder > 0 ? "ArrowRight" : "ArrowLeft");
            if (ai.jumpCooldown <= 0 && ((distToLadder > 0 && p.x >= plat.maxX - 14) || (distToLadder < 0 && p.x <= plat.minX + 14) || ai.stuck > 0.8)) {
              ai.pressed.add(" ");
              ai.jumpCooldown = 0.35;
              ai.lastJumpX = p.x;
              ai.lastJumpY = p.y;
              ai.lastJumpTime = game.time;
            }
            return;
          }
        }
      }
    }

    // Default horizontal traversal across platform towards goal
    if (dir > 0) {
      if (AutoCombatSystem.isWallBlocking(tree, p.x, p.y, 1)) {
        if (t && !AutoCombatSystem.isBoss(game, t) && allAlive.filter((m) => !ai.ban.has(m) && m !== t).length > 0) {
          ai.ban.set(t, game.time + 3);
        }
        ai.retreatTime = 0.8;
        ai.retreatDir = -1;
        return;
      }
      ai.keys.add("ArrowRight");
      if ((p.x >= plat.maxX - 14 || ai.stuck > 0.8) && ai.jumpCooldown <= 0) {
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.35;
        ai.lastJumpX = p.x;
        ai.lastJumpY = p.y;
        ai.lastJumpTime = game.time;
      }
    } else {
      if (AutoCombatSystem.isWallBlocking(tree, p.x, p.y, -1)) {
        if (t && !AutoCombatSystem.isBoss(game, t) && allAlive.filter((m) => !ai.ban.has(m) && m !== t).length > 0) {
          ai.ban.set(t, game.time + 3);
        }
        ai.retreatTime = 0.8;
        ai.retreatDir = 1;
        return;
      }
      ai.keys.add("ArrowLeft");
      if ((p.x <= plat.minX + 14 || ai.stuck > 0.8) && ai.jumpCooldown <= 0) {
        ai.pressed.add(" ");
        ai.jumpCooldown = 0.35;
        ai.lastJumpX = p.x;
        ai.lastJumpY = p.y;
        ai.lastJumpTime = game.time;
      }
    }
  }
}
