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

export type ChatFilter = "all" | "say" | "party" | "guild" | "whisper" | "notice";

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
      { id: "notice", label: "Notice" },
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

    // Bottom Input Row
    const inpRow = el("div", "chat-input-row", this.root);

    this.input = el("input", "chat-field", inpRow) as HTMLInputElement;
    this.updatePlaceholder();
    this.input.maxLength = 100;
    this.input.addEventListener("focus", () => {
      this.isFocused = true;
      this.expand();
    });
    this.input.addEventListener("blur", () => {
      this.isFocused = false;
      this.collapse(2500);
    });
    this.input.addEventListener("keydown", async (e) => {
      e.stopPropagation();
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
          } else if (t.startsWith("/w ") || t.startsWith("/whisper ") || t.startsWith("/f ") || t.startsWith("/friend ")) {
            const parts = t.replace(/^\/(w|whisper|f|friend)\s+/, "").trim().split(/\s+/);
            const target = parts[0];
            const msg = parts.slice(1).join(" ");
            if (target && msg) {
              this.game.sendChat(`@${target}: ${msg}`, "whisper", matchedItemLink);
            } else {
              this.game.onChat("system", "Usage: /w <name> <message>");
            }
          } else if (t === "/help" || t === "/commands") {
            const baseHelp = "[Commands] /name <newName> | /g <msg> (guild) | /p <msg> (party) | /w <player> <msg> (whisper)";
            this.game.onChat("system", `${baseHelp} | /gm or /setgm - GM Panel | /sync | /logout`);
          } else {
            // Check active channel routing
            if (this.filter === "guild") {
              this.game.sendChat(t, "guild", matchedItemLink);
            } else if (this.filter === "party") {
              this.game.sendChat(t, "party", matchedItemLink);
            } else {
              this.game.say(t, matchedItemLink);
            }
          }
        }
        this.input.value = "";
        this.input.blur();
      } else if (e.key === "Escape") {
        this.input.blur();
      }
    });

    // Global listener for linking items into chat
    window.addEventListener("chat-insert-link", ((e: CustomEvent) => {
      if (e.detail) this.insertItemLink(e.detail);
    }) as EventListener);

    // Global listener for party invite notifications
    window.addEventListener("party-invited", ((e: CustomEvent) => {
      (window as any).__lastPartyInvite = e.detail;
    }) as EventListener);
  }

  private updatePlaceholder() {
    switch (this.filter) {
      case "guild":
        this.input.placeholder = "Guild chat (/g message)...";
        break;
      case "party":
        this.input.placeholder = "Party chat (/p message)...";
        break;
      case "whisper":
        this.input.placeholder = "Friends: /w [player] [msg]...";
        break;
      case "say":
        this.input.placeholder = "Chat: message or /w [player]...";
        break;
      case "notice":
        this.input.placeholder = "System announcements";
        break;
      case "all":
      default:
        this.input.placeholder = "Press Enter to chat · ↑/↓ for history";
        break;
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
      const isGm = line.dataset.isGm === "1";
      let show = true;
      if (f === "say") show = k === "say" && !isGm;
      else if (f === "notice") show = k === "notice" || k === "system" || isGm;
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
    // Only accept chat-related messages: player conversation, whisper, party, guild, GM announcements
    if (kind === "exp" || kind === "meso" || kind === "item" || kind === "level") {
      return;
    }
    if (text.includes("experience") || text.includes("Party EXP") || text.includes("gained exp")) {
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
    } else if (kind === "notice") {
      badgeLabel = "Notice";
      badgeClass = "badge-notice";
      content = text.replace(/^\[Notice\]\s*/, "");
    } else if (kind === "whisper") {
      badgeLabel = "Whisper";
      badgeClass = "badge-whisper";
    } else if (kind === "party") {
      badgeLabel = "Party";
      badgeClass = "badge-party";
    } else if (kind === "guild") {
      badgeLabel = "Guild";
      badgeClass = "badge-guild";
    } else if (kind === "system") {
      badgeLabel = "System";
      badgeClass = "badge-sys";
    }

    if (text.includes("[GM]") || text.includes("★ [GM") || text.includes("GameMaster")) {
      badgeLabel = "GM";
      badgeClass = "badge-gm";
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
    };
    this.history.push(entry);
    if (this.history.length > 500) this.history.shift();

    if (itemLink) {
      this.itemLinkStore.set(entryId, itemLink);
    }

    const line = el("div", `chat-line ${kind} ${badgeClass}`, this.log);
    line.dataset.kind = kind;
    if (badgeLabel === "GM") line.dataset.isGm = "1";

    const timeSpan = el("span", "chat-time font-mono select-none", line);
    timeSpan.textContent = time;

    const badgeSpan = el("span", `chat-badge ${badgeClass} select-none`, line);
    badgeSpan.textContent = badgeLabel;

    if (speaker) {
      const nameEl = el("span", "chat-name font-semibold", line);
      nameEl.textContent = ` ${speaker} : `;
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
      if (this.filter === "say") show = kind === "say" && badgeLabel !== "GM";
      else if (this.filter === "notice") show = kind === "notice" || kind === "system" || badgeLabel === "GM";
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
