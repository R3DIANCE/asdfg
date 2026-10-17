import type { Game } from "../game.ts";
import { charUrlFor, FREE_MARKET_MAP, type ChatKind } from "../game-types.ts";
import { SKILL } from "../skills.ts";
import { spacetime } from "../spacetimedb.ts";
import { CombatSystem } from "./CombatSystem.ts";
import { DamageSkinSystem } from "../systems/damage-skin-system.ts";
import { EngineAssetBridge } from "../assets.ts";
import { clearGuildTagCache } from "../systems/render-system.ts";

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

  public static fullyDisconnectSessionReplaced(game: Game, customReason?: string) {
    game.sessionReplaced = true;

    // 1. Terminate all network connections and cancel any pending reconnect timers
    if (NetworkSystem.reconnectTimer) {
      clearTimeout(NetworkSystem.reconnectTimer);
      NetworkSystem.reconnectTimer = null;
    }
    NetworkSystem.reconnectAttempts = 0;

    if (game.wsPingTimer) {
      clearInterval(game.wsPingTimer);
      game.wsPingTimer = null;
    }

    if (game.ws) {
      try {
        game.ws.close(4001, "Session replaced");
      } catch {}
      game.ws = null;
    }

    // 2. Clear remote players and active multiplayer entities
    game.remotePlayers.clear();

    // 3. Immediately halt auto-combat, auto-boss, and player actions
    game.auto.battle = false;
    game.auto.boss = false;
    try {
      const autoBtn = document.querySelector(".auto-btn");
      if (autoBtn) autoBtn.classList.remove("on");
      const autoBossBtn = document.querySelector(".auto-boss-btn");
      if (autoBossBtn) autoBossBtn.classList.remove("on");
    } catch {}

    // Freeze player input and motion
    game.keys.clear();
    game.pressed.clear();
    game.p.vx = 0;
    game.p.vy = 0;
    game.p.anim = "stand1";
    game.p.attack = 0;
    game.p.aiAttack = false;
    game.p.skill = null;

    // 4. Fully logout credentials & prevent auto-login
    try {
      spacetime.logout();
    } catch {}
    try {
      localStorage.removeItem("ms_current_character");
      sessionStorage.setItem("ms_skip_autologin", "1");
    } catch {}

    // 5. Close open UI windows (inventory, guild, auction, etc.)
    try {
      const openWins = document.querySelectorAll(".win:not(.hidden)");
      openWins.forEach((w) => w.classList.add("hidden"));
    } catch {}

    // 6. Stop/pause background BGM
    try {
      if ((game as any).audio?.bgm) {
        (game as any).audio.bgm.pause();
      }
    } catch {}

    const reason = customReason || "Your account was logged in from another window or device.";
    game.onChat("notice", `[System] ${reason}`);
    NetworkSystem.showSessionReplacedOverlay(game, reason);
  }

  private static showSessionReplacedOverlay(game: Game, reason: string) {
    if (typeof document === "undefined") return;
    let overlay = document.getElementById("session-replaced-overlay");
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "session-replaced-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(6,8,15,0.88);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;font-family:Tahoma,Verdana,sans-serif;user-select:none;";
    document.body.appendChild(overlay);

    overlay.innerHTML = `
      <div style="background:linear-gradient(180deg,#23293a 0%,#151924 100%);border:2px solid #ffcc44;border-radius:10px;padding:26px 30px;max-width:420px;width:92%;color:#fff;box-shadow:0 16px 48px rgba(0,0,0,0.85);text-align:center;">
        <div style="display:flex;align-items:center;justify-content:center;margin-bottom:12px;">
          <div style="width:42px;height:42px;border-radius:50%;background:rgba(239,68,68,0.2);border:2px solid #ef4444;display:flex;align-items:center;justify-content:center;color:#ef4444;font-size:24px;font-weight:bold;">!</div>
        </div>
        <div style="font-size:17px;font-weight:bold;color:#ffcc44;margin-bottom:10px;">Disconnected — Active Session Elsewhere</div>
        <div style="font-size:13px;line-height:1.55;color:#d6deeb;margin-bottom:22px;">
          ${reason}<br>
          <span style="color:#94a3b8;font-size:12px;">You have been fully disconnected from the game world.</span>
        </div>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button id="session-ok-btn" style="background:linear-gradient(180deg,#ffcc44,#e09b1b);color:#1b1300;border:1px solid #ffe599;border-radius:6px;padding:9px 28px;font-weight:bold;cursor:pointer;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.4);transition:filter .15s;">OK</button>
          <button id="session-switch-btn" style="background:#2b3248;color:#d6deeb;border:1px solid #4a5578;border-radius:6px;padding:9px 18px;font-weight:bold;cursor:pointer;font-size:13px;transition:background .15s;">Switch Account</button>
        </div>
      </div>
    `;

    const handleExit = () => {
      overlay?.remove();
      try { spacetime.logout(); } catch {}
      try {
        localStorage.removeItem("ms_current_character");
        sessionStorage.setItem("ms_skip_autologin", "1");
      } catch {}
      window.location.reload();
    };

    overlay.querySelector("#session-ok-btn")?.addEventListener("click", handleExit);
    overlay.querySelector("#session-switch-btn")?.addEventListener("click", handleExit);

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") {
        window.removeEventListener("keydown", keyHandler);
        handleExit();
      }
    };
    window.addEventListener("keydown", keyHandler);
  }

  static reconnectTimer: any = null;
  static reconnectAttempts = 0;
  static wasConnected = false;
  static onlineListenerAttached = false;

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

    if (typeof window !== "undefined" && !NetworkSystem.onlineListenerAttached) {
      NetworkSystem.onlineListenerAttached = true;
      window.addEventListener("online", () => {
        if (!game.ws && !game.sessionReplaced && game.fullyLoaded) {
          if (NetworkSystem.reconnectTimer) clearTimeout(NetworkSystem.reconnectTimer);
          NetworkSystem.initWs(game);
        }
      });
    }

    try {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const host = location.host || "localhost:3000";
      const ws = new WebSocket(`${proto}//${host}/ws`);
      game.ws = ws;

      ws.onopen = () => {
        EngineAssetBridge.setWsProvider(() => game.ws);
        if (NetworkSystem.reconnectTimer) {
          clearTimeout(NetworkSystem.reconnectTimer);
          NetworkSystem.reconnectTimer = null;
        }
        if (NetworkSystem.reconnectAttempts > 0 && NetworkSystem.wasConnected) {
          game.onChat("system", "[Network] Reconnected to server.");
          try {
            const savedAuto = localStorage.getItem("ms_auto_combat");
            if (savedAuto === "true") {
              game.auto.battle = true;
            }
          } catch {}
        }
        NetworkSystem.reconnectAttempts = 0;
        NetworkSystem.wasConnected = true;

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
          NetworkSystem.fullyDisconnectSessionReplaced(game);
          return;
        }

        // Automatic exponential backoff reconnection
        const delay = Math.min(1000 * Math.pow(1.5, NetworkSystem.reconnectAttempts), 8000);
        NetworkSystem.reconnectAttempts++;
        if (NetworkSystem.reconnectTimer) clearTimeout(NetworkSystem.reconnectTimer);
        NetworkSystem.reconnectTimer = setTimeout(() => {
          if (!game.ws && !game.sessionReplaced && game.fullyLoaded) {
            NetworkSystem.initWs(game);
          }
        }, delay);
      };

      ws.onerror = () => {
        if (game.wsPingTimer) {
          clearInterval(game.wsPingTimer);
          game.wsPingTimer = null;
        }
        try { ws.close(); } catch {}
        if (!game.sessionReplaced && !NetworkSystem.reconnectTimer) {
          const delay = Math.min(1000 * Math.pow(1.5, NetworkSystem.reconnectAttempts), 8000);
          NetworkSystem.reconnectAttempts++;
          NetworkSystem.reconnectTimer = setTimeout(() => {
            if (!game.ws && !game.sessionReplaced && game.fullyLoaded) {
              NetworkSystem.initWs(game);
            }
          }, delay);
        }
      };
    } catch {
      if (!game.sessionReplaced && !NetworkSystem.reconnectTimer) {
        NetworkSystem.reconnectTimer = setTimeout(() => {
          if (!game.ws && !game.sessionReplaced && game.fullyLoaded) {
            NetworkSystem.initWs(game);
          }
        }, 2000);
      }
    }
  }

  static sendJoin(game: Game) {
    if (!game.fullyLoaded || game.loadingMap || !game.ws || game.ws.readyState !== WebSocket.OPEN) return;
    game.ws.send(JSON.stringify({
      t: "join",
      username: spacetime.currentUser || undefined,
      name: game.stats.name,
      level: game.stats.level || 1,
      job: game.stats.job || "Beginner",
      mapId: game.map?.id || FREE_MARKET_MAP,
      x: Math.round(game.p.x),
      y: Math.round(game.p.y),
      face: game.p.face,
      anim: game.p.anim,
      frame: game.p.frame,
      look: game.look,
      fps: Math.round(game.fps),
      ping: Math.round(game.wsPing),
      damageSkin: game.damageSkin,
      gmEffect: game.gmEffect,
      godMode: Boolean(game.godMode),
      infiniteMp: Boolean(game.infiniteMp),
      oneHitKill: Boolean(game.oneHitKill),
      gmHide: Boolean(game.gmHide),
      autoCombat: Boolean(game.auto?.battle),
      speedMultiplier: Number(game.speedMultiplier || 1),
      isGm: Boolean(game.isGm?.()),
      hp: game.stats.hp,
      maxHp: game.stats.maxHp,
      mp: game.stats.mp,
      maxMp: game.stats.maxMp,
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
      level: game.stats.level || 1,
      job: game.stats.job || "Beginner",
      mapId: game.map?.id || FREE_MARKET_MAP,
      x: Math.round(game.p.x),
      y: Math.round(game.p.y),
      face: game.p.face,
      anim: game.p.anim,
      frame: game.p.frame,
      look: game.look,
      fps: Math.round(game.fps),
      ping: Math.round(game.wsPing),
      damageSkin: game.damageSkin,
      gmEffect: game.gmEffect,
      godMode: Boolean(game.godMode),
      infiniteMp: Boolean(game.infiniteMp),
      oneHitKill: Boolean(game.oneHitKill),
      gmHide: Boolean(game.gmHide),
      autoCombat: Boolean(game.auto?.battle),
      speedMultiplier: Number(game.speedMultiplier || 1),
      isGm: Boolean(game.isGm?.()),
      hp: game.stats.hp,
      maxHp: game.stats.maxHp,
      mp: game.stats.mp,
      maxMp: game.stats.maxMp,
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
        fps: Math.round(game.fps),
        ping: Math.round(game.wsPing),
        damageSkin: game.damageSkin,
        gmEffect: game.gmEffect,
        godMode: Boolean(game.godMode),
        infiniteMp: Boolean(game.infiniteMp),
        oneHitKill: Boolean(game.oneHitKill),
        gmHide: Boolean(game.gmHide),
        autoCombat: Boolean(game.auto?.battle),
        speedMultiplier: Number(game.speedMultiplier || 1),
        isGm: Boolean(game.isGm?.()),
        hp: game.stats.hp,
        maxHp: game.stats.maxHp,
        mp: game.stats.mp,
        maxMp: game.stats.maxMp,
      }));
      if (game.partyId) {
        NetworkSystem.sendPartySync(game);
      }
    }
  }

  private static lastPartySync = 0;
  private static lastPartyHp = -1;
  private static lastPartyMp = -1;
  private static lastPartyBuffsKey = "";
  static sendPartyBuff(game: Game, skillId: string, lv: number, dur: number) {
    if (!game.partyId || !game.ws || game.ws.readyState !== WebSocket.OPEN) return;
    game.ws.send(JSON.stringify({
      t: "party_buff",
      partyId: game.partyId,
      skillId,
      lv,
      dur,
    }));
  }

  static sendPartySync(game: Game) {
    if (!game.partyId || !game.ws || game.ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    const hpChanged = game.stats.hp !== NetworkSystem.lastPartyHp;
    const mpChanged = game.stats.mp !== NetworkSystem.lastPartyMp;
    const buffKeys = Object.keys(game.buffs);
    const buffsKey = buffKeys.join(",");
    const buffsChanged = buffsKey !== NetworkSystem.lastPartyBuffsKey;
    if (hpChanged || mpChanged || buffsChanged || now - NetworkSystem.lastPartySync > 1500) {
      NetworkSystem.lastPartySync = now;
      NetworkSystem.lastPartyHp = game.stats.hp;
      NetworkSystem.lastPartyMp = game.stats.mp;
      NetworkSystem.lastPartyBuffsKey = buffsKey;
      const activeBuffs: Record<string, { left: number; dur: number; lv: number }> = {};
      for (const [id, b] of Object.entries(game.buffs)) {
        if (!b.from) {
          activeBuffs[id] = {
            left: Math.round(b.left * 10) / 10,
            dur: b.dur,
            lv: Math.max(1, b.lv ?? game.lv(id)),
          };
        }
      }
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
        buffs: buffKeys,
        activeBuffs,
      }));
    }
  }

  static handleWsMessage(game: Game, msg: any) {
    if (!msg || !msg.t) return;
    if (msg.t === "session_replaced") {
      NetworkSystem.fullyDisconnectSessionReplaced(game, msg.reason);
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
        clearGuildTagCache();
        game.guild = msg.guild;
        game.guildId = msg.guild.id;
        game.guildName = msg.guild.name;
        game.guildEmblem = msg.guild.emblem ? {
          ...msg.guild.emblem,
          beamEffect: msg.guild.emblem.beamEffect || "gold",
          beamMotion: msg.guild.emblem.beamMotion || "rotate",
        } : undefined;
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
              fps: p.fps ?? 60,
              ping: p.ping ?? 20,
              damageSkin: p.damageSkin ?? 0,
              gmEffect: Boolean(p.gmEffect),
            });
            if (p.damageSkin) DamageSkinSystem.preloadSkin(game, p.damageSkin);
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
          fps: msg.player.fps ?? 60,
          ping: msg.player.ping ?? 20,
          damageSkin: msg.player.damageSkin ?? 0,
          gmEffect: Boolean(msg.player.gmEffect),
        });
        game.onChat("system", `${msg.player.name} entered the map.`);
        if (msg.player.damageSkin) DamageSkinSystem.preloadSkin(game, msg.player.damageSkin);
      }
    } else if (msg.t === "player_move") {
      if (msg.id === game.wsId) return;
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        rp.targetX = msg.x;
        rp.targetY = msg.y;
        rp.face = msg.face;
        if (msg.fps !== undefined) rp.fps = msg.fps;
        if (msg.ping !== undefined) rp.ping = msg.ping;
        if (msg.damageSkin !== undefined && msg.damageSkin !== rp.damageSkin) {
          rp.damageSkin = msg.damageSkin;
          DamageSkinSystem.preloadSkin(game, rp.damageSkin);
        }
        if (msg.gmEffect !== undefined) {
          rp.gmEffect = Boolean(msg.gmEffect);
        }
        if (msg.hp !== undefined) rp.hp = Number(msg.hp);
        if (msg.maxHp !== undefined) rp.maxHp = Number(msg.maxHp);
        if (msg.mp !== undefined) rp.mp = Number(msg.mp);
        if (msg.maxMp !== undefined) rp.maxMp = Number(msg.maxMp);
        if (!rp.attackTimer || rp.attackTimer <= 0) {
          rp.anim = msg.anim;
          rp.frame = msg.frame;
        }
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
      }
    } else if (msg.t === "player_damage") {
      if (msg.id === game.wsId) return;
      game.dmg.push({
        value: msg.value,
        miss: Boolean(msg.miss),
        hurt: Boolean(msg.hurt),
        heal: Boolean(msg.heal),
        poison: Boolean(msg.poison),
        critical: Boolean(msg.critical),
        skinId: msg.skinId ?? 0,
        x: msg.x,
        y: msg.y,
        t: 0,
      });
      if (msg.skinId) {
        DamageSkinSystem.preloadSkin(game, msg.skinId);
      }
    } else if (msg.t === "player_damage_skin") {
      if (msg.id === game.wsId) return;
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        rp.damageSkin = msg.damageSkin;
        DamageSkinSystem.preloadSkin(game, rp.damageSkin);
      }
    } else if (msg.t === "player_loot") {
      if (msg.id === game.wsId) return;
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        rp.magnetActive = Boolean(msg.magnet);
        rp.magnetTimer = 0.6;
        const drop = game.drops.find((d) => !d.picked && Math.abs(d.x - msg.x) < 45 && Math.abs(d.y - msg.y) < 45);
        if (drop) {
          drop.targetPlayer = rp;
          drop.picked = 0.001;
        } else {
          game.drops.push({
            x: msg.x,
            y: msg.y,
            vx: (Math.random() - 0.5) * 30,
            vy: -60,
            fh: null,
            amount: msg.amount || 0,
            item: msg.item,
            mat: msg.mat,
            gear: msg.gear ? { id: msg.gear, rarity: 0, stars: 0, att: 0, stat: 0, name: "" } as any : undefined,
            t: 0,
            picked: 0.001,
            targetPlayer: rp,
            isCosmetic: true,
          });
        }
      }
    } else if (msg.t === "player_magnet") {
      if (msg.id === game.wsId) return;
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        rp.magnetActive = true;
        rp.magnetTimer = 0.6;
        const drop = game.drops.find((d) => !d.picked && Math.abs(d.x - msg.dropX) < 50 && Math.abs(d.y - msg.dropY) < 50);
        if (drop) {
          drop.targetPlayer = rp;
        } else {
          game.drops.push({
            x: msg.dropX,
            y: msg.dropY,
            vx: 0,
            vy: 0,
            fh: null,
            amount: 50,
            t: 0.15,
            picked: 0,
            targetPlayer: rp,
            isCosmetic: true,
          });
        }
      }
    } else if (msg.t === "chat") {
      if (msg.id === game.wsId) return;
      if (msg.kind === "whisper") {
        const sender = msg.name || "Unknown";
        game.onChat("whisper", `From @${sender} : ${msg.text}`, msg.itemLink);
        window.dispatchEvent(new CustomEvent("chat-whisper-received", { detail: { from: sender } }));
        return;
      }
      const rp = game.remotePlayers.get(msg.id);
      if (rp && msg.kind === "say") {
        rp.balloon = { text: msg.text, t: 5 };
      }
      game.onChat((msg.kind as ChatKind) || "say", msg.kind === "say" ? `${msg.name} : ${msg.text}` : msg.text, msg.itemLink);
    } else if (msg.t === "asset_res") {
      EngineAssetBridge.handleAssetRes(msg);
      return;
    } else if (msg.t === "pong") {
      if (typeof msg.sentAt === "number") {
        game.wsPing = Math.max(0, Math.round(performance.now() - msg.sentAt));
      }
    } else if (msg.t === "force_warp") {
      const mapId = Number(msg.mapId || 910000000);
      const tx = typeof msg.x === "number" ? msg.x : game.p.x;
      const ty = typeof msg.y === "number" ? msg.y : game.p.y;
      game.warpToLocation(mapId, tx, ty);
      if (msg.reason) game.onChat("notice", `[GM] ${msg.reason}`);
    } else if (msg.t === "guild_update") {
      clearGuildTagCache();
      game.guild = msg.guild || null;
      if (msg.guild) {
        game.guildId = msg.guild.id;
        game.guildName = msg.guild.name;
        game.guildEmblem = msg.guild.emblem ? {
          ...msg.guild.emblem,
          beamEffect: msg.guild.emblem.beamEffect || "gold",
          beamMotion: msg.guild.emblem.beamMotion || "rotate",
        } : undefined;
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
      clearGuildTagCache();
      const resolvedEmblem = msg.guildEmblem ? {
        ...msg.guildEmblem,
        beamEffect: msg.guildEmblem.beamEffect || "gold",
        beamMotion: msg.guildEmblem.beamMotion || "rotate",
      } : undefined;
      if (msg.id === game.wsId) {
        game.guildId = msg.guildId;
        game.guildName = msg.guildName;
        game.guildEmblem = resolvedEmblem;
      }
      const rp = game.remotePlayers.get(msg.id);
      if (rp) {
        rp.guildId = msg.guildId;
        rp.guildName = msg.guildName;
        rp.guildEmblem = resolvedEmblem;
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
    } else if (msg.t === "party_buff_gain") {
      const skillId = String(msg.skillId || "");
      const lv = Math.max(1, Number(msg.lv || 1));
      const dur = Math.max(1, Number(msg.dur || 60));
      const casterName = String(msg.casterName || "Party");
      if (skillId) {
        const existing = game.buffs[skillId];
        const nextLv = existing ? Math.max(existing.lv ?? game.lv(skillId), lv) : lv;
        game.buffs[skillId] = {
          left: dur,
          dur,
          lv: nextLv,
          from: existing && !existing.from ? undefined : casterName,
        };
        const art = game.skillArt[skillId];
        if (art?.effect.length) game.fx.push({ frames: art.effect, x: game.p.x, y: game.p.y, flip: game.p.face === 1, t: 0, follow: true });
        else if (art?.effect0?.length) game.fx.push({ frames: art.effect0, x: game.p.x, y: game.p.y, flip: game.p.face === 1, t: 0, follow: true });
        game.recalc();
        game.onChange();
        NetworkSystem.sendPartySync(game);
      }
    } else if (msg.t === "party_buff_sync") {
      const activeBuffs = msg.activeBuffs as Record<string, { left: number; dur: number; lv: number }> | undefined;
      const casterName = String(msg.casterName || "Party");
      if (activeBuffs && typeof activeBuffs === "object") {
        let changed = false;
        for (const [skillId, b] of Object.entries(activeBuffs)) {
          if (!b || b.left <= 0) continue;
          const existing = game.buffs[skillId];
          const lv = Math.max(1, Number(b.lv || 1));
          const dur = Math.max(1, Number(b.dur || b.left));
          if (!existing || (existing.lv ?? game.lv(skillId)) < lv || existing.left + 2 < b.left) {
            game.buffs[skillId] = {
              left: b.left,
              dur,
              lv: Math.max(existing?.lv ?? 0, lv),
              from: existing && !existing.from ? undefined : casterName,
            };
            changed = true;
          }
        }
        if (changed) {
          game.recalc();
          game.onChange();
          NetworkSystem.sendPartySync(game);
        }
      }
    } else if (msg.t === "gm_heal") {
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
      game.onChat("notice", "[GM] You received a divine healing blessing!");
      game.onChange();
    } else if (msg.t === "gm_meso") {
      const amt = Number(msg.amount || 1000000);
      game.stats.meso = (game.stats.meso || 0) + amt;
      game.onChat("notice", `[GM] You received +${amt.toLocaleString()} mesos!`);
      game.onChange();
    } else if (msg.t === "gm_exp") {
      const amt = Number(msg.amount || 10000);
      CombatSystem.gainExp(game, amt);
      game.onChat("notice", `[GM] You received +${amt.toLocaleString()} EXP!`);
    } else if (msg.t === "gm_levelup") {
      const levels = Math.max(1, Number(msg.levels || 1));
      game.stats.level = (game.stats.level || 1) + levels;
      game.stats.ap = (game.stats.ap || 0) + 5 * levels;
      game.stats.sp = (game.stats.sp || 0) + 3 * levels;
      game.stats.maxHp += 30 * levels;
      game.stats.hp = game.stats.maxHp;
      game.onChat("notice", `★ [GM Blessing] Advanced to Level ${game.stats.level}!`);
      game.onChange();
    } else if (msg.t === "gm_mute") {
      (game as any).isMuted = Boolean(msg.muted ?? true);
      game.onChat("notice", "[GM] You have been muted by a GameMaster.");
    } else if (msg.t === "gm_freeze") {
      (game as any).isFrozen = Boolean(msg.frozen ?? true);
      game.onChat("notice", msg.frozen ? "[GM] You have been immobilized by a GameMaster." : "[GM] You have been thawed.");
    } else if (msg.t === "clear_drops") {
      if (Array.isArray(game.drops)) {
        game.drops = [];
      }
      game.onChat("notice", "[GM] All ground items have been cleared from this area.");
    } else if (msg.t === "auction_update") {
      if (Array.isArray(msg.listings)) {
        game.ah.listings = msg.listings;
      }
      if (Array.isArray(msg.mine)) {
        game.ah.mine = msg.mine;
      }
      game.onChange();
    } else if (msg.t === "auction_sold" && msg.listing) {
      const l = msg.listing;
      const existing = game.ah.mine.find((m) => m.lid === l.lid);
      if (existing) {
        existing.sold = true;
        existing.soldCurrency = l.soldCurrency || "meso";
      }
      const isNx = l.soldCurrency === "nx";
      const amt = isNx ? (l.priceNx ?? l.price) : l.price;
      const currStr = isNx ? "NX" : "mesos";
      game.onChat("notice", `★ [Auction House] Your listing was purchased by ${l.buyer || "an adventurer"} for ${Number(amt || 0).toLocaleString()} ${currStr}! Collect it in the Auction House (H).`);
      game.onChange();
    } else if (msg.t === "gm_power") {
      const power = String(msg.power || "");
      const val = msg.value;
      if (power === "gmEffect") {
        game.gmEffect = Boolean(val);
        try { localStorage.setItem("ms_gm_effect", String(game.gmEffect)); } catch {}
        game.updateActiveItemEffs();
        game.refreshLook();
        game.syncAll();
        game.onChat("notice", `★ [GM Power] Wizet Overhead GM Effect ${game.gmEffect ? "ENABLED" : "DISABLED"} by GameMaster!`);
        game.onChange();
      } else if (power === "godMode") {
        game.godMode = Boolean(val);
        game.syncAll();
        game.onChat("notice", `★ [GM Power] God Mode (Damage Immunity) ${game.godMode ? "ENABLED" : "DISABLED"} by GameMaster!`);
        game.onChange();
      } else if (power === "infiniteMp") {
        game.infiniteMp = Boolean(val);
        game.syncAll();
        game.onChat("notice", `★ [GM Power] Infinite MP (0 Skill Cost) ${game.infiniteMp ? "ENABLED" : "DISABLED"} by GameMaster!`);
        game.onChange();
      } else if (power === "oneHitKill") {
        game.oneHitKill = Boolean(val);
        game.syncAll();
        game.onChat("notice", `★ [GM Power] 1-Hit Kill (9.99M Damage) ${game.oneHitKill ? "ENABLED" : "DISABLED"} by GameMaster!`);
        game.onChange();
      } else if (power === "gmHide") {
        game.gmHide = Boolean(val);
        game.syncAll();
        game.onChat("notice", `★ [GM Power] GM Hide (Invisibility) ${game.gmHide ? "ENABLED" : "DISABLED"} by GameMaster!`);
        game.onChange();
      } else if (power === "autoCombat") {
        game.setAutoBattle(Boolean(val));
        game.onChat("notice", `★ [GM Power] Auto-Combat ${game.auto.battle ? "ENABLED" : "DISABLED"} by GameMaster!`);
      } else if (power === "speedMultiplier") {
        game.speedMultiplier = Number(val || 1.0);
        game.syncAll();
        game.onChat("notice", `★ [GM Power] Speed Multiplier set to ${game.speedMultiplier}x by GameMaster!`);
        game.onChange();
      } else if (power === "maxSkills") {
        if (typeof (game as any).maxAllSkills === "function") {
          (game as any).maxAllSkills();
        }
        game.onChat("notice", "★ [GM Power] All class skills maxed out by GameMaster!");
        game.onChange();
      } else if (power === "grantGm") {
        game.setGm(Boolean(val));
        game.syncAll();
        game.onChat("notice", `★ [GM Power] GameMaster privileges ${val ? "GRANTED" : "REVOKED"}!`);
        game.onChange();
      }
      window.dispatchEvent(new CustomEvent("gm-powers-updated"));
    }
  }
}
