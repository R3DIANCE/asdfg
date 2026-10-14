// Quick slots (drag/drop), Stat / Skill / Item / Auto windows, buff bar, tooltips and chat balloon.
import { ExtWindows } from "./windows2.ts";
import { expToLevel, charUrlFor } from "./game.ts";
import type { Game, ChatKind } from "./game.ts";
import { cacheAsset } from "./item-browser.ts";
import {
  ITEMS, JOB_TABS, KEY_BADGES, KEY_LABEL, QUICK_KEYS, SKILL, SKILL_DEFS, TAB_LEVEL, WEAPON_ICON,
  cleanDesc, itemIcon, classFor, type Action, type ClassId,
} from "./skills.ts";

import { el, bg, fmt } from "./util.ts";
import type { Sprite } from "./assets.ts";
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
  buffBar: HTMLElement;
  balloon: HTMLElement; balloonText: HTMLElement;
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
    this.balloon = el("div", "balloon hidden", hudRoot);
    this.buildBalloon();
    this.balloonText = this.balloon.querySelector(".balloon-text") as HTMLElement;
    this.autoBtn = el("button", "auto-btn auto-battle-btn", hudRoot);
    this.autoBtn.innerHTML = `<span class="auto-dot"></span>AUTO`;
    this.autoBtn.title = "Toggle auto battle (B). Right-click for settings.";
    this.autoBtn.addEventListener("click", () => this.toggleAutoBattle());
    this.autoBtn.addEventListener("contextmenu", (e) => { e.preventDefault(); this.toggle(this.autoWin); });

    this.autoBossBtn = el("button", "auto-btn auto-boss-btn", hudRoot);
    this.autoBossBtn.innerHTML = `<span class="auto-dot"></span>AUTO BOSS`;
    this.autoBossBtn.title = "Toggle Auto Boss Challenge. Right-click for settings.";
    this.autoBossBtn.addEventListener("click", () => {
      this.game.auto.boss = !this.game.auto.boss;
      this.game.onChat("notice", this.game.auto.boss ? "Auto Boss is ON. Stage boss will be challenged automatically." : "Auto Boss is OFF.");
      this.game.onChange();
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
    this.ext = new ExtWindows(this);

    // All windows start closed by default; toggled via dedicated menu buttons or hotkeys

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
    this.game.onChat("notice", a.battle ? "Auto Battle is ON. Your character will hunt, loot and heal on its own. Press B or any arrow key to take over." : "Auto Battle is OFF.");
    this.game.onChange();
  }

  // ------------------------------------------------------------- generic window
  makeWindow(id: string, w: number, h: number, title: string | null, x: number, y: number) {
    return createWin({ id, w, h, title, x, y, layer: this.layer, nextZ: () => ++this.z });
  }

  toggle(w: HTMLElement) {
    w.classList.toggle("hidden");
    if (!w.classList.contains("hidden")) {
      w.style.zIndex = String(++this.z);
      this.lastStat = this.lastSkill = this.lastItem = "";
      clampWindow(w);
    }
  }
  closeTop() {
    const open = [...this.layer.querySelectorAll<HTMLElement>(".win:not(.hidden)")].sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex));
    if (open[0]) { open[0].classList.add("hidden"); return true; }
    return false;
  }

  // ------------------------------------------------------------- tooltips
  showTip(html: string, x: number, y: number) {
    this.tip.innerHTML = html;
    this.tip.classList.remove("hidden");
    if (html.includes("ms-tooltip-card")) {
      this.tip.classList.add("card-mode");
    } else {
      this.tip.classList.remove("card-mode");
    }
    this.tip.style.zIndex = "100000";
    const r = this.tip.getBoundingClientRect();
    const posX = x + 14 + r.width > innerWidth - 8 ? Math.max(8, x - r.width - 12) : x + 14;
    const posY = Math.max(8, Math.min(innerHeight - r.height - 8, y + 14));
    this.tip.style.left = `${posX}px`;
    this.tip.style.top = `${posY}px`;
  }
  hideTip() { this.tip.classList.add("hidden"); }
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
        const target = (document.elementFromPoint(u.clientX, u.clientY) as HTMLElement | null)?.closest<HTMLElement>(".slot[data-key]");
        const q = this.game.quick;
        if (target) {
          const to = target.dataset.key!;
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
    this.game.onJobAdvancementReady = (tier) => {
      this.openJobAdvancement(tier);
    };
    this.jobAdvWin.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-job]");
      if (btn?.dataset.job) {
        const jid = btn.dataset.job as ClassId;
        this.game.advanceJob(jid);
        this.jobAdvWin.classList.add("hidden");
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
        <div class="p-4 bg-slate-800/80 rounded border border-slate-600/70 text-center flex flex-col items-center gap-3">
          <div class="text-xl font-black text-amber-300">${s.job} → ${nextJobName}</div>
          <p class="text-xs text-slate-300">Unlocks powerful new skills in tier ${tier}, bonus +5 AP, and +5 SP.</p>
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
        <div class="ability-tier"><span class="ability-ribbon">🎖</span> Epic Ability</div>
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
    const w = this.makeWindow("skill-win", 320, 420, "SKILLS", 400, 110);
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
      t.textContent = i === 0 ? "Beginner" : `${i}${["", "st", "nd", "rd"][i]} · ${name}`;
      t.addEventListener("click", () => { this.skillTab = i as 0 | 1 | 2 | 3; this.lastSkill = ""; });
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

  // ------------------------------------------------------------- transient logs (bottom right, no background)
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
    const sig = ids.map((id) => `${id}:${Math.ceil(g.buffs[id].left)}`).join("|");
    if (sig === this.lastBuffs) return;
    this.lastBuffs = sig;
    const existing = new Map([...this.buffBar.children].map((c) => [(c as HTMLElement).dataset.id!, c as HTMLElement]));
    for (const [id, c] of existing) if (!g.buffs[id]) c.remove();
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
  }

  // ------------------------------------------------------------- chat balloon
  buildBalloon() {
    const b = this.balloon;
    b.innerHTML = `<div class="balloon-body"><span class="balloon-text"></span><div class="balloon-beak"></div></div>`;
    this.balloonText = b.querySelector(".balloon-text") as HTMLElement;
  }
  renderBalloon(px: number, py: number) {
    const g = this.game;
    if (g.balloon.t <= 0) { this.balloon.classList.add("hidden"); return; }
    if (this.balloonText.textContent !== g.balloon.text) this.balloonText.textContent = g.balloon.text;
    this.balloon.classList.remove("hidden");
    this.balloon.style.transform = `translate(${px}px, ${py - 32}px) translate(-50%, -100%)`;
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
    const on = this.game.auto.battle;
    this.autoBtn.classList.toggle("on", on);
    if (this.autoBossBtn) this.autoBossBtn.classList.toggle("on", this.game.auto.boss);
    (this.autoWin as any)._sync?.();
  }
}
