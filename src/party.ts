// MapleStory Party System — Authentic Party Management, Live Member Status, & EXP Sharing
// Features: Up to 6 members, Leader controls, Same-map shared EXP, Live HP sync, GM force party

export interface PartyMember {
  name: string;
  level: number;
  job: string;
  mapId: number;
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
  online: boolean;
  isLeader: boolean;
  look?: number[];
}

export interface Party {
  id: string;
  leaderName: string;
  members: PartyMember[];
  createdAt: number;
}

export class PartyClient {
  static async getParty(id: string): Promise<Party | null> {
    try {
      const res = await fetch(`/api/party/get?id=${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.party ?? null;
    } catch {
      return null;
    }
  }

  static async getPartyForPlayer(charName: string): Promise<Party | null> {
    try {
      const res = await fetch(`/api/party/player/${encodeURIComponent(charName)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.party ?? null;
    } catch {
      return null;
    }
  }

  static async createParty(
    leaderName: string,
    level = 1,
    job = "Beginner",
    mapId = 910000000,
    hp = 50,
    maxHp = 50,
    look?: number[],
    mp = 5,
    maxMp = 5
  ): Promise<{ ok: boolean; party?: Party; error?: string }> {
    try {
      const res = await fetch("/api/party/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderName, level, job, mapId, hp, maxHp, look, mp, maxMp }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to create party" };
    }
  }

  static async invite(partyId: string, inviterName: string, targetName: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/party/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, inviterName, targetName }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to send invite" };
    }
  }

  static async join(
    partyId: string,
    characterName: string,
    level = 1,
    job = "Beginner",
    mapId = 910000000,
    hp = 50,
    maxHp = 50,
    look?: number[],
    mp = 5,
    maxMp = 5
  ): Promise<{ ok: boolean; party?: Party; error?: string }> {
    try {
      const res = await fetch("/api/party/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, characterName, level, job, mapId, hp, maxHp, look, mp, maxMp }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to join party" };
    }
  }

  static async leave(characterName: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/party/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterName }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to leave party" };
    }
  }

  static async expel(leaderName: string, targetName: string): Promise<{ ok: boolean; party?: Party; error?: string }> {
    try {
      const res = await fetch("/api/party/expel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderName, targetName }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to expel member" };
    }
  }

  static async passLeader(leaderName: string, targetName: string): Promise<{ ok: boolean; party?: Party; error?: string }> {
    try {
      const res = await fetch("/api/party/pass_leader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderName, targetName }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to transfer leadership" };
    }
  }

  static async disband(leaderName: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/party/disband", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderName }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to disband party" };
    }
  }

  static async forceJoin(gmName: string, targetName: string, partyId?: string): Promise<{ ok: boolean; party?: Party; error?: string }> {
    try {
      const res = await fetch("/api/party/force_join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmName, targetName, partyId }),
      });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to force party join" };
    }
  }
}
