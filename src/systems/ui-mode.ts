export type UiMode = "new" | "old";

export function getInitialUiMode(): UiMode {
  try {
    const saved = localStorage.getItem("ms_ui_mode");
    if (saved === "old" || saved === "new") return saved;
  } catch {}
  return "new";
}

let currentUiMode: UiMode = getInitialUiMode();

export function getUiMode(): UiMode {
  return currentUiMode;
}

export function setUiMode(mode: UiMode): UiMode {
  currentUiMode = mode;
  try {
    localStorage.setItem("ms_ui_mode", mode);
  } catch {}

  if (typeof window !== "undefined") {
    (window as any).UI_MODE = mode;
    if ((window as any).__game) {
      (window as any).__game.uiMode = mode;
    }
  }

  // Update DOM body classes
  if (typeof document !== "undefined" && document.body) {
    if (mode === "new") {
      document.body.classList.add("ui-mode-new");
      document.body.classList.remove("ui-mode-old");
    } else {
      document.body.classList.add("ui-mode-old");
      document.body.classList.remove("ui-mode-new");
    }
  }

  // Update GmDatGui controller if present
  if (typeof window !== "undefined") {
    const gmGui = (window as any).__gmGui;
    if (gmGui?.params) {
      gmGui.params.uiMode = mode;
    }
    window.dispatchEvent(new CustomEvent("ui-mode-change", { detail: { mode } }));
  }

  return currentUiMode;
}

// Global initialization
if (typeof window !== "undefined") {
  (window as any).setUiMode = setUiMode;
  (window as any).getUiMode = getUiMode;
  (window as any).UI_MODE = currentUiMode;
  if (document.body) {
    setUiMode(currentUiMode);
  } else {
    window.addEventListener("DOMContentLoaded", () => setUiMode(currentUiMode));
  }
}
