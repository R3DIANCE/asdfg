import type { Renderer, Tex } from "./gpu.ts";
import { SessionAssetCache } from "./session-cache.ts";

export interface Sprite { url: string; w: number; h: number; ox: number; oy: number; delay?: number }

let active = 0;

/**
 * WebSocket streaming bridge for WZ assets & data.
 * Prevents exposing client-side fetch requests and bypasses HTTP roundtrips when connected.
 */
export class EngineAssetBridge {
  private static reqSeq = 0;
  private static pendingRequests = new Map<number, {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    timeout: any;
  }>();
  private static wsProvider: (() => WebSocket | null) | null = null;

  static setWsProvider(provider: () => WebSocket | null) {
    this.wsProvider = provider;
  }

  static get ws(): WebSocket | null {
    return this.wsProvider ? this.wsProvider() : null;
  }

  static handleAssetRes(msg: { id: number; path: string; data?: string; json?: any; error?: string }) {
    const pending = this.pendingRequests.get(msg.id);
    if (!pending) return;
    this.pendingRequests.delete(msg.id);
    clearTimeout(pending.timeout);
    if (msg.error) {
      pending.reject(new Error(msg.error));
    } else if (msg.data !== undefined) {
      pending.resolve(msg.data); // base64 string
    } else if (msg.json !== undefined) {
      pending.resolve(msg.json);
    } else {
      pending.reject(new Error("Empty asset response"));
    }
  }

  static requestAsset(path: string, timeoutMs = 8000): Promise<any> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket not connected"));
    }
    const id = ++this.reqSeq;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`WebSocket asset request timed out: ${path}`));
      }, timeoutMs);
      this.pendingRequests.set(id, { resolve, reject, timeout });
      ws.send(JSON.stringify({ t: "asset_req", id, path }));
    });
  }

  static async loadBlob(url: string): Promise<Blob> {
    // 0. Check session cache first (instant local hit)
    if (SessionAssetCache.hasBlob(url)) {
      try {
        const cached = await SessionAssetCache.getBlob(url);
        if (cached && cached.size > 0) return cached;
      } catch {}
    }

    // 1. Prioritize internal WebSocket stream (zero client-side fetch exposure)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const base64: string = await this.requestAsset(url, 4000);
        if (base64 && typeof base64 === "string" && base64.length > 0) {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: "image/png" });
          if (blob.size > 0) {
            SessionAssetCache.setBlob(url, blob);
            return blob;
          }
        }
      } catch {
        // Fall through to internal HTTP fetch
      }
    }
    // 2. Encapsulated internal fallback
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    if (blob.size === 0) throw new Error("Empty asset blob");
    SessionAssetCache.setBlob(url, blob);
    return blob;
  }

  static async loadJson<T = any>(path: string): Promise<T> {
    // 0. Check session cache first (instant local hit)
    if (SessionAssetCache.hasJson(path)) {
      try {
        const cached = await SessionAssetCache.getJson<T>(path);
        if (cached !== null && cached !== undefined) return cached;
      } catch {}
    }

    // 1. Prioritize internal WebSocket stream
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const data = await this.requestAsset(path, 3000);
        SessionAssetCache.setJson(path, data);
        return data as T;
      } catch (err: any) {
        if (err?.message?.includes("not found") || err?.message?.includes("404")) {
          throw err;
        }
      }
    }
    // 2. Encapsulated internal fallback
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    const data = (await res.json()) as T;
    SessionAssetCache.setJson(path, data);
    return data;
  }
}

interface CachedTexMeta {
  tex: Tex;
  lastUsed: number;
  pinned: boolean;
  sizeBytes: number;
}

function isPinnedAsset(url: string): boolean {
  return (
    url.includes("/wz/sprite/StatusBar") ||
    url.includes("/wz/sprite/Basic") ||
    url.includes("/wz/sprite/UI") ||
    url.includes("/wz/sprite/Effect/BasicEff") ||
    url.includes("/wz/map/") ||
    url.includes("/wz/sprite/Map/") ||
    url.includes("head=1") ||
    url.includes("portrait=1")
  );
}

/** Loads images as GPU textures (streamed from the local client via /wz) with dynamic memory lifecycle management. */
export class Assets {
  private cache = new Map<string, Tex | null>();
  private entryMeta = new Map<string, CachedTexMeta>();
  private failedAt = new Map<string, number>();
  private pending = new Map<string, Promise<Tex | null>>();
  loaded = 0;
  failed = 0;

  constructor(private r: Renderer) {}

  /** Touch an asset to keep it fresh in the dynamic LRU cache */
  touch(url: string) {
    const meta = this.entryMeta.get(url);
    if (meta) meta.lastUsed = performance.now();
  }

  /** Explicitly marks a URL as pinned so it will never be pruned during memory sweeps */
  pin(url: string) {
    const meta = this.entryMeta.get(url);
    if (meta) meta.pinned = true;
  }

  /** Unloads a single texture and frees GPU / WebGL VRAM immediately */
  unload(url: string): boolean {
    const t = this.cache.get(url);
    if (t) {
      this.r.destroyTexture(t);
      this.cache.delete(url);
      this.entryMeta.delete(url);
      return true;
    }
    if (this.cache.has(url)) {
      this.cache.delete(url);
      this.entryMeta.delete(url);
    }
    return false;
  }

  /**
   * Unloads map-specific canvases and decorative layers from the previous map,
   * immediately freeing up to 50MB-150MB of GPU VRAM per map transition.
   */
  unloadMapAssets(oldMapRenderUrl?: string) {
    if (oldMapRenderUrl) {
      this.unload(oldMapRenderUrl);
    }
    const cutoff = performance.now() - 15000;
    for (const [url, meta] of this.entryMeta.entries()) {
      if (!meta.pinned && (url.includes("/wz/map/") || url.includes("/wz/data/map/")) && meta.lastUsed < cutoff) {
        this.unload(url);
      }
    }
  }

  /**
   * Dynamically prunes unpinned textures that have not been rendered recently.
   * If cache exceeds maxEntries, evicts the oldest textures until within budget.
   */
  prune(maxAgeMs = 40000, maxEntries = 200) {
    const now = performance.now();
    const candidates: { url: string; lastUsed: number }[] = [];

    for (const [url, meta] of this.entryMeta.entries()) {
      if (meta.pinned) continue;
      if (now - meta.lastUsed > maxAgeMs) {
        this.unload(url);
      } else {
        candidates.push({ url, lastUsed: meta.lastUsed });
      }
    }

    if (this.entryMeta.size > maxEntries) {
      candidates.sort((a, b) => a.lastUsed - b.lastUsed);
      const toEvict = this.entryMeta.size - maxEntries;
      for (let i = 0; i < toEvict && i < candidates.length; i++) {
        this.unload(candidates[i].url);
      }
    }
  }

  /** Estimated total megabytes of GPU texture memory in use */
  estimateVramMB(): number {
    let total = 0;
    for (const meta of this.entryMeta.values()) total += meta.sizeBytes;
    return Math.round(total / (1024 * 1024));
  }

  load(url: string): Promise<Tex | null> {
    if (this.cache.has(url)) {
      const existing = this.cache.get(url);
      if (existing) {
        this.touch(url);
        return Promise.resolve(existing);
      }
      const fTime = this.failedAt.get(url) ?? 0;
      // Do not re-fetch failed assets for at least 3 seconds
      if (performance.now() - fTime < 3000) return Promise.resolve(null);
      this.cache.delete(url);
      this.failedAt.delete(url);
    }
    const hit = this.pending.get(url);
    if (hit) return hit;
    const p = (async () => {
      // 0. Fast-path: local session cache hit bypasses network concurrency throttle
      if (SessionAssetCache.hasBlob(url)) {
        try {
          const cachedBlob = await SessionAssetCache.getBlob(url);
          if (cachedBlob && cachedBlob.size > 0) {
            try {
              const bmp = await createImageBitmap(cachedBlob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
              const t = this.r.texture(bmp);
              this.cache.set(url, t);
              this.entryMeta.set(url, {
                tex: t,
                lastUsed: performance.now(),
                pinned: isPinnedAsset(url),
                sizeBytes: bmp.width * bmp.height * 4,
              });
              this.failedAt.delete(url);
              this.loaded++;
              return t;
            } catch {
              SessionAssetCache.delete(url);
            }
          }
        } catch {}
      }

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          while (active >= 16) await new Promise((r) => setTimeout(r, 20));
          active++;
          const src = attempt ? `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}` : url;
          const blob = await EngineAssetBridge.loadBlob(src).finally(() => active--);
          const bmp = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
          const t = this.r.texture(bmp);
          this.cache.set(url, t);
          this.entryMeta.set(url, {
            tex: t,
            lastUsed: performance.now(),
            pinned: isPinnedAsset(url),
            sizeBytes: bmp.width * bmp.height * 4,
          });
          this.failedAt.delete(url);
          this.loaded++;
          return t;
        } catch {
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 100));
          }
        }
      }
      this.cache.set(url, null);
      this.failedAt.set(url, performance.now());
      this.failed++;
      return null;
    })().finally(() => {
      this.pending.delete(url);
    });
    this.pending.set(url, p);
    return p;
  }

  /** Returns the texture if ready; otherwise starts loading and returns null. */
  get(url: string): Tex | null {
    const t = this.cache.get(url);
    if (t) {
      this.touch(url);
      return t;
    }
    if (t === null) {
      const fTime = this.failedAt.get(url) ?? 0;
      // Retry transient failures after 3 seconds
      if (performance.now() - fTime >= 3000) {
        this.cache.delete(url);
        this.failedAt.delete(url);
        this.load(url);
      }
      return null;
    }
    this.load(url);
    return null;
  }

  set(url: string, tex: Tex | null) {
    if (tex) {
      this.cache.set(url, tex);
      this.entryMeta.set(url, {
        tex,
        lastUsed: performance.now(),
        pinned: isPinnedAsset(url),
        sizeBytes: (tex.w || 32) * (tex.h || 32) * 4,
      });
    } else {
      this.unload(url);
    }
  }

  has(url: string): boolean {
    return this.cache.has(url);
  }
}

const jsonCache = new Map<string, Promise<any>>();

export function json<T = any>(path: string): Promise<T> {
  let hit = jsonCache.get(path);
  if (!hit) {
    hit = EngineAssetBridge.loadJson<T>(path).catch((err) => {
      jsonCache.delete(path);
      throw err;
    });
    jsonCache.set(path, hit);
  }
  return hit;
}

