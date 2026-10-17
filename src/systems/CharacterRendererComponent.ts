import { ComponentBase } from "@orillusion/core";
import type { Game } from "../game.ts";
import type { Tex } from "../gpu.ts";
import { charUrlFor } from "../game-types.ts";

/**
 * CharacterRendererComponent — Orillusion ECS Component for player & remote character rendering.
 *
 * Eliminates per-frame asset URL generation, prevents duplicate network calls,
 * memoizes textures by visual state signature, and smooths frame transitions with lastValidTex fallback.
 */
export class CharacterRendererComponent extends ComponentBase {
  look: number[] = [];
  anim = "";
  frame = 0;
  expr = "default";
  exprFrame = 0;
  face = 0;
  x = 0;
  y = 0;

  activeTex: Tex | null = null;
  lastValidTex: Tex | null = null;

  private currentKey = "";
  private requestedKey = "";
  private game?: Game;

  // Shared memory texture cache across all instances to prevent duplicate network loads
  private static frameCache = new Map<string, Tex | null>();
  private static inflight = new Map<string, Promise<Tex | null>>();
  private static lastKnownTexByLook = new Map<string, Tex>();

  constructor(param?: { game?: Game }) {
    super();
    if (param?.game) this.game = param.game;
  }

  public override init(param?: { game?: Game }): void {
    super.init(param);
    if (param?.game) this.game = param.game;
  }

  public setGame(game: Game) {
    this.game = game;
  }

  /**
   * Fast state check: if the visual signature (look, anim, frame, expr, exprFrame)
   * is identical to the current frame, returns the existing texture immediately with zero allocations.
   */
  public updateState(
    look: number[],
    anim: string,
    frame: number,
    expr = "default",
    exprFrame = 0,
    face = 0,
    x = 0,
    y = 0
  ): Tex | null {
    this.face = face;
    this.x = x;
    this.y = y;

    // Fast signature check without allocations if looks haven't changed
    const key = `${look.join(",")}:${anim}:${frame}:${expr}:${exprFrame}`;

    if (key === this.currentKey && this.activeTex) {
      return this.activeTex;
    }

    this.look = look;
    this.anim = anim;
    this.frame = frame;
    this.expr = expr;
    this.exprFrame = exprFrame;
    this.currentKey = key;

    // 1. Check shared in-memory texture cache
    const cached = CharacterRendererComponent.frameCache.get(key);
    if (cached) {
      this.activeTex = cached;
      this.lastValidTex = cached;
      return cached;
    }

    // 2. Synchronous check on game.assets cache (e.g. preloaded assets)
    const g = this.game || (typeof window !== "undefined" && (window as any).__game);
    if (g?.assets) {
      const url = charUrlFor(look, anim, frame, expr, exprFrame);
      const immediate = g.assets.get(url) ??
        (expr !== "default" ? g.assets.get(charUrlFor(look, anim, frame)) : null) ??
        g.assets.get(charUrlFor(look, "stand1", 0));
      if (immediate) {
        CharacterRendererComponent.frameCache.set(key, immediate);
        this.activeTex = immediate;
        this.lastValidTex = immediate;
        return immediate;
      }
    }

    // 3. If already requesting this exact frame, smoothly draw previous frame (zero stutter/flicker)
    const fallback = this.activeTex ?? this.lastValidTex ?? CharacterRendererComponent.lastKnownTexByLook.get(look.join(","));
    if (this.requestedKey === key) {
      return fallback ?? null;
    }

    this.requestedKey = key;
    this.requestFrame(key, look, anim, frame, expr, exprFrame);

    return fallback ?? null;
  }

  private async requestFrame(
    key: string,
    look: number[],
    anim: string,
    frame: number,
    expr: string,
    exprFrame: number
  ) {
    const g = this.game || (window as any).__game;
    if (!g?.assets) return;

    let p = CharacterRendererComponent.inflight.get(key);
    if (!p) {
      const url = charUrlFor(look, anim, frame, expr, exprFrame);
      p = (async () => {
        try {
          let tex = await g.assets.load(url);
          if (!tex && expr !== "default") {
            tex = await g.assets.load(charUrlFor(look, anim, frame));
          }
          if (!tex && (anim !== "stand1" || frame !== 0)) {
            tex = await g.assets.load(charUrlFor(look, "stand1", 0));
          }
          CharacterRendererComponent.frameCache.set(key, tex);
          return tex;
        } catch {
          CharacterRendererComponent.frameCache.set(key, null);
          return null;
        } finally {
          CharacterRendererComponent.inflight.delete(key);
        }
      })();
      CharacterRendererComponent.inflight.set(key, p);
    }

    const res = await p;
    if (res) {
      if (this.currentKey === key) {
        this.activeTex = res;
      }
      this.lastValidTex = res;
      CharacterRendererComponent.lastKnownTexByLook.set(look.join(","), res);
    }
  }

  public draw(
    game: Game,
    cx: number,
    cy: number,
    opts?: { alpha?: number; flip?: boolean; hoverY?: number }
  ) {
    const tex = this.activeTex ?? this.lastValidTex;
    if (!tex) return;

    const ox = Math.round(tex.w / 2);
    const oy = tex.w === 96 && tex.h === 96 ? 88 : tex.h === 384 ? 256 : Math.round(tex.h * (256 / 384));
    const drawPosY = this.y + (opts?.hoverY ?? 0);
    const flip = opts?.flip ?? (this.face === 1);
    const alpha = opts?.alpha ?? 1;

    game.r.draw(
      tex,
      Math.round(this.x - ox - cx),
      Math.round(drawPosY - oy - cy),
      tex.w,
      tex.h,
      { flip, alpha }
    );
  }
}
