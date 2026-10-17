// Modular Window Component — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
// Handles clamping, dragging, z-index elevation, and titlebars
import { ComponentBase } from "@orillusion/core";
import { el } from "../util.ts";

export function clampWindow(e: HTMLElement) {
  const availW = Math.max(200, innerWidth - 8);
  const availH = Math.max(200, innerHeight - 72);
  const curW = e.offsetWidth || parseInt(e.style.width) || 300;
  const curH = e.offsetHeight || parseInt(e.style.height) || 400;
  if (curW > availW) e.style.maxWidth = `${availW}px`;
  if (curH > availH) e.style.maxHeight = `${availH}px`;
  const w = e.offsetWidth || parseInt(e.style.width) || 300;
  const h = e.offsetHeight || parseInt(e.style.height) || 400;
  const maxL = Math.max(4, innerWidth - w - 4);
  const maxT = Math.max(4, innerHeight - h - 68);
  const curL = parseInt(e.style.left) || 0;
  const curT = parseInt(e.style.top) || 0;
  e.style.left = `${Math.max(4, Math.min(maxL, curL))}px`;
  e.style.top = `${Math.max(4, Math.min(maxT, curT))}px`;
}

import { setupTouchScroll } from "./touch-scroll.ts";

export interface WindowState {
  x: number;
  y: number;
  open: boolean;
}

const STORAGE_KEY = "ms_window_states";

export function loadWindowStates(): Record<string, WindowState> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveWindowState(id: string, patch: Partial<WindowState>) {
  if (!id || typeof localStorage === "undefined") return;
  try {
    const states = loadWindowStates();
    states[id] = { ...states[id], ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch {}
}

if (typeof window !== "undefined") {
  setupTouchScroll();
  window.addEventListener("resize", () => {
    document.querySelectorAll<HTMLElement>(".win:not(.hidden)").forEach((w) => {
      clampWindow(w);
      if (w.id) {
        const curL = parseInt(w.style.left) || 0;
        const curT = parseInt(w.style.top) || 0;
        saveWindowState(w.id, { x: curL, y: curT });
      }
    });
  });
}

export interface WindowOptions {
  id: string;
  w: number;
  h: number;
  title: string | null;
  x: number;
  y: number;
  layer: HTMLElement;
  nextZ: () => number;
}

export function makeWindow(opts: WindowOptions): HTMLElement {
  const { id, w, h, title, x, y, layer, nextZ } = opts;
  const states = loadWindowStates();
  const saved = states[id];

  const win = el("section", "win hidden win-css", layer);
  win.id = id;
  win.setAttribute("aria-label", title ?? id);

  const posX = typeof saved?.x === "number" ? saved.x : x;
  const posY = typeof saved?.y === "number" ? saved.y : y;

  const clX = Math.max(4, Math.min(Math.max(4, innerWidth - w - 4), posX));
  const clY = Math.max(4, Math.min(Math.max(4, innerHeight - h - 68), posY));
  Object.assign(win.style, { width: `${w}px`, height: `${h}px`, left: `${clX}px`, top: `${clY}px` });

  if (saved?.open === true) {
    win.classList.remove("hidden");
    win.style.zIndex = String(nextZ());
  }

  if (title) {
    const bar = el("div", "win-titlebar", win);
    const t = el("span", "win-title", bar);
    t.textContent = title;
    const close = el("button", "win-close", bar) as HTMLButtonElement;
    close.type = "button";
    close.textContent = "×";
    close.title = "Close";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", (ev) => {
      ev.stopPropagation();
      win.classList.add("hidden");
      saveWindowState(id, { open: false });
    });
  } else {
    el("div", "win-drag", win);
    const close = el("button", "win-close", win) as HTMLButtonElement;
    close.type = "button";
    close.textContent = "×";
    close.style.cssText = "position:absolute;right:6px;top:6px;width:20px;height:20px;display:grid;place-items:center;border:0;border-radius:4px;background:transparent;color:#7b8794;font:700 13px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;cursor:pointer;transition:background .12s,color .12s;z-index:5;";
    close.title = "Close";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", (ev) => {
      ev.stopPropagation();
      win.classList.add("hidden");
      saveWindowState(id, { open: false });
    });
  }

  const drag = (win.querySelector(".win-titlebar") || win.querySelector(".win-drag")) as HTMLElement | null;
  if (drag) {
    drag.addEventListener("pointerdown", (ev: PointerEvent) => {
      document.body.classList.add("cursor-grabbing");
      const ox = ev.clientX - win.offsetLeft, oy = ev.clientY - win.offsetTop;
      const mv = (m: PointerEvent) => {
        const curW = win.offsetWidth || w;
        const curH = win.offsetHeight || h;
        const maxL = Math.max(4, innerWidth - curW - 4);
        const maxT = Math.max(4, innerHeight - curH - 68);
        win.style.left = `${Math.max(4, Math.min(maxL, m.clientX - ox))}px`;
        win.style.top = `${Math.max(4, Math.min(maxT, m.clientY - oy))}px`;
      };
      const up = () => {
        document.body.classList.remove("cursor-grabbing");
        removeEventListener("pointermove", mv);
        removeEventListener("pointerup", up);
        const curL = parseInt(win.style.left) || 0;
        const curT = parseInt(win.style.top) || 0;
        saveWindowState(id, { x: curL, y: curT });
      };
      addEventListener("pointermove", mv);
      addEventListener("pointerup", up);
    });
  }

  win.addEventListener("pointerdown", () => {
    win.style.zIndex = String(nextZ());
  });

  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(() => {
      const isOpen = !win.classList.contains("hidden");
      saveWindowState(id, { open: isOpen });
    });
    observer.observe(win, { attributes: true, attributeFilter: ["class"] });
  }

  return win;
}

export class WindowComponent extends ComponentBase {
  public override start(): void {
    // Orillusion lifecycle hook
  }

  public override onUpdate(): void {
    // Orillusion lifecycle hook
  }

  public clamp(e: HTMLElement) {
    clampWindow(e);
  }

  public create(opts: WindowOptions): HTMLElement {
    return makeWindow(opts);
  }
}
