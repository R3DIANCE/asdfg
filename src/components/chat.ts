// Modular Chat Component — Orillusion Component architecture (https://www.orillusion.com/en/guide/core/component.html)
// Translucent WebGPU glass aesthetic, persistent message & command history, channel filters, auto-scroll on new messages
import { ComponentBase } from "@orillusion/core";
import type { ChatKind, Game } from "../game.ts";
import { el } from "../util.ts";
import { lucideIcon } from "../lucide.ts";

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
    this.root?.remove();
  }

  private initComponent() {
    this.root = el("div", "chat idle", this.parentEl);
    this.root.addEventListener("pointerenter", () => this.expand());
    this.root.addEventListener("pointerleave", () => this.collapse(2500));
    this.root.addEventListener("click", () => this.expand());

    // Clean Chat Header with Title & Minimize button
    this.header = el("div", "chat-header", this.root);
    const titleEl = el("div", "chat-title select-none", this.header);
    titleEl.innerHTML = `<span class="chat-title-icon">${lucideIcon("message", 12)}</span> <span>Chat</span>`;

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
    this.input.placeholder = "Press Enter to chat · ↑/↓ for history";
    this.input.maxLength = 100;
    this.input.addEventListener("focus", () => {
      this.isFocused = true;
      this.expand();
    });
    this.input.addEventListener("blur", () => {
      this.isFocused = false;
      this.collapse(2500);
    });
    this.input.addEventListener("keydown", (e) => {
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

          const cmd = t.toLowerCase();
          // Secret commands to open GM Debug Tool and set GM status
          if (
            cmd === "/op" ||
            cmd === "/setgm" ||
            cmd === "/root" ||
            cmd === "/sudo" ||
            cmd === "/sudo gm" ||
            cmd === "/gmforce" ||
            cmd === "/gmopen" ||
            cmd === "/secret" ||
            cmd === "/unlockgm" ||
            cmd === "/gm on"
          ) {
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
          } else if (t === "/help" || t === "/commands") {
            const baseHelp = "[Commands] /name <newName> | /sync | /switchchar | /logout";
            this.game.onChat("system", `${baseHelp} | /gm or /setgm - Open GM Panel & Grant GM Role | /gmonline - Online Roster | /gmoff - Relinquish GM`);
          } else {
            this.game.say(t);
          }
        }
        this.input.value = "";
        this.input.blur();
      } else if (e.key === "Escape") {
        this.input.blur();
      }
    });
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

  addMessage(kind: ChatKind, text: string) {
    // Only accept chat-related messages: player conversation, whisper, party, guild, GM announcements
    if (kind === "exp" || kind === "meso" || kind === "item" || kind === "level") {
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

    const entry: ChatEntry = {
      id: "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      kind,
      text,
      name: speaker || undefined,
      content,
      time,
      badge: badgeLabel,
      badgeClass,
    };
    this.history.push(entry);
    if (this.history.length > 500) this.history.shift();

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
    contentEl.textContent = speaker ? content : ` ${content}`;

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
}
