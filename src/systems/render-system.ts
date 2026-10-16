import type { Renderer, Tex } from "../gpu.ts";
import type { Assets, Sprite } from "../assets.ts";
import type { Game } from "../game.ts";
import {
  type Back,
  type DmgText,
  type Fx,
  type ItemEffData,
  type ItemEffFrame,
  type Mob,
  type RemotePlayer,
  charUrlFor,
  DEFAULT_LOOK,
  expToLevel,
} from "../game-types.ts";
import { itemIconRaw } from "../skills.ts";
import { PetSystem } from "./pet-system.ts";
import { type GuildEmblem, EMBLEM_COLORS, guildEmblemUrl } from "../guild.ts";
import { getWeaponType } from "../items.ts";

const textTexCache = new Map<string, Tex>();
const textTexPending = new Set<string>();

const balloonSlices: Record<string, HTMLImageElement> = {};
let balloonSlicesLoaded = false;
let balloonSlicesLoading = false;

function loadBalloonSlices() {
  if (balloonSlicesLoaded || balloonSlicesLoading || typeof Image === "undefined") return;
  balloonSlicesLoading = true;
  const parts = ["nw", "n", "ne", "w", "c", "e", "sw", "s", "se", "arrow"];
  let loaded = 0;
  for (const p of parts) {
    const img = new Image();
    img.src = `/wz/ui/ChatBalloon/0/${p}`;
    img.onload = () => {
      loaded++;
      if (loaded === parts.length) {
        balloonSlicesLoaded = true;
        balloonSlicesLoading = false;
        for (const [k] of textTexCache) {
          if (k.startsWith("balloon:")) textTexCache.delete(k);
        }
      }
    };
    img.onerror = () => {
      balloonSlicesLoading = false;
    };
    balloonSlices[p] = img;
  }
}
loadBalloonSlices();

export function renderTextTexture(r: Renderer, text: string, type: "name" | "balloon"): Tex | null {
  const key = `${type}:${text}`;
  const hit = textTexCache.get(key);
  if (hit) return hit;
  if (textTexPending.has(key)) return null;
  textTexPending.add(key);

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (type === "name") {
      ctx.font = "bold 11px Tahoma, Arial, sans-serif";
      const tm = ctx.measureText(text);
      const tw = Math.ceil(tm.width);
      const padX = 6;
      const w = Math.max(24, tw + padX * 2);
      const h = 16;
      canvas.width = w;
      canvas.height = h;

      ctx.font = "bold 11px Tahoma, Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";

      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      ctx.beginPath();
      if ((ctx as any).roundRect) (ctx as any).roundRect(0, 0, w, h, 3);
      else ctx.rect(0, 0, w, h);
      ctx.fill();

      ctx.strokeStyle = "rgba(60, 60, 60, 0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, w / 2, h / 2 + 0.5);
    } else {
      ctx.font = "bold 12px Arial, Tahoma, sans-serif";
      const tm = ctx.measureText(text);
      const tw = Math.ceil(tm.width);

      const padX = 6;
      const contentW = Math.max(28, tw + padX * 2);
      const contentH = 14;

      const cornerW = balloonSlices.nw ? balloonSlices.nw.naturalWidth : 4;
      const cornerH = balloonSlices.nw ? balloonSlices.nw.naturalHeight : 4;
      const arrowH = balloonSlices.arrow ? balloonSlices.arrow.naturalHeight : 4;

      const totalW = contentW + cornerW * 2;
      const bubbleH = contentH + cornerH * 2;
      const totalH = bubbleH + arrowH;

      canvas.width = totalW;
      canvas.height = totalH;

      if (balloonSlicesLoaded && balloonSlices.c) {
        ctx.drawImage(balloonSlices.nw, 0, 0);
        ctx.drawImage(balloonSlices.n, cornerW, 0, contentW, cornerH);
        ctx.drawImage(balloonSlices.ne, cornerW + contentW, 0);

        ctx.drawImage(balloonSlices.w, 0, cornerH, cornerW, contentH);
        ctx.drawImage(balloonSlices.c, cornerW, cornerH, contentW, contentH);
        ctx.drawImage(balloonSlices.e, cornerW + contentW, cornerH, cornerW, contentH);

        ctx.drawImage(balloonSlices.sw, 0, cornerH + contentH);
        ctx.drawImage(balloonSlices.s, cornerW, cornerH + contentH, contentW, cornerH);
        ctx.drawImage(balloonSlices.se, cornerW + contentW, cornerH + contentH);

        const arrowW = balloonSlices.arrow.naturalWidth;
        const arrowX = Math.round((totalW - arrowW) / 2);
        ctx.drawImage(balloonSlices.arrow, arrowX, bubbleH);
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#2b2b2b";
        ctx.lineWidth = 1.2;
        if ((ctx as any).roundRect) (ctx as any).roundRect(1, 1, totalW - 2, bubbleH - 2, 4);
        else ctx.rect(1, 1, totalW - 2, bubbleH - 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.font = "bold 12px Arial, Tahoma, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = "#000000";
      ctx.fillText(text, totalW / 2, cornerH + contentH / 2 + 1);
    }

    createImageBitmap(canvas).then((bmp) => {
      const tex = r.texture(bmp);
      textTexCache.set(key, tex);
      textTexPending.delete(key);
    }).catch(() => {
      textTexPending.delete(key);
    });
  } catch {
    textTexPending.delete(key);
  }

  return null;
}

export function renderGuildTagTexture(r: Renderer, guildName: string, emblem?: GuildEmblem): Tex | null {
  const emblemKey = emblem ? `${emblem.bgShape}_${emblem.bgColor}_${emblem.symbolShape}_${emblem.symbolColor}` : "0";
  const key = `guildtag:${guildName}:${emblemKey}`;
  const hit = textTexCache.get(key);
  if (hit) return hit;
  if (textTexPending.has(key)) return null;
  textTexPending.add(key);

  const buildTag = (emblemImg: HTMLImageElement | null) => {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        textTexPending.delete(key);
        return;
      }

      ctx.font = "bold 10px Tahoma, Arial, sans-serif";
      const tm = ctx.measureText(guildName);
      const tw = Math.ceil(tm.width);

      const hasEmblem = Boolean(emblem);
      const emblemW = hasEmblem ? 16 : 0;
      const padX = 5;
      const w = Math.max(28, tw + emblemW + padX * 2);
      const h = 17;
      canvas.width = w;
      canvas.height = h;

      ctx.font = "bold 10px Tahoma, Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.imageSmoothingEnabled = false;

      // Tag background
      ctx.fillStyle = "rgba(10, 15, 25, 0.78)";
      ctx.beginPath();
      if ((ctx as any).roundRect) (ctx as any).roundRect(0, 0, w, h, 3);
      else ctx.rect(0, 0, w, h);
      ctx.fill();

      ctx.strokeStyle = "rgba(100, 116, 139, 0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();

      let textStartX = padX;

      // Draw authentic WZ guild emblem (or fallback color crest)
      if (hasEmblem && emblem) {
        if (emblemImg && emblemImg.naturalWidth > 0) {
          ctx.drawImage(emblemImg, padX - 1, 1, 15, 15);
        } else {
          const bgHex = EMBLEM_COLORS[emblem.bgColor % 16]?.hex ?? "#ee1111";
          const symHex = EMBLEM_COLORS[emblem.symbolColor % 16]?.hex ?? "#eeeeee";
          ctx.fillStyle = bgHex;
          ctx.fillRect(padX, 2, 13, 13);
          ctx.fillStyle = symHex;
          ctx.fillRect(padX + 4, 6, 5, 5);
        }
        textStartX += 16;
      }

      // Guild text
      ctx.textAlign = "left";
      ctx.fillStyle = "#fef08a"; // Warm Maple guild gold
      ctx.fillText(guildName, textStartX, h / 2 + 0.5);

      createImageBitmap(canvas).then((bmp) => {
        const tex = r.texture(bmp);
        textTexCache.set(key, tex);
        textTexPending.delete(key);
      }).catch(() => {
        textTexPending.delete(key);
      });
    } catch {
      textTexPending.delete(key);
    }
  };

  if (emblem && typeof Image !== "undefined") {
    const img = new Image();
    img.onload = () => buildTag(img);
    img.onerror = () => buildTag(null);
    img.src = guildEmblemUrl(emblem);
  } else {
    buildTag(null);
  }

  return null;
}

export const STATUS_UI = {
  backgrnd: "/wz/sprite/UI/StatusBar3/mainBar/status/backgrnd",
  cover: "/wz/sprite/UI/StatusBar3/mainBar/status/layer:cover",
  hpBar: "/wz/sprite/UI/StatusBar3/mainBar/status/gauge/hp/layer:0",
  mpBar: "/wz/sprite/UI/StatusBar3/mainBar/status/gauge/mp/layer:0",
  lvTag: "/wz/sprite/UI/StatusBar3/mainBar/status/layer:Lv",
  aniHp: [
    "/wz/sprite/UI/StatusBar3/mainBar/status/aniHPGauge/0",
    "/wz/sprite/UI/StatusBar3/mainBar/status/aniHPGauge/1",
    "/wz/sprite/UI/StatusBar3/mainBar/status/aniHPGauge/2",
    "/wz/sprite/UI/StatusBar3/mainBar/status/aniHPGauge/3",
    "/wz/sprite/UI/StatusBar3/mainBar/status/aniHPGauge/4",
    "/wz/sprite/UI/StatusBar3/mainBar/status/aniHPGauge/5",
  ],
  lvNum: Array.from({ length: 10 }, (_, i) => `/wz/sprite/UI/StatusBar3/mainBar/status/lvNumber/${i}`),
  gaugeNum: Array.from({ length: 10 }, (_, i) => `/wz/sprite/UI/StatusBar3/mainBar/status/gauge/number/${i}`),
  gaugeSlash: "/wz/sprite/UI/StatusBar3/mainBar/status/gauge/number/slash",
};

export const EXP_UI = {
  backgrnd: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/backgrnd",
  effect: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/layer:effect",
  res: {
    "800": {
      back: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/800/layer:back",
      cover: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/800/layer:cover",
      gauge: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/800/layer:gauge",
    },
    "1024": {
      back: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/1024/layer:back",
      cover: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/1024/layer:cover",
      gauge: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/1024/layer:gauge",
    },
    "1280": {
      back: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/1280/layer:back",
      cover: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/1280/layer:cover",
      gauge: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/1280/layer:gauge",
    },
    "1366": {
      back: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/1366/layer:back",
      cover: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/1366/layer:cover",
      gauge: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/1366/layer:gauge",
    },
    "1920": {
      back: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/1920/layer:back",
      cover: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/1920/layer:cover",
      gauge: "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/1920/layer:gauge",
    },
  },
  num: {
    ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `/wz/sprite/UI/StatusBar3/mainBar/EXPBar/number/${i}`])),
    "[": "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/number/[",
    "]": "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/number/]",
    "%": "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/number/%25",
    ".": "/wz/sprite/UI/StatusBar3/mainBar/EXPBar/number/dot",
  } as Record<string, string>,
};

export const MENU_UI = {
  buttons: [
    { id: "cashShop", name: "button:CashShop", title: "Cash Shop (CS)" },
    { id: "event", name: "button:Event", title: "Daily Gift & Events" },
    { id: "character", name: "button:Character", title: "Character Menu (S / E / I / K)" },
    { id: "community", name: "button:Community", title: "Party & Guild (P / G)" },
    { id: "setting", name: "button:Setting", title: "Settings & Key Config (\\)" },
    { id: "menu", name: "button:Menu", title: "Game Guide & Menu" },
  ],
  sprites: (btnName: string, state: "normal" | "mouseOver" | "pressed") =>
    `/wz/sprite/UI/StatusBar3/mainBar/menu/${btnName}/${state}/0`,
  notify: Array.from({ length: 6 }, (_, i) => `/wz/sprite/UI/StatusBar3/mainBar/menu/Notify/${i}`),
  submenu: {
    items: {
      character: [
        { id: "stat", label: "button:Stat", title: "Character Stats (S)" },
        { id: "skill", label: "button:Skill", title: "Skills (K)" },
        { id: "equip", label: "button:Equip", title: "Equipment (E)" },
        { id: "item", label: "button:Item", title: "Inventory (I)" },
      ],
      community: [
        { id: "bossParty", label: "button:bossParty", title: "Party (P)" },
        { id: "guild", label: "button:guild", title: "Guild (G)" },
      ],
      setting: [
        { id: "keySetting", label: "button:keySetting", title: "Key Config (\\)" },
      ],
      menu: [
        { id: "guide", label: "button:Help", title: "Game Guide" },
        { id: "quest", label: "button:quest", title: "Quest Log" },
      ],
    } as Record<string, { id: string; label: string; title: string }[]>,
    sprite: (category: string, itemLabel: string, state: "normal" | "mouseOver" | "pressed") =>
      `/wz/sprite/UI/StatusBar3/mainBar/submenu/${category}/${itemLabel}/${state}/0`,
  },
};

export class WebGpuMenuInput {
  static mouseX = -1;
  static mouseY = -1;
  static isDown = false;
  static hoveredBtnId: string | null = null;
  static activeSubmenu: string | null = null;
  static hoveredSubmenuItem: string | null = null;
  static installed = false;

  static install(canvas: HTMLCanvasElement, game: Game) {
    if (this.installed || !canvas) return;
    this.installed = true;

    window.addEventListener("pointermove", (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = Math.round(e.clientX - rect.left);
      this.mouseY = Math.round(e.clientY - rect.top);
    });

    window.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.isDown = true;
    });

    window.addEventListener("pointerup", (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.isDown = false;
      this.handleClick(game);
    });
  }

  static handleClick(game: Game) {
    const win = (game as any).windows ?? (game as any).hud?.wins ?? (window as any).__windows ?? (window as any).__game?.hud?.wins;

    if (this.hoveredSubmenuItem) {
      const it = this.hoveredSubmenuItem;
      this.activeSubmenu = null;
      if (it === "stat" && win) win.toggle(win.stat);
      else if (it === "skill" && win) win.toggle(win.skill);
      else if (it === "equip" && win) win.toggle(win.ext.equipWin);
      else if (it === "item" && win) win.toggle(win.ext.invWin);
      else if (it === "bossParty" && win) win.toggle(win.partyWin);
      else if (it === "guild" && win) win.toggle(win.guildWin);
      else if (it === "keySetting" && win) win.toggle(win.keyConfigWin);
      else if (it === "guide" && win) win.toggle(win.guideWin);
      else if (it === "quest") (game as any).hud?.showDailyGift?.();
      return;
    }

    if (this.hoveredBtnId) {
      const bid = this.hoveredBtnId;
      if (bid === "cashShop") {
        this.activeSubmenu = null;
        const w = (game as any).windows ?? (game as any).hud?.wins;
        w?.ext?.items?.open?.();
      } else if (bid === "event") {
        this.activeSubmenu = null;
        (game as any).hud?.showDailyGift?.();
      } else if (bid === "character") {
        this.activeSubmenu = this.activeSubmenu === "character" ? null : "character";
      } else if (bid === "community") {
        this.activeSubmenu = this.activeSubmenu === "community" ? null : "community";
      } else if (bid === "setting") {
        this.activeSubmenu = this.activeSubmenu === "setting" ? null : "setting";
      } else if (bid === "menu") {
        this.activeSubmenu = this.activeSubmenu === "menu" ? null : "menu";
      }
      return;
    }

    if (this.activeSubmenu) {
      this.activeSubmenu = null;
    }
  }
}

export class WorldRenderer {
  public static draw(game: Game) {
    const r = game.r;
    r.resize();
    r.begin();
    if (!game.map) {
      r.end();
      return;
    }
    const cx = Math.round(game.cam.x), cy = Math.round(game.cam.y);
    WorldRenderer.drawBacks(game, false, cx, cy);

    const mt = game.assets.get(game.map.render);
    if (mt) {
      r.draw(mt, -game.map.renderOrigin.x - cx, -game.map.renderOrigin.y - cy);
    } else {
      game.assets.load(game.map.render);
    }

    // Background Animated Objects (waterfalls, Free Market portal, crystals, nature)
    WorldRenderer.drawAniObjs(game, false, cx, cy);

    // Portals
    const pf: Sprite[] = game.fxData?.portal;
    if (pf?.length && game.portals.length) {
      const ready = pf.filter((f) => f.w > 2 && f.h > 2);
      let fr: Sprite | null = null;
      let tex: Tex | null = null;
      if (ready.length) {
        const total = ready.reduce((n, f) => n + (f.delay ?? 100), 0) || 700;
        let t = (game.time * 1000) % total;
        fr = ready[ready.length - 1];
        for (const f of ready) {
          const d = f.delay ?? 100;
          if (t < d) { fr = f; break; }
          t -= d;
        }
        tex = game.assets.get(fr.url);
        if (tex) {
          game.lastPortalTex = tex;
          game.lastPortalFr = fr;
        }
      }
      if (!tex && game.lastPortalTex && game.lastPortalFr) {
        tex = game.lastPortalTex;
        fr = game.lastPortalFr;
      }
      if (tex && fr) {
        for (const pt of game.portals) {
          if (pt.custom || pt.secret) continue;
          r.draw(tex, Math.round(pt.x - fr.ox - cx), Math.round(pt.y - fr.oy - cy), fr.w, fr.h);
          if (pt.label) {
            WorldRenderer.drawNameTag(r, pt.label, pt.x, pt.y - 80, cx, cy);
          }
        }
      }
    }

    // Secret Teleporters (Intra-map X to Y teleporters)
    for (const pt of game.portals) {
      if (!pt.secret || pt.targetX === undefined || pt.targetY === undefined) continue;
      const dist = Math.hypot(game.p.x - pt.x, game.p.y - pt.y);
      const isNear = dist < 70;

      // Subtle mystical floating sparkles at secret spot
      const t = game.time;
      const sparkAlpha = 0.4 + 0.3 * Math.sin(t * 4 + pt.x);
      const sparkY = Math.sin(t * 3 + pt.x) * 4;
      const sparkX = Math.cos(t * 2.5 + pt.y) * 6;
      r.rect(Math.round(pt.x + sparkX - 2 - cx), Math.round(pt.y - 20 + sparkY - cy), 4, 4, [1, 0.88, 0.35, sparkAlpha]);
      r.rect(Math.round(pt.x - sparkX * 0.7 - 1 - cx), Math.round(pt.y - 35 - sparkY * 0.6 - cy), 3, 3, [0.4, 0.9, 1, sparkAlpha * 0.8]);

      // When player walks near the secret teleporter, show interactive prompt
      if (isNear) {
        const prompt = `[↑] ${pt.label || "Secret Teleport"}`;
        WorldRenderer.drawNameTag(r, prompt, pt.x, pt.y - 48, cx, cy);
      }
    }

    // Mobs
    for (const m of game.mobs) WorldRenderer.drawMob(game, m, cx, cy);

    // Drops
    for (const d of game.drops) {
      if (d.item || d.mat || d.gear) {
        const iconUrl = itemIconRaw(d.item ?? d.mat ?? d.gear!.id);
        const t = game.assets.get(iconUrl);
        if (!t) {
          game.assets.load(iconUrl);
          continue;
        }
        if (d.gear && d.gear.rarity > 0) {
          const c = [[1, 1, 1], [0.4, 0.85, 1], [0.78, 0.49, 1], [1, 0.8, 0.2], [0.36, 1, 0.48]][d.gear.rarity];
          const pulse = 0.35 + 0.25 * Math.sin(game.time * 6);
          r.rect(Math.round(d.x - 12 - cx), Math.round(d.y - 4 - cy), 24, 4, [c[0], c[1], c[2], pulse]);
        }
        r.draw(
          t,
          Math.round(d.x - t.w / 2 - cx),
          Math.round(d.y - t.h - cy - (d.fh ? Math.abs(Math.sin(d.t * 3)) * 3 : 0)),
          t.w,
          t.h,
          { alpha: d.picked ? Math.max(0, 1 - d.picked / 0.45) : 1 }
        );
        continue;
      }
      const fr: Sprite = game.fxData.meso[Math.floor(d.t * 8) % game.fxData.meso.length];
      const t = fr && game.assets.get(fr.url);
      if (t) {
        r.draw(
          t,
          d.x - fr.ox - cx,
          d.y - fr.oy - cy - (d.fh ? Math.abs(Math.sin(d.t * 3)) * 3 : 0),
          fr.w,
          fr.h,
          { alpha: d.picked ? Math.max(0, 1 - d.picked / 0.45) : 1 }
        );
      }
    }

    // Remote Players
    for (const rp of game.remotePlayers.values()) {
      WorldRenderer.drawRemotePlayer(game, rp, cx, cy);
    }

    // Active Pets
    WorldRenderer.drawPets(game, cx, cy);

    // Main Player
    WorldRenderer.drawPlayer(game, cx, cy);

    // Visual FX
    for (const f of game.fx) WorldRenderer.drawFx(game, f, cx, cy);

    // Projectiles
    for (const pr of game.projectiles) {
      if (pr.t < 0) continue;
      let fr: Sprite | null = null;
      if (pr.skillId) {
        const art = game.skillArt[pr.skillId];
        if (art?.ball?.length) {
          fr = art.ball[Math.floor(pr.t * 12) % art.ball.length];
        } else if (game.throwingStarFrames.length > 0 && (pr.skillId.startsWith("4") || game.stats.classId === "thief")) {
          fr = game.throwingStarFrames[Math.floor(game.time * 24) % game.throwingStarFrames.length];
        } else if (art?.effect?.length) {
          fr = art.effect[0];
        }
      }
      if (!fr) {
        const wepId = game.eq.weapon?.id ?? 1302000;
        const wepType = getWeaponType(wepId);
        if (wepType === "bow" || wepType === "crossbow" || game.stats.classId === "bowman") {
          const arrowArt = game.skillArt["3001004"];
          if (arrowArt?.ball?.length) {
            fr = arrowArt.ball[Math.floor(pr.t * 12) % arrowArt.ball.length];
          }
        } else if (wepType === "claw" || game.stats.classId === "thief" || game.p.skill?.startsWith("4")) {
          if (game.throwingStarFrames.length > 0) {
            fr = game.throwingStarFrames[Math.floor(game.time * 24) % game.throwingStarFrames.length];
          }
        } else if (wepType === "gun" || game.stats.classId === "pirate") {
          const bulletArt = game.skillArt["5011002"] ?? game.skillArt["5001003"];
          if (bulletArt?.ball?.length) {
            fr = bulletArt.ball[Math.floor(pr.t * 12) % bulletArt.ball.length];
          }
        }
      }
      if (!fr) fr = game.snailShell;
      if (!fr) continue;
      const st = game.assets.get(fr.url);
      if (st) {
        const ox = fr.ox ?? Math.round(fr.w / 2);
        const oy = fr.oy ?? Math.round(fr.h / 2);
        const art = pr.skillId ? game.skillArt[pr.skillId] : null;
        const isStar = game.throwingStarFrames.includes(fr);
        const movingRight = pr.target ? pr.target.x >= pr.x : game.p.face === 1;
        const flip = (art?.ball && art.ball.length > 1)
          ? (Math.floor(pr.t * 12) % 2 === 0)
          : (isStar ? (Math.floor(game.time * 20) % 2 === 0) : movingRight);
        r.draw(st, Math.round(pr.x - ox - cx), Math.round(pr.y - oy - cy), fr.w, fr.h, { flip, alpha: 1.0 });
      } else {
        game.assets.load(fr.url);
      }
    }

    // Mob HP Bars & Damage Text
    for (const m of game.mobs) WorldRenderer.drawMobHp(game, m, cx, cy);
    for (const d of game.dmg) WorldRenderer.drawDamage(game, d, cx, cy);

    // Foreground Animated Objects (layer >= 7)
    WorldRenderer.drawAniObjs(game, true, cx, cy);

    // Foregrounds & screen fades
    WorldRenderer.drawBacks(game, true, cx, cy);
    if (game.fade > 0) r.rect(0, 0, r.width, r.height, [0, 0, 0, game.fade]);
    if (game.loadingMap) r.rect(0, 0, r.width, r.height, [0, 0, 0, 1]);

    // WebGPU UI: Draw HP/MP status panel, EXP bar, and menu buttons directly from authentic .wz assets
    WorldRenderer.drawHpMpPanel(game);
    WorldRenderer.drawExpBar(game);
    WorldRenderer.drawMenuButtons(game);

    r.end();
  }

  public static drawHpMpPanel(game: Game) {
    if (!game.stats || game.loadingMap) return;
    const r = game.r;

    // Anchor with .ms-hud-center DOM element if present, otherwise bottom center
    const totalW = 424;
    const centerEl = typeof document !== "undefined" ? document.querySelector(".ms-hud-center") : null;
    const rect = centerEl?.getBoundingClientRect();
    const panelW = 204;
    const panelH = 70;
    const x = (rect && rect.width > 0)
      ? Math.round(rect.left + (rect.width - totalW) / 2)
      : Math.round((r.width - totalW) / 2);
    const y = (rect && rect.height > 0)
      ? Math.round(rect.top + (rect.height - panelH) / 2)
      : Math.round(r.height - panelH - 18);

    // 1. Panel Background
    const bgTex = game.assets.get(STATUS_UI.backgrnd);
    if (bgTex) {
      r.draw(bgTex, x + 2, y + 24, 198, 37);
    } else {
      game.assets.load(STATUS_UI.backgrnd);
    }

    // 2. HP Bar Fill & Fluid Animation
    const maxHp = Math.max(1, game.stats.maxHp || 50);
    const hp = Math.max(0, Math.min(maxHp, game.stats.hp ?? maxHp));
    const hpRatio = hp / maxHp;
    const hpFillW = Math.round(171 * hpRatio);

    const hpTex = game.assets.get(STATUS_UI.hpBar);
    if (hpTex) {
      if (hpFillW > 0) {
        r.draw(hpTex, x + 24, y + 28, hpFillW, 13, { sx: 0, sy: 0, sw: hpFillW, sh: 13 });
      }
    } else {
      game.assets.load(STATUS_UI.hpBar);
    }

    if (hpFillW > 0) {
      const frameIdx = Math.floor((game.time * 8) % 6);
      const aniUrl = STATUS_UI.aniHp[frameIdx];
      const aniTex = game.assets.get(aniUrl);
      if (aniTex) {
        const aniW = Math.min(hpFillW, 169);
        r.draw(aniTex, x + 25, y + 29, aniW, 11, { sx: 0, sy: 0, sw: aniW, sh: 11, alpha: 0.85 });
      } else {
        game.assets.load(aniUrl);
      }
    }

    // 3. MP Bar Fill
    const maxMp = Math.max(1, game.stats.maxMp || 20);
    const mp = Math.max(0, Math.min(maxMp, game.stats.mp ?? maxMp));
    const mpRatio = mp / maxMp;
    const mpFillW = Math.round(171 * mpRatio);

    const mpTex = game.assets.get(STATUS_UI.mpBar);
    if (mpTex) {
      if (mpFillW > 0) {
        r.draw(mpTex, x + 24, y + 44, mpFillW, 13, { sx: 0, sy: 0, sw: mpFillW, sh: 13 });
      }
    } else {
      game.assets.load(STATUS_UI.mpBar);
    }

    // 4. Status Bar Cover (Metallic Bezel, Borders & Shadows)
    const coverTex = game.assets.get(STATUS_UI.cover);
    if (coverTex) {
      r.draw(coverTex, x - 1, y, 204, 70);
    } else {
      game.assets.load(STATUS_UI.cover);
    }

    // 5. Level Tag & Level Digits
    const lvTag = game.assets.get(STATUS_UI.lvTag);
    if (lvTag) {
      r.draw(lvTag, x + 24, y + 8, 15, 10);
    } else {
      game.assets.load(STATUS_UI.lvTag);
    }

    const lvStr = String(game.stats.level || 1);
    let curLvX = x + 41;
    for (let i = 0; i < lvStr.length; i++) {
      const digit = Number(lvStr[i]);
      const digUrl = STATUS_UI.lvNum[digit];
      const digTex = digUrl ? game.assets.get(digUrl) : null;
      if (digTex) {
        r.draw(digTex, curLvX, y + 8, digTex.w, digTex.h);
        curLvX += digTex.w + 1;
      } else if (digUrl) {
        game.assets.load(digUrl);
      }
    }

    // Helper: Draw gauge numbers (centered over 171px gauge)
    const drawGaugeNumbers = (text: string, centerY: number) => {
      let totalW = 0;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === "/") totalW += 7;
        else if (c === " ") totalW += 3;
        else if (c >= "0" && c <= "9") totalW += (c === "1" ? 4 : 7);
      }
      let curX = Math.round(x + 24 + (171 - totalW) / 2);
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === "/") {
          const slashTex = game.assets.get(STATUS_UI.gaugeSlash);
          if (slashTex) {
            r.draw(slashTex, curX, centerY + 1, slashTex.w, slashTex.h);
            curX += slashTex.w + 1;
          } else {
            game.assets.load(STATUS_UI.gaugeSlash);
            curX += 8;
          }
        } else if (c === " ") {
          curX += 3;
        } else if (c >= "0" && c <= "9") {
          const digUrl = STATUS_UI.gaugeNum[Number(c)];
          const digTex = digUrl ? game.assets.get(digUrl) : null;
          if (digTex) {
            r.draw(digTex, curX, centerY, digTex.w, digTex.h);
            curX += digTex.w + 1;
          } else {
            if (digUrl) game.assets.load(digUrl);
            curX += (c === "1" ? 5 : 8);
          }
        }
      }
    };

    // 6. Draw HP & MP Numbers
    drawGaugeNumbers(`${hp} / ${maxHp}`, y + 30);
    drawGaugeNumbers(`${mp} / ${maxMp}`, y + 46);
  }

  public static drawExpBar(game: Game) {
    if (!game.stats || game.loadingMap) return;
    const r = game.r;

    // Determine best resolution tier
    let resKey: "800" | "1024" | "1280" | "1366" | "1920" = "1920";
    if (r.width <= 900) resKey = "800";
    else if (r.width <= 1150) resKey = "1024";
    else if (r.width <= 1320) resKey = "1280";
    else if (r.width <= 1500) resKey = "1366";

    const res = EXP_UI.res[resKey];
    const expY = r.height - 10;

    // 1. Draw EXP Bar Background
    const backTex = game.assets.get(res.back);
    if (backTex) {
      r.draw(backTex, 0, expY, r.width, 10);
    } else {
      game.assets.load(res.back);
    }

    // 2. Draw EXP Fill Gauge
    const exp = Math.max(0, game.stats.exp || 0);
    const expNeed = Math.max(1, Math.round(expToLevel(game.stats.level || 1)));
    const expRatio = Math.min(1, Math.max(0, exp / expNeed));
    const maxGaugeW = r.width - 32;
    const fillW = Math.round(maxGaugeW * expRatio);

    const gaugeTex = game.assets.get(res.gauge);
    if (gaugeTex) {
      if (fillW > 0) {
        r.draw(gaugeTex, 16, expY + 2, fillW, 7, { sx: 0, sy: 0, sw: fillW, sh: 7 });
      }
    } else {
      game.assets.load(res.gauge);
    }

    // 3. Draw Spark Effect Glow at tip of fill
    if (fillW > 0) {
      const effTex = game.assets.get(EXP_UI.effect);
      if (effTex) {
        r.draw(effTex, 16 + fillW - 6, expY - 3, effTex.w, effTex.h);
      } else {
        game.assets.load(EXP_UI.effect);
      }
    }

    // 4. Draw Cover (graduation tick overlay)
    const coverTex = game.assets.get(res.cover);
    if (coverTex) {
      r.draw(coverTex, Math.round((r.width - coverTex.w) / 2), expY + 2, coverTex.w, 7);
    } else {
      game.assets.load(res.cover);
    }

    // 5. Draw Authentic EXP Numbers & Percentage
    const expPct = Math.min(100, (exp / expNeed) * 100);
    const text = `${exp.toLocaleString()} [${expPct.toFixed(2)}%]`;

    let totalW = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c >= "0" && c <= "9") totalW += (c === "1" ? 5 : 8);
      else if (c === "[") totalW += 8;
      else if (c === "]") totalW += 5;
      else if (c === "%") totalW += 10;
      else if (c === ".") totalW += 4;
      else if (c === ",") totalW += 4;
      else if (c === " ") totalW += 3;
    }

    let curX = Math.round((r.width - totalW) / 2);
    const textY = expY + 1;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c >= "0" && c <= "9") {
        const digUrl = EXP_UI.num[c];
        const digTex = digUrl ? game.assets.get(digUrl) : null;
        if (digTex) {
          r.draw(digTex, curX, textY, digTex.w, digTex.h);
          curX += digTex.w + 1;
        } else {
          if (digUrl) game.assets.load(digUrl);
          curX += (c === "1" ? 5 : 8);
        }
      } else if (c === "[" || c === "]" || c === "%" || c === ".") {
        const symUrl = EXP_UI.num[c];
        const symTex = symUrl ? game.assets.get(symUrl) : null;
        if (symTex) {
          const sy = c === "." ? textY + 5 : textY;
          r.draw(symTex, curX, sy, symTex.w, symTex.h);
          curX += symTex.w + 1;
        } else {
          if (symUrl) game.assets.load(symUrl);
          curX += (c === "%" ? 10 : c === "." ? 4 : 7);
        }
      } else if (c === ",") {
        const dotUrl = EXP_UI.num["."];
        const dotTex = dotUrl ? game.assets.get(dotUrl) : null;
        if (dotTex) {
          r.draw(dotTex, curX, textY + 5, dotTex.w, dotTex.h);
          curX += dotTex.w + 1;
        } else {
          curX += 4;
        }
      } else if (c === " ") {
        curX += 3;
      }
    }

    // 6. EXP Bar Hover Tooltip
    if (WebGpuMenuInput.mouseY >= expY - 4 && WebGpuMenuInput.mouseY <= r.height) {
      const tipText = `EXP: ${exp.toLocaleString()} / ${expNeed.toLocaleString()} (${expPct.toFixed(2)}%)`;
      const tipW = tipText.length * 7 + 16;
      const tipX = Math.max(10, Math.min(r.width - tipW - 10, WebGpuMenuInput.mouseX - tipW / 2));
      const tipY = expY - 24;
      r.rect(tipX, tipY, tipW, 18, [0.06, 0.09, 0.14, 0.92]);
      r.rect(tipX, tipY, tipW, 1, [0.4, 0.5, 0.65, 0.7]);
      r.rect(tipX, tipY + 17, tipW, 1, [0.4, 0.5, 0.65, 0.7]);
      r.rect(tipX, tipY, 1, 18, [0.4, 0.5, 0.65, 0.7]);
      r.rect(tipX + tipW - 1, tipY, 1, 18, [0.4, 0.5, 0.65, 0.7]);
      let tx = tipX + 8;
      for (let i = 0; i < tipText.length; i++) {
        const ch = tipText[i];
        if (ch >= "0" && ch <= "9") {
          const dTex = game.assets.get(STATUS_UI.gaugeNum[Number(ch)]);
          if (dTex) {
            r.draw(dTex, tx, tipY + 4, dTex.w, dTex.h);
            tx += dTex.w + 1;
          } else {
            tx += 7;
          }
        } else if (ch === "/") {
          const sTex = game.assets.get(STATUS_UI.gaugeSlash);
          if (sTex) {
            r.draw(sTex, tx, tipY + 4, sTex.w, sTex.h);
            tx += sTex.w + 1;
          } else {
            tx += 7;
          }
        } else if (ch === "%" || ch === ".") {
          const sTex = game.assets.get(EXP_UI.num[ch]);
          if (sTex) {
            r.draw(sTex, tx, ch === "." ? tipY + 9 : tipY + 4, sTex.w, sTex.h);
            tx += sTex.w + 1;
          } else {
            tx += 5;
          }
        } else {
          tx += 4;
        }
      }
    }
  }

  public static drawMenuButtons(game: Game) {
    if (!game.stats || game.loadingMap) return;
    const r = game.r;
    if (r.canvas) WebGpuMenuInput.install(r.canvas, game);

    // Anchor aligned with HP/MP status panel
    const totalW = 424;
    const centerEl = typeof document !== "undefined" ? document.querySelector(".ms-hud-center") : null;
    const rect = centerEl?.getBoundingClientRect();
    const x = (rect && rect.width > 0)
      ? Math.round(rect.left + (rect.width - totalW) / 2)
      : Math.round((r.width - totalW) / 2);
    const y = (rect && rect.height > 0)
      ? Math.round(rect.top + (rect.height - 70) / 2)
      : Math.round(r.height - 70 - 18);

    const menuX = x + 214;
    const menuY = y + 24;

    const mx = WebGpuMenuInput.mouseX;
    const my = WebGpuMenuInput.mouseY;

    let anyHovered = false;
    WebGpuMenuInput.hoveredBtnId = null;

    let activeBtnX = menuX;
    let activeBtnY = menuY;

    // Draw the 6 authentic StatusBar3 menu buttons
    for (let i = 0; i < MENU_UI.buttons.length; i++) {
      const btn = MENU_UI.buttons[i];
      const btnX = menuX + i * 35;
      const btnY = menuY;
      const isHover = mx >= btnX && mx < btnX + 34 && my >= btnY && my < btnY + 37;

      if (isHover) {
        anyHovered = true;
        WebGpuMenuInput.hoveredBtnId = btn.id;
      }

      if (btn.id === WebGpuMenuInput.activeSubmenu) {
        activeBtnX = btnX;
        activeBtnY = btnY;
      }

      let state: "normal" | "mouseOver" | "pressed" = "normal";
      if (btn.id === WebGpuMenuInput.activeSubmenu || (isHover && WebGpuMenuInput.isDown)) {
        state = "pressed";
      } else if (isHover) {
        state = "mouseOver";
      }

      const spriteUrl = MENU_UI.sprites(btn.name, state);
      const tex = game.assets.get(spriteUrl);
      if (tex) {
        r.draw(tex, btnX, btnY, 34, 37);
      } else {
        game.assets.load(spriteUrl);
      }

      // Flashing alert badge on Character button when AP or SP is available
      if (btn.id === "character" && (game.stats.ap > 0 || game.stats.sp > 0)) {
        const frameIdx = Math.floor((game.time * 6) % 6);
        const notifUrl = MENU_UI.notify[frameIdx];
        const notifTex = notifUrl ? game.assets.get(notifUrl) : null;
        if (notifTex) {
          r.draw(notifTex, btnX + 16, btnY - 8, notifTex.w, notifTex.h);
        } else if (notifUrl) {
          game.assets.load(notifUrl);
        }
      }
    }

    // Draw active submenu popup
    WebGpuMenuInput.hoveredSubmenuItem = null;
    if (WebGpuMenuInput.activeSubmenu) {
      const subItems = MENU_UI.submenu.items[WebGpuMenuInput.activeSubmenu as keyof typeof MENU_UI.submenu.items];
      if (subItems && subItems.length) {
        const subW = 109;
        const subX = Math.round(activeBtnX + (34 - subW) / 2);
        const totalItemsH = subItems.length * 27;
        const subY = activeBtnY - totalItemsH - 8;

        // Submenu background box
        r.rect(subX - 4, subY - 4, subW + 8, totalItemsH + 8, [0.08, 0.12, 0.18, 0.95]);
        r.rect(subX - 4, subY - 4, subW + 8, 1, [0.38, 0.48, 0.62, 0.8]);
        r.rect(subX - 4, subY + totalItemsH + 3, subW + 8, 1, [0.38, 0.48, 0.62, 0.8]);
        r.rect(subX - 4, subY - 4, 1, totalItemsH + 8, [0.38, 0.48, 0.62, 0.8]);
        r.rect(subX + subW + 3, subY - 4, 1, totalItemsH + 8, [0.38, 0.48, 0.62, 0.8]);

        for (let j = 0; j < subItems.length; j++) {
          const item = subItems[j];
          const itemY = subY + j * 27;
          const isItemHover = mx >= subX && mx < subX + subW && my >= itemY && my < itemY + 26;

          if (isItemHover) {
            anyHovered = true;
            WebGpuMenuInput.hoveredSubmenuItem = item.id;
          }

          const itemState: "normal" | "mouseOver" = isItemHover ? "mouseOver" : "normal";
          const itemUrl = MENU_UI.submenu.sprite(WebGpuMenuInput.activeSubmenu, item.label, itemState);
          const itemTex = game.assets.get(itemUrl);
          if (itemTex) {
            r.draw(itemTex, subX, itemY, subW, 26);
          } else {
            game.assets.load(itemUrl);
          }
        }
      }
    }

    // Set cursor style
    if (r.canvas) {
      if (anyHovered) {
        r.canvas.style.cursor = "pointer";
      } else if (r.canvas.style.cursor === "pointer") {
        r.canvas.style.cursor = "default";
      }
    }
  }

  public static drawAniObjs(game: Game, front: boolean, cx: number, cy: number) {
    if (!game.map?.aniObjs?.length) return;
    const r = game.r;
    for (const obj of game.map.aniObjs) {
      const isFront = obj.layer >= 7;
      if (isFront !== front) continue;
      if (!obj.frames || obj.frames.length === 0) continue;
      const total = obj.frames.reduce((sum, f) => sum + (f.delay ?? 100), 0) || 100;
      let tRem = (game.time * 1000) % total;
      let fr = obj.frames[obj.frames.length - 1];
      for (const f of obj.frames) {
        const d = f.delay ?? 100;
        if (tRem < d) {
          fr = f;
          break;
        }
        tRem -= d;
      }
      if (!fr || fr.w <= 1 || fr.h <= 1) continue; // Skip blank strobe frames
      const tex = game.assets.get(fr.url);
      if (!tex) {
        game.assets.load(fr.url);
        continue;
      }
      const drawX = obj.f ? obj.x - (fr.w - fr.ox) - cx : obj.x - fr.ox - cx;
      const drawY = obj.y - fr.oy - cy;
      r.draw(tex, Math.round(drawX), Math.round(drawY), fr.w, fr.h, { flip: obj.f });
    }
  }

  public static drawBacks(game: Game, front: boolean, cx: number, cy: number) {
    const r = game.r, W = r.width, H = r.height;
    const WO = W / 2, HO = H / 2;
    const camCenterX = cx + WO;
    const camCenterY = cy + HO;
    for (const b of game.map.backs) {
      if (b.front !== front) continue;
      let s = b.sprite;
      if (b.frames && b.frames.length > 0) {
        const total = b.frames.reduce((n, f) => n + (f.delay ?? 100), 0) || 100;
        let tRem = (game.time * 1000) % total;
        s = b.frames[b.frames.length - 1];
        for (const fr of b.frames) {
          const d = fr.delay ?? 100;
          if (tRem < d) {
            s = fr;
            break;
          }
          tRem -= d;
        }
      }
      const t = game.assets.get(s.url);
      if (!t) {
        game.assets.load(s.url);
        continue;
      }
      const cxx = b.cx || s.w, cyy = b.cy || s.h;
      const hmove = b.type === 4 || b.type === 6, vmove = b.type === 5 || b.type === 7;
      const htile = [1, 3, 4, 6, 7].includes(b.type), vtile = [2, 3, 5, 6, 7].includes(b.type);
      const ox = b.flip ? s.w - s.ox : s.ox;
      const baseX = (hmove ? b.x + game.time * b.rx * 5 - cx : b.x + WO + (b.rx * cx) / 100) - ox;
      const baseY = (vmove ? b.y + game.time * b.ry * 5 - cy : b.y + Math.min(HO, 300) + (b.ry * (camCenterY - 300)) / 100) - s.oy;

      const minI = htile ? Math.floor(-baseX / cxx) : 0;
      const maxI = htile ? Math.ceil((W - baseX) / cxx) : 0;
      const allowVTile = vtile || (b.type === 1 && s.h >= 600);
      const minJ = allowVTile ? Math.floor(-baseY / cyy) : 0;
      const maxJ = allowVTile ? Math.ceil((H - baseY) / cyy) : 0;

      for (let i = minI; i <= maxI; i++) {
        for (let j = minJ; j <= maxJ; j++) {
          r.draw(t, Math.round(baseX + i * cxx), Math.round(baseY + j * cyy), s.w, s.h, { flip: b.flip, alpha: b.a / 255 });
        }
      }
    }
  }

  public static drawNameTag(r: Renderer, name: string, x: number, y: number, cx: number, cy: number) {
    const tex = renderTextTexture(r, name, "name");
    if (tex) {
      r.draw(tex, Math.round(x - tex.w / 2 - cx), Math.round(y + 2 - cy), tex.w, tex.h);
    }
  }

  public static drawGuildTag(r: Renderer, guildName: string, emblem: GuildEmblem | undefined, x: number, y: number, cx: number, cy: number) {
    const tex = renderGuildTagTexture(r, guildName, emblem);
    if (tex) {
      r.draw(tex, Math.round(x - tex.w / 2 - cx), Math.round(y + 19 - cy), tex.w, tex.h);
    }
  }

  public static drawSpeechBalloon(r: Renderer, text: string, x: number, y: number, cx: number, cy: number) {
    const tex = renderTextTexture(r, text, "balloon");
    if (tex) {
      r.draw(tex, Math.round(x - tex.w / 2 - cx), Math.round(y - 75 - tex.h - cy), tex.w, tex.h);
    }
  }

  public static drawPartyOverheadBar(
    r: Renderer,
    hp: number,
    maxHp: number,
    mp: number,
    maxMp: number,
    isLeader: boolean,
    x: number,
    y: number,
    cx: number,
    cy: number
  ) {
    const barW = 40;
    const barH = 4;
    const mpH = 3;
    const drawX = Math.round(x - barW / 2 - cx);
    const drawY = Math.round(y - 74 - cy);

    const safeMaxHp = Math.max(1, maxHp);
    const safeMaxMp = Math.max(1, maxMp);
    const hpRatio = Math.max(0, Math.min(1, hp / safeMaxHp));
    const mpRatio = Math.max(0, Math.min(1, mp / safeMaxMp));

    // Outer frame/background with Maple translucent black
    r.rect(drawX - 2, drawY - 2, barW + 4, barH + mpH + 5, [0.05, 0.05, 0.08, 0.85]);

    // Party leader crown jewel / member gem marker
    if (isLeader) {
      r.rect(drawX - 6, drawY - 1, 3, 5, [1, 0.82, 0.15, 1]); // Golden Leader Crown Jewel
    } else {
      r.rect(drawX - 6, drawY, 3, 4, [0.3, 0.85, 1, 0.9]); // Cyan Party Gem
    }

    // HP background & fill
    r.rect(drawX, drawY, barW, barH, [0.25, 0.05, 0.05, 0.95]);
    if (hpRatio > 0) {
      r.rect(drawX, drawY, Math.max(1, Math.round(barW * hpRatio)), barH, [0.95, 0.18, 0.22, 1]);
    }

    // MP background & fill
    const mpY = drawY + barH + 1;
    r.rect(drawX, mpY, barW, mpH, [0.05, 0.12, 0.3, 0.95]);
    if (mpRatio > 0) {
      r.rect(drawX, mpY, Math.max(1, Math.round(barW * mpRatio)), mpH, [0.2, 0.55, 1, 1]);
    }
  }

  public static drawItemEffect(
    game: Game,
    eff: ItemEffData,
    x: number,
    y: number,
    face: number,
    anim: string,
    cx: number,
    cy: number,
    layer: "back" | "front"
  ) {
    let actionFrames: ItemEffFrame[] | undefined;
    if (anim === "ladder" || anim === "rope") {
      actionFrames = layer === "back"
        ? eff.actions[anim] ?? eff.actions.backDefault ?? eff.actions.default
        : eff.actions[anim + "2"];
    } else {
      const candidate = eff.actions[anim] ?? eff.actions.default;
      if (candidate?.length) {
        const isBack = (candidate[0]?.z ?? 0) < 0;
        if ((layer === "back" && isBack) || (layer === "front" && !isBack)) {
          actionFrames = candidate;
        }
      }
    }
    if (!actionFrames?.length) return;
    const totalDelay = actionFrames.reduce((acc, f) => acc + (f.delay ?? 100), 0) || 800;
    let t = (game.time * 1000) % totalDelay;
    let fr = actionFrames[0];
    for (const f of actionFrames) {
      const d = f.delay ?? 100;
      if (t < d) { fr = f; break; }
      t -= d;
    }
    const tex = game.assets.get(fr.url);
    if (!tex) {
      game.assets.load(fr.url);
      return;
    }
    const isFixed = Boolean(fr.fixed ?? eff.fixed);
    const flip = isFixed ? false : face === 1;
    const drawX = flip ? Math.round(x - (fr.w - fr.ox) - cx) : Math.round(x - fr.ox - cx);
    const anchorY = fr.pos === 1 ? y - 48 : fr.pos === 2 ? y - 25 : fr.pos === 3 ? y - 65 : y;
    const drawY = Math.round(anchorY - fr.oy - cy);
    game.r.draw(tex, drawX, drawY, fr.w, fr.h, { flip });
  }

  public static drawRemotePlayer(game: Game, rp: RemotePlayer, cx: number, cy: number) {
    const isFloating = game.hasHoverEffect(rp.look) && rp.anim !== "jump" && rp.anim !== "ladder" && rp.anim !== "rope";
    const hoverY = isFloating ? Math.round(Math.sin(game.time * 3.2) * 5 - 10) : 0;
    if (hoverY !== 0) {
      const shadowW = Math.max(12, 28 + Math.round(hoverY * 0.4));
      const shadowAlpha = Math.max(0.15, 0.35 + (hoverY / 30));
      game.r.rect(Math.round(rp.x - shadowW / 2 - cx), Math.round(rp.y - 2 - cy), shadowW, 4, [0, 0, 0, shadowAlpha * 0.6]);
      game.r.rect(Math.round(rp.x - (shadowW - 8) / 2 - cx), Math.round(rp.y - 1 - cy), Math.max(4, shadowW - 8), 2, [0, 0, 0, shadowAlpha]);
    }

    const drawPosY = rp.y + hoverY;

    const remoteEffs: ItemEffData[] = [];
    for (const id of rp.look) {
      if (!game.itemEffCache.has(id)) {
        game.itemEffCache.set(id, null);
        fetch(`/wz/data/item-eff/${id}`).then((r) => r.ok ? r.json() : null).then((data) => {
          if (data) {
            game.itemEffCache.set(id, data);
            for (const act of Object.values(data.actions as Record<string, ItemEffFrame[]>)) {
              for (const fr of act) game.assets.load(fr.url);
            }
          }
        }).catch(() => {});
      }
      const cached = game.itemEffCache.get(id);
      if (cached && !remoteEffs.some((e) => e.id === cached.id)) remoteEffs.push(cached);
    }
    for (const eff of remoteEffs) {
      WorldRenderer.drawItemEffect(game, eff, rp.x, drawPosY, rp.face, rp.anim, cx, cy, "back");
    }
    let t = game.assets.get(charUrlFor(rp.look, rp.anim, rp.frame))
      ?? game.assets.get(charUrlFor(rp.look, "stand1", 0));
    if (t) {
      rp.lastTex = t;
    } else if (rp.lastTex) {
      t = rp.lastTex;
    }
    if (t) {
      const ox = Math.round(t.w / 2);
      const oy = t.w === 96 && t.h === 96 ? 88 : t.h === 384 ? 256 : Math.round(t.h * (256 / 384));
      game.r.draw(t, Math.round(rp.x - ox - cx), Math.round(drawPosY - oy - cy), t.w, t.h, { flip: rp.face === 1 });
    }
    for (const eff of remoteEffs) {
      WorldRenderer.drawItemEffect(game, eff, rp.x, drawPosY, rp.face, rp.anim, cx, cy, "front");
    }
    WorldRenderer.drawNameTag(game.r, rp.name, rp.x, drawPosY, cx, cy);
    if (rp.guildName) {
      WorldRenderer.drawGuildTag(game.r, rp.guildName, rp.guildEmblem, rp.x, drawPosY, cx, cy);
    }
    if (game.party && game.party.members) {
      const mem = game.party.members.find(
        (m) => m.name.toLowerCase() === rp.name.toLowerCase()
      );
      if (mem) {
        WorldRenderer.drawPartyOverheadBar(
          game.r,
          mem.hp ?? 50,
          mem.maxHp ?? 50,
          mem.mp ?? 20,
          mem.maxMp ?? 20,
          mem.isLeader || mem.name.toLowerCase() === game.party.leaderName.toLowerCase(),
          rp.x,
          drawPosY,
          cx,
          cy
        );
      }
    }

    if (rp.balloon && rp.balloon.t > 0 && rp.balloon.text) {
      WorldRenderer.drawSpeechBalloon(game.r, rp.balloon.text, rp.x, drawPosY, cx, cy);
    }
  }

  public static drawPlayer(game: Game, cx: number, cy: number) {
    const p = game.p;
    const isFloating = game.hasHoverEffect() && !!p.fh && !p.ladder;
    const hoverY = isFloating ? Math.round(Math.sin(game.time * 3.2) * 5 - 10) : 0;
    if (hoverY !== 0) {
      const shadowW = Math.max(12, 28 + Math.round(hoverY * 0.4));
      const shadowAlpha = Math.max(0.15, 0.35 + (hoverY / 30));
      game.r.rect(Math.round(p.x - shadowW / 2 - cx), Math.round(p.y - 2 - cy), shadowW, 4, [0, 0, 0, shadowAlpha * 0.6]);
      game.r.rect(Math.round(p.x - (shadowW - 8) / 2 - cx), Math.round(p.y - 1 - cy), Math.max(4, shadowW - 8), 2, [0, 0, 0, shadowAlpha]);
    }

    const drawPosY = p.y + hoverY;

    // 1. Back item effects
    for (const eff of game.activeItemEffs) {
      WorldRenderer.drawItemEffect(game, eff, p.x, drawPosY, p.face, p.anim, cx, cy, "back");
    }

    // 2. Character sprite
    if (!game.look || !game.look.length) {
      game.look = [...DEFAULT_LOOK];
    }
    const currentUrl = charUrlFor(game.look, p.anim, p.frame, p.expr, p.exprFrame);
    let t = game.assets.get(currentUrl)
      ?? game.assets.get(charUrlFor(game.look, p.anim, p.frame))
      ?? game.assets.get(charUrlFor(game.look, "stand1", 0))
      ?? (game.prevLook.length ? game.assets.get(charUrlFor(game.prevLook, p.anim, p.frame)) : null);
    if (!game.assets.get(currentUrl)) {
      game.assets.load(currentUrl);
    }
    if (t) {
      game.lastPlayerTex = t;
    } else if (game.lastPlayerTex) {
      t = game.lastPlayerTex;
    }
    if (t) {
      const invulnBlink = p.invuln > 0 && Math.floor(game.time * 16) % 2 === 0;
      const isDarkSight = !!game.buffs["4001003"];
      const baseAlpha = invulnBlink ? 0.35 : (isDarkSight || game.gmHide ? 0.45 : 1);

      const ox = Math.round(t.w / 2);
      const oy = t.w === 96 && t.h === 96 ? 88 : t.h === 384 ? 256 : Math.round(t.h * (256 / 384));

      // Shadow Partner clone
      if (game.buffs["4111002"]) {
        const shadowAnim = p.anim;
        const shadowFrame = p.frame;
        const shadowFace = p.face;
        const shadowOffset = shadowFace === 1 ? -18 : 18;
        const shadowDrawX = p.x + shadowOffset;
        const shadowDrawY = drawPosY;

        const actionFrames = game.shadowPartnerArt[shadowAnim] ?? game.shadowPartnerArt.stand1;
        const fr = actionFrames?.[shadowFrame % (actionFrames?.length || 1)];
        let drawn = false;

        if (fr) {
          const st = game.assets.get(fr.url);
          if (st) {
            const shOx = shadowFace === 1 ? (st.w - fr.ox) : fr.ox;
            const shOy = fr.oy;
            game.r.draw(st, Math.round(shadowDrawX - shOx - cx), Math.round(shadowDrawY - shOy - cy), st.w, st.h, {
              flip: shadowFace === 1,
              alpha: baseAlpha,
            });
            drawn = true;
          } else {
            game.assets.load(fr.url);
          }
        }
        if (!drawn) {
          let shadowTex = game.assets.get(charUrlFor(game.look, shadowAnim, shadowFrame, p.expr, p.exprFrame))
            ?? game.assets.get(charUrlFor(game.look, shadowAnim, shadowFrame))
            ?? t;
          game.r.draw(shadowTex, Math.round(shadowDrawX - ox - cx), Math.round(shadowDrawY - oy - cy), shadowTex.w, shadowTex.h, {
            flip: shadowFace === 1,
            alpha: baseAlpha,
          });
        }
      }

      game.r.draw(t, Math.round(p.x - ox - cx), Math.round(drawPosY - oy - cy), t.w, t.h, {
        flip: p.face === 1,
        alpha: baseAlpha,
      });
    }

    // 3. Front item effects
    for (const eff of game.activeItemEffs) {
      WorldRenderer.drawItemEffect(game, eff, p.x, drawPosY, p.face, p.anim, cx, cy, "front");
    }

    WorldRenderer.drawNameTag(game.r, game.stats.name, p.x, drawPosY, cx, cy);
    if (game.guildName) {
      WorldRenderer.drawGuildTag(game.r, game.guildName, game.guildEmblem, p.x, drawPosY, cx, cy);
    }

    if (game.party) {
      const isLeader = game.party.leaderName.toLowerCase() === game.stats.name.toLowerCase();
      WorldRenderer.drawPartyOverheadBar(
        game.r,
        game.stats.hp,
        game.stats.maxHp,
        game.stats.mp,
        game.stats.maxMp,
        isLeader,
        p.x,
        drawPosY,
        cx,
        cy
      );
    }

    if (game.balloon && game.balloon.t > 0 && game.balloon.text) {
      WorldRenderer.drawSpeechBalloon(game.r, game.balloon.text, p.x, drawPosY, cx, cy);
    }
  }

  public static drawMob(game: Game, m: Mob, cx: number, cy: number) {
    if (!m || !m.data || !m.data.books || m.state === "dead") return;
    const book = m.attacking ?? (m.state === "move" ? (m.data.books.move ? "move" : "stand") : m.state);
    const bookFrames = m.data.books[book] ?? m.data.books.stand;
    if (!bookFrames?.length) return;
    const safeFrame = Math.max(0, Math.min(bookFrames.length - 1, m.frame));
    const fr = bookFrames[safeFrame] ?? bookFrames[0];
    if (!fr) return;
    let t = game.assets.get(fr.url);
    let useFr = fr;
    if (!t) {
      const altFr = bookFrames.find((f) => game.assets.get(f.url))
        ?? m.data.books.stand?.find((f) => game.assets.get(f.url));
      if (altFr) {
        t = game.assets.get(altFr.url);
        useFr = altFr;
      } else if (m.lastTex && m.lastFr) {
        t = m.lastTex;
        useFr = m.lastFr;
      }
    }
    if (!t) return;
    m.lastTex = t;
    m.lastFr = useFr;
    const flip = m.dir === 1;
    const left = flip ? m.x - (useFr.w - useFr.ox) : m.x - useFr.ox;
    game.r.draw(t, Math.round(left - cx), Math.round(m.y - useFr.oy - cy), useFr.w, useFr.h, { flip, alpha: m.alpha });
  }

  public static drawLadders(_game: Game, _cx: number, _cy: number) {
    // Official MapleStory maps already render the authentic ladders & ropes in the stitched background.
    // Procedural duplicate drawing is disabled.
  }

  public static drawMobHp(game: Game, m: Mob, cx: number, cy: number) {
    if (!m || !m.data || m.hpShow <= 0 || m.state === "dead" || m.state === "die1") return;
    const b = game.mobBox(m);
    const w = 50, x = Math.round(m.x - w / 2 - cx), y = Math.round(b.y0 - 14 - cy);
    game.r.rect(x - 1, y - 1, w + 2, 7, [0.1, 0.1, 0.1, 0.85]);
    game.r.rect(x, y, w, 5, [0.35, 0.05, 0.05, 1]);
    game.r.rect(x, y, Math.max(0, (m.hp / m.maxHp) * w), 5, [0.95, 0.2, 0.25, 1]);
  }

  public static drawFx(game: Game, f: Fx, cx: number, cy: number) {
    let t = f.t, i = 0;
    while (i < f.frames.length && t > (f.frames[i].delay ?? 100)) { t -= f.frames[i].delay ?? 100; i++; }
    let fr = f.frames[i];
    if (!fr) return;
    let tex = game.assets.get(fr.url);
    if (!tex) {
      game.assets.load(fr.url);
      // Fallback to last loaded frame or nearest frame so level up / FX never blinks or glitches!
      if (f.lastTex && f.lastFr) {
        tex = f.lastTex;
        fr = f.lastFr;
      } else {
        for (let pIdx = i - 1; pIdx >= 0; pIdx--) {
          const pt = game.assets.get(f.frames[pIdx]?.url);
          if (pt) { tex = pt; fr = f.frames[pIdx]; break; }
        }
      }
    }
    if (!tex) return;
    f.lastTex = tex;
    f.lastFr = fr;
    const x = f.follow ? game.p.x : f.x, y = f.follow ? game.p.y : f.y;
    const left = f.flip ? x - (fr.w - fr.ox) : x - fr.ox;
    game.r.draw(tex, Math.round(left - cx), Math.round(y - fr.oy - cy), fr.w, fr.h, { flip: f.flip });
  }

  public static drawPets(game: Game, cx: number, cy: number) {
    if (!game.pets?.length) return;
    const r = game.r;
    for (const pet of game.pets) {
      const data = PetSystem.getPetData(pet.id);
      const actionFrames = data?.actions[pet.state] ?? data?.actions.stand0 ?? (data ? Object.values(data.actions)[0] : undefined);
      if (!actionFrames?.length) {
        PetSystem.loadPetData(pet.id);
        continue;
      }
      const fr = actionFrames[pet.frame % actionFrames.length];
      if (!fr) continue;
      let tex = game.assets.get(fr.url);
      if (!tex) {
        game.assets.load(fr.url);
        if (pet.lastTex) tex = pet.lastTex;
      }
      if (tex) {
        pet.lastTex = tex;
        pet.lastFr = fr;
        const flip = pet.dir === 1;
        const left = flip ? pet.x - (fr.w - fr.ox) : pet.x - fr.ox;
        const top = pet.y - fr.oy;
        r.draw(tex, Math.round(left - cx), Math.round(top - cy), fr.w, fr.h, { flip });
        WorldRenderer.drawNameTag(r, pet.name, Math.round(pet.x), Math.round(pet.y + 2), cx, cy);
      }
    }
  }

  public static drawDamage(game: Game, d: DmgText, cx: number, cy: number) {
    const fx = game.fxData;
    const rise = Math.min(1, d.t / 1.0) * 40;
    const alpha = d.t > 0.9 ? Math.max(0, 1 - (d.t - 0.9) / 0.6) : 1;
    if (d.miss) {
      const s: Sprite = fx.miss, t = s && game.assets.get(s.url);
      if (t) game.r.draw(t, Math.round(d.x - s.w / 2 - cx), Math.round(d.y - rise - s.h - cy), s.w, s.h, { alpha });
      return;
    }
    const str = String(d.value);
    const glyphs: Sprite[] = [...str].map((c, i) => (i === 0 ? (d.hurt ? fx.hurtFirst : fx.dmgFirst)[c] : (d.hurt ? fx.hurt : fx.dmg)[c]));
    const overlap = 6;
    const total = glyphs.reduce((a, g) => a + (g?.w ?? 20) - overlap, overlap);
    let x = d.x - total / 2;
    const base = d.y - rise;
    glyphs.forEach((g, i) => {
      if (!g) return;
      const t = game.assets.get(g.url);
      if (t) game.r.draw(t, Math.round(x - cx), Math.round(base - g.h - (i === 0 ? 4 : 0) - cy), g.w, g.h, { alpha });
      x += g.w - overlap;
    });
  }
}
