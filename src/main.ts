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
import { AuthUI } from "./components/AuthUI";
import { spacetime, type SpacetimeCharacter } from "./spacetimedb";
import { StatsManager } from "./systems/stats-manager.ts";
import { GmDatGui } from "./components/GmDatGui.ts";
import { setUiMode, getUiMode, type UiMode } from "./systems/ui-mode.ts";
import { setupTouchScroll } from "./components/touch-scroll.ts";
import { initClientSecurity } from "./systems/security.ts";

initClientSecurity();

let root: HTMLElement | null = null;
let statsMgr: StatsManager = new StatsManager();
let gmGui: GmDatGui | null = null;

setupTouchScroll();



declare global {
  interface Window {
    advanceTime: (ms: number) => void;
    render_game_to_text: () => string;
    __game?: Game;
    __rafId?: number;
    __bgm?: HTMLAudioElement;
    __activeRenderer?: Renderer;
    __activeRendererInitialized?: boolean;
    __persist?: () => Promise<void>;
  }
}

// Clean up any running instance from previous HMR evaluation
if (window.__rafId) {
  cancelAnimationFrame(window.__rafId);
  window.__rafId = 0;
}
if (window.__game?.ws) {
  try { window.__game.ws.close(); } catch {}
}
if (window.__bgm) {
  try { window.__bgm.pause(); window.__bgm.src = ""; } catch {}
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const title = document.getElementById("title")!;
const loading = document.getElementById("loading")!;
const errorBox = document.getElementById("gpu-error")!;
const bgm = new Audio();
bgm.loop = true;
bgm.volume = 0.35;
window.__bgm = bgm;

const r = window.__activeRenderer ?? new Renderer(canvas);
window.__activeRenderer = r;
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

function isTextInputEl(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    const t = ((el as HTMLInputElement).type || "text").toLowerCase();
    return !["checkbox", "range", "radio", "button", "submit", "reset", "color", "file"].includes(t);
  }
  return false;
}

window.addEventListener("pointerdown", (e: PointerEvent) => {
  const target = e.target as HTMLElement | null;
  const active = document.activeElement as HTMLElement | null;
  if (isTextInputEl(target)) return;
  if (active && active !== canvas) {
    active.blur();
  }
  canvas.focus();
});

window.addEventListener("pointerup", (e: PointerEvent) => {
  const target = e.target as HTMLElement | null;
  if (isTextInputEl(target)) return;
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== canvas && !isTextInputEl(active)) {
    active.blur();
  }
  canvas.focus();
});

addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") e.preventDefault();
  if (!running || !game) return;
  const target = e.target as HTMLElement | null;
  const isMoveKey = e.key.startsWith("Arrow") || e.code.startsWith("Arrow") || ["a", "A", "d", "D", "w", "W", "s", "S", "Alt", " ", "Space"].includes(e.key);

  if (target && !isTextInputEl(target) && target !== canvas && target.tagName !== "BODY") {
    target.blur();
    canvas.focus();
  } else if (target && isTextInputEl(target)) {
    const val = (target as HTMLInputElement).value ?? "";
    if (target.closest(".hidden") || target.offsetParent === null) {
      target.blur();
      canvas.focus();
    } else if (isMoveKey && target === hud?.chatInput && val === "") {
      target.blur();
      canvas.focus();
    } else if ((e.key.startsWith("Arrow") || e.code.startsWith("Arrow") || e.key === "Alt") && val === "") {
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
    else if (k === "x" || (e.shiftKey && (k === "C" || k === "c"))) w.ext.openCashShop();
    else if (k === "g") w.toggle(w.guildWin);
    else if (k === "p") {
      w.toggle(w.partyWin);
      w.renderParty();
    }
    else if (k === "F3" || k === "f3") w.toggle(w.guideWin);
    else if (k === "l" || k === "`" || k === "~") {
      if (game.isGm()) w.ext.items.open();
    }
    else if (k === "m") hud.toggleMinimap();
    else if (k === "'") hud.toggleChatMinimize();
    else if (k === "]") hud.toggleQuickSlots();
    else if (k === "F1" || k === "f1" || k === "\\") {
      if (game.isGm()) w.toggle(w.debugWin);
    }
    else if (k === "F2" || k === "f2") {
      const nextMode = game.uiMode === "new" ? "old" : "new";
      setUiMode(nextMode);
      game.onChat("notice", `★ [UI Mode] Switched to ${nextMode.toUpperCase()} UI (${nextMode === "new" ? "WebGPU Canvas WZ HUD" : "Classic Modern DOM HUD"}).`);
    }
    else if (k === " ") {
      if (game.rune && Math.hypot(game.p.x - game.rune.x, game.p.y - game.rune.y) < 100) {
        game.liberateRune();
      }
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
    if (!window.__activeRendererInitialized) {
      await r.init();
      window.__activeRendererInitialized = true;
    }
    setLoading(
      "Loading Maple World…",
      25,
      "Setting up scene, camera & world display"
    );
    game = new Game(r);
    window.__game = game;
  } catch (e) {
    errorBox.querySelector(".err-detail")!.textContent = e instanceof Error ? e.message : String(e);
    errorBox.classList.remove("hidden");
    title.classList.add("hidden");
    loading.classList.add("hidden");
    return;
  }

  // Non-blocking background prefetch for instant loading
  json("/wz/data/ui").catch(() => null);
  json("/wz/data/windows").catch(() => null);
  json("/wz/data/items").catch(() => null);
  json("/wz/data/fx").catch(() => null);
  json("/wz/data/skills").catch(() => null);

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
  if (document.activeElement instanceof HTMLElement && document.activeElement !== canvas) {
    document.activeElement.blur();
  }
  title.innerHTML = "";
  title.classList.add("hidden");
  canvas.focus();

  setLoading("Loading Game Interface…", 40, "Setting up interface & inventory layouts");
  const [ui, win, items] = await Promise.all([json("/wz/data/ui"), json("/wz/data/windows"), json("/wz/data/items")]);

  setLoading("Loading Equipment & Items…", 55, "Loaded weapons, armors, potions & crafting items");
  loadItemData(items);

  game.onMapChange = (m) => {
    hud?.setMap(m);
    const src = m.bgmUrl;
    if (bgm.src !== src) { bgm.src = src; bgm.play().catch(() => {}); }
  };
  game.onChat = (k, t, itemLink) => {
    const transient = new Set(["exp", "meso", "level", "item"]);
    if (transient.has(k)) {
      hud?.wins.pushLog(k, t);
    } else if (k === "notice" || k === "system") {
      hud?.wins.pushLog(k, t);
    } else {
      hud?.addChat(k, t, itemLink);
    }
  };
  game.onGain = (k, t) => { hud?.showGain(k, t); hud?.wins.pushLog(k as ChatKind, t); };
  game.onLog = (k, t) => hud?.wins.pushLog(k, t);

  let localSaved: any = null;
  const charName = char?.name || (localStorage.getItem("ms_current_character") || "Wayfarer").slice(0, 12);
  try {
    const rawSpecific = localStorage.getItem(`maple-wayfarer-save-${charName}`)
      ?? localStorage.getItem(`maple-wayfarer-save-${charName.toLowerCase()}`);
    const parsed = JSON.parse(rawSpecific ?? "null");
    if (parsed && (!parsed.stats?.name || parsed.stats.name.toLowerCase() === charName.toLowerCase())) {
      localSaved = parsed;
    }
  } catch {}

  let targetMap = FREE_MARKET_MAP;
  let targetSpawnPos: { x: number; y: number } | undefined = undefined;

  if (char) {
    const matchesLocal = localSaved?.stats?.name && localSaved.stats.name.toLowerCase() === char.name.toLowerCase();
    const fullSave = char.stats?.fullSave || (matchesLocal ? localSaved : null);
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
    }
    // Strictly enforce character name and gender from database
    game.stats.name = char.name;
    if (char.gender) game.stats.gender = char.gender;
    try {
      localStorage.setItem("ms_player_name", char.name);
      localStorage.setItem("ms_current_character", char.name);
      if (char.gender) localStorage.setItem("ms_player_gender", char.gender);
    } catch {}

    // Resolve last map and coordinates from SpacetimeDB or fullSave
    const savedMap = char.mapId || fullSave?.map || localSaved?.map;
    targetMap = savedMap ? Number(savedMap) : FREE_MARKET_MAP;

    const savedX = (typeof char.x === "number" && (char.x !== 0 || char.y !== 0))
      ? char.x
      : (typeof fullSave?.p?.x === "number" ? fullSave.p.x : (typeof localSaved?.p?.x === "number" ? localSaved.p.x : null));
    const savedY = (typeof char.y === "number" && (char.x !== 0 || char.y !== 0))
      ? char.y
      : (typeof fullSave?.p?.y === "number" ? fullSave.p.y : (typeof localSaved?.p?.y === "number" ? localSaved.p.y : null));

    if (savedX !== null && savedY !== null && !isNaN(Number(savedX)) && !isNaN(Number(savedY))) {
      targetSpawnPos = { x: Number(savedX), y: Number(savedY) };
    }
  } else {
    game.stats.name = charName;
    if (localSaved) {
      game.restore(localSaved);
    } else {
      game.applyClassDefaults("beginner");
    }
    targetMap = localSaved?.map ? Number(localSaved.map) : FREE_MARKET_MAP;
    if (localSaved?.p && typeof localSaved.p.x === "number" && typeof localSaved.p.y === "number") {
      targetSpawnPos = { x: Number(localSaved.p.x), y: Number(localSaved.p.y) };
    }
  }

  // Also check ms_last_saved_pos fallback
  if (!targetSpawnPos) {
    try {
      const lastPos = JSON.parse(localStorage.getItem("ms_last_saved_pos") || "null");
      if (lastPos && lastPos.mapId === targetMap && typeof lastPos.x === "number" && typeof lastPos.y === "number") {
        targetSpawnPos = { x: Number(lastPos.x), y: Number(lastPos.y) };
      }
    } catch {}
  }

  // Restore auto combat state if previously enabled
  const savedAutoCombat = localStorage.getItem("ms_auto_combat");
  if (savedAutoCombat !== null) {
    game.auto.battle = savedAutoCombat === "true";
  } else if (typeof localSaved?.auto?.battle === "boolean") {
    game.auto.battle = localSaved.auto.battle;
  } else if (typeof char?.stats?.fullSave?.auto?.battle === "boolean") {
    game.auto.battle = char.stats.fullSave.auto.battle;
  }
  if (typeof game.auto.boss !== "boolean") game.auto.boss = true;

  setLoading("Loading Map & Footholds…", 72, "Loading map background, tiles & platforms");
  try {
    await game.init(targetMap, targetSpawnPos);
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
  hud = new Hud(ui, game, win);
  if (!hud.wins) hud.setup(ui, game, win);
  hud.setMap(game.map);
  game.hud = hud;
  game.windows = hud.wins;
  (window as any).__windows = hud.wins;
  (window as any).__hud = hud;
  (window as any).__game = game;
  game.loadGuild().catch(() => null);

  // Connect stats.js real-time performance monitor and dat.gui GM tools
  statsMgr.setGame(game);
  (window as any).__stats = statsMgr;

  gmGui = new GmDatGui(game);
  (window as any).__gmGui = gmGui;


  // Accumulate offline hunting progress across logout/login and prompt Welcome Back
  const savedTimestamp = localSaved?.lastLogoutAt || localSaved?.savedAt || (char?.stats?.fullSave?.lastLogoutAt as number) || (char?.stats?.fullSave?.savedAt as number) || 0;
  game.offlineRewards(savedTimestamp);

  game.ah.refresh(Date.now());
  let lastPersistTime = 0;
  let persistPending = false;
  const persist = async () => {
    const now = Date.now();
    if (now - lastPersistTime < 3000) {
      if (!persistPending) {
        persistPending = true;
        setTimeout(() => {
          persistPending = false;
          persist();
        }, 3000 - (now - lastPersistTime));
      }
      return;
    }
    lastPersistTime = now;
    try {
      const full = game.save();
      const charSaveKey = game.stats.name ? `maple-wayfarer-save-${game.stats.name}` : SAVE_KEY;
      localStorage.setItem(charSaveKey, JSON.stringify(full));
      localStorage.setItem(SAVE_KEY, JSON.stringify(full));
      localStorage.setItem("ms_last_saved_pos", JSON.stringify({
        mapId: game.map?.id || FREE_MARKET_MAP,
        x: Math.round(game.p.x),
        y: Math.round(game.p.y),
      }));
      await spacetime.saveCharacter({
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
  window.__persist = persist;
  (game as any).persist = persist;
  let saveT = 0;
  game.onChange = () => { clearTimeout(saveT); saveT = setTimeout(persist, 800) as unknown as number; };
  setInterval(persist, 10000);
  addEventListener("character-renamed", () => persist());
  addEventListener("beforeunload", () => {
    game.lastLogoutAt = Date.now();
    persist();
  });
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      game.lastLogoutAt = Date.now();
      persist();
    }
  });
  bgm.src = game.map.bgmUrl;
  bgm.play().catch(() => {});

  setLoading(null);
  game.fullyLoaded = true;
  game.initWs();
  document.body.classList.add("playing");
  canvas.focus();
}



let last = performance.now();
let manual = false;
function frame(now: number) {
  try {
    statsMgr.begin();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (running && !manual && game) game.update(dt);
    if (running && game) {
      game.draw();
      hud?.update(dt);
      gmGui?.update(dt);
    }
    statsMgr.update(dt);
  } catch (err) {
    console.error("Frame render error:", err);
  } finally {
    statsMgr.end();
    window.__rafId = requestAnimationFrame(frame);
  }
}
window.__rafId = requestAnimationFrame(frame);

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
  (import.meta as any).hot.accept(() => {
    window.location.reload();
  });
}
