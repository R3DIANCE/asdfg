import type { Renderer, Tex } from "../gpu.ts";
import type { Assets, Sprite } from "../assets.ts";
import type { Game } from "../game.ts";
import {
  type Back,
  type DmgText,
  type Fx,
  type ItemEffData,
  type ItemEffFrame,
  type Mob,
  type RemotePlayer,
  charUrlFor,
} from "../game-types.ts";
import { itemIconRaw } from "../skills.ts";
import { PetSystem } from "./pet-system.ts";

const textTexCache = new Map<string, Tex>();
const textTexPending = new Set<string>();

const balloonSlices: Record<string, HTMLImageElement> = {};
let balloonSlicesLoaded = false;
let balloonSlicesLoading = false;

function loadBalloonSlices() {
  if (balloonSlicesLoaded || balloonSlicesLoading || typeof Image === "undefined") return;
  balloonSlicesLoading = true;
  const parts = ["nw", "n", "ne", "w", "c", "e", "sw", "s", "se", "arrow"];
  let loaded = 0;
  for (const p of parts) {
    const img = new Image();
    img.src = `/wz/ui/ChatBalloon/0/${p}`;
    img.onload = () => {
      loaded++;
      if (loaded === parts.length) {
        balloonSlicesLoaded = true;
        balloonSlicesLoading = false;
        for (const [k] of textTexCache) {
          if (k.startsWith("balloon:")) textTexCache.delete(k);
        }
      }
    };
    img.onerror = () => {
      balloonSlicesLoading = false;
    };
    balloonSlices[p] = img;
  }
}
loadBalloonSlices();

export function renderTextTexture(r: Renderer, text: string, type: "name" | "balloon"): Tex | null {
  const key = `${type}:${text}`;
  const hit = textTexCache.get(key);
  if (hit) return hit;
  if (textTexPending.has(key)) return null;
  textTexPending.add(key);

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (type === "name") {
      ctx.font = "bold 11px Tahoma, Arial, sans-serif";
      const tm = ctx.measureText(text);
      const tw = Math.ceil(tm.width);
      const padX = 6;
      const w = Math.max(24, tw + padX * 2);
      const h = 16;
      canvas.width = w;
      canvas.height = h;

      ctx.font = "bold 11px Tahoma, Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";

      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      ctx.beginPath();
      if ((ctx as any).roundRect) (ctx as any).roundRect(0, 0, w, h, 3);
      else ctx.rect(0, 0, w, h);
      ctx.fill();

      ctx.strokeStyle = "rgba(60, 60, 60, 0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, w / 2, h / 2 + 0.5);
    } else {
      ctx.font = "bold 12px Arial, Tahoma, sans-serif";
      const tm = ctx.measureText(text);
      const tw = Math.ceil(tm.width);

      const padX = 6;
      const contentW = Math.max(28, tw + padX * 2);
      const contentH = 14;

      const cornerW = balloonSlices.nw ? balloonSlices.nw.naturalWidth : 4;
      const cornerH = balloonSlices.nw ? balloonSlices.nw.naturalHeight : 4;
      const arrowH = balloonSlices.arrow ? balloonSlices.arrow.naturalHeight : 4;

      const totalW = contentW + cornerW * 2;
      const bubbleH = contentH + cornerH * 2;
      const totalH = bubbleH + arrowH;

      canvas.width = totalW;
      canvas.height = totalH;

      if (balloonSlicesLoaded && balloonSlices.c) {
        ctx.drawImage(balloonSlices.nw, 0, 0);
        ctx.drawImage(balloonSlices.n, cornerW, 0, contentW, cornerH);
        ctx.drawImage(balloonSlices.ne, cornerW + contentW, 0);

        ctx.drawImage(balloonSlices.w, 0, cornerH, cornerW, contentH);
        ctx.drawImage(balloonSlices.c, cornerW, cornerH, contentW, contentH);
        ctx.drawImage(balloonSlices.e, cornerW + contentW, cornerH, cornerW, contentH);

        ctx.drawImage(balloonSlices.sw, 0, cornerH + contentH);
        ctx.drawImage(balloonSlices.s, cornerW, cornerH + contentH, contentW, cornerH);
        ctx.drawImage(balloonSlices.se, cornerW + contentW, cornerH + contentH);

        const arrowW = balloonSlices.arrow.naturalWidth;
        const arrowX = Math.round((totalW - arrowW) / 2);
        ctx.drawImage(balloonSlices.arrow, arrowX, bubbleH);
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#2b2b2b";
        ctx.lineWidth = 1.2;
        if ((ctx as any).roundRect) (ctx as any).roundRect(1, 1, totalW - 2, bubbleH - 2, 4);
        else ctx.rect(1, 1, totalW - 2, bubbleH - 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.font = "bold 12px Arial, Tahoma, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = "#000000";
      ctx.fillText(text, totalW / 2, cornerH + contentH / 2 + 1);
    }

    createImageBitmap(canvas).then((bmp) => {
      const tex = r.texture(bmp);
      textTexCache.set(key, tex);
      textTexPending.delete(key);
    }).catch(() => {
      textTexPending.delete(key);
    });
  } catch {
    textTexPending.delete(key);
  }

  return null;
}

export class WorldRenderer {
  public static draw(game: Game) {
    const r = game.r;
    r.resize();
    r.begin();
    if (!game.map) {
      r.end();
      return;
    }
    const cx = Math.round(game.cam.x), cy = Math.round(game.cam.y);
    WorldRenderer.drawBacks(game, false, cx, cy);

    const mt = game.assets.get(game.map.render);
    if (mt) r.draw(mt, -game.map.renderOrigin.x - cx, -game.map.renderOrigin.y - cy);

    // Background Animated Objects (waterfalls, Free Market portal, crystals, nature)
    WorldRenderer.drawAniObjs(game, false, cx, cy);

    // Portals
    const pf: Sprite[] = game.fxData?.portal;
    if (pf?.length && game.portals.length) {
      const ready = pf.filter((f) => f.w > 2 && f.h > 2);
      let fr: Sprite | null = null;
      let tex: Tex | null = null;
      if (ready.length) {
        const total = ready.reduce((n, f) => n + (f.delay ?? 100), 0) || 700;
        let t = (game.time * 1000) % total;
        fr = ready[ready.length - 1];
        for (const f of ready) {
          const d = f.delay ?? 100;
          if (t < d) { fr = f; break; }
          t -= d;
        }
        tex = game.assets.get(fr.url);
        if (tex) {
          game.lastPortalTex = tex;
          game.lastPortalFr = fr;
        }
      }
      if (!tex && game.lastPortalTex && game.lastPortalFr) {
        tex = game.lastPortalTex;
        fr = game.lastPortalFr;
      }
      if (tex && fr) {
        for (const pt of game.portals) {
          if (pt.custom) continue;
          r.draw(tex, Math.round(pt.x - fr.ox - cx), Math.round(pt.y - fr.oy - cy), fr.w, fr.h);
        }
      }
    }

    // Mobs
    for (const m of game.mobs) WorldRenderer.drawMob(game, m, cx, cy);

    // Drops
    for (const d of game.drops) {
      if (d.item || d.mat || d.gear) {
        const iconUrl = itemIconRaw(d.item ?? d.mat ?? d.gear!.id);
        const t = game.assets.get(iconUrl);
        if (!t) {
          game.assets.load(iconUrl);
          continue;
        }
        if (d.gear && d.gear.rarity > 0) {
          const c = [[1, 1, 1], [0.4, 0.85, 1], [0.78, 0.49, 1], [1, 0.8, 0.2], [0.36, 1, 0.48]][d.gear.rarity];
          const pulse = 0.35 + 0.25 * Math.sin(game.time * 6);
          r.rect(Math.round(d.x - 12 - cx), Math.round(d.y - 4 - cy), 24, 4, [c[0], c[1], c[2], pulse]);
        }
        r.draw(
          t,
          Math.round(d.x - t.w / 2 - cx),
          Math.round(d.y - t.h - cy - (d.fh ? Math.abs(Math.sin(d.t * 3)) * 3 : 0)),
          t.w,
          t.h,
          { alpha: d.picked ? Math.max(0, 1 - d.picked / 0.45) : 1 }
        );
        continue;
      }
      const fr: Sprite = game.fxData.meso[Math.floor(d.t * 8) % game.fxData.meso.length];
      const t = fr && game.assets.get(fr.url);
      if (t) {
        r.draw(
          t,
          d.x - fr.ox - cx,
          d.y - fr.oy - cy - (d.fh ? Math.abs(Math.sin(d.t * 3)) * 3 : 0),
          fr.w,
          fr.h,
          { alpha: d.picked ? Math.max(0, 1 - d.picked / 0.45) : 1 }
        );
      }
    }

    // Remote Players
    for (const rp of game.remotePlayers.values()) {
      WorldRenderer.drawRemotePlayer(game, rp, cx, cy);
    }

    // Active Pets
    WorldRenderer.drawPets(game, cx, cy);

    // Main Player
    WorldRenderer.drawPlayer(game, cx, cy);

    // Visual FX
    for (const f of game.fx) WorldRenderer.drawFx(game, f, cx, cy);

    // Projectiles
    for (const pr of game.projectiles) {
      if (pr.t < 0) continue;
      let fr: Sprite | null = null;
      if (pr.skillId) {
        const art = game.skillArt[pr.skillId];
        if (art?.ball?.length) {
          fr = art.ball[Math.floor(pr.t * 12) % art.ball.length];
        } else if (game.throwingStarFrames.length > 0 && (pr.skillId.startsWith("4") || game.stats.classId === "thief")) {
          fr = game.throwingStarFrames[Math.floor(game.time * 24) % game.throwingStarFrames.length];
        } else if (art?.effect?.length) {
          fr = art.effect[0];
        }
      }
      if (!fr && game.throwingStarFrames.length > 0 && (game.stats.classId === "thief" || game.p.skill?.startsWith("4"))) {
        fr = game.throwingStarFrames[Math.floor(game.time * 24) % game.throwingStarFrames.length];
      }
      if (!fr) fr = game.snailShell;
      if (!fr) continue;
      const st = game.assets.get(fr.url);
      if (st) {
        const ox = fr.ox ?? Math.round(fr.w / 2);
        const oy = fr.oy ?? Math.round(fr.h / 2);
        const art = pr.skillId ? game.skillArt[pr.skillId] : null;
        const isStar = game.throwingStarFrames.includes(fr);
        const movingRight = pr.target ? pr.target.x >= pr.x : game.p.face === 1;
        const flip = (art?.ball && art.ball.length > 1)
          ? (Math.floor(pr.t * 12) % 2 === 0)
          : (isStar ? (Math.floor(game.time * 20) % 2 === 0) : movingRight);
        r.draw(st, Math.round(pr.x - ox - cx), Math.round(pr.y - oy - cy), fr.w, fr.h, { flip, alpha: 1.0 });
      } else {
        game.assets.load(fr.url);
      }
    }

    // Mob HP Bars & Damage Text
    for (const m of game.mobs) WorldRenderer.drawMobHp(game, m, cx, cy);
    for (const d of game.dmg) WorldRenderer.drawDamage(game, d, cx, cy);

    // Foreground Animated Objects (layer >= 7)
    WorldRenderer.drawAniObjs(game, true, cx, cy);

    // Foregrounds & screen fades
    WorldRenderer.drawBacks(game, true, cx, cy);
    if (game.fade > 0) r.rect(0, 0, r.width, r.height, [0, 0, 0, game.fade]);
    if (game.loadingMap) r.rect(0, 0, r.width, r.height, [0, 0, 0, 1]);
    r.end();
  }

  public static drawAniObjs(game: Game, front: boolean, cx: number, cy: number) {
    if (!game.map?.aniObjs?.length) return;
    const r = game.r;
    for (const obj of game.map.aniObjs) {
      const isFront = obj.layer >= 7;
      if (isFront !== front) continue;
      if (!obj.frames || obj.frames.length === 0) continue;
      const total = obj.frames.reduce((sum, f) => sum + (f.delay ?? 100), 0) || 100;
      let tRem = (game.time * 1000) % total;
      let fr = obj.frames[obj.frames.length - 1];
      for (const f of obj.frames) {
        const d = f.delay ?? 100;
        if (tRem < d) {
          fr = f;
          break;
        }
        tRem -= d;
      }
      if (!fr || fr.w <= 1 || fr.h <= 1) continue; // Skip blank strobe frames
      const tex = game.assets.get(fr.url);
      if (!tex) {
        game.assets.load(fr.url);
        continue;
      }
      const drawX = obj.f ? obj.x - (fr.w - fr.ox) - cx : obj.x - fr.ox - cx;
      const drawY = obj.y - fr.oy - cy;
      r.draw(tex, Math.round(drawX), Math.round(drawY), fr.w, fr.h, { flip: obj.f });
    }
  }

  public static drawBacks(game: Game, front: boolean, cx: number, cy: number) {
    const r = game.r, W = r.width, H = r.height;
    const WO = W / 2, HO = H / 2;
    const camCenterX = cx + WO;
    const camCenterY = cy + HO;
    for (const b of game.map.backs) {
      if (b.front !== front) continue;
      let s = b.sprite;
      if (b.frames && b.frames.length > 0) {
        const total = b.frames.reduce((n, f) => n + (f.delay ?? 100), 0) || 100;
        let tRem = (game.time * 1000) % total;
        s = b.frames[b.frames.length - 1];
        for (const fr of b.frames) {
          const d = fr.delay ?? 100;
          if (tRem < d) {
            s = fr;
            break;
          }
          tRem -= d;
        }
      }
      const t = game.assets.get(s.url);
      if (!t) {
        game.assets.load(s.url);
        continue;
      }
      const cxx = b.cx || s.w, cyy = b.cy || s.h;
      const hmove = b.type === 4 || b.type === 6, vmove = b.type === 5 || b.type === 7;
      const htile = [1, 3, 4, 6, 7].includes(b.type), vtile = [2, 3, 5, 6, 7].includes(b.type);
      const ox = b.flip ? s.w - s.ox : s.ox;
      const baseX = (hmove ? b.x + game.time * b.rx * 5 - cx : b.x + WO + (b.rx * cx) / 100) - ox;
      const baseY = (vmove ? b.y + game.time * b.ry * 5 - cy : b.y + Math.min(HO, 300) + (b.ry * (camCenterY - 300)) / 100) - s.oy;

      const minI = htile ? Math.floor(-baseX / cxx) : 0;
      const maxI = htile ? Math.ceil((W - baseX) / cxx) : 0;
      const allowVTile = vtile || (b.type === 1 && s.h >= 600);
      const minJ = allowVTile ? Math.floor(-baseY / cyy) : 0;
      const maxJ = allowVTile ? Math.ceil((H - baseY) / cyy) : 0;

      for (let i = minI; i <= maxI; i++) {
        for (let j = minJ; j <= maxJ; j++) {
          r.draw(t, Math.round(baseX + i * cxx), Math.round(baseY + j * cyy), s.w, s.h, { flip: b.flip, alpha: b.a / 255 });
        }
      }
    }
  }

  public static drawNameTag(r: Renderer, name: string, x: number, y: number, cx: number, cy: number) {
    const tex = renderTextTexture(r, name, "name");
    if (tex) {
      r.draw(tex, Math.round(x - tex.w / 2 - cx), Math.round(y + 2 - cy), tex.w, tex.h);
    }
  }

  public static drawSpeechBalloon(r: Renderer, text: string, x: number, y: number, cx: number, cy: number) {
    const tex = renderTextTexture(r, text, "balloon");
    if (tex) {
      r.draw(tex, Math.round(x - tex.w / 2 - cx), Math.round(y - 75 - tex.h - cy), tex.w, tex.h);
    }
  }

  public static drawItemEffect(
    game: Game,
    eff: ItemEffData,
    x: number,
    y: number,
    face: number,
    anim: string,
    cx: number,
    cy: number,
    layer: "back" | "front"
  ) {
    let actionFrames: ItemEffFrame[] | undefined;
    if (anim === "ladder" || anim === "rope") {
      actionFrames = layer === "back"
        ? eff.actions[anim] ?? eff.actions.backDefault ?? eff.actions.default
        : eff.actions[anim + "2"];
    } else {
      const candidate = eff.actions[anim] ?? eff.actions.default;
      if (candidate?.length) {
        const isBack = (candidate[0]?.z ?? 0) < 0;
        if ((layer === "back" && isBack) || (layer === "front" && !isBack)) {
          actionFrames = candidate;
        }
      }
    }
    if (!actionFrames?.length) return;
    const totalDelay = actionFrames.reduce((acc, f) => acc + (f.delay ?? 100), 0) || 800;
    let t = (game.time * 1000) % totalDelay;
    let fr = actionFrames[0];
    for (const f of actionFrames) {
      const d = f.delay ?? 100;
      if (t < d) { fr = f; break; }
      t -= d;
    }
    const tex = game.assets.get(fr.url);
    if (!tex) {
      game.assets.load(fr.url);
      return;
    }
    const isFixed = Boolean(fr.fixed ?? eff.fixed);
    const flip = isFixed ? false : face === 1;
    const drawX = flip ? Math.round(x - (fr.w - fr.ox) - cx) : Math.round(x - fr.ox - cx);
    const anchorY = fr.pos === 1 ? y - 48 : fr.pos === 2 ? y - 25 : fr.pos === 3 ? y - 65 : y;
    const drawY = Math.round(anchorY - fr.oy - cy);
    game.r.draw(tex, drawX, drawY, fr.w, fr.h, { flip });
  }

  public static drawRemotePlayer(game: Game, rp: RemotePlayer, cx: number, cy: number) {
    const isFloating = game.hasHoverEffect(rp.look) && rp.anim !== "jump" && rp.anim !== "ladder" && rp.anim !== "rope";
    const hoverY = isFloating ? Math.round(Math.sin(game.time * 3.2) * 5 - 10) : 0;
    if (hoverY !== 0) {
      const shadowW = Math.max(12, 28 + Math.round(hoverY * 0.4));
      const shadowAlpha = Math.max(0.15, 0.35 + (hoverY / 30));
      game.r.rect(Math.round(rp.x - shadowW / 2 - cx), Math.round(rp.y - 2 - cy), shadowW, 4, [0, 0, 0, shadowAlpha * 0.6]);
      game.r.rect(Math.round(rp.x - (shadowW - 8) / 2 - cx), Math.round(rp.y - 1 - cy), Math.max(4, shadowW - 8), 2, [0, 0, 0, shadowAlpha]);
    }

    const drawPosY = rp.y + hoverY;

    const remoteEffs: ItemEffData[] = [];
    for (const id of rp.look) {
      if (!game.itemEffCache.has(id)) {
        game.itemEffCache.set(id, null);
        fetch(`/wz/data/item-eff/${id}`).then((r) => r.ok ? r.json() : null).then((data) => {
          if (data) {
            game.itemEffCache.set(id, data);
            for (const act of Object.values(data.actions as Record<string, ItemEffFrame[]>)) {
              for (const fr of act) game.assets.load(fr.url);
            }
          }
        }).catch(() => {});
      }
      const cached = game.itemEffCache.get(id);
      if (cached && !remoteEffs.some((e) => e.id === cached.id)) remoteEffs.push(cached);
    }
    for (const eff of remoteEffs) {
      WorldRenderer.drawItemEffect(game, eff, rp.x, drawPosY, rp.face, rp.anim, cx, cy, "back");
    }
    let t = game.assets.get(charUrlFor(rp.look, rp.anim, rp.frame))
      ?? game.assets.get(charUrlFor(rp.look, "stand1", 0));
    if (t) {
      rp.lastTex = t;
    } else if (rp.lastTex) {
      t = rp.lastTex;
    }
    if (t) {
      const ox = Math.round(t.w / 2);
      const oy = t.w === 96 && t.h === 96 ? 88 : t.h === 384 ? 256 : Math.round(t.h * (256 / 384));
      game.r.draw(t, Math.round(rp.x - ox - cx), Math.round(drawPosY - oy - cy), t.w, t.h, { flip: rp.face === 1 });
    }
    for (const eff of remoteEffs) {
      WorldRenderer.drawItemEffect(game, eff, rp.x, drawPosY, rp.face, rp.anim, cx, cy, "front");
    }
    WorldRenderer.drawNameTag(game.r, rp.name, rp.x, drawPosY, cx, cy);
    if (rp.balloon && rp.balloon.t > 0 && rp.balloon.text) {
      WorldRenderer.drawSpeechBalloon(game.r, rp.balloon.text, rp.x, drawPosY, cx, cy);
    }
  }

  public static drawPlayer(game: Game, cx: number, cy: number) {
    const p = game.p;
    const isFloating = game.hasHoverEffect() && !!p.fh && !p.ladder;
    const hoverY = isFloating ? Math.round(Math.sin(game.time * 3.2) * 5 - 10) : 0;
    if (hoverY !== 0) {
      const shadowW = Math.max(12, 28 + Math.round(hoverY * 0.4));
      const shadowAlpha = Math.max(0.15, 0.35 + (hoverY / 30));
      game.r.rect(Math.round(p.x - shadowW / 2 - cx), Math.round(p.y - 2 - cy), shadowW, 4, [0, 0, 0, shadowAlpha * 0.6]);
      game.r.rect(Math.round(p.x - (shadowW - 8) / 2 - cx), Math.round(p.y - 1 - cy), Math.max(4, shadowW - 8), 2, [0, 0, 0, shadowAlpha]);
    }

    const drawPosY = p.y + hoverY;

    // 1. Back item effects
    for (const eff of game.activeItemEffs) {
      WorldRenderer.drawItemEffect(game, eff, p.x, drawPosY, p.face, p.anim, cx, cy, "back");
    }

    // 2. Character sprite
    const currentUrl = charUrlFor(game.look, p.anim, p.frame, p.expr, p.exprFrame);
    let t = game.assets.get(currentUrl)
      ?? game.assets.get(charUrlFor(game.look, p.anim, p.frame))
      ?? game.assets.get(charUrlFor(game.look, "stand1", 0))
      ?? (game.prevLook.length ? game.assets.get(charUrlFor(game.prevLook, p.anim, p.frame)) : null);
    if (!game.assets.get(currentUrl)) {
      game.assets.load(currentUrl);
    }
    if (t) {
      game.lastPlayerTex = t;
    } else if (game.lastPlayerTex) {
      t = game.lastPlayerTex;
    }
    if (t) {
      const invulnBlink = p.invuln > 0 && Math.floor(game.time * 16) % 2 === 0;
      const isDarkSight = !!game.buffs["4001003"];
      const baseAlpha = invulnBlink ? 0.35 : (isDarkSight || game.gmHide ? 0.45 : 1);

      const ox = Math.round(t.w / 2);
      const oy = t.w === 96 && t.h === 96 ? 88 : t.h === 384 ? 256 : Math.round(t.h * (256 / 384));

      // Shadow Partner clone
      if (game.buffs["4111002"]) {
        const shadowAnim = p.anim;
        const shadowFrame = p.frame;
        const shadowFace = p.face;
        const shadowOffset = shadowFace === 1 ? -18 : 18;
        const shadowDrawX = p.x + shadowOffset;
        const shadowDrawY = drawPosY;

        const actionFrames = game.shadowPartnerArt[shadowAnim] ?? game.shadowPartnerArt.stand1;
        const fr = actionFrames?.[shadowFrame % (actionFrames?.length || 1)];
        let drawn = false;

        if (fr) {
          const st = game.assets.get(fr.url);
          if (st) {
            const shOx = shadowFace === 1 ? (st.w - fr.ox) : fr.ox;
            const shOy = fr.oy;
            game.r.draw(st, Math.round(shadowDrawX - shOx - cx), Math.round(shadowDrawY - shOy - cy), st.w, st.h, {
              flip: shadowFace === 1,
              alpha: baseAlpha,
            });
            drawn = true;
          } else {
            game.assets.load(fr.url);
          }
        }
        if (!drawn) {
          let shadowTex = game.assets.get(charUrlFor(game.look, shadowAnim, shadowFrame, p.expr, p.exprFrame))
            ?? game.assets.get(charUrlFor(game.look, shadowAnim, shadowFrame))
            ?? t;
          game.r.draw(shadowTex, Math.round(shadowDrawX - ox - cx), Math.round(shadowDrawY - oy - cy), shadowTex.w, shadowTex.h, {
            flip: shadowFace === 1,
            alpha: baseAlpha,
          });
        }
      }

      game.r.draw(t, Math.round(p.x - ox - cx), Math.round(drawPosY - oy - cy), t.w, t.h, {
        flip: p.face === 1,
        alpha: baseAlpha,
      });
    }

    // 3. Front item effects
    for (const eff of game.activeItemEffs) {
      WorldRenderer.drawItemEffect(game, eff, p.x, drawPosY, p.face, p.anim, cx, cy, "front");
    }

    WorldRenderer.drawNameTag(game.r, game.stats.name, p.x, drawPosY, cx, cy);

    if (game.balloon && game.balloon.t > 0 && game.balloon.text) {
      WorldRenderer.drawSpeechBalloon(game.r, game.balloon.text, p.x, drawPosY, cx, cy);
    }
  }

  public static drawMob(game: Game, m: Mob, cx: number, cy: number) {
    if (!m || !m.data || !m.data.books || m.state === "dead") return;
    const book = m.attacking ?? (m.state === "move" ? (m.data.books.move ? "move" : "stand") : m.state);
    const bookFrames = m.data.books[book] ?? m.data.books.stand;
    if (!bookFrames?.length) return;
    const safeFrame = Math.max(0, Math.min(bookFrames.length - 1, m.frame));
    const fr = bookFrames[safeFrame] ?? bookFrames[0];
    if (!fr) return;
    let t = game.assets.get(fr.url);
    let useFr = fr;
    if (!t) {
      const altFr = bookFrames.find((f) => game.assets.get(f.url))
        ?? m.data.books.stand?.find((f) => game.assets.get(f.url));
      if (altFr) {
        t = game.assets.get(altFr.url);
        useFr = altFr;
      } else if (m.lastTex && m.lastFr) {
        t = m.lastTex;
        useFr = m.lastFr;
      }
    }
    if (!t) return;
    m.lastTex = t;
    m.lastFr = useFr;
    const flip = m.dir === 1;
    const left = flip ? m.x - (useFr.w - useFr.ox) : m.x - useFr.ox;
    game.r.draw(t, Math.round(left - cx), Math.round(m.y - useFr.oy - cy), useFr.w, useFr.h, { flip, alpha: m.alpha });
  }

  public static drawLadders(_game: Game, _cx: number, _cy: number) {
    // Official MapleStory maps already render the authentic ladders & ropes in the stitched background.
    // Procedural duplicate drawing is disabled.
  }

  public static drawMobHp(game: Game, m: Mob, cx: number, cy: number) {
    if (!m || !m.data || m.hpShow <= 0 || m.state === "dead" || m.state === "die1") return;
    const b = game.mobBox(m);
    const w = 50, x = Math.round(m.x - w / 2 - cx), y = Math.round(b.y0 - 14 - cy);
    game.r.rect(x - 1, y - 1, w + 2, 7, [0.1, 0.1, 0.1, 0.85]);
    game.r.rect(x, y, w, 5, [0.35, 0.05, 0.05, 1]);
    game.r.rect(x, y, Math.max(0, (m.hp / m.maxHp) * w), 5, [0.95, 0.2, 0.25, 1]);
  }

  public static drawFx(game: Game, f: Fx, cx: number, cy: number) {
    let t = f.t, i = 0;
    while (i < f.frames.length && t > (f.frames[i].delay ?? 100)) { t -= f.frames[i].delay ?? 100; i++; }
    let fr = f.frames[i];
    if (!fr) return;
    let tex = game.assets.get(fr.url);
    if (!tex) {
      game.assets.load(fr.url);
      // Fallback to last loaded frame or nearest frame so level up / FX never blinks or glitches!
      if (f.lastTex && f.lastFr) {
        tex = f.lastTex;
        fr = f.lastFr;
      } else {
        for (let pIdx = i - 1; pIdx >= 0; pIdx--) {
          const pt = game.assets.get(f.frames[pIdx]?.url);
          if (pt) { tex = pt; fr = f.frames[pIdx]; break; }
        }
      }
    }
    if (!tex) return;
    f.lastTex = tex;
    f.lastFr = fr;
    const x = f.follow ? game.p.x : f.x, y = f.follow ? game.p.y : f.y;
    const left = f.flip ? x - (fr.w - fr.ox) : x - fr.ox;
    game.r.draw(tex, Math.round(left - cx), Math.round(y - fr.oy - cy), fr.w, fr.h, { flip: f.flip });
  }

  public static drawPets(game: Game, cx: number, cy: number) {
    if (!game.pets?.length) return;
    const r = game.r;
    for (const pet of game.pets) {
      const data = PetSystem.getPetData(pet.id);
      const actionFrames = data?.actions[pet.state] ?? data?.actions.stand0 ?? (data ? Object.values(data.actions)[0] : undefined);
      if (!actionFrames?.length) {
        PetSystem.loadPetData(pet.id);
        continue;
      }
      const fr = actionFrames[pet.frame % actionFrames.length];
      if (!fr) continue;
      let tex = game.assets.get(fr.url);
      if (!tex) {
        game.assets.load(fr.url);
        if (pet.lastTex) tex = pet.lastTex;
      }
      if (tex) {
        pet.lastTex = tex;
        pet.lastFr = fr;
        const flip = pet.dir === 1;
        const left = flip ? pet.x - (fr.w - fr.ox) : pet.x - fr.ox;
        const top = pet.y - fr.oy;
        r.draw(tex, Math.round(left - cx), Math.round(top - cy), fr.w, fr.h, { flip });
        WorldRenderer.drawNameTag(r, pet.name, Math.round(pet.x), Math.round(pet.y + 2), cx, cy);
      }
    }
  }

  public static drawDamage(game: Game, d: DmgText, cx: number, cy: number) {
    const fx = game.fxData;
    const rise = Math.min(1, d.t / 1.0) * 40;
    const alpha = d.t > 0.9 ? Math.max(0, 1 - (d.t - 0.9) / 0.6) : 1;
    if (d.miss) {
      const s: Sprite = fx.miss, t = s && game.assets.get(s.url);
      if (t) game.r.draw(t, Math.round(d.x - s.w / 2 - cx), Math.round(d.y - rise - s.h - cy), s.w, s.h, { alpha });
      return;
    }
    const str = String(d.value);
    const glyphs: Sprite[] = [...str].map((c, i) => (i === 0 ? (d.hurt ? fx.hurtFirst : fx.dmgFirst)[c] : (d.hurt ? fx.hurt : fx.dmg)[c]));
    const overlap = 6;
    const total = glyphs.reduce((a, g) => a + (g?.w ?? 20) - overlap, overlap);
    let x = d.x - total / 2;
    const base = d.y - rise;
    glyphs.forEach((g, i) => {
      if (!g) return;
      const t = game.assets.get(g.url);
      if (t) game.r.draw(t, Math.round(x - cx), Math.round(base - g.h - (i === 0 ? 4 : 0) - cy), g.w, g.h, { alpha });
      x += g.w - overlap;
    });
  }
}
