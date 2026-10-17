import { useEffect, useState } from "react";

// Minimal performance overlay: FPS, Ping, and JS Heap in simple text with no background.
export function DebugPanel() {
  const [fps, setFps] = useState(60);
  const [ping, setPing] = useState<number | null>(null);
  const [heap, setHeap] = useState<number | null>(null);
  const [renderType, setRenderType] = useState<string>("WebGPU");

  // Read FPS, Ping, and renderer backend tracking at 1Hz (zero RAF loop overhead)
  useEffect(() => {
    const checkState = () => {
      const g = (window as any).__game;
      if (g) {
        if (typeof g.displayFps === "number") {
          setFps(g.displayFps);
        }
        if (typeof g.wsPing === "number" && g.wsPing >= 0) {
          setPing(g.displayPing ?? g.wsPing);
        }
        if (g.r?.renderType) {
          setRenderType(g.r.renderType);
        }
      }
    };
    checkState();
    const t = setInterval(checkState, 1000);
    return () => clearInterval(t);
  }, []);

  // JS Heap usage from performance.memory
  useEffect(() => {
    const updateHeap = () => {
      if (typeof performance !== "undefined" && (performance as any).memory?.usedJSHeapSize) {
        setHeap(Math.round((performance as any).memory.usedJSHeapSize / 1048576));
      }
    };
    updateHeap();
    const t = setInterval(updateHeap, 1000);
    return () => clearInterval(t);
  }, []);

  const fpsColor = fps >= 50 ? "#4ade80" : fps >= 30 ? "#facc15" : "#f87171";
  const pingColor = ping != null && ping < 80 ? "#38bdf8" : ping != null && ping < 160 ? "#fbbf24" : "#f87171";
  const pingStr = ping != null ? `${ping}ms` : "—";

  return (
    <div
      className="dock-perf-badge"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        gap: "1px",
        height: "32px",
        minWidth: "95px",
        boxSizing: "border-box",
        padding: "0 6px",
        background: "transparent",
        border: "none",
        boxShadow: "none",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        fontFamily: "'SF Mono', Menlo, Consolas, monospace",
        textShadow: "0 1px 3px rgba(0, 0, 0, 0.95), 0 0 4px rgba(0, 0, 0, 0.8)",
        pointerEvents: "auto",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700, lineHeight: 1.25 }}>
        <span style={{ color: fpsColor }}>{fps} FPS</span>
        <span style={{ color: "rgba(255, 255, 255, 0.4)" }}>·</span>
        <span style={{ color: pingColor }}>{pingStr}</span>
        <span style={{ color: "rgba(255, 255, 255, 0.4)" }}>·</span>
        <span style={{ color: "#38bdf8" }}>{renderType}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "9.5px", fontWeight: 600, color: "#94a3b8", lineHeight: 1.2 }}>
        {heap != null ? <span>JS {heap} MB</span> : null}
      </div>
    </div>
  );
}

export default DebugPanel;
