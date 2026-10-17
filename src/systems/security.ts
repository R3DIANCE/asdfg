/**
 * Maple Wayfarer Client Security & Anti-Inspection Layer
 * 
 * 1. Global context menu suppression across canvas and all UI layers
 * 2. DevTools shortcut blocking (F12, Ctrl+Shift+I/J/C, Ctrl+U, etc.)
 * 3. Anti-debugging & inspection deterrents
 * 4. Console log protection to prevent dumping internal game state
 * 5. UI drag & selection protection matching native WebGL/WebGPU surface
 */

export function initClientSecurity() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const isDevDebug = window.location.search.includes("debug=1");

  // 1. Globally suppress native browser context menu on canvas and all UI layers
  const suppressContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };
  window.addEventListener("contextmenu", suppressContextMenu, { capture: true, passive: false });
  document.addEventListener("contextmenu", suppressContextMenu, { capture: true, passive: false });
  if (document.body) {
    document.body.addEventListener("contextmenu", suppressContextMenu, { capture: true, passive: false });
  }

  // 2. Prevent dragging images / DOM elements like a web document
  window.addEventListener("dragstart", (e: DragEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target?.classList?.contains("ui-allow-drag")) {
      e.preventDefault();
    }
  }, { capture: true });

  // 3. Block DevTools inspection shortcuts & page source viewing
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (isDevDebug) return;

    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const code = e.code.toLowerCase();

    // F12 key
    if (e.key === "F12" || code === "f12") {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+Shift+I / J / C / K (DevTools Inspect / Console / Element picker)
    if (isCtrlOrMeta && e.shiftKey) {
      if (key === "i" || key === "j" || key === "c" || key === "k") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }

    // Ctrl+U (View Page Source), Ctrl+S (Save Page), Ctrl+P (Print)
    if (isCtrlOrMeta && !e.shiftKey && !e.altKey) {
      if (key === "u" || key === "s" || key === "p") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }
  }, { capture: true });

  // 4. Console Protection: Silence internal dumps & show security banner
  if (!isDevDebug) {
    const bannerShown = { val: false };
    const showSecurityBanner = () => {
      if (bannerShown.val) return;
      bannerShown.val = true;
      try {
        console.clear();
        console.log(
          "%c Maple Wayfarer %c WebGL/WebGPU Layer Active · DevTools Inspection Restricted ",
          "background: #0284c7; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;",
          "background: #09090b; color: #38bdf8; font-weight: bold; padding: 4px 8px; border-radius: 0 4px 4px 0; border: 1px solid #0284c7;"
        );
      } catch {}
    };

    showSecurityBanner();
  }

  // 6. Clean up loading scripts from DOM after initialization
  setTimeout(() => {
    try {
      const inlineScripts = document.querySelectorAll("body script:not([type='module'])");
      inlineScripts.forEach((s) => s.remove());
    } catch {}
  }, 1000);
}
