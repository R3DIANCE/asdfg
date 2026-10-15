// Maple Wayfarer - Authentic MapleStory Login & Character Selection / Creation UI
// Connected to SpacetimeDB database and real-time backend

import { spacetime, type SpacetimeCharacter } from "../spacetimedb.ts";

export type AuthMode = "login" | "register" | "char_select" | "char_create";

export interface AuthUIOptions {
  container: HTMLElement;
  onCharacterSelected: (char: SpacetimeCharacter) => void;
}

export class AuthUI {
  private container: HTMLElement;
  private onCharacterSelected: (char: SpacetimeCharacter) => void;
  private mode: AuthMode = "login";
  private characters: SpacetimeCharacter[] = [];
  private loading = false;
  private message = "";
  private messageType: "error" | "success" | "info" = "info";
  private dbConnected = false;

  // Character creation draft state
  private draft = {
    name: "",
    classId: "beginner",
    gender: "male",
    skin: 2000,
    face: 20000,
    hair: 30030,
    weapon: 1302000,
    top: 1040002,
    bottom: 1060002,
    shoes: 1072001,
  };

  private nameAvailable: boolean | null = null;
  private checkingName = false;

  constructor(opts: AuthUIOptions) {
    this.container = opts.container;
    this.onCharacterSelected = opts.onCharacterSelected;
    this.init();
  }

  async init() {
    // Check SpacetimeDB connection health
    const health = await spacetime.checkHealth();
    this.dbConnected = health.ok;

    // Check if user already logged in
    if (spacetime.currentUser) {
      this.mode = "char_select";
      await this.loadCharacters();
    } else {
      this.mode = "login";
      this.render();
    }
  }

  async loadCharacters() {
    this.loading = true;
    this.render();
    const res = await spacetime.getCharacters();
    this.loading = false;
    if (res.ok) {
      this.characters = res.characters;
    } else {
      this.characters = [];
      this.setMessage(res.error || "Failed to load characters", "error");
    }
    this.render();
  }

  setMessage(msg: string, type: "error" | "success" | "info" = "info") {
    this.message = msg;
    this.messageType = type;
    this.render();
  }

  getDraftLook(): number[] {
    return [
      this.draft.skin,
      12000,
      this.draft.face,
      this.draft.hair,
      this.draft.top,
      this.draft.bottom,
      this.draft.shoes,
      this.draft.weapon,
    ];
  }

  getCharAvatarUrl(look: number[]): string {
    return `/wz/char?eq=${look.join(",")}&action=stand1&frame=0`;
  }

  render() {
    this.container.innerHTML = "";
    const card = document.createElement("div");
    card.className = "ms-auth-card";

    // Header with Slime and SpacetimeDB Status
    const header = document.createElement("div");
    header.className = "ms-auth-header";
    header.innerHTML = `
      <div class="flex items-center gap-3">
        <img src="/wz/sprite/Mob/0100100/stand/0" class="w-12 h-12 image-rendering-pixelated" alt="Maple Slime" onerror="this.src='/wz/sprite/Mob/0100100/move/2'" />
        <div>
          <h1 class="text-2xl font-black text-lime-400 tracking-wider">MAPLE WAYFARER</h1>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="inline-block w-2 h-2 rounded-full ${this.dbConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}"></span>
            <span class="text-[11px] font-semibold text-slate-400">${this.dbConnected ? "SpacetimeDB v2.11.0 Active" : "Connecting to SpacetimeDB…"}</span>
          </div>
        </div>
      </div>
    `;
    card.appendChild(header);

    // Alert message
    if (this.message) {
      const alert = document.createElement("div");
      alert.className = `ms-auth-alert ms-alert-${this.messageType}`;
      alert.textContent = this.message;
      card.appendChild(alert);
    }

    // Body based on current mode
    if (this.mode === "login" || this.mode === "register") {
      card.appendChild(this.renderAuthForm());
    } else if (this.mode === "char_select") {
      card.appendChild(this.renderCharSelect());
    } else if (this.mode === "char_create") {
      card.appendChild(this.renderCharCreate());
    }

    this.container.appendChild(card);
  }

  private renderAuthForm(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "ms-auth-form-wrap";

    // Tabs
    const tabs = document.createElement("div");
    tabs.className = "ms-auth-tabs";
    tabs.innerHTML = `
      <button type="button" class="ms-auth-tab ${this.mode === "login" ? "active" : ""}" id="tab-login">Account Login</button>
      <button type="button" class="ms-auth-tab ${this.mode === "register" ? "active" : ""}" id="tab-register">New Account</button>
    `;
    wrap.appendChild(tabs);

    tabs.querySelector("#tab-login")?.addEventListener("click", () => {
      this.mode = "login";
      this.message = "";
      this.render();
    });
    tabs.querySelector("#tab-register")?.addEventListener("click", () => {
      this.mode = "register";
      this.message = "";
      this.render();
    });

    // Form
    const form = document.createElement("form");
    form.className = "ms-auth-form";
    form.innerHTML = `
      <label class="field">
        <span>Username</span>
        <input id="auth-username" type="text" autocomplete="username" placeholder="Enter username (3-16 characters)" maxlength="16" required />
      </label>
      <label class="field">
        <span>Password</span>
        <input id="auth-password" type="password" autocomplete="current-password" placeholder="Enter password" required />
      </label>
      ${this.mode === "register" ? `
        <label class="field">
          <span>Confirm Password</span>
          <input id="auth-confirm" type="password" autocomplete="new-password" placeholder="Re-enter password" required />
        </label>
      ` : ""}
      <button type="submit" class="ms-btn-primary w-full mt-2" ${this.loading ? "disabled" : ""}>
        ${this.loading ? "Processing…" : this.mode === "login" ? "Log In to SpacetimeDB" : "Create Account"}
      </button>
    `;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const u = (form.querySelector("#auth-username") as HTMLInputElement)?.value.trim();
      const p = (form.querySelector("#auth-password") as HTMLInputElement)?.value;
      if (!u || !p) return;

      if (this.mode === "register") {
        const c = (form.querySelector("#auth-confirm") as HTMLInputElement)?.value;
        if (p !== c) {
          this.setMessage("Passwords do not match", "error");
          return;
        }
        this.loading = true;
        this.render();
        const res = await spacetime.register(u, p);
        this.loading = false;
        if (res.ok) {
          this.setMessage("Account created! Logging in…", "success");
          this.mode = "char_select";
          await this.loadCharacters();
        } else {
          this.setMessage(res.error || "Registration failed", "error");
        }
      } else {
        this.loading = true;
        this.render();
        const res = await spacetime.login(u, p);
        this.loading = false;
        if (res.ok) {
          this.mode = "char_select";
          await this.loadCharacters();
        } else {
          this.setMessage(res.error || "Invalid username or password", "error");
        }
      }
    });

    wrap.appendChild(form);
    return wrap;
  }

  private renderCharSelect(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "ms-char-select-wrap";

    // User bar
    const bar = document.createElement("div");
    bar.className = "ms-user-bar";
    bar.innerHTML = `
      <div class="text-sm font-semibold text-slate-300">
        Account: <span class="text-amber-400 font-bold">${spacetime.currentUser}</span>
      </div>
      <button type="button" class="ms-btn-subtle" id="btn-logout">Switch Account</button>
    `;
    bar.querySelector("#btn-logout")?.addEventListener("click", () => {
      spacetime.logout();
      this.mode = "login";
      this.message = "";
      this.render();
    });
    wrap.appendChild(bar);

    // Characters Grid
    const grid = document.createElement("div");
    grid.className = "ms-char-grid";

    for (const ch of this.characters) {
      const card = document.createElement("div");
      card.className = "ms-char-card";
      card.innerHTML = `
        <div class="ms-char-avatar-box">
          <img src="${this.getCharAvatarUrl(ch.look)}" class="ms-char-avatar-img" alt="${ch.name}" />
          <div class="ms-char-pedestal"></div>
        </div>
        <div class="ms-char-info">
          <div class="ms-char-name">${ch.name}</div>
          <div class="ms-char-badge-row">
            <span class="ms-badge-class">${ch.classId.toUpperCase()}</span>
            <span class="ms-badge-level">Lv. ${ch.level}</span>
          </div>
          <div class="ms-char-meso">${ch.meso.toLocaleString()} <span class="text-yellow-400">⛃</span></div>
        </div>
        <div class="ms-char-actions">
          <button type="button" class="ms-btn-primary ms-btn-play" data-name="${ch.name}">Enter World</button>
          <button type="button" class="ms-btn-danger" data-del="${ch.name}">✕</button>
        </div>
      `;

      card.querySelector(".ms-btn-play")?.addEventListener("click", () => {
        spacetime.currentCharacter = ch;
        try { localStorage.setItem("ms_current_character", ch.name); } catch {}
        this.onCharacterSelected(ch);
      });

      card.querySelector(".ms-btn-danger")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm(`Delete character ${ch.name}? This action cannot be undone.`)) {
          this.loading = true;
          this.render();
          const res = await spacetime.deleteCharacter(ch.name);
          this.loading = false;
          if (res.ok) {
            this.setMessage(`Character ${ch.name} deleted`, "info");
            await this.loadCharacters();
          } else {
            this.setMessage(res.error || "Failed to delete character", "error");
          }
        }
      });

      grid.appendChild(card);
    }

    // New Character Slot Card
    const newCard = document.createElement("div");
    newCard.className = "ms-char-card ms-char-card-new";
    newCard.innerHTML = `
      <div class="ms-new-char-icon">+</div>
      <div class="font-bold text-sm text-cyan-300 mt-2">Create Character</div>
      <div class="text-[11px] text-slate-400 mt-0.5">New Maple Adventurer</div>
    `;
    newCard.addEventListener("click", () => {
      this.mode = "char_create";
      this.draft.name = "";
      this.nameAvailable = null;
      this.message = "";
      this.render();
    });
    grid.appendChild(newCard);

    wrap.appendChild(grid);
    return wrap;
  }

  private renderCharCreate(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "ms-char-create-wrap";

    // Left Column: Live Preview
    const left = document.createElement("div");
    left.className = "ms-create-preview-col";
    left.innerHTML = `
      <div class="ms-preview-title">Appearance Preview</div>
      <div class="ms-create-avatar-stage">
        <img id="create-avatar-img" src="${this.getCharAvatarUrl(this.getDraftLook())}" class="ms-create-avatar-sprite" alt="Avatar Preview" />
        <div class="ms-create-avatar-pedestal"></div>
      </div>
      <div class="text-xs text-slate-400 text-center mt-3">
        Class: <span class="text-emerald-400 font-bold">${this.draft.classId.toUpperCase()}</span>
      </div>
    `;

    // Right Column: Creation Controls
    const right = document.createElement("div");
    right.className = "ms-create-form-col";

    right.innerHTML = `
      <div class="field mb-3">
        <span class="block text-xs font-semibold text-slate-300 mb-1">Character Name</span>
        <div class="flex gap-2">
          <input id="create-name-input" type="text" maxlength="12" placeholder="2-12 characters" value="${this.draft.name}" class="flex-1" />
          <button type="button" id="btn-check-name" class="ms-btn-secondary whitespace-nowrap" ${this.checkingName ? "disabled" : ""}>
            ${this.checkingName ? "Checking…" : "Check"}
          </button>
        </div>
        <div id="name-status" class="text-[11px] mt-1 font-semibold"></div>
      </div>

      <div class="field mb-3">
        <span class="block text-xs font-semibold text-slate-300 mb-1">Gender</span>
        <div class="flex gap-2">
          <button type="button" class="ms-btn-choice flex-1 ${this.draft.gender === "male" ? "active" : ""}" data-gender="male">Male</button>
          <button type="button" class="ms-btn-choice flex-1 ${this.draft.gender === "female" ? "active" : ""}" data-gender="female">Female</button>
        </div>
      </div>

      <div class="field mb-3">
        <span class="block text-xs font-semibold text-slate-300 mb-1">Adventurer Path</span>
        <div class="grid grid-cols-3 gap-1.5">
          ${[
            { id: "beginner", name: "Beginner", wp: 1302000 },
            { id: "warrior", name: "Warrior", wp: 1302000 },
            { id: "magician", name: "Magician", wp: 1382000 },
            { id: "bowman", name: "Bowman", wp: 1452002 },
            { id: "thief", name: "Thief", wp: 1332007 },
            { id: "pirate", name: "Pirate", wp: 1482000 },
          ].map((c) => `
            <button type="button" class="ms-btn-choice ${this.draft.classId === c.id ? "active" : ""}" data-class="${c.id}" data-wp="${c.wp}">
              ${c.name}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="field mb-3">
        <span class="block text-xs font-semibold text-slate-300 mb-1">Hair Style</span>
        <div class="flex gap-1.5 flex-wrap">
          ${[
            { id: 30030, name: "Samurai" },
            { id: 30000, name: "Toben" },
            { id: 30020, name: "Rebel" },
            { id: 31000, name: "Long" },
            { id: 31040, name: "Bob" },
          ].map((h) => `
            <button type="button" class="ms-btn-choice text-xs px-2.5 py-1 ${this.draft.hair === h.id ? "active" : ""}" data-hair="${h.id}">${h.name}</button>
          `).join("")}
        </div>
      </div>

      <div class="field mb-3">
        <span class="block text-xs font-semibold text-slate-300 mb-1">Face Expression</span>
        <div class="flex gap-1.5">
          ${[
            { id: 20000, name: "Motivated" },
            { id: 20001, name: "Calm" },
            { id: 20002, name: "Playful" },
          ].map((f) => `
            <button type="button" class="ms-btn-choice flex-1 text-xs px-2 py-1 ${this.draft.face === f.id ? "active" : ""}" data-face="${f.id}">${f.name}</button>
          `).join("")}
        </div>
      </div>

      <div class="field mb-4">
        <span class="block text-xs font-semibold text-slate-300 mb-1">Skin Tone</span>
        <div class="flex gap-1.5">
          ${[
            { id: 2000, name: "Light" },
            { id: 2001, name: "Tanned" },
            { id: 2002, name: "Pale" },
            { id: 2003, name: "Dark" },
          ].map((s) => `
            <button type="button" class="ms-btn-choice flex-1 text-xs px-2 py-1 ${this.draft.skin === s.id ? "active" : ""}" data-skin="${s.id}">${s.name}</button>
          `).join("")}
        </div>
      </div>

      <div class="flex gap-2 mt-4">
        <button type="button" id="btn-cancel-create" class="ms-btn-subtle flex-1 py-2.5">Back</button>
        <button type="button" id="btn-submit-create" class="ms-btn-primary flex-2 py-2.5" ${this.loading ? "disabled" : ""}>
          ${this.loading ? "Creating…" : "Create Character"}
        </button>
      </div>
    `;

    // Event Listeners for live updating preview
    const updatePreview = () => {
      const img = left.querySelector("#create-avatar-img") as HTMLImageElement;
      if (img) img.src = this.getCharAvatarUrl(this.getDraftLook());
    };

    const nameInput = right.querySelector("#create-name-input") as HTMLInputElement;
    const nameStatus = right.querySelector("#name-status") as HTMLElement;

    const checkNameBtn = right.querySelector("#btn-check-name") as HTMLButtonElement;
    checkNameBtn?.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      this.checkingName = true;
      checkNameBtn.disabled = true;
      checkNameBtn.textContent = "Checking…";
      const res = await spacetime.checkName(name);
      this.checkingName = false;
      checkNameBtn.disabled = false;
      checkNameBtn.textContent = "Check";
      this.nameAvailable = res.available;
      if (res.available) {
        nameStatus.textContent = `✓ "${name}" is available!`;
        nameStatus.className = "text-[11px] mt-1 font-semibold text-emerald-400";
      } else {
        nameStatus.textContent = res.error || `✗ "${name}" is already taken.`;
        nameStatus.className = "text-[11px] mt-1 font-semibold text-rose-400";
      }
    });

    nameInput?.addEventListener("input", () => {
      this.draft.name = nameInput.value.trim();
      this.nameAvailable = null;
      nameStatus.textContent = "";
    });

    // Gender buttons
    right.querySelectorAll("[data-gender]").forEach((b) => {
      b.addEventListener("click", () => {
        this.draft.gender = (b as HTMLElement).dataset.gender || "male";
        if (this.draft.gender === "female") {
          this.draft.face = 21000;
          this.draft.hair = 31000;
        } else {
          this.draft.face = 20000;
          this.draft.hair = 30030;
        }
        this.render();
      });
    });

    // Class buttons
    right.querySelectorAll("[data-class]").forEach((b) => {
      b.addEventListener("click", () => {
        const el = b as HTMLElement;
        this.draft.classId = el.dataset.class || "beginner";
        this.draft.weapon = Number(el.dataset.wp) || 1302000;
        this.render();
      });
    });

    // Hair buttons
    right.querySelectorAll("[data-hair]").forEach((b) => {
      b.addEventListener("click", () => {
        this.draft.hair = Number((b as HTMLElement).dataset.hair) || 30030;
        right.querySelectorAll("[data-hair]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        updatePreview();
      });
    });

    // Face buttons
    right.querySelectorAll("[data-face]").forEach((b) => {
      b.addEventListener("click", () => {
        this.draft.face = Number((b as HTMLElement).dataset.face) || 20000;
        right.querySelectorAll("[data-face]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        updatePreview();
      });
    });

    // Skin buttons
    right.querySelectorAll("[data-skin]").forEach((b) => {
      b.addEventListener("click", () => {
        this.draft.skin = Number((b as HTMLElement).dataset.skin) || 2000;
        right.querySelectorAll("[data-skin]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        updatePreview();
      });
    });

    // Back button
    right.querySelector("#btn-cancel-create")?.addEventListener("click", () => {
      this.mode = "char_select";
      this.message = "";
      this.render();
    });

    // Create submit button
    right.querySelector("#btn-submit-create")?.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) {
        this.setMessage("Please enter a character name", "error");
        return;
      }
      this.loading = true;
      this.render();
      const res = await spacetime.createCharacter({
        name,
        classId: this.draft.classId,
        gender: this.draft.gender,
        look: this.getDraftLook(),
      });
      this.loading = false;
      if (res.ok) {
        this.setMessage(`Character ${name} created!`, "success");
        this.mode = "char_select";
        await this.loadCharacters();
      } else {
        this.setMessage(res.error || "Failed to create character", "error");
      }
    });

    wrap.appendChild(left);
    wrap.appendChild(right);
    return wrap;
  }
}
