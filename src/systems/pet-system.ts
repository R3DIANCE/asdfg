import type { Game } from "../game.ts";
import type { PetData, PetInstance, PetFrame } from "../game-types.ts";
import { FootholdTree } from "../physics.ts";
import { json } from "../assets.ts";
import { GEAR, MATS } from "../items.ts";
import { ITEMS } from "../skills.ts";

export class PetSystem {
  private static petDataCache = new Map<number, PetData>();

  public static async loadPetData(id: number): Promise<PetData | null> {
    if (this.petDataCache.has(id)) return this.petDataCache.get(id)!;
    try {
      const data = await json<PetData>(`/wz/data/pet/${id}`);
      if (data) {
        this.petDataCache.set(id, data);
        return data;
      }
    } catch (e) {
      console.warn("Failed to load pet data for", id, e);
    }
    return null;
  }

  public static getPetData(id: number): PetData | undefined {
    return this.petDataCache.get(id);
  }

  public static async equipPet(game: Game, id: number, slotIndex?: number): Promise<boolean> {
    const data = await this.loadPetData(id);
    if (!data) return false;

    // Remove if already equipped in any slot
    game.pets = game.pets.filter((p) => p.id !== id);

    let targetSlot = slotIndex;
    if (targetSlot === undefined) {
      const usedSlots = new Set(game.pets.map((p) => p.slotIndex));
      for (let s = 0; s < 3; s++) {
        if (!usedSlots.has(s)) {
          targetSlot = s;
          break;
        }
      }
      if (targetSlot === undefined) {
        targetSlot = 0;
        // Replace slot 0
        game.pets = game.pets.filter((p) => p.slotIndex !== 0);
      }
    } else {
      // Remove whatever was in targetSlot
      game.pets = game.pets.filter((p) => p.slotIndex !== targetSlot);
    }

    const dist = 35 + targetSlot * 32;
    const pet: PetInstance = {
      id,
      name: data.name,
      slotIndex: targetSlot,
      x: game.p.x - game.p.face * dist,
      y: game.p.y,
      vx: 0,
      vy: 0,
      dir: game.p.face,
      state: "stand0",
      animTimer: 0,
      frame: 0,
      fh: game.p.fh,
      lootCooldown: 0,
    };

    // Preload stand0 and move frames into asset cache
    for (const act of ["stand0", "move", "jump", "hang"]) {
      const frames = data.actions[act];
      if (frames) {
        for (const fr of frames) {
          game.assets.load(fr.url);
        }
      }
    }

    game.pets.push(pet);
    game.pets.sort((a, b) => a.slotIndex - b.slotIndex);
    game.onChange();
    return true;
  }

  public static unequipPet(game: Game, slotIndex: number) {
    const prevLen = game.pets.length;
    game.pets = game.pets.filter((p) => p.slotIndex !== slotIndex);
    if (game.pets.length !== prevLen) {
      game.onChange();
    }
  }

  public static updatePets(game: Game, dt: number) {
    if (!game.pets.length || !game.map || game.loadingMap) return;

    for (let i = 0; i < game.pets.length; i++) {
      const pet = game.pets[i];
      const data = this.petDataCache.get(pet.id);
      if (!data) {
        this.loadPetData(pet.id);
        continue;
      }

      if (pet.lootCooldown && pet.lootCooldown > 0) {
        pet.lootCooldown -= dt;
      }

      // Check distance to player
      const pDist = Math.hypot(game.p.x - pet.x, game.p.y - pet.y);
      const followOffset = 36 + pet.slotIndex * 32;
      const targetFollowX = game.p.x - game.p.face * followOffset;
      const targetFollowY = game.p.y;

      // Teleport if too far
      if (pDist > 450) {
        pet.x = targetFollowX;
        pet.y = targetFollowY;
        pet.vx = 0;
        pet.vy = 0;
        pet.fh = game.p.fh;
        pet.state = "stand0";
        continue;
      }

      // Target selection: Nearest drop within 200px or follow player
      let targetX = targetFollowX;
      let targetY = targetFollowY;
      let isLooting = false;

      let nearestDrop: any = null;
      let nearestDropDist = 200;
      for (const d of game.drops) {
        if (d.picked) continue;
        const dDist = Math.hypot(d.x - pet.x, d.y - pet.y);
        if (dDist < nearestDropDist) {
          nearestDropDist = dDist;
          nearestDrop = d;
        }
      }

      if (nearestDrop) {
        targetX = nearestDrop.x;
        targetY = nearestDrop.y;
        isLooting = true;
        // Check pickup radius
        if (nearestDropDist < 28 && (!pet.lootCooldown || pet.lootCooldown <= 0)) {
          pet.lootCooldown = 0.2;
          game.collectDrop(nearestDrop, "pet");
        }
      }

      // Handle climbing player
      if (game.p.ladder && !isLooting) {
        if (data.actions.hang) {
          pet.state = "hang";
        }
      }

      // Horizontal movement
      const dx = targetX - pet.x;
      const stopThreshold = isLooting ? 8 : 14;

      if (Math.abs(dx) > stopThreshold) {
        pet.dir = dx > 0 ? 1 : -1;
        const speed = Math.min(220, Math.max(90, Math.abs(dx) * 2.8));
        pet.vx = pet.dir * speed;
        if (pet.fh) {
          pet.state = "move";
        }
      } else {
        pet.vx = 0;
        if (!isLooting) {
          pet.dir = game.p.face;
        }
        if (pet.fh && pet.state !== "hang") {
          pet.state = "stand0";
        }
      }

      // Jump if player is on a higher foothold and moving toward player
      if (!isLooting && game.p.y < pet.y - 35 && pet.fh && Math.abs(dx) > 20 && Math.random() < 0.05) {
        pet.vy = -380;
        pet.fh = null;
        pet.state = "jump";
      }

      // Gravity and vertical integration
      if (!pet.fh) {
        pet.vy = Math.min(650, pet.vy + 1300 * dt);
        pet.state = "jump";
      }

      pet.x += pet.vx * dt;
      pet.y += pet.vy * dt;

      // Collision with footholds
      if (game.tree) {
        const landingFh = game.tree.landing(pet.x, pet.y - 12, pet.y + 24);
        if (landingFh && pet.vy >= 0) {
          pet.fh = landingFh;
          pet.vy = 0;
          pet.y = FootholdTree.yAt(landingFh, pet.x);
          if (Math.abs(pet.vx) > 5) pet.state = "move";
          else if (pet.state !== "hang") pet.state = "stand0";
        } else if (pet.fh) {
          if (pet.x < pet.fh.x1 || pet.x > pet.fh.x2) {
            const nextFh = game.tree.landing(pet.x, pet.y - 10, pet.y + 22);
            if (nextFh) {
              pet.fh = nextFh;
              pet.y = FootholdTree.yAt(nextFh, pet.x);
            } else {
              pet.fh = null;
            }
          } else {
            pet.y = FootholdTree.yAt(pet.fh, pet.x);
          }
        }
      }

      // Animation frame advancement
      const actionFrames = data.actions[pet.state] ?? data.actions.stand0 ?? Object.values(data.actions)[0];
      if (actionFrames?.length) {
        pet.animTimer += dt * 1000;
        const curDelay = actionFrames[pet.frame % actionFrames.length]?.delay ?? 140;
        if (pet.animTimer >= curDelay) {
          pet.animTimer -= curDelay;
          pet.frame = (pet.frame + 1) % actionFrames.length;
        }
      }
    }
  }
}
