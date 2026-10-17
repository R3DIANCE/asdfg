import type { Renderer, Tex } from "./gpu.ts";

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
    // 1. Prioritize internal WebSocket stream (zero client-side fetch exposure)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const base64: string = await this.requestAsset(url, 2500);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: "image/png" });
      } catch (err: any) {
        // If server explicitly responded that asset is not found, fail immediately without HTTP hammer
        if (err?.message?.includes("not found") || err?.message?.includes("404")) {
          throw err;
        }
      }
    }
    // 2. Encapsulated internal fallback
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(String(res.status));
    return await res.blob();
  }

  static async loadJson<T = any>(path: string): Promise<T> {
    // 1. Prioritize internal WebSocket stream
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const data = await this.requestAsset(path, 3000);
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
    return (await res.json()) as T;
  }
}

/** Loads images as GPU textures (streamed from the local client via /wz). */
export class Assets {
  private cache = new Map<string, Tex | null>();
  private failedAt = new Map<string, number>();
  private permanentFailures = new Set<string>();
  private pending = new Map<string, Promise<Tex | null>>();
  loaded = 0;
  failed = 0;

  constructor(private r: Renderer) {}

  load(url: string): Promise<Tex | null> {
    if (this.permanentFailures.has(url)) return Promise.resolve(null);
    if (this.cache.has(url)) {
      const existing = this.cache.get(url);
      if (existing) return Promise.resolve(existing);
      const fTime = this.failedAt.get(url) ?? 0;
      // Do not re-fetch failed assets for at least 300 seconds (5 minutes)
      if (performance.now() - fTime < 300000) return Promise.resolve(null);
      this.cache.delete(url);
      this.failedAt.delete(url);
    }
    const hit = this.pending.get(url);
    if (hit) return hit;
    const p = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          while (active >= 16) await new Promise((r) => setTimeout(r, 20));
          active++;
          const src = attempt ? `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}` : url;
          const blob = await EngineAssetBridge.loadBlob(src).finally(() => active--);
          const bmp = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
          const t = this.r.texture(bmp);
          this.cache.set(url, t);
          this.failedAt.delete(url);
          this.loaded++;
          return t;
        } catch (err: any) {
          const errMsg = String(err?.message || "");
          if (errMsg.includes("404") || errMsg.includes("not found")) {
            // Permanent 404 - never retry
            this.permanentFailures.add(url);
            break;
          }
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 150));
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
    if (t) return t;
    if (t === null) {
      if (this.permanentFailures.has(url)) return null;
      const fTime = this.failedAt.get(url) ?? 0;
      // Only retry transient failures after 5 minutes
      if (performance.now() - fTime >= 300000) {
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
    this.cache.set(url, tex);
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

