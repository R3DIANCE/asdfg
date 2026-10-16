// Maple Wayfarer - Authentic MapleStory New Age / NEXT Login & Character Creation UI
// Connected to SpacetimeDB database and real-time backend

import { spacetime, type SpacetimeCharacter } from "../spacetimedb.ts";

export type AuthMode = "login" | "register" | "char_select" | "char_create";
export type CreateStep = 1 | 2 | 3; // 1: Archetype, 2: Appearance Salon, 3: Name & Finalize

export interface AuthUIOptions {
  container: HTMLElement;
  onCharacterSelected: (char: SpacetimeCharacter) => void;
}

interface ClassArchetype {
  id: string;
  name: string;
  korean: string;
  primaryStat: string;
  statBadgeColor: string;
  desc: string;
  skills: string[];
  weaponId: number;
  weaponName: string;
  color: string;
  gradient: string;
}

const ARCHETYPES: ClassArchetype[] = [
  {
    id: "warrior",
    name: "Warrior",
    korean: "전사",
    primaryStat: "STR",
    statBadgeColor: "#f59e0b",
    desc: "Unyielding melee combatant with ironclad defense, powerful sweeping strikes, and towering courage.",
    skills: ["Power Strike", "Slash Blast", "Iron Body"],
    weaponId: 1302000,
    weaponName: "Sword & Shield",
    color: "#eab308",
    gradient: "linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(180, 83, 9, 0.25) 100%)",
  },
  {
    id: "magician",
    name: "Magician",
    korean: "마법사",
    primaryStat: "INT",
    statBadgeColor: "#06b6d4",
    desc: "Master of the mystic arts commanding elemental spells, arcane teleports, and devastating energy blasts.",
    skills: ["Energy Bolt", "Magic Claw", "Teleport"],
    weaponId: 1382000,
    weaponName: "Wooden Staff",
    color: "#06b6d4",
    gradient: "linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(14, 116, 144, 0.25) 100%)",
  },
  {
    id: "bowman",
    name: "Bowman",
    korean: "궁수",
    primaryStat: "DEX",
    statBadgeColor: "#10b981",
    desc: "Sharp-eyed marksman who strikes from afar with relentless precision, rapid volleys, and critical shots.",
    skills: ["Arrow Blow", "Double Shot", "Critical Shot"],
    weaponId: 1452002,
    weaponName: "Hunter Bow",
    color: "#10b981",
    gradient: "linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(4, 120, 87, 0.25) 100%)",
  },
  {
    id: "thief",
    name: "Thief",
    korean: "도적",
    primaryStat: "LUK",
    statBadgeColor: "#a855f7",
    desc: "Acrobatic shadow assassin utilizing Flash Jump, spinning throwing stars, and lethal shadow clones.",
    skills: ["Flash Jump", "Shadow Partner", "Triple Throw"],
    weaponId: 1332007,
    weaponName: "Shadow Dagger / Claw",
    color: "#a855f7",
    gradient: "linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(109, 40, 217, 0.25) 100%)",
  },
  {
    id: "pirate",
    name: "Pirate",
    korean: "해적",
    primaryStat: "STR / DEX",
    statBadgeColor: "#f97316",
    desc: "Energetic adventurer mastering martial arts brawling, Somersault Kicks, and rapid firearm salvos.",
    skills: ["Flash Fist", "Somersault Kick", "Double Fire"],
    weaponId: 1482000,
    weaponName: "Steel Knuckle / Gun",
    color: "#f97316",
    gradient: "linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(194, 65, 12, 0.25) 100%)",
  },
  {
    id: "beginner",
    name: "Beginner",
    korean: "초보자",
    primaryStat: "BALANCED",
    statBadgeColor: "#94a3b8",
    desc: "The quintessential Maple adventurer, embarking on the journey with unlimited potential and pure determination.",
    skills: ["Three Snails", "Recovery", "Nimble Feet"],
    weaponId: 1302000,
    weaponName: "Beginner Sword",
    color: "#94a3b8",
    gradient: "linear-gradient(135deg, rgba(148, 163, 184, 0.15) 0%, rgba(71, 85, 105, 0.25) 100%)",
  },
];

const SUGGESTED_NAMES = [
  "StarWalker", "LotusStrike", "NovaHero", "ShadowBlade", "MapleKnight",
  "FrostFire", "MysticAura", "SkyRanger", "CrimsonWolf", "Solaris",
  "WindGlider", "LunarEclipse", "AeroShot", "IronSoul", "ThunderClaw",
];

export class AuthUI {
  private container: HTMLElement;
  private onCharacterSelected: (char: SpacetimeCharacter) => void;
  private mode: AuthMode = "login";
  private createStep: CreateStep = 1;
  private characters: SpacetimeCharacter[] = [];
  private selectedCharacterIndex = 0;
  private previewAction: "stand1" | "walk1" | "swingO1" | "prone" = "stand1";
  private loading = false;
  private message = "";
  private messageType: "error" | "success" | "info" = "info";
  private dbConnected = false;

  // Character creation draft state
  private draft = {
    name: "",
    classId: "warrior",
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
  private keydownHandler?: (e: KeyboardEvent) => void;

  constructor(opts: AuthUIOptions) {
    this.container = opts.container;
    this.onCharacterSelected = opts.onCharacterSelected;
    this.init();
    this.setupKeyboardListeners();
  }

  private setupKeyboardListeners() {
    this.keydownHandler = (e: KeyboardEvent) => {
      // If user is typing in an input, don't trigger game start
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (e.key === "Enter" && this.mode === "char_select" && this.characters.length > 0) {
        e.preventDefault();
        const ch = this.characters[this.selectedCharacterIndex];
        if (ch) this.selectAndPlay(ch);
      }
    };
    window.addEventListener("keydown", this.keydownHandler);
  }

  destroy() {
    if (this.keydownHandler) {
      window.removeEventListener("keydown", this.keydownHandler);
    }
  }

  async init() {
    // Check SpacetimeDB connection health
    const health = await spacetime.checkHealth();
    this.dbConnected = health.ok;

    // Check if user explicitly opted to skip auto-login (e.g. clicked Switch Character or Logout)
    const skipAutoLogin = sessionStorage.getItem("ms_skip_autologin") === "1";
    if (skipAutoLogin) {
      sessionStorage.removeItem("ms_skip_autologin");
    } else {
      const lastSavedName = localStorage.getItem("ms_current_character") || localStorage.getItem("ms_player_name");

      // 1) If logged into SpacetimeDB user account, auto-login to matching character or first character
      if (spacetime.currentUser) {
        try {
          const res = await spacetime.getCharacters();
          if (res.ok && res.characters.length > 0) {
            const target = (lastSavedName ? res.characters.find((c) => c.name === lastSavedName) : null) || res.characters[0];
            if (target) {
              this.selectAndPlay(target);
              return;
            }
          }
        } catch {}
      }

      // 2) If played previously in guest or local mode with a saved character
      if (lastSavedName) {
        let sv: any = null;
        try {
          sv = JSON.parse(localStorage.getItem(`maple-wayfarer-save-${lastSavedName}`) ?? "null")
            ?? JSON.parse(localStorage.getItem("maple-wayfarer-save") ?? "null");
        } catch {}

        if (sv || lastSavedName) {
          const charObj: SpacetimeCharacter = {
            name: sv?.stats?.name || lastSavedName,
            username: spacetime.currentUser || "guest",
            classId: sv?.stats?.classId || "beginner",
            gender: "male",
            level: sv?.stats?.level || 1,
            exp: sv?.stats?.exp || 0,
            hp: sv?.stats?.hp || 50,
            maxHp: sv?.stats?.maxHp || 50,
            mp: sv?.stats?.mp || 20,
            maxMp: sv?.stats?.maxMp || 20,
            meso: sv?.stats?.meso || 1000,
            mapId: sv?.map || 910000000,
            x: sv?.p?.x || 0,
            y: sv?.p?.y || 0,
            look: sv?.look || [2000, 12000, 20000, 30030, 1040002, 1060002, 1072001, 1302000],
            stats: sv?.stats || {},
            inventory: sv?.bag || [],
            equipment: { eq: sv?.eq, visualEq: sv?.visualEq },
            skills: { skillLv: sv?.skillLv, quick: sv?.quick },
            updatedAt: Date.now(),
          };
          this.selectAndPlay(charObj);
          return;
        }
      }
    }

    // Default flow: If no auto-login occurred
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
      // Default selection to first character or saved character
      const lastSavedName = localStorage.getItem("ms_current_character");
      const idx = this.characters.findIndex((c) => c.name === lastSavedName);
      this.selectedCharacterIndex = idx >= 0 ? idx : 0;
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

  getCharAvatarUrl(look: number[], action: string = this.previewAction): string {
    return `/wz/char?eq=${look.join(",")}&action=${action}&frame=0`;
  }

  selectAndPlay(ch: SpacetimeCharacter) {
    spacetime.currentCharacter = ch;
    try {
      localStorage.setItem("ms_current_character", ch.name);
      localStorage.setItem("ms_player_name", ch.name);
    } catch {}
    this.destroy();
    this.onCharacterSelected(ch);
  }

  render() {
    this.container.classList.remove("hidden");
    this.container.innerHTML = "";
    const card = document.createElement("div");
    card.className = `ms-auth-card ms-mode-${this.mode}`;

    // Header with Slime, Title & SpacetimeDB Status
    const header = document.createElement("div");
    header.className = "ms-auth-header";
    header.innerHTML = `
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-3">
          <img src="/wz/sprite/Mob/0100100/stand/0" class="w-11 h-11 image-rendering-pixelated drop-shadow-md" alt="Maple Slime" onerror="this.src='/wz/sprite/Mob/0100100/move/2'" />
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-2xl font-black text-lime-400 tracking-wider maple-title">MAPLE WAYFARER</h1>
              <span class="ms-version-tag">NEW AGE</span>
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="inline-block w-2 h-2 rounded-full ${this.dbConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}"></span>
              <span class="text-[11px] font-semibold text-slate-400">${this.dbConnected ? "Server Online" : "Connecting to Server…"}</span>
            </div>
          </div>
        </div>
        ${spacetime.currentUser ? `
          <div class="flex items-center gap-3">
            <div class="text-right">
              <div class="text-[11px] text-slate-400">Maple Account</div>
              <div class="text-xs font-bold text-amber-400">${spacetime.currentUser}</div>
            </div>
            <button type="button" class="ms-btn-subtle text-xs" id="header-logout">Logout</button>
          </div>
        ` : ""}
      </div>
    `;

    header.querySelector("#header-logout")?.addEventListener("click", () => {
      spacetime.logout();
      this.mode = "login";
      this.message = "";
      this.render();
    });

    card.appendChild(header);

    // Alert message banner
    if (this.message) {
      const alert = document.createElement("div");
      alert.className = `ms-auth-alert ms-alert-${this.messageType}`;
      alert.innerHTML = `<span>${this.message}</span><button type="button" class="ms-alert-close">✕</button>`;
      alert.querySelector(".ms-alert-close")?.addEventListener("click", () => {
        this.message = "";
        this.render();
      });
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

  // -------------------------------------------------------------
  // LOGIN / REGISTER FORM
  // -------------------------------------------------------------
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
      <button type="submit" class="ms-btn-primary w-full mt-3 py-2.5 text-sm cursor-pointer" ${this.loading ? "disabled" : ""}>
        ${this.loading ? "Connecting…" : this.mode === "login" ? "Log In" : "Create Account"}
      </button>
      <div class="flex items-center my-3 gap-2 opacity-60">
        <div class="flex-1 h-[1px] bg-slate-600"></div>
        <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">or</span>
        <div class="flex-1 h-[1px] bg-slate-600"></div>
      </div>
      <button type="button" id="btn-guest-play" class="w-full py-2 px-3 text-xs font-bold text-slate-200 bg-slate-800/90 hover:bg-slate-700/90 border border-slate-600 rounded cursor-pointer transition-colors flex items-center justify-center gap-2">
        <span>🍁</span> <span>Instant Play (Guest Mode)</span>
      </button>
    `;

    form.querySelector("#btn-guest-play")?.addEventListener("click", () => {
      this.destroy();
      this.onCharacterSelected({
        name: "Wayfarer",
        username: "guest",
        classId: "beginner",
        gender: "male",
        level: 1,
        exp: 0,
        hp: 50,
        maxHp: 50,
        mp: 20,
        maxMp: 20,
        meso: 1000,
        mapId: 910000000,
        x: 0,
        y: 0,
        look: [2000, 12000, 20000, 30030, 1040002, 1060002, 1072001, 1302000],
        stats: {},
        inventory: [],
        equipment: {},
        skills: {},
        updatedAt: Date.now(),
      });
    });

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

  // -------------------------------------------------------------
  // CHARACTER SELECT LOBBY (Hero Spotlight + Roster Carousel)
  // -------------------------------------------------------------
  private renderCharSelect(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "ms-char-select-modern";

    const selectedChar = this.characters[this.selectedCharacterIndex];

    // Left Side: Hero Spotlight
    const spotlight = document.createElement("div");
    spotlight.className = "ms-spotlight-col";

    if (selectedChar) {
      spotlight.innerHTML = `
        <div class="ms-spotlight-stage">
          <div class="ms-stage-light"></div>
          <img id="spotlight-avatar" src="${this.getCharAvatarUrl(selectedChar.look, this.previewAction)}" class="ms-spotlight-sprite" alt="${selectedChar.name}" />
          <div class="ms-spotlight-pedestal"></div>
        </div>

        <!-- Animation Pose Selector -->
        <div class="ms-pose-bar">
          ${["stand1", "walk1", "swingO1", "prone"].map((act) => `
            <button type="button" class="ms-btn-pose ${this.previewAction === act ? "active" : ""}" data-pose="${act}">
              ${act === "stand1" ? "Stand" : act === "walk1" ? "Walk" : act === "swingO1" ? "Attack" : "Prone"}
            </button>
          `).join("")}
        </div>

        <!-- Hero Details Box -->
        <div class="ms-hero-info-card">
          <div class="flex items-center justify-between">
            <h2 class="ms-hero-name">${selectedChar.name}</h2>
            <span class="ms-badge-class" data-class="${selectedChar.classId}">${selectedChar.classId.toUpperCase()}</span>
          </div>

          <div class="ms-hero-stats-row">
            <div class="ms-stat-pill">
              <span class="lbl">Level</span>
              <span class="val font-mono">${selectedChar.level}</span>
            </div>
            <div class="ms-stat-pill">
              <span class="lbl">Mesos</span>
              <span class="val text-amber-400 font-mono">${selectedChar.meso.toLocaleString()} ⛃</span>
            </div>
            <div class="ms-stat-pill">
              <span class="lbl">Location</span>
              <span class="val text-emerald-400">Free Market</span>
            </div>
          </div>

          <div class="ms-hero-actions">
            <button type="button" class="ms-btn-gamestart" id="btn-hero-play">
              <span class="play-text">GAME START</span>
              <span class="play-sub">Press Enter or Double Click</span>
            </button>
            <button type="button" class="ms-btn-danger px-3 py-2" id="btn-hero-delete" title="Delete Character">
              ✕
            </button>
          </div>
        </div>
      `;

      // Pose handlers
      spotlight.querySelectorAll("[data-pose]").forEach((b) => {
        b.addEventListener("click", () => {
          this.previewAction = (b as HTMLElement).dataset.pose as any;
          const img = spotlight.querySelector("#spotlight-avatar") as HTMLImageElement;
          if (img) img.src = this.getCharAvatarUrl(selectedChar.look, this.previewAction);
          spotlight.querySelectorAll("[data-pose]").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
        });
      });

      // Play button
      spotlight.querySelector("#btn-hero-play")?.addEventListener("click", () => {
        this.selectAndPlay(selectedChar);
      });

      // Delete button
      spotlight.querySelector("#btn-hero-delete")?.addEventListener("click", async () => {
        if (confirm(`Delete character "${selectedChar.name}"? This action cannot be undone.`)) {
          this.loading = true;
          this.render();
          const res = await spacetime.deleteCharacter(selectedChar.name);
          this.loading = false;
          if (res.ok) {
            this.setMessage(`Character ${selectedChar.name} deleted`, "info");
            await this.loadCharacters();
          } else {
            this.setMessage(res.error || "Failed to delete character", "error");
          }
        }
      });
    } else {
      spotlight.innerHTML = `
        <div class="ms-spotlight-empty">
          <div class="text-4xl text-slate-500 mb-2">★</div>
          <div class="text-sm font-bold text-slate-300">No Characters Yet</div>
          <p class="text-xs text-slate-400 mt-1 max-w-xs text-center">Create your first Maple Adventurer to start exploring the world!</p>
          <button type="button" class="ms-btn-primary mt-4 py-2 px-5" id="btn-empty-create">Create Character</button>
        </div>
      `;
      spotlight.querySelector("#btn-empty-create")?.addEventListener("click", () => {
        this.startCreationFlow();
      });
    }

    // Right Side: Character Roster Shelf
    const roster = document.createElement("div");
    roster.className = "ms-roster-col";

    const rosterHeader = document.createElement("div");
    rosterHeader.className = "ms-roster-header";
    rosterHeader.innerHTML = `
      <div class="text-xs font-bold uppercase tracking-wider text-slate-400">
        Adventurer Roster <span class="text-cyan-400">(${this.characters.length} / 6)</span>
      </div>
      <button type="button" class="ms-btn-secondary text-xs px-2.5 py-1" id="btn-create-roster-header">
        + Create
      </button>
    `;
    rosterHeader.querySelector("#btn-create-roster-header")?.addEventListener("click", () => {
      this.startCreationFlow();
    });
    roster.appendChild(rosterHeader);

    const rosterList = document.createElement("div");
    rosterList.className = "ms-roster-list";

    this.characters.forEach((ch, idx) => {
      const isSelected = idx === this.selectedCharacterIndex;
      const card = document.createElement("div");
      card.className = `ms-roster-card ${isSelected ? "selected" : ""}`;
      card.innerHTML = `
        <div class="ms-roster-avatar-box">
          <img src="${this.getCharAvatarUrl(ch.look, "stand1")}" class="ms-roster-avatar-img" alt="${ch.name}" />
        </div>
        <div class="ms-roster-card-info">
          <div class="flex items-center justify-between">
            <span class="ms-roster-name">${ch.name}</span>
            <span class="ms-badge-level text-[10px]">Lv. ${ch.level}</span>
          </div>
          <div class="flex items-center justify-between mt-1">
            <span class="text-[11px] font-semibold text-slate-400">${ch.classId.toUpperCase()}</span>
            <span class="text-[11px] text-amber-400 font-mono">${ch.meso.toLocaleString()} ⛃</span>
          </div>
        </div>
      `;

      card.addEventListener("click", () => {
        if (this.selectedCharacterIndex !== idx) {
          this.selectedCharacterIndex = idx;
          this.render();
        }
      });

      card.addEventListener("dblclick", () => {
        this.selectAndPlay(ch);
      });

      rosterList.appendChild(card);
    });

    // Add slot card
    if (this.characters.length < 6) {
      const newCard = document.createElement("div");
      newCard.className = "ms-roster-card ms-roster-card-new";
      newCard.innerHTML = `
        <div class="ms-new-char-icon">+</div>
        <div>
          <div class="text-xs font-bold text-cyan-300">Create New Adventurer</div>
          <div class="text-[10px] text-slate-400">Step into the Maple World</div>
        </div>
      `;
      newCard.addEventListener("click", () => {
        this.startCreationFlow();
      });
      rosterList.appendChild(newCard);
    }

    roster.appendChild(rosterList);

    wrap.appendChild(spotlight);
    wrap.appendChild(roster);
    return wrap;
  }

  private startCreationFlow() {
    this.mode = "char_create";
    this.createStep = 1;
    this.draft = {
      name: "",
      classId: "warrior",
      gender: "male",
      skin: 2000,
      face: 20000,
      hair: 30030,
      weapon: 1302000,
      top: 1040002,
      bottom: 1060002,
      shoes: 1072001,
    };
    this.nameAvailable = null;
    this.message = "";
    this.previewAction = "stand1";
    this.render();
  }

  // -------------------------------------------------------------
  // NEW AGE CHARACTER CREATION WIZARD (3-Step Flow)
  // -------------------------------------------------------------
  private renderCharCreate(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "ms-char-create-wizard";

    // Step Progress Bar
    const stepper = document.createElement("div");
    stepper.className = "ms-wizard-stepper";
    stepper.innerHTML = `
      <div class="ms-step-pill ${this.createStep === 1 ? "active" : this.createStep > 1 ? "completed" : ""}" data-step="1">
        <span class="num">01</span>
        <span class="label">Choose Archetype</span>
      </div>
      <div class="ms-step-line ${this.createStep > 1 ? "active" : ""}"></div>
      <div class="ms-step-pill ${this.createStep === 2 ? "active" : this.createStep > 2 ? "completed" : ""}" data-step="2">
        <span class="num">02</span>
        <span class="label">Appearance Salon</span>
      </div>
      <div class="ms-step-line ${this.createStep > 2 ? "active" : ""}"></div>
      <div class="ms-step-pill ${this.createStep === 3 ? "active" : ""}" data-step="3">
        <span class="num">03</span>
        <span class="label">Name & Identity</span>
      </div>
    `;

    // Clicking completed steps allows going back
    stepper.querySelectorAll(".ms-step-pill.completed").forEach((p) => {
      p.addEventListener("click", () => {
        const s = Number((p as HTMLElement).dataset.step) as CreateStep;
        if (s) {
          this.createStep = s;
          this.render();
        }
      });
    });

    wrap.appendChild(stepper);

    // Step Content
    if (this.createStep === 1) {
      wrap.appendChild(this.renderStep1Archetype());
    } else if (this.createStep === 2) {
      wrap.appendChild(this.renderStep2Appearance());
    } else if (this.createStep === 3) {
      wrap.appendChild(this.renderStep3Identity());
    }

    return wrap;
  }

  // STEP 1: Choose Class Archetype
  private renderStep1Archetype(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "ms-step-content ms-step-archetype";

    const currentArch = ARCHETYPES.find((a) => a.id === this.draft.classId) || ARCHETYPES[0];

    wrap.innerHTML = `
      <div class="ms-step-header text-center mb-4">
        <h2 class="text-xl font-black text-white tracking-wide">SELECT YOUR CLASS ARCHETYPE</h2>
        <p class="text-xs text-slate-400 mt-1">Each class offers distinct combat styles, mobility, and signature skills.</p>
      </div>

      <!-- Archetype Grid -->
      <div class="ms-archetype-grid">
        ${ARCHETYPES.map((arch) => `
          <div class="ms-archetype-card ${this.draft.classId === arch.id ? "active" : ""}" data-arch="${arch.id}" style="--arch-color: ${arch.color};">
            <div class="ms-arch-header">
              <span class="ms-arch-korean">${arch.korean}</span>
              <span class="ms-arch-badge" style="background: ${arch.statBadgeColor}20; color: ${arch.statBadgeColor}; border-color: ${arch.statBadgeColor}60;">${arch.primaryStat}</span>
            </div>
            <h3 class="ms-arch-title">${arch.name}</h3>
            <p class="ms-arch-desc">${arch.desc}</p>
            <div class="ms-arch-skills">
              ${arch.skills.map((s) => `<span class="ms-skill-pill">${s}</span>`).join("")}
            </div>
          </div>
        `).join("")}
      </div>

      <!-- Selected Summary Banner -->
      <div class="ms-arch-summary-banner mt-4">
        <div class="flex items-center gap-3">
          <div class="ms-arch-icon-circle" style="background: ${currentArch.color}20; border-color: ${currentArch.color}; color: ${currentArch.color};">
            ${currentArch.primaryStat}
          </div>
          <div>
            <div class="text-xs font-bold text-white">${currentArch.name} Selected</div>
            <div class="text-[11px] text-slate-400">Starter Weapon: <span class="text-cyan-300 font-semibold">${currentArch.weaponName}</span></div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="ms-btn-subtle px-3 py-2 text-xs" id="btn-cancel-to-lobby">Cancel</button>
          <button type="button" class="ms-btn-primary px-5 py-2 text-xs font-bold" id="btn-next-step-2">
            Customize Appearance →
          </button>
        </div>
      </div>
    `;

    // Click handler for archetypes
    wrap.querySelectorAll("[data-arch]").forEach((card) => {
      card.addEventListener("click", () => {
        const id = (card as HTMLElement).dataset.arch;
        const arch = ARCHETYPES.find((a) => a.id === id);
        if (arch) {
          this.draft.classId = arch.id;
          this.draft.weapon = arch.weaponId;
          this.render();
        }
      });
    });

    wrap.querySelector("#btn-cancel-to-lobby")?.addEventListener("click", () => {
      this.mode = "char_select";
      this.render();
    });

    wrap.querySelector("#btn-next-step-2")?.addEventListener("click", () => {
      this.createStep = 2;
      this.render();
    });

    return wrap;
  }

  // STEP 2: Appearance & Salon
  private renderStep2Appearance(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "ms-step-content ms-step-salon";

    const maleHairs = [
      { id: 30030, name: "Samurai" },
      { id: 30000, name: "Toben" },
      { id: 30020, name: "Rebel" },
      { id: 30010, name: "Buzz Cut" },
      { id: 30050, name: "Metro" },
    ];

    const femaleHairs = [
      { id: 31000, name: "Long Wavy" },
      { id: 31040, name: "Bob Cut" },
      { id: 31010, name: "Pigtails" },
      { id: 31030, name: "Ribbon Hair" },
      { id: 31050, name: "Pixie" },
    ];

    const hairs = this.draft.gender === "female" ? femaleHairs : maleHairs;

    const skins = [
      { id: 2000, name: "Light", color: "#ffe0d0" },
      { id: 2001, name: "Tanned", color: "#d99b70" },
      { id: 2002, name: "Pale", color: "#fff0e8" },
      { id: 2003, name: "Dark", color: "#7a4d2e" },
      { id: 2004, name: "Alabaster", color: "#fff5f0" },
    ];

    const faces = [
      { id: 20000, name: "Motivated" },
      { id: 20001, name: "Calm" },
      { id: 20002, name: "Playful" },
      { id: 20003, name: "Fierce" },
      { id: 20004, name: "Starlight" },
    ];

    const outfits = [
      { name: "Classic Denim", top: 1040002, bottom: 1060002 },
      { name: "Scout Vest", top: 1040006, bottom: 1060006 },
      { name: "Dark Wanderer", top: 1040014, bottom: 1060014 },
      { name: "Forest Ranger", top: 1041004, bottom: 1061004 },
    ];

    wrap.innerHTML = `
      <div class="ms-salon-layout">
        <!-- Left Column: Pedestal Preview -->
        <div class="ms-salon-preview-col">
          <div class="ms-salon-stage">
            <div class="ms-stage-light"></div>
            <img id="salon-avatar" src="${this.getCharAvatarUrl(this.getDraftLook(), this.previewAction)}" class="ms-salon-sprite" alt="Avatar Preview" />
            <div class="ms-salon-pedestal"></div>
          </div>

          <div class="ms-pose-bar mt-3">
            ${["stand1", "walk1", "swingO1", "prone"].map((act) => `
              <button type="button" class="ms-btn-pose ${this.previewAction === act ? "active" : ""}" data-salon-pose="${act}">
                ${act === "stand1" ? "Stand" : act === "walk1" ? "Walk" : act === "swingO1" ? "Attack" : "Prone"}
              </button>
            `).join("")}
          </div>

          <div class="text-xs text-slate-400 text-center mt-3">
            Class: <span class="text-emerald-400 font-bold uppercase">${this.draft.classId}</span>
          </div>
        </div>

        <!-- Right Column: Salon Controls -->
        <div class="ms-salon-controls-col">
          <!-- Gender -->
          <div class="field mb-3">
            <span class="block text-xs font-semibold text-slate-300 mb-1">Gender</span>
            <div class="flex gap-2">
              <button type="button" class="ms-btn-choice flex-1 ${this.draft.gender === "male" ? "active" : ""}" data-gender="male">♂ Male</button>
              <button type="button" class="ms-btn-choice flex-1 ${this.draft.gender === "female" ? "active" : ""}" data-gender="female">♀ Female</button>
            </div>
          </div>

          <!-- Skin Tone Swatches -->
          <div class="field mb-3">
            <span class="block text-xs font-semibold text-slate-300 mb-1">Skin Tone</span>
            <div class="flex gap-2 flex-wrap">
              ${skins.map((s) => `
                <button type="button" class="ms-skin-swatch ${this.draft.skin === s.id ? "active" : ""}" data-skin="${s.id}" title="${s.name}" style="background-color: ${s.color};">
                  <span class="sr-only">${s.name}</span>
                </button>
              `).join("")}
            </div>
          </div>

          <!-- Hair Style -->
          <div class="field mb-3">
            <span class="block text-xs font-semibold text-slate-300 mb-1">Hair Style</span>
            <div class="flex gap-1.5 flex-wrap">
              ${hairs.map((h) => `
                <button type="button" class="ms-btn-choice text-xs px-2.5 py-1 ${this.draft.hair === h.id ? "active" : ""}" data-hair="${h.id}">${h.name}</button>
              `).join("")}
            </div>
          </div>

          <!-- Face Expression -->
          <div class="field mb-3">
            <span class="block text-xs font-semibold text-slate-300 mb-1">Face Expression</span>
            <div class="flex gap-1.5 flex-wrap">
              ${faces.map((f) => `
                <button type="button" class="ms-btn-choice text-xs px-2.5 py-1 ${this.draft.face === f.id ? "active" : ""}" data-face="${f.id}">${f.name}</button>
              `).join("")}
            </div>
          </div>

          <!-- Starter Outfit -->
          <div class="field mb-4">
            <span class="block text-xs font-semibold text-slate-300 mb-1">Starter Clothing</span>
            <div class="flex gap-1.5 flex-wrap">
              ${outfits.map((o) => `
                <button type="button" class="ms-btn-choice text-xs px-2.5 py-1 ${this.draft.top === o.top ? "active" : ""}" data-top="${o.top}" data-bottom="${o.bottom}">${o.name}</button>
              `).join("")}
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation Bar -->
      <div class="flex items-center justify-between mt-4 pt-3 border-t border-slate-800">
        <button type="button" class="ms-btn-subtle px-4 py-2 text-xs" id="btn-back-step-1">
          ← Back to Archetype
        </button>
        <button type="button" class="ms-btn-primary px-5 py-2 text-xs font-bold" id="btn-next-step-3">
          Next: Name & Finalize →
        </button>
      </div>
    `;

    const updatePreview = () => {
      const img = wrap.querySelector("#salon-avatar") as HTMLImageElement;
      if (img) img.src = this.getCharAvatarUrl(this.getDraftLook(), this.previewAction);
    };

    // Poses
    wrap.querySelectorAll("[data-salon-pose]").forEach((b) => {
      b.addEventListener("click", () => {
        this.previewAction = (b as HTMLElement).dataset.salonPose as any;
        wrap.querySelectorAll("[data-salon-pose]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        updatePreview();
      });
    });

    // Gender
    wrap.querySelectorAll("[data-gender]").forEach((b) => {
      b.addEventListener("click", () => {
        this.draft.gender = (b as HTMLElement).dataset.gender || "male";
        if (this.draft.gender === "female") {
          this.draft.face = 20000;
          this.draft.hair = 31000;
        } else {
          this.draft.face = 20000;
          this.draft.hair = 30030;
        }
        this.render();
      });
    });

    // Skin
    wrap.querySelectorAll("[data-skin]").forEach((b) => {
      b.addEventListener("click", () => {
        this.draft.skin = Number((b as HTMLElement).dataset.skin) || 2000;
        wrap.querySelectorAll("[data-skin]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        updatePreview();
      });
    });

    // Hair
    wrap.querySelectorAll("[data-hair]").forEach((b) => {
      b.addEventListener("click", () => {
        this.draft.hair = Number((b as HTMLElement).dataset.hair) || 30030;
        wrap.querySelectorAll("[data-hair]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        updatePreview();
      });
    });

    // Face
    wrap.querySelectorAll("[data-face]").forEach((b) => {
      b.addEventListener("click", () => {
        this.draft.face = Number((b as HTMLElement).dataset.face) || 20000;
        wrap.querySelectorAll("[data-face]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        updatePreview();
      });
    });

    // Outfits
    wrap.querySelectorAll("[data-top]").forEach((b) => {
      b.addEventListener("click", () => {
        const el = b as HTMLElement;
        this.draft.top = Number(el.dataset.top) || 1040002;
        this.draft.bottom = Number(el.dataset.bottom) || 1060002;
        wrap.querySelectorAll("[data-top]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        updatePreview();
      });
    });

    // Navigation
    wrap.querySelector("#btn-back-step-1")?.addEventListener("click", () => {
      this.createStep = 1;
      this.render();
    });

    wrap.querySelector("#btn-next-step-3")?.addEventListener("click", () => {
      this.createStep = 3;
      this.render();
    });

    return wrap;
  }

  // STEP 3: Character Name & Identity Confirmation
  private renderStep3Identity(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "ms-step-content ms-step-identity";

    const currentArch = ARCHETYPES.find((a) => a.id === this.draft.classId) || ARCHETYPES[0];

    wrap.innerHTML = `
      <div class="ms-identity-layout">
        <!-- Left: Final Hero Pedestal -->
        <div class="ms-identity-preview-col">
          <div class="ms-identity-stage">
            <div class="ms-stage-light"></div>
            <img id="identity-avatar" src="${this.getCharAvatarUrl(this.getDraftLook(), this.previewAction)}" class="ms-identity-sprite" alt="Avatar Final" />
            <div class="ms-identity-pedestal"></div>
          </div>
          <div class="text-center mt-3">
            <span class="ms-badge-class text-xs px-3 py-1" style="background: ${currentArch.color}30; border: 1px solid ${currentArch.color}; color: ${currentArch.color};">
              ${currentArch.name.toUpperCase()} · ${currentArch.primaryStat}
            </span>
          </div>
        </div>

        <!-- Right: Name Entry & Passport Summary -->
        <div class="ms-identity-form-col">
          <div class="field mb-3">
            <span class="block text-xs font-semibold text-slate-300 mb-1">Character Name</span>
            <div class="flex gap-2">
              <input id="identity-name-input" type="text" maxlength="12" placeholder="2-12 alphanumeric characters" value="${this.draft.name}" class="flex-1" />
              <button type="button" id="btn-check-name" class="ms-btn-secondary whitespace-nowrap" ${this.checkingName ? "disabled" : ""}>
                ${this.checkingName ? "Checking…" : "Check"}
              </button>
              <button type="button" id="btn-dice-name" class="ms-btn-subtle px-2.5" title="Suggest random Maple name">
                🎲
              </button>
            </div>
            <div id="name-status" class="text-[11px] mt-1 font-semibold"></div>
          </div>

          <!-- Adventurer Passport Summary -->
          <div class="ms-passport-card">
            <div class="ms-passport-header">
              <span class="text-xs font-bold text-amber-300">ADVENTURER PASSPORT</span>
              <span class="text-[10px] text-slate-400 font-mono">MAPLE ID #001</span>
            </div>
            <div class="ms-passport-grid">
              <div class="row">
                <span class="k">Class</span>
                <span class="v text-white font-semibold">${currentArch.name} (${currentArch.korean})</span>
              </div>
              <div class="row">
                <span class="k">Primary Stat</span>
                <span class="v font-mono text-emerald-400">${currentArch.primaryStat}</span>
              </div>
              <div class="row">
                <span class="k">Starting World</span>
                <span class="v text-cyan-300">Scania</span>
              </div>
              <div class="row">
                <span class="k">Starting Town</span>
                <span class="v text-white">Free Market (910000000)</span>
              </div>
              <div class="row">
                <span class="k">Initial Meso</span>
                <span class="v text-yellow-400 font-mono">1,000 ⛃</span>
              </div>
              <div class="row">
                <span class="k">Starter Weapon</span>
                <span class="v text-slate-300">${currentArch.weaponName}</span>
              </div>
            </div>
          </div>

          <!-- Post-Creation First Steps & Roadmap Card -->
          <div class="ms-roadmap-card mt-3 p-3 bg-slate-900/80 border border-sky-500/30 rounded-lg text-left shadow-md">
            <div class="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10">
              <span class="text-[11px] font-black text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                <span class="inline-block w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]"></span>
                First Steps & Progression Roadmap
              </span>
              <span class="text-[9.5px] font-mono text-slate-400">Press 'G' for Codex</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[10.5px]">
              <div class="flex items-start gap-1.5 bg-slate-950/60 p-2 rounded border border-white/5">
                <span class="font-bold text-sky-400 font-mono">1.</span>
                <div>
                  <b class="text-white">Spawn & Gear:</b>
                  <p class="text-slate-300 text-[10px] mt-0.5 leading-snug">Spawn in Free Market safe zone. Open Inventory (<b>I</b>/<b>E</b>) to equip starter gear in free grid.</p>
                </div>
              </div>
              <div class="flex items-start gap-1.5 bg-slate-950/60 p-2 rounded border border-white/5">
                <span class="font-bold text-emerald-400 font-mono">2.</span>
                <div>
                  <b class="text-white">Hunt Victoria:</b>
                  <p class="text-slate-300 text-[10px] mt-0.5 leading-snug">Take portals (<b>↑</b>). Attack (<b>Ctrl</b>/<b>X</b>) Snails/Slimes. Loot (<b>Z</b>) or Auto Battle (<b>B</b>).</p>
                </div>
              </div>
              <div class="flex items-start gap-1.5 bg-slate-950/60 p-2 rounded border border-white/5">
                <span class="font-bold text-amber-400 font-mono">3.</span>
                <div>
                  <b class="text-white">25-Kill Bosses:</b>
                  <p class="text-slate-300 text-[10px] mt-0.5 leading-snug">Every 25 kills summons Stage Boss! Toggle <b>AUTO BOSS</b> for guaranteed rare gear & cubes.</p>
                </div>
              </div>
              <div class="flex items-start gap-1.5 bg-slate-950/60 p-2 rounded border border-white/5">
                <span class="font-bold text-purple-400 font-mono">4.</span>
                <div>
                  <b class="text-white">Jobs & Stars:</b>
                  <p class="text-slate-300 text-[10px] mt-0.5 leading-snug">1st/2nd/3rd/4th Job at Lv. 10/30/70/120. Enhance gear up to 15 Stars (<b>J</b>) & re-roll potentials.</p>
                </div>
              </div>
            </div>
          </div>

          <!-- CTA Button -->
          <button type="button" class="ms-btn-gamestart w-full mt-4" id="btn-create-finish" ${this.loading ? "disabled" : ""}>
            <span class="play-text">${this.loading ? "CREATING ADVENTURER…" : "★ ENTER MAPLE WORLD ★"}</span>
            <span class="play-sub">Begin Journey</span>
          </button>
        </div>
      </div>

      <!-- Navigation Bar -->
      <div class="flex items-center justify-between mt-4 pt-3 border-t border-slate-800">
        <button type="button" class="ms-btn-subtle px-4 py-2 text-xs" id="btn-back-step-2">
          ← Back to Appearance
        </button>
      </div>
    `;

    const nameInput = wrap.querySelector("#identity-name-input") as HTMLInputElement;
    const nameStatus = wrap.querySelector("#name-status") as HTMLElement;
    const checkNameBtn = wrap.querySelector("#btn-check-name") as HTMLButtonElement;
    const diceBtn = wrap.querySelector("#btn-dice-name") as HTMLButtonElement;

    const doCheckName = async (name: string) => {
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
    };

    checkNameBtn?.addEventListener("click", () => {
      doCheckName(nameInput.value.trim());
    });

    diceBtn?.addEventListener("click", () => {
      const rand = SUGGESTED_NAMES[Math.floor(Math.random() * SUGGESTED_NAMES.length)];
      const suffix = Math.floor(10 + Math.random() * 90);
      const generated = `${rand}${suffix}`;
      nameInput.value = generated;
      this.draft.name = generated;
      nameStatus.textContent = "";
      doCheckName(generated);
    });

    nameInput?.addEventListener("input", () => {
      this.draft.name = nameInput.value.trim();
      this.nameAvailable = null;
      nameStatus.textContent = "";
    });

    wrap.querySelector("#btn-back-step-2")?.addEventListener("click", () => {
      this.createStep = 2;
      this.render();
    });

    // Final Create Character Submission
    wrap.querySelector("#btn-create-finish")?.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) {
        this.setMessage("Please enter a character name", "error");
        return;
      }
      if (!/^[a-zA-Z0-9]{2,12}$/.test(name)) {
        this.setMessage("Character name must be 2-12 alphanumeric characters", "error");
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
        // Reload characters and auto-select newly created character
        await this.loadCharacters();
        const createdIdx = this.characters.findIndex((c) => c.name === name);
        if (createdIdx >= 0) {
          this.selectedCharacterIndex = createdIdx;
        }
        this.mode = "char_select";
        this.render();
      } else {
        this.setMessage(res.error || "Failed to create character", "error");
      }
    });

    return wrap;
  }
}
