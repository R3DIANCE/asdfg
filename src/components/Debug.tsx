import { useEffect, useRef, useState } from "react";

// Minimal performance overlay: FPS, Ping, and JS Heap in simple text with no background.
export function DebugPanel() {
  const last = useRef(performance.now());
  const frames = useRef(0);
  const timeAcc = useRef(0);
  const [fps, setFps] = useState(60);
  const [ping, setPing] = useState<number | null>(null);
  const [heap, setHeap] = useState<number | null>(null);

  // Frame tick: calculate FPS over 0.5s intervals
  useEffect(() => {
    let animId: number;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last.current) / 1000);
      last.current = now;

      timeAcc.current += dt;
      frames.current += 1;
      if (timeAcc.current >= 0.5) {
        const currentFps = Math.round(frames.current / timeAcc.current);
        setFps(currentFps);
        timeAcc.current = 0;
        frames.current = 0;
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Ping tracking: read WebSocket ping or measure active roundtrip
  useEffect(() => {
    const checkPing = () => {
      const g = (window as any).__game;
      if (g && typeof g.wsPing === "number" && g.wsPing > 0) {
        setPing(g.wsPing);
      } else {
        // Fallback HTTP roundtrip measurement
        const start = performance.now();
        fetch("/wz/status", { cache: "no-store" })
          .then((r) => {
            if (r.ok) {
              const diff = Math.round(performance.now() - start);
              setPing(Math.max(1, diff));
            }
          })
          .catch(() => {});
      }
    };
    checkPing();
    const t = setInterval(checkPing, 800);
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
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        fontSize: "12px",
        fontWeight: 700,
        fontFamily: "'SF Mono', Menlo, Consolas, monospace",
        textShadow: "0 1px 3px rgba(0, 0, 0, 0.95), 0 0 2px rgba(0, 0, 0, 0.9)",
        pointerEvents: "none",
        userSelect: "none",
        background: "transparent",
        border: "none",
        padding: 0,
        margin: 0,
      }}
    >
      <span style={{ color: fpsColor }}>{fps} FPS</span>
      <span style={{ color: pingColor }}>{pingStr}</span>
      {heap != null && <span style={{ color: "#cbd5e1" }}>{heap} MB JS</span>}
    </div>
  );
}

export default DebugPanel;
