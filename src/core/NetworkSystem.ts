import type { Game } from "../game.ts";
import { charUrlFor, FREE_MARKET_MAP, type ChatKind } from "../game-types.ts";
import { SKILL } from "../skills.ts";
import { spacetime } from "../spacetimedb.ts";
import { CombatSystem } from "./CombatSystem.ts";

export class NetworkSystem {
  private static isSamePlayerName(a?: string, b?: string): boolean {
    const na = (a || "").trim().toLowerCase();
    const nb = (b || "").trim().toLowerCase();
    if (!na || !nb || na === "player" || /^p-[a-f0-9]{4}$/i.test(na)) return false;
    return na === nb;
  }

  private static removeDuplicateRemoteByName(game: Game, name?: string, keepId?: string) {
    if (!name) return;
    for (const [existingId, existingPlayer] of [...game.remotePlayers.entries()]) {
      if (existingId !== keepId && NetworkSystem.isSamePlayerName(existingPlayer.name, name)) {
        game.remotePlayers.delete(existingId);
      }
    }
  }

  private static showSessionReplacedOverlay(game: Game, reason: string) {
    if (typeof document === "undefined") return;
    let overlay = document.getElementById("session-replaced-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "session-replaced-overlay";
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:99999;background:rgba(8,10,18,0.82);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;font-family:Tahoma,Verdana,sans-serif;";
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div style="background:linear-gradient(180deg,#23293a 0%,#151924 100%);border:2px solid #ffcc44;border-radius:10px;padding:24px 28px;max-width:400px;width:90%;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,0.75);text-align:center;">
        <div style="font-size:18px;font-weight:bold;color:#ffcc44;margin-bottom:10px;">Disconnected — Active Session Elsewhere</div>
        <div style="font-size:13px;line-height:1.5;color:#d6deeb;margin-bottom:20px;">${reason}</div>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button id="session-reconnect-btn" style="background:linear-gradient(180deg,#ffcc44,#e09b1b);color:#1b1300;border:1px solid #ffe599;border-radius:6px;padding:8px 16px;font-weight:bold;cursor:pointer;font-size:12px;">Reconnect Here</button>
          <button id="session-switch-btn" style="background:#2b3248;color:#d6deeb;border:1px solid #4a5578;border-radius:6px;padding:8px 16px;font-weight:bold;cursor:pointer;font-size:12px;">Switch Account</button>
        </div>
      </div>
    `;
    overlay.querySelector("#session-reconnect-btn")?.addEventListener("click", () => {
      overlay?.remove();
      game.sessionReplaced = false;
      NetworkSystem.initWs(game);
    });
    overlay.querySelector("#session-switch-btn")?.addEventListener("click", () => {
      overlay?.remove();
      try { spacetime.logout(); } catch {}
      window.location.reload();
    });
  }

  static initWs(game: Game) {
    if (!game.fullyLoaded || game.sessionReplaced) return;
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

      ws.onclose = (ev) => {
        if (game.wsPingTimer) {
          clearInterval(game.wsPingTimer);
          game.wsPingTimer = null;
        }
        game.ws = null;
        if (game.sessionReplaced || ev.code === 4001) {
          game.sessionReplaced = true;
          return;
        }
        setTimeout(() => {
          if (!game.ws && !game.sessionReplaced) NetworkSystem.initWs(game);
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
      username: spacetime.currentUser || undefined,
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
    if (!game.fullyLoaded || game.loadingMap || game.sessionReplaced) return;
    if (forceReconnect || !game.ws || game.ws.readyState !== WebSocket.OPEN) {
      NetworkSystem.initWs(game);
      return;
    }
    game.ws.send(JSON.stringify({
      t: "sync",
      username: spacetime.currentUser || undefined,
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
      if (game.partyId) {
        NetworkSystem.sendPartySync(game);
      }
    }
  }

  private static lastPartySync = 0;
  private static lastPartyHp = -1;
  private static lastPartyMp = -1;
  static sendPartySync(game: Game) {
    if (!game.partyId || !game.ws || game.ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    const hpChanged = game.stats.hp !== NetworkSystem.lastPartyHp;
    const mpChanged = game.stats.mp !== NetworkSystem.lastPartyMp;
    if (hpChanged || mpChanged || now - NetworkSystem.lastPartySync > 1500) {
      NetworkSystem.lastPartySync = now;
      NetworkSystem.lastPartyHp = game.stats.hp;
      NetworkSystem.lastPartyMp = game.stats.mp;
      game.ws.send(JSON.stringify({
        t: "party_sync",
        partyId: game.partyId,
        hp: game.stats.hp,
        maxHp: game.stats.maxHp,
        mp: game.stats.mp,
        maxMp: game.stats.maxMp,
        level: game.stats.level,
        job: game.stats.job,
        mapId: game.map?.id || 910000000,
      }));
    }
  }

  static handleWsMessage(game: Game, msg: any) {
    if (!msg || !msg.t) return;
    if (msg.t === "session_replaced") {
      game.sessionReplaced = true;
      if (game.wsPingTimer) {
        clearInterval(game.wsPingTimer);
        game.wsPingTimer = null;
      }
      if (game.ws) {
        try { game.ws.close(4001, "Session replaced"); } catch {}
        game.ws = null;
      }
      game.remotePlayers.clear();
      const reason = msg.reason || "Your account was logged in from another window or device.";
      game.onChat("notice", `[System] ${reason}`);
      NetworkSystem.showSessionReplacedOverlay(game, reason);
      return;
    }
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
      if (msg.guild) {
        game.guild = msg.guild;
        game.guildId = msg.guild.id;
        game.guildName = msg.guild.name;
        game.guildEmblem = msg.guild.emblem;
      }
      if (msg.party) {
        game.party = msg.party;
        game.partyId = msg.party.id;
      }
      if (activeName) {
        game.stats.name = activeName;
        try { localStorage.setItem("ms_player_name", activeName); } catch {}
        if (game.ws && game.ws.readyState === WebSocket.OPEN) {
          game.ws.send(JSON.stringify({
            t: "name",
            name: activeName,
            username: spacetime.currentUser || undefined,
          }));
        }
        game.onChange();
      }
    } else if (msg.t === "player_name") {
      if (msg.id === game.wsId) return;
      if (NetworkSystem.isSamePlayerName(msg.name, game.stats.name)) {
        game.remotePlayers.delete(msg.id);
        return;
      }
      NetworkSystem.removeDuplicateRemoteByName(game, msg.name, msg.id);
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        rp.name = msg.name;
        if (msg.guildName !== undefined) rp.guildName = msg.guildName;
        if (msg.guildEmblem !== undefined) rp.guildEmblem = msg.guildEmblem;
        game.onChange();
      }
    } else if (msg.t === "roster") {
      game.remotePlayers.clear();
      if (Array.isArray(msg.players)) {
        for (const p of msg.players) {
          if (p.id !== game.wsId && !NetworkSystem.isSamePlayerName(p.name, game.stats.name)) {
            NetworkSystem.removeDuplicateRemoteByName(game, p.name, p.id);
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
      if (msg.player && msg.player.id !== game.wsId && !NetworkSystem.isSamePlayerName(msg.player.name, game.stats.name)) {
        NetworkSystem.removeDuplicateRemoteByName(game, msg.player.name, msg.player.id);
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
      } else if (msg.name) {
        NetworkSystem.removeDuplicateRemoteByName(game, msg.name);
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
      game.onChat((msg.kind as ChatKind) || "say", msg.kind === "say" ? `${msg.name} : ${msg.text}` : msg.text, msg.itemLink);
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
    } else if (msg.t === "guild_update") {
      game.guild = msg.guild || null;
      if (msg.guild) {
        game.guildId = msg.guild.id;
        game.guildName = msg.guild.name;
        game.guildEmblem = msg.guild.emblem;
      } else {
        game.guildId = undefined;
        game.guildName = undefined;
        game.guildEmblem = undefined;
        if (msg.disbanded) {
          game.onChat("notice", `Guild [${msg.disbandedName ?? "your guild"}] has been disbanded.`);
        } else if (msg.expelled) {
          game.onChat("notice", "You have been expelled from the guild.");
        }
      }
      window.dispatchEvent(new CustomEvent("guild-state-changed", { detail: { guild: game.guild } }));
      game.onChange();
    } else if (msg.t === "player_guild") {
      if (msg.id === game.wsId) {
        game.guildId = msg.guildId;
        game.guildName = msg.guildName;
        game.guildEmblem = msg.guildEmblem;
      }
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        rp.guildId = msg.guildId;
        rp.guildName = msg.guildName;
        rp.guildEmblem = msg.guildEmblem;
      }
      window.dispatchEvent(new CustomEvent("guild-state-changed", { detail: { guildId: msg.guildId, name: msg.name } }));
      game.onChange();
    } else if (msg.t === "guild_directory_update") {
      window.dispatchEvent(new CustomEvent("guild-directory-changed"));
    } else if (msg.t === "party_update") {
      game.party = msg.party || null;
      game.partyId = msg.party?.id;
      if (!msg.party) {
        if (msg.disbanded) {
          game.onChat("notice", "The party has been disbanded.");
        } else if (msg.expelled) {
          game.onChat("notice", "You have been expelled from the party.");
        }
      }
      window.dispatchEvent(new CustomEvent("party-state-changed", { detail: { party: game.party } }));
      game.onChange();
    } else if (msg.t === "party_invite") {
      const inviter = msg.inviterName || "A player";
      const partyId = msg.partyId;
      game.onChat("notice", `★ [Party Invite] ${inviter} invited you to join their party! Press P or type /p accept.`);
      window.dispatchEvent(new CustomEvent("party-invited", { detail: { inviter, partyId } }));
    } else if (msg.t === "party_exp_gain") {
      const exp = Number(msg.exp || 0);
      if (exp > 0) {
        CombatSystem.gainExp(game, exp);
      }
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
