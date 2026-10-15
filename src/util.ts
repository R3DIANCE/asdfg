/** Creates an HTML element with class and optional parent. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

/** Formats integer with locale commas. */
export const fmt = (n: number) => Math.round(n).toLocaleString();

/** Escapes HTML special characters for safe string interpolation. */
export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Formats duration in seconds into 'Xh Ym' or 'Ym'. */
export const dur = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

/** Star string for Star Force rendering. */
export const stars = (n: number) => (n ? `<span class="stars">${"★".repeat(Math.min(n, 15))}</span>` : "");

const preloadedIcons = new Set<string>();

/** Preloads an icon URL into browser cache so it renders seamlessly without pop-in. */
export function preloadIcon(url: string) {
  if (!url || typeof Image === "undefined" || preloadedIcons.has(url)) return;
  preloadedIcons.add(url);
  const img = new Image();
  img.src = url;
}

/** Quick HTML icon tag with background-image and automatic seamless preloading. */
export const icon = (url: string, cls = "ic") => {
  preloadIcon(url);
  return `<span class="${cls}" style="background-image:url('${url}')"></span>`;
};

// ============================================================
// Background image loading
// ============================================================
const okSrc = new Map<string, string>();

/** Sets a background image, retrying with a cache-buster until it loads. */
export function bg(e: HTMLElement, url: string, attempt = 0) {
  const known = okSrc.get(url);
  if (known) { e.style.backgroundImage = `url("${known}")`; return; }
  const src = attempt ? `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}` : url;
  const img = new Image();
  img.onload = () => { okSrc.set(url, src); e.style.backgroundImage = `url("${src}")`; };
  img.onerror = () => { if (attempt < 4) setTimeout(() => bg(e, url, attempt + 1), 700 * (attempt + 1)); };
  img.src = src;
}
