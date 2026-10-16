import { Object3D } from "@orillusion/core";
import { loadItemData } from "./items.ts";
import { json } from "./assets.ts";
import { Game, FREE_MARKET_MAP } from "./game.ts";
import type { ChatKind } from "./game.ts";
import { Renderer } from "./gpu.ts";
import { Hud } from "./ui.ts";
import { CLASSES, QUICK_KEYS, type ClassId } from "./skills.ts";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { DebugPanel } from "./components/Debug";
import { AuthUI } from "./components/AuthUI";
import { spacetime, type SpacetimeCharacter } from "./spacetimedb";

let root: HTMLElement | null = null;

/** Install the debug panel on top of the game window. */
let debugContainer: HTMLElement | null = null;

function setupDebugPanel() {
  if (debugContainer) return;
  if (hud?.perfContainer) {
    debugContainer = hud.perfContainer;
    createRoot(debugContainer).render(createElement(DebugPanel));
  }
}

let debugAttach = false;

function attachDebugPanel() {
  if (debugAttach) return;
  debugAttach = true;
  setupDebugPanel();
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const title = document.getElementById("title")!;
const loading = document.getElementById("loading")!;
const errorBox = document.getElementById("gpu-error")!;
const bgm = new Audio();
bgm.loop = true;
bgm.volume = 0.35;

const r = new Renderer(canvas);
let gameEntity: Object3D | null = null;
let game!: Game;
let hudEntity: Object3D | null = null;
let hud: Hud | null = null;
let running = false;

const SAVE_KEY = "maple-wayfarer-save";
const GAME_KEYS = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "a", "d", "w", "s",
  "Alt", " ", "Tab", ...QUICK_KEYS
]);

/** Layout-independent key names: letters lower-case, digits unaffected by Shift. */
function keyName(e: KeyboardEvent): string {
  const c = e.code;
  if (c === "ArrowLeft" || c === "ArrowRight" || c === "ArrowUp" || c === "ArrowDown") return c;
  if (c === "Numpad4") return "ArrowLeft";
  if (c === "Numpad6") return "ArrowRight";
  if (c === "Numpad8") return "ArrowUp";
  if (c === "Numpad2") return "ArrowDown";
  if (e.key === "Left" || e.key === "ArrowLeft") return "ArrowLeft";
  if (e.key === "Right" || e.key === "ArrowRight") return "ArrowRight";
  if (e.key === "Up" || e.key === "ArrowUp") return "ArrowUp";
  if (e.key === "Down" || e.key === "ArrowDown") return "ArrowDown";
  if (c.startsWith("Key")) return c.slice(3).toLowerCase();
  if (c.startsWith("Digit")) return c.slice(5);
  if (c.startsWith("Numpad") && /\d$/.test(c)) return c.slice(-1);
  const map: Record<string, string> = {
    ShiftLeft: "Shift", ShiftRight: "Shift", ControlLeft: "Control", ControlRight: "Control", AltLeft: "Alt", AltRight: "Alt",
    Space: " ", Minus: "-", Equal: "=", Insert: "Insert", Delete: "Delete", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  };
  return map[c] ?? e.key;
}

window.addEventListener("pointerdown", (e: PointerEvent) => {
  const target = e.target as HTMLElement | null;
  const active = document.activeElement as HTMLElement | null;
  if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    active.blur();
  }
  canvas.focus();
});

addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") e.preventDefault();
  if (!running || !game) return;
  const target = e.target as HTMLElement;
  const isMoveKey = e.key.startsWith("Arrow") || e.code.startsWith("Arrow") || ["a", "d", "w", "s", "Alt", " ", "Space"].includes(e.key);
  if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
    if (target.closest(".hidden") || target.offsetParent === null) {
      target.blur();
      canvas.focus();
    } else if (isMoveKey && target === hud?.chatInput && hud?.chatInput.value === "") {
      target.blur();
      canvas.focus();
    } else {
      const k = keyName(e);
      if (k === "Escape" || k === "Enter") {
        target.blur();
        canvas.focus();
      }
      return;
    }
  }
  const k = keyName(e);
  if (k === "Enter") { e.preventDefault(); hud?.expandChat(); hud?.chatInput.focus(); return; }
  if (k === "Escape") { hud?.wins.closeTop(); return; }
  if (GAME_KEYS.has(k) || k.length === 1 || k === "F1" || k === "F2" || k === "Alt") e.preventDefault();
  if (!e.repeat && hud) {
    const w = hud.wins;
    if (k === "u" || (e.altKey && k === "s")) w.toggle(w.stat);
    else if (k === "c") w.toggle(w.charInfoWin);
    else if (k === "k") w.toggle(w.skill);
    else if (k === "i") w.ext.open("inv");
    else if (k === "e") w.ext.open("equip");
    else if (k === "j") w.ext.open("craft");
    else if (k === "h") w.ext.open("ah");
    else if (k === "g") w.toggle(w.guideWin);
    else if (k === "l" || k === "`" || k === "~") {
      if (game.isGm()) w.ext.items.open();
    }
    else if (k === "b") w.toggleAutoBattle();
    else if (k === "m") hud.toggleMinimap();
    else if (k === "'") hud.toggleChatMinimize();
    else if (k === "]") hud.toggleQuickSlots();
    else if (k === "F1" || k === "f1" || k === "F2" || k === "f2" || k === "\\") {
      if (game.isGm()) w.toggle(w.debugWin);
    }
  }
  if (!game.keys.has(k)) game.pressed.add(k);
  game.keys.add(k);
});
addEventListener("blur", () => { if (game) game.keys.clear(); });
addEventListener("focus", () => { if (game) game.keys.clear(); });
addEventListener("keyup", (e: KeyboardEvent) => {
  if (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") e.preventDefault();
  if (game) game.keys.delete(keyName(e));
});

function setLoading(status: string | null, pct = 0, sub?: string) {
  if (!status) {
    loading.classList.add("hidden");
    return;
  }
  loading.classList.remove("hidden");
  const stEl = document.getElementById("loading-status");
  const pctEl = document.getElementById("loading-pct");
  const fillEl = document.getElementById("loading-bar-fill");
  const subEl = document.getElementById("loading-sub");
  if (stEl) stEl.textContent = status;
  if (pctEl) pctEl.textContent = `${Math.min(100, Math.max(0, Math.round(pct)))}%`;
  if (fillEl) fillEl.style.width = `${Math.min(100, Math.max(0, Math.round(pct)))}%`;
  if (subEl && sub) subEl.textContent = sub;
}



async function boot() {
  setLoading("Starting Maple World…", 10, "Preparing world display");
  try {
    await r.init();
    const isWebGPU = r.backend === "webgpu";
    setLoading(
      "Loading Maple World…",
      25,
      "Setting up scene, camera & world display"
    );
    try {
      if (isWebGPU) {
        gameEntity = new Object3D();
        gameEntity.name = "GameSystem";
        game = gameEntity.addComponent(Game, { r });
        if (r.scene) {
          r.scene.addChild(gameEntity);
        }
      } else {
        game = new Game(r);
      }
    } catch {
      game = new Game(r);
    }
    window.__game = game;
  } catch (e) {
    errorBox.querySelector(".err-detail")!.textContent = e instanceof Error ? e.message : String(e);
    errorBox.classList.remove("hidden");
    title.classList.add("hidden");
    loading.classList.add("hidden");
    return;
  }

  // Initialize MapleStory Auth & Character Selection
  setLoading(null);
  new AuthUI({
    container: title,
    onCharacterSelected: (char: SpacetimeCharacter) => {
      start(char);
    },
  });
}

async function start(char?: SpacetimeCharacter) {
  if (running) return;
  running = true;
  title.classList.add("hidden");

  setLoading("Loading Game Interface…", 40, "Setting up interface & inventory layouts");
  const [ui, win, items] = await Promise.all([json("/wz/data/ui"), json("/wz/data/windows"), json("/wz/data/items")]);

  setLoading("Loading Equipment & Items…", 55, "Loaded weapons, armors, potions & crafting items");
  loadItemData(items);

  game.onMapChange = (m) => {
    hud?.setMap(m);
    const src = m.bgmUrl;
    if (bgm.src !== src) { bgm.src = src; bgm.play().catch(() => {}); }
  };
  game.onChat = (k, t) => {
    const transient = new Set(["exp", "meso", "level", "item", "notice", "system"]);
    if (transient.has(k)) hud?.wins.pushLog(k, t); else hud?.addChat(k, t);
  };
  game.onGain = (k, t) => { hud?.showGain(k, t); hud?.wins.pushLog(k as ChatKind, t); };
  game.onLog = (k, t) => hud?.wins.pushLog(k, t);

  let localSaved: any = null;
  const charName = char?.name || (localStorage.getItem("ms_current_character") || "Wayfarer").slice(0, 12);
  try {
    localSaved = JSON.parse(localStorage.getItem(`maple-wayfarer-save-${charName}`) ?? "null")
      ?? JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
  } catch {}

  let targetMap = FREE_MARKET_MAP;

  if (char) {
    const fullSave = char.stats?.fullSave || (localSaved?.stats?.name === char.name ? localSaved : null);
    if (fullSave) {
      game.restore(fullSave);
    } else {
      game.applyClassDefaults((char.classId as any) || "beginner");
      game.stats.level = char.level || 1;
      game.stats.exp = char.exp || 0;
      game.stats.hp = char.hp || 50;
      game.stats.maxHp = char.maxHp || 50;
      game.stats.mp = char.mp || 20;
      game.stats.maxMp = char.maxMp || 20;
      game.stats.meso = char.meso || 1000;
      if (Array.isArray(char.look) && char.look.length) {
        game.look = [...char.look];
      }
      if (localSaved) {
        game.restore(localSaved);
      }
    }
    // Strictly enforce character name from database
    game.stats.name = char.name;
    try {
      localStorage.setItem("ms_player_name", char.name);
      localStorage.setItem("ms_current_character", char.name);
    } catch {}

    // Resolve last map from SpacetimeDB or fullSave
    const savedMap = char.mapId || fullSave?.map || localSaved?.map;
    targetMap = savedMap ? Number(savedMap) : FREE_MARKET_MAP;
  } else {
    game.stats.name = charName;
    if (localSaved?.stats?.name === charName || localSaved) {
      game.restore(localSaved);
    } else {
      game.applyClassDefaults("beginner");
    }
    targetMap = localSaved?.map ? Number(localSaved.map) : FREE_MARKET_MAP;
  }

  // Ensure default fallback if not in saved state
  if (typeof game.auto.battle !== "boolean") game.auto.battle = true;
  if (typeof game.auto.boss !== "boolean") game.auto.boss = true;

  setLoading("Loading Map & Footholds…", 72, "Loading map background, tiles & platforms");
  try {
    await game.init(targetMap);
  } catch (err) {
    console.warn("Failed to initialize target map, falling back to Free Market:", err);
    try {
      await game.init(FREE_MARKET_MAP);
    } catch {}
  }
  game.loadingMap = false;
  game.fade = 0;
  r.resize();
  if (char?.name) {
    game.stats.name = char.name;
    try {
      localStorage.setItem("ms_player_name", char.name);
    } catch {}
  }

  setLoading("Entering Game…", 88, "Preparing health bars, chat & minimap");
  const isWebGPU = r.backend === "webgpu" && !!r.scene;
  try {
    if (isWebGPU) {
      hudEntity = new Object3D();
      hudEntity.name = "UISystem";
      hud = hudEntity.addComponent(Hud, { ui, game, win }) ?? new Hud(ui, game, win);
      if (r.scene) {
        r.scene.addChild(hudEntity);
      }
    } else {
      hud = new Hud(ui, game, win);
    }
  } catch {
    hud = new Hud(ui, game, win);
  }
  if (!hud.wins) hud.setup(ui, game, win);
  hud.setMap(game.map);

  // Mount the real-time performance panel (FPS, Ping, JS Heap) right next to HP/MP bar on the right side.
  if (hud.perfContainer) {
    debugContainer = hud.perfContainer;
    createRoot(debugContainer).render(createElement(DebugPanel));
  }

  hud.addChat("system", "Arrows / WASD move · Alt/C/Space jump · Ctrl/X attack · Shift, Ins, Home, PgUp skills · Del/End potions · Z loot · Up/W at a portal");
  hud.addChat("system", "U stats · K skills · E equipment · I inventory · J crafting · H auction house · B auto battle. Drag icons onto quick slots.");
  if (game.isGm()) {
    hud.addChat("notice", "★ [GM Privileges Active] Press F1 for GM Control Panel · L for All-Items Catalog · Type /gm for commands.");
  }
  hud.addChat("notice", `Welcome back, [${game.stats.name}]! Character ready.`);
  if (game.map.id === FREE_MARKET_MAP) {
    hud.addChat("notice", "Welcome to Free Market! This is a peaceful social hub. Enter portals to visit hunting zones.");
  } else {
    hud.addChat("notice", `${game.auto.battle ? "Auto Combat is ON" : "Auto Combat is OFF"}. Hunting monsters in ${game.map.name}. Stage boss ready every 25 kills.`);
  }

  game.ah.refresh(Date.now());
  const persist = () => {
    try {
      const full = game.save();
      const charSaveKey = game.stats.name ? `maple-wayfarer-save-${game.stats.name}` : SAVE_KEY;
      localStorage.setItem(charSaveKey, JSON.stringify(full));
      localStorage.setItem(SAVE_KEY, JSON.stringify(full));
      spacetime.saveCharacter({
        name: game.stats.name,
        level: game.stats.level,
        exp: game.stats.exp,
        hp: game.stats.hp,
        maxHp: game.stats.maxHp,
        mp: game.stats.mp,
        maxMp: game.stats.maxMp,
        meso: game.stats.meso,
        mapId: game.map?.id || FREE_MARKET_MAP,
        x: Math.round(game.p.x),
        y: Math.round(game.p.y),
        look: game.look,
        stats: { ...game.stats, fullSave: full },
        inventory: [...game.bag],
        equipment: { eq: game.eq, visualEq: game.visualEq },
        skills: { skillLv: game.skillLv, quick: game.quick },
      }).catch(() => {});
    } catch {}
  };
  let saveT = 0;
  game.onChange = () => { clearTimeout(saveT); saveT = setTimeout(persist, 800) as unknown as number; };
  setInterval(persist, 10000);
  addEventListener("character-renamed", () => persist());
  addEventListener("beforeunload", persist);
  bgm.src = game.map.bgmUrl;
  bgm.play().catch(() => {});

  setLoading(
    "Welcome to the Maple World!",
    100,
    game.map.id === FREE_MARKET_MAP
      ? "Social Hub active. Meet players and trade in the Free Market!"
      : "Auto Battle active. Ready to explore."
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  setLoading(null);
  game.fullyLoaded = true;
  game.initWs();
  document.body.classList.add("playing");
  canvas.focus();
}



let last = performance.now();
let manual = false;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running && !manual && game) game.update(dt);
  if (running && game) { game.draw(); hud?.update(dt); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global { interface Window { advanceTime: (ms: number) => void; render_game_to_text: () => string; __game: Game } }
window.__game = game;
window.advanceTime = (ms: number) => {
  if (!game) return;
  manual = true;
  const n = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < n; i++) game.update(1 / 60);
  game.draw(); hud?.update(1 / 60);
};
window.render_game_to_text = () => {
  if (!game) return "{}";
  return JSON.stringify({
    coords: "MapleStory world px, +y down",
    running, map: game.map?.name, mapId: game.map?.id,
    player: { x: Math.round(game.p.x), y: Math.round(game.p.y), onGround: !!game.p.fh, ladder: !!game.p.ladder, anim: game.p.anim, face: game.p.face },
    stats: game.stats,
    mobs: game.mobs.filter((m) => m.state !== "dead").slice(0, 8).map((m) => ({ name: m.data?.name ?? "Mob", x: Math.round(m.x), y: Math.round(m.y), hp: m.hp, state: m.state })),
    drops: game.drops.length, portals: game.portals.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), to: p.to })),
  });
};

boot();
if ((import.meta as any).hot) {
  (import.meta as any).hot.accept();
}
