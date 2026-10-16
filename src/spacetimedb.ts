// SpacetimeDB Client & Database Adapter for Maple Wayfarer
// Powers real-time multiplayer state synchronization, database persistence & reducers

export interface SpacetimeCharacter {
  name: string;
  username: string;
  classId: string;
  gender: string;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  meso: number;
  mapId: number;
  x: number;
  y: number;
  look: number[];
  stats: any;
  inventory: any[];
  equipment: any;
  skills: any;
  updatedAt: number;
}

export class SpacetimeClient {
  private baseUrl: string;
  public currentUser: string | null = null;
  public currentCharacter: SpacetimeCharacter | null = null;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    try {
      this.currentUser = localStorage.getItem("ms_current_user") || null;
    } catch {}
  }

  /** Check if SpacetimeDB server is healthy */
  async checkHealth(): Promise<{ ok: boolean; status?: any }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/spacetimedb/status`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return { ok: false };
      const data = await res.json();
      return { ok: !!data?.spacetimedb?.connected, status: data };
    } catch {
      return { ok: false };
    }
  }

  /** Register account in SpacetimeDB */
  async register(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || "Registration failed" };
      }
      this.currentUser = data.username;
      try { localStorage.setItem("ms_current_user", data.username); } catch {}
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Network error" };
    }
  }

  /** Login to account */
  async login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || "Invalid username or password" };
      }
      this.currentUser = data.username;
      try { localStorage.setItem("ms_current_user", data.username); } catch {}
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Network error" };
    }
  }

  /** Logout */
  logout() {
    this.currentUser = null;
    this.currentCharacter = null;
    try {
      localStorage.removeItem("ms_current_user");
      localStorage.removeItem("ms_current_character");
    } catch {}
  }

  /** Fetch all characters for user from SpacetimeDB */
  async getCharacters(username = this.currentUser): Promise<{ ok: boolean; characters: SpacetimeCharacter[]; error?: string }> {
    if (!username) return { ok: false, characters: [], error: "Not logged in" };
    try {
      const res = await fetch(`${this.baseUrl}/api/characters?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, characters: [], error: data.error || "Failed to fetch characters" };
      }
      return { ok: true, characters: data.characters || [] };
    } catch (e: any) {
      return { ok: false, characters: [], error: e?.message || "Network error" };
    }
  }

  /** Check if character name is available */
  async checkName(name: string): Promise<{ available: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/characters/check-name?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      return { available: !!data.available, error: data.error };
    } catch {
      return { available: false, error: "Network error" };
    }
  }

  /** Create character in SpacetimeDB */
  async createCharacter(char: {
    username?: string;
    name: string;
    classId: string;
    gender: string;
    look: number[];
    stats?: any;
    equipment?: any;
  }): Promise<{ ok: boolean; name?: string; error?: string }> {
    const user = char.username || this.currentUser;
    if (!user) return { ok: false, error: "Not logged in" };
    try {
      const res = await fetch(`${this.baseUrl}/api/characters/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...char, username: user }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || "Failed to create character" };
      }
      return { ok: true, name: data.name };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Network error" };
    }
  }

  /** Delete character from SpacetimeDB */
  async deleteCharacter(name: string, username = this.currentUser): Promise<{ ok: boolean; error?: string }> {
    if (!username) return { ok: false, error: "Not logged in" };
    try {
      const res = await fetch(`${this.baseUrl}/api/characters/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, name }),
      });
      const data = await res.json();
      return { ok: res.ok && data.ok, error: data.error };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Network error" };
    }
  }

  /** Rename character in SpacetimeDB */
  async renameCharacter(oldName: string, newName: string): Promise<{ ok: boolean; name?: string; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/characters/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName, newName }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || "Failed to rename character" };
      }
      return { ok: true, name: data.name };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Network error" };
    }
  }

  /** Save character state to SpacetimeDB */
  async saveCharacter(saveData: {
    name: string;
    level: number;
    exp: number;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    meso: number;
    mapId: number;
    x: number;
    y: number;
    look: number[];
    stats: any;
    inventory: any[];
    equipment: any;
    skills: any;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/characters/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveData),
      });
      const data = await res.json();
      return { ok: res.ok && data.ok, error: data.error };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Network error" };
    }
  }
}

export const spacetime = new SpacetimeClient();
