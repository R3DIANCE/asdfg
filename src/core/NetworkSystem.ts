// Core Network System — WebSocket multiplayer synchronization and message handling
import type { Game } from "../game.ts";
import { charUrlFor, FREE_MARKET_MAP, type ChatKind } from "../game-types.ts";
import { SKILL } from "../skills.ts";

export class NetworkSystem {
  static initWs(game: Game) {
    if (!game.fullyLoaded) return;
    if (game.wsPingTimer) {
      clearInterval(game.wsPingTimer);
      game.wsPingTimer = null;
    }
    if (game.ws) {
      try { game.ws.close(); } catch {}
      game.ws = null;
    }
    try {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const host = location.host || "localhost:3000";
      const ws = new WebSocket(`${proto}//${host}/ws`);
      game.ws = ws;

      ws.onopen = () => {
        NetworkSystem.sendJoin(game);
        // Start ping heartbeat
        if (game.wsPingTimer) clearInterval(game.wsPingTimer);
        game.wsPingTimer = setInterval(() => {
          if (game.ws && game.ws.readyState === WebSocket.OPEN) {
            game.ws.send(JSON.stringify({ t: "ping", sentAt: performance.now() }));
          }
        }, 1000);
        ws.send(JSON.stringify({ t: "ping", sentAt: performance.now() }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          NetworkSystem.handleWsMessage(game, msg);
        } catch {}
      };

      ws.onclose = () => {
        if (game.wsPingTimer) {
          clearInterval(game.wsPingTimer);
          game.wsPingTimer = null;
        }
        game.ws = null;
        setTimeout(() => {
          if (!game.ws) NetworkSystem.initWs(game);
        }, 3000);
      };

      ws.onerror = () => {
        if (game.wsPingTimer) {
          clearInterval(game.wsPingTimer);
          game.wsPingTimer = null;
        }
        try { ws.close(); } catch {}
      };
    } catch {}
  }

  static sendJoin(game: Game) {
    if (!game.fullyLoaded || game.loadingMap || !game.ws || game.ws.readyState !== WebSocket.OPEN) return;
    game.ws.send(JSON.stringify({
      t: "join",
      name: game.stats.name,
      mapId: game.map?.id || FREE_MARKET_MAP,
      x: Math.round(game.p.x),
      y: Math.round(game.p.y),
      face: game.p.face,
      anim: game.p.anim,
      frame: game.p.frame,
      look: game.look,
    }));
  }

  static syncAll(game: Game, forceReconnect = false) {
    if (!game.fullyLoaded || game.loadingMap) return;
    if (forceReconnect || !game.ws || game.ws.readyState !== WebSocket.OPEN) {
      NetworkSystem.initWs(game);
      return;
    }
    game.ws.send(JSON.stringify({
      t: "sync",
      name: game.stats.name,
      mapId: game.map?.id || FREE_MARKET_MAP,
      x: Math.round(game.p.x),
      y: Math.round(game.p.y),
      face: game.p.face,
      anim: game.p.anim,
      frame: game.p.frame,
      look: game.look,
    }));
  }

  static sendAction(game: Game, kind: "attack" | "skill", skillId: string | null, anim: string) {
    if (!game.fullyLoaded || game.loadingMap || !game.ws || game.ws.readyState !== WebSocket.OPEN) return;
    game.ws.send(JSON.stringify({
      t: "action",
      kind,
      skillId,
      anim,
      face: game.p.face,
      x: Math.round(game.p.x),
      y: Math.round(game.p.y),
      frame: game.p.frame,
    }));
  }

  static syncMove(game: Game) {
    if (!game.fullyLoaded || game.loadingMap || !game.ws || game.ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    const p = game.p;
    const dx = Math.abs(p.x - game.lastSyncedState.x);
    const dy = Math.abs(p.y - game.lastSyncedState.y);
    const animChanged = p.anim !== game.lastSyncedState.anim || p.frame !== game.lastSyncedState.frame || p.face !== game.lastSyncedState.face;
    const isMoving = Math.abs(p.vx) > 0.1 || Math.abs(p.vy) > 0.1;
    const stoppedMoving = !isMoving && (game.lastSyncedState.anim.startsWith("walk") || game.lastSyncedState.anim === "jump");

    if ((now - game.lastMoveSync > 50 && (dx > 2 || dy > 2 || animChanged)) || stoppedMoving || (now - game.lastMoveSync > 2000)) {
      game.lastMoveSync = now;
      game.lastSyncedState = { x: Math.round(p.x), y: Math.round(p.y), face: p.face, anim: p.anim, frame: p.frame };
      game.ws.send(JSON.stringify({
        t: "move",
        mapId: game.map?.id || FREE_MARKET_MAP,
        x: Math.round(p.x),
        y: Math.round(p.y),
        face: p.face,
        anim: p.anim,
        frame: p.frame,
      }));
    }
  }

  static handleWsMessage(game: Game, msg: any) {
    if (!msg || !msg.t) return;
    if (msg.t === "welcome") {
      game.wsId = msg.id;
      const current = (game.stats.name || "").trim();
      const hasRealName = current && current !== "Player" && !current.startsWith("P-");
      let activeName = hasRealName ? current : "";
      if (!activeName) {
        try {
          const saved = (localStorage.getItem("ms_player_name") || "").trim();
          if (saved && saved !== "Player" && !saved.startsWith("P-")) activeName = saved;
        } catch {}
      }
      if (!activeName && msg.id) {
        activeName = msg.id.length > 8 ? `P-${msg.id.slice(0, 4).toUpperCase()}` : msg.id;
      }
      if (activeName) {
        game.stats.name = activeName;
        try { localStorage.setItem("ms_player_name", activeName); } catch {}
        if (game.ws && game.ws.readyState === WebSocket.OPEN) {
          game.ws.send(JSON.stringify({ t: "name", name: activeName }));
        }
        game.onChange();
      }
    } else if (msg.t === "player_name") {
      if (msg.id === game.wsId) return;
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        rp.name = msg.name;
        game.onChange();
      }
    } else if (msg.t === "roster") {
      game.remotePlayers.clear();
      if (Array.isArray(msg.players)) {
        for (const p of msg.players) {
          if (p.id !== game.wsId) {
            game.remotePlayers.set(p.id, {
              ...p,
              targetX: p.x,
              targetY: p.y,
            });
            game.assets.load(charUrlFor(p.look, p.anim || "stand1", p.frame || 0));
          }
        }
      }
    } else if (msg.t === "player_join") {
      if (msg.player && msg.player.id !== game.wsId) {
        game.remotePlayers.set(msg.player.id, {
          ...msg.player,
          targetX: msg.player.x,
          targetY: msg.player.y,
        });
        game.onChat("system", `${msg.player.name} entered the map.`);
        game.assets.load(charUrlFor(msg.player.look, msg.player.anim || "stand1", msg.player.frame || 0));
      }
    } else if (msg.t === "player_move") {
      if (msg.id === game.wsId) return;
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        rp.targetX = msg.x;
        rp.targetY = msg.y;
        rp.face = msg.face;
        if (!rp.attackTimer || rp.attackTimer <= 0) {
          rp.anim = msg.anim;
          rp.frame = msg.frame;
        }
        game.assets.load(charUrlFor(rp.look, rp.anim, rp.frame));
      } else {
        NetworkSystem.syncAll(game, false);
      }
    } else if (msg.t === "player_action") {
      if (msg.id === game.wsId) return;
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        rp.anim = msg.anim || "swingO1";
        rp.frame = 0;
        rp.animTimer = 0;
        rp.attackTimer = 0.65;
        rp.face = msg.face ?? rp.face;
        rp.targetX = msg.x ?? rp.targetX;
        rp.targetY = msg.y ?? rp.targetY;
        game.assets.load(charUrlFor(rp.look, rp.anim, rp.frame));
        if (msg.skillId) {
          const art = game.skillArt[msg.skillId];
          if (art?.effect?.length) {
            game.fx.push({ frames: art.effect, x: rp.x, y: rp.y, flip: rp.face === 1, t: 0 });
          } else if (art?.effect0?.length) {
            game.fx.push({ frames: art.effect0, x: rp.x, y: rp.y, flip: rp.face === 1, t: 0 });
          }
          const d = SKILL[msg.skillId];
          if (d?.kind === "ranged" && game.throwingStarFrames.length > 0) {
            const hits = d.hits ?? 1;
            for (let h = 0; h < hits; h++) {
              game.projectiles.push({
                x: rp.x + rp.face * 20,
                y: rp.y - 35,
                target: { x: rp.x + rp.face * 220, y: rp.y - 20, state: "alive" } as any,
                dmg: 0,
                miss: false,
                t: -h * 0.08,
                skillId: msg.skillId,
                arcY: (h - (hits - 1) / 2) * 12,
              });
            }
          }
        }
      }
    } else if (msg.t === "player_leave") {
      if (msg.id === game.wsId) return;
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        game.onChat("system", `${rp.name || "A player"} left the map.`);
        game.remotePlayers.delete(msg.id);
      }
    } else if (msg.t === "player_look") {
      if (msg.id === game.wsId) return;
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        rp.look = msg.look;
        game.assets.load(charUrlFor(rp.look, rp.anim || "stand1", rp.frame || 0));
      }
    } else if (msg.t === "chat") {
      if (msg.id === game.wsId) return;
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        rp.balloon = { text: msg.text, t: 5 };
      }
      game.onChat((msg.kind as ChatKind) || "say", msg.kind === "say" ? `${msg.name} : ${msg.text}` : msg.text);
      if (msg.kind === "notice") {
        window.dispatchEvent(new CustomEvent("gm-broadcast-notice", { detail: { text: msg.text.replace(/^\[Notice\]\s*/, "") } }));
      }
    } else if (msg.t === "pong") {
      if (typeof msg.sentAt === "number") {
        game.wsPing = Math.max(0, Math.round(performance.now() - msg.sentAt));
      }
    } else if (msg.t === "force_warp") {
      const mapId = Number(msg.mapId || 910000000);
      if (mapId !== game.map?.id) {
        game.loadMap(mapId, "spawn").then(() => {
          if (typeof msg.x === "number" && typeof msg.y === "number") {
            game.p.x = msg.x;
            game.p.y = msg.y;
            game.snapCamera();
          }
        });
      } else if (typeof msg.x === "number" && typeof msg.y === "number") {
        game.p.x = msg.x;
        game.p.y = msg.y;
        game.snapCamera();
      }
      if (msg.reason) game.onChat("notice", `[GM] ${msg.reason}`);
    } else if (msg.t === "gm_heal") {
      game.stats.hp = game.stats.maxHp;
      game.stats.mp = game.stats.maxMp;
      game.onChat("notice", "[GM] You received a divine healing blessing!");
      game.onChange();
    } else if (msg.t === "gm_meso") {
      const amt = Number(msg.amount || 1000000);
      game.stats.meso = (game.stats.meso || 0) + amt;
      game.onChat("notice", `[GM] You received +${amt.toLocaleString()} mesos!`);
      game.onChange();
    }
  }
}
