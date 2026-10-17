// Core Mob System — Mob spawning, mob AI behaviors, boss AI mechanics, and ground item drops
import type { Game } from "../game.ts";
import { rand, type Drop, type MapData, type Mob } from "../game-types.ts";
import { FootholdTree, airMove, groundMove } from "../physics.ts";
import { CombatSystem } from "./CombatSystem.ts";

export class MobSystem {
  static makeMob(game: Game, s: MapData["spawns"][number]): Mob | null {
    const data = game.mobData.get(s.id);
    if (!data) return null;
    const fh = game.tree.landing(s.x, s.y - 30, s.y + 30) ?? game.tree.below(s.x, s.y - 30);
    const sc = game.stageMul();
    const maxHp = Math.round((data.meta?.maxHP ?? 50) * sc.hp);
    return {
      data,
      spawn: s,
      x: s.x,
      y: fh ? FootholdTree.yAt(fh, s.x) : s.y,
      vx: 0,
      vy: 0,
      fh,
      dir: Math.random() < 0.5 ? -1 : 1,
      state: "stand",
      t: rand(0.5, 2.5),
      anim: 0,
      frame: 0,
      hp: maxHp,
      maxHp,
      aggro: 0,
      hpShow: 0,
      respawn: 0,
      alpha: 1,
      mul: { exp: sc.exp, meso: sc.meso },
      atk: game.mobAtk(data),
    };
  }

  static spawnDrop(game: Game, item: Partial<Drop>, x: number, y = game.p.y - 20, vx = rand(-40, 40), vy = -400) {
    const d: Drop = {
      x,
      y,
      vx,
      vy,
      fh: null,
      amount: 1,
      t: 0,
      picked: 0,
      dropId: item.dropId || `drop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...item,
    };
    game.drops.push(d);
  }

  static updateMob(game: Game, m: Mob, dt: number) {
    if (!m || !m.data || !m.data.books) return;
    const tree = game.tree;
    m.hpShow = Math.max(0, m.hpShow - dt);
    m.aggro = Math.max(0, m.aggro - dt);
    const books = m.data.books;
    const play = (book: string, loop: boolean) => {
      const fr = books[book] ?? books.stand;
      if (!fr?.length) return true;
      if (m.frame >= fr.length) m.frame = 0;
      m.anim += dt * 1000;
      while (m.anim > (fr[m.frame]?.delay ?? 150)) {
        m.anim -= (fr[m.frame]?.delay ?? 150);
        if (m.frame + 1 >= fr.length) {
          if (!loop) {
            m.frame = fr.length - 1;
            return true;
          }
          m.frame = 0;
        } else {
          m.frame++;
        }
      }
      return false;
    };

    if (m.state === "dead") {
      m.respawn -= dt;
      if (m.boss) { game.mobs = game.mobs.filter((x) => x !== m); return; }
      if (m.respawn <= 0) {
        const fresh = MobSystem.makeMob(game, m.spawn);
        if (fresh) Object.assign(m, fresh, { alpha: 0 });
      }
      return;
    }
    if (m.alpha < 1) m.alpha = Math.min(1, m.alpha + dt * 1.5);
    if (m.state === "die1") {
      if (play("die1", false)) { m.state = "dead"; m.respawn = rand(6, 9); }
      return;
    }
    if (!m.fh) {
      airMove(tree, m, dt);
      play("stand", true);
      return;
    }
    if (m.state === "hit1") {
      m.t -= dt;
      play("hit1", true);
      if (m.t <= 0) { m.state = "move"; m.t = rand(1, 3); m.frame = 0; m.anim = 0; }
      return;
    }
    if (m.boss) { MobSystem.updateBoss(game, m, dt, play); return; }
    m.t -= dt;
    if (game.gmHide) m.aggro = 0;
    if (m.aggro > 0) {
      m.state = "move";
      m.dir = game.p.x < m.x ? -1 : 1;
    } else if (m.t <= 0) {
      m.state = Math.random() < 0.4 ? "stand" : "move";
      m.dir = Math.random() < 0.5 ? -1 : 1;
      m.t = rand(1.2, 3.5);
      m.frame = 0; m.anim = 0;
    }
    if (m.state === "move") {
      const speed = 70 * (1 + (m.data.meta?.speed ?? 0) / 100) * (m.aggro > 0 ? 1.25 : 1);
      const res = groundMove(tree, m, m.dir * speed * dt, true);
      const lo = Math.min(m.spawn.rx0, m.spawn.rx1), hi = Math.max(m.spawn.rx0, m.spawn.rx1);
      if (res === "blocked" || (hi > lo && (m.x < lo || m.x > hi))) {
        m.dir = (m.dir * -1) as -1 | 1;
        if (hi > lo) m.x = Math.max(lo, Math.min(hi, m.x));
        if (m.fh) m.y = FootholdTree.yAt(m.fh, Math.max(m.fh.x1, Math.min(m.fh.x2, m.x)));
      }
      play(books.move ? "move" : "stand", true);
    } else play("stand", true);
  }

  static updateBoss(game: Game, m: Mob, dt: number, play: (book: string, loop: boolean) => boolean) {
    const p = game.p, books = m.data.books;
    const dx = p.x - m.x;
    if (m.attacking) {
      if (play(m.attacking, false)) {
        if (Math.abs(dx) < 230 && Math.abs(p.y - m.y) < 140 && p.invuln <= 0 && game.stats.hp > 0) {
          const dmg = CombatSystem.hurtAmount(game, m.atk * 1.6);
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
          p.invuln = 1.5; p.alert = 3; p.ladder = null; p.fh = null; p.vx = (dx < 0 ? -1 : 1) * 200; p.vy = -320; p.attack = 0;
          if (game.stats.hp <= 0) CombatSystem.die(game);
        }
        m.attacking = undefined; m.skillT = rand(3, 5.5); m.frame = 0; m.anim = 0;
      }
      return;
    }
    m.skillT = (m.skillT ?? 3) - dt;
    m.dir = dx < 0 ? -1 : 1;
    const atkBook = ["attack1", "skill1"].filter((b) => books[b]?.length);
    if (m.skillT <= 0 && Math.abs(dx) < 280 && atkBook.length) {
      m.attacking = atkBook[Math.floor(Math.random() * atkBook.length)]; m.frame = 0; m.anim = 0;
      return;
    }
    if (m.skillT <= 0) { m.skillT = rand(3, 5); if (books.jump && m.fh) { m.vy = -480; m.fh = null; return; } }
    if (Math.abs(dx) > 50) {
      const res = groundMove(game.tree, m, m.dir * 75 * dt, true);
      if (res === "blocked") m.skillT = Math.min(m.skillT, 0.3);
      play(books.move ? "move" : "stand", true);
      if (m.state !== "move") { m.state = "move"; }
    } else { if (m.state !== "stand") { m.state = "stand"; m.frame = 0; m.anim = 0; } play("stand", true); }
  }

  static updateDrops(game: Game, dt: number) {
    const magnet = game.auto.battle && game.auto.magnet;
    const now = performance.now();
    for (const d of game.drops) {
      d.t += dt;

      // Drop being magnetically pulled or looted into a remote player
      if (d.targetPlayer) {
        const rp = d.targetPlayer;
        const tx = rp.x;
        const ty = rp.y - 20;
        const dx = tx - d.x;
        const dy = ty - d.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (d.picked) {
          d.picked += dt;
          d.x += (tx - d.x) * Math.min(1, dt * 16);
          d.y += (ty - d.y) * Math.min(1, dt * 16);
        } else {
          const speed = Math.min(dist, (500 + d.t * 700) * dt);
          d.x += (dx / dist) * speed;
          d.y += (dy / dist) * speed;
          if (dist < 36) {
            d.picked = 0.001;
          }
        }
        continue;
      }

      if (d.picked) {
        d.picked += dt;
        d.x += (game.p.x - d.x) * Math.min(1, dt * 14);
        d.y += (game.p.y - 25 - d.y) * Math.min(1, dt * 14);
        continue;
      }
      if (magnet && (d.t > 0.12 || d.fh)) {
        const dx = game.p.x - d.x, dy = (game.p.y - 20) - d.y, dist = Math.hypot(dx, dy) || 1;
        const mt = Math.min(2.0, d.t);
        const baseSpeed = 420 + mt * mt * 850;
        const speed = Math.min(dist, baseSpeed * dt);
        d.x += (dx / dist) * speed;
        d.y += (dy / dist) * speed;
        d.fh = null;
        d.ignoreFh = undefined;
        d.vx = 0; d.vy = 0;

        if (now - game.lastMagnetBroadcast > 350 && game.ws && game.ws.readyState === WebSocket.OPEN) {
          game.lastMagnetBroadcast = now;
          game.ws.send(JSON.stringify({
            t: "magnet",
            x: Math.round(game.p.x),
            y: Math.round(game.p.y),
            dropX: Math.round(d.x),
            dropY: Math.round(d.y),
          }));
        }
      } else if (!d.fh) {
        airMove(game.tree, d, dt);
        if (d.fh) d.vx = 0;
      }
    }
    game.drops = game.drops.filter((d) => (d.picked ? d.picked < 0.25 : d.t < 600));
    if (magnet) {
      for (const d of game.drops) {
        if (d.picked || d.targetPlayer) continue;
        if (Math.abs(d.x - game.p.x) < 36 && Math.abs(d.y - (game.p.y - 20)) < 36) {
          game.collectDrop(d, "magnet");
        }
      }
    }
  }
}
