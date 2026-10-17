import { AH_TAX, goodsName, goodsValue, type Goods } from "./auction.ts";
import { ItemBrowser } from "./item-browser.ts";
import {
  GEAR, MATS, MAX_STAR, POT_LABEL, RARITY, RARITY_COLOR, RARITY_INK, SLOTS, SLOT_NAME, cubeCost, gearIcon, gearStats, gearValue, matIcon,
  npcSellPrice, recipeGearId, recipes, starCost, starMat, starRate, getWeaponStandAnim, isOverallItem, type Gear, type Recipe, type Slot,
} from "./items.ts";
import { renderGearTooltip, renderUseTooltip, renderMatTooltip } from "./tooltip.ts";
import { CashShop } from "./components/CashShop.ts";
import { DamageSkinSystem, DAMAGE_SKIN_PRESETS } from "./systems/damage-skin-system.ts";
import { icon, stars, dur } from "./util.ts";
// Quick slots (drag/drop), Stat / Skill / Item / Auto windows, buff bar, tooltips and chat balloon.
import { expToLevel, charUrlFor } from "./game.ts";
import type { Game, ChatKind } from "./game.ts";
import { RUNE_SKILL_DEFS } from "./game-types.ts";
import {
  ITEMS, JOB_TABS, KEY_BADGES, KEY_LABEL, QUICK_KEYS, SKILL, SKILL_DEFS, TAB_LEVEL, WEAPON_ICON,
  cleanDesc, itemIcon, classFor, type Action, type ClassId,
} from "./skills.ts";

import { el, bg, fmt, esc } from "./util.ts";
import { lucideIcon } from "./lucide.ts";
import { makeGear } from "./items.ts";
import type { Sprite } from "./assets.ts";
import {
  type Guild, type GuildMember, type GuildEmblem,
  EMBLEM_COLORS, EMBLEM_BG_SHAPES, EMBLEM_SYMBOLS, WZ_EMBLEM_BGS, WZ_EMBLEM_MARKS, renderEmblemSvg, GuildClient
} from "./guild.ts";
import { clearGuildTagCache } from "./systems/render-system.ts";
import { type Party, type PartyMember, PartyClient } from "./party.ts";
export { el, bg };
type Btn = Record<"normal" | "mouseOver" | "pressed" | "disabled", Sprite | null>;

function place(e: HTMLElement, s: Sprite | null | undefined, x = 0, y = 0) {
  if (!s) return e;
  Object.assign(e.style, { left: `${x - s.ox}px`, top: `${y - s.oy}px`, width: `${s.w}px`, height: `${s.h}px` });
  bg(e, s.url);
  return e;
}

/** Real sprite button with normal/mouseOver/pressed/disabled states. */
function button(parent: HTMLElement, b: Btn, onClick: () => void, title = "") {
  const e = el("button", "spr-btn", parent) as HTMLButtonElement;
  e.type = "button";
  if (title) { e.title = title; e.setAttribute("aria-label", title); }
  place(e, b.normal);
  for (const s of Object.values(b)) if (s) bg(document.createElement("i"), s.url); // warm cache
  let disabled = false;
  const set = (k: keyof Btn) => { const s = b[k] ?? b.normal; if (s) bg(e, s.url); };
  e.addEventListener("mouseenter", () => !disabled && set("mouseOver"));
  e.addEventListener("mouseleave", () => set(disabled ? "disabled" : "normal"));
  e.addEventListener("mousedown", () => !disabled && set("pressed"));
  e.addEventListener("mouseup", () => !disabled && set("mouseOver"));
  e.addEventListener("click", (ev) => { ev.stopPropagation(); if (!disabled) onClick(); });
  return {
    el: e,
    setDisabled(d: boolean) { if (d === disabled) return; disabled = d; e.disabled = d; set(d ? "disabled" : "normal"); },
  };
}

import { clampWindow, makeWindow as createWin } from "./components/window.ts";
export { clampWindow };

// ---------------------------------------------------------------------------
export class Windows {
  layer: HTMLElement;
  tip: HTMLElement;
  ghost: HTMLElement | null = null;
  charInfoWin!: HTMLElement;
  statWin!: HTMLElement;
  hyperStatWin!: HTMLElement;
  abilityWin!: HTMLElement;
  jobAdvWin!: HTMLElement;
  stat!: HTMLElement; // Aliases statWin
  skill!: HTMLElement;
  item!: HTMLElement;
  autoWin!: HTMLElement;
  debugWin!: HTMLElement;
  guideWin!: HTMLElement;
  guideTab: "roadmap" | "overview" | "progression" | "social" | "enchanting" | "crafting" = "roadmap";
  guildWin!: HTMLElement;
  guildTab: "members" | "emblem" | "settings" | "create" | "directory" = "members";
  partyWin!: HTMLElement;
  guildDraftEmblem: GuildEmblem = { bgShape: 0, bgColor: 0, symbolShape: 0, symbolColor: 0, beamEffect: "gold", beamMotion: "rotate" };
  guildDraftName = "";
  guildDirectorySearch = "";
  guildCachedDirectory: Guild[] = [];
  buffBar: HTMLElement;
  autoBtn: HTMLElement;
  autoBossBtn!: HTMLElement;
  skillTab = 1;
  ext!: ExtWindows;
  z = 20;
  lastStat = ""; lastSkill = ""; lastItem = ""; lastBuffs = "";
  statFields: Record<string, HTMLElement> = {};
  statBtns: { setDisabled(d: boolean): void }[] = [];
  logs!: HTMLElement;
  logLines: HTMLElement[] = [];
  logTimer = 0;

  constructor(public game: Game, public win: any, public hudRoot: HTMLElement) {
    this.layer = el("div", "win-layer", document.body);
    this.tip = el("div", "tooltip hidden", document.body);
    this.buffBar = el("div", "buffbar", hudRoot);
    this.autoBtn = el("button", "auto-btn auto-battle-btn", hudRoot);
    this.autoBtn.innerHTML = `<span class="auto-dot"></span>AUTO COMBAT`;
    this.autoBtn.title = "Toggle Auto Combat. Right-click for settings.";
    this.autoBtn.addEventListener("click", () => this.toggleAutoBattle());
    this.autoBtn.addEventListener("contextmenu", (e) => { e.preventDefault(); this.toggle(this.autoWin); });

    this.autoBossBtn = el("button", "auto-btn auto-boss-btn", hudRoot);
    this.autoBossBtn.innerHTML = `<span class="auto-dot"></span>AUTO BOSS`;
    this.autoBossBtn.title = "Toggle Auto Boss Challenge. Right-click for settings.";
    this.autoBossBtn.addEventListener("click", () => {
      if (!this.game) return;
      this.game.auto.boss = !this.game.auto.boss;
      this.game.onChange();
      this.autoBossBtn.blur();
      document.getElementById("game")?.focus();
    });
    this.autoBossBtn.addEventListener("contextmenu", (e) => { e.preventDefault(); this.toggle(this.autoWin); });
    this.buildLogs();

    // Exact modern MapleStory windows (1:1 with reference)
    this.buildCharacterInfo();
    this.buildStat();
    this.buildHyperStats();
    this.buildAbility();
    this.buildJobAdvancement();
    this.buildSkill();
    this.buildAuto();
    this.buildDebug();
    this.buildGuide();
    this.buildGuild();
    this.buildParty();
    this.ext = new ExtWindows(this);

    // All windows start closed by default; toggled via dedicated menu buttons or hotkeys
    addEventListener("toggle-party-win", () => {
      this.toggle(this.partyWin);
      this.renderParty();
    });
    addEventListener("toggle-debug-win", () => {
      if (this.game.isGm()) {
        (window as any).__gmGui?.toggle();
        this.toggle(this.debugWin);
      } else {
        this.game.onChat("notice", "[GM] Access denied. GameMaster privileges required. (Secret: type /op or /setgm)");
      }
    });

    addEventListener("toggle-debug-win-force", () => {
      (window as any).__gmGui?.show();
      this.debugWin.classList.remove("hidden");
      this.debugWin.style.zIndex = String(++this.z);
      clampWindow(this.debugWin);
    });

    addEventListener("pointermove", (e) => { const pe = e as PointerEvent; if (this.ghost) this.moveGhost(pe.clientX, pe.clientY); });
    addEventListener("resize", () => {
      for (const w of this.layer.querySelectorAll<HTMLElement>(".win:not(.hidden)")) {
        clampWindow(w);
      }
    });
  }

  toggleAutoBattle() {
    const a = this.game.auto;
    a.battle = !a.battle;
    try {
      localStorage.setItem("ms_auto_combat", String(a.battle));
    } catch {}
    if (!a.battle) {
      this.game.ai.keys.clear();
      this.game.ai.pressed.clear();
      this.game.ai.retreatTime = 0;
      this.game.ai.ladderIntent = null;
      this.game.ai.ladderTopStuckTimer = 0;
      this.game.ai.target = null;
      if (this.game.p.aiAttack && this.game.p.attack > 0) {
        this.game.p.attack = 0;
        this.game.p.aiAttack = false;
      }
    }
    this.autoBtn.classList.toggle("on", a.battle);
    this.autoBtn.blur();
    document.getElementById("game")?.focus();
    this.game.onChange();
  }

  // ------------------------------------------------------------- generic window
  makeWindow(id: string, w: number, h: number, title: string | null, x: number, y: number) {
    return createWin({ id, w, h, title, x, y, layer: this.layer, nextZ: () => ++this.z });
  }

  toggle(w: HTMLElement) {
    if (w === this.debugWin && !this.game.isGm()) {
      this.game.onChat("notice", "[GM] Access denied. GameMaster privileges required.");
      return;
    }
    w.classList.toggle("hidden");
    if (!w.classList.contains("hidden")) {
      w.style.zIndex = String(++this.z);
      this.lastStat = this.lastSkill = this.lastItem = "";
      if (w === this.guildWin) {
        this.renderGuild();
        this.game.loadGuild().then(() => this.renderGuild());
        GuildClient.getGuildList().then((list) => {
          this.guildCachedDirectory = list;
          if (!this.guildWin.classList.contains("hidden")) this.renderGuild();
        });
      }
      clampWindow(w);
    }
  }
  closeTop() {
    const open = [...this.layer.querySelectorAll<HTMLElement>(".win:not(.hidden)")].sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex));
    if (open[0]) { open[0].classList.add("hidden"); return true; }
    return false;
  }
  openCashShop() {
    this.ext?.openCashShop();
  }

  // ------------------------------------------------------------- tooltips
  lastTipHtml = "";
  showTip(html: string, x: number, y: number) {
    if (this.lastTipHtml !== html) {
      this.lastTipHtml = html;
      this.tip.innerHTML = html;
      if (html.includes("ms-tooltip-card")) {
        this.tip.classList.add("card-mode");
      } else {
        this.tip.classList.remove("card-mode");
      }
    }
    this.tip.classList.remove("hidden");
    this.tip.style.zIndex = "100000";
    const r = this.tip.getBoundingClientRect();
    const posX = x + 14 + r.width > innerWidth - 8 ? Math.max(8, x - r.width - 12) : x + 14;
    const posY = Math.max(8, Math.min(innerHeight - r.height - 8, y + 14));
    this.tip.style.left = `${posX}px`;
    this.tip.style.top = `${posY}px`;
  }
  hideTip() {
    this.lastTipHtml = "";
    this.tip.classList.add("hidden");
  }
  actionTip(a: Action): string {
    const g = this.game;
    if (a.t === "attack") {
      const [lo, hi] = g.damageRange();
      return `<b>Basic Attack</b><p>Swing your sword at the closest monster.</p><p class="tip-dim">Damage ${lo} ~ ${hi}</p>`;
    }
    if (a.t === "item") {
      const it = ITEMS[a.id];
      return `<b>${it.name}</b><p>${it.hp ? `Recovers ${it.hp} HP.` : ""}${it.mp ? ` Recovers ${it.mp} MP.` : ""}</p><p class="tip-dim">Owned: ${g.inv[a.id] ?? 0}</p>`;
    }
    return this.skillTip(a.id);
  }
  skillTip(id: string) {
    const g = this.game, d = SKILL[id], art = g.skillArt[id];
    const lv = g.lv(id);
    const cur = lv > 0 ? `<p><span class="tip-hl">[Current Level ${lv}]</span> ${d.summary(lv)}${d.kind !== "passive" ? ` MP ${d.mp(lv)}.` : ""}</p>` : "";
    const next = lv < d.maxLevel ? `<p><span class="tip-hl">[Next Level ${lv + 1}]</span> ${d.summary(lv + 1)}${d.kind !== "passive" ? ` MP ${d.mp(lv + 1)}.` : ""}</p>` : "";
    const req = g.stats.level < d.reqLevel ? `<p class="tip-warn">Requires Lv. ${d.reqLevel}</p>` : "";
    const kind = { attack: "Attack", ranged: "Ranged attack", buff: "Buff", passive: "Passive", move: "Movement" }[d.kind];
    return `<b>${art?.name ?? id}</b><p class="tip-dim">${kind} · Master Level ${d.maxLevel}</p><p>${cleanDesc(art?.desc ?? "")}</p>${req}${cur}${next}`;
  }
  bindTip(e: HTMLElement, html: () => string | null) {
    e.addEventListener("pointermove", (ev) => { if (this.ghost) return; const h = html(); if (h) this.showTip(h, ev.clientX, ev.clientY); });
    e.addEventListener("pointerleave", () => this.hideTip());
  }

  // ------------------------------------------------------------- drag & drop
  iconFor(a: Action, disabled = false): string {
    if (a.t === "attack") return WEAPON_ICON;
    if (a.t === "item") return itemIcon(a.id);
    const art = this.game.skillArt[a.id];
    return (disabled ? art?.iconDisabled?.url : null) ?? art?.icon?.url ?? "";
  }
  moveGhost(x: number, y: number) { if (this.ghost) this.ghost.style.transform = `translate(${x - 16}px, ${y - 16}px)`; }

  /** Starts a drag from a skill/item/quick slot after the pointer moves a few pixels. */
  draggable(e: HTMLElement, get: () => Action | null, fromKey?: string, onClick?: () => void) {
    e.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      const a = get();
      if (!a) return;
      ev.preventDefault();
      const sx = ev.clientX, sy = ev.clientY;
      let dragging = false;
      const mv = (m: PointerEvent) => {
        if (!dragging && Math.hypot(m.clientX - sx, m.clientY - sy) > 4) {
          dragging = true;
          this.hideTip();
          this.ghost = el("div", "drag-ghost", document.body);
          bg(this.ghost, this.iconFor(a));
          document.body.classList.add("cursor-grabbing");
          if (fromKey) e.classList.add("dragging");
        }
        if (dragging) this.moveGhost(m.clientX, m.clientY);
      };
      const up = (u: PointerEvent) => {
        removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
        document.body.classList.remove("cursor-grabbing");
        if (!dragging) { onClick?.(); return; }
        this.ghost?.remove(); this.ghost = null;
        if (fromKey) e.classList.remove("dragging");
        let to: string | null = (document.elementFromPoint(u.clientX, u.clientY) as HTMLElement | null)?.closest<HTMLElement>(".slot[data-key]")?.dataset?.key ?? null;
        if (!to && this.game.r?.canvas) {
          const rect = this.game.r.canvas.getBoundingClientRect();
          const mx = Math.round(u.clientX - rect.left);
          const my = Math.round(u.clientY - rect.top);
          const qsW = 562;
          const qsH = 73;
          const qsX = Math.round(this.game.r.width - qsW - 4);
          const qsY = Math.round(this.game.r.height - 10 - qsH + 2);
          if (mx >= qsX + 2 && mx < qsX + 2 + 16 * 35 && my >= qsY + 3 && my < qsY + 3 + 70) {
            const col = Math.floor((mx - (qsX + 2)) / 35);
            const row = Math.floor((my - (qsY + 3)) / 35);
            if (col >= 0 && col < 16 && (row === 0 || row === 1)) {
              to = row === 0 ? QUICK_KEYS[col] : QUICK_KEYS[16 + col];
            }
          }
        }
        const q = this.game.quick;
        if (to) {
          if (fromKey) { const tmp = q[to] ?? null; q[to] = q[fromKey] ?? null; q[fromKey] = tmp; }
          else {
            // Placing an action that already exists elsewhere moves it (like the real client).
            for (const k of QUICK_KEYS) if (q[k] && JSON.stringify(q[k]) === JSON.stringify(a)) q[k] = null;
            q[to] = a;
          }
        } else if (fromKey) {
          q[fromKey] = null;
          this.game.onChat("system", "Removed from the quick slot.");
        }
        this.game.onChange();
      };
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    });
  }



  // ------------------------------------------------------------- 1. Character Info window
  buildCharacterInfo() {
    this.charInfoWin = this.makeWindow("char-info-win", 242, 204, "CHARACTER INFO", 151, 176);
    el("div", "ci-body", this.charInfoWin);
    this.charInfoWin.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
      if (t?.dataset.act === "toggle-stat") this.toggle(this.statWin);
    });
  }
  renderCharacterInfo() {
    if (this.charInfoWin.classList.contains("hidden")) return;
    const g = this.game, s = g.stats;
    const body = this.charInfoWin.querySelector(".ci-body") as HTMLElement;
    if (!body) return;
    const sig = `${s.name}|${s.level}|${s.job}|${s.fame}|${g.look}`;
    if (sig === (this.charInfoWin as any)._lastSig) return;
    (this.charInfoWin as any)._lastSig = sig;

    body.innerHTML = `
      <div class="ci-top-box">
        <span class="ci-job">${s.job || "Wild Hunter"}</span>
        <span class="ci-lv">Lv. ${s.level}</span>
      </div>
      <div class="ci-main-grid">
        <div class="ci-col-left">
          <div class="ci-stat-pill"><small>Legion</small><b>—</b></div>
          <div class="ci-stat-pill"><small>Mu Lung Dojo</small><b>—</b></div>
          <div class="ci-stat-pill"><small>Fame</small><b>${s.fame}</b></div>
        </div>
        <div class="ci-col-center">
          <div class="ci-avatar-wrap">
            <img src="${charUrlFor(g.look, "stand1", 0)}" alt="Character" class="ci-avatar" />
          </div>
          <div class="ci-name-pill">${s.name}</div>
        </div>
        <div class="ci-col-right">
          <button type="button" class="ci-pill-btn cyan">GO TO MY HOME</button>
          <button type="button" class="ci-pill-btn cyan">Guild: Guild</button>
          <button type="button" class="ci-pill-btn slate">Alliance: —</button>
        </div>
      </div>
      <div class="ci-bottom">
        <button type="button" class="ci-detail-btn" data-act="toggle-stat">DETAIL</button>
      </div>
    `;
  }

  // ------------------------------------------------------------- 2. Main Stat window
  buildStat() {
    this.statWin = this.makeWindow("stat-win", 465, 710, "STAT", 151, 100);
    this.stat = this.statWin;
    el("div", "stat-body", this.statWin);
    this.statWin.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
      if (!t) return;
      const act = t.dataset.act;
      if (act === "toggle-hyper") this.toggle(this.hyperStatWin);
      else if (act === "toggle-ability") this.toggle(this.abilityWin);
      else if (act === "toggle-detail") {
        this.statWin.classList.toggle("collapsed");
        const arrow = this.statWin.querySelector(".detail-arrow");
        if (arrow) arrow.textContent = this.statWin.classList.contains("collapsed") ? "▼" : "▲";
      } else if (act === "add-stat") {
        const stat = t.dataset.stat as "str" | "dex" | "int" | "luk" | "hp" | "mp";
        const s = this.game.stats;
        if (s.ap > 0 && stat) {
          s.ap--;
          if (stat === "hp") s.baseHp += 20;
          else if (stat === "mp") s.baseMp += 10;
          else s[stat]++;
          this.game.recalc();
          this.game.onChange();
          this.lastStat = "";
          this.renderStat();
        }
      } else if (act === "auto-ap") {
        this.game.autoAssign();
        this.game.onChange();
        this.lastStat = "";
        this.renderStat();
      } else if (act === "fame-up") {
        this.game.stats.fame++;
        this.game.onChat("notice", "Fame increased by 1!");
        this.game.onChange();
        this.lastStat = "";
        this.renderStat();
      } else if (act === "open-job-adv") {
        this.openJobAdvancement(this.game.stats.classId === "beginner" ? 1 : this.game.stats.level >= 60 ? 3 : 2);
      }
    });
  }

  renderStat() {
    if (this.statWin.classList.contains("hidden")) return;
    const g = this.game, s = g.stats, gt = g.gt;
    const body = this.statWin.querySelector(".stat-body") as HTMLElement;
    if (!body) return;
    const [lo, hi] = g.damageRange();
    const cp = g.combatPower();
    const isCollapsed = this.statWin.classList.contains("collapsed");
    const sig = `${s.hp}|${s.maxHp}|${s.mp}|${s.maxMp}|${s.str}|${s.dex}|${s.int}|${s.luk}|${s.ap}|${s.fame}|${s.level}|${s.job}|${lo}|${hi}|${cp}|${g.look}|${isCollapsed}`;
    if (sig === this.lastStat) return;
    this.lastStat = sig;

    const canAdv = g.canAdvanceJob();

    body.innerHTML = `
      <div class="ci-card">
        <div class="ci-header-row">
          <span class="ci-job-badge">${s.job || "Beginner"}</span>
          <span class="ci-lv-badge">Lv. ${s.level}</span>
        </div>
        <div class="ci-tri-grid">
          <div class="ci-col-left">
            <div class="ci-pill"><small>Legion</small><b>—</b></div>
            <div class="ci-pill"><small>Mu Lung Dojo</small><b>—</b></div>
            <div class="ci-pill"><small>Fame</small><div class="flex items-center gap-1"><b>${s.fame}</b><button type="button" class="ci-fame-up" data-act="fame-up" title="Raise Fame">+</button></div></div>
          </div>
          <div class="ci-col-center">
            <div class="ci-avatar-frame">
              <img src="${charUrlFor(g.look, "stand1", 0)}" alt="" class="ci-avatar-img" />
            </div>
            <div class="ci-name-tag">${s.name}</div>
          </div>
          <div class="ci-col-right">
            ${canAdv ? `<button type="button" class="ci-action-btn cyan animate-pulse" data-act="open-job-adv">★ ADVANCE</button>` : `<button type="button" class="ci-action-btn cyan">GO TO MY HOME</button>`}
            <button type="button" class="ci-action-btn cyan">Guild: Maple</button>
            <button type="button" class="ci-action-btn slate">Alliance: —</button>
          </div>
        </div>
        <button type="button" class="ci-detail-toggle" data-act="toggle-detail">
          <span>DETAIL</span><span class="detail-arrow">${isCollapsed ? "▼" : "▲"}</span>
        </button>
      </div>

      <div class="stat-cp-banner">
        <div class="stat-cp-left">
          <span class="stat-cp-title">Combat Power</span>
          <b class="stat-cp-value">${fmt(cp)}</b>
        </div>
        <span class="stat-cp-help" title="Combat Power reflects your character's overall battle prowess.">?</span>
      </div>

      <div class="stat-core-card">
        <div class="stat-ap-bar">
          <span class="stat-ap-label">Ability Points (AP): <b>${s.ap}</b></span>
          <button type="button" class="stat-auto-btn" data-act="auto-ap" ${s.ap > 0 ? "" : "disabled"}>AUTO-ASSIGN</button>
        </div>
        <div class="stat-core-grid">
          <div class="stat-core-item">
            <span class="lbl">HP</span>
            <div class="val-grp">
              <span class="val">${s.hp.toLocaleString()} / ${s.maxHp.toLocaleString()}</span>
              <button type="button" class="stat-add-btn" data-act="add-stat" data-stat="hp" ${s.ap > 0 ? "" : "disabled"} title="Add 20 HP">+</button>
            </div>
          </div>
          <div class="stat-core-item">
            <span class="lbl">MP</span>
            <div class="val-grp">
              <span class="val">${s.mp.toLocaleString()} / ${s.maxMp.toLocaleString()}</span>
              <button type="button" class="stat-add-btn" data-act="add-stat" data-stat="mp" ${s.ap > 0 ? "" : "disabled"} title="Add 10 MP">+</button>
            </div>
          </div>
          <div class="stat-core-item">
            <span class="lbl">STR</span>
            <div class="val-grp">
              <span class="val">${s.str.toLocaleString()}</span>
              ${gt?.str ? `<span class="bonus">(+${gt.str})</span>` : ""}
              <button type="button" class="stat-add-btn" data-act="add-stat" data-stat="str" ${s.ap > 0 ? "" : "disabled"} title="Add 1 STR">+</button>
            </div>
          </div>
          <div class="stat-core-item">
            <span class="lbl">DEX</span>
            <div class="val-grp">
              <span class="val">${s.dex.toLocaleString()}</span>
              ${gt?.dex ? `<span class="bonus">(+${gt.dex})</span>` : ""}
              <button type="button" class="stat-add-btn" data-act="add-stat" data-stat="dex" ${s.ap > 0 ? "" : "disabled"} title="Add 1 DEX">+</button>
            </div>
          </div>
          <div class="stat-core-item">
            <span class="lbl">INT</span>
            <div class="val-grp">
              <span class="val">${s.int.toLocaleString()}</span>
              ${gt?.int ? `<span class="bonus">(+${gt.int})</span>` : ""}
              <button type="button" class="stat-add-btn" data-act="add-stat" data-stat="int" ${s.ap > 0 ? "" : "disabled"} title="Add 1 INT">+</button>
            </div>
          </div>
          <div class="stat-core-item">
            <span class="lbl">LUK</span>
            <div class="val-grp">
              <span class="val">${s.luk.toLocaleString()}</span>
              ${gt?.luk ? `<span class="bonus">(+${gt.luk})</span>` : ""}
              <button type="button" class="stat-add-btn" data-act="add-stat" data-stat="luk" ${s.ap > 0 ? "" : "disabled"} title="Add 1 LUK">+</button>
            </div>
          </div>
        </div>
      </div>

      <div class="stat-detailed-box">
        <div class="stat-det-row">
          <span class="lbl">DAMAGE RANGE</span><b class="val">${fmt(lo)} ~ ${fmt(hi)}</b>
          <span class="lbl">DAMAGE</span><b class="val hl-gold">69.00%</b>
        </div>
        <div class="stat-det-row">
          <span class="lbl">FINAL DAMAGE</span><b class="val">188.53%</b>
          <span class="lbl">BOSS DAMAGE</span><b class="val">140.00%</b>
        </div>
        <div class="stat-det-row">
          <span class="lbl">IGNORE DEFENSE</span><b class="val">84.28%</b>
          <span class="lbl">NORMAL ENEMY DAMAGE</span><b class="val">125.00%</b>
        </div>
        <div class="stat-det-row">
          <span class="lbl">ATTACK POWER</span><b class="val">${g.watk()}</b>
          <span class="lbl">CRITICAL RATE</span><b class="val">100%</b>
        </div>
        <div class="stat-det-row">
          <span class="lbl">MAGIC ATT</span><b class="val">${Math.round(s.int * 2.2 + (gt?.int ?? 0))}</b>
          <span class="lbl">CRITICAL DAMAGE</span><b class="val">74.00%</b>
        </div>
        <div class="stat-det-row">
          <span class="lbl">COOLDOWN REDUCTION</span><b class="val">0 sec / 5%</b>
          <span class="lbl">BUFF DURATION</span><b class="val">30%</b>
        </div>
        <div class="stat-det-row">
          <span class="lbl">COOLDOWN NOT APPLIED</span><b class="val">0.00%</b>
          <span class="lbl">IGNORE ELEM RESIST</span><b class="val">0.00%</b>
        </div>
        <div class="stat-det-row">
          <span class="lbl">STATUS DAMAGE</span><b class="val">0.00%</b>
          <span class="lbl">SUMMONS DURATION</span><b class="val">10%</b>
        </div>
        <div class="stat-det-row">
          <span class="lbl">MESOS OBTAINED</span><b class="val">500%</b>
          <span class="lbl">STAR FORCE</span><b class="val">135</b>
        </div>
        <div class="stat-det-row">
          <span class="lbl">ITEM DROP RATE</span><b class="val">10%</b>
          <span class="lbl">ARCANE POWER</span><b class="val">1,010</b>
        </div>
        <div class="stat-det-row">
          <span class="lbl">ADDITIONAL EXP</span><b class="val">120.00%</b>
          <span class="lbl">SACRED POWER</span><b class="val">100</b>
        </div>
        <div class="stat-dots"><span class="dot on"></span><span class="dot"></span></div>
      </div>

      <div class="stat-foot-buttons">
        <button type="button" class="stat-foot-btn" data-act="toggle-hyper">Hyper Stats</button>
        <button type="button" class="stat-foot-btn" data-act="toggle-ability">Ability</button>
      </div>
    `;
  }

  // ------------------------------------------------------------- 2b. Job Advancement Modal
  buildJobAdvancement() {
    this.jobAdvWin = this.makeWindow("job-adv-win", 400, 490, "JOB ADVANCEMENT", 260, 140);
    this.jobAdvWin.classList.add("hidden");
    el("div", "job-adv-body", this.jobAdvWin);
    if (this.game) {
      this.game.onJobAdvancementReady = (tier) => {
        this.openJobAdvancement(tier);
      };
    }
    this.jobAdvWin.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-job]");
      if (btn?.dataset.job) {
        const jid = btn.dataset.job as ClassId;
        this.game.advanceJob(jid);
        this.jobAdvWin.classList.add("hidden");
        const tabsEl = this.skill.querySelector(".skill-tabs") as HTMLElement;
        if (tabsEl) this.buildSkillTabs(tabsEl);
        this.lastStat = this.lastSkill = "";
        this.renderStat();
        this.renderSkill();
        if (this.skill.classList.contains("hidden")) this.toggle(this.skill);
        if (this.statWin.classList.contains("hidden")) this.toggle(this.statWin);
      }
    });
  }

  openJobAdvancement(tier = 1) {
    const body = this.jobAdvWin.querySelector(".job-adv-body") as HTMLElement;
    if (!body) return;
    const s = this.game.stats;

    if (tier === 1 || s.classId === "beginner") {
      body.innerHTML = `
        <div class="job-adv-banner">
          <div class="job-adv-title">★ 1st Job Advancement (Level 10)</div>
          <div class="job-adv-subtitle">Choose your path in the Maple World! Each class commands unique combat abilities, skills, and weapons.</div>
        </div>
        <div class="job-adv-grid">
          <div class="job-adv-card" data-job="warrior">
            <div class="job-adv-card-name">
              <span class="text-amber-300 font-black">Warrior</span>
              <span class="text-[9px] text-amber-400/80">STR</span>
            </div>
            <p class="job-adv-card-desc">Melee titans from Perion with colossal HP, high armor, and sweeping sword strikes.</p>
            <span class="job-adv-card-skills">Slash Blast · War Leap · Iron Body</span>
            <button type="button" class="ci-action-btn cyan mt-1 font-bold">Advance to Warrior</button>
          </div>

          <div class="job-adv-card" data-job="magician">
            <div class="job-adv-card-name">
              <span class="text-sky-300 font-black">Magician</span>
              <span class="text-[9px] text-sky-400/80">INT</span>
            </div>
            <p class="job-adv-card-desc">Arcane scholars from Ellinia wielding ancient magic, devastating elemental bursts, and high MP.</p>
            <span class="job-adv-card-skills">Magic Claw · Energy Bolt · Magic Guard</span>
            <button type="button" class="ci-action-btn cyan mt-1 font-bold">Advance to Magician</button>
          </div>

          <div class="job-adv-card" data-job="bowman">
            <div class="job-adv-card-name">
              <span class="text-emerald-300 font-black">Bowman</span>
              <span class="text-[9px] text-emerald-400/80">DEX</span>
            </div>
            <p class="job-adv-card-desc">Sharpshooters from Henesys raining storms of lethal arrows upon foes from long range.</p>
            <span class="job-adv-card-skills">Double Shot · Arrow Blow · Focus</span>
            <button type="button" class="ci-action-btn cyan mt-1 font-bold">Advance to Bowman</button>
          </div>

          <div class="job-adv-card" data-job="thief">
            <div class="job-adv-card-name">
              <span class="text-purple-300 font-black">Thief</span>
              <span class="text-[9px] text-purple-400/80">LUK</span>
            </div>
            <p class="job-adv-card-desc">Shadow masters from Kerning City using unmatched agility, stealth, and razor-sharp throwing stars.</p>
            <span class="job-adv-card-skills">Lucky Seven · Double Stab · Haste</span>
            <button type="button" class="ci-action-btn cyan mt-1 font-bold">Advance to Thief</button>
          </div>

          <div class="job-adv-card" data-job="pirate">
            <div class="job-adv-card-name">
              <span class="text-orange-300 font-black">Pirate</span>
              <span class="text-[9px] text-orange-400/80">STR</span>
            </div>
            <p class="job-adv-card-desc">Fearless brawlers from Nautilus wielding heavy knuckles, somersault kicks, and concussive energy blasts.</p>
            <span class="job-adv-card-skills">Somersault Kick · Octopush · Dash</span>
            <button type="button" class="ci-action-btn cyan mt-1 font-bold">Advance to Pirate</button>
          </div>
        </div>
      `;
    } else {
      const c = classFor(s.classId);
      const nextJobName = c.tabs[tier] || c.tabs[1] || c.name;
      body.innerHTML = `
        <div class="job-adv-banner">
          <div class="job-adv-title">★ ${tier}${["", "st", "nd", "rd"][tier]} Job Advancement</div>
          <div class="job-adv-subtitle">You have surpassed your limits! Advance your mastery to become a <b>${nextJobName}</b>.</div>
        </div>
        <div class="p-4 bg-zinc-800/80 rounded border border-zinc-600/70 text-center flex flex-col items-center gap-3">
          <div class="text-xl font-black text-amber-300">${s.job} → ${nextJobName}</div>
          <p class="text-xs text-zinc-300">Unlocks powerful new skills in tier ${tier}, bonus +5 AP, and +5 SP.</p>
          <button type="button" class="ci-action-btn cyan px-6 py-2.5 font-bold text-sm" data-job="${s.classId}">Advance to ${nextJobName}</button>
        </div>
      `;
    }

    this.jobAdvWin.classList.remove("hidden");
    this.jobAdvWin.style.zIndex = String(++this.z);
    clampWindow(this.jobAdvWin);
  }

  // ------------------------------------------------------------- 3. Hyper Stats window
  buildHyperStats() {
    this.hyperStatWin = this.makeWindow("hyper-stat-win", 112, 442, "HYPER STATS", 36, 384);
    el("div", "hyper-body", this.hyperStatWin);
  }
  renderHyperStats() {
    if (this.hyperStatWin.classList.contains("hidden")) return;
    const body = this.hyperStatWin.querySelector(".hyper-body") as HTMLElement;
    if (!body || (this.hyperStatWin as any)._built) return;
    (this.hyperStatWin as any)._built = true;

    const list = [
      { name: "STR", lv: 0 },
      { name: "DEX", lv: 0 },
      { name: "INT", lv: 0 },
      { name: "LUK", lv: 0 },
      { name: "HP", lv: 0 },
      { name: "MP", lv: 0 },
      { name: "DF/TF/PP", lv: 0 },
      { name: "Critical Rate", lv: 0 },
      { name: "Critical Damage", lv: 14 },
      { name: "Ignore Defense", lv: 7 },
      { name: "Damage", lv: 15 },
      { name: "Boss Damage", lv: 5 },
      { name: "Normal Enemy", lv: 5 },
      { name: "Status Resistance", lv: 0 },
      { name: "Attack Power & Magic ATT", lv: 0 },
      { name: "EXP Obtained", lv: 0 },
      { name: "Arcane Power", lv: 0 },
    ];

    body.innerHTML = `
      <div class="hyper-list">
        ${list.map((st) => `
          <div class="hyper-row">
            <span class="hyper-name" title="${st.name}">${st.name}</span>
            <div class="hyper-stepper">
              <button type="button" class="hyper-add">+</button>
              <span class="hyper-lv">Lv. ${st.lv}</span>
              <button type="button" class="hyper-up">▲</button>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="hyper-foot">
        <div class="hyper-point"><span>POINT</span><b>5</b></div>
        <div class="hyper-actions">
          <button type="button" class="hyper-btn slate">Reset</button>
          <button type="button" class="hyper-btn cyan">Apply</button>
        </div>
      </div>
    `;
  }

  // ------------------------------------------------------------- 4. Ability window
  buildAbility() {
    this.abilityWin = this.makeWindow("ability-win", 185, 168, "ABILITY", 396, 658);
    el("div", "ability-body", this.abilityWin);
  }
  renderAbility() {
    if (this.abilityWin.classList.contains("hidden")) return;
    const body = this.abilityWin.querySelector(".ability-body") as HTMLElement;
    if (!body || (this.abilityWin as any)._built) return;
    (this.abilityWin as any)._built = true;

    body.innerHTML = `
      <div class="ability-card epic">
        <div class="ability-tier"><span class="ability-ribbon">${lucideIcon("medal", 14)}</span> Epic Ability</div>
        <div class="ability-line main">+5% damage to normal monsters</div>
        <div class="ability-line sub">STR: +10, DEX: +5</div>
        <div class="ability-line sub">INT: +6, DEX: +3</div>
      </div>
      <div class="ability-presets-bar">
        <span class="ab-preset-label">PRESETS</span>
        <div class="ab-preset-btns">
          <button type="button" class="ab-preset-btn on">1</button>
          <button type="button" class="ab-preset-btn">2</button>
          <button type="button" class="ab-preset-btn">3</button>
          <button type="button" class="ab-preset-apply">Apply</button>
        </div>
      </div>
      <div class="ability-foot">
        <div class="ability-honor"><small>Honor EXP</small><b>2,990,730</b></div>
        <button type="button" class="ability-reset-btn">Reset</button>
      </div>
    `;
  }

  // ------------------------------------------------------------- skill window
  buildSkill() {
    const w = this.makeWindow("skill-win", 420, 520, "SKILLS", 400, 110);
    this.skill = w;
    const body = el("div", "skill-win-body", w);
    const tabs = el("div", "skill-tabs", body);
    // Tabs come from the player's class (Beginner + 3 job tiers).
    this.buildSkillTabs(tabs);
    const banner = el("div", "skill-banner-card", body);
    el("div", "skill-banner-icon", banner);
    el("div", "skill-banner-text", banner);
    el("div", "skill-list", body);
    el("div", "skill-sp-bar", body);
  }
  buildSkillTabs(tabs: HTMLElement) {
    const c = this.game.class;
    tabs.textContent = "";
    c.tabs.forEach((name, i) => {
      const t = el("button", "skill-tab", tabs) as HTMLButtonElement;
      t.type = "button";
      t.textContent = i === 0 ? "Beginner" : `${i}${["", "st", "nd", "rd", "th"][i] ?? "th"} · ${name}`;
      t.addEventListener("click", () => { this.skillTab = i; this.lastSkill = ""; });
    });
  }
  renderSkill() {
    if (this.skill.classList.contains("hidden")) return;
    const g = this.game, W = this.win.skill;
    const sig = JSON.stringify([this.skillTab, g.skillLv, g.stats.sp, g.stats.level, g.stats.classId]);
    if (sig === this.lastSkill) return;
    this.lastSkill = sig;
    const w = this.skill;
    const c = g.class;
    w.querySelectorAll<HTMLElement>(".skill-tab").forEach((t, i) => {
      t.classList.toggle("on", i === this.skillTab);
      t.classList.toggle("locked", g.stats.level < c.tabLevel[i]);
    });
    const tab = this.skillTab;
    const banner = w.querySelector(".skill-banner-text") as HTMLElement;
    banner.innerHTML = `<b>${c.tabs[tab]}</b><span>${g.stats.level >= c.tabLevel[tab] ? "Skills available" : `Unlocks at Lv. ${c.tabLevel[tab]}`}</span>`;
    const bi = w.querySelector(".skill-banner-icon") as HTMLElement;
    const first = c.skillsByTab[tab]?.[0];
    if (first) bg(bi, g.skillArt[first]?.icon?.url ?? "");
    const list = w.querySelector(".skill-list") as HTMLElement;
    list.textContent = "";
    const defs = (c.skillsByTab[tab] ?? []).map((id) => SKILL[id]).filter(Boolean);
    defs.forEach((d) => {
      const lv = g.lv(d.id), art = g.skillArt[d.id];
      const usable = g.stats.level >= d.reqLevel;
      const row = el("div", `skill-row ${usable ? "" : "locked"}`, list);
      const ic = el("div", "skill-icon", row);
      bg(ic, (lv > 0 ? art?.icon?.url : art?.iconDisabled?.url) ?? art?.icon?.url ?? "");
      if (lv > 0 && d.kind !== "passive") {
        ic.classList.add("grab");
        this.draggable(ic, () => ({ t: "skill", id: d.id }));
      }
      this.bindTip(ic, () => this.skillTip(d.id));
      const meta = el("div", "skill-meta", row);
      const nm = el("div", "skill-name", meta); nm.textContent = art?.name ?? d.id;
      const lvT = el("div", "skill-lv", meta); lvT.textContent = `${lv} / ${d.maxLevel}${d.kind === "passive" ? " · Passive" : ""}`;
      const up = el("div", "skill-up", row);
      const b = button(up, W.BtSpUp, () => { if (g.learn(d.id)) this.lastSkill = ""; }, `Learn ${art?.name ?? ""}`);
      b.setDisabled(!g.canLearn(d.id));
    });
    const sp = w.querySelector(".skill-sp-bar") as HTMLElement;
    sp.innerHTML = `<span class="sp-label">SKILL POINT</span> <b class="sp-val">${g.stats.sp}</b>`;
  }


  // ------------------------------------------------------------- auto settings
  buildAuto() {
    const w = this.makeWindow("auto-win", 280, 420, "AUTO SETTINGS", innerWidth / 2 - 140, 110);
    this.autoWin = w;
    const g = this.game, a = g.auto;
    const body = el("div", "auto-body", w);

    const toggle = (label: string, key: "battle" | "hp" | "mp" | "buff" | "loot" | "ap" | "boss", hint: string) => {
      const row = el("label", "auto-row", body);
      const cb = el("input", "auto-toggle-input", row) as HTMLInputElement;
      cb.type = "checkbox"; cb.checked = a[key];
      cb.addEventListener("change", () => {
        a[key] = cb.checked;
        g.onChange();
        if (key === "battle") this.autoBtn.classList.toggle("on", a.battle);
        if (key === "boss" && this.autoBossBtn) this.autoBossBtn.classList.toggle("on", a.boss);
      });
      const track = el("span", "auto-toggle-track", row);
      el("span", "auto-toggle-thumb", track);
      const t = el("div", "auto-text", row);
      t.innerHTML = `<span class="auto-label">${label}</span><small class="auto-hint">${hint}</small>`;
      return cb;
    };

    const slider = (key: "hpPct" | "mpPct", label: string) => {
      const row = el("div", "auto-slider", body);
      const header = el("div", "auto-slider-header", row);
      const t = el("span", "auto-slider-label", header);
      const val = el("span", "auto-slider-val", header);
      const r = el("input", "auto-range-input", row) as HTMLInputElement;
      r.type = "range"; r.min = "10"; r.max = "90"; r.step = "5"; r.value = String(a[key]);
      const upd = () => { t.textContent = label; val.textContent = `${a[key]}%`; };
      r.addEventListener("input", () => { a[key] = Number(r.value); upd(); g.onChange(); });
      upd();
    };

    const battle = toggle("Auto Battle", "battle", "Hunt nearby monsters with best skills (B)");
    toggle("Auto HP", "hp", "Drink HP potions automatically");
    slider("hpPct", "Use when HP is below");
    toggle("Auto MP", "mp", "Drink MP potions automatically");
    slider("mpPct", "Use when MP is below");
    toggle("Auto Buff", "buff", "Recast buffs before they expire");
    toggle("Auto Loot", "loot", "Pick up mesos and items");
    toggle("Auto Stats", "ap", "Spend Ability Points on level up (STR/DEX)");
    const bossCb = toggle("Auto Boss", "boss", "Challenge the stage boss as soon as it is ready");

    const reset = el("button", "auto-reset", body) as HTMLButtonElement;
    reset.type = "button";
    reset.textContent = "Reset Character Data";
    reset.addEventListener("click", () => {
      if (confirm("Delete this character's saved progress and start over?")) { localStorage.removeItem("maple-wayfarer-save"); location.reload(); }
    });
    (w as any)._sync = () => {
      battle.checked = a.battle;
      bossCb.checked = a.boss;
    };
  }

  // ------------------------------------------------------------- GM Control Panel
  buildDebug() {
    const w = this.makeWindow("debug-win", 440, 560, "★ GM CONTROL PANEL (F1)", innerWidth / 2 - 220, 50);
    this.debugWin = w;
    const g = this.game;
    const body = el("div", "debug-body", w);

    // Top GM Status Ribbon
    const gmRibbon = el("div", "debug-gm-ribbon", body);
    gmRibbon.innerHTML = `<span>★ GameMaster Authorized: <b>${esc(g.stats.name || "GM")}</b></span><span class="text-sky-400">Maple Wayfarer GM Toolkit</span>`;

    // Top Tabs
    const tabs = el("div", "debug-tabs", body);
    const content = el("div", "debug-content", body);

    const tabList = [
      { id: "player", label: "Player" },
      { id: "stats", label: "Stats" },
      { id: "cheats", label: "Cheats" },
      { id: "items", label: "Items & Spawner" },
      { id: "world", label: "World & Mobs" },
    ];
    const tabPanes: Record<string, HTMLElement> = {};

    const switchTab = (id: string) => {
      for (const t of Array.from(tabs.children)) {
        t.classList.toggle("active", (t as HTMLElement).dataset.tab === id);
      }
      for (const [k, p] of Object.entries(tabPanes)) {
        p.classList.toggle("hidden", k !== id);
      }
    };

    for (const t of tabList) {
      const btn = el("button", `debug-tab ${t.id === "player" ? "active" : ""}`, tabs) as HTMLButtonElement;
      btn.type = "button";
      btn.textContent = t.label;
      btn.dataset.tab = t.id;
      btn.addEventListener("click", () => switchTab(t.id));
      const pane = el("div", `debug-pane ${t.id !== "player" ? "hidden" : ""}`, content);
      tabPanes[t.id] = pane;
    }

    // --- TAB 1: PLAYER ---
    {
      const p = tabPanes.player;

      // GameMaster Privileges & Authorization
      const secGm = el("div", "debug-section", p);
      el("div", "debug-sec-title", secGm).textContent = "GameMaster Privileges & Authorization";
      const gmStatusRow = el("div", "debug-row justify-between items-center", secGm);
      const gmStatusLabel = el("span", "debug-label", gmStatusRow);
      const toggleGmBtn = el("button", "debug-btn", gmStatusRow) as HTMLButtonElement;
      const updateGmStatus = () => {
        const isGm = g.isGm();
        gmStatusLabel.innerHTML = `Role: <b style="color:${isGm ? '#4ade80' : '#f87171'}">${isGm ? "★ GameMaster Active" : "Regular Player"}</b>`;
        toggleGmBtn.textContent = isGm ? "Revoke GM" : "Set Myself as GM";
        toggleGmBtn.className = isGm ? "debug-btn red" : "debug-btn gold";
      };
      toggleGmBtn.addEventListener("click", () => {
        const current = g.isGm();
        g.setGm(!current);
        if (!current) {
          g.onChat("notice", "★ [GM Auth] GameMaster privileges granted! Welcome, GM.");
        } else {
          g.onChat("system", "[GM] GameMaster privileges revoked. Operating as regular player.");
        }
        updateGmStatus();
        this.ext.renderMenuPop();
      });
      updateGmStatus();

      // Character Name Modifier
      const secName = el("div", "debug-section", p);
      el("div", "debug-sec-title", secName).textContent = "Character Name Modifier";
      const nameRow = el("div", "debug-row gap-1", secName);
      el("span", "debug-label", nameRow).textContent = "Name:";
      const nameInp = el("input", "debug-input flex-1", nameRow) as HTMLInputElement;
      nameInp.type = "text";
      nameInp.maxLength = 16;
      nameInp.value = g.stats.name;
      nameInp.placeholder = "Enter new character name...";
      const setNameBtn = el("button", "debug-btn gold", nameRow) as HTMLButtonElement;
      setNameBtn.textContent = "Change Name";
      setNameBtn.addEventListener("click", () => {
        const newName = nameInp.value.trim();
        if (newName && newName !== g.stats.name) {
          g.setName(newName);
          nameInp.value = g.stats.name;
          const ribbonName = w.querySelector(".debug-gm-ribbon b");
          if (ribbonName) ribbonName.textContent = g.stats.name;
        } else if (!newName) {
          g.onChat("system", "[GM] Name cannot be blank.");
        }
      });
      const quickNamesRow = el("div", "debug-row wrap gap-1 mt-1", secName);
      el("span", "debug-label", quickNamesRow).textContent = "Presets:";
      for (const preset of ["GM-Master", "GM-Hero", "MapleHero", "MapleGM", "Admin"]) {
        const b = el("button", "debug-btn small", quickNamesRow);
        b.textContent = preset;
        b.addEventListener("click", () => {
          nameInp.value = preset;
          g.setName(preset);
          const ribbonName = w.querySelector(".debug-gm-ribbon b");
          if (ribbonName) ribbonName.textContent = preset;
        });
      }
      addEventListener("character-renamed", (e: any) => {
        if (e.detail?.newName) {
          nameInp.value = e.detail.newName;
          const ribbonName = w.querySelector(".debug-gm-ribbon b");
          if (ribbonName) ribbonName.textContent = e.detail.newName;
        }
      });

      const secLv = el("div", "debug-section", p);
      el("div", "debug-sec-title", secLv).textContent = "Character Level & EXP";
      const lvRow = el("div", "debug-row", secLv);
      el("span", "debug-label", lvRow).textContent = "Level:";
      const lvInp = el("input", "debug-input", lvRow) as HTMLInputElement;
      lvInp.type = "number"; lvInp.min = "1"; lvInp.max = "300"; lvInp.value = String(g.stats.level);
      const setLvBtn = el("button", "debug-btn", lvRow) as HTMLButtonElement;
      setLvBtn.type = "button"; setLvBtn.textContent = "Set Level";
      setLvBtn.addEventListener("click", () => {
        const val = parseInt(lvInp.value);
        if (!isNaN(val)) g.setLevel(val);
      });
      const quickLvRow = el("div", "debug-row wrap gap-1 mt-1", secLv);
      for (const n of [1, 5, 10, 30, 60, 100, 200, 250, 275]) {
        const b = el("button", "debug-btn small", quickLvRow);
        b.textContent = n >= 30 ? `Lv. ${n}` : `+${n}`;
        b.addEventListener("click", () => {
          if (n >= 30) g.setLevel(n);
          else g.setLevel(g.stats.level + n);
          lvInp.value = String(g.stats.level);
        });
      }

      const expRow = el("div", "debug-row wrap gap-1 mt-1", secLv);
      el("span", "debug-label", expRow).textContent = "Add EXP:";
      for (const e of [1000, 10000, 100000, 1000000, 10000000, 100000000]) {
        const b = el("button", "debug-btn small green", expRow);
        b.textContent = `+${fmt(e)}`;
        b.addEventListener("click", () => g.addExp(e));
      }

      const secJob = el("div", "debug-section", p);
      el("div", "debug-sec-title", secJob).textContent = "Class & Job Advancement";
      const jobRow = el("div", "debug-row", secJob);
      const selClass = el("select", "debug-select flex-1", jobRow) as HTMLSelectElement;
      const classOptions: { id: ClassId; name: string }[] = [
        { id: "beginner", name: "Beginner" },
        { id: "warrior", name: "Warrior" },
        { id: "magician", name: "Magician" },
        { id: "bowman", name: "Bowman" },
        { id: "thief", name: "Thief" },
        { id: "pirate", name: "Pirate" },
      ];
      for (const c of classOptions) {
        const opt = el("option", "", selClass) as HTMLOptionElement;
        opt.value = c.id; opt.textContent = c.name;
        if (c.id === g.stats.classId) opt.selected = true;
      }
      const setJobBtn = el("button", "debug-btn", jobRow) as HTMLButtonElement;
      setJobBtn.type = "button"; setJobBtn.textContent = "Switch Class";
      setJobBtn.addEventListener("click", () => {
        g.setJob(selClass.value as ClassId);
      });

      const advRow = el("div", "debug-row gap-1 mt-1", secJob);
      for (const tier of [1, 2, 3]) {
        const b = el("button", "debug-btn small gold", advRow);
        b.textContent = `${tier}${tier === 1 ? "st" : tier === 2 ? "nd" : "rd"} Job`;
        b.addEventListener("click", () => {
          const c = g.class;
          if (c.tabs[tier]) {
            g.stats.job = c.tabs[tier];
            g.recalc();
            g.onChat("notice", `[GM] Advanced to ${g.stats.job}!`);
            g.onChange();
          }
        });
      }
      const maxSkillQuickBtn = el("button", "debug-btn small flex-1", advRow);
      maxSkillQuickBtn.textContent = "Max All Skills";
      maxSkillQuickBtn.addEventListener("click", () => g.maxAllSkills());

      const secMeso = el("div", "debug-section", p);
      el("div", "debug-sec-title", secMeso).textContent = "Mesos & Economy";
      const mesoRow = el("div", "debug-row", secMeso);
      const mesoInp = el("input", "debug-input flex-1", mesoRow) as HTMLInputElement;
      mesoInp.type = "number"; mesoInp.value = String(g.stats.meso);
      const setMesoBtn = el("button", "debug-btn gold", mesoRow) as HTMLButtonElement;
      setMesoBtn.textContent = "Set Meso";
      setMesoBtn.addEventListener("click", () => {
        const val = parseInt(mesoInp.value);
        if (!isNaN(val)) {
          g.stats.meso = Math.max(0, val);
          g.onGain("meso", `[GM] Mesos set to ${g.stats.meso.toLocaleString()}`);
          g.onChange();
        }
      });
      const maxMesoBtn = el("button", "debug-btn gold", mesoRow) as HTMLButtonElement;
      maxMesoBtn.textContent = "Max Mesos";
      maxMesoBtn.title = "Set to MapleStory cap: 2,147,483,647";
      maxMesoBtn.addEventListener("click", () => {
        g.stats.meso = 2147483647;
        mesoInp.value = "2147483647";
        g.onGain("meso", "[GM] Mesos set to maximum cap: 2,147,483,647!");
        g.onChange();
      });

      const quickMesoRow = el("div", "debug-row wrap gap-1 mt-1", secMeso);
      for (const amt of [100000, 1000000, 10000000, 100000000, 1000000000]) {
        const b = el("button", "debug-btn small gold", quickMesoRow);
        b.textContent = `+${fmt(amt)}`;
        b.addEventListener("click", () => {
          g.giveMesos(amt);
          mesoInp.value = String(g.stats.meso);
        });
      }

      const secFame = el("div", "debug-section", p);
      el("div", "debug-sec-title", secFame).textContent = "Character Fame";
      const fameRow = el("div", "debug-row", secFame);
      el("span", "debug-label", fameRow).textContent = "Fame:";
      const fameInp = el("input", "debug-input flex-1", fameRow) as HTMLInputElement;
      fameInp.type = "number"; fameInp.value = String(g.stats.fame);
      const setFameBtn = el("button", "debug-btn", fameRow) as HTMLButtonElement;
      setFameBtn.textContent = "Set Fame";
      setFameBtn.addEventListener("click", () => {
        const val = parseInt(fameInp.value);
        if (!isNaN(val)) g.setFame(val);
      });
      for (const amt of [10, 100, 1000]) {
        const b = el("button", "debug-btn small green", fameRow);
        b.textContent = `+${amt}`;
        b.addEventListener("click", () => {
          g.setFame(g.stats.fame + amt);
          fameInp.value = String(g.stats.fame);
        });
      }
    }

    // --- TAB 2: STATS ---
    {
      const s = tabPanes.stats;
      const secApSp = el("div", "debug-section", s);
      el("div", "debug-sec-title", secApSp).textContent = "AP & SP Points";
      const apRow = el("div", "debug-row", secApSp);
      el("span", "debug-label", apRow).textContent = "AP:";
      const apInp = el("input", "debug-input", apRow) as HTMLInputElement;
      apInp.type = "number"; apInp.value = String(g.stats.ap);
      const setApBtn = el("button", "debug-btn", apRow) as HTMLButtonElement;
      setApBtn.textContent = "Set AP";
      setApBtn.addEventListener("click", () => {
        const val = parseInt(apInp.value);
        if (!isNaN(val)) { g.stats.ap = Math.max(0, val); g.onChange(); }
      });
      for (const n of [10, 50, 100, 500, 5000]) {
        const b = el("button", "debug-btn small", apRow);
        b.textContent = `+${n}`;
        b.addEventListener("click", () => { g.stats.ap += n; apInp.value = String(g.stats.ap); g.onChange(); });
      }

      const spRow = el("div", "debug-row mt-1", secApSp);
      el("span", "debug-label", spRow).textContent = "SP:";
      const spInp = el("input", "debug-input", spRow) as HTMLInputElement;
      spInp.type = "number"; spInp.value = String(g.stats.sp);
      const setSpBtn = el("button", "debug-btn", spRow) as HTMLButtonElement;
      setSpBtn.textContent = "Set SP";
      setSpBtn.addEventListener("click", () => {
        const val = parseInt(spInp.value);
        if (!isNaN(val)) { g.stats.sp = Math.max(0, val); g.onChange(); }
      });
      for (const n of [10, 50, 100, 500]) {
        const b = el("button", "debug-btn small", spRow);
        b.textContent = `+${n}`;
        b.addEventListener("click", () => { g.stats.sp += n; spInp.value = String(g.stats.sp); g.onChange(); });
      }

      const secAttr = el("div", "debug-section", s);
      el("div", "debug-sec-title", secAttr).textContent = "Primary Attributes";
      for (const stat of ["str", "dex", "int", "luk"] as const) {
        const row = el("div", "debug-row", secAttr);
        el("span", "debug-label uppercase", row).textContent = `${stat}:`;
        const inp = el("input", "debug-input", row) as HTMLInputElement;
        inp.type = "number"; inp.value = String(g.stats[stat]);
        const setBtn = el("button", "debug-btn", row) as HTMLButtonElement;
        setBtn.textContent = "Set";
        setBtn.addEventListener("click", () => {
          const val = parseInt(inp.value);
          if (!isNaN(val)) { g.stats[stat] = Math.max(4, val); g.recalc(); g.onChange(); }
        });
        for (const n of [10, 50, 100]) {
          const b = el("button", "debug-btn small", row);
          b.textContent = `+${n}`;
          b.addEventListener("click", () => { g.stats[stat] += n; inp.value = String(g.stats[stat]); g.recalc(); g.onChange(); });
        }
      }
      const allRow = el("div", "debug-row gap-2 mt-2", secAttr);
      const addAll50 = el("button", "debug-btn green flex-1", allRow);
      addAll50.textContent = "+50 All";
      addAll50.addEventListener("click", () => {
        g.stats.str += 50; g.stats.dex += 50; g.stats.int += 50; g.stats.luk += 50;
        g.recalc(); g.onChange();
      });
      const addAll500 = el("button", "debug-btn gold flex-1", allRow);
      addAll500.textContent = "+500 All";
      addAll500.addEventListener("click", () => {
        g.stats.str += 500; g.stats.dex += 500; g.stats.int += 500; g.stats.luk += 500;
        g.recalc(); g.onChange();
      });
      const addAll5000 = el("button", "debug-btn red flex-1", allRow);
      addAll5000.textContent = "+5,000 God Mode";
      addAll5000.title = "Hyper boost for GM testing";
      addAll5000.addEventListener("click", () => {
        g.stats.str += 5000; g.stats.dex += 5000; g.stats.int += 5000; g.stats.luk += 5000;
        g.recalc(); g.onChange();
        g.onChat("notice", "[GM] Added +5,000 to all core stats!");
      });

      const resetAttrRow = el("div", "debug-row mt-1", secAttr);
      const resetAttrBtn = el("button", "debug-btn small flex-1", resetAttrRow);
      resetAttrBtn.textContent = "Reset Base Attributes to 4";
      resetAttrBtn.addEventListener("click", () => {
        if (confirm("Reset STR, DEX, INT, LUK back to baseline 4?")) {
          g.stats.str = 4; g.stats.dex = 4; g.stats.int = 4; g.stats.luk = 4;
          g.recalc(); g.onChange();
          g.onChat("notice", "[GM] Primary attributes reset to 4.");
        }
      });
    }

    // --- TAB 3: CHEATS ---
    {
      const c = tabPanes.cheats;
      const secToggles = el("div", "debug-section", c);
      el("div", "debug-sec-title", secToggles).textContent = "Battle & Player Cheats";

      const makeToggle = (label: string, desc: string, get: () => boolean, set: (v: boolean) => void) => {
        const row = el("div", "debug-toggle-row", secToggles);
        const info = el("div", "debug-toggle-info", row);
        el("div", "debug-toggle-name", info).textContent = label;
        el("div", "debug-toggle-desc", info).textContent = desc;
        const btn = el("button", `debug-toggle-btn ${get() ? "on" : ""}`, row) as HTMLButtonElement;
        btn.textContent = get() ? "ON" : "OFF";
        btn.addEventListener("click", () => {
          set(!get());
          btn.classList.toggle("on", get());
          btn.textContent = get() ? "ON" : "OFF";
        });
      };

      makeToggle("God Mode", "Immune to monster contact and attack damage", () => g.godMode, (v) => { g.godMode = v; g.onChat("notice", `[GM] God Mode: ${v ? "ENABLED" : "DISABLED"}`); });
      makeToggle("Infinite MP", "Cast skills and movement without spending MP", () => g.infiniteMp, (v) => { g.infiniteMp = v; g.onChat("notice", `[GM] Infinite MP: ${v ? "ENABLED" : "DISABLED"}`); });
      makeToggle("1-Hit Kill", "Inflicts maximum damage (9,999,999) on every attack", () => g.oneHitKill, (v) => { g.oneHitKill = v; g.onChat("notice", `[GM] 1-Hit Kill: ${v ? "ENABLED" : "DISABLED"}`); });
      makeToggle("GM Hide (Invisibility)", "Monsters ignore player; player appears translucent", () => g.gmHide, (v) => { g.gmHide = v; g.onChat("notice", `[GM] GM Hide / Invisibility: ${v ? "ENABLED" : "DISABLED"}`); });

      const secSpeed = el("div", "debug-section", c);
      el("div", "debug-sec-title", secSpeed).textContent = "Movement Speed Multiplier (Super Haste)";
      const spdRow = el("div", "debug-row gap-1", secSpeed);
      for (const mul of [1, 1.5, 2, 2.5, 3, 4]) {
        const b = el("button", `debug-btn small ${g.speedMultiplier === mul ? "active-speed" : ""}`, spdRow);
        b.textContent = mul === 4 ? "4x (Haste)" : `${mul}x`;
        b.addEventListener("click", () => {
          g.speedMultiplier = mul;
          for (const sibling of Array.from(spdRow.children)) sibling.classList.remove("active-speed");
          b.classList.add("active-speed");
          g.onChat("notice", `[GM] Movement speed multiplier set to ${mul}x.`);
        });
      }

      const secInstant = el("div", "debug-section", c);
      el("div", "debug-sec-title", secInstant).textContent = "Instant Actions";
      const instRow = el("div", "debug-row wrap gap-2", secInstant);

      const healBtn = el("button", "debug-btn green flex-1", instRow);
      healBtn.textContent = "Full Heal (HP & MP)";
      healBtn.addEventListener("click", () => g.fullHeal());

      const maxHpBtn = el("button", "debug-btn flex-1", instRow);
      maxHpBtn.textContent = "+5,000 Base HP";
      maxHpBtn.addEventListener("click", () => { g.stats.baseHp += 5000; g.recalc(); g.stats.hp = g.stats.maxHp; g.onChange(); });

      const hyperBodyBtn = el("button", "debug-btn gold flex-1", instRow);
      hyperBodyBtn.textContent = "+50,000 Super HP";
      hyperBodyBtn.title = "Hyper Body boost";
      hyperBodyBtn.addEventListener("click", () => { g.stats.baseHp += 50000; g.recalc(); g.stats.hp = g.stats.maxHp; g.onChange(); g.onChat("notice", "[GM] Added +50,000 Base HP!"); });

      const maxSkillsBtn = el("button", "debug-btn gold flex-1", instRow);
      maxSkillsBtn.textContent = "Max Out All Class Skills";
      maxSkillsBtn.addEventListener("click", () => g.maxAllSkills());
    }

    // --- TAB 4: ITEMS & SPAWNER ---
    {
      const it = tabPanes.items;

      // Custom Item Spawner Section
      const secSpawn = el("div", "debug-section", it);
      el("div", "debug-sec-title", secSpawn).textContent = "Spawn Item by ID";
      const spawnRow = el("div", "debug-row gap-1", secSpawn);
      const itemIdInp = el("input", "debug-input flex-1", spawnRow) as HTMLInputElement;
      itemIdInp.placeholder = "Item ID (e.g. 1003797 or 2000002)";
      itemIdInp.type = "number";
      const itemQtyInp = el("input", "debug-input", spawnRow) as HTMLInputElement;
      itemQtyInp.placeholder = "Qty";
      itemQtyInp.type = "number";
      itemQtyInp.style.width = "54px";
      itemQtyInp.value = "1";
      itemQtyInp.min = "1";
      const spawnItemBtn = el("button", "debug-btn gold", spawnRow) as HTMLButtonElement;
      spawnItemBtn.textContent = "Spawn Item";
      spawnItemBtn.addEventListener("click", () => {
        const id = parseInt(itemIdInp.value);
        const qty = parseInt(itemQtyInp.value) || 1;
        if (!isNaN(id) && id > 0) {
          g.giveAnyItem(id, qty);
          this.ext?.renderInv?.();
          this.ext?.renderEquip?.();
        } else {
          g.onChat("system", "[GM] Please enter a valid Item ID.");
        }
      });

      // All Items Catalog Launcher
      const secBrowser = el("div", "debug-section", it);
      el("div", "debug-sec-title", secBrowser).textContent = "Visual Item Browser";
      const browserRow = el("div", "debug-row", secBrowser);
      const openBrowserBtn = el("button", "debug-btn gold flex-1 py-1", browserRow) as HTMLButtonElement;
      openBrowserBtn.innerHTML = `<span>★ Open All-Items Catalog (Hotkey: L)</span>`;
      openBrowserBtn.addEventListener("click", () => this.ext.items.open());

      // Preset Item Bundles
      const secBundles = el("div", "debug-section", it);
      el("div", "debug-sec-title", secBundles).textContent = "Equipment & Item Bundles";
      const bundleGrid = el("div", "debug-row wrap gap-2", secBundles);

      const makeBundleBtn = (label: string, title: string, fn: () => void, cls = "gold") => {
        const b = el("button", `debug-btn flex-1 ${cls}`, bundleGrid) as HTMLButtonElement;
        b.textContent = label;
        b.title = title;
        b.addEventListener("click", () => {
          fn();
          this.ext?.renderInv?.();
          this.ext?.renderEquip?.();
        });
      };

      makeBundleBtn("+100x All Potions", "Pots pack", () => {
        for (const pid of [2000000, 2000001, 2000002, 2000003, 2000006]) g.giveItem(pid, 100);
      }, "green");

      makeBundleBtn("+50x Ores & Cubes", "Materials & Cubes", () => {
        for (const oid of [4010000, 4010001, 4010002, 4010003, 4010006]) g.giveMat(oid, 50);
        g.giveMat(4000010, 50); // Occult Cubes
      });

      makeBundleBtn("+1x NX Cosmetics Pack", "Royal Azure Feather, Capes, Outfits", () => {
        for (const cid of [1703214, 1003112, 1002419, 1002140, 1102041, 1102039, 1050018, 1442011, 1302016]) {
          g.addGear(makeGear(cid, 0));
        }
        g.onChange();
        g.onChat("notice", "[GM] Added NX Cosmetics Pack to inventory.");
      });

      makeBundleBtn("+1x Chaos Root Abyss (CRA) Set", "Royal Hat, Eagle Eye Top, Trixter Pants", () => {
        for (const gid of [1003797, 1042254, 1062165]) {
          g.addGear(makeGear(gid, 0));
        }
        g.onChange();
        g.onChat("notice", "[GM] Added Chaos Root Abyss gear set!");
      });

      makeBundleBtn("+1x Arcane Umbra Weapons", "Arcane 2H Sword, Dagger, Bow, Claw, Wand", () => {
        for (const wid of [1402259, 1332279, 1452257, 1472265, 1372228, 1482221]) {
          g.addGear(makeGear(wid, 0));
        }
        g.onChange();
        g.onChat("notice", "[GM] Added Arcane Umbra weapon collection!");
      });

      makeBundleBtn("+1x Boss Accessory Pack", "Horntail Pendant, Belt, Guardian Angel Ring, Face/Eye", () => {
        for (const aid of [1122000, 1132246, 1113075, 1012000, 1022000, 1032224]) {
          g.addGear(makeGear(aid, 0));
        }
        g.onChange();
        g.onChat("notice", "[GM] Added Boss Accessories collection!");
      });

      // Bag Management
      const secInv = el("div", "debug-section", it);
      el("div", "debug-sec-title", secInv).textContent = "Inventory Management";
      const invRow = el("div", "debug-row", secInv);
      const clearEquipsBtn = el("button", "debug-btn red flex-1", invRow);
      clearEquipsBtn.textContent = "Clear Equip Bag";
      clearEquipsBtn.addEventListener("click", () => {
        if (confirm("Clear all unequipped gear in bag? This cannot be undone.")) {
          g.bag = [];
          g.onChange();
          this.ext?.renderInv?.();
          g.onChat("notice", "[GM] Equip bag cleared.");
        }
      });
    }

    // --- TAB 5: WORLD & MOBS ---
    {
      const wd = tabPanes.world;

      // Mob Wave Spawner
      const secMob = el("div", "debug-section", wd);
      el("div", "debug-sec-title", secMob).textContent = "Monster & Boss Wave Spawner";
      const mobRow1 = el("div", "debug-row gap-1", secMob);
      const selMob = el("select", "debug-select flex-1", mobRow1) as HTMLSelectElement;
      const mobPresets = [
        { id: 210100, name: "Snail (Lv. 1)" },
        { id: 1110100, name: "Slime (Lv. 6)" },
        { id: 1210102, name: "Orange Mushroom (Lv. 8)" },
        { id: 2220000, name: "Blue Mushroom [Boss] (Lv. 20)" },
        { id: 3220000, name: "Stumpy [Boss] (Lv. 35)" },
        { id: 6130101, name: "Mushmom [Boss] (Lv. 60)" },
        { id: 9300003, name: "Mano [Boss] (Lv. 20)" },
        { id: 8220007, name: "Dyle [Boss] (Lv. 65)" },
        { id: 5220000, name: "Faust [Boss] (Lv. 50)" },
        { id: 6300005, name: "Zombie Mushmom [Boss] (Lv. 65)" },
      ];
      for (const mp of mobPresets) {
        const opt = el("option", "", selMob) as HTMLOptionElement;
        opt.value = String(mp.id);
        opt.textContent = `${mp.name} (${mp.id})`;
      }
      const selCount = el("select", "debug-select", mobRow1) as HTMLSelectElement;
      selCount.style.width = "75px";
      for (const cnt of [1, 3, 5, 10, 20]) {
        const opt = el("option", "", selCount) as HTMLOptionElement;
        opt.value = String(cnt);
        opt.textContent = `${cnt}x`;
      }
      const spawnMobBtn = el("button", "debug-btn red", mobRow1) as HTMLButtonElement;
      spawnMobBtn.textContent = "Summon";
      spawnMobBtn.addEventListener("click", () => {
        const id = parseInt(selMob.value);
        const count = parseInt(selCount.value) || 1;
        if (id) g.spawnCustomMob(id, count);
      });

      const mobRow2 = el("div", "debug-row gap-1 mt-1", secMob);
      const customMobInp = el("input", "debug-input flex-1", mobRow2) as HTMLInputElement;
      customMobInp.placeholder = "Custom Mob ID (e.g. 100100)";
      customMobInp.type = "number";
      const spawnCustomBtn = el("button", "debug-btn", mobRow2) as HTMLButtonElement;
      spawnCustomBtn.textContent = "Summon Custom";
      spawnCustomBtn.addEventListener("click", () => {
        const id = parseInt(customMobInp.value);
        const count = parseInt(selCount.value) || 1;
        if (!isNaN(id) && id > 0) g.spawnCustomMob(id, count);
        else g.onChat("system", "[GM] Please enter a valid Mob ID.");
      });

      // Monster Management (Magnet & Purge)
      const secMobMgmt = el("div", "debug-section", wd);
      el("div", "debug-sec-title", secMobMgmt).textContent = "Monster Control (Magnet & Purge)";
      const mgmtRow = el("div", "debug-row gap-2", secMobMgmt);
      const magnetBtn = el("button", "debug-btn gold flex-1", mgmtRow);
      magnetBtn.textContent = "Magnet Mobs (Pull to GM)";
      magnetBtn.addEventListener("click", () => g.magnetMobs());
      const killAllBtn = el("button", "debug-btn red flex-1", mgmtRow);
      killAllBtn.textContent = "Kill All Monsters on Map";
      killAllBtn.addEventListener("click", () => g.killAllMobs());

      // Damage Skin Selector (WZ skins)
      const secSkin = el("div", "debug-section", wd);
      el("div", "debug-sec-title", secSkin).textContent = "Custom Damage Skins (WZ & Synced)";
      const skinRow1 = el("div", "debug-row gap-1", secSkin);
      const skinSelect = el("select", "debug-input flex-1", skinRow1) as HTMLSelectElement;
      skinSelect.innerHTML = `
        <option value="0">Classic Maple (Default)</option>
        <option value="blue">Arcane Blue</option>
        <option value="violet">Shadow Violet</option>
        <option value="green">Verdant Green</option>
        <option value="kite">Kite Festival</option>
        <option value="1">#1 Digital Cyber</option>
        <option value="2">#2 Sweet Macaroon</option>
        <option value="3">#3 Neon Matrix</option>
        <option value="4">#4 Crimson Balrog</option>
        <option value="5">#5 Starry Cosmos</option>
        <option value="10">#10 Origami Paper</option>
        <option value="20">#20 Rainbow Candy</option>
        <option value="50">#50 Glitch Hologram</option>
        <option value="100">#100 Royal Gold</option>
      `;
      skinSelect.value = String(g.damageSkin ?? 0);
      skinSelect.addEventListener("change", () => {
        g.setDamageSkin(skinSelect.value);
      });
      const customSkinInp = el("input", "debug-input w-20", skinRow1) as HTMLInputElement;
      customSkinInp.placeholder = "ID 1-641";
      const applySkinBtn = el("button", "debug-btn blue", skinRow1);
      applySkinBtn.textContent = "Apply";
      applySkinBtn.addEventListener("click", () => {
        const val = customSkinInp.value.trim();
        if (val) g.setDamageSkin(val);
      });

      // Combat & Stage Progression
      const secCombat = el("div", "debug-section", wd);
      el("div", "debug-sec-title", secCombat).textContent = "Stage & Boss Progression";
      const combatRow1 = el("div", "debug-row wrap gap-2", secCombat);
      const readyBossBtn = el("button", "debug-btn gold flex-1", combatRow1);
      readyBossBtn.textContent = "Ready Stage Boss (25 Kills)";
      readyBossBtn.addEventListener("click", () => g.readyBossImmediate());

      const spawnBossBtn = el("button", "debug-btn red flex-1", combatRow1);
      spawnBossBtn.textContent = "Spawn Boss Immediately";
      spawnBossBtn.addEventListener("click", () => g.spawnBossImmediate());

      const combatRow2 = el("div", "debug-row wrap gap-2 mt-1", secCombat);
      const advanceStageBtn = el("button", "debug-btn green flex-1", combatRow2);
      advanceStageBtn.textContent = "Advance to Next Stage / Area";
      advanceStageBtn.addEventListener("click", () => g.advanceStageImmediate());

      // Server Broadcast / Notice Banner
      const secNotice = el("div", "debug-section", wd);
      el("div", "debug-sec-title", secNotice).textContent = "Server Announcement / Broadcast";
      const noticeRow = el("div", "debug-row gap-1", secNotice);
      const noticeInp = el("input", "debug-input flex-1", noticeRow) as HTMLInputElement;
      noticeInp.placeholder = "GM announcement text...";
      noticeInp.maxLength = 120;
      const broadcastBtn = el("button", "debug-btn gold", noticeRow) as HTMLButtonElement;
      broadcastBtn.textContent = "Broadcast";
      broadcastBtn.addEventListener("click", () => {
        const text = noticeInp.value.trim();
        if (text) {
          g.broadcastNotice(text);
          noticeInp.value = "";
        }
      });

      // Map Teleport / Warp
      const secWarp = el("div", "debug-section", wd);
      el("div", "debug-sec-title", secWarp).textContent = "Map Teleport / Warp";
      const warpRow = el("div", "debug-row", secWarp);
      const selMap = el("select", "debug-select flex-1", warpRow) as HTMLSelectElement;
      const mapOptions = [
        { id: 100010000, name: "Henesys" },
        { id: 100020000, name: "Henesys Market" },
        { id: 101010000, name: "Ellinia" },
        { id: 100000000, name: "Henesys Town" },
        { id: 910000000, name: "Free Market Entrance" },
      ];
      for (const m of mapOptions) {
        const opt = el("option", "", selMap) as HTMLOptionElement;
        opt.value = String(m.id); opt.textContent = `${m.name} (${m.id})`;
        if (m.id === g.map?.id) opt.selected = true;
      }
      const warpBtn = el("button", "debug-btn green", warpRow) as HTMLButtonElement;
      warpBtn.textContent = "Warp Now";
      warpBtn.addEventListener("click", () => {
        const targetId = parseInt(selMap.value);
        if (targetId) {
          g.loadMap(targetId, "spawn");
          g.onChat("notice", `[GM] Teleported to map ${targetId}.`);
        }
      });

      // Multiplayer & Network Sync
      const secSync = el("div", "debug-section", wd);
      el("div", "debug-sec-title", secSync).textContent = "Multiplayer & Network Sync";
      const syncRow = el("div", "debug-row gap-2", secSync);
      const syncNowBtn = el("button", "debug-btn green flex-1", syncRow);
      syncNowBtn.textContent = "Force Sync Now (/sync)";
      syncNowBtn.addEventListener("click", () => {
        g.syncAll(true);
        g.onChat("system", "[Sync] WebSocket connection and player state synchronized with server.");
      });
      const reconnectBtn = el("button", "debug-btn flex-1", syncRow);
      reconnectBtn.textContent = "Reconnect WebSocket";
      reconnectBtn.addEventListener("click", () => {
        g.initWs();
        g.onChat("system", "[Sync] Reconnecting WebSocket...");
      });
    }
  }

  // ------------------------------------------------------------- Game Guide & Codex Window
  buildGuide() {
    this.guideWin = this.makeWindow("guide-win", 640, 520, "MAPLE WAYFARER - GAME GUIDE & CODEX (G)", Math.max(20, Math.round(innerWidth / 2 - 320)), 60);
    el("div", "guide-body", this.guideWin);
    this.guideWin.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-guidetab]");
      if (t) {
        this.guideTab = t.dataset.guidetab as any;
        this.renderGuide();
      }
    });
    this.renderGuide();
  }

  renderGuide() {
    const body = this.guideWin.querySelector(".guide-body") as HTMLElement;
    if (!body) return;
    const tab = this.guideTab;
    const tabs = [
      { id: "roadmap", label: "★ Road Map (Lv. 1-200)" },
      { id: "overview", label: "About & Controls" },
      { id: "progression", label: "Getting Stronger" },
      { id: "social", label: "Social & Maps" },
      { id: "enchanting", label: "Star Force & Cubing" },
      { id: "crafting", label: "Crafting & Alchemy" },
    ];

    const tabButtons = tabs.map((t) =>
      `<button type="button" class="guide-tab-btn ${t.id === tab ? "active" : ""}" data-guidetab="${t.id}">${t.label}</button>`
    ).join("");

    let contentHtml = "";
    if (tab === "roadmap") {
      contentHtml = `
        <div class="guide-pane">
          <div class="guide-hero">
            <h2 class="text-lg font-black text-amber-300">★ Beginner Road Map & Post-Creation Journey</h2>
            <p class="text-xs text-zinc-300 mt-1 leading-relaxed">Follow this step-by-step progression guide immediately after creating your character to reach maximum power, unlock all 4 job advancements, and conquer Victoria Island bosses.</p>
          </div>

          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">Step-by-Step Leveling & Progression Path</h3>
            <div class="flex flex-col gap-2.5">
              
              <!-- Step 1 -->
              <div class="guide-step-card">
                <div class="guide-step-num">1</div>
                <div class="guide-step-content">
                  <span class="guide-step-title">Spawn in Free Market & Equip Starter Gear (Lv. 1)</span>
                  <p class="guide-step-desc">You start in the peaceful <b>Free Market (Map 910000000)</b> with zero hostile monsters. Open your Inventory (<b>I</b>) or Equipment Window (<b>E</b>). You have starter gear in your bag. Drag items freely to any slot in your 32-slot grid, or right-click any piece of gear and select <b>Equip</b>.</p>
                  <div class="guide-step-chips">
                    <span class="guide-chip accent">Free Market Safe Zone</span>
                    <span class="guide-chip">Inventory: Key I</span>
                    <span class="guide-chip">Equip: Key E</span>
                    <span class="guide-chip gold">Free-Grid Placement</span>
                  </div>
                </div>
              </div>

              <!-- Step 2 -->
              <div class="guide-step-card">
                <div class="guide-step-num">2</div>
                <div class="guide-step-content">
                  <span class="guide-step-title">Venture Through Portals & First Hunts (Lv. 1 - 10)</span>
                  <p class="guide-step-desc">Walk to the glowing blue portals on the left or right of the Free Market and press <b>↑</b> to enter Victoria Island hunting maps (Henesys, Ellinia, Perion, Kerning City). Slay Snails, Blue Snails, and Slimes with Basic Attack (<b>Ctrl</b> or <b>X</b>). Press <b>Z</b> to loot drops. Use <b>B</b> to toggle Auto Battle anytime!</p>
                  <div class="guide-step-chips">
                    <span class="guide-chip accent">Portals: ↑</span>
                    <span class="guide-chip">Attack: Ctrl / X</span>
                    <span class="guide-chip">Loot: Z</span>
                    <span class="guide-chip green">Auto Battle: B</span>
                  </div>
                </div>
              </div>

              <!-- Step 3 -->
              <div class="guide-step-card">
                <div class="guide-step-num">3</div>
                <div class="guide-step-content">
                  <span class="guide-step-title">1st Job Advancement & Skill Tree (Lv. 10)</span>
                  <p class="guide-step-desc">At Level 10, open the Job Advancement window or visit your mentor to select your class: <b>Warrior</b>, <b>Magician</b>, <b>Bowman</b>, <b>Thief</b>, or <b>Pirate</b>. Press <b>K</b> to open the Skill Tree, spend your 3 starter SP on offensive abilities, and drag the skill icons into your quickbar (slots 1-8 or Del/End). Press <b>S</b> to distribute your +5 AP per level.</p>
                  <div class="guide-step-chips">
                    <span class="guide-chip gold">1st Job at Lv. 10</span>
                    <span class="guide-chip">Skills: Key K</span>
                    <span class="guide-chip">Stats & AP: Key S</span>
                    <span class="guide-chip accent">5 Classes Available</span>
                  </div>
                </div>
              </div>

              <!-- Step 4 -->
              <div class="guide-step-card">
                <div class="guide-step-num">4</div>
                <div class="guide-step-content">
                  <span class="guide-step-title">Core Gameplay Loop: 25-Kill Bosses & Auto Boss</span>
                  <p class="guide-step-desc">Every map tracks monster kills. Slaying <b>25 monsters</b> automatically summons the Stage Boss (Mano, Stumpy, King Slime, Mushmom, etc.). Toggle <b>AUTO BOSS</b> on the bottom HUD to challenge bosses automatically! Bosses drop guaranteed rare equipment, meso bags, scrolls, and Potential Cubes.</p>
                  <div class="guide-step-chips">
                    <span class="guide-chip accent">Boss Every 25 Kills</span>
                    <span class="guide-chip green">Toggle AUTO BOSS</span>
                    <span class="guide-chip gold">Guaranteed Rare Drops</span>
                    <span class="guide-chip">Potential Cubes</span>
                  </div>
                </div>
              </div>

              <!-- Step 5 -->
              <div class="guide-step-card">
                <div class="guide-step-num">5</div>
                <div class="guide-step-content">
                  <span class="guide-step-title">2nd Job & Star Force Enhancements (Lv. 30)</span>
                  <p class="guide-step-desc">Reach Level 30 for your 2nd Job Advancement. Open Crafting (<b>J</b>) -> <b>Star Force</b> to upgrade weapons and armor up to 15 Stars for tremendous ATT and Stat bonuses. Items <b>never break on failure</b>! Switch to the <b>Cube</b> tab to re-roll potential stats into Rare, Epic, Unique, and Legendary tiers.</p>
                  <div class="guide-step-chips">
                    <span class="guide-chip gold">2nd Job at Lv. 30</span>
                    <span class="guide-chip">Crafting & Stars: Key J</span>
                    <span class="guide-chip accent">15 Star Force Max</span>
                    <span class="guide-chip green">Zero Item Destruction</span>
                  </div>
                </div>
              </div>

              <!-- Step 6 -->
              <div class="guide-step-card">
                <div class="guide-step-num">6</div>
                <div class="guide-step-content">
                  <span class="guide-step-title">3rd Job & Potion Alchemy (Lv. 70)</span>
                  <p class="guide-step-desc">Advance to 3rd Job at Level 70 (Crusader, Priest, Ranger, Hermit, Brawler) to master party buffs and screen-clearing combos. Save mesos by brewing your own White Potions and Mana Elixirs via <b>Alchemy</b> (<b>J</b>) using Snail Shells and Slime Bubbles.</p>
                  <div class="guide-step-chips">
                    <span class="guide-chip gold">3rd Job at Lv. 70</span>
                    <span class="guide-chip">Alchemy: Key J</span>
                    <span class="guide-chip">Free Potions from Drops</span>
                  </div>
                </div>
              </div>

              <!-- Step 7 -->
              <div class="guide-step-card">
                <div class="guide-step-num">7</div>
                <div class="guide-step-content">
                  <span class="guide-step-title">4th Job Ultimates & Endgame Mastery (Lv. 120 - 200)</span>
                  <p class="guide-step-desc">Ascend to 4th Job at Level 120! Unlock legendary screen-clearing ultimates: <b>Genesis</b>, <b>Blizzard</b>, <b>Hurricane</b>, <b>Triple Throw</b>, and <b>Blast</b>. Trade godly weapons on the live player Auction House (<b>H</b>) and conquer elite boss rankings.</p>
                  <div class="guide-step-chips">
                    <span class="guide-chip gold">4th Job at Lv. 120</span>
                    <span class="guide-chip accent">Ultimate Skills</span>
                    <span class="guide-chip">Auction House: Key H</span>
                    <span class="guide-chip green">Online Sync</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">Free-Grid Inventory & Ground Dropping Tips</h3>
            <p class="text-xs text-zinc-300 leading-relaxed"><b>Free Inventory Grid:</b> Click and drag any item to any empty or occupied cell (0 to 31) to organize your bag exactly how you want. Placements persist automatically across sessions.<br>
            <b>Ground Dropping & 10m Despawn:</b> Drag an item out to the game screen or right-click an item and choose <b>Drop on Ground (10m)</b>. Dropped items physically toss onto the floor and stay active for <b>10 full minutes</b> before despawning, allowing easy trading or sharing with party members!</p>
          </div>
        </div>
      `;
    } else if (tab === "overview") {
      contentHtml = `
        <div class="guide-pane">
          <div class="guide-hero">
            <h2 class="text-lg font-black text-amber-400">Welcome to Maple Wayfarer</h2>
            <p class="text-xs text-zinc-300 mt-1 leading-relaxed">Maple Wayfarer is an immersive multiplayer adventure. Venture through Victoria Island, hang out with friends in the Free Market, battle iconic stage bosses, and craft legendary equipment.</p>
          </div>
          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">Keyboard Controls Cheat Sheet</h3>
            <div class="guide-keys-grid">
              <div class="guide-key-row"><span>Move Left / Right</span><b>← → or A / D</b></div>
              <div class="guide-key-row"><span>Jump</span><b>Alt / Space / C</b></div>
              <div class="guide-key-row"><span>Climb & Portals</span><b>↑ ↓ or W / S</b></div>
              <div class="guide-key-row"><span>Basic Attack</span><b>Ctrl or X</b></div>
              <div class="guide-key-row"><span>Loot Drop (Ground Items)</span><b>Z</b></div>
              <div class="guide-key-row"><span>Potions (HP / MP)</span><b>Del / End</b></div>
              <div class="guide-key-row"><span>Auto Battle (Combat & Loot)</span><b>B</b></div>
              <div class="guide-key-row"><span>Character Stats & AP</span><b>S / U</b></div>
              <div class="guide-key-row"><span>Skill Window & SP</span><b>K</b></div>
              <div class="guide-key-row"><span>Equipment Inventory</span><b>E</b></div>
              <div class="guide-key-row"><span>Item Inventory & Bag</span><b>I</b></div>
              <div class="guide-key-row"><span>Crafting & Enhancements</span><b>J</b></div>
              <div class="guide-key-row"><span>Auction House</span><b>H</b></div>
              <div class="guide-key-row"><span>Game Guide & Codex</span><b>G</b></div>
            </div>
          </div>
        </div>
      `;
    } else if (tab === "progression") {
      contentHtml = `
        <div class="guide-pane">
          <div class="guide-hero">
            <h2 class="text-lg font-black text-emerald-400">How to Get Stronger</h2>
            <p class="text-xs text-zinc-300 mt-1 leading-relaxed">Power in Maple Wayfarer comes from leveling, optimal AP distribution, mastering class skills, hunting stage bosses, and Star Force enhancements.</p>
          </div>
          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">1. Ability Point (AP) Allocation</h3>
            <div class="guide-card-grid">
              <div class="guide-card">
                <span class="guide-badge warrior">Warrior</span>
                <p>Prioritize <b>STR</b> for immense melee damage and max HP. Keep just enough DEX for weapon mastery.</p>
              </div>
              <div class="guide-card">
                <span class="guide-badge mage">Magician</span>
                <p>Maximize <b>INT</b> for spell attack and total MP. All mage skills scale directly off INT.</p>
              </div>
              <div class="guide-card">
                <span class="guide-badge bowman">Bowman</span>
                <p>Max <b>DEX</b> for range attack and critical strike rate. Maintain required STR for bow tiers.</p>
              </div>
              <div class="guide-card">
                <span class="guide-badge thief">Thief</span>
                <p>Max <b>LUK</b> for deadly claw throwing and dagger burst attacks. Secondary DEX for gear requirements.</p>
              </div>
              <div class="guide-card">
                <span class="guide-badge pirate">Pirate</span>
                <p><b>STR</b> for Brawlers wielding knuckles; <b>DEX</b> for Gunslingers wielding rapid-fire pistols.</p>
              </div>
            </div>
          </div>
          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">2. Stage Bosses & 4th Job Advancement</h3>
            <p class="text-xs text-zinc-300 leading-relaxed">Defeating <b>25 monsters</b> on any hunting map summons the Stage Boss. Bosses grant guaranteed high EXP, rare gear, scrolls, and Potential Cubes. Complete Job Advancements at levels <b>10, 30, 70, and 120</b> to unlock 4th Job skills like Genesis, Hurricane, and Triple Throw.</p>
          </div>
        </div>
      `;
    } else if (tab === "social") {
      contentHtml = `
        <div class="guide-pane">
          <div class="guide-hero">
            <h2 class="text-lg font-black text-sky-400">Social Map & Free Market</h2>
            <p class="text-xs text-zinc-300 mt-1 leading-relaxed">Connect with adventurers across the world, party up for hunts, and trade in Victoria Island's commercial capital.</p>
          </div>
          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">Free Market (Map 910000000)</h3>
            <p class="text-xs text-zinc-300 leading-relaxed">The Free Market is a peaceful haven with zero monster spawns. Use glowing portals on the left and right to travel directly between the Free Market and hunting grounds in Henesys, Ellinia, Perion, and Kerning City.</p>
          </div>
          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">Auction House ('H') & Trading</h3>
            <p class="text-xs text-zinc-300 leading-relaxed">Press <b>H</b> to open the Auction House. List your crafted equipment, ores, and potions for mesos. All active player listings are synchronized with other adventurers in real-time. Sales incur only a 1% listing fee and 5% completion tax.</p>
          </div>
          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">Ground Item Dropping & Persistence</h3>
            <p class="text-xs text-zinc-300 leading-relaxed">You can drop equipment, potions, and materials onto the ground from your inventory. Dropped items remain on the ground for <b>10 minutes</b> before automatically despawning. Other players can see and pick up your dropped items!</p>
          </div>
        </div>
      `;
    } else if (tab === "enchanting") {
      contentHtml = `
        <div class="guide-pane">
          <div class="guide-hero">
            <h2 class="text-lg font-black text-purple-400">Enchanting & Star Force System</h2>
            <p class="text-xs text-zinc-300 mt-1 leading-relaxed">Upgrade your weapons and armor with Star Force enhancements and reset potential lines with Cubes.</p>
          </div>
          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">Star Force Enhancements (Up to 15 Stars)</h3>
            <p class="text-xs text-zinc-300 leading-relaxed">Open the Crafting window ('J') and select the <b>STAR FORCE</b> tab. Each star grants significant Weapon Attack, Magic Attack, and Stat boosts. Stars 1-10 have high success rates, and items <b>never destroy</b> on failure!</p>
          </div>
          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">Potential Reset & Cubing</h3>
            <p class="text-xs text-zinc-300 leading-relaxed">Use the <b>CUBE</b> tab in the Crafting window. Spend mesos and Slime Bubbles to re-roll potential stats. Potential rarity progresses through:</p>
            <div class="guide-pot-tiers">
              <span class="pot-tag normal">Normal</span>
              <span class="pot-tag rare">Rare (Cyan)</span>
              <span class="pot-tag epic">Epic (Purple)</span>
              <span class="pot-tag unique">Unique (Gold)</span>
              <span class="pot-tag legendary">Legendary (Emerald)</span>
            </div>
            <p class="text-xs text-zinc-400 mt-2">Legendary potential rolls top-tier modifiers: +12% Total ATT, +12% Primary Stat, and +30% Boss Damage!</p>
          </div>
        </div>
      `;
    } else if (tab === "crafting") {
      contentHtml = `
        <div class="guide-pane">
          <div class="guide-hero">
            <h2 class="text-lg font-black text-amber-300">Crafting & Alchemy</h2>
            <p class="text-xs text-zinc-300 mt-1 leading-relaxed">Forge custom weapons, refine ores, and brew powerful consumable potions from monster drops.</p>
          </div>
          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">Blacksmithing (Equipment Crafting)</h3>
            <p class="text-xs text-zinc-300 leading-relaxed">Collect monster ores and boss drops to craft level-appropriate weapons, hats, tops, bottoms, and boots. All crafted gear is guaranteed to roll <b>Rare or higher potential</b> upon creation!</p>
          </div>
          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">Alchemy & Potions</h3>
            <p class="text-xs text-zinc-300 leading-relaxed">Use monster materials to brew potions:</p>
            <ul class="guide-list text-xs text-zinc-300">
              <li><b>Red Potion:</b> Restores 50 HP (requires Snail Shells)</li>
              <li><b>Blue Potion:</b> Restores 100 MP (requires Blue Snail Shells)</li>
              <li><b>White Potion:</b> Restores 300 HP (requires Mushroom Spores)</li>
              <li><b>Mana Elixir:</b> Restores 300 MP (requires Slime Bubbles)</li>
            </ul>
          </div>
          <div class="guide-section mt-3">
            <h3 class="guide-sec-title">Ore Refining</h3>
            <p class="text-xs text-zinc-300 leading-relaxed">Refine 10 raw monster ores (Iron, Bronze, Silver, Mithril, Steel, Gold) into pure ingots for high-level equipment recipes.</p>
          </div>
        </div>
      `;
    }

    body.innerHTML = `
      <div class="guide-header-tabs">${tabButtons}</div>
      <div class="guide-scroll-body">${contentHtml}</div>
    `;
  }

  buildLogs() {
    const box = el("div", "logs hidden", this.hudRoot);
    box.title = "Transient activity log. Click to dismiss.";
    this.logs = box;
  }
  /** Anchors the log above the bottom-right quick slots, panels and AUTO button. */
  layoutLogs(W: number, H: number, qW: number, expH: number, qH: number) {
    const bottomOffset = Math.max(160, expH + qH + 90); // placed well above the quick slots and bottom HUD
    Object.assign(this.logs.style, { right: "12px", left: "auto", top: "auto", bottom: `${bottomOffset}px`, zIndex: "95" });
  }
  /** Pushes a transient message into the bottom-right log; it fades out over time. */
  pushLog(kind: ChatKind, text: string) {
    const line = el("div", `log-line ${kind}`, this.logs);
    line.textContent = text;
    line.dataset.t = String(performance.now());
    this.logs.classList.remove("hidden");
    this.logLines.push(line);
    while (this.logLines.length > 12) {
      const gone = this.logLines.shift();
      gone?.remove();
    }
  }
  renderLogs(_dt: number) {
    if (this.logs.classList.contains("hidden")) return;
    const now = performance.now();
    for (const l of [...this.logLines]) {
      const added = Number(l.dataset.t);
      if (!added) continue;
      const age = (now - added) / 1000; // seconds since insertion
      const fade = Math.max(0, 1 - age / 6); // 6-second lifetime
      l.style.opacity = String(fade);
      if (fade <= 0) {
        const i = this.logLines.indexOf(l);
        if (i >= 0) this.logLines.splice(i, 1);
        l.remove();
      }
    }
    if (!this.logLines.length) this.logs.classList.add("hidden");
  }

  // ------------------------------------------------------------- buff bar
  renderBuffs() {
    const g = this.game;
    const ids = Object.keys(g.buffs);
    const runeDur = g.runeBuff && g.runeBuff.timeLeft > 0 ? Math.ceil(g.runeBuff.timeLeft) : 0;
    const runeKey = runeDur > 0 ? `rune:${g.runeBuff!.type}:${runeDur}` : "";
    const sig = ids.map((id) => `${id}:${Math.ceil(g.buffs[id].left)}`).join("|") + "|" + runeKey;
    if (sig === this.lastBuffs) return;
    this.lastBuffs = sig;
    const existing = new Map([...this.buffBar.children].map((c) => [(c as HTMLElement).dataset.id!, c as HTMLElement]));

    // Clean up expired buffs
    for (const [id, c] of existing) {
      if (id.startsWith("rune_")) {
        if (!g.runeBuff || g.runeBuff.timeLeft <= 0 || id !== `rune_${g.runeBuff.type}`) {
          c.remove();
        }
      } else if (!g.buffs[id]) {
        c.remove();
      }
    }

    // Render standard skill buffs
    for (const id of ids) {
      let c = existing.get(id);
      if (!c) {
        c = el("div", "buff", this.buffBar);
        c.dataset.id = id;
        bg(c, g.skillArt[id]?.icon?.url ?? "");
        el("span", "buff-time", c);
        el("div", "buff-shade", c);
        c.addEventListener("contextmenu", (e) => { e.preventDefault(); delete g.buffs[id]; g.recalc(); g.onChange(); });
        this.bindTip(c, () => `${this.skillTip(id)}<p class="tip-dim">Right-click to cancel</p>`);
      }
      const b = g.buffs[id];
      (c.querySelector(".buff-time") as HTMLElement).textContent = b.left >= 60 ? `${Math.ceil(b.left / 60)}m` : `${Math.ceil(b.left)}`;
      (c.querySelector(".buff-shade") as HTMLElement).style.height = `${(1 - b.left / b.dur) * 100}%`;
    }

    // Render liberated rune as official WZ skill icon
    if (g.runeBuff && g.runeBuff.timeLeft > 0) {
      const runeType = g.runeBuff.type;
      const runeId = `rune_${runeType}`;
      const rDef = RUNE_SKILL_DEFS[runeType];
      let c = existing.get(runeId);
      if (!c) {
        c = el("div", "buff rune-buff", this.buffBar);
        c.dataset.id = runeId;
        bg(c, rDef.iconUrl);
        el("span", "buff-time", c);
        el("div", "buff-shade", c);
        c.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          g.runeBuff = null;
          g.recalc();
          g.onChange();
        });
        this.bindTip(c, () => `
          <div class="tt-head">
            <span class="tt-name" style="color:#c084fc;">${esc(rDef.name)}</span>
          </div>
          <div class="tt-desc" style="font-size:10px;color:#e4e4e7;margin-top:2px;">${esc(rDef.desc)}</div>
          <p class="tip-dim" style="font-size:9px;color:#a1a1aa;margin-top:4px;">Right-click to cancel</p>
        `);
      }
      const left = g.runeBuff.timeLeft;
      const maxDur = 180;
      (c.querySelector(".buff-time") as HTMLElement).textContent = left >= 60 ? `${Math.ceil(left / 60)}m` : `${Math.ceil(left)}`;
      (c.querySelector(".buff-shade") as HTMLElement).style.height = `${(1 - left / maxDur) * 100}%`;
    }
  }

  // ------------------------------------------------------------- MapleStory Guild Window
  buildGuild() {
    this.guildWin = this.makeWindow("guild-win", 610, 580, "GUILD (G)", Math.max(20, Math.round(innerWidth / 2 - 305)), 65);
    el("div", "guild-body", this.guildWin);
    this.guildWin.addEventListener("click", async (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-guildact]");
      if (!t) return;
      const g = this.game;
      const act = t.dataset.guildact;
      const myName = g.stats.name;

      if (act === "tab-members") {
        this.guildTab = "members";
        this.renderGuild();
      } else if (act === "tab-emblem" || act === "tab-settings") {
        this.guildTab = "settings";
        if (g.guild?.emblem) {
          this.guildDraftEmblem = {
            ...g.guild.emblem,
            beamEffect: g.guild.emblem.beamEffect || "gold",
            beamMotion: g.guild.emblem.beamMotion || "rotate",
          };
        }
        this.renderGuild();
      } else if (act === "tab-create") {
        this.guildTab = "create";
        this.renderGuild();
      } else if (act === "tab-directory") {
        this.guildTab = "directory";
        this.renderGuild();
        GuildClient.getGuildList().then((list) => {
          this.guildCachedDirectory = list;
          this.renderGuild();
        });
      } else if (act === "set-bg-shape") {
        this.guildDraftEmblem.bgShape = Number(t.dataset.shapeIdx || 0);
        this.renderGuild();
      } else if (act === "set-sym-shape") {
        this.guildDraftEmblem.symbolShape = Number(t.dataset.shapeIdx || 0);
        this.renderGuild();
      } else if (act === "set-bg-color") {
        this.guildDraftEmblem.bgColor = Number(t.dataset.colorIdx || 0);
        this.renderGuild();
      } else if (act === "set-sym-color") {
        this.guildDraftEmblem.symbolColor = Number(t.dataset.colorIdx || 0);
        this.renderGuild();
      } else if (act === "set-beam-effect") {
        this.guildDraftEmblem.beamEffect = t.dataset.beam || "gold";
        this.renderGuild();
      } else if (act === "set-beam-motion") {
        this.guildDraftEmblem.beamMotion = t.dataset.motion || "rotate";
        this.renderGuild();
      } else if (act === "create-guild") {
        const inp = this.guildWin.querySelector(".guild-create-name-input") as HTMLInputElement;
        const name = (inp?.value || this.guildDraftName || "").trim();
        if (!name) {
          g.onChat("notice", "[Guild] Please enter a guild name.");
          return;
        }
        if (name.length < 2 || name.length > 12) {
          g.onChat("notice", "[Guild] Guild name must be between 2 and 12 characters.");
          return;
        }
        if (g.stats.level < 10) {
          g.onChat("notice", "[Guild] Character must be at least Level 10 to create a guild.");
          return;
        }
        if ((g.stats.meso || 0) < 5000000) {
          g.onChat("notice", "[Guild] Guild registration requires 5,000,000 mesos.");
          return;
        }
        const res = await GuildClient.createGuild(myName, name, this.guildDraftEmblem);
        if (res.ok && res.guild) {
          g.stats.meso -= 5000000;
          g.guild = res.guild;
          g.guildId = res.guild.id;
          g.guildName = res.guild.name;
          g.guildEmblem = res.guild.emblem;
          this.guildDraftName = "";
          g.onChat("notice", `★ Congratulations! Guild [${res.guild.name}] has been created.`);
          this.guildTab = "members";
          this.renderGuild();
          g.onChange();
        } else {
          g.onChat("notice", `[Guild] ${res.error || "Failed to create guild."}`);
        }
      } else if (act === "join-guild") {
        const gid = t.dataset.guildId;
        if (!gid) return;
        const res = await GuildClient.joinGuild(myName, gid, g.stats.level, g.stats.job);
        if (res.ok && res.guild) {
          g.guild = res.guild;
          g.guildId = res.guild.id;
          g.guildName = res.guild.name;
          g.guildEmblem = res.guild.emblem;
          g.onChat("notice", `★ You have joined guild [${res.guild.name}]!`);
          this.guildTab = "members";
          this.renderGuild();
          g.onChange();
        } else {
          g.onChat("notice", `[Guild] ${res.error || "Failed to join guild."}`);
        }
      } else if (act === "leave-guild") {
        if (!g.guild) return;
        if (g.guild.master.toLowerCase() === myName.toLowerCase()) {
          g.onChat("notice", "[Guild] Guild Master cannot leave the guild. Disband or transfer leadership in Settings.");
          return;
        }
        if (!confirm(`Are you sure you want to leave guild [${g.guild.name}]?`)) return;
        const res = await GuildClient.leaveGuild(myName, g.guild.id);
        if (res.ok) {
          g.onChat("notice", `You have left guild [${g.guild.name}].`);
          g.guild = null;
          g.guildId = undefined;
          g.guildName = undefined;
          g.guildEmblem = undefined;
          this.guildTab = "directory";
          this.renderGuild();
          g.onChange();
        } else {
          g.onChat("notice", `[Guild] ${res.error || "Failed to leave guild."}`);
        }
      } else if (act === "disband-guild") {
        if (!g.guild) return;
        if (g.guild.master.toLowerCase() !== myName.toLowerCase()) {
          g.onChat("notice", "[Guild] Only the Guild Master can disband the guild.");
          return;
        }
        if (!confirm(`Are you sure you want to DISBAND guild [${g.guild.name}]? All members will be removed and the guild will be permanently deleted.`)) return;
        const res = await GuildClient.disbandGuild(myName, g.guild.id);
        if (res.ok) {
          g.onChat("notice", `Guild [${g.guild.name}] has been disbanded.`);
          g.guild = null;
          g.guildId = undefined;
          g.guildName = undefined;
          g.guildEmblem = undefined;
          this.guildTab = "directory";
          this.renderGuild();
          g.onChange();
        } else {
          g.onChat("notice", `[Guild] ${res.error || "Failed to disband guild."}`);
        }
      } else if (act === "expel-member") {
        if (!g.guild) return;
        const target = t.dataset.targetName;
        if (!target) return;
        if (!confirm(`Are you sure you want to expel ${target} from the guild?`)) return;
        const res = await GuildClient.expelMember(myName, target, g.guild.id);
        if (res.ok) {
          await g.loadGuild();
          this.renderGuild();
          g.onChat("notice", `[Guild] ${target} has been expelled from the guild.`);
        } else {
          g.onChat("notice", `[Guild] ${res.error || "Failed to expel member."}`);
        }
      } else if (act === "change-rank") {
        if (!g.guild) return;
        const target = t.dataset.targetName;
        const rank = Number(t.dataset.rank) as 1 | 2 | 3 | 4 | 5;
        if (!target || !rank) return;
        const res = await GuildClient.setRank(myName, target, g.guild.id, rank);
        if (res.ok) {
          await g.loadGuild();
          this.renderGuild();
          g.onChat("notice", `[Guild] ${target}'s rank changed to ${g.guild?.ranks[rank - 1] ?? "new rank"}.`);
        } else {
          g.onChat("notice", `[Guild] ${res.error || "Failed to change rank."}`);
        }
      } else if (act === "edit-notice") {
        if (!g.guild) return;
        const newNotice = prompt("Enter new Guild Notice:", g.guild.notice);
        if (newNotice === null) return;
        const res = await GuildClient.updateNotice(myName, g.guild.id, newNotice.trim());
        if (res.ok) {
          await g.loadGuild();
          this.renderGuild();
          g.onChat("notice", `[Guild] Notice updated.`);
        } else {
          g.onChat("notice", `[Guild] ${res.error || "Failed to update notice."}`);
        }
      } else if (act === "save-emblem") {
        if (!g.guild) return;
        const res = await GuildClient.updateEmblem(myName, g.guild.id, this.guildDraftEmblem);
        if (res.ok) {
          clearGuildTagCache();
          g.guild.emblem = { ...this.guildDraftEmblem };
          g.guildEmblem = { ...this.guildDraftEmblem };
          if (g.ws && g.ws.readyState === WebSocket.OPEN) {
            g.ws.send(JSON.stringify({ t: "guild_sync", guildId: g.guild.id, guildName: g.guild.name, guildEmblem: g.guildEmblem }));
          }
          await g.loadGuild();
          this.renderGuild();
          g.onChat("notice", `[Guild] Guild emblem updated.`);
          g.onChange();
        } else {
          g.onChat("notice", `[Guild] ${res.error || "Failed to update emblem."}`);
        }
      } else if (act === "expand-capacity") {
        if (!g.guild) return;
        if ((g.stats.meso || 0) < 1000000) {
          g.onChat("notice", "[Guild] Guild capacity expansion requires 1,000,000 mesos.");
          return;
        }
        const res = await GuildClient.expandCapacity(myName, g.guild.id);
        if (res.ok) {
          g.stats.meso -= 1000000;
          await g.loadGuild();
          this.renderGuild();
          g.onChat("notice", `[Guild] Guild capacity expanded to ${g.guild?.capacity ?? 25} members.`);
          g.onChange();
        } else {
          g.onChat("notice", `[Guild] ${res.error || "Failed to expand capacity."}`);
        }
      } else if (act === "save-ranks") {
        if (!g.guild) return;
        const r1 = (this.guildWin.querySelector(".rank-inp-1") as HTMLInputElement)?.value.trim() || g.guild.ranks[0];
        const r2 = (this.guildWin.querySelector(".rank-inp-2") as HTMLInputElement)?.value.trim() || g.guild.ranks[1];
        const r3 = (this.guildWin.querySelector(".rank-inp-3") as HTMLInputElement)?.value.trim() || g.guild.ranks[2];
        const r4 = (this.guildWin.querySelector(".rank-inp-4") as HTMLInputElement)?.value.trim() || g.guild.ranks[3];
        const r5 = (this.guildWin.querySelector(".rank-inp-5") as HTMLInputElement)?.value.trim() || g.guild.ranks[4];
        const rankArr: [string, string, string, string, string] = [r1, r2, r3, r4, r5];
        const res = await GuildClient.renameRanks(myName, g.guild.id, rankArr);
        if (res.ok) {
          await g.loadGuild();
          this.renderGuild();
          g.onChat("notice", `[Guild] Guild rank titles updated.`);
        } else {
          g.onChat("notice", `[Guild] ${res.error || "Failed to update ranks."}`);
        }
      } else if (act === "refresh-guild") {
        g.loadGuild().then(() => this.renderGuild());
      }
    });

    window.addEventListener("guild-state-changed", () => {
      this.renderGuild();
    });

    window.addEventListener("guild-directory-changed", () => {
      if (this.guildTab === "directory") {
        GuildClient.getGuildList().then((list) => {
          this.guildCachedDirectory = list;
          this.renderGuild();
        });
      }
    });

    this.renderGuild();
  }

  private renderGuildDirectoryRows(inGuildId?: string): string {
    const query = this.guildDirectorySearch.toLowerCase().trim();
    const filtered = (this.guildCachedDirectory || []).filter((gItem) =>
      !query || (gItem.name || "").toLowerCase().includes(query) || (gItem.master || "").toLowerCase().includes(query)
    );
    if (!filtered.length) {
      return `<tr><td colspan="7" class="text-center text-zinc-400 py-6">No guilds found.</td></tr>`;
    }
    return filtered.map((gItem) => {
      const mCount = Array.isArray(gItem.members) ? gItem.members.length : ((gItem as any).memberCount ?? 1);
      const actionCell = inGuildId
        ? (gItem.id === inGuildId ? `<span class="text-emerald-400 font-semibold text-[10px]">Joined</span>` : `<span class="text-zinc-500 text-[10px]">—</span>`)
        : `<button type="button" class="guild-act-btn primary px-2.5 py-0.5 text-[10px]" data-guildact="join-guild" data-guild-id="${gItem.id}">Join</button>`;
      return `
        <tr>
          <td class="w-8 text-center">${renderEmblemSvg(gItem.emblem, 18)}</td>
          <td class="text-white">${esc(gItem.name)}</td>
          <td><span class="guild-level-badge">Lv. ${gItem.level ?? 1}</span></td>
          <td class="text-zinc-300">${esc(gItem.master)}</td>
          <td class="font-mono text-amber-300">${(gItem.gp ?? 0).toLocaleString()} GP</td>
          <td>${mCount} / ${gItem.capacity ?? 20}</td>
          <td class="text-right">${actionCell}</td>
        </tr>
      `;
    }).join("");
  }

  renderGuild() {
    const body = this.guildWin.querySelector(".guild-body") as HTMLElement;
    if (!body) return;
    const g = this.game;
    const myName = g.stats.name;
    const guild = g.guild;

    // If player has a guild
    if (guild) {
      if (this.guildTab === "create") this.guildTab = "members";

      const membersList = Array.isArray(guild.members) ? guild.members : [];
      const myMember = membersList.find((m) => m.name.toLowerCase() === myName.toLowerCase());
      const isMaster = myMember?.rank === 1 || guild.master.toLowerCase() === myName.toLowerCase();
      const isJrMaster = myMember?.rank === 2;
      const canManage = isMaster || isJrMaster;

      const tabs = [
        { id: "members", label: `Members (${membersList.length}/${guild.capacity ?? 20})` },
        { id: "settings", label: "Settings" },
        { id: "directory", label: "Guild Directory" },
      ];

      const tabStrip = tabs.map((t) =>
        `<button type="button" class="guild-tab-btn ${t.id === this.guildTab ? "active" : ""}" data-guildact="tab-${t.id}">${t.label}</button>`
      ).join("");

      let contentHtml = "";

      if (this.guildTab === "members") {
        const sortedMembers = [...membersList].sort((a, b) => a.rank - b.rank || b.contribution - a.contribution);
        const rows = sortedMembers.map((m) => {
          const isSelf = m.name.toLowerCase() === myName.toLowerCase();
          const rankTitle = guild.ranks[m.rank - 1] ?? `Rank ${m.rank}`;
          const isOnline = m.online;

          let actBtns = "";
          if (isMaster && !isSelf) {
            actBtns = `
              <div class="flex items-center gap-1 justify-end">
                ${m.rank > 2 ? `<button type="button" class="guild-act-btn secondary px-1.5 py-0.5 text-[9px]" title="Promote Rank" data-guildact="change-rank" data-target-name="${m.name}" data-rank="${m.rank - 1}">▲</button>` : ""}
                ${m.rank < 5 ? `<button type="button" class="guild-act-btn secondary px-1.5 py-0.5 text-[9px]" title="Demote Rank" data-guildact="change-rank" data-target-name="${m.name}" data-rank="${m.rank + 1}">▼</button>` : ""}
                <button type="button" class="guild-act-btn danger px-1.5 py-0.5 text-[9px]" title="Expel from Guild" data-guildact="expel-member" data-target-name="${m.name}">✕</button>
              </div>
            `;
          } else if (isJrMaster && !isSelf && m.rank > 2) {
            actBtns = `
              <div class="flex items-center gap-1 justify-end">
                <button type="button" class="guild-act-btn danger px-1.5 py-0.5 text-[9px]" title="Expel from Guild" data-guildact="expel-member" data-target-name="${m.name}">✕</button>
              </div>
            `;
          }

          return `
            <tr>
              <td><span class="guild-rank-tag guild-rank-${m.rank}">${esc(rankTitle)}</span></td>
              <td class="${isSelf ? "text-amber-300" : "text-white"}">${esc(m.name)}${isSelf ? " (You)" : ""}</td>
              <td class="text-zinc-300"><span class="guild-level-badge mr-1.5">Lv. ${m.level}</span> ${esc(m.job)}</td>
              <td class="text-amber-300 font-mono">${m.contribution.toLocaleString()} GP</td>
              <td>
                <span class="guild-online-dot ${isOnline ? "online" : "offline"}"></span>
                <span class="${isOnline ? "text-emerald-400" : "text-zinc-500"}">${isOnline ? "Online" : "Offline"}</span>
              </td>
              <td>${actBtns}</td>
            </tr>
          `;
        }).join("");

        contentHtml = `
          <div class="flex-1 flex flex-col overflow-hidden">
            <div class="flex-1 overflow-y-auto">
              <table class="guild-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Level & Job</th>
                    <th>GP</th>
                    <th>Status</th>
                    <th class="text-right">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>
            <div class="guild-btn-row">
              <button type="button" class="guild-act-btn secondary" data-guildact="refresh-guild">↻ Refresh</button>
              <div class="flex-1"></div>
              ${!isMaster ? `<button type="button" class="guild-act-btn secondary text-rose-400 hover:text-rose-300" data-guildact="leave-guild">Leave Guild</button>` : ""}
            </div>
          </div>
        `;
      } else if (this.guildTab === "settings" || this.guildTab === "emblem") {
        const d = this.guildDraftEmblem;

        const bgSwatches = EMBLEM_COLORS.map((c, idx) =>
          `<div class="guild-color-swatch ${d.bgColor === idx ? "selected" : ""}" style="background:${c.hex}" title="${c.name}" data-guildact="set-bg-color" data-color-idx="${idx}"></div>`
        ).join("");

        const symSwatches = EMBLEM_COLORS.map((c, idx) =>
          `<div class="guild-color-swatch ${d.symbolColor === idx ? "selected" : ""}" style="background:${c.hex}" title="${c.name}" data-guildact="set-sym-color" data-color-idx="${idx}"></div>`
        ).join("");

        const bgShapesGrid = WZ_EMBLEM_BGS.map((b, idx) =>
          `<div class="guild-icon-option ${d.bgShape === idx ? "selected" : ""}" data-guildact="set-bg-shape" data-shape-idx="${idx}" title="${b.name}">
            <img src="/wz/guild-emblem?bg=${idx}&bgc=${d.bgColor}&sym=${d.symbolShape}&symc=${d.symbolColor}" alt="${b.name}" class="w-5 h-5 object-contain pixelated pointer-events-none" />
          </div>`
        ).join("");

        const symMarksGrid = WZ_EMBLEM_MARKS.map((m, idx) =>
          `<div class="guild-icon-option ${d.symbolShape === idx ? "selected" : ""}" data-guildact="set-sym-shape" data-shape-idx="${idx}" title="[${m.cat}] ${m.name}">
            <img src="/wz/guild-emblem?bg=${d.bgShape}&bgc=${d.bgColor}&sym=${idx}&symc=${d.symbolColor}" alt="${m.name}" class="w-5 h-5 object-contain pixelated pointer-events-none" />
          </div>`
        ).join("");

        const beamStyle = d.beamEffect || "gold";
        const beamMotion = d.beamMotion || "rotate";

        contentHtml = `
          <div class="flex-1 flex flex-col gap-3 overflow-y-auto p-1">
            <!-- 1. Guild Emblem Editor -->
            <div class="p-3 bg-zinc-900/60 border border-white/10 rounded-lg flex flex-col gap-3">
              <div class="flex items-center justify-between border-b border-white/10 pb-2">
                <div>
                  <h4 class="text-xs text-amber-300 font-bold">Guild Emblem & Nametag Editor</h4>
                  <p class="text-[10px] text-zinc-400">Design your crest with authentic WZ shapes, symbols, and dynamic border beam aura</p>
                </div>
                ${!isMaster ? `<span class="text-[9.5px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-white/10">Master Only</span>` : ""}
              </div>

              <div class="flex gap-3.5">
                <!-- Preview Column -->
                <div class="w-56 flex flex-col items-center justify-center p-3 bg-zinc-950/80 rounded-lg border border-white/10 gap-2 shrink-0 shadow-inner">
                  <span class="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Emblem & Tag Preview</span>
                  <div class="p-2 rounded-lg bg-zinc-900/60 border border-white/5 flex items-center justify-center">
                    ${renderEmblemSvg(d, 52)}
                  </div>

                  <!-- Guild Player Name Tag Stack with Border Beam Effect -->
                  <div class="w-full flex flex-col items-center gap-2 p-3 rounded-md bg-zinc-900/90 border border-white/10 relative overflow-visible shadow-inner">
                    <!-- Character Player Name Tag (Classic MapleStory - Never has beam) -->
                    <div class="player-nametag-wrap">
                      <span class="nametag-text font-bold">${esc(myName)}</span>
                    </div>

                    <!-- Guild Name Tag with Emblem and Dynamic Border Beam -->
                    <div class="flex items-center gap-1.5 overflow-visible">
                      ${renderEmblemSvg(d, 16)}
                      <div class="guild-nametag-stage">
                        <div class="guild-nametag-wrap beam-${beamStyle} mode-${beamMotion}">
                          <div class="guild-beam-bloom"></div>
                          <div class="guild-beam-border"></div>
                          <span class="nametag-text font-semibold">${esc(guild.name)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <span class="text-[9px] text-center text-zinc-400 font-mono">Guild Tag Border Beam</span>

                  <!-- Beam Variant Selector Buttons (8 Color Palettes from libraries.dev/beam) -->
                  <div class="w-full flex flex-col gap-1.5 pt-1.5 border-t border-white/10">
                    <span class="text-[9.5px] text-zinc-400 font-semibold">Border Beam Palette:</span>
                    <div class="grid grid-cols-4 gap-1">
                      <button type="button" class="beam-sel-btn ${beamStyle === "gold" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="gold" title="Gold Prestige">
                        <span class="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-300"></span>
                        <span class="text-[8px]">Gold</span>
                      </button>
                      <button type="button" class="beam-sel-btn ${beamStyle === "ocean" || beamStyle === "cyan" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="ocean" title="Ocean Azure">
                        <span class="w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-300"></span>
                        <span class="text-[8px]">Ocean</span>
                      </button>
                      <button type="button" class="beam-sel-btn ${beamStyle === "colorful" || beamStyle === "rainbow" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="colorful" title="Rainbow Prism">
                        <span class="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-rose-500 via-amber-400 to-sky-400 border border-white"></span>
                        <span class="text-[8px]">Prism</span>
                      </button>
                      <button type="button" class="beam-sel-btn ${beamStyle === "sunset" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="sunset" title="Sunset Flare">
                        <span class="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-red-500 via-orange-400 to-amber-300 border border-orange-300"></span>
                        <span class="text-[8px]">Sunset</span>
                      </button>
                      <button type="button" class="beam-sel-btn ${beamStyle === "forest" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="forest" title="Forest Jade">
                        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-300"></span>
                        <span class="text-[8px]">Forest</span>
                      </button>
                      <button type="button" class="beam-sel-btn ${beamStyle === "candy" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="candy" title="Neon Candy">
                        <span class="w-2.5 h-2.5 rounded-full bg-pink-500 border border-pink-300"></span>
                        <span class="text-[8px]">Candy</span>
                      </button>
                      <button type="button" class="beam-sel-btn ${beamStyle === "ice" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="ice" title="Glacier Frost">
                        <span class="w-2.5 h-2.5 rounded-full bg-cyan-200 border border-cyan-300"></span>
                        <span class="text-[8px]">Ice</span>
                      </button>
                      <button type="button" class="beam-sel-btn ${beamStyle === "purple" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="purple" title="Royal Amethyst">
                        <span class="w-2.5 h-2.5 rounded-full bg-purple-500 border border-purple-300"></span>
                        <span class="text-[8px]">Violet</span>
                      </button>
                    </div>

                    <!-- Beam Motion / Style Selector -->
                    <span class="text-[9.5px] text-zinc-400 font-semibold mt-1">Beam Motion Style:</span>
                    <div class="flex gap-1 w-full">
                      <button type="button" class="motion-sel-btn ${beamMotion === "rotate" ? "selected" : ""}" data-guildact="set-beam-motion" data-motion="rotate" title="Orbiting border beam sweep">
                        Orbit
                      </button>
                      <button type="button" class="motion-sel-btn ${beamMotion === "pulse" ? "selected" : ""}" data-guildact="set-beam-motion" data-motion="pulse" title="Breathing outward halo pulse">
                        Pulse
                      </button>
                      <button type="button" class="motion-sel-btn ${beamMotion === "line" ? "selected" : ""}" data-guildact="set-beam-motion" data-motion="line" title="Traveling laser streak">
                        Streak
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Editor Grid Column -->
                <div class="flex-1 flex flex-col gap-2.5 min-w-0">
                  <div>
                    <label class="block text-[11px] text-zinc-300 mb-1">
                      Background Shape: <span class="text-amber-300 font-semibold">${WZ_EMBLEM_BGS[d.bgShape]?.name ?? "None"}</span>
                    </label>
                    <div class="guild-icon-grid">${bgShapesGrid}</div>
                  </div>
                  <div>
                    <label class="block text-[11px] text-zinc-300 mb-1">
                      Background Color: <span class="text-amber-300 font-semibold">${EMBLEM_COLORS[d.bgColor]?.name ?? ""}</span>
                    </label>
                    <div class="guild-color-grid">${bgSwatches}</div>
                  </div>
                  <div>
                    <label class="block text-[11px] text-zinc-300 mb-1">
                      Symbol Icon: <span class="text-amber-300 font-semibold">${WZ_EMBLEM_MARKS[d.symbolShape]?.name ?? "None"}</span>
                    </label>
                    <div class="guild-icon-grid">${symMarksGrid}</div>
                  </div>
                  <div>
                    <label class="block text-[11px] text-zinc-300 mb-1">
                      Symbol Color: <span class="text-amber-300 font-semibold">${EMBLEM_COLORS[d.symbolColor]?.name ?? ""}</span>
                    </label>
                    <div class="guild-color-grid">${symSwatches}</div>
                  </div>
                  <div class="pt-2">
                    <button type="button" class="guild-act-btn primary w-full py-1.5" data-guildact="save-emblem" ${!isMaster ? "disabled title='Only Guild Master can change emblem'" : ""}>
                      Save Guild Emblem
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 2. Expand Guild Capacity -->
            <div class="p-3 bg-zinc-900/60 border border-white/10 rounded-lg flex items-center justify-between gap-3">
              <div>
                <h4 class="text-xs text-amber-300 font-bold mb-0.5">Expand Guild Capacity</h4>
                <p class="text-[11px] text-zinc-400">
                  Current: <span class="text-white">${guild.capacity} Members</span> (Max 100) · Cost: <span class="text-amber-300 font-mono">1,000,000 Mesos</span>
                </p>
              </div>
              <button type="button" class="guild-act-btn primary shrink-0" data-guildact="expand-capacity" ${!isMaster ? "disabled title='Only Guild Master can expand capacity'" : ""}>Expand (+5)</button>
            </div>

            <!-- 3. Customize Rank Titles -->
            <div class="p-3 bg-zinc-900/60 border border-white/10 rounded-lg">
              <h4 class="text-xs text-amber-300 font-bold mb-2">Customize Rank Titles</h4>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label class="block text-[10px] text-zinc-400 mb-0.5">Rank 1 (Guild Master)</label>
                  <input type="text" class="rank-inp-1 w-full bg-zinc-950 border border-white/20 rounded px-2 py-1 text-xs text-white" value="${esc(guild.ranks[0])}" ${!isMaster ? "disabled" : ""} />
                </div>
                <div>
                  <label class="block text-[10px] text-zinc-400 mb-0.5">Rank 2 (Jr. Master)</label>
                  <input type="text" class="rank-inp-2 w-full bg-zinc-950 border border-white/20 rounded px-2 py-1 text-xs text-white" value="${esc(guild.ranks[1])}" ${!isMaster ? "disabled" : ""} />
                </div>
                <div>
                  <label class="block text-[10px] text-zinc-400 mb-0.5">Rank 3</label>
                  <input type="text" class="rank-inp-3 w-full bg-zinc-950 border border-white/20 rounded px-2 py-1 text-xs text-white" value="${esc(guild.ranks[2])}" ${!isMaster ? "disabled" : ""} />
                </div>
                <div>
                  <label class="block text-[10px] text-zinc-400 mb-0.5">Rank 4</label>
                  <input type="text" class="rank-inp-4 w-full bg-zinc-950 border border-white/20 rounded px-2 py-1 text-xs text-white" value="${esc(guild.ranks[3])}" ${!isMaster ? "disabled" : ""} />
                </div>
                <div>
                  <label class="block text-[10px] text-zinc-400 mb-0.5">Rank 5</label>
                  <input type="text" class="rank-inp-5 w-full bg-zinc-950 border border-white/20 rounded px-2 py-1 text-xs text-white" value="${esc(guild.ranks[4])}" ${!isMaster ? "disabled" : ""} />
                </div>
              </div>
              <button type="button" class="guild-act-btn primary mt-3" data-guildact="save-ranks" ${!isMaster ? "disabled title='Only Guild Master can change rank titles'" : ""}>Save Rank Titles</button>
            </div>

            <!-- 4. Danger Zone: Disband Guild (Owner Only) -->
            ${
              isMaster
                ? `
                  <div class="p-3 bg-rose-950/30 border border-rose-500/40 rounded-lg flex items-center justify-between gap-3 mt-1">
                    <div>
                      <h4 class="text-xs text-rose-400 font-bold mb-0.5">Disband Guild</h4>
                      <p class="text-[11px] text-zinc-300">
                        Permanently disband <span class="text-white font-semibold">${esc(guild.name)}</span>. All members will be removed and guild progress will be deleted.
                      </p>
                    </div>
                    <button type="button" class="guild-act-btn danger shrink-0 px-3 py-1.5 font-bold" data-guildact="disband-guild">Disband Guild</button>
                  </div>
                `
                : `
                  <div class="p-3 bg-zinc-900/40 border border-white/5 rounded-lg flex items-center justify-between gap-3 opacity-60 mt-1">
                    <div>
                      <h4 class="text-xs text-zinc-400 mb-0.5">Disband Guild</h4>
                      <p class="text-[11px] text-zinc-500">Only the Guild Master (${esc(guild.master)}) can disband this guild.</p>
                    </div>
                    <button type="button" class="guild-act-btn secondary shrink-0 px-3 py-1.5 cursor-not-allowed" disabled>Master Only</button>
                  </div>
                `
            }
          </div>
        `;
      } else if (this.guildTab === "directory") {
        contentHtml = `
          <div class="flex-1 flex flex-col overflow-hidden">
            <div class="mb-2">
              <input type="text" placeholder="Search guilds by name or master..." class="guild-dir-search-input w-full bg-zinc-950 border border-white/20 rounded px-2.5 py-1 text-xs text-white" value="${esc(this.guildDirectorySearch)}" />
            </div>
            <div class="flex-1 overflow-y-auto">
              <table class="guild-table">
                <thead>
                  <tr>
                    <th>Emblem</th>
                    <th>Guild Name</th>
                    <th>Level</th>
                    <th>Master</th>
                    <th>GP</th>
                    <th>Members</th>
                    <th class="text-right">Status</th>
                  </tr>
                </thead>
                <tbody class="guild-dir-tbody">
                  ${this.renderGuildDirectoryRows(guild.id)}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      body.innerHTML = `
        <div class="guild-header-card">
          <div class="guild-emblem-outside">
            ${renderEmblemSvg(guild.emblem, 32)}
          </div>
          <div class="guild-info-meta">
            <div class="guild-title-row">
              <span class="guild-name">${esc(guild.name)}</span>
              <span class="guild-level-badge">Lv. ${guild.level}</span>
            </div>
            <div class="guild-sub-meta">
              <span>Master: <span class="text-white">${esc(guild.master)}</span></span>
              <span>GP: <span class="text-amber-300 font-mono">${(guild.gp ?? 0).toLocaleString()}</span></span>
              <span>Members: <span class="text-white">${membersList.length} / ${guild.capacity ?? 20}</span></span>
            </div>
          </div>
        </div>

        <div class="guild-notice-banner">
          <span class="text-[10px] text-emerald-400 uppercase tracking-wide">Notice:</span>
          <span class="guild-notice-text flex-1">"${esc(guild.notice || "No notice set.")}"</span>
          ${canManage ? `<button type="button" class="guild-act-btn secondary px-2 py-0.5 text-[10px]" data-guildact="edit-notice">Edit</button>` : ""}
        </div>

        <div class="guild-tab-strip">
          ${tabStrip}
        </div>

        <div class="guild-content-pane">
          ${contentHtml}
        </div>
      `;

    } else {
      // Player is NOT in a guild
      if (this.guildTab !== "create" && this.guildTab !== "directory") {
        this.guildTab = "create";
      }
      const tabs = [
        { id: "create", label: "Found Guild" },
        { id: "directory", label: "Guild Directory" },
      ];

      const tabStrip = tabs.map((t) =>
        `<button type="button" class="guild-tab-btn ${t.id === this.guildTab ? "active" : ""}" data-guildact="tab-${t.id}">${t.label}</button>`
      ).join("");

      let contentHtml = "";

      if (this.guildTab === "create") {
        const d = this.guildDraftEmblem;

        const bgSwatches = EMBLEM_COLORS.map((c, idx) =>
          `<div class="guild-color-swatch ${d.bgColor === idx ? "selected" : ""}" style="background:${c.hex}" title="${c.name}" data-guildact="set-bg-color" data-color-idx="${idx}"></div>`
        ).join("");

        const symSwatches = EMBLEM_COLORS.map((c, idx) =>
          `<div class="guild-color-swatch ${d.symbolColor === idx ? "selected" : ""}" style="background:${c.hex}" title="${c.name}" data-guildact="set-sym-color" data-color-idx="${idx}"></div>`
        ).join("");

        const bgShapesGrid = WZ_EMBLEM_BGS.map((b, idx) =>
          `<div class="guild-icon-option ${d.bgShape === idx ? "selected" : ""}" data-guildact="set-bg-shape" data-shape-idx="${idx}" title="${b.name}">
            <img src="/wz/guild-emblem?bg=${idx}&bgc=${d.bgColor}&sym=${d.symbolShape}&symc=${d.symbolColor}" alt="${b.name}" class="w-5 h-5 object-contain pixelated pointer-events-none" />
          </div>`
        ).join("");

        const symMarksGrid = WZ_EMBLEM_MARKS.map((m, idx) =>
          `<div class="guild-icon-option ${d.symbolShape === idx ? "selected" : ""}" data-guildact="set-sym-shape" data-shape-idx="${idx}" title="[${m.cat}] ${m.name}">
            <img src="/wz/guild-emblem?bg=${d.bgShape}&bgc=${d.bgColor}&sym=${idx}&symc=${d.symbolColor}" alt="${m.name}" class="w-5 h-5 object-contain pixelated pointer-events-none" />
          </div>`
        ).join("");

        const hasMeso = (g.stats.meso || 0) >= 5000000;
        const hasLevel = (g.stats.level || 1) >= 10;
        const previewGuildName = this.guildDraftName.trim() || "GuildName";
        const beamStyle = d.beamEffect || "gold";
        const beamMotion = d.beamMotion || "rotate";

        contentHtml = `
          <div class="flex-1 flex flex-col gap-2.5 overflow-y-auto p-1">
            <div class="p-2.5 bg-zinc-900/70 border border-white/10 rounded-lg flex items-center justify-between gap-2">
              <div class="text-xs text-zinc-300">Found your own guild & custom 16x16 crest</div>
              <div class="flex gap-3 text-[11px] shrink-0">
                <span class="${hasLevel ? "text-emerald-400" : "text-rose-400"}">Lv. ${g.stats.level}/10</span>
                <span class="${hasMeso ? "text-emerald-400" : "text-rose-400"}">5,000,000 Mesos</span>
              </div>
            </div>

            <div class="flex gap-3.5 flex-1">
              <!-- Preview Column -->
              <div class="w-56 flex flex-col items-center justify-center p-3 bg-zinc-950/80 rounded-lg border border-white/10 gap-2 shrink-0 shadow-inner">
                <span class="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Emblem & Tag Preview</span>
                <div class="p-2 rounded-lg bg-zinc-900/60 border border-white/5 flex items-center justify-center">
                  ${renderEmblemSvg(d, 52)}
                </div>

                <!-- Guild Player Name Tag Stack with Border Beam Effect -->
                <div class="w-full flex flex-col items-center gap-2 p-3 rounded-md bg-zinc-900/90 border border-white/10 relative overflow-visible shadow-inner">
                  <!-- Character Player Name Tag (Classic MapleStory - Never has beam) -->
                  <div class="player-nametag-wrap">
                    <span class="nametag-text font-bold">${esc(myName)}</span>
                  </div>

                  <!-- Guild Name Tag with Emblem and Dynamic Border Beam -->
                  <div class="flex items-center gap-1.5 overflow-visible">
                    ${renderEmblemSvg(d, 16)}
                    <div class="guild-nametag-stage">
                      <div class="guild-nametag-wrap beam-${beamStyle} mode-${beamMotion}">
                        <div class="guild-beam-bloom"></div>
                        <div class="guild-beam-border"></div>
                        <span class="nametag-text font-semibold guild-live-preview-name">${esc(previewGuildName)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <span class="text-[9px] text-center text-zinc-400 font-mono">Guild Tag Border Beam</span>

                <!-- Beam Variant Selector Buttons (8 Color Palettes from libraries.dev/beam) -->
                <div class="w-full flex flex-col gap-1.5 pt-1.5 border-t border-white/10">
                  <span class="text-[9.5px] text-zinc-400 font-semibold">Border Beam Palette:</span>
                  <div class="grid grid-cols-4 gap-1">
                    <button type="button" class="beam-sel-btn ${beamStyle === "gold" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="gold" title="Gold Prestige">
                      <span class="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-300"></span>
                      <span class="text-[8px]">Gold</span>
                    </button>
                    <button type="button" class="beam-sel-btn ${beamStyle === "ocean" || beamStyle === "cyan" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="ocean" title="Ocean Azure">
                      <span class="w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-300"></span>
                      <span class="text-[8px]">Ocean</span>
                    </button>
                    <button type="button" class="beam-sel-btn ${beamStyle === "colorful" || beamStyle === "rainbow" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="colorful" title="Rainbow Prism">
                      <span class="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-rose-500 via-amber-400 to-sky-400 border border-white"></span>
                      <span class="text-[8px]">Prism</span>
                    </button>
                    <button type="button" class="beam-sel-btn ${beamStyle === "sunset" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="sunset" title="Sunset Flare">
                      <span class="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-red-500 via-orange-400 to-amber-300 border border-orange-300"></span>
                      <span class="text-[8px]">Sunset</span>
                    </button>
                    <button type="button" class="beam-sel-btn ${beamStyle === "forest" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="forest" title="Forest Jade">
                      <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-300"></span>
                      <span class="text-[8px]">Forest</span>
                    </button>
                    <button type="button" class="beam-sel-btn ${beamStyle === "candy" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="candy" title="Neon Candy">
                      <span class="w-2.5 h-2.5 rounded-full bg-pink-500 border border-pink-300"></span>
                      <span class="text-[8px]">Candy</span>
                    </button>
                    <button type="button" class="beam-sel-btn ${beamStyle === "ice" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="ice" title="Glacier Frost">
                      <span class="w-2.5 h-2.5 rounded-full bg-cyan-200 border border-cyan-300"></span>
                      <span class="text-[8px]">Ice</span>
                    </button>
                    <button type="button" class="beam-sel-btn ${beamStyle === "purple" ? "selected" : ""}" data-guildact="set-beam-effect" data-beam="purple" title="Imperial Amethyst">
                      <span class="w-2.5 h-2.5 rounded-full bg-purple-500 border border-purple-300"></span>
                      <span class="text-[8px]">Violet</span>
                    </button>
                  </div>

                  <!-- Beam Motion / Style Selector -->
                  <span class="text-[9.5px] text-zinc-400 font-semibold mt-1">Beam Motion Style:</span>
                  <div class="flex gap-1 w-full">
                    <button type="button" class="motion-sel-btn ${beamMotion === "rotate" ? "selected" : ""}" data-guildact="set-beam-motion" data-motion="rotate" title="Orbiting border beam sweep">
                      Orbit
                    </button>
                    <button type="button" class="motion-sel-btn ${beamMotion === "pulse" ? "selected" : ""}" data-guildact="set-beam-motion" data-motion="pulse" title="Breathing outward halo pulse">
                      Pulse
                    </button>
                    <button type="button" class="motion-sel-btn ${beamMotion === "line" ? "selected" : ""}" data-guildact="set-beam-motion" data-motion="line" title="Traveling laser streak">
                      Streak
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex-1 flex flex-col gap-2 min-w-0">
                <div>
                  <label class="block text-[11px] text-zinc-300 mb-0.5">Guild Name</label>
                  <input type="text" class="guild-create-name-input w-full bg-zinc-950 border border-white/20 rounded px-2.5 py-1 text-xs text-white" placeholder="2-12 letters (e.g. MapleHeroes)" maxlength="12" value="${esc(this.guildDraftName)}" />
                </div>
                <div>
                  <label class="block text-[11px] text-zinc-300 mb-1">
                    Background Shape: <span class="text-amber-300 font-semibold">${WZ_EMBLEM_BGS[d.bgShape]?.name ?? "None"}</span>
                  </label>
                  <div class="guild-icon-grid">${bgShapesGrid}</div>
                </div>
                <div>
                  <label class="block text-[11px] text-zinc-300 mb-1">
                    Background Color: <span class="text-amber-300 font-semibold">${EMBLEM_COLORS[d.bgColor]?.name ?? ""}</span>
                  </label>
                  <div class="guild-color-grid">${bgSwatches}</div>
                </div>
                <div>
                  <label class="block text-[11px] text-zinc-300 mb-1">
                    Symbol Icon: <span class="text-amber-300 font-semibold">${WZ_EMBLEM_MARKS[d.symbolShape]?.name ?? "None"}</span>
                  </label>
                  <div class="guild-icon-grid">${symMarksGrid}</div>
                </div>
                <div>
                  <label class="block text-[11px] text-zinc-300 mb-1">
                    Symbol Color: <span class="text-amber-300 font-semibold">${EMBLEM_COLORS[d.symbolColor]?.name ?? ""}</span>
                  </label>
                  <div class="guild-color-grid">${symSwatches}</div>
                </div>
              </div>
            </div>

            <div class="guild-btn-row mt-auto">
              <button type="button" class="guild-act-btn primary flex-1 py-1.5 text-xs" data-guildact="create-guild">Found Guild (5,000,000 Mesos)</button>
            </div>
          </div>
        `;
      } else {
        contentHtml = `
          <div class="flex-1 flex flex-col overflow-hidden">
            <div class="mb-2">
              <input type="text" placeholder="Search guilds by name or master..." class="guild-dir-search-input w-full bg-zinc-950 border border-white/20 rounded px-2.5 py-1 text-xs text-white" value="${esc(this.guildDirectorySearch)}" />
            </div>
            <div class="flex-1 overflow-y-auto">
              <table class="guild-table">
                <thead>
                  <tr>
                    <th>Emblem</th>
                    <th>Guild Name</th>
                    <th>Level</th>
                    <th>Master</th>
                    <th>GP</th>
                    <th>Members</th>
                    <th class="text-right">Action</th>
                  </tr>
                </thead>
                <tbody class="guild-dir-tbody">
                  ${this.renderGuildDirectoryRows(undefined)}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      body.innerHTML = `
        <div class="guild-header-card">
          <div class="guild-emblem-outside">
            ${renderEmblemSvg(this.guildDraftEmblem, 32)}
          </div>
          <div class="guild-info-meta">
            <div class="guild-title-row">
              <span class="guild-name">Guild Registry</span>
            </div>
            <div class="guild-sub-meta">
              <span>You are currently not in a guild. Found a new guild or join an existing one below.</span>
            </div>
          </div>
        </div>

        <div class="guild-tab-strip">
          ${tabStrip}
        </div>

        <div class="guild-content-pane">
          ${contentHtml}
        </div>
      `;
    }

    const nameInp = body.querySelector<HTMLInputElement>(".guild-create-name-input");
    if (nameInp) {
      nameInp.addEventListener("input", () => {
        this.guildDraftName = nameInp.value;
        const previewEl = body.querySelector<HTMLElement>(".guild-live-preview-name");
        if (previewEl) previewEl.textContent = this.guildDraftName.trim() || "GuildName";
      });
    }

    const shapeSel = body.querySelector<HTMLSelectElement>(".guild-shape-select");
    if (shapeSel) {
      shapeSel.addEventListener("change", () => {
        this.guildDraftEmblem.bgShape = Number(shapeSel.value || 0);
        this.renderGuild();
      });
    }

    const symSel = body.querySelector<HTMLSelectElement>(".guild-symbol-select");
    if (symSel) {
      symSel.addEventListener("change", () => {
        this.guildDraftEmblem.symbolShape = Number(symSel.value || 0);
        this.renderGuild();
      });
    }

    const dirSearchInp = body.querySelector<HTMLInputElement>(".guild-dir-search-input");
    if (dirSearchInp) {
      dirSearchInp.addEventListener("input", () => {
        this.guildDirectorySearch = dirSearchInp.value;
        const tbody = body.querySelector<HTMLElement>(".guild-dir-tbody");
        if (tbody) tbody.innerHTML = this.renderGuildDirectoryRows(guild?.id);
      });
    }
  }

  // ------------------------------------------------------------- MapleStory Party Window
  buildParty() {
    this.partyWin = this.makeWindow("party-win", 370, 430, "PARTY (P)", Math.max(20, Math.round(innerWidth / 2 - 185)), 75);
    el("div", "party-body", this.partyWin);
    this.partyWin.addEventListener("click", async (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-partyact]");
      if (!t) return;
      const g = this.game;
      const act = t.dataset.partyact;
      const myName = g.stats.name;

      if (act === "create-party") {
        const res = await PartyClient.createParty(
          myName,
          g.stats.level,
          g.stats.job,
          g.map?.id || 910000000,
          g.stats.hp,
          g.stats.maxHp,
          g.look,
          g.stats.mp,
          g.stats.maxMp
        );
        if (res.ok && res.party) {
          g.party = res.party;
          g.partyId = res.party.id;
          g.onChat("notice", "★ Party created! Invite friends or hunt together.");
          this.renderParty();
          g.onChange();
        } else {
          alert(res.error || "Failed to create party.");
        }
      } else if (act === "join-party") {
        const inp = this.partyWin.querySelector(".party-join-id-inp") as HTMLInputElement;
        const pid = (inp?.value || "").trim().toUpperCase();
        if (!pid) {
          alert("Please enter a Party ID.");
          return;
        }
        const res = await PartyClient.join(
          pid,
          myName,
          g.stats.level,
          g.stats.job,
          g.map?.id || 910000000,
          g.stats.hp,
          g.stats.maxHp,
          g.look,
          g.stats.mp,
          g.stats.maxMp
        );
        if (res.ok && res.party) {
          g.party = res.party;
          g.partyId = res.party.id;
          g.onChat("notice", `★ Joined party [${res.party.id}]!`);
          this.renderParty();
          g.onChange();
        } else {
          alert(res.error || "Failed to join party.");
        }
      } else if (act === "invite-member") {
        if (!g.partyId) return;
        const inp = this.partyWin.querySelector(".party-invite-name-inp") as HTMLInputElement;
        const target = (inp?.value || "").trim();
        if (!target) {
          alert("Please enter a character name to invite.");
          return;
        }
        const res = await PartyClient.invite(g.partyId, myName, target);
        if (res.ok) {
          g.onChat("notice", `[Party] Invitation sent to ${target}.`);
          if (inp) inp.value = "";
        } else {
          alert(res.error || "Failed to send party invite.");
        }
      } else if (act === "leave-party") {
        if (!confirm("Are you sure you want to leave the party?")) return;
        const res = await PartyClient.leave(myName);
        if (res.ok) {
          g.party = null;
          g.partyId = undefined;
          g.onChat("notice", "[Party] You left the party.");
          this.renderParty();
          g.onChange();
        } else {
          alert(res.error || "Failed to leave party.");
        }
      } else if (act === "disband-party") {
        if (!confirm("Are you sure you want to disband the party? All members will be removed.")) return;
        const res = await PartyClient.disband(myName);
        if (res.ok) {
          g.party = null;
          g.partyId = undefined;
          g.onChat("notice", "[Party] The party has been disbanded.");
          this.renderParty();
          g.onChange();
        } else {
          alert(res.error || "Failed to disband party.");
        }
      } else if (act === "pass-leader") {
        const target = t.dataset.targetName;
        if (!target) return;
        if (!confirm(`Transfer party leadership to ${target}?`)) return;
        const res = await PartyClient.passLeader(myName, target);
        if (res.ok && res.party) {
          g.party = res.party;
          g.onChat("notice", `[Party] Transferred leadership to ${target}.`);
          this.renderParty();
          g.onChange();
        } else {
          alert(res.error || "Failed to transfer leadership.");
        }
      } else if (act === "expel-member") {
        const target = t.dataset.targetName;
        if (!target) return;
        if (!confirm(`Expel ${target} from the party?`)) return;
        const res = await PartyClient.expel(myName, target);
        if (res.ok && res.party) {
          g.party = res.party;
          g.onChat("notice", `[Party] Expelled ${target} from the party.`);
          this.renderParty();
          g.onChange();
        } else {
          alert(res.error || "Failed to expel member.");
        }
      } else if (act === "refresh-party") {
        await g.loadParty();
        this.renderParty();
      } else if (act === "copy-party-id") {
        if (g.partyId) {
          try {
            await navigator.clipboard.writeText(g.partyId);
            g.onChat("notice", `[Party] Copied Party ID: ${g.partyId}`);
          } catch {
            prompt("Party ID:", g.partyId);
          }
        }
      } else if (act === "warp-party-member") {
        const targetMap = Number(t.dataset.mapId);
        if (!targetMap) return;
        if (g.map?.id !== targetMap) {
          await g.loadMap(targetMap, "spawn");
          g.onChat("notice", `[Party] Traveled to party member map.`);
        } else {
          g.onChat("notice", `[Party] You are already on the same map.`);
        }
      }
    });

    window.addEventListener("party-state-changed", () => {
      this.renderParty();
    });

    this.renderParty();
  }

  renderParty() {
    const body = this.partyWin?.querySelector(".party-body") as HTMLElement;
    if (!body) return;
    const g = this.game;
    const myName = g.stats.name;
    const party = g.party;

    if (!party) {
      body.innerHTML = `
        <div class="p-3 flex flex-col gap-2.5 text-zinc-200">
          <div class="p-2.5 bg-white/[0.04] border border-white/10 rounded flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 flex-shrink-0">
              ${lucideIcon("users", 15)}
            </div>
            <div class="min-w-0">
              <h3 class="text-xs font-bold text-white">No Party Joined</h3>
              <p class="text-[10px] text-zinc-400 leading-tight">Hunt together and share bonus EXP on the same map.</p>
            </div>
          </div>

          <div class="p-2.5 bg-white/[0.02] border border-white/10 rounded flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold text-amber-300">Create Party</span>
              <span class="text-[9.5px] text-zinc-400">Up to 6 members</span>
            </div>
            <button type="button" class="guild-act-btn primary py-1 text-xs font-bold w-full" data-partyact="create-party">
              Create New Party
            </button>
          </div>

          <div class="p-2.5 bg-white/[0.02] border border-white/10 rounded flex flex-col gap-1.5">
            <span class="text-[11px] font-bold text-sky-300">Join by Party ID</span>
            <div class="flex items-center gap-1.5">
              <input type="text" placeholder="Enter ID (e.g. PT-1234)..." class="party-join-id-inp flex-1 bg-zinc-950 border border-white/20 rounded px-2 py-1 text-xs text-white uppercase font-mono placeholder:normal-case placeholder:text-zinc-500" />
              <button type="button" class="guild-act-btn secondary px-3 py-1 text-xs font-bold" data-partyact="join-party">Join</button>
            </div>
          </div>

          <div class="p-2 bg-indigo-950/25 border border-indigo-500/20 rounded text-[10px] text-zinc-300 flex flex-col gap-1 leading-snug">
            <div class="font-bold text-indigo-300 flex items-center gap-1">
              ${lucideIcon("sparkles", 11)}
              <span>Party Perks</span>
            </div>
            <div>• <strong>50% Shared Bonus EXP:</strong> Slaying mobs grants a 50% EXP share to all same-map party members!</div>
            <div>• Real-time dual HP/MP meters and 1-click map warp.</div>
            <div>• Dedicated Party Chat channel (<span class="font-mono text-indigo-200">/p</span>).</div>
          </div>
        </div>
      `;
      return;
    }

    const isLeader = party.leaderName.toLowerCase() === myName.toLowerCase();
    const membersList = Array.isArray(party.members) ? party.members : [];
    const myMapId = g.map?.id || 910000000;

    const MAP_NAMES_LOCAL: Record<number, string> = {
      910000000: "Free Market",
      100010000: "Henesys Hunting",
      100020000: "Henesys Market",
      100000000: "Henesys Town",
      101000000: "Ellinia",
      102000000: "Perion",
      103000000: "Kerning City",
      104000000: "Lith Harbor",
      105040300: "Sleepywood",
    };

    const memberCards = membersList.map((m) => {
      const isSelf = m.name.toLowerCase() === myName.toLowerCase();
      const isMemLeader = m.isLeader || m.name.toLowerCase() === party.leaderName.toLowerCase();
      const remoteMatch = [...this.game.remotePlayers.values()].find(
        (rp) => (rp.name || "").toLowerCase() === m.name.toLowerCase()
      );
      const isOnline = isSelf || Boolean(remoteMatch) || Boolean(m.online);
      const inSameMap = isSelf || Boolean(remoteMatch) || (isOnline && (m.mapId || 910000000) === myMapId);
      const isGrayed = !isOnline || !inSameMap;
      const mapName = !isOnline
        ? "Offline"
        : (MAP_NAMES_LOCAL[m.mapId || 910000000] || `Map ${m.mapId || 910000000}`);
      const curHp = isSelf ? this.game.stats.hp : (remoteMatch?.hp ?? m.hp ?? 50);
      const maxHp = isSelf ? this.game.stats.maxHp : (remoteMatch?.maxHp ?? m.maxHp ?? 50);
      const hpPct = !isOnline ? 0 : Math.max(0, Math.min(100, Math.round((curHp / Math.max(1, maxHp)) * 100)));
      const maxMpVal = isSelf ? this.game.stats.maxMp : (remoteMatch?.maxMp ?? m.maxMp ?? 50);
      const mpVal = isSelf ? this.game.stats.mp : (remoteMatch?.mp ?? m.mp ?? maxMpVal);
      const mpPct = !isOnline ? 0 : Math.max(0, Math.min(100, Math.round((mpVal / Math.max(1, maxMpVal)) * 100)));
      const avatarUrl = `/wz/char?eq=${(m.look || [2000, 12000, 20000, 30030]).join(",")}&action=stand1&frame=0&portrait=1`;

      return `
        <div class="${isGrayed ? "bg-zinc-950/60 opacity-55" : "bg-white/[0.04] hover:bg-white/[0.07]"} border border-white/10 rounded p-1.5 transition-colors flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <div class="relative w-8 h-8 rounded-full bg-zinc-900 border border-white/15 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-inner ${isGrayed ? "grayscale" : ""}">
              <img src="${avatarUrl}" class="w-full h-full object-cover image-rendering-pixelated scale-105" alt="${esc(m.name)}" onerror="this.src='/wz/sprite/Mob/0100100/stand/0'" />
              ${isMemLeader ? `<span class="absolute top-0 right-0 p-0.5 bg-amber-500/80 rounded-bl text-amber-200" title="Party Leader">${lucideIcon("crown", 8)}</span>` : ""}
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full ${!isOnline ? "bg-zinc-600" : isGrayed ? "bg-zinc-400" : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"} flex-shrink-0" title="${!isOnline ? "Offline" : inSameMap ? "Online (Same Map)" : "Online (Other Map)"}"></span>
                <span class="font-bold text-[11px] ${isGrayed ? "text-zinc-400" : "text-white"} truncate">${esc(m.name)}</span>
                ${isSelf ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[7.5px] border border-amber-500/30">YOU</span>` : ""}
                ${isMemLeader ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[7.5px] border border-amber-500/30">LEADER</span>` : ""}
              </div>
              <div class="flex items-center gap-1.5 text-[9px] text-zinc-400 leading-tight">
                <span class="inline-flex items-center px-1.5 py-0.5 rounded-full ${isGrayed ? "bg-zinc-800 text-zinc-500 border-zinc-700" : "bg-amber-400/20 text-amber-300 border-amber-400/35"} border font-mono text-[8px] font-bold">Lv. ${m.level ?? 1}</span>
                <span class="truncate">${esc(m.job || "Beginner")}</span>
                <span class="${!isOnline ? "text-zinc-500 italic" : inSameMap ? "text-emerald-300 font-semibold" : "text-zinc-500"} truncate">
                  ${esc(mapName)}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-1 flex-shrink-0">
              ${isOnline && !inSameMap ? `
                <button type="button" class="guild-act-btn secondary p-1 text-[9px]" title="Warp to Member's Map" data-partyact="warp-party-member" data-map-id="${m.mapId}">
                  ${lucideIcon("zap", 10)}
                </button>
              ` : ""}
              ${isLeader && !isSelf ? `
                <button type="button" class="guild-act-btn secondary p-1 text-[9px]" title="Transfer Party Leadership" data-partyact="pass-leader" data-target-name="${esc(m.name)}">
                  ${lucideIcon("crown", 10)}
                </button>
                <button type="button" class="guild-act-btn danger p-1 text-[9px]" title="Expel Member" data-partyact="expel-member" data-target-name="${esc(m.name)}">
                  ${lucideIcon("x", 10)}
                </button>
              ` : ""}
            </div>
          </div>

          <!-- Dual Micro Gauges (HP & MP) -->
          <div class="grid grid-cols-2 gap-1.5 text-[8.5px] ${isGrayed ? "grayscale opacity-75" : ""}">
            <div class="flex items-center gap-1">
              <span class="font-mono text-rose-300/80 flex-shrink-0">HP</span>
              <div class="flex-1 h-1.5 rounded bg-black/50 border border-white/10 overflow-hidden relative">
                <div class="h-full ${isGrayed ? "bg-zinc-500" : "bg-gradient-to-r from-rose-500 to-rose-400"} rounded transition-all duration-300" style="width: ${hpPct}%"></div>
              </div>
              <span class="font-mono text-zinc-300 flex-shrink-0 text-right">${hpPct}%</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="font-mono text-sky-300/80 flex-shrink-0">MP</span>
              <div class="flex-1 h-1.5 rounded bg-black/50 border border-white/10 overflow-hidden relative">
                <div class="h-full ${isGrayed ? "bg-zinc-600" : "bg-gradient-to-r from-sky-500 to-sky-400"} rounded transition-all duration-300" style="width: ${mpPct}%"></div>
              </div>
              <span class="font-mono text-zinc-300 flex-shrink-0 text-right">${mpPct}%</span>
            </div>
          </div>
        </div>
      `;
    }).join("");

    body.innerHTML = `
      <div class="p-2.5 flex flex-col gap-2 h-full overflow-hidden text-zinc-200">
        <!-- Top Party Status Banner -->
        <div class="flex items-center justify-between p-2 bg-white/[0.04] border border-white/10 rounded flex-shrink-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <div class="w-7 h-7 rounded bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 flex-shrink-0">
              ${lucideIcon("users", 13)}
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1">
                <span class="font-bold text-[11px] text-white truncate font-mono">${esc(party.id)}</span>
                <button type="button" class="p-0.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors" title="Copy Party ID" data-partyact="copy-party-id">
                  ${lucideIcon("copy", 10)}
                </button>
                <span class="text-[9px] text-zinc-400">(${membersList.length}/6)</span>
              </div>
              <div class="text-[9px] text-amber-300/90 flex items-center gap-1 truncate">
                ${lucideIcon("crown", 9)}
                <span>Leader: <strong>${esc(party.leaderName)}</strong></span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1 flex-shrink-0">
            <button type="button" class="guild-act-btn secondary p-1 text-xs" title="Refresh Party" data-partyact="refresh-party">
              ${lucideIcon("rotate", 11)}
            </button>
          </div>
        </div>

        <!-- Shared EXP Indicator -->
        <div class="px-2 py-1 bg-emerald-950/30 border border-emerald-500/25 rounded text-[9.5px] text-emerald-300 flex items-center gap-1.5 flex-shrink-0">
          ${lucideIcon("sparkles", 10, "flex-shrink-0 text-emerald-400")}
          <span><strong>EXP Share:</strong> +50% monster EXP to all same-map members!</span>
        </div>

        <!-- Member List -->
        <div class="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
          ${memberCards}
        </div>

        <!-- Bottom Controls -->
        <div class="flex flex-col gap-1.5 pt-1.5 border-t border-white/10 flex-shrink-0">
          ${membersList.length < 6 ? `
            <div class="flex items-center gap-1">
              <input type="text" placeholder="Invite player by name..." class="party-invite-name-inp flex-1 bg-zinc-950 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder:text-zinc-500" />
              <button type="button" class="guild-act-btn primary px-2.5 py-1 text-xs font-bold" data-partyact="invite-member">Invite</button>
            </div>
          ` : `<div class="text-center text-[9px] text-zinc-500">Party is full (6/6).</div>`}

          <div class="flex items-center justify-between gap-1.5">
            <button type="button" class="guild-act-btn secondary py-1 text-xs flex-1 text-center" data-partyact="leave-party">
              Leave Party
            </button>
            ${isLeader ? `
              <button type="button" class="guild-act-btn danger py-1 text-xs flex-1 text-center" data-partyact="disband-party">
                Disband Party
              </button>
            ` : ""}
          </div>
        </div>
      </div>
    `;
  }

  update(dt: number) {
    this.renderCharacterInfo();
    this.renderStat();
    this.renderHyperStats();
    this.renderAbility();
    this.renderSkill();
    this.ext.update();
    this.renderBuffs();
    this.renderLogs(dt);
    if (this.partyWin && !this.partyWin.classList.contains("hidden")) {
      this.renderParty();
    }
    const on = this.game.auto.battle;
    this.autoBtn.classList.toggle("on", on);
    if (this.autoBossBtn) this.autoBossBtn.classList.toggle("on", this.game.auto.boss);
    (this.autoWin as any)._sync?.();
  }
}

// ---------------------------------------------------------------------------
// Extended Windows (Equip, Inventory, Crafting, Auction House)
// ---------------------------------------------------------------------------
type Tab<T extends string> = { cur: T };

export class ExtWindows {
  equipWin: HTMLElement; invWin: HTMLElement; craftWin: HTMLElement; ahWin: HTMLElement; menuPop: HTMLElement;
  stageHud: HTMLElement; bossBar: HTMLElement; offline: HTMLElement | null = null;
  items: ItemBrowser;
  cashShop: CashShop;
  tips = new Map<string, () => string>();
  sig: Record<string, string> = {};
  equipTab: "equip" | "visual" | "pet" | "damage" = "equip";
  invTab: Tab<"equip" | "use" | "etc" | "setup" | "cash" | "dec"> = { cur: "equip" };
  invSearch = "";
  craftTab: Tab<"gear" | "refine" | "star" | "cube"> = { cur: "gear" };
  ahTab: Tab<"browse" | "sell" | "mine"> = { cur: "browse" };
  ahFilter: "all" | "gear" | "mat" | "use" = "all";
  pick: string | null = null; // gear uid chosen in Star Force / Cube
  lastResult = "";
  equipAnimFrame = 0;

  constructor(public w: Windows) {
    const g = w.game;
    const E = w.win.equip;
    // Modern MapleStory exact coordinates & dimensions (1:1 with reference)
    this.equipWin = w.makeWindow("equip-win", 320, 395, "EQUIPMENT INVENTORY", 300, 176);
    this.invWin = w.makeWindow("inv-win", 412, 478, "INVENTORY", 584, 176);
    this.craftWin = w.makeWindow("craft-win", 340, 380, "CRAFTING", innerWidth / 2 - 170, 80);
    this.ahWin = w.makeWindow("ah-win", 540, 440, "AUCTION HOUSE", Math.max(20, Math.round(innerWidth / 2 - 270)), 65);
    this.cashShop = new CashShop(w);

    // Windows start closed by default; toggled with dedicated menu buttons or hotkeys
    for (const win of [this.equipWin, this.invWin, this.craftWin, this.ahWin]) {
      el("div", "x-body", win);
      win.addEventListener("click", (e) => this.onClick(e as MouseEvent));
      win.addEventListener("contextmenu", (e) => this.onRightClick(e as MouseEvent));
      win.addEventListener("pointermove", (e) => {
        if (w.ghost) return;
        const target = e.target as HTMLElement;
        const t = target.closest<HTMLElement>("[data-tip], [data-uid], [data-use], [data-mat], [data-slot]");
        if (!t) {
          w.hideTip();
          return;
        }

        const g = this.w.game;

        // 1. Equipped items or bag items with data-uid
        const uid = t.dataset.uid;
        if (uid) {
          const gear = g.findGear(uid) || Object.values(g.eq).find((eq) => eq?.uid === uid) || Object.values(g.visualEq).find((eq) => eq?.uid === uid);
          if (gear) {
            const isEquipped = Object.values(g.eq).some((eq) => eq?.uid === uid) || Object.values(g.visualEq).some((eq) => eq?.uid === uid);
            const isVisual = Object.values(g.visualEq).some((eq) => eq?.uid === uid);
            const note = isVisual ? "Visual Cosmetic Outfit · Click to unequip" : isEquipped ? "Currently Equipped · Click to unequip" : "Equipment Inventory · Click to equip";
            w.showTip(renderGearTooltip(gear, isEquipped, note, g.stats.level, g.stats.classId, g.stats.gender), (e as PointerEvent).clientX, (e as PointerEvent).clientY);
            return;
          }
        }

        // 2. Empty equipment slots in equipment window
        if (t.dataset.slot && t.classList.contains("empty")) {
          const s = t.dataset.slot as Slot;
          const isVisual = t.classList.contains("visual-slot");
          const title = isVisual ? `Visual ${SLOT_NAME[s] ?? s}` : (SLOT_NAME[s] ?? s);
          const emptyLabel = isVisual ? "Empty Visual Slot (Replaces Outfit)" : "Empty Equipment Slot";
          w.showTip(`<div class="ms-tooltip-card p-2.5 min-w-[140px] text-center"><div class="tt-title text-[12px] font-bold ${isVisual ? "text-purple-300" : "text-zinc-200"}">${title}</div><div class="text-[9.5px] text-zinc-400 mt-1">${emptyLabel}</div></div>`, (e as PointerEvent).clientX, (e as PointerEvent).clientY);
          return;
        }

        // 3. Use item slots
        if (t.dataset.use) {
          const id = Number(t.dataset.use);
          w.showTip(renderUseTooltip(id, g.inv[id] ?? 0), (e as PointerEvent).clientX, (e as PointerEvent).clientY);
          return;
        }

        // 4. Material item slots
        if (t.dataset.mat) {
          const id = Number(t.dataset.mat);
          w.showTip(renderMatTooltip(id, g.mats[id] ?? 0), (e as PointerEvent).clientX, (e as PointerEvent).clientY);
          return;
        }

        // 5. Fallback to registered tip
        const f = t.dataset.tip && this.tips.get(t.dataset.tip);
        if (f) w.showTip(f(), (e as PointerEvent).clientX, (e as PointerEvent).clientY); else w.hideTip();
      });
      win.addEventListener("pointerleave", () => w.hideTip());
    }

    this.ahWin.addEventListener("change", (e) => {
      const t = e.target as HTMLElement;
      if (t && t.classList.contains("ah-curr-sel")) {
        const row = t.closest<HTMLElement>(".ah-row");
        if (!row) return;
        const val = (t as HTMLSelectElement).value;
        const mesoInp = row.querySelector<HTMLElement>(".ah-price-meso");
        const nxInp = row.querySelector<HTMLElement>(".ah-price-nx");
        if (mesoInp) mesoInp.style.display = val === "nx" ? "none" : "";
        if (nxInp) nxInp.style.display = val === "meso" ? "none" : "";
      }
    });

    w.item = this.invWin;

    this.menuPop = el("div", "menu-pop hidden", document.body);
    this.items = new ItemBrowser(w);
    this.renderMenuPop();
    addEventListener("pointerdown", (e) => { if (!(e.target as HTMLElement).closest(".menu-pop, .menu-btn")) this.menuPop.classList.add("hidden"); });

    this.stageHud = el("div", "stage-hud", w.hudRoot);
    this.stageHud.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".boss-go")) g.challengeBoss();
      if (target.closest(".auto-boss-toggle")) {
        g.auto.boss = !g.auto.boss;
        g.onChange();
      }
    });
    this.bossBar = el("div", "boss-bar hidden", w.hudRoot);
    g.onBoss = (m) => {
      this.bossBar.classList.toggle("hidden", !m);
      if (m) this.bossBar.innerHTML = `${icon(m.data.books.stand?.[0]?.url ?? "", "boss-ic")}<div class="boss-main"><div class="boss-name">${esc(m.data.name.trim())} <small>Lv.${m.data.meta?.level ?? "?"}</small></div><div class="boss-hp"><div class="boss-fill"></div><span class="boss-num"></span></div></div><div class="boss-time"></div>`;
    };
    g.onOffline = (r) => this.showOffline(r);

    if (!this.equipWin.classList.contains("hidden")) this.renderEquip();
    if (!this.invWin.classList.contains("hidden")) this.renderInv();
    if (!this.craftWin.classList.contains("hidden")) this.renderCraft();
    if (!this.ahWin.classList.contains("hidden")) this.renderAh();
  }

  open(k: "equip" | "inv" | "craft" | "ah" | "cashshop") {
    if (k === "cashshop") {
      this.cashShop.open();
      return;
    }
    const win = { equip: this.equipWin, inv: this.invWin, craft: this.craftWin, ah: this.ahWin }[k];
    const isAlreadyOpen = !win.classList.contains("hidden");
    if (isAlreadyOpen) {
      win.classList.add("hidden");
      return;
    }
    if (k === "ah") this.w.game.ah.refresh(Date.now());
    if (k === "equip") this.renderEquip();
    else if (k === "inv") this.renderInv();
    else if (k === "craft") this.renderCraft();
    else this.renderAh();
    win.classList.remove("hidden");
    win.style.zIndex = String(++this.w.z);
    clampWindow(win);
    this.sig = {};
  }
  openCashShop() {
    this.cashShop.open();
  }
  renderMenuPop() {
    this.menuPop.innerHTML = "";
    const w = this.w;
    const isGm = w.game.isGm();
    const entries: { label: string; key: string; fn: () => void; isGm?: boolean }[] = [
      { label: "Character Stats", key: "S", fn: () => w.toggle(w.stat) },
      { label: "Skills", key: "K", fn: () => w.toggle(w.skill) },
      { label: "Equipment", key: "E", fn: () => this.open("equip") },
      { label: "Inventory", key: "I", fn: () => this.open("inv") },
      { label: "Guild", key: "G", fn: () => w.toggle(w.guildWin) },
      { label: "Crafting", key: "J", fn: () => this.open("craft") },
      { label: "Auction House", key: "H", fn: () => this.open("ah") },
      { label: "Cash Shop (NX)", key: "CS", fn: () => this.openCashShop() },
      { label: "Game Guide", key: "F3", fn: () => w.toggle(w.guideWin) },
      { label: "Auto Settings", key: "B·RMB", fn: () => w.toggle(w.autoWin) },
    ];
    if (isGm) {
      entries.push({ label: "★ GM Online Roster", key: "Tab", fn: () => {
        const gmTab = document.querySelector(".gm-collapse-tab") as HTMLElement;
        gmTab?.click();
      }, isGm: true });
      entries.push({ label: "★ GM Control Panel", key: "F1", fn: () => w.toggle(w.debugWin), isGm: true });
      entries.push({ label: "★ All Items Spawner", key: "L", fn: () => this.items.open(), isGm: true });
    }
    if (w.game.unclaimedOffline && (w.game.unclaimedOffline.kills > 0 || w.game.unclaimedOffline.seconds >= 60)) {
      entries.unshift({
        label: `★ Welcome Back (${dur(w.game.unclaimedOffline.seconds)})`,
        key: "Claim",
        fn: () => this.showOffline(w.game.unclaimedOffline!),
      });
    }
    entries.push({
      label: "Switch Character",
      key: "Relog",
      fn: async () => {
        w.game.lastLogoutAt = Date.now();
        if (window.__persist) {
          try { await window.__persist(); } catch {}
        }
        sessionStorage.setItem("ms_skip_autologin", "1");
        location.reload();
      },
    });
    entries.push({
      label: "Log Out Account",
      key: "Exit",
      fn: async () => {
        w.game.lastLogoutAt = Date.now();
        if (window.__persist) {
          try { await window.__persist(); } catch {}
        }
        try {
          localStorage.removeItem("ms_current_user");
          localStorage.removeItem("ms_current_character");
        } catch {}
        sessionStorage.setItem("ms_skip_autologin", "1");
        location.reload();
      },
    });
    for (const item of entries) {
      const b = el("button", `menu-pop-item ${item.isGm ? "menu-pop-gm" : ""}`, this.menuPop) as HTMLButtonElement;
      b.type = "button";
      b.innerHTML = `<span>${item.label}</span><kbd>${item.key}</kbd>`;
      b.addEventListener("click", () => {
        this.menuPop.classList.add("hidden");
        item.fn();
      });
    }
  }

  toggleMenu(anchor: HTMLElement) {
    this.renderMenuPop();
    const r = anchor.getBoundingClientRect();
    this.menuPop.classList.toggle("hidden");
    this.menuPop.style.left = `${Math.min(innerWidth - 170, r.left - 60)}px`;
    this.menuPop.style.bottom = `${innerHeight - r.top + 4}px`;
  }

  // ------------------------------------------------------------- tooltips
  gearTip(g: Gear, note = "") {
    const isEquipped = Object.values(this.w.game.eq).some((eq) => eq?.uid === g.uid) || Object.values(this.w.game.visualEq).some((eq) => eq?.uid === g.uid);
    return renderGearTooltip(g, isEquipped, note, this.w.game.stats.level, this.w.game.stats.classId, this.w.game.stats.gender);
  }
  tip(key: string, f: () => string) { this.tips.set(key, f); return `data-tip="${key}"`; }
  gearCell(g: Gear, action: string, note: string, extra = "") {
    return `<div class="gcell r${g.rarity}" data-act="${action}" data-uid="${g.uid}" ${this.tip("g" + g.uid, () => this.gearTip(g, note))} ${extra}>${icon(gearIcon(g.id))}${g.star ? `<span class="gstar">★${g.star}</span>` : ""}</div>`;
  }

  // ------------------------------------------------------------- clicks
  onClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!t) return;
    const g = this.w.game, a = t.dataset.act!, uid = t.dataset.uid ?? "";
    this.w.hideTip();

    if (e.shiftKey) {
      if (a === "equip" || a === "equip-visual") {
        const item = g.findGear(uid);
        if (item) {
          const name = GEAR.get(item.id)?.name ?? "Gear";
          window.dispatchEvent(new CustomEvent("chat-insert-link", { detail: { name, kind: "gear", gear: item } }));
          return;
        }
      } else if (a === "unequip" || a === "unequip-visual") {
        const slot = t.dataset.slot as Slot;
        const item = a === "unequip-visual" ? g.visualEq[slot] : g.eq[slot];
        if (item) {
          const name = GEAR.get(item.id)?.name ?? "Gear";
          window.dispatchEvent(new CustomEvent("chat-insert-link", { detail: { name, kind: "gear", gear: item } }));
          return;
        }
      }
    }

    switch (a) {
      case "unequip":
        g.unequip(t.dataset.slot as Slot);
        this.renderEquip();
        this.renderInv();
        break;
      case "unequip-visual":
        g.unequipVisual(t.dataset.slot as Slot);
        this.renderEquip();
        this.renderInv();
        break;
      case "equip":
      case "equip-visual": {
        const isCosmetic = Boolean(GEAR.get(g.findGear(uid)?.id ?? 0)?.cosmetic || GEAR.get(g.findGear(uid)?.id ?? 0)?.cash);
        if (this.equipTab === "visual" || isCosmetic) {
          g.equipVisual(uid);
        } else {
          g.equip(uid);
        }
        this.renderEquip();
        this.renderInv();
        break;
      }
      case "equiptab":
        this.equipTab = t.dataset.v as any;
        this.renderEquip();
        break;
      case "summon-pet": {
        const id = Number(t.dataset.id);
        if (id) g.equipPet(id);
        this.renderEquip();
        break;
      }
      case "dismiss-pet": {
        const id = Number(t.dataset.id);
        const p = g.pets.find((x) => x.id === id);
        if (p) g.unequipPet(p.slotIndex);
        this.renderEquip();
        break;
      }
      case "unequip-pet": {
        const s = Number(t.dataset.slot);
        g.unequipPet(s);
        this.renderEquip();
        break;
      }
      case "equip-damage-skin": {
        const id = t.dataset.id;
        if (id !== undefined) {
          g.setDamageSkin(id);
          this.renderEquip();
        }
        break;
      }
      case "unequip-damage-skin": {
        g.setDamageSkin(0);
        this.renderEquip();
        break;
      }
      case "invtab": this.invTab.cur = t.dataset.v as any; break;
      case "selljunk": g.sellJunk(); break;
      case "crafttab": this.craftTab.cur = t.dataset.v as any; this.lastResult = ""; break;
      case "craft": { const r = recipes().find((x) => x.id === t.dataset.v); if (r) this.lastResult = g.craft(r) ?? ""; break; }
      case "pick": this.pick = uid; this.lastResult = ""; break;
      case "star": {
        const r = g.enhance(this.pick ?? "");
        this.lastResult = r === "success" ? "SUCCESS" : r === "fail" ? "FAILED" : r === "max" ? "MAX STARS" : r === "cost" ? "NOT ENOUGH MESOS OR MATERIALS" : "";
        this.flash(r === "success");
        break;
      }
      case "cube": { const ok = g.cube(this.pick ?? ""); this.lastResult = ok ? "POTENTIAL RESET" : "NOT ENOUGH MESOS OR SLIME BUBBLES"; this.flash(ok); break; }
      case "ahtab": this.ahTab.cur = t.dataset.v as any; break;
      case "ahfilter": this.ahFilter = t.dataset.v as any; break;
      case "buy": {
        const payWith = (t.dataset.pay as "meso" | "nx") || "meso";
        g.ahBuy(t.dataset.v!, payWith);
        break;
      }
      case "list": {
        const row = t.closest<HTMLElement>(".ah-row")!;
        const currSel = row.querySelector<HTMLSelectElement>(".ah-curr-sel");
        const durSel = row.querySelector<HTMLSelectElement>(".ah-dur-sel");
        const mesoInput = row.querySelector<HTMLInputElement>(".ah-price-meso");
        const nxInput = row.querySelector<HTMLInputElement>(".ah-price-nx");

        const currency = (currSel?.value as "meso" | "nx" | "both") || "meso";
        const durationHours = (Number(durSel?.value) || 24) as 12 | 24;
        const priceMeso = mesoInput ? Math.max(0, Math.round(Number(mesoInput.value) || 0)) : 0;
        const priceNx = nxInput ? Math.max(0, Math.round(Number(nxInput.value) || 0)) : 0;

        const goods = this.sellGoods(t.dataset.v!);
        if (goods) g.ahList(goods, priceMeso, priceNx, currency, durationHours);
        break;
      }
      case "collect": g.ahCollect(t.dataset.v!); break;
      case "open-equip": this.open("equip"); break;
      case "open-shop": this.items.open(); break;
      case "open-storage": this.open("ah"); break;
      case "open-boss": if (g.bossReady()) g.challengeBoss(); else g.onChat("notice", "Stage boss not ready yet. Keep defeating monsters!"); break;
      case "open-bag": this.open("inv"); break;
      case "sort": {
        const isCash = this.invTab.cur === "cash" || this.invTab.cur === "dec";
        g.sortBag(isCash);
        this.renderInv();
        break;
      }
      case "auto-equip": {
        g.autoEquipBest();
        this.renderInv();
        this.renderEquip();
        break;
      }
      case "lock":
        g.onChat("system", "Item protection lock is active.");
        break;
      default: return;
    }
    this.sig = {};
  }
  onRightClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act='equip']");
    if (!t) return;
    e.preventDefault();
    this.w.hideTip();
    const uid = t.dataset.uid;
    if (uid) {
      this.showItemContextMenu(uid, e.clientX, e.clientY);
    }
  }

  showItemContextMenu(uid: string, x: number, y: number) {
    const g = this.w.game;
    const gear = g.findGear(uid);
    if (!gear) return;
    document.querySelectorAll(".item-context-menu").forEach((m) => m.remove());
    const menu = el("div", "item-context-menu fixed z-[200] bg-[#1a2230] border border-zinc-600 rounded-lg shadow-2xl p-1.5 flex flex-col gap-1 min-w-[160px] text-xs text-white", document.body);
    menu.style.left = `${Math.min(innerWidth - 170, Math.max(10, x))}px`;
    menu.style.top = `${Math.min(innerHeight - 150, Math.max(10, y))}px`;

    const bName = GEAR.get(gear.id)?.name ?? "Equipment";
    const header = el("div", "px-2 py-1 text-[11px] font-bold border-b border-zinc-700 text-amber-300 truncate", menu);
    header.textContent = bName;

    const equipBtn = el("button", "text-left px-2 py-1.5 hover:bg-zinc-700/80 rounded transition-colors flex items-center gap-2 cursor-pointer font-medium text-zinc-200", menu);
    equipBtn.innerHTML = `<span>${lucideIcon("swords", 12, "text-sky-400")}</span> <span>Equip Item</span>`;
    equipBtn.addEventListener("click", () => {
      g.equip(uid);
      this.renderEquip();
      this.renderInv();
      menu.remove();
    });

    const dropBtn = el("button", "text-left px-2 py-1.5 hover:bg-red-950/70 text-red-300 rounded transition-colors flex items-center gap-2 cursor-pointer font-medium", menu);
    dropBtn.innerHTML = `<span>${lucideIcon("trash-2", 12, "text-rose-400")}</span> <span>Drop on Ground (10m)</span>`;
    dropBtn.addEventListener("click", () => {
      g.dropGear(uid);
      this.renderInv();
      menu.remove();
    });

    const sellPrice = npcSellPrice(gear);
    const sellBtn = el("button", "text-left px-2 py-1.5 hover:bg-emerald-950/70 text-emerald-300 rounded transition-colors flex items-center gap-2 cursor-pointer font-medium", menu);
    sellBtn.innerHTML = `<span>${lucideIcon("coins", 12, "text-amber-400")}</span> <span>Sell (${fmt(sellPrice)} m)</span>`;
    sellBtn.addEventListener("click", () => {
      g.sellGear(uid);
      this.renderInv();
      menu.remove();
    });

    const closeHandler = (ev: PointerEvent) => {
      if (!menu.contains(ev.target as Node)) {
        menu.remove();
        window.removeEventListener("pointerdown", closeHandler);
      }
    };
    setTimeout(() => window.addEventListener("pointerdown", closeHandler), 10);
  }
  flash(ok: boolean) {
    const r = this.craftWin.querySelector(".craft-result");
    r?.classList.remove("ok", "bad");
    requestAnimationFrame(() => r?.classList.add(ok ? "ok" : "bad"));
  }

  // ------------------------------------------------------------- equipment
  renderEquip() {
    const g = this.w.game;
    const body = this.equipWin.querySelector(".x-body") as HTMLElement;
    if (!body) return;

    const isVisual = this.equipTab === "visual";
    const isPet = this.equipTab === "pet";
    const isDamage = this.equipTab === "damage";

    if (isDamage) {
      const activeSkinId = g.damageSkin ?? 0;
      const activeSkin = DamageSkinSystem.getSkin(activeSkinId);

      const skinsHtml = DAMAGE_SKIN_PRESETS.map((preset) => {
        const isEquipped = String(preset.id) === String(activeSkinId);
        const skin = DamageSkinSystem.getSkin(preset.id);
        const dFirst = skin.dmgFirst["5"] || skin.dmg["5"];
        const d4 = skin.dmg["4"] || skin.dmg["1"];
        const d8 = skin.dmg["8"] || skin.dmg["2"];
        const d2 = skin.dmg["2"] || skin.dmg["3"];
        const cFirst = skin.criFirst["9"] || skin.cri["9"];
        const c7 = skin.cri["7"] || skin.cri["9"];
        const c8 = skin.cri["8"] || skin.cri["9"];
        const c9 = skin.cri["9"];

        return `
          <div class="damage-skin-card ${isEquipped ? "equipped" : ""}" data-name="${esc(preset.name.toLowerCase())}" data-id="${preset.id}">
            <div class="flex items-center justify-between gap-1">
              <span class="text-[10px] font-bold ${isEquipped ? "text-amber-300" : "text-zinc-200"} truncate font-sans" title="${esc(preset.name)}">${esc(preset.name)}</span>
              ${isEquipped ? `<span class="text-[7.5px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase font-bold shrink-0">Equipped</span>` : ""}
            </div>

            <!-- Transparent Numbers Preview Strip (Normal by default, Critical on hover) -->
            <div class="damage-digits-preview" title="Hover to view Critical damage preview">
              <!-- Normal damage numbers -->
              <div class="norm-digits">
                <img src="${dFirst}" class="damage-digit-img" alt="5" onerror="this.style.display='none'" />
                <img src="${d4}" class="damage-digit-img" alt="4" onerror="this.style.display='none'" />
                <img src="${d8}" class="damage-digit-img" alt="8" onerror="this.style.display='none'" />
                <img src="${d2}" class="damage-digit-img" alt="2" onerror="this.style.display='none'" />
              </div>
              <!-- Critical damage numbers (shows on hover) -->
              <div class="cri-digits">
                ${skin.criEffect ? `<img src="${skin.criEffect}" class="damage-crit-img -mr-1" alt="CRIT" onerror="this.style.display='none'" />` : ""}
                <img src="${cFirst}" class="damage-crit-img" alt="9" onerror="this.style.display='none'" />
                <img src="${c7}" class="damage-crit-img" alt="7" onerror="this.style.display='none'" />
                <img src="${c8}" class="damage-crit-img" alt="8" onerror="this.style.display='none'" />
                <img src="${c9}" class="damage-crit-img" alt="9" onerror="this.style.display='none'" />
              </div>
            </div>

            <!-- Action button -->
            <div class="pt-1 border-t border-white/5 flex justify-end">
              ${
                isEquipped
                  ? `<button type="button" data-act="unequip-damage-skin" class="w-full py-1 text-[9px] font-bold rounded bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-500/40 transition-colors cursor-pointer">
                      Unequip
                    </button>`
                  : `<button type="button" data-act="equip-damage-skin" data-id="${preset.id}" class="w-full py-1 text-[9px] font-bold rounded bg-sky-600/80 hover:bg-sky-500 text-white border border-sky-400/40 transition-colors cursor-pointer">
                      Equip
                    </button>`
              }
            </div>
          </div>
        `;
      }).join("");

      body.innerHTML = `
        <div class="equip-head-tabs">
          <button type="button" data-act="equiptab" data-v="equip" class="equip-tab">Equip</button>
          <button type="button" data-act="equiptab" data-v="visual" class="equip-tab">Cash</button>
          <button type="button" data-act="equiptab" data-v="pet" class="equip-tab">Pet</button>
          <button type="button" data-act="equiptab" data-v="damage" class="equip-tab on">Damage Skin</button>
        </div>
        <div class="equip-sub-bar">
          <span class="equip-title-label">DAMAGE SKINS (${DAMAGE_SKIN_PRESETS.length} WZ EFFECTS)</span>
          <span class="text-[9.5px] text-amber-300 font-bold font-mono">Active: ${esc(activeSkin.name)}</span>
        </div>
        <div class="px-2 pt-1.5 pb-0.5">
          <input type="text" id="damage-skin-filter" placeholder="🔍 Search damage skins by name or ID..." class="w-full px-2 py-1 text-[10px] rounded bg-zinc-900/90 border border-white/15 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-400/60 font-sans" />
        </div>
        <div class="damage-skin-view flex flex-col gap-2 p-2 overflow-y-scroll max-h-[350px] scrollbar-thin">
          <div class="text-[10px] font-bold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
            <span>Hover card to preview Critical hit</span>
            ${String(activeSkinId) !== "0" ? `<button type="button" data-act="unequip-damage-skin" class="text-[8.5px] text-rose-400 hover:text-rose-300 underline font-normal cursor-pointer">Reset to Classic</button>` : ""}
          </div>
          <div class="damage-skin-grid">
            ${skinsHtml}
          </div>
        </div>
      `;
      const filterInput = body.querySelector("#damage-skin-filter") as HTMLInputElement | null;
      if (filterInput) {
        filterInput.addEventListener("input", () => {
          const q = filterInput.value.toLowerCase().trim();
          const cards = body.querySelectorAll<HTMLElement>(".damage-skin-card");
          cards.forEach((card) => {
            const name = card.dataset.name ?? "";
            const id = card.dataset.id ?? "";
            card.style.display = !q || name.includes(q) || id.includes(q) ? "" : "none";
          });
        });
      }
      return;
    }

    if (isPet) {
      const activePets = g.pets ?? [];
      const slotsHtml = [0, 1, 2].map((slotIdx) => {
        const pet = activePets.find((p) => p.slotIndex === slotIdx);
        if (pet) {
          return `
            <div class="pet-slot-card flex items-center justify-between p-2.5 rounded bg-zinc-900/60 border border-emerald-500/35 shadow-sm">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded bg-black/50 border border-emerald-500/40 flex items-center justify-center overflow-hidden">
                  <img src="/wz/pet-icon/${pet.id}" alt="${pet.name}" class="w-8 h-8 object-contain pixelated" />
                </div>
                <div>
                  <div class="text-[12px] font-bold text-emerald-300 flex items-center gap-1.5">
                    ${pet.name} <span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 font-semibold uppercase">Slot ${slotIdx + 1}</span>
                  </div>
                  <div class="text-[9.5px] text-zinc-300 mt-0.5">Auto Follow · Active Field Looting</div>
                </div>
              </div>
              <button type="button" data-act="unequip-pet" data-slot="${slotIdx}" class="px-2.5 py-1 text-[10px] font-bold rounded bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-500/40 transition-colors">
                Dismiss
              </button>
            </div>
          `;
        }
        return `
          <div class="pet-slot-card flex items-center justify-between p-2.5 rounded bg-zinc-900/35 border border-dashed border-white/15">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded bg-black/30 border border-dashed border-white/15 flex items-center justify-center text-zinc-500 text-[11px] font-bold">
                ${slotIdx + 1}
              </div>
              <div>
                <div class="text-[11.5px] font-medium text-zinc-400">Empty Pet Slot ${slotIdx + 1}</div>
                <div class="text-[9.5px] text-zinc-500 mt-0.5">Summon a companion below (Max 3 pets)</div>
              </div>
            </div>
          </div>
        `;
      }).join("");

      const catalog = [
        { id: 5000000, name: "Brown Kitty" },
        { id: 5000001, name: "Brown Puppy" },
        { id: 5000002, name: "Pink Bunny" },
        { id: 5000003, name: "Mini Kargo" },
        { id: 5000004, name: "Black Kitty" },
        { id: 5000005, name: "White Bunny" },
        { id: 5000006, name: "Husky" },
        { id: 5000008, name: "Panda" },
        { id: 5000020, name: "Mini Yeti" },
        { id: 5000029, name: "Rudolph" },
        { id: 5000047, name: "Jr. Balrog" },
        { id: 5000054, name: "Baby Dragon" },
      ];

      const catalogHtml = catalog.map((p) => {
        const isSummoned = activePets.some((x) => x.id === p.id);
        return `
          <div class="pet-cat-card p-2 rounded bg-zinc-900/50 border ${isSummoned ? "border-emerald-500/50 bg-emerald-950/25 shadow-[0_0_8px_rgba(16,185,129,0.15)]" : "border-white/10 hover:border-white/25"} flex flex-col items-center text-center gap-1.5 transition-all">
            <div class="w-10 h-10 rounded bg-black/40 flex items-center justify-center overflow-hidden">
              <img src="/wz/pet-icon/${p.id}" alt="${p.name}" class="w-8 h-8 object-contain pixelated" />
            </div>
            <div class="text-[11px] font-semibold text-zinc-200 line-clamp-1">${p.name}</div>
            <button type="button" data-act="${isSummoned ? "dismiss-pet" : "summon-pet"}" data-id="${p.id}" class="w-full py-1 text-[9.5px] font-bold rounded ${isSummoned ? "bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-500/40" : "bg-sky-600/70 hover:bg-sky-500 text-white border border-sky-400/40"} transition-colors">
              ${isSummoned ? "Dismiss" : "Summon"}
            </button>
          </div>
        `;
      }).join("");

      body.innerHTML = `
        <div class="equip-head-tabs">
          <button type="button" data-act="equiptab" data-v="equip" class="equip-tab">Equip</button>
          <button type="button" data-act="equiptab" data-v="visual" class="equip-tab">Cash</button>
          <button type="button" data-act="equiptab" data-v="pet" class="equip-tab on">Pet</button>
          <button type="button" data-act="equiptab" data-v="damage" class="equip-tab">Damage Skin</button>
        </div>
        <div class="equip-sub-bar">
          <span class="equip-title-label">PET COMPANIONS (${activePets.length} / 3 ACTIVE)</span>
          <span class="text-[10px] text-emerald-400 font-bold">Auto-Follow & Looting</span>
        </div>
        <div class="pet-equip-view flex flex-col gap-2 p-3 overflow-y-auto max-h-[380px] scrollbar-thin">
          <div class="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">Active Pets (Follows player & loots drops)</div>
          <div class="flex flex-col gap-1.5">
            ${slotsHtml}
          </div>
          <div class="text-[11px] font-bold text-zinc-300 uppercase tracking-wider mt-2">Available Pets (Click to Summon up to 3)</div>
          <div class="grid grid-cols-3 gap-2">
            ${catalogHtml}
          </div>
        </div>
      `;
      return;
    }

    // Modern MapleStory Equipment Layout (exact 1:1 match to reference)
    const leftCol1: Slot[] = ["ring1", "ring2", "ring3", "ring4", "pocket"];
    const leftCol2: Slot[] = ["pendant", "face", "eye", "earrings", "belt"];
    const rightCol1: Slot[] = ["hat", "top", "bottom", "shoes", "gloves"];
    const rightCol2: Slot[] = ["cape", "weapon", "shield", "shoulder", "emblem"];

    const SLOT_SIMPLE_ICON: Record<string, string> = {
      hat: "crown",
      face: "eye",
      eye: "eye",
      earrings: "sparkles",
      top: "shield",
      bottom: "sliders",
      shoes: "navigation",
      gloves: "zap",
      cape: "flag",
      shield: "shield",
      weapon: "swords",
      ring1: "gem",
      ring2: "gem",
      ring3: "gem",
      ring4: "gem",
      pendant: "award",
      belt: "sliders",
      shoulder: "shield",
      pocket: "package",
      emblem: "star",
      ring: "gem",
    };

    const cellFor = (s: Slot) => {
      const it = isVisual ? g.visualEq[s] : g.eq[s];
      if (!it) {
        const wornTop = isVisual ? g.visualEq.top : g.eq.top;
        if (s === "bottom" && wornTop && isOverallItem(wornTop.id)) {
          const overallName = GEAR.get(wornTop.id)?.name ?? "Overall";
          return `<div class="eslot covered ${isVisual ? "visual-slot" : ""}" data-slot="${s}" title="Slot covered by equipped Overall (${esc(overallName)})"><span class="eslot-covered-badge">OVERALL</span></div>`;
        }
        const ico = SLOT_SIMPLE_ICON[s] ?? "star";
        return `<div class="eslot empty ${isVisual ? "visual-slot" : ""}" data-slot="${s}"><span class="eslot-icon-placeholder">${lucideIcon(ico, 15)}</span></div>`;
      }
      const act = isVisual ? "unequip-visual" : "unequip";
      const note = isVisual ? "Click to unequip visual cosmetic" : "Click to unequip";
      return `<div class="eslot filled ${isVisual ? "visual-slot" : ""} r${it.rarity}" data-slot="${s}" data-act="${act}" data-uid="${it.uid}" ${this.tip("g" + it.uid, () => this.gearTip(it, note))}>${icon(gearIcon(it.id))}${it.star ? `<span class="gstar">★${it.star}</span>` : ""}</div>`;
    };

    const activeWeapon = g.visualEq.weapon ?? g.eq.weapon;
    const weaponId = activeWeapon ? activeWeapon.id : 0;
    const standAnim = weaponId ? getWeaponStandAnim(weaponId) : "stand1";
    const hasHighStar = (activeWeapon?.star ?? 0) >= 10 || g.gmEffect || g.hasWizetHat();

    let cells = `<div class="e-sub-col">${leftCol1.map(cellFor).join("")}</div>`;
    cells += `<div class="e-sub-col">${leftCol2.map(cellFor).join("")}</div>`;
    cells += `
      <div class="eprev">
        <div class="eprev-pedestal"></div>
        <div class="eprev-char-wrap">
          <img alt="Character preview" class="eprev-char" src="${charUrlFor(g.look, standAnim, this.equipAnimFrame)}" />
        </div>
        <div class="eprev-aura ${hasHighStar ? "high-star" : ""}"></div>
      </div>
    `;
    cells += `<div class="e-sub-col">${rightCol1.map(cellFor).join("")}</div>`;
    cells += `<div class="e-sub-col">${rightCol2.map(cellFor).join("")}</div>`;

    body.innerHTML = `
      <div class="equip-head-tabs">
        <button type="button" data-act="equiptab" data-v="equip" class="equip-tab ${this.equipTab === "equip" ? "on" : ""}">Equip</button>
        <button type="button" data-act="equiptab" data-v="visual" class="equip-tab ${this.equipTab === "visual" ? "on" : ""}">Cash</button>
        <button type="button" data-act="equiptab" data-v="pet" class="equip-tab ${this.equipTab === "pet" ? "on" : ""}">Pet</button>
        <button type="button" data-act="equiptab" data-v="damage" class="equip-tab ${this.equipTab === "damage" ? "on" : ""}">Damage Skin</button>
      </div>
      <div class="equip-sub-bar">
        <span class="equip-title-label">${isVisual ? "VISUAL COSMETICS (NX)" : isPet ? "PET EQUIPMENT" : "EQUIPMENT"}</span>
        <button type="button" data-act="equiptab" data-v="${isVisual ? "equip" : "visual"}" class="equip-decor-btn">${isVisual ? "&lt; Regular Gear" : "Decorations (NX) &gt;"}</button>
      </div>
      <div class="egrid-container">${cells}</div>
      <div class="equip-presets-bar">
        <span class="preset-label">PRESETS</span>
        <div class="preset-btns">
          <button type="button" class="preset-btn on">1</button>
          <button type="button" class="preset-btn">2</button>
          <button type="button" class="preset-btn">3</button>
          <button type="button" class="preset-apply-btn">Apply</button>
        </div>
      </div>
      <div class="equip-bottom-actions">
        <button type="button" class="equip-act-pill emerald" data-act="auto-equip" title="Equip highest Combat Power (CP) gear for your class">${lucideIcon("zap", 11)} EQUIP BEST</button>
        <button type="button" class="equip-act-pill lime">TITLE · MEDAL</button>
        <button type="button" class="equip-act-pill zinc">VALUABLE</button>
        <button type="button" class="equip-act-pill cyan">SYMBOL &gt;</button>
      </div>
    `;
  }

  // ------------------------------------------------------------- inventory
  renderInv() {
    const g = this.w.game, tab = this.invTab.cur;
    const body = this.invWin.querySelector(".x-body") as HTMLElement;
    if (!body) return;
    const q = this.invSearch.trim().toLowerCase();
    const tabs = (["equip", "use", "etc", "setup", "cash", "dec"] as const).map((t) => {
      const label = t === "equip" ? "Equip" : t === "use" ? "Use" : t === "etc" ? "Etc." : t === "setup" ? "Set-up" : t === "cash" ? "Cash" : "Dec.";
      return `<button type="button" data-act="invtab" data-v="${t}" class="inv-tab-pill ${t === tab ? "on" : ""}">${label}</button>`;
    }).join("");

    let grid = "";
    let curCount = 0;
    if (tab === "equip") {
      let bag = g.bag.filter((it) => {
        const b = GEAR.get(it.id);
        return !b?.cosmetic && !b?.cash;
      });
      if (q) {
        bag = bag.filter((it) => (GEAR.get(it.id)?.name ?? "").toLowerCase().includes(q));
        // Quality of life: temporarily sort matching items to the top
        bag.sort((a, b) => {
          const nameA = (GEAR.get(a.id)?.name ?? "").toLowerCase();
          const nameB = (GEAR.get(b.id)?.name ?? "").toLowerCase();
          const pfxA = nameA.startsWith(q) ? 0 : 1;
          const pfxB = nameB.startsWith(q) ? 0 : 1;
          if (pfxA !== pfxB) return pfxA - pfxB;
          if (b.rarity !== a.rarity) return b.rarity - a.rarity;
          if (b.star !== a.star) return b.star - a.star;
          const lvA = GEAR.get(a.id)?.req ?? 0;
          const lvB = GEAR.get(b.id)?.req ?? 0;
          if (lvB !== lvA) return lvB - lvA;
          return nameA.localeCompare(nameB);
        });
      }
      curCount = bag.length;
      const maxSlot = bag.reduce((m, it) => Math.max(m, it.slot ?? 0), 0);
      const targetPad = Math.max(32, Math.ceil((q ? bag.length : maxSlot + 1) / 8) * 8);
      for (let i = 0; i < targetPad; i++) {
        const it = q ? bag[i] : bag.find((x) => x.slot === i);
        if (it) {
          grid += `<div class="gcell r${it.rarity}" data-act="equip" data-uid="${it.uid}" data-slot-idx="${it.slot ?? i}" ${this.tip("g" + it.uid, () => this.gearTip(it, "Click to equip · drag to move anywhere · right-click for actions"))}>${icon(gearIcon(it.id))}${it.star ? `<span class="gstar">★${it.star}</span>` : ""}</div>`;
        } else {
          grid += `<div class="gcell blank" data-slot-idx="${i}"></div>`;
        }
      }
    } else if (tab === "use") {
      let ids = Object.keys(ITEMS).map(Number).filter((id) => (g.inv[id] ?? 0) > 0);
      if (q) {
        ids = ids.filter((id) => (ITEMS[id]?.name ?? "").toLowerCase().includes(q));
        ids.sort((a, b) => {
          const nameA = (ITEMS[a]?.name ?? "").toLowerCase();
          const nameB = (ITEMS[b]?.name ?? "").toLowerCase();
          const pfxA = nameA.startsWith(q) ? 0 : 1;
          const pfxB = nameB.startsWith(q) ? 0 : 1;
          if (pfxA !== pfxB) return pfxA - pfxB;
          return nameA.localeCompare(nameB);
        });
      } else {
        ids.sort((a, b) => {
          const itA = ITEMS[a], itB = ITEMS[b];
          const typeOrder: Record<string, number> = { hp: 1, mp: 1, all: 1, recovery: 1, star: 2, arrow: 2, bullet: 2, buff: 3, cube: 4 };
          const tA = typeOrder[itA?.type ?? ""] ?? 99;
          const tB = typeOrder[itB?.type ?? ""] ?? 99;
          if (tA !== tB) return tA - tB;
          const powerA = (itA?.hp ?? 0) + (itA?.mp ?? 0) + (itA?.att ?? 0) * 10 + (itA?.hpPct ?? 0) * 100;
          const powerB = (itB?.hp ?? 0) + (itB?.mp ?? 0) + (itB?.att ?? 0) * 10 + (itB?.hpPct ?? 0) * 100;
          if (powerB !== powerA) return powerB - powerA;
          return a - b;
        });
      }
      curCount = ids.length;
      for (const id of ids) {
        const it = ITEMS[id];
        const isThrowable = it?.type === "star" || it?.type === "arrow" || it?.type === "bullet";
        const countHtml = isThrowable ? `<span class="cnt">∞</span>` : `<span class="cnt">${g.inv[id]}</span>`;
        grid += `<div class="gcell" data-use="${id}" ${this.tip("u" + id, () => renderUseTooltip(id, g.inv[id] ?? 0))}>${icon(itemIcon(id), "ic grab")}${countHtml}</div>`;
      }
      const targetPad = Math.max(32, Math.ceil(ids.length / 8) * 8);
      for (let i = ids.length; i < targetPad; i++) grid += `<div class="gcell blank"></div>`;
    } else if (tab === "etc") {
      let entries = Object.entries(g.mats).filter(([_, n]) => n > 0);
      if (q) {
        entries = entries.filter(([id]) => (MATS.get(+id) ?? "").toLowerCase().includes(q));
        entries.sort(([idA], [idB]) => {
          const nameA = (MATS.get(+idA) ?? "").toLowerCase();
          const nameB = (MATS.get(+idB) ?? "").toLowerCase();
          const pfxA = nameA.startsWith(q) ? 0 : 1;
          const pfxB = nameB.startsWith(q) ? 0 : 1;
          if (pfxA !== pfxB) return pfxA - pfxB;
          return nameA.localeCompare(nameB);
        });
      } else {
        entries.sort(([idA], [idB]) => Number(idA) - Number(idB));
      }
      curCount = entries.length;
      for (const [id, n] of entries) {
        grid += `<div class="gcell" data-mat="${id}" ${this.tip("m" + id, () => renderMatTooltip(+id, n))}>${icon(matIcon(+id))}<span class="cnt">${n}</span></div>`;
      }
      const targetPad = Math.max(32, Math.ceil(entries.length / 8) * 8);
      for (let i = entries.length; i < targetPad; i++) grid += `<div class="gcell blank"></div>`;
    } else if (tab === "cash" || tab === "dec") {
      let bag = g.bag.filter((it) => {
        const b = GEAR.get(it.id);
        return Boolean(b?.cosmetic || b?.cash);
      });
      if (q) {
        bag = bag.filter((it) => (GEAR.get(it.id)?.name ?? "").toLowerCase().includes(q));
        bag.sort((a, b) => {
          const nameA = (GEAR.get(a.id)?.name ?? "").toLowerCase();
          const nameB = (GEAR.get(b.id)?.name ?? "").toLowerCase();
          const pfxA = nameA.startsWith(q) ? 0 : 1;
          const pfxB = nameB.startsWith(q) ? 0 : 1;
          if (pfxA !== pfxB) return pfxA - pfxB;
          return nameA.localeCompare(nameB);
        });
      }
      curCount = bag.length;
      const maxSlot = bag.reduce((m, it) => Math.max(m, it.slot ?? 0), 0);
      const targetPad = Math.max(32, Math.ceil((q ? bag.length : maxSlot + 1) / 8) * 8);
      for (let i = 0; i < targetPad; i++) {
        const it = q ? bag[i] : bag.find((x) => x.slot === i);
        if (it) {
          grid += `<div class="gcell r${it.rarity}" data-act="equip-visual" data-uid="${it.uid}" data-slot-idx="${it.slot ?? i}" data-is-cash="1" ${this.tip("g" + it.uid, () => this.gearTip(it, "Click to equip as visual cosmetic · drag to move anywhere · right-click for actions"))}>${icon(gearIcon(it.id))}${it.star ? `<span class="gstar">★${it.star}</span>` : ""}</div>`;
        } else {
          grid += `<div class="gcell blank" data-slot-idx="${i}" data-is-cash="1"></div>`;
        }
      }
    } else {
      for (let i = 0; i < 32; i++) grid += `<div class="gcell blank"></div>`;
    }

    body.innerHTML = `
      <div class="inv-header-bar">
        <div class="inv-tabs">${tabs}</div>
        <div class="inv-slot-top-badge">SLOT <span class="slot-active">${curCount}</span> / ∞</div>
      </div>
      <div class="inv-sub-bar">
        <div class="inv-sub-actions">
          <button type="button" class="inv-pill-btn cyan" data-act="sort"><span class="inv-ico">${lucideIcon("sort", 12)}</span> Sort</button>
          <button type="button" class="inv-pill-btn emerald" data-act="auto-equip" title="Equip highest Combat Power (CP) gear for your class"><span class="inv-ico">${lucideIcon("zap", 12)}</span> Equip Best</button>
          <button type="button" class="inv-pill-btn slate" data-act="lock"><span class="inv-ico">${lucideIcon("lock", 12)}</span> Lock</button>
        </div>
      </div>
      <div class="inv-grid-wrap">
        <div class="inv-grid">${grid}</div>
      </div>
      <div class="inv-finance-row">
        <div class="inv-meso-badge"><span class="coin-dot gold">${lucideIcon("coins", 13)}</span> ${fmt(g.stats.meso || 164852491)}</div>
        <div class="inv-points-badge"><span class="coin-dot silver">${lucideIcon("star", 12)}</span> 5,100</div>
        <div class="inv-actions-right">
          <button type="button" class="inv-action-btn slate" data-act="selljunk">Extract/Fuse</button>
          <button type="button" class="inv-action-btn cyan" data-act="crafttab" data-v="star">Transfer</button>
          <button type="button" class="inv-action-btn cyan" data-act="crafttab" data-v="star">Enhance</button>
        </div>
      </div>
      <div class="inv-quick-footer">
        <div class="inv-search-box">
          <input type="text" placeholder="Enter a search term..." class="inv-search-input" value="${esc(this.invSearch)}" />
          <span class="inv-search-icon">${lucideIcon("search", 13)}</span>
        </div>
        <div class="inv-footer-buttons">
          <button type="button" class="inv-foot-btn" data-act="open-equip">${lucideIcon("equip", 13)} Equip</button>
          <button type="button" class="inv-foot-btn" data-act="open-shop">${lucideIcon("shop", 13)} Shop</button>
          <button type="button" class="inv-foot-btn" data-act="open-storage">${lucideIcon("storage", 13)} Storage Room</button>
          <button type="button" class="inv-foot-btn" data-act="open-boss">${lucideIcon("boss", 13)} Boss Rewards</button>
          <button type="button" class="inv-foot-btn" data-act="open-bag">${lucideIcon("bag", 13)} Bag</button>
        </div>
      </div>
    `;

    const searchInp = body.querySelector(".inv-search-input") as HTMLInputElement;
    if (searchInp) {
      searchInp.addEventListener("input", () => {
        this.invSearch = searchInp.value;
        const pos = searchInp.selectionStart ?? this.invSearch.length;
        this.renderInv();
        const nextInp = body.querySelector(".inv-search-input") as HTMLInputElement;
        if (nextInp) { nextInp.focus(); nextInp.setSelectionRange(pos, pos); }
      });
    }

    for (const c of body.querySelectorAll<HTMLElement>("[data-use]")) {
      const id = Number(c.dataset.use);
      c.addEventListener("click", (e) => {
        if (e.shiftKey) {
          e.stopPropagation();
          const it = ITEMS[id];
          if (it) {
            window.dispatchEvent(new CustomEvent("chat-insert-link", { detail: { name: it.name, kind: "use", itemId: id, count: g.inv[id] } }));
          }
        }
      });
      this.w.draggable(c, () => ({ t: "item", id }), undefined, () => g.useAction({ t: "item", id }));
    }

    for (const c of body.querySelectorAll<HTMLElement>("[data-mat]")) {
      const id = Number(c.dataset.mat);
      c.addEventListener("click", (e) => {
        if (e.shiftKey) {
          e.stopPropagation();
          const name = MATS.get(id) ?? "Material";
          window.dispatchEvent(new CustomEvent("chat-insert-link", { detail: { name, kind: "mat", itemId: id, count: g.mats[id] } }));
        }
      });
    }

    this.setupInventoryDrag(body);
  }

  private setupInventoryDrag(body: HTMLElement) {
    const g = this.w.game;
    const isCashTab = this.invTab.cur === "cash" || this.invTab.cur === "dec";
    const cells = body.querySelectorAll<HTMLElement>(".gcell[data-slot-idx]");
    for (const cell of cells) {
      const fromSlot = Number(cell.dataset.slotIdx);
      const uid = cell.dataset.uid;
      const isCash = cell.dataset.isCash === "1" || isCashTab;
      if (uid) {
        cell.draggable = true;
        cell.addEventListener("dragstart", (e) => {
          e.dataTransfer?.setData("text/plain", JSON.stringify({ type: "bag-slot", fromSlot, uid, isCash }));
        });
      }
      cell.addEventListener("dragover", (e) => {
        e.preventDefault();
        cell.classList.add("drag-over");
      });
      cell.addEventListener("dragleave", () => {
        cell.classList.remove("drag-over");
      });
      cell.addEventListener("drop", (e) => {
        e.preventDefault();
        cell.classList.remove("drag-over");
        try {
          const raw = e.dataTransfer?.getData("text/plain");
          if (!raw) return;
          const data = JSON.parse(raw);
          if (data.type === "bag-slot") {
            const toSlot = Number(cell.dataset.slotIdx);
            g.moveBagSlot(data.fromSlot, toSlot, Boolean(data.isCash ?? isCash));
            this.renderInv();
          }
        } catch {}
      });
    }

    // Support dropping outside the inventory window onto the game canvas to drop onto ground
    const canvas = document.getElementById("game");
    if (canvas && !(canvas as any)._dropListenerInstalled) {
      (canvas as any)._dropListenerInstalled = true;
      canvas.addEventListener("dragover", (e) => e.preventDefault());
      canvas.addEventListener("drop", (e) => {
        e.preventDefault();
        try {
          const raw = e.dataTransfer?.getData("text/plain");
          if (!raw) return;
          const data = JSON.parse(raw);
          if (data.type === "bag-slot" && data.uid) {
            g.dropGear(data.uid);
            this.renderInv();
          }
        } catch {}
      });
    }
  }

  // ------------------------------------------------------------- crafting
  needsHtml(r: Recipe) {
    const g = this.w.game;
    return r.needs.map(([id, n]) => {
      const have = g.mats[id] ?? 0;
      return `<span class="need ${have >= n ? "" : "miss"}" ${this.tip("n" + id, () => `<b>${esc(MATS.get(id) ?? "Material")}</b><p class="tip-dim">Owned ${g.mats[id] ?? 0}</p>`)}>${icon(matIcon(id), "ic sm")}${have}/${n}</span>`;
    }).join("") + `<span class="need ${g.stats.meso >= r.meso ? "" : "miss"}">${fmt(r.meso)} m</span>`;
  }
  renderCraft() {
    const g = this.w.game, tab = this.craftTab.cur;
    const body = this.craftWin.querySelector(".x-body") as HTMLElement;
    const tabs = ([["gear", "GEAR"], ["refine", "REFINE & POTIONS"], ["star", "STAR FORCE"], ["cube", "CUBE"]] as const)
      .map(([t, l]) => `<span data-act="crafttab" data-v="${t}" class="${t === tab ? "on" : ""}">${l}</span>`).join("");
    let html = "";
    if (tab === "gear" || tab === "refine") {
      const list = recipes().filter((r) => (tab === "gear" ? r.kind === "gear" : r.kind !== "gear"))
        .sort((a, b) => Number(g.stats.level < a.level) - Number(g.stats.level < b.level) || a.level - b.level);
      html = `<p class="xnote">${tab === "gear" ? "Crafted gear is always Rare or better. Materials drop from monsters and bosses." : "Refine 10 ores into a plate or gem. Brew potions from monster drops."}</p><div class="xlist">`;
      for (const r of list) {
        const out = r.out;
        const ic = out.t === "gear" ? gearIcon(recipeGearId(out.slot, out.tier) ?? 1302000) : out.t === "mat" ? matIcon(out.id) : itemIcon(out.id);
        const locked = g.stats.level < r.level;
        const tipKey = "r" + r.id;
        this.tips.set(tipKey, () => {
          if (out.t !== "gear") return `<b>${esc(r.name)}</b>`;
          const b = GEAR.get(recipeGearId(out.slot, out.tier)!)!;
          return `<b>${esc(b.name)}</b><p class="tip-dim">${SLOT_NAME[out.slot as Slot]} · REQ LEV ${b.req}</p><p>ATT +${b.watk} · STR +${b.str} · DEX +${b.dex} · INT +${b.int ?? 0} · LUK +${b.luk ?? 0} · HP +${b.hp} · DEF +${b.def}</p><p class="tip-dim">Crafting rolls Rare ~ Legendary potential.</p>`;
        });
        html += `<div class="xrow ${locked ? "locked" : ""}"><div class="gcell" data-tip="${tipKey}">${icon(ic)}</div><div class="xinfo"><b>${esc(r.name)}</b>${out.t === "gear" ? `<small>${SLOT_NAME[out.slot as Slot]} · Lv ${r.level}</small>` : ""}<div class="needs">${this.needsHtml(r)}</div></div>
          <button type="button" class="xbtn" data-act="craft" data-v="${r.id}" ${g.canCraft(r) ? "" : "disabled"}>${locked ? `Lv ${r.level}` : "Craft"}</button></div>`;
      }
      html += `</div>`;
    } else {
      const all: { g: Gear; where: string }[] = [
        ...SLOTS.map((s) => g.eq[s]).filter((x): x is Gear => !!x).map((x) => ({ g: x, where: "Equipped" })),
        ...g.bag.map((x) => ({ g: x, where: "Inventory" })),
      ].filter((x) => {
        const b = GEAR.get(x.g.id);
        return !b?.cosmetic && !b?.cash && !x.g.cosmetic && !x.g.cash;
      });
      if (!this.pick || !all.some((x) => x.g.uid === this.pick)) this.pick = all[0]?.g.uid ?? null;
      const sel = all.find((x) => x.g.uid === this.pick)?.g;
      const list = all.map((x) => `<div class="pickc ${x.g.uid === this.pick ? "on" : ""}">${this.gearCell(x.g, "pick", x.where)}</div>`).join("");
      let panel = "<p class='xnote'>No equipment.</p>";
      if (sel) {
        const b = GEAR.get(sel.id)!;
        if (tab === "star") {
          const cost = starCost(sel), mat = starMat(sel.star), have = g.mats[mat] ?? 0;
          const st = gearStats(sel), next = gearStats({ ...sel, star: Math.min(MAX_STAR, sel.star + 1) });
          const gain = (["watk", "str", "dex", "int", "luk", "hp", "def"] as const).filter((k) => next[k] > st[k]).map((k) => `${{ watk: "ATT", str: "STR", dex: "DEX", int: "INT", luk: "LUK", hp: "HP", def: "DEF" }[k]} +${next[k] - st[k]}`).join(" · ");
          panel = `<div class="sf-head">${icon(gearIcon(sel.id), "ic lg")}<div><b style="color:${RARITY_INK[sel.rarity]}">${esc(b.name)}</b><div class="stars big">${"★".repeat(sel.star)}<span class="dim">${"★".repeat(MAX_STAR - sel.star)}</span></div></div></div>
            ${sel.star >= MAX_STAR ? `<p class="xnote">Maximum stars reached.</p>` : `<div class="sf-grid"><span>Success</span><b>${Math.round(starRate(sel.star) * 100)}%</b><span>Failure</span><b>${100 - Math.round(starRate(sel.star) * 100)}% (stars kept)</b>
            <span>Next star</span><b>${gain || "—"}</b><span>Cost</span><b class="${g.stats.meso >= cost ? "" : "miss"}">${fmt(cost)} mesos</b>
            <span>Material</span><b class="${have >= 1 ? "" : "miss"}">${icon(matIcon(mat), "ic sm")} ${esc(MATS.get(mat) ?? "")} ${have}/1</b></div>
            <button type="button" class="xbtn big" data-act="star">Enhance ★${sel.star + 1}</button>`}`;
        } else {
          const cost = cubeCost(sel), have = g.mats[4000010] ?? 0;
          panel = `<div class="sf-head">${icon(gearIcon(sel.id), "ic lg")}<div><b style="color:${RARITY_INK[sel.rarity]}">${esc(b.name)}</b><div class="tip-dim">${RARITY[sel.rarity]} potential</div></div></div>
            <div class="pot-box" style="border-color:${RARITY_COLOR[sel.rarity]}">${sel.pot.length ? sel.pot.map((p) => `<p>${POT_LABEL[p.stat]}: +${p.pct}%</p>`).join("") : "<p class='tip-dim'>No potential yet</p>"}</div>
            <div class="sf-grid"><span>Tier-up chance</span><b>${[30, 10, 4, 1.5, 0][sel.rarity]}%</b><span>Cost</span><b class="${g.stats.meso >= cost ? "" : "miss"}">${fmt(cost)} mesos</b>
            <span>Material</span><b class="${have >= 5 ? "" : "miss"}">${icon(matIcon(4000010), "ic sm")} Slime Bubble ${have}/5</b></div>
            <button type="button" class="xbtn big" data-act="cube">Use Cube</button>`;
        }
      }
      html = `<div class="sf"><div class="pick-list">${list}</div><div class="sf-panel">${panel}<div class="craft-result">${this.lastResult}</div></div></div>`;
    }
    body.innerHTML = `<div class="xtabs">${tabs}</div>${html}<div class="inv-foot"><span class="tip-dim">${tab === "gear" || tab === "refine" ? "" : "Pick a piece on the left"}</span><span class="meso">${fmt(g.stats.meso)}</span></div>`;
  }

  // ------------------------------------------------------------- auction house
  sellGoods(key: string): Goods | null {
    const g = this.w.game;
    const [t, id] = key.split(":");
    if (t === "g") { const it = g.bag.find((x) => x.uid === id); return it ? { t: "gear", gear: it } : null; }
    if (t === "m") { const n = Math.min(100, g.mats[+id] ?? 0); return n > 0 ? { t: "mat", id: +id, n } : null; }
    const n = Math.min(100, g.inv[+id] ?? 0); return n > 0 ? { t: "use", id: +id, n } : null;
  }
  goodsIcon(x: Goods) { return x.t === "gear" ? gearIcon(x.gear.id) : x.t === "mat" ? matIcon(x.id) : itemIcon(x.id); }
  goodsCell(x: Goods, key: string) {
    if (x.t === "gear") return this.gearCell(x.gear, "", "");
    if (x.t === "use") {
      return `<div class="gcell" ${this.tip(key, () => renderUseTooltip(x.id, x.n, `Market value ≈ ${fmt(goodsValue(x))} mesos`))}>${icon(this.goodsIcon(x))}<span class="cnt">${x.n}</span></div>`;
    }
    return `<div class="gcell" ${this.tip(key, () => renderMatTooltip(x.id, x.n, `Market value ≈ ${fmt(goodsValue(x))} mesos`))}>${icon(this.goodsIcon(x))}<span class="cnt">${x.n}</span></div>`;
  }
  goodsLabel(x: Goods) {
    const c = x.t === "gear" ? RARITY_INK[x.gear.rarity] : "#333";
    return `<b style="color:${c}">${esc(goodsName(x))}${x.t === "gear" && x.gear.star ? ` ★${x.gear.star}` : ""}</b>`;
  }
  renderAh() {
    const g = this.w.game, ah = g.ah, tab = this.ahTab.cur;
    const body = this.ahWin.querySelector(".x-body") as HTMLElement;
    const sold = ah.mine.filter((m) => m.sold).length;
    const tabs = ([["browse", "BROWSE"], ["sell", "SELL"], ["mine", `MY LISTINGS${sold ? ` (${sold})` : ""}`]] as const)
      .map(([t, l]) => `<span data-act="ahtab" data-v="${t}" class="${t === tab ? "on" : ""}">${l}</span>`).join("");
    let html = "";
    if (tab === "browse") {
      const f = this.ahFilter;
      const chips = ([["all", "All"], ["gear", "Equipment"], ["mat", "Materials"], ["use", "Consumables"]] as const)
        .map(([k, l]) => `<span data-act="ahfilter" data-v="${k}" class="chip ${k === f ? "on" : ""}">${l}</span>`).join("");
      const rows = ah.listings.filter((l) => f === "all" || l.goods.t === f).map((l) => {
        const req = l.goods.t === "gear" ? GEAR.get(l.goods.gear.id)?.req ?? 0 : 0;
        const durLeft = Math.max(0, Math.ceil((l.until - Date.now()) / (3600 * 1000)));
        const durLabel = durLeft > 0 ? `${durLeft}h left` : "Expiring";
        const isOwnListing = Boolean(l.seller && g.stats.name && l.seller.toLowerCase() === g.stats.name.toLowerCase());

        let priceHtml = "";
        let buttonsHtml = "";

        if (l.currency === "both") {
          priceHtml = `
            <div class="ah-price text-right leading-tight min-w-[70px]">
              <div class="text-amber-300 font-bold text-xs font-mono">${fmt(l.price)} <small class="text-[9px] text-amber-200/70">M</small></div>
              <div class="text-pink-300 font-bold text-xs font-mono">${fmt(l.priceNx ?? 0)} <small class="text-[9px] text-pink-200/70">NX</small></div>
            </div>`;
          buttonsHtml = isOwnListing
            ? `<button type="button" class="xbtn text-[10px] py-0.5 px-1.5" data-act="collect" data-v="${l.lid}">Cancel</button>`
            : `
            <div class="flex flex-col gap-1">
              <button type="button" class="xbtn text-[10px] py-0.5 px-1.5" data-act="buy" data-v="${l.lid}" data-pay="meso" ${g.stats.meso >= l.price ? "" : "disabled"}>Buy (Meso)</button>
              <button type="button" class="xbtn text-[10px] py-0.5 px-1.5 gold" data-act="buy" data-v="${l.lid}" data-pay="nx" ${(g.stats.nx ?? 0) >= (l.priceNx ?? 0) ? "" : "disabled"}>Buy (NX)</button>
            </div>`;
        } else if (l.currency === "nx") {
          const nxP = l.priceNx ?? l.price;
          priceHtml = `<div class="ah-price text-pink-300 font-bold text-xs font-mono min-w-[70px]">${fmt(nxP)} <small class="text-pink-300/80">NX</small></div>`;
          buttonsHtml = isOwnListing
            ? `<button type="button" class="xbtn" data-act="collect" data-v="${l.lid}">Cancel</button>`
            : `<button type="button" class="xbtn gold" data-act="buy" data-v="${l.lid}" data-pay="nx" ${(g.stats.nx ?? 0) >= nxP ? "" : "disabled"}>Buy (NX)</button>`;
        } else {
          priceHtml = `<div class="ah-price text-amber-300 font-bold text-xs font-mono min-w-[70px]">${fmt(l.price)} <small class="text-amber-300/80">mesos</small></div>`;
          buttonsHtml = isOwnListing
            ? `<button type="button" class="xbtn" data-act="collect" data-v="${l.lid}">Cancel</button>`
            : `<button type="button" class="xbtn" data-act="buy" data-v="${l.lid}" data-pay="meso" ${g.stats.meso >= l.price ? "" : "disabled"}>Buy</button>`;
        }

        return `<div class="ah-row items-center gap-2 py-1 px-1 border-b border-zinc-700/40">
          ${this.goodsCell(l.goods, "ah" + l.lid)}
          <div class="xinfo flex-1 min-w-0">
            ${this.goodsLabel(l.goods)}
            <small class="text-[10px] text-zinc-400 block truncate">${esc(l.seller)}${req ? ` · Lv ${req}` : ""} · <span class="text-zinc-300 font-medium">${durLabel}</span></small>
          </div>
          ${priceHtml}
          ${buttonsHtml}
        </div>`;
      }).join("");
      html = `<div class="ah-bar">${chips}</div><div class="xlist ah">${rows || "<p class='xnote'>No player listings available.</p>"}</div>`;
    } else if (tab === "sell") {
      const rows: string[] = [];
      const row = (key: string, x: Goods) => {
        const v = goodsValue(x);
        const nxEst = Math.max(100, Math.round(v / 100));
        rows.push(`<div class="ah-row items-center gap-1.5 py-1 px-1 border-b border-zinc-700/50">
          ${this.goodsCell(x, "s" + key)}
          <div class="xinfo flex-1 min-w-0">
            ${this.goodsLabel(x)}
            <small class="text-[10px] text-zinc-400 block truncate">Market ≈ ${fmt(v)} · NPC ${x.t === "gear" ? fmt(npcSellPrice(x.gear)) : "—"}</small>
          </div>
          <select class="ah-curr-sel text-[11px] bg-zinc-800 text-zinc-200 border border-zinc-600 rounded px-1 py-1" title="Currency">
            <option value="meso">Mesos</option>
            <option value="nx">NX</option>
            <option value="both">Both</option>
          </select>
          <select class="ah-dur-sel text-[11px] bg-zinc-800 text-zinc-200 border border-zinc-600 rounded px-1 py-1" title="Listing Duration">
            <option value="12">12h</option>
            <option value="24" selected>24h</option>
          </select>
          <div class="flex items-center gap-1">
            <input type="number" min="1" step="1" class="ah-price-meso w-20 px-1.5 py-1 text-xs bg-zinc-900 border border-zinc-600 rounded text-amber-300 font-mono" value="${v}" placeholder="Mesos" title="Price in mesos">
            <input type="number" min="1" step="1" class="ah-price-nx w-16 px-1.5 py-1 text-xs bg-zinc-900 border border-zinc-600 rounded text-pink-300 font-mono" style="display:none;" value="${nxEst}" placeholder="NX" title="Price in NX">
          </div>
          <button type="button" class="xbtn py-1 px-2.5" data-act="list" data-v="${key}">List</button>
        </div>`);
      };
      for (const it of [...g.bag].sort((a, b) => gearValue(b) - gearValue(a))) row(`g:${it.uid}`, { t: "gear", gear: it });
      for (const [id, n] of Object.entries(g.mats)) if (n > 0) row(`m:${id}`, { t: "mat", id: +id, n: Math.min(100, n) });
      for (const [id, n] of Object.entries(g.inv)) if (n > 0) row(`u:${id}`, { t: "use", id: +id, n: Math.min(100, n) });
      html = `<p class="xnote text-xs text-zinc-400 mb-1.5">List items for 12h or 24h. Choose Mesos, NX, or Both. Listing fee: 1% mesos or 100 NX · 5% sales tax.</p><div class="xlist ah tall">${rows.join("") || "<p class='xnote'>Nothing to sell.</p>"}</div>`;
    } else {
      const rows = ah.mine.map((m) => {
        const durLeft = Math.max(0, Math.ceil((m.until - Date.now()) / (3600 * 1000)));
        const isExpired = Date.now() > m.until && !m.sold;
        let statusText = "";
        if (m.sold) {
          const isNx = m.soldCurrency === "nx";
          const net = isNx ? Math.floor((m.priceNx ?? m.price) * (1 - AH_TAX)) : Math.floor(m.price * (1 - AH_TAX));
          statusText = `<span class="deal good">SOLD · Receive ${fmt(net)} ${isNx ? "NX" : "mesos"}</span>`;
        } else if (isExpired) {
          statusText = `<span class="text-rose-400 font-medium">EXPIRED (${m.durationHours}h) · reclaim item</span>`;
        } else {
          statusText = `<span class="text-zinc-400">Listed · ${durLeft}h left (${m.durationHours}h duration)</span>`;
        }

        let priceHtml = "";
        if (m.currency === "both") {
          priceHtml = `<div class="ah-price text-right leading-tight min-w-[70px]"><div class="text-amber-300 font-semibold text-xs font-mono">${fmt(m.price)} <small>M</small></div><div class="text-pink-300 font-semibold text-xs font-mono">${fmt(m.priceNx ?? 0)} <small>NX</small></div></div>`;
        } else if (m.currency === "nx") {
          priceHtml = `<div class="ah-price text-pink-300 font-semibold text-xs font-mono min-w-[70px]">${fmt(m.priceNx ?? m.price)} <small>NX</small></div>`;
        } else {
          priceHtml = `<div class="ah-price text-amber-300 font-semibold text-xs font-mono min-w-[70px]">${fmt(m.price)} <small>mesos</small></div>`;
        }

        return `<div class="ah-row items-center gap-2 py-1 px-1 border-b border-zinc-700/40">
          ${this.goodsCell(m.goods, "my" + m.lid)}
          <div class="xinfo flex-1 min-w-0">
            ${this.goodsLabel(m.goods)}
            <small class="text-[10px] block truncate">${statusText}</small>
          </div>
          ${priceHtml}
          <button type="button" class="xbtn ${m.sold ? "gold" : isExpired ? "warn" : ""}" data-act="collect" data-v="${m.lid}">${m.sold ? "Collect" : isExpired ? "Reclaim" : "Cancel"}</button>
        </div>`;
      }).join("");
      html = `<div class="xlist ah tall">${rows || "<p class='xnote'>You have no listings. Sell items from the SELL tab.</p>"}</div>`;
    }
    body.innerHTML = `<div class="xtabs">${tabs}</div>${html}<div class="inv-foot flex items-center justify-between"><span class="tip-dim">${ah.listings.length} listings</span><div class="flex items-center gap-3"><span class="text-pink-300 text-xs font-mono font-semibold">NX: ${fmt(g.stats.nx ?? 0)}</span><span class="meso">${fmt(g.stats.meso)}</span></div></div>`;
  }

  // ------------------------------------------------------------- offline rewards
  showOffline(r: { seconds: number; kills: number; exp: number; meso: number; mats: Record<number, number>; gear: Gear[] }) {
    this.offline?.remove();
    const box = el("div", "offline", document.body);
    this.offline = box;
    const mats = Object.entries(r.mats).filter(([, n]) => n > 0).map(([id, n]) => `<div class="gcell">${icon(matIcon(+id))}<span class="cnt">${n}</span></div>`).join("");
    const gear = r.gear.map((g) => `<div class="gcell r${g.rarity}">${icon(gearIcon(g.id))}</div>`).join("");
    box.innerHTML = `<div class="offline-card win-css">
      <div class="win-titlebar">
        <span class="win-title">WELCOME BACK</span>
        <button type="button" class="win-close off-close" title="Close (Claim later)">✕</button>
      </div>
      <div class="off-body">
        <p class="off-lead">Your character kept hunting for <b>${dur(r.seconds)}</b> while you were away.</p>
        <div class="off-grid">
          <span>Monsters defeated</span><b>${fmt(r.kills)}</b>
          <span>EXP</span><b>${fmt(r.exp)}</b>
          <span>Mesos</span><b>${fmt(r.meso)}</b>
        </div>
        ${(mats || gear) ? `<div class="off-items">${mats}${gear}</div>` : ""}
        <div class="off-btns">
          <button type="button" class="xbtn big gold off-claim-btn">Claim Rewards</button>
          <button type="button" class="xbtn big off-later-btn">Later</button>
        </div>
        <p class="tip-dim off-note">Offline rewards accumulate while logged out (up to 24h) and can only be claimed once.</p>
      </div>
    </div>`;

    const claimBtn = box.querySelector<HTMLButtonElement>(".off-claim-btn");
    const closeBtn = box.querySelector<HTMLButtonElement>(".off-close");
    const laterBtn = box.querySelector<HTMLButtonElement>(".off-later-btn");

    claimBtn?.addEventListener("click", () => {
      if (claimBtn.disabled) return;
      claimBtn.disabled = true;
      claimBtn.textContent = "Claimed!";
      this.w.game.claimOffline(r, 1);
      setTimeout(() => {
        box.remove();
        this.offline = null;
        this.sig = {};
      }, 300);
    });

    const closeDialog = () => {
      box.remove();
      this.offline = null;
      this.sig = {};
    };
    closeBtn?.addEventListener("click", closeDialog);
    laterBtn?.addEventListener("click", closeDialog);
  }

  // ------------------------------------------------------------- per frame
  renderHud() {
    const g = this.w.game, s = g.stage, need = g.stageNeed;
    const ready = g.bossReady();
    const reqSf = g.requiredStarForce(s.n);
    const playerSf = g.totalStarForce();
    const sfMul = g.starForceMultiplier(playerSf, reqSf).dmgMul;
    const sfColor = sfMul >= 1.5 ? "#34d399" : sfMul >= 1.0 ? "#facc15" : "#f87171";
    const sfTag = reqSf > 0 ? `<span class="st-sf" style="color:${sfColor};font-weight:700;margin-left:4px;" title="Star Force: Deal ${Math.round(sfMul * 100)}% DMG (150% at 1.5x requirement)">★${playerSf}/${reqSf}</span>` : "";
    const sig = `${s.n}|${s.kills}|${ready}|${!!g.boss}|${g.bossLoading}|${g.combatPower()}|${g.auto.boss}|${playerSf}|${reqSf}`;
    if (sig !== this.sig.hud) {
      this.sig.hud = sig;
      const bossName = (g.mobData.get(g.bossFor())?.name ?? "Stage Boss").trim();
      this.stageHud.innerHTML = `<div class="st-top"><span class="st-n">STAGE ${s.n} ${sfTag}</span><span class="st-cp">CP ${fmt(g.combatPower())}</span></div>
        <div class="st-bar"><div class="st-fill" style="width:${Math.min(100, (s.kills / need) * 100)}%"></div><span>${g.boss ? "BOSS BATTLE" : `${Math.min(s.kills, need)} / ${need}`}</span></div>
        <div class="st-actions">
          <button type="button" class="auto-boss-toggle ${g.auto.boss ? "on" : ""}" title="Toggle Auto Boss Challenge"><span class="auto-dot"></span>AUTO BOSS: ${g.auto.boss ? "ON" : "OFF"}</button>
          ${ready ? `<button type="button" class="boss-go" ${g.bossLoading ? "disabled" : ""}>${g.bossLoading ? "SUMMONING…" : `BOSS · ${esc(bossName)}`}</button>` : ""}
        </div>`;
    }
    const m = g.boss;
    if (m) {
      const fill = this.bossBar.querySelector<HTMLElement>(".boss-fill");
      if (fill) fill.style.width = `${Math.max(0, (m.hp / m.maxHp) * 100)}%`;
      const num = this.bossBar.querySelector<HTMLElement>(".boss-num");
      if (num) num.textContent = `${fmt(Math.max(0, m.hp))} / ${fmt(m.maxHp)}`;
      const tm = this.bossBar.querySelector<HTMLElement>(".boss-time");
      if (tm) { const t = Math.max(0, Math.ceil(g.bossTimer)); tm.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; tm.classList.toggle("warn", t <= 20); }
    }
  }

  update() {
    const g = this.w.game;
    this.renderHud();
    const vis = (e: HTMLElement) => !e.classList.contains("hidden");
    const run = (k: string, e: HTMLElement, sig: () => string, f: () => void) => {
      if (!vis(e)) return;
      const s = sig();
      if (s !== this.sig[k]) { this.sig[k] = s; f(); }
    };
    // Don't re-render while the user is typing a price.
    const typing = document.activeElement?.closest("#ah-win") && document.activeElement?.tagName === "INPUT";
    run("eq", this.equipWin, () => JSON.stringify([g.eq, g.visualEq, this.equipTab, g.stats.level, g.look, g.stats.maxHp, g.damageSkin, g.buffs["1101006"] ? 1 : 0]), () => this.renderEquip());
    run("inv", this.invWin, () => JSON.stringify([this.invTab.cur, g.bag.length, g.bag.map((b) => b.uid + b.star + b.rarity).join(), g.inv, g.mats, g.stats.meso, g.stats.level]), () => this.renderInv());
    run("craft", this.craftWin, () => JSON.stringify([this.craftTab.cur, this.pick, this.lastResult, g.mats, g.stats.meso, g.stats.level, g.bag.length, g.eq, g.bag.map((b) => b.uid + b.star + b.rarity).join()]), () => this.renderCraft());
    if (!typing) run("ah", this.ahWin, () => JSON.stringify([this.ahTab.cur, this.ahFilter, g.ah.listings.length, g.ah.listings[0]?.lid, g.ah.mine.map((m) => m.lid + m.sold), g.stats.meso, g.stats.nx, this.ahTab.cur === "sell" ? [g.bag.length, g.mats, g.inv] : 0, this.ahTab.cur === "mine" ? Math.floor(Date.now() / 30000) : 0]), () => this.renderAh());

    // Character preview idle animation inside equipment window
    if (vis(this.equipWin)) {
      const activeWeapon = g.visualEq.weapon ?? g.eq.weapon;
      const weaponId = activeWeapon ? activeWeapon.id : 0;
      const standAnim = weaponId ? getWeaponStandAnim(weaponId) : "stand1";
      const f = Math.floor(Date.now() / 500) % 3;
      const img = this.equipWin.querySelector<HTMLImageElement>(".eprev-char");
      if (img) {
        const url = charUrlFor(g.look, standAnim, f);
        if (img.getAttribute("src") !== url) {
          img.src = url;
          this.equipAnimFrame = f;
        }
      }
    }
  }
}

