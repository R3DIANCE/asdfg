// Modular Chat Component — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
// Translucent WebGPU glass aesthetic, persistent message & command history, channel filters, auto-scroll on new messages
import { ComponentBase } from "@orillusion/core";
import type { ChatKind, Game } from "../game.ts";
import { el, esc } from "../util.ts";
import { lucideIcon } from "../lucide.ts";
import { GEAR, MATS } from "../items.ts";
import { ITEMS } from "../skills.ts";
import { renderGearTooltip, renderUseTooltip, renderMatTooltip } from "../tooltip.ts";
import { PartyClient } from "../party.ts";
import { DAMAGE_SKIN_PRESETS } from "../systems/damage-skin-system.ts";
import { setUiMode, type UiMode } from "../systems/ui-mode.ts";

export type ChatFilter = "all" | "say" | "party" | "guild" | "whisper";

export interface ChatEntry {
  id: string;
  kind: ChatKind;
  text: string;
  name?: string;
  content: string;
  time: string;
  badge: string;
  badgeClass: string;
  itemLink?: any;
  timestamp?: number;
}

let chatTooltipEl: HTMLElement | null = null;
function getChatTooltip(): HTMLElement {
  if (!chatTooltipEl) {
    chatTooltipEl = document.createElement("div");
    chatTooltipEl.className = "tooltip hidden";
    chatTooltipEl.style.position = "fixed";
    chatTooltipEl.style.zIndex = "100000";
    chatTooltipEl.style.pointerEvents = "none";
    document.body.appendChild(chatTooltipEl);
  }
  return chatTooltipEl;
}

function showChatTooltip(html: string, x: number, y: number) {
  const tip = getChatTooltip();
  tip.innerHTML = html;
  tip.classList.remove("hidden");
  if (html.includes("ms-tooltip-card")) {
    tip.classList.add("card-mode");
  } else {
    tip.classList.remove("card-mode");
  }
  tip.style.zIndex = "100000";
  const r = tip.getBoundingClientRect();
  const posX = x + 14 + r.width > innerWidth - 8 ? Math.max(8, x - r.width - 12) : x + 14;
  const posY = Math.max(8, Math.min(innerHeight - r.height - 8, y + 14));
  tip.style.left = `${posX}px`;
  tip.style.top = `${posY}px`;
}

function hideChatTooltip() {
  if (chatTooltipEl) chatTooltipEl.classList.add("hidden");
}

export class ChatComponent extends ComponentBase {
  root!: HTMLElement;
  header!: HTMLElement;
  tabs!: HTMLElement;
  log!: HTMLElement;
  input!: HTMLInputElement;
  minBtn!: HTMLButtonElement;
  filter: ChatFilter = "all";
  minimized = false;
  idleTimer = 0;
  isFocused = false;

  history: ChatEntry[] = [];
  cmdHistory: string[] = [];
  cmdHistoryIdx = -1;
  draftInput = "";

  // Registered item links waiting to be sent
  pendingItemLinks: Map<string, any> = new Map();
  // Sent or received item links cache by id
  itemLinkStore: Map<string, any> = new Map();

  // Quick whisper (@charactername) suggestions state
  suggestPopup!: HTMLElement;
  suggestListEl!: HTMLElement;
  suggestOpen = false;
  suggestions: { name: string; level?: number; job?: string; online?: boolean; recent?: boolean }[] = [];
  suggestIdx = 0;
  suggestPrefix = "@";
  suggestCache: Map<string, { name: string; level?: number; job?: string; online?: boolean }> = new Map();
  recentWhispers: string[] = [];
  lastSuggestFetch = 0;

  private parentEl!: HTMLElement;
  private game!: Game;

  constructor(parent?: HTMLElement | { parent: HTMLElement; game: Game }, game?: Game) {
    super();
    if (parent && !(parent instanceof HTMLElement) && (parent as any).parent && (parent as any).game) {
      this.init(parent as any);
    } else if (parent instanceof HTMLElement && game) {
      this.parentEl = parent;
      this.game = game;
      this.initComponent();
    }
  }

  public override init(param?: { parent: HTMLElement; game: Game }): void {
    super.init(param);
    if (param?.parent && param?.game && !this.root) {
      this.parentEl = param.parent;
      this.game = param.game;
      this.initComponent();
    }
  }

  public override start(): void {
    // Orillusion lifecycle start hook
  }

  public override onUpdate(): void {
    // Orillusion lifecycle per-frame update hook
  }

  public override destroy(force?: boolean): void {
    super.destroy(force);
    clearTimeout(this.idleTimer);
    hideChatTooltip();
    this.root?.remove();
  }

  public startQuickWhisper(targetName: string) {
    const clean = targetName.replace(/^(@|To\s+@?|From\s+@?)/i, "").trim();
    if (!clean) return;
    if (this.minimized) this.toggleMinimize();
    this.expand();
    this.input.value = `@${clean} `;
    this.input.focus();
    const len = this.input.value.length;
    this.input.setSelectionRange(len, len);
    this.hideSuggestions();
  }

  public rememberWhisperPeer(name: string) {
    const clean = name.replace(/^@/, "").trim();
    if (!clean) return;
    this.recentWhispers = [clean, ...this.recentWhispers.filter((n) => n.toLowerCase() !== clean.toLowerCase())].slice(0, 10);
  }

  private async fetchSuggestDirectory() {
    const now = Date.now();
    if (now - this.lastSuggestFetch < 4000) return;
    this.lastSuggestFetch = now;
    try {
      const res = await fetch("/api/players/suggest", { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.players)) {
          for (const p of data.players) {
            if (!p?.name) continue;
            this.suggestCache.set(p.name.toLowerCase(), {
              name: p.name,
              level: p.level || 1,
              job: p.job || "Beginner",
              online: Boolean(p.online),
            });
          }
          if (this.isFocused) {
            this.updateSuggestions();
          }
        }
      }
    } catch {}
  }

  private collectWhisperCandidates(query: string) {
    const byName = new Map<string, { name: string; level?: number; job?: string; online?: boolean; recent?: boolean }>();
    const selfName = (this.game?.stats?.name || "").trim();

    const upsert = (name: string, info?: { level?: number; job?: string; online?: boolean; recent?: boolean }) => {
      const clean = (name || "").trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      const prev = byName.get(key);
      byName.set(key, {
        name: prev?.name || clean,
        level: info?.level ?? prev?.level,
        job: info?.job ?? prev?.job,
        online: Boolean(info?.online || prev?.online),
        recent: Boolean(info?.recent || prev?.recent),
      });
    };

    for (const rName of this.recentWhispers) {
      upsert(rName, { recent: true });
    }
    for (const entry of this.history) {
      if (entry.name) {
        const cleanSpeaker = entry.name.replace(/^(To\s+@?|From\s+@?|@)/i, "").trim();
        if (cleanSpeaker && cleanSpeaker.toLowerCase() !== "system") {
          upsert(cleanSpeaker, { recent: entry.kind === "whisper" });
        }
      }
    }
    for (const [_, cached] of this.suggestCache) {
      upsert(cached.name, cached);
    }
    if (this.game?.remotePlayers) {
      for (const [_, rp] of this.game.remotePlayers) {
        if (rp.name) {
          upsert(rp.name, { level: rp.level || 1, job: rp.job || "Beginner", online: true });
        }
      }
    }
    if (this.game?.party?.members) {
      for (const m of this.game.party.members) {
        if (m.name) {
          upsert(m.name, { level: m.level, job: m.job, online: m.online });
        }
      }
    }
    if (this.game?.guild?.members) {
      for (const m of this.game.guild.members) {
        if (m.name) {
          upsert(m.name, { level: m.level, job: m.job, online: m.online });
        }
      }
    }
    if (selfName) {
      upsert(selfName, {
        level: this.game?.stats?.level || 1,
        job: this.game?.stats?.job || "Beginner",
        online: true,
      });
    }

    const q = query.toLowerCase();
    const selfKey = selfName.toLowerCase();
    const allMatches = Array.from(byName.values()).filter((c) => !q || c.name.toLowerCase().includes(q));
    // Exclude self unless it's the only match or explicitly typed
    const filtered = allMatches.length > 1 ? allMatches.filter((c) => c.name.toLowerCase() !== selfKey || (q && selfKey.startsWith(q))) : allMatches;

    filtered.sort((a, b) => {
      const aSelf = a.name.toLowerCase() === selfKey ? 1 : 0;
      const bSelf = b.name.toLowerCase() === selfKey ? 1 : 0;
      if (aSelf !== bSelf) return aSelf - bSelf;
      if (Boolean(a.recent) !== Boolean(b.recent)) return a.recent ? -1 : 1;
      if (Boolean(a.online) !== Boolean(b.online)) return a.online ? -1 : 1;
      const aStarts = q ? a.name.toLowerCase().startsWith(q) : true;
      const bStarts = q ? b.name.toLowerCase().startsWith(q) : true;
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return filtered.slice(0, 6);
  }

  private updateSuggestions() {
    const val = this.input.value;
    const atMatch = val.match(/^(@)([A-Za-z0-9_]*)$/);
    const slashMatch = val.match(/^(\/(?:w|whisper|f|friend)\s+)([A-Za-z0-9_]*)$/i);
    const match = atMatch || slashMatch;

    if (!match) {
      this.hideSuggestions();
      return;
    }

    this.suggestPrefix = match[1];
    const query = match[2] || "";
    this.fetchSuggestDirectory();

    const list = this.collectWhisperCandidates(query);
    this.suggestions = list;
    if (list.length === 0) {
      this.hideSuggestions();
      return;
    }

    if (this.suggestIdx >= list.length || this.suggestIdx < 0) {
      this.suggestIdx = 0;
    }
    this.suggestOpen = true;
    this.renderSuggestions(query);
  }

  private renderSuggestions(query: string) {
    if (!this.suggestPopup || !this.suggestListEl) return;
    this.suggestPopup.classList.remove("hidden");
    this.suggestListEl.innerHTML = "";

    const qLower = query.toLowerCase();
    this.suggestions.forEach((item, idx) => {
      const row = el("div", `chat-suggest-item ${idx === this.suggestIdx ? "active" : ""}`, this.suggestListEl);
      const nameLower = item.name.toLowerCase();
      const matchPos = qLower ? nameLower.indexOf(qLower) : -1;
      let formattedName = esc(item.name);
      if (matchPos >= 0 && query.length > 0) {
        const before = esc(item.name.slice(0, matchPos));
        const mid = esc(item.name.slice(matchPos, matchPos + query.length));
        const after = esc(item.name.slice(matchPos + query.length));
        formattedName = `${before}<span class="chat-suggest-match">${mid}</span>${after}`;
      }

      const metaParts: string[] = [];
      if (item.level) metaParts.push(`Lv.${item.level}`);
      if (item.job) metaParts.push(esc(item.job));
      const metaText = metaParts.join(" · ");

      row.innerHTML = `
        <div class="chat-suggest-left">
          <span class="chat-suggest-dot ${item.online ? "online" : "offline"}" title="${item.online ? "Online" : "Offline"}"></span>
          <span class="chat-suggest-at">@</span><span class="chat-suggest-name">${formattedName}</span>
          ${item.recent ? `<span class="chat-suggest-tag">Recent</span>` : ""}
        </div>
        <div class="chat-suggest-right">
          ${metaText ? `<span class="chat-suggest-meta">${metaText}</span>` : ""}
          <span class="chat-suggest-status ${item.online ? "online" : "offline"}">${item.online ? "Online" : "Saved"}</span>
        </div>
      `;

      row.addEventListener("pointerenter", () => {
        this.suggestIdx = idx;
        this.suggestListEl.querySelectorAll(".chat-suggest-item").forEach((elItem, i) => {
          elItem.classList.toggle("active", i === idx);
        });
      });

      row.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.applySuggestion(item);
      });
    });
  }

  private applySuggestion(item: { name: string }) {
    if (!item?.name) return;
    this.input.value = `${this.suggestPrefix}${item.name} `;
    this.hideSuggestions();
    this.input.focus();
    const len = this.input.value.length;
    this.input.setSelectionRange(len, len);
  }

  private hideSuggestions() {
    this.suggestOpen = false;
    this.suggestions = [];
    this.suggestIdx = 0;
    if (this.suggestPopup) {
      this.suggestPopup.classList.add("hidden");
    }
  }

  public insertItemLink(link: { name: string; kind: "gear" | "use" | "mat"; gear?: any; itemId?: number; count?: number }) {
    if (!link || !link.name) return;
    const tag = `[${link.name}]`;
    this.pendingItemLinks.set(link.name.toLowerCase(), link);
    if (this.input.value.length > 0 && !this.input.value.endsWith(" ")) {
      this.input.value += " ";
    }
    this.input.value += tag + " ";
    this.expand();
    this.input.focus();
    const len = this.input.value.length;
    this.input.setSelectionRange(len, len);
  }

  private initComponent() {
    this.root = el("div", "chat idle", this.parentEl);
    this.root.addEventListener("pointerenter", () => this.expand());
    this.root.addEventListener("pointerleave", () => this.collapse(2500));
    this.root.addEventListener("click", () => this.expand());

    // Clean Chat Header with Tabs & Controls
    this.header = el("div", "chat-header", this.root);

    // Dedicated Chat Tabs
    this.tabs = el("div", "chat-tabs", this.header);
    const tabList: { id: ChatFilter; label: string }[] = [
      { id: "all", label: "All" },
      { id: "say", label: "Chat" },
      { id: "whisper", label: "Friends" },
      { id: "guild", label: "Guild" },
      { id: "party", label: "Party" },
    ];
    for (const t of tabList) {
      const tabBtn = el("button", `chat-tab ${t.id === this.filter ? "active" : ""}`, this.tabs) as HTMLButtonElement;
      tabBtn.type = "button";
      tabBtn.textContent = t.label;
      tabBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.tabs.querySelectorAll(".chat-tab").forEach((b) => b.classList.remove("active"));
        tabBtn.classList.add("active");
        this.setFilter(t.id);
        this.updatePlaceholder();
      });
    }

    const ctrls = el("div", "chat-ctrls", this.header);
    this.minBtn = el("button", "chat-ctrl-btn chat-min-btn", ctrls) as HTMLButtonElement;
    this.minBtn.type = "button";
    this.minBtn.innerHTML = lucideIcon("chevron-left", 12);
    this.minBtn.title = "Minimize / Restore Chat Window";
    this.minBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    });

    this.log = el("div", "chat-log", this.root);

    // Quick Whisper (@charactername) Autocomplete Popup
    this.suggestPopup = el("div", "chat-suggest-popup hidden", this.root);
    const suggestHeader = el("div", "chat-suggest-header", this.suggestPopup);
    suggestHeader.innerHTML = `
      <span class="chat-suggest-title">Quick Whisper</span>
      <span class="chat-suggest-hint">↑↓ Navigate · Tab/Enter Select · Esc</span>
    `;
    this.suggestListEl = el("div", "chat-suggest-list", this.suggestPopup);

    // Bottom Input Row
    const inpRow = el("div", "chat-input-row", this.root);

    this.input = el("input", "chat-field", inpRow) as HTMLInputElement;
    this.updatePlaceholder();
    this.input.maxLength = 100;
    this.input.addEventListener("focus", () => {
      this.isFocused = true;
      this.expand();
      this.updateSuggestions();
    });
    this.input.addEventListener("blur", () => {
      this.isFocused = false;
      this.hideSuggestions();
      this.collapse(2500);
    });
    this.input.addEventListener("input", () => {
      this.updateSuggestions();
    });
    this.input.addEventListener("keydown", async (e) => {
      e.stopPropagation();
      if (this.suggestOpen && this.suggestions.length > 0) {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          this.suggestIdx = (this.suggestIdx - 1 + this.suggestions.length) % this.suggestions.length;
          this.suggestListEl.querySelectorAll(".chat-suggest-item").forEach((elItem, i) => {
            elItem.classList.toggle("active", i === this.suggestIdx);
          });
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          this.suggestIdx = (this.suggestIdx + 1) % this.suggestions.length;
          this.suggestListEl.querySelectorAll(".chat-suggest-item").forEach((elItem, i) => {
            elItem.classList.toggle("active", i === this.suggestIdx);
          });
          return;
        }
        if (e.key === "Tab" || e.key === "Enter") {
          const picked = this.suggestions[this.suggestIdx];
          if (picked) {
            e.preventDefault();
            this.applySuggestion(picked);
            return;
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          this.hideSuggestions();
          return;
        }
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (this.cmdHistory.length === 0) return;
        if (this.cmdHistoryIdx === -1) {
          this.draftInput = this.input.value;
          this.cmdHistoryIdx = this.cmdHistory.length - 1;
        } else if (this.cmdHistoryIdx > 0) {
          this.cmdHistoryIdx--;
        }
        this.input.value = this.cmdHistory[this.cmdHistoryIdx] ?? "";
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (this.cmdHistoryIdx === -1) return;
        if (this.cmdHistoryIdx < this.cmdHistory.length - 1) {
          this.cmdHistoryIdx++;
          this.input.value = this.cmdHistory[this.cmdHistoryIdx] ?? "";
        } else {
          this.cmdHistoryIdx = -1;
          this.input.value = this.draftInput;
        }
        return;
      }
      if (e.key === "Enter") {
        const t = this.input.value.trim();
        if (t) {
          // Record command history
          if (this.cmdHistory[this.cmdHistory.length - 1] !== t) {
            this.cmdHistory.push(t);
            if (this.cmdHistory.length > 50) this.cmdHistory.shift();
          }
          this.cmdHistoryIdx = -1;
          this.draftInput = "";

          // Check if message references a pending item link [ItemName]
          let matchedItemLink: any = undefined;
          const linkMatch = t.match(/\[(.*?)\]/);
          if (linkMatch) {
            const rawName = linkMatch[1].trim().toLowerCase();
            matchedItemLink = this.pendingItemLinks.get(rawName);
            if (!matchedItemLink) {
              // Try finding gear or use item by name
              for (const [_, b] of GEAR) {
                if (b.name.toLowerCase() === rawName) {
                  matchedItemLink = { name: b.name, kind: "gear", gear: { id: b.id, uid: "g_" + b.id, star: 0, rarity: 0 } };
                  break;
                }
              }
              if (!matchedItemLink) {
                for (const [id, it] of Object.entries(ITEMS)) {
                  if (it.name.toLowerCase() === rawName) {
                    matchedItemLink = { name: it.name, kind: "use", itemId: Number(id), count: 1 };
                    break;
                  }
                }
              }
              if (!matchedItemLink) {
                for (const [id, name] of MATS) {
                  if (name.toLowerCase() === rawName) {
                    matchedItemLink = { name, kind: "mat", itemId: id, count: 1 };
                    break;
                  }
                }
              }
            }
          }

          const cmd = t.toLowerCase();
          // Secret commands to open GM Debug Tool and set GM status
          if (cmd === "/op") {
            this.game.setGm(true);
            window.dispatchEvent(new CustomEvent("toggle-debug-win-force"));
            this.game.onChat("notice", "★ [Secret Access] GameMaster privileges granted! GM Debug Tool opened. (Press F1 anytime)");
          } else if (cmd === "/debug" || cmd === "/gm" || cmd === "/help gm" || cmd === "/admin") {
            if (!this.game.isGm()) {
              this.game.setGm(true);
              this.game.onChat("notice", "★ [GM Access] GameMaster privileges enabled! Opening GM Debug Tool (F1).");
            } else {
              this.game.onChat("system", "[GM] Toggled GM Control Panel (Hotkey: F1).");
            }
            window.dispatchEvent(new CustomEvent("toggle-debug-win-force"));
          } else if (t.startsWith("/gm ") || t.startsWith("/gmauth ")) {
            const pass = t.replace(/^\/(gm|gmauth)\s+/, "").trim();
            if (pass === "off" || pass === "disable") {
              this.game.setGm(false);
              this.game.onChat("system", "[GM] GameMaster privileges relinquished. Operating as regular player.");
            } else {
              this.game.setGm(true);
              window.dispatchEvent(new CustomEvent("toggle-debug-win-force"));
              this.game.onChat("notice", "★ [GM Auth] GameMaster privileges granted! Welcome, GM. (Press F1 to open GM Panel)");
            }
          } else if (cmd === "/gmoff" || cmd === "/deop" || cmd === "/gm off") {
            this.game.setGm(false);
            this.game.onChat("system", "[GM] GameMaster privileges relinquished. Operating as regular player.");
          } else if (cmd === "/gmeffect" || cmd === "/aura" || cmd === "/gmaura" || cmd === "/gm effect" || cmd === "/gm aura" || cmd === "/gmhat" || cmd === "/wizethat") {
            this.game.toggleGmEffect();
          } else if (cmd === "/uimode" || cmd === "/ui" || cmd === "/switchui") {
            const next = this.game.uiMode === "new" ? "old" : "new";
            setUiMode(next);
            this.game.onChat("notice", `★ [UI Mode] Switched to ${next.toUpperCase()} UI (${next === "new" ? "WebGPU Canvas WZ HUD" : "Classic Modern DOM HUD"}). Press F2 to toggle anytime.`);
          } else if (cmd === "/uimode new" || cmd === "/ui new") {
            setUiMode("new");
            this.game.onChat("notice", "★ [UI Mode] Switched to NEW UI (WebGPU Canvas WZ HUD).");
          } else if (cmd === "/uimode old" || cmd === "/ui old") {
            setUiMode("old");
            this.game.onChat("notice", "★ [UI Mode] Switched to OLD UI (Classic Modern DOM HUD).");
          } else if (cmd === "/gmonline" || cmd === "/roster" || cmd === "/players") {
            const gmTab = document.querySelector(".gm-collapse-tab") as HTMLElement;
            gmTab?.click();
          } else if (cmd === "/logout" || cmd === "/switchchar" || cmd === "/relog" || cmd === "/changechar") {
            if (window.__persist) {
              try { await window.__persist(); } catch { }
            }
            sessionStorage.setItem("ms_skip_autologin", "1");
            location.reload();
          } else if (t === "/sync" || t === "/resync" || t === "/reconnect") {
            this.game.syncAll(true);
            this.game.onChat("system", "[Sync] WebSocket connection and player state synchronized with server.");
          } else if (t.startsWith("/name ") || t.startsWith("/nick ") || t.startsWith("/rename ")) {
            const newName = t.replace(/^\/(name|nick|rename)\s+/, "").trim();
            if (newName) {
              this.game.setName(newName);
            } else {
              this.game.onChat("system", "Usage: /name <newName>");
            }
          } else if (t.startsWith("/g ") || t.startsWith("/guild ")) {
            const msg = t.replace(/^\/(g|guild)\s+/, "").trim();
            if (msg) {
              this.game.sendChat(msg, "guild", matchedItemLink);
            }
          } else if (t.startsWith("/p ") || t.startsWith("/party ") || t === "/p" || t === "/party") {
            const raw = t.replace(/^\/(p|party)\s*/, "").trim();
            if (raw.startsWith("force ") && this.game.isGm()) {
              const target = raw.replace(/^force\s+/, "").trim();
              if (target) {
                PartyClient.forceJoin(this.game.stats.name, target).then((res) => {
                  if (res.ok) {
                    this.game.onChat("notice", `★ [GM] Forced ${target} into your party!`);
                    this.game.loadParty();
                  } else {
                    this.game.onChat("system", `[Party] ${res.error || "Failed to force party join."}`);
                  }
                });
              } else {
                this.game.onChat("system", "Usage: /party force <playerName>");
              }
            } else if (raw.startsWith("invite ")) {
              const target = raw.replace(/^invite\s+/, "").trim();
              if (target) {
                if (!this.game.partyId) {
                  this.game.onChat("system", "[Party] You are not in a party. Create one first with /party create.");
                } else {
                  PartyClient.invite(this.game.partyId, this.game.stats.name, target).then((res) => {
                    if (res.ok) {
                      this.game.onChat("notice", `[Party] Invited ${target} to the party.`);
                    } else {
                      this.game.onChat("system", `[Party] ${res.error || "Failed to send party invite."}`);
                    }
                  });
                }
              }
            } else if (raw === "leave") {
              PartyClient.leave(this.game.stats.name).then((res) => {
                if (res.ok) {
                  this.game.party = null;
                  this.game.partyId = undefined;
                  this.game.onChat("notice", "[Party] You left the party.");
                  this.game.onChange();
                } else {
                  this.game.onChat("system", `[Party] ${res.error || "Failed to leave party."}`);
                }
              });
            } else if (raw === "create") {
              PartyClient.createParty(
                this.game.stats.name,
                this.game.stats.level,
                this.game.stats.job,
                this.game.map?.id || 910000000,
                this.game.stats.hp,
                this.game.stats.maxHp,
                this.game.look,
                this.game.stats.mp,
                this.game.stats.maxMp
              ).then((res) => {
                if (res.ok && res.party) {
                  this.game.party = res.party;
                  this.game.partyId = res.party.id;
                  this.game.onChat("notice", "[Party] Party created! Invite friends with /party invite <name> or press P.");
                  this.game.onChange();
                } else {
                  this.game.onChat("system", `[Party] ${res.error || "Failed to create party."}`);
                }
              });
            } else if (raw === "accept") {
              const pendingInvite = (window as any).__lastPartyInvite;
              if (pendingInvite?.partyId) {
                PartyClient.join(
                  pendingInvite.partyId,
                  this.game.stats.name,
                  this.game.stats.level,
                  this.game.stats.job,
                  this.game.map?.id || 910000000,
                  this.game.stats.hp,
                  this.game.stats.maxHp,
                  this.game.look,
                  this.game.stats.mp,
                  this.game.stats.maxMp
                ).then((res) => {
                  if (res.ok && res.party) {
                    this.game.party = res.party;
                    this.game.partyId = res.party.id;
                    this.game.onChat("notice", `[Party] Joined ${pendingInvite.inviter || "the"}'s party!`);
                    delete (window as any).__lastPartyInvite;
                    this.game.onChange();
                  } else {
                    this.game.onChat("system", `[Party] ${res.error || "Failed to join party."}`);
                  }
                });
              } else {
                this.game.onChat("system", "[Party] No pending party invite to accept.");
              }
            } else if (raw) {
              this.game.sendChat(raw, "party", matchedItemLink);
            } else {
              window.dispatchEvent(new CustomEvent("toggle-party-win"));
            }
          } else if (t.startsWith("@")) {
            const m = t.match(/^@([A-Za-z0-9_]+)(?:\s*:\s*|\s+)?(.*)$/);
            const target = m?.[1]?.trim() || "";
            const msg = m?.[2]?.trim() || "";
            if (target && msg) {
              this.rememberWhisperPeer(target);
              this.game.sendChat(msg, "whisper", matchedItemLink, target);
            } else if (target) {
              this.input.value = `@${target} `;
              const len = this.input.value.length;
              this.input.setSelectionRange(len, len);
              this.hideSuggestions();
              return;
            } else {
              this.game.onChat("system", "Usage: @<charactername> <message>");
            }
          } else if (t.startsWith("/w ") || t.startsWith("/whisper ") || t.startsWith("/f ") || t.startsWith("/friend ")) {
            const parts = t.replace(/^\/(w|whisper|f|friend)\s+/, "").trim().split(/\s+/);
            const target = parts[0]?.replace(/^@/, "");
            const msg = parts.slice(1).join(" ");
            if (target && msg) {
              this.rememberWhisperPeer(target);
              this.game.sendChat(msg, "whisper", matchedItemLink, target);
            } else {
              this.game.onChat("system", "Usage: @<name> <message> or /w <name> <message>");
            }
          } else if (t.startsWith("/r ") || t.startsWith("/reply ")) {
            const msg = t.replace(/^\/(r|reply)\s+/, "").trim();
            const target = this.recentWhispers[0];
            if (target && msg) {
              this.rememberWhisperPeer(target);
              this.game.sendChat(msg, "whisper", matchedItemLink, target);
            } else if (!target) {
              this.game.onChat("system", "[Whisper] No recent whisper contact to reply to.");
            } else {
              this.game.onChat("system", "Usage: /r <message>");
            }
          } else if (t.startsWith("/skin ") || t === "/skin") {
            const raw = t.replace(/^\/skin\s*/, "").trim();
            if (raw) {
              const sid = isNaN(Number(raw)) ? raw : Number(raw);
              this.game.setDamageSkin(sid);
            } else {
              this.game.onChat("system", "Usage: /skin <id or preset> (e.g., /skin 1, /skin 2, /skin 50). Type /skins to view presets.");
            }
          } else if (t === "/skins") {
            const list = DAMAGE_SKIN_PRESETS.map((p) => `${p.name} (${p.id})`).join(", ");
            this.game.onChat("notice", `★ [Damage Skins] Presets: ${list}. Any ID 1-641 from WZ supported!`);
          } else if (t === "/logout" || t === "/exit") {
            this.game.lastLogoutAt = Date.now();
            if (window.__persist) {
              try { await window.__persist(); } catch {}
            }
            try {
              localStorage.removeItem("ms_current_user");
              localStorage.removeItem("ms_current_character");
            } catch {}
            sessionStorage.setItem("ms_skip_autologin", "1");
            location.reload();
          } else if (t === "/switchchar" || t === "/relog" || t === "/changechar") {
            this.game.lastLogoutAt = Date.now();
            if (window.__persist) {
              try { await window.__persist(); } catch {}
            }
            sessionStorage.setItem("ms_skip_autologin", "1");
            location.reload();
          } else if (t === "/help" || t === "/commands") {
            const baseHelp = "[Commands] @<player> <msg> (quick whisper) | /r <msg> (reply) | /g <msg> | /p <msg> | /name <newName> | /skin <id>";
            this.game.onChat("system", `${baseHelp} | /gm - GM Panel | /sync | /logout`);
          } else if (t.startsWith("/")) {
            const unknownCmd = t.split(" ")[0];
            this.game.onChat("system", `Unknown command "${unknownCmd}". Type /help for available commands.`);
          } else {
            // Check active channel routing
            if (this.filter === "guild") {
              this.game.sendChat(t, "guild", matchedItemLink);
            } else if (this.filter === "party") {
              this.game.sendChat(t, "party", matchedItemLink);
            } else if (this.filter === "whisper" && this.recentWhispers[0]) {
              const target = this.recentWhispers[0];
              this.game.sendChat(t, "whisper", matchedItemLink, target);
            } else {
              this.game.say(t, matchedItemLink);
            }
          }
        }
        this.hideSuggestions();
        this.input.value = "";
        this.input.blur();
      } else if (e.key === "Escape") {
        this.hideSuggestions();
        this.input.blur();
      }
    });

    // Global listener for linking items into chat
    window.addEventListener("chat-insert-link", ((e: CustomEvent) => {
      if (e.detail) this.insertItemLink(e.detail);
    }) as EventListener);

    // Global listener for incoming whispers & quick-whisper triggers
    window.addEventListener("chat-whisper-received", ((e: CustomEvent) => {
      if (e.detail?.from) this.rememberWhisperPeer(e.detail.from);
    }) as EventListener);

    window.addEventListener("chat-quick-whisper", ((e: CustomEvent) => {
      if (e.detail?.name) this.startQuickWhisper(e.detail.name);
    }) as EventListener);

    // Global listener for party invite notifications
    window.addEventListener("party-invited", ((e: CustomEvent) => {
      (window as any).__lastPartyInvite = e.detail;
    }) as EventListener);
  }

  private updatePlaceholder() {
    switch (this.filter) {
      case "guild":
        this.input.placeholder = "Guild chat (/g message or @player)...";
        break;
      case "party":
        this.input.placeholder = "Party chat (/p message or @player)...";
        break;
      case "whisper":
        this.input.placeholder = "Whisper: @player message...";
        break;
      case "say":
        this.input.placeholder = "Chat: message or @player to whisper...";
        break;
      case "all":
      default:
        this.input.placeholder = "Press Enter to chat · @player to whisper · ↑/↓ history";
        break;
    }
  }

  get isOpen(): boolean {
    return !this.minimized && !this.root.classList.contains("idle");
  }

  focus() {
    if (this.minimized) this.toggleMinimize();
    this.expand();
    this.input.focus();
  }

  toggle() {
    if (this.minimized) {
      this.toggleMinimize();
      this.focus();
    } else if (document.activeElement === this.input) {
      this.input.blur();
      this.collapse(0);
    } else {
      this.focus();
    }
  }

  expand() {
    clearTimeout(this.idleTimer);
    this.root.classList.remove("idle");
    this.root.classList.add("expanded");
    requestAnimationFrame(() => {
      this.log.scrollTop = this.log.scrollHeight;
    });
  }

  collapse(delay = 2500) {
    clearTimeout(this.idleTimer);
    if (this.isFocused) return;
    this.idleTimer = setTimeout(() => {
      if (!this.isFocused) {
        this.root.classList.remove("expanded");
        this.root.classList.add("idle");
        requestAnimationFrame(() => {
          this.log.scrollTop = this.log.scrollHeight;
        });
      }
    }, delay) as unknown as number;
  }

  toggleMinimize() {
    this.minimized = !this.minimized;
    this.root.classList.toggle("chat-minimized", this.minimized);
    this.minBtn.style.transform = this.minimized ? "rotate(-90deg)" : "none";
    if (!this.minimized) {
      this.minBtn.classList.remove("has-unread");
      requestAnimationFrame(() => {
        this.log.scrollTop = this.log.scrollHeight;
      });
    }
  }

  setFilter(f: ChatFilter) {
    this.filter = f;
    const lines = this.log.querySelectorAll<HTMLElement>(".chat-line");
    for (const line of lines) {
      const k = line.dataset.kind as ChatKind;
      let show = true;
      if (f === "say") show = k === "say";
      else if (f === "whisper") show = k === "whisper";
      else if (f === "party") show = k === "party";
      else if (f === "guild") show = k === "guild";
      line.style.display = show ? "block" : "none";
    }
    requestAnimationFrame(() => {
      this.log.scrollTop = this.log.scrollHeight;
    });
  }

  addMessage(kind: ChatKind, text: string, itemLink?: any) {
    // Only accept chat-related messages: player conversation, whisper, party, guild
    if (kind !== "say" && kind !== "whisper" && kind !== "party" && kind !== "guild") {
      return;
    }
    // Filter out all GM notices, system notices, map welcomes, and game broadcasts
    if (
      text.includes("[GM]") ||
      text.includes("★ [GM") ||
      text.includes("★ [") ||
      text.includes("GameMaster") ||
      text.includes("[Notice]") ||
      text.includes("[System]") ||
      text.includes("[GM Action]") ||
      text.includes("[Damage Skins]") ||
      text.includes("[UI Mode]") ||
      text.includes("[Secret Access]") ||
      text.includes("[Party] Invited") ||
      text.includes("[Party] You left") ||
      text.includes("[Party] Joined") ||
      text.includes("[Guild]") ||
      text.startsWith("★ ")
    ) {
      return;
    }
    if (text.includes("experience") || text.includes("Party EXP") || text.includes("gained exp")) {
      return;
    }
    if (text.includes("Cash Shop") || text.includes("[Cash Shop]")) {
      return;
    }

    // Deduplicate duplicate messages and identical consecutive messages
    const now = Date.now();
    const last = this.history[this.history.length - 1];
    if (last && last.text === text && (now - (last.timestamp ?? 0) < 4000)) {
      return;
    }

    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

    let speaker = "";
    let content = text;
    let badgeLabel = "Chat";
    let badgeClass = "badge-all";

    if (kind === "say") {
      const m = text.match(/^([A-Za-z0-9][A-Za-z0-9 ]{0,11})\s*:\s*(.*)$/);
      if (m) {
        speaker = m[1];
        content = m[2];
      }
    } else if (kind === "whisper") {
      badgeLabel = "Whisper";
      badgeClass = "badge-whisper";
      const m = text.match(/^(To @[A-Za-z0-9_]+|From @[A-Za-z0-9_]+|@[A-Za-z0-9_]+)\s*:\s*(.*)$/i);
      if (m) {
        speaker = m[1];
        content = m[2];
      }
    } else if (kind === "party") {
      badgeLabel = "Party";
      badgeClass = "badge-party";
    } else if (kind === "guild") {
      badgeLabel = "Guild";
      badgeClass = "badge-guild";
    }

    const entryId = "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const entry: ChatEntry = {
      id: entryId,
      kind,
      text,
      name: speaker || undefined,
      content,
      time,
      badge: badgeLabel,
      badgeClass,
      itemLink,
      timestamp: now,
    };
    this.history.push(entry);
    if (this.history.length > 500) this.history.shift();

    if (itemLink) {
      this.itemLinkStore.set(entryId, itemLink);
    }

    const line = el("div", `chat-line ${kind} ${badgeClass}`, this.log);
    line.dataset.kind = kind;

    const timeSpan = el("span", "chat-time font-mono select-none", line);
    timeSpan.textContent = time;

    const badgeSpan = el("span", `chat-badge ${badgeClass} select-none`, line);
    badgeSpan.textContent = badgeLabel;

    if (speaker) {
      const nameEl = el("span", "chat-name font-semibold cursor-pointer hover:underline", line);
      nameEl.textContent = ` ${speaker} : `;
      nameEl.title = "Click to quick whisper";
      nameEl.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.startQuickWhisper(speaker);
      });
    }

    const contentEl = el("span", "chat-text", line);

    // Parse item link [ItemName] inside content
    const linkMatch = content.match(/\[(.*?)\]/);
    if (linkMatch && (itemLink || this.pendingItemLinks.has(linkMatch[1].toLowerCase()))) {
      const matchedName = linkMatch[1];
      const linkData = itemLink || this.pendingItemLinks.get(matchedName.toLowerCase());
      const parts = content.split(`[${matchedName}]`);

      if (speaker && !parts[0].startsWith(" ")) {
        contentEl.appendChild(document.createTextNode(" "));
      }
      contentEl.appendChild(document.createTextNode(parts[0]));

      const pill = el("span", "chat-item-link", contentEl);
      pill.textContent = `[${matchedName}]`;
      pill.title = "Click or hover to inspect item stats";

      pill.addEventListener("mouseenter", (ev) => {
        const tooltipHtml = this.renderItemLinkTooltip(linkData);
        if (tooltipHtml) showChatTooltip(tooltipHtml, ev.clientX, ev.clientY);
      });
      pill.addEventListener("mousemove", (ev) => {
        const tooltipHtml = this.renderItemLinkTooltip(linkData);
        if (tooltipHtml) showChatTooltip(tooltipHtml, ev.clientX, ev.clientY);
      });
      pill.addEventListener("mouseleave", () => hideChatTooltip());
      pill.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const tooltipHtml = this.renderItemLinkTooltip(linkData);
        if (tooltipHtml) showChatTooltip(tooltipHtml, ev.clientX, ev.clientY);
      });

      if (parts[1]) {
        contentEl.appendChild(document.createTextNode(parts[1]));
      }
    } else {
      contentEl.textContent = speaker ? content : ` ${content}`;
    }

    // Apply active filter
    if (this.filter !== "all") {
      let show = true;
      if (this.filter === "say") show = kind === "say";
      else if (this.filter === "whisper") show = kind === "whisper";
      else if (this.filter === "party") show = kind === "party";
      else if (this.filter === "guild") show = kind === "guild";
      line.style.display = show ? "block" : "none";
    }

    // Retain up to 250 visible lines in DOM without deleting history
    while (this.log.children.length > 250) {
      this.log.firstElementChild?.remove();
    }

    // Auto-scroll on new message whether chat is open or closed/idle
    requestAnimationFrame(() => {
      this.log.scrollTop = this.log.scrollHeight;
    });

    if (this.minimized) {
      this.minBtn.classList.add("has-unread");
    }
  }

  private renderItemLinkTooltip(link: any): string {
    if (!link) return "";
    if (link.gear) {
      return renderGearTooltip(link.gear, false, "Linked in Chat", this.game?.stats?.level ?? 200);
    }
    if (link.kind === "use" && link.itemId) {
      return renderUseTooltip(link.itemId, link.count ?? 1, "Linked in Chat");
    }
    if (link.kind === "mat" && link.itemId) {
      return renderMatTooltip(link.itemId, link.count ?? 1, "Linked in Chat");
    }
    return `<div class="ms-tooltip-card"><div class="tt-title">${esc(link.name || "Item")}</div></div>`;
  }
}
