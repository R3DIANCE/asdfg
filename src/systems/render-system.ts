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
import { itemIcon, itemIconRaw, QUICK_KEYS, KEY_LABEL, WEAPON_ICON, SKILL, ITEMS, type Action } from "../skills.ts";
import { PetSystem } from "./pet-system.ts";
import { type GuildEmblem, EMBLEM_COLORS, guildEmblemUrl } from "../guild.ts";
import { getWeaponType } from "../items.ts";
import { DamageSkinSystem } from "./damage-skin-system.ts";

const textTexCache = new Map<string, Tex>();
const textTexPending = new Set<string>();

export function renderLabelTexture(r: Renderer, text: string, fontSize = 8, color = "#d2d8e1"): Tex | null {
  const key = `label:${text}:${fontSize}:${color}`;
  const hit = textTexCache.get(key);
  if (hit) return hit;
  if (textTexPending.has(key)) return null;
  textTexPending.add(key);

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      textTexPending.delete(key);
      return null;
    }

    ctx.font = `bold ${fontSize}px Tahoma, 'Segoe UI', Arial, sans-serif`;
    const tm = ctx.measureText(text);
    const tw = Math.ceil(tm.width);
    const w = tw + 4;
    const h = fontSize + 6;
    canvas.width = w;
    canvas.height = h;

    ctx.font = `bold ${fontSize}px Tahoma, 'Segoe UI', Arial, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.imageSmoothingEnabled = false;

    // Crisp text outline
    ctx.fillStyle = "#000000";
    ctx.fillText(text, w / 2 - 1, h / 2);
    ctx.fillText(text, w / 2 + 1, h / 2);
    ctx.fillText(text, w / 2, h / 2 - 1);
    ctx.fillText(text, w / 2, h / 2 + 1);

    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);

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

export function renderTooltipTexture(r: Renderer, title: string, subtitle?: string, desc?: string): Tex | null {
  const key = `unified_tip:${title}:${subtitle ?? ""}:${desc ?? ""}`;
  const hit = textTexCache.get(key);
  if (hit) return hit;
  if (textTexPending.has(key)) return null;
  textTexPending.add(key);

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      textTexPending.delete(key);
      return null;
    }

    ctx.font = "bold 11px Tahoma, 'Segoe UI', Arial, sans-serif";
    const titleW = Math.ceil(ctx.measureText(title).width);

    ctx.font = "bold 9px Tahoma, 'Segoe UI', Arial, sans-serif";
    const subW = subtitle ? Math.ceil(ctx.measureText(subtitle).width) : 0;

    const padX = 10;
    let w = Math.min(280, Math.max(140, Math.max(titleW, subW) + padX * 2));

    const descLines: string[] = [];
    if (desc) {
      ctx.font = "9.5px Tahoma, 'Segoe UI', Arial, sans-serif";
      const words = desc.split(" ");
      let curLine = "";
      for (const word of words) {
        const test = curLine ? `${curLine} ${word}` : word;
        if (ctx.measureText(test).width > w - padX * 2) {
          if (curLine) descLines.push(curLine);
          curLine = word;
        } else {
          curLine = test;
        }
      }
      if (curLine) descLines.push(curLine);
    }

    const headerH = 15;
    const subH = subtitle ? 13 : 0;
    const descH = descLines.length * 13;
    const padY = 8;
    const h = headerH + subH + descH + padY * 2;

    canvas.width = w;
    canvas.height = h;

    // Dark sleek glassmorphic card matching theme
    ctx.fillStyle = "rgba(10, 14, 22, 0.94)";
    ctx.beginPath();
    if ((ctx as any).roundRect) (ctx as any).roundRect(0, 0, w, h, 4);
    else ctx.rect(0, 0, w, h);
    ctx.fill();

    // Subtle cyan/metallic border
    ctx.strokeStyle = "rgba(70, 105, 145, 0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if ((ctx as any).roundRect) (ctx as any).roundRect(0.5, 0.5, w - 1, h - 1, 4);
    else ctx.rect(0.5, 0.5, w - 1, h - 1);
    ctx.stroke();

    // Inner subtle glow at top
    const grad = ctx.createLinearGradient(0, 0, 0, 12);
    grad.addColorStop(0, "rgba(255, 255, 255, 0.12)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(1, 1, w - 2, 12);

    let curY = padY + 8;

    // Title
    ctx.font = "bold 11px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = "#facc15";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(title, padX, curY);
    curY += 13;

    // Subtitle
    if (subtitle) {
      ctx.font = "bold 9px Tahoma, 'Segoe UI', Arial, sans-serif";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(subtitle, padX, curY);
      curY += 12;
    }

    // Description lines
    if (descLines.length > 0) {
      ctx.font = "9.5px Tahoma, 'Segoe UI', Arial, sans-serif";
      ctx.fillStyle = "#cbd5e1";
      for (const line of descLines) {
        ctx.fillText(line, padX, curY);
        curY += 13;
      }
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

export function renderPlayerNameTexture(r: Renderer, name: string): Tex | null {
  const key = `playername:${name}`;
  const hit = textTexCache.get(key);
  if (hit) return hit;
  if (textTexPending.has(key)) return null;
  textTexPending.add(key);

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      textTexPending.delete(key);
      return null;
    }

    ctx.font = "bold 11px Tahoma, 'Segoe UI', Arial, sans-serif";
    const tm = ctx.measureText(name);
    const tw = Math.ceil(tm.width);
    const w = tw + 6;
    const h = 16;
    canvas.width = w;
    canvas.height = h;

    ctx.font = "bold 11px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.imageSmoothingEnabled = false;

    // Crisp text shadow / outline
    ctx.fillStyle = "#000000";
    ctx.fillText(name, w / 2 - 1, h / 2);
    ctx.fillText(name, w / 2 + 1, h / 2);
    ctx.fillText(name, w / 2, h / 2 - 1);
    ctx.fillText(name, w / 2, h / 2 + 1);
    ctx.fillText(name, w / 2 + 1, h / 2 + 1);

    // Character Name in clean white
    ctx.fillStyle = "#ffffff";
    ctx.fillText(name, w / 2, h / 2);

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

export function renderGmTelemetryTexture(r: Renderer, fps: number, ping: number): Tex | null {
  const key = `gmtelemetry:${fps}:${ping}`;
  const hit = textTexCache.get(key);
  if (hit) return hit;
  if (textTexPending.has(key)) return null;
  textTexPending.add(key);

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      textTexPending.delete(key);
      return null;
    }

    const text = `${fps} FPS · ${ping}ms`;
    ctx.font = "bold 9px Tahoma, 'Segoe UI', Arial, sans-serif";
    const tm = ctx.measureText(text);
    const tw = Math.ceil(tm.width);
    const w = tw + 10;
    const h = 14;
    canvas.width = w;
    canvas.height = h;

    ctx.font = "bold 9px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.imageSmoothingEnabled = false;

    // Dark pill container
    ctx.fillStyle = "rgba(10, 14, 22, 0.88)";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0, 0, w, h, 3) : ctx.rect(0, 0, w, h);
    ctx.fill();

    // Subtle GM gold border
    ctx.strokeStyle = "rgba(255, 204, 68, 0.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0.5, 0.5, w - 1, h - 1, 3) : ctx.rect(0.5, 0.5, w - 1, h - 1);
    ctx.stroke();

    // FPS text with color coding
    const fpsColor = fps >= 50 ? "#4ade80" : fps >= 30 ? "#facc15" : "#f87171";
    ctx.fillStyle = fpsColor;
    ctx.fillText(`${fps} FPS`, w / 2 - 12, h / 2);

    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fillText("·", w / 2 + 5, h / 2);

    const pingColor = ping < 60 ? "#4ade80" : ping < 120 ? "#facc15" : "#f87171";
    ctx.fillStyle = pingColor;
    ctx.fillText(`${ping}ms`, w / 2 + 18, h / 2);

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

export const QUICK_UI = {
  backgrnd: "/wz/sprite/UI/StatusBar3/mainBar/quickSlot/backgrnd",
  cover: "/wz/sprite/UI/StatusBar3/mainBar/quickSlot/layer:cover",
  selected: "/wz/sprite/UI/StatusBar3/mainBar/quickSlot/selected/0",
  fold: "/wz/sprite/UI/StatusBar3/mainBar/quickSlot/button:Fold/normal/0",
};

export class WebGpuMenuInput {
  static mouseX = -1;
  static mouseY = -1;
  static isDown = false;
  static downStartX = -1;
  static downStartY = -1;
  static isDragging = false;
  static dragAction: Action | null = null;
  static dragFromKey: string | null = null;

  static hoveredBtnId: string | null = null;
  static activeSubmenu: string | null = null;
  static hoveredSubmenuItem: string | null = null;
  static hoveredQuickKey: string | null = null;
  static hoveredAutoBtn: "battle" | "boss" | null = null;
  static hoveredHp = false;
  static hoveredMp = false;
  static hoveredLevel = false;
  static hoveredExp = false;

  static activeTooltip: {
    title: string;
    subtitle?: string;
    desc?: string;
  } | null = null;

  static installed = false;

  static install(canvas: HTMLCanvasElement, game: Game) {
    if (this.installed || !canvas) return;
    this.installed = true;

    window.addEventListener("pointermove", (e: PointerEvent) => {
      if (game.uiMode === "old") {
        this.hoveredQuickKey = null;
        this.hoveredAutoBtn = null;
        this.hoveredBtnId = null;
        this.hoveredSubmenuItem = null;
        this.hoveredHp = false;
        this.hoveredMp = false;
        this.hoveredLevel = false;
        this.hoveredExp = false;
        this.activeTooltip = null;
        return;
      }
      const rect = canvas.getBoundingClientRect();
      this.mouseX = Math.round(e.clientX - rect.left);
      this.mouseY = Math.round(e.clientY - rect.top);

      if (this.isDown && !this.isDragging && this.dragFromKey && this.dragAction) {
        if (Math.hypot(this.mouseX - this.downStartX, this.mouseY - this.downStartY) > 5) {
          this.isDragging = true;
          let win = (game as any).hud?.wins ?? (game as any).windows ?? (window as any).__windows;
          if (win && typeof win.toggle !== "function" && win.wins) win = win.wins;
          if (win?.iconFor) {
            win.ghost = document.createElement("div");
            win.ghost.className = "drag-ghost";
            const iconUrl = win.iconFor(this.dragAction);
            if (iconUrl) win.ghost.style.backgroundImage = `url("${iconUrl}")`;
            document.body.appendChild(win.ghost);
            document.body.classList.add("cursor-grabbing");
          }
        }
      }

      if (this.isDragging) {
        let win = (game as any).hud?.wins ?? (game as any).windows ?? (window as any).__windows;
        if (win && typeof win.toggle !== "function" && win.wins) win = win.wins;
        if (win?.moveGhost) {
          win.moveGhost(e.clientX, e.clientY);
        }
      }
    });

    window.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.button !== 0 || game.uiMode === "old") return;
      this.isDown = true;
      this.downStartX = this.mouseX;
      this.downStartY = this.mouseY;
      this.isDragging = false;
      if (this.hoveredQuickKey && game.quick[this.hoveredQuickKey]) {
        this.dragFromKey = this.hoveredQuickKey;
        this.dragAction = game.quick[this.hoveredQuickKey];
      } else {
        this.dragFromKey = null;
        this.dragAction = null;
      }
    });

    window.addEventListener("pointerup", (e: PointerEvent) => {
      if (e.button !== 0 || game.uiMode === "old") return;
      this.isDown = false;

      if (this.isDragging) {
        let win = (game as any).hud?.wins ?? (game as any).windows ?? (window as any).__windows;
        if (win && typeof win.toggle !== "function" && win.wins) win = win.wins;
        if (win?.ghost) {
          win.ghost.remove();
          win.ghost = null;
        }
        document.body.classList.remove("cursor-grabbing");

        const fromK = this.dragFromKey;
        const toK = this.hoveredQuickKey;
        if (fromK) {
          if (toK && toK !== fromK) {
            const tmp = game.quick[toK] ?? null;
            game.quick[toK] = game.quick[fromK] ?? null;
            game.quick[fromK] = tmp;
            game.onChange();
          } else if (!toK) {
            delete game.quick[fromK];
            game.onChat("system", "Removed from the quick slot.");
            game.onChange();
          }
        }

        this.isDragging = false;
        this.dragFromKey = null;
        this.dragAction = null;
        return;
      }

      this.dragFromKey = null;
      this.dragAction = null;
      this.handleClick(game);
    });

    canvas.addEventListener("contextmenu", (e: MouseEvent) => {
      if (game.uiMode === "old") return;
      if (this.hoveredQuickKey && game.quick[this.hoveredQuickKey]) {
        e.preventDefault();
        delete game.quick[this.hoveredQuickKey];
        game.onChange();
      }
    });
  }

  static handleClick(game: Game) {
    if (game.uiMode === "old") return;
    let win = (game as any).hud?.wins ?? (game as any).windows ?? (window as any).__windows ?? (window as any).__game?.hud?.wins;
    if (win && typeof win.toggle !== "function" && win.wins) {
      win = win.wins;
    }

    if (this.hoveredAutoBtn === "battle") {
      game.auto.battle = !game.auto.battle;
      game.onChat("notice", game.auto.battle ? "Auto Combat is ON" : "Auto Combat is OFF");
      game.onChange();
      return;
    }

    if (this.hoveredAutoBtn === "boss") {
      game.auto.boss = !game.auto.boss;
      game.onChat("notice", game.auto.boss ? "Auto Boss is ON. Stage boss will be challenged automatically." : "Auto Boss is OFF.");
      game.onChange();
      return;
    }

    if (this.hoveredLevel || this.hoveredHp || this.hoveredMp) {
      if (win?.toggle && win.stat) {
        win.toggle(win.stat);
        return;
      }
    }

    if (this.hoveredQuickKey) {
      const a = game.quick[this.hoveredQuickKey];
      if (a) game.useAction(a);
      return;
    }

    if (this.hoveredSubmenuItem) {
      const it = this.hoveredSubmenuItem;
      this.activeSubmenu = null;
      if (it === "stat") {
        if ((game as any).hud?.statsComp) (game as any).hud.statsComp.toggle();
        else if (win?.toggle) win.toggle(win.stat);
      }
      else if (it === "skill" && win?.toggle) win.toggle(win.skill);
      else if (it === "equip") {
        if ((game as any).hud?.equipComp) (game as any).hud.equipComp.toggle();
        else if (win?.ext?.open) win.ext.open("equip");
        else if (win?.toggle && win.ext?.equipWin) win.toggle(win.ext.equipWin);
      }
      else if (it === "item") {
        if ((game as any).hud?.invComp) (game as any).hud.invComp.toggle();
        else if (win?.ext?.open) win.ext.open("inv");
        else if (win?.toggle && win.ext?.invWin) win.toggle(win.ext.invWin);
      }
      else if (it === "bossParty") {
        if ((game as any).hud?.partyComp) (game as any).hud.partyComp.toggle();
        else if (win?.toggle) win.toggle(win.partyWin);
      }
      else if (it === "chat") {
        (game as any).hud?.chat?.toggle?.();
      }
      else if (it === "guild" && win?.toggle) win.toggle(win.guildWin);
      else if (it === "keySetting" && win?.toggle) {
        if (win.guideWin) {
          win.guideTab = "overview";
          win.renderGuide?.();
          win.toggle(win.guideWin);
        }
      }
      else if (it === "guide" && win?.toggle) win.toggle(win.guideWin);
      else if (it === "quest") (game as any).hud?.showDailyGift?.();
      return;
    }

    if (this.hoveredBtnId) {
      const bid = this.hoveredBtnId;
      if (bid === "cashShop") {
        this.activeSubmenu = null;
        let w = (game as any).hud?.wins ?? (game as any).windows ?? (window as any).__windows;
        if (w && typeof w.toggle !== "function" && w.wins) w = w.wins;
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

    // Unified WebGPU HUD rendered via WebGpuMenuInput with consistent theme across all panels (when uiMode !== "old")
    if (game.uiMode !== "old") {
      WorldRenderer.drawHpMpPanel(game);
      WorldRenderer.drawExpBar(game);
      WorldRenderer.drawMenuButtons(game);
      WorldRenderer.drawQuickBar(game);
      WorldRenderer.drawHudTooltips(game);
    }

    r.end();
  }

  public static drawHpMpPanel(game: Game) {
    if (!game.stats || game.loadingMap) return;
    const r = game.r;

    // Center bottom layout directly above the authentic WZ EXP bar
    const totalW = 424;
    const panelW = 204;
    const panelH = 70;
    const x = Math.round((r.width - totalW) / 2);
    const y = Math.round(r.height - panelH - 10);

    const mx = WebGpuMenuInput.mouseX;
    const my = WebGpuMenuInput.mouseY;

    WebGpuMenuInput.hoveredHp = false;
    WebGpuMenuInput.hoveredMp = false;
    WebGpuMenuInput.hoveredLevel = false;

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

    // 6. Character Name (cleanly centered in panel header next to level, NO player avatar sprite)
    const charName = (game.stats.name || "Wayfarer").trim();
    const nameTex = renderPlayerNameTexture(r, charName);
    const nameW = nameTex ? nameTex.w : (charName.length * 7);

    // Center name between level number end and panel right boundary (x + 196)
    const areaStart = curLvX + 6;
    const areaEnd = x + 196;
    const areaCenter = Math.round((areaStart + areaEnd) / 2);
    const drawItemX = Math.max(areaStart, Math.round(areaCenter - nameW / 2));

    // Draw Character Name
    if (nameTex) {
      r.draw(nameTex, drawItemX, y + 5, nameTex.w, nameTex.h);
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

    // 7. Draw HP & MP Numbers
    drawGaugeNumbers(`${hp} / ${maxHp}`, y + 30);
    drawGaugeNumbers(`${mp} / ${maxMp}`, y + 46);

    // 8. Hover Highlight & Tooltip Trigger for Level, HP, and MP
    if (mx >= x + 22 && mx <= curLvX + 4 && my >= y + 6 && my <= y + 20) {
      WebGpuMenuInput.hoveredLevel = true;
      r.rect(x + 22, y + 6, curLvX - x - 18, 14, [1, 0.85, 0.2, 0.25]);
      WebGpuMenuInput.activeTooltip = {
        title: `Lv. ${game.stats.level || 1} ${charName}`,
        subtitle: `AP: ${game.stats.ap || 0} · SP: ${game.stats.sp || 0}`,
        desc: "Click to open Character Stats & Attributes window.",
      };
    } else if (mx >= x + 24 && mx <= x + 195 && my >= y + 26 && my <= y + 41) {
      WebGpuMenuInput.hoveredHp = true;
      r.rect(x + 24, y + 28, 171, 13, [1, 0.3, 0.4, 0.22]);
      WebGpuMenuInput.activeTooltip = {
        title: "Hit Points (HP)",
        subtitle: `${hp} / ${maxHp} (${(hpRatio * 100).toFixed(1)}%)`,
        desc: "Your life vitality. Recovers automatically or via potions. Click to open Stats.",
      };
    } else if (mx >= x + 24 && mx <= x + 195 && my >= y + 42 && my <= y + 57) {
      WebGpuMenuInput.hoveredMp = true;
      r.rect(x + 24, y + 44, 171, 13, [0.2, 0.6, 1.0, 0.22]);
      WebGpuMenuInput.activeTooltip = {
        title: "Mana Points (MP)",
        subtitle: `${mp} / ${maxMp} (${(mpRatio * 100).toFixed(1)}%)`,
        desc: "Magical energy consumed when casting skills. Click to open Stats.",
      };
    }
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
      WebGpuMenuInput.hoveredExp = true;
      WebGpuMenuInput.activeTooltip = {
        title: "Experience Points (EXP)",
        subtitle: `${exp.toLocaleString()} / ${expNeed.toLocaleString()} (${expPct.toFixed(2)}%)`,
        desc: "Earn EXP by slaying monsters or completing quests to level up your character.",
      };
    } else {
      WebGpuMenuInput.hoveredExp = false;
    }
  }

  public static drawMenuButtons(game: Game) {
    if (!game.stats || game.loadingMap) return;
    const r = game.r;
    if (r.canvas) WebGpuMenuInput.install(r.canvas, game);

    // Anchor aligned with HP/MP status panel directly above authentic EXP bar
    const totalW = 424;
    const x = Math.round((r.width - totalW) / 2);
    const y = Math.round(r.height - 70 - 10);

    const menuX = x + 214;
    const menuY = y + 24;

    const mx = WebGpuMenuInput.mouseX;
    const my = WebGpuMenuInput.mouseY;

    let anyHovered = false;
    WebGpuMenuInput.hoveredBtnId = null;

    let activeBtnX = menuX;
    let activeBtnY = menuY;

    const btnTooltips: Record<string, { title: string; subtitle: string; desc: string }> = {
      character: { title: "Character", subtitle: "Hotkey: S / K / E / I", desc: "Inspect ability stats, skill tree, equipment, and inventory." },
      community: { title: "Community", subtitle: "Hotkey: P / G", desc: "Party management, stage boss raids, and guild roster." },
      setting: { title: "Key Settings", subtitle: "Hotkey: \\", desc: "Customize keyboard bindings and quickbar layout." },
      menu: { title: "Game Menu", subtitle: "Hotkey: ESC", desc: "Game guide, system settings, quests, and exit." },
      event: { title: "Event & Rewards", subtitle: "Daily Login", desc: "Claim daily attendance rewards and accumulated offline gains." },
      cashShop: { title: "Cash Shop", subtitle: "Special Boutique", desc: "Browse exclusive costumes, hairstyles, faces, and pets." },
    };

    const subTooltips: Record<string, { title: string; subtitle: string; desc: string }> = {
      stat: { title: "Character Stats", subtitle: "Hotkey: S", desc: "Distribute AP into STR, DEX, INT, and LUK." },
      skill: { title: "Skill Tree", subtitle: "Hotkey: K", desc: "Learn and level up job skills using SP." },
      equip: { title: "Equipment", subtitle: "Hotkey: E", desc: "Equip weapons, armor, accessories, and vanity items." },
      item: { title: "Inventory", subtitle: "Hotkey: I", desc: "View Equip, Use, Etc, Set-up, and Cash item tabs." },
      bossParty: { title: "Party & Raids", subtitle: "Hotkey: P", desc: "Form parties and challenge stage bosses together." },
      guild: { title: "Guild", subtitle: "Hotkey: G", desc: "Guild members, guild level, emblem, and perks." },
      keySetting: { title: "Key Config", subtitle: "Hotkey: \\", desc: "Customize quickbar slots and action shortcuts." },
      guide: { title: "Game Guide", subtitle: "Hotkey: F1", desc: "Comprehensive tutorials, monsters, maps, and classes." },
      quest: { title: "Quests & Rewards", subtitle: "Daily Gifts", desc: "Claim welcome back rewards and view active quests." },
    };

    // Draw active submenu popup first so buttons render cleanly
    WebGpuMenuInput.hoveredSubmenuItem = null;
    if (WebGpuMenuInput.activeSubmenu) {
      const subItems = MENU_UI.submenu.items[WebGpuMenuInput.activeSubmenu as keyof typeof MENU_UI.submenu.items];
      if (subItems && subItems.length) {
        const bIdx = MENU_UI.buttons.findIndex((b) => b.id === WebGpuMenuInput.activeSubmenu);
        if (bIdx >= 0) {
          activeBtnX = menuX + bIdx * 35;
          activeBtnY = menuY;
        }

        const subW = 109;
        const subX = Math.round(activeBtnX + (34 - subW) / 2);
        const totalItemsH = subItems.length * 27;
        const subY = activeBtnY - totalItemsH - 8;

        // Submenu background box with modern sleek glassmorphism
        r.rect(subX - 4, subY - 4, subW + 8, totalItemsH + 8, [0.05, 0.08, 0.14, 0.96]);
        r.rect(subX - 4, subY - 4, subW + 8, 1, [0.35, 0.48, 0.65, 0.85]);
        r.rect(subX - 4, subY + totalItemsH + 3, subW + 8, 1, [0.35, 0.48, 0.65, 0.85]);
        r.rect(subX - 4, subY - 4, 1, totalItemsH + 8, [0.35, 0.48, 0.65, 0.85]);
        r.rect(subX + subW + 3, subY - 4, 1, totalItemsH + 8, [0.35, 0.48, 0.65, 0.85]);
        r.rect(subX - 3, subY - 3, subW + 6, 1, [1, 1, 1, 0.08]);

        for (let j = 0; j < subItems.length; j++) {
          const item = subItems[j];
          const itemY = subY + j * 27;
          const isItemHover = mx >= subX && mx < subX + subW && my >= itemY && my < itemY + 26;

          if (isItemHover) {
            anyHovered = true;
            WebGpuMenuInput.hoveredSubmenuItem = item.id;
            const tipInfo = subTooltips[item.id];
            if (tipInfo) {
              WebGpuMenuInput.activeTooltip = tipInfo;
            }
            r.rect(subX, itemY, subW, 26, [0.2, 0.5, 0.9, 0.22]);
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

    // Draw the 6 authentic StatusBar3 menu buttons
    for (let i = 0; i < MENU_UI.buttons.length; i++) {
      const btn = MENU_UI.buttons[i];
      const btnX = menuX + i * 35;
      const btnY = menuY;
      const isHover = mx >= btnX && mx < btnX + 34 && my >= btnY && my < btnY + 37;

      if (isHover) {
        anyHovered = true;
        WebGpuMenuInput.hoveredBtnId = btn.id;
        if (!WebGpuMenuInput.hoveredSubmenuItem && btnTooltips[btn.id]) {
          WebGpuMenuInput.activeTooltip = btnTooltips[btn.id];
        }
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
  }

  public static drawQuickBar(game: Game) {
    if (!game.stats || game.loadingMap) return;
    const r = game.r;

    const qsW = 562;
    const qsH = 73;
    const qsX = Math.round(r.width - qsW - 4);
    const qsY = Math.round(r.height - 10 - qsH + 2);

    // 1. QuickSlot Background
    const bgTex = game.assets.get(QUICK_UI.backgrnd);
    if (bgTex) {
      r.draw(bgTex, qsX + 2, qsY + 3, 557, 67);
    } else {
      game.assets.load(QUICK_UI.backgrnd);
    }

    const mx = WebGpuMenuInput.mouseX;
    const my = WebGpuMenuInput.mouseY;
    WebGpuMenuInput.hoveredQuickKey = null;

    // 2. Draw QuickSlot Grid (16 columns x 2 rows)
    const row0Keys = QUICK_KEYS.slice(0, 16);
    const row1Keys = QUICK_KEYS.slice(16, 32);

    for (let row = 0; row < 2; row++) {
      const keys = row === 0 ? row0Keys : row1Keys;
      const sy = qsY + 3 + row * 35;

      for (let col = 0; col < 16; col++) {
        const k = keys[col];
        const sx = qsX + 2 + col * 35;

        const isHover = mx >= sx && mx < sx + 32 && my >= sy && my < sy + 32;
        if (isHover) {
          WebGpuMenuInput.hoveredQuickKey = k;
          const selTex = game.assets.get(QUICK_UI.selected);
          if (selTex) {
            r.draw(selTex, sx - 4, sy - 4, 40, 40);
          } else {
            game.assets.load(QUICK_UI.selected);
            r.rect(sx, sy, 32, 32, [0.35, 0.65, 1, 0.3]);
          }
        }

        // Draw Key Label in top-left
        const label = KEY_LABEL[k] || k;
        const lblTex = renderLabelTexture(r, label, 8, "#d2d8e1");
        if (lblTex) {
          r.draw(lblTex, sx + 2, sy + 2, lblTex.w, lblTex.h);
        }

        // Draw Action (skill, item, attack) centered in the 32x32 slot
        const a = game.quick[k];
        if (a) {
          let iconUrl = "";
          if (a.t === "attack") {
            iconUrl = WEAPON_ICON;
          } else if (a.t === "item") {
            iconUrl = itemIcon(a.id);
          } else if (a.t === "skill") {
            iconUrl = game.skillArt[a.id]?.icon?.url || `/wz/skill/${a.id}/icon`;
          }

          if (iconUrl) {
            const iconTex = game.assets.get(iconUrl);
            if (iconTex) {
              const iw = Math.min(32, iconTex.w || 32);
              const ih = Math.min(32, iconTex.h || 32);
              const ix = Math.round(sx + (32 - iw) / 2);
              const iy = Math.round(sy + (32 - ih) / 2);
              r.draw(iconTex, ix, iy, iw, ih);
            } else {
              game.assets.load(iconUrl);
            }
          }

          // If item, draw count
          if (a.t === "item") {
            const count = game.inv[a.id] ?? 0;
            if (count > 0) {
              const cntTex = renderLabelTexture(r, String(count), 8, "#ffffff");
              if (cntTex) {
                r.draw(cntTex, sx + 30 - cntTex.w, sy + 22, cntTex.w, cntTex.h);
              }
            }
          }

          // If skill, draw cooldown overlay
          if (a.t === "skill") {
            const cd = game.skillCd[a.id];
            if (cd && cd.left > 0) {
              r.rect(sx, sy, 32, 32, [0, 0, 0, 0.65]);
              const sec = Math.ceil(cd.left);
              const cdTex = renderLabelTexture(r, `${sec}s`, 9, "#ffdd55");
              if (cdTex) {
                r.draw(cdTex, Math.round(sx + (32 - cdTex.w) / 2), Math.round(sy + (32 - cdTex.h) / 2), cdTex.w, cdTex.h);
              }
            }
          }
        }
      }
    }

    // 3. QuickSlot Bezel Cover
    const coverTex = game.assets.get(QUICK_UI.cover);
    if (coverTex) {
      r.draw(coverTex, qsX, qsY, 562, 73);
    } else {
      game.assets.load(QUICK_UI.cover);
    }

    // 4. Auto Combat & Auto Boss Buttons directly above QuickSlots
    const abY = qsY - 24;

    // Auto Combat Button
    const abX = qsX + 336;
    const abW = 106;
    const abH = 20;
    const isAbHover = mx >= abX && mx < abX + abW && my >= abY && my < abY + abH;
    if (isAbHover) {
      WebGpuMenuInput.hoveredAutoBtn = "battle";
      WebGpuMenuInput.activeTooltip = {
        title: "Auto Combat System",
        subtitle: game.auto.battle ? "STATUS: ACTIVE [ON]" : "STATUS: OFF",
        desc: "Character hunts, loots, and recovers automatically. Hotkey: B",
      };
    }

    // Pill container matching HUD glassmorphism
    r.rect(abX, abY, abW, abH, game.auto.battle ? [0.08, 0.22, 0.14, 0.94] : [0.07, 0.10, 0.16, 0.9]);
    const abBorder: [number, number, number, number] = isAbHover ? [0.35, 0.85, 0.55, 0.95] : game.auto.battle ? [0.25, 0.65, 0.4, 0.8] : [0.3, 0.4, 0.52, 0.6];
    r.rect(abX, abY, abW, 1, abBorder);
    r.rect(abX, abY + abH - 1, abW, 1, abBorder);
    r.rect(abX, abY, 1, abH, abBorder);
    r.rect(abX + abW - 1, abY, 1, abH, abBorder);

    r.rect(abX + 7, abY + 6, 7, 7, game.auto.battle ? [0.2, 0.95, 0.4, 1] : [0.65, 0.2, 0.2, 0.75]);
    const abLabel = renderLabelTexture(r, "AUTO COMBAT", 9, game.auto.battle ? "#4ade80" : "#94a3b8");
    if (abLabel) r.draw(abLabel, abX + 18, abY + 4, abLabel.w, abLabel.h);

    // Auto Boss Button
    const bossX = qsX + 448;
    const bossW = 106;
    const bossH = 20;
    const isBossHover = mx >= bossX && mx < bossX + bossW && my >= abY && my < abY + bossH;
    if (isBossHover) {
      WebGpuMenuInput.hoveredAutoBtn = "boss";
      WebGpuMenuInput.activeTooltip = {
        title: "Auto Boss Challenge",
        subtitle: game.auto.boss ? "STATUS: ACTIVE [ON]" : "STATUS: OFF",
        desc: "Stage bosses will be challenged automatically upon stage completion.",
      };
    }

    r.rect(bossX, abY, bossW, bossH, game.auto.boss ? [0.08, 0.22, 0.14, 0.94] : [0.07, 0.10, 0.16, 0.9]);
    const bossBorder: [number, number, number, number] = isBossHover ? [0.35, 0.85, 0.55, 0.95] : game.auto.boss ? [0.25, 0.65, 0.4, 0.8] : [0.3, 0.4, 0.52, 0.6];
    r.rect(bossX, abY, bossW, 1, bossBorder);
    r.rect(bossX, abY + bossH - 1, bossW, 1, bossBorder);
    r.rect(bossX, abY, 1, bossH, bossBorder);
    r.rect(bossX + bossW - 1, abY, 1, bossH, bossBorder);

    r.rect(bossX + 7, abY + 6, 7, 7, game.auto.boss ? [0.2, 0.95, 0.4, 1] : [0.65, 0.2, 0.2, 0.75]);
    const bossLabel = renderLabelTexture(r, "AUTO BOSS", 9, game.auto.boss ? "#4ade80" : "#94a3b8");
    if (bossLabel) r.draw(bossLabel, bossX + 18, abY + 4, bossLabel.w, bossLabel.h);

    if (!isAbHover && !isBossHover && !WebGpuMenuInput.hoveredBtnId && !WebGpuMenuInput.hoveredSubmenuItem && !WebGpuMenuInput.hoveredQuickKey) {
      WebGpuMenuInput.hoveredAutoBtn = null;
    }

    // 5. Tooltip on hovered QuickSlot
    if (WebGpuMenuInput.hoveredQuickKey) {
      const a = game.quick[WebGpuMenuInput.hoveredQuickKey];
      const label = KEY_LABEL[WebGpuMenuInput.hoveredQuickKey] || WebGpuMenuInput.hoveredQuickKey;
      if (a) {
        if (a.t === "attack") {
          WebGpuMenuInput.activeTooltip = {
            title: "Basic Attack",
            subtitle: `Hotkey: [ ${label} ]`,
            desc: "Strike nearby monsters with your equipped weapon. Drag to rebind.",
          };
        } else if (a.t === "item") {
          const item = ITEMS[a.id];
          const count = game.inv[a.id] ?? 0;
          WebGpuMenuInput.activeTooltip = {
            title: item?.name || `Item ${a.id}`,
            subtitle: `Owned: ${count} · Hotkey: [ ${label} ]`,
            desc: `${item?.hp ? `Recovers ${item.hp} HP. ` : ""}${item?.mp ? `Recovers ${item.mp} MP. ` : ""}Drag to move, right-click to clear.`,
          };
        } else if (a.t === "skill") {
          const art = game.skillArt[a.id];
          const d = SKILL[a.id];
          const lv = game.lv(a.id);
          const mpCost = d && d.kind !== "passive" ? d.mp(lv) : 0;
          WebGpuMenuInput.activeTooltip = {
            title: art?.name || `Skill ${a.id}`,
            subtitle: `Mastery Lv. ${lv} · MP ${mpCost} · Hotkey: [ ${label} ]`,
            desc: `${d?.summary(lv) || art?.desc || "Unleash combat technique."} Drag to move, right-click to clear.`,
          };
        }
      } else {
        WebGpuMenuInput.activeTooltip = {
          title: "Quick Slot",
          subtitle: `Hotkey: [ ${label} ]`,
          desc: "Drag skills or consumable items here from your inventory to assign shortcut.",
        };
      }
    }
  }

  public static drawHudTooltips(game: Game) {
    if (!game.stats || game.loadingMap) return;
    const r = game.r;

    const isAnyElementHovered =
      WebGpuMenuInput.hoveredQuickKey ||
      WebGpuMenuInput.hoveredAutoBtn ||
      WebGpuMenuInput.hoveredBtnId ||
      WebGpuMenuInput.hoveredSubmenuItem ||
      WebGpuMenuInput.hoveredHp ||
      WebGpuMenuInput.hoveredMp ||
      WebGpuMenuInput.hoveredLevel ||
      WebGpuMenuInput.hoveredExp;

    if (!isAnyElementHovered) {
      WebGpuMenuInput.activeTooltip = null;
      if (r.canvas && r.canvas.style.cursor === "pointer") {
        r.canvas.style.cursor = "default";
      }
      return;
    }

    if (r.canvas) {
      r.canvas.style.cursor = "pointer";
    }

    const tip = WebGpuMenuInput.activeTooltip;
    if (!tip) return;

    const tipTex = renderTooltipTexture(r, tip.title, tip.subtitle, tip.desc);
    if (!tipTex) return;

    const mx = WebGpuMenuInput.mouseX;
    const my = WebGpuMenuInput.mouseY;
    if (mx < 0 || my < 0) return;

    const tw = tipTex.w;
    const th = tipTex.h;

    let tx = mx + 14;
    let ty = my + 14;

    if (tx + tw > r.width - 8) {
      tx = Math.max(8, mx - tw - 12);
    }
    if (ty + th > r.height - 18) {
      ty = Math.max(8, my - th - 8);
    }

    r.rect(tx + 2, ty + 3, tw, th, [0, 0, 0, 0.45]);
    r.draw(tipTex, tx, ty, tw, th);
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

  public static drawGmTelemetryTag(r: Renderer, fps: number, ping: number, x: number, y: number, cx: number, cy: number, hasGuild: boolean) {
    const tex = renderGmTelemetryTexture(r, fps, ping);
    if (tex) {
      const tagOffset = hasGuild ? 34 : 20;
      r.draw(tex, Math.round(x - tex.w / 2 - cx), Math.round(y + tagOffset - cy), tex.w, tex.h);
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
    if (game.isGm()) {
      WorldRenderer.drawGmTelemetryTag(game.r, rp.fps ?? 60, rp.ping ?? 20, rp.x, drawPosY, cx, cy, Boolean(rp.guildName));
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
    const skin = DamageSkinSystem.getSkin(d.skinId ?? game.damageSkin ?? 0);
    const rise = Math.min(1, d.t / 1.0) * 40;
    const alpha = d.t > 0.9 ? Math.max(0, 1 - (d.t - 0.9) / 0.6) : 1;

    // Miss
    if (d.miss) {
      const missUrl = skin.miss || fx?.miss?.url || "/wz/sprite/Effect/BasicEff/NoRed0/Miss";
      let t = game.assets.get(missUrl);
      if (!t && fx?.miss?.url) t = game.assets.get(fx.miss.url);
      if (t) {
        game.r.draw(t, Math.round(d.x - t.w / 2 - cx), Math.round(d.y - rise - t.h - cy), t.w, t.h, { alpha });
      } else {
        game.assets.load(missUrl);
        if (fx?.miss?.url) game.assets.load(fx.miss.url);
      }
      return;
    }

    const str = String(d.value);
    const isCritical = Boolean(d.critical && !d.hurt);

    // Get glyph URLs based on hit type and skin
    const glyphUrls: string[] = [...str].map((c, i) => {
      if (d.hurt) {
        return (i === 0 ? fx?.hurtFirst?.[c]?.url : fx?.hurt?.[c]?.url) || `/wz/sprite/Effect/BasicEff/NoViolet${i === 0 ? "0" : "1"}/${c}`;
      }
      if (isCritical) {
        return (i === 0 ? skin.criFirst[c] : skin.cri[c]) || (i === 0 ? fx?.dmgFirst?.[c]?.url : fx?.dmg?.[c]?.url) || `/wz/sprite/Effect/BasicEff/NoCri${i === 0 ? "0" : "1"}/${c}`;
      }
      return (i === 0 ? skin.dmgFirst[c] : skin.dmg[c]) || (i === 0 ? fx?.dmgFirst?.[c]?.url : fx?.dmg?.[c]?.url) || `/wz/sprite/Effect/BasicEff/NoRed${i === 0 ? "0" : "1"}/${c}`;
    });

    const glyphTexs = glyphUrls.map((u) => {
      const tex = u ? game.assets.get(u) : null;
      if (!tex && u) game.assets.load(u);
      return tex;
    });

    const overlap = isCritical ? 4 : 6;
    const total = glyphTexs.reduce((a, t) => a + (t?.w ?? 22) - overlap, overlap);
    let x = d.x - total / 2;
    const base = d.y - rise;

    // Critical star effect drawn behind/above the first digit
    if (isCritical) {
      const effUrl = skin.criEffect || "/wz/sprite/Effect/BasicEff/NoCri1/effect";
      let effTex = game.assets.get(effUrl) ?? game.assets.get("/wz/sprite/Effect/BasicEff/NoCri1/effect");
      if (effTex) {
        game.r.draw(effTex, Math.round(x - 14 - cx), Math.round(base - effTex.h - 12 - cy), effTex.w, effTex.h, { alpha });
      } else {
        game.assets.load(effUrl);
        game.assets.load("/wz/sprite/Effect/BasicEff/NoCri1/effect");
      }
    }

    glyphTexs.forEach((t, i) => {
      const gw = t?.w ?? 22;
      const gh = t?.h ?? 30;
      const bounce = (isCritical && i === 0) ? -4 : 0;
      if (t) {
        game.r.draw(t, Math.round(x - cx), Math.round(base - gh + bounce - cy), gw, gh, { alpha });
      }
      x += gw - overlap;
    });
  }
}
