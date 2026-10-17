import type { Game } from "../game.ts";
import type { PetData, PetInstance, PetFrame, PetItem, PetBonus } from "../game-types.ts";
import { FootholdTree } from "../physics.ts";
import { json } from "../assets.ts";
import { PET_RARITY_NAME } from "../items.ts";

export class PetSystem {
  private static petDataCache = new Map<number, PetData>();
  private static passiveExpTimer = 0;

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

  /** EXP required to advance from current level to level + 1 */
  public static expForLevel(level: number): number {
    if (level >= 100) return 999999999;
    return Math.floor(55 * Math.pow(level, 1.32)) + 45;
  }

  /** Roll a random milestone bonus for level 25, 50, 75, 100 */
  public static rollBonusForLevel(level: number, rarity = 0): PetBonus {
    const rarityMult = 1 + rarity * 0.25; // 0=1x, 1=1.25x, 2=1.5x, 3=1.75x, 4=2x
    const pool: { type: PetBonus["type"]; make: () => { value: number; label: string } }[] = [
      {
        type: "watk",
        make: () => {
          const v = Math.round((3 + Math.floor(Math.random() * 5)) * rarityMult);
          return { value: v, label: `+${v} Weapon Attack` };
        },
      },
      {
        type: "matk",
        make: () => {
          const v = Math.round((3 + Math.floor(Math.random() * 5)) * rarityMult);
          return { value: v, label: `+${v} Magic Attack` };
        },
      },
      {
        type: "all_stat",
        make: () => {
          const v = Math.round((4 + Math.floor(Math.random() * 7)) * rarityMult);
          return { value: v, label: `+${v} All Stats (STR/DEX/INT/LUK)` };
        },
      },
      {
        type: "speed",
        make: () => {
          const v = Math.round((6 + Math.floor(Math.random() * 8)) * rarityMult);
          return { value: v, label: `+${v} Move Speed` };
        },
      },
      {
        type: "jump",
        make: () => {
          const v = Math.round((4 + Math.floor(Math.random() * 6)) * rarityMult);
          return { value: v, label: `+${v} Jump` };
        },
      },
      {
        type: "hp",
        make: () => {
          const v = Math.round((120 + Math.floor(Math.random() * 150)) * rarityMult);
          return { value: v, label: `+${v} Max HP` };
        },
      },
      {
        type: "mp",
        make: () => {
          const v = Math.round((80 + Math.floor(Math.random() * 100)) * rarityMult);
          return { value: v, label: `+${v} Max MP` };
        },
      },
      {
        type: "meso_rate",
        make: () => {
          const v = Math.round((3 + Math.floor(Math.random() * 5)) * rarityMult);
          return { value: v, label: `+${v}% Meso Drop Rate` };
        },
      },
      {
        type: "drop_rate",
        make: () => {
          const v = Math.round((2 + Math.floor(Math.random() * 4)) * rarityMult);
          return { value: v, label: `+${v}% Item Drop Rate` };
        },
      },
    ];

    const pick = pool[Math.floor(Math.random() * pool.length)];
    const generated = pick.make();
    return {
      level,
      type: pick.type,
      value: generated.value,
      label: generated.label,
    };
  }

  /** Create a new Pet inventory item */
  public static createPetItem(id: number, name?: string, rarity?: number, initialLevel = 1): PetItem {
    const rolledRarity = rarity !== undefined ? rarity : (Math.random() < 0.05 ? 4 : Math.random() < 0.15 ? 3 : Math.random() < 0.35 ? 2 : Math.random() < 0.65 ? 1 : 0);
    const petName = name || (this.getPetData(id)?.name ?? `Pet ${id}`);
    const bonuses: PetBonus[] = [];

    // Pre-roll milestone bonuses if created above level 25
    for (const milestone of [25, 50, 75, 100]) {
      if (initialLevel >= milestone) {
        bonuses.push(this.rollBonusForLevel(milestone, rolledRarity));
      }
    }

    return {
      uid: "pet_" + crypto.randomUUID().slice(0, 8),
      id,
      name: petName,
      level: Math.min(100, Math.max(1, initialLevel)),
      exp: 0,
      maxExp: this.expForLevel(initialLevel),
      rarity: rolledRarity,
      bonuses,
    };
  }

  /** Add EXP to a pet and handle leveling, milestone bonus unlocks & effects */
  public static addPetExp(game: Game, pet: PetInstance | PetItem, amount: number): boolean {
    if (pet.level >= 100 || amount <= 0) return false;

    pet.exp += amount;
    let leveledUp = false;

    while (pet.level < 100 && pet.exp >= pet.maxExp) {
      pet.exp -= pet.maxExp;
      pet.level++;
      pet.maxExp = this.expForLevel(pet.level);
      leveledUp = true;

      // Milestone reached every 25 levels (25, 50, 75, 100)
      if (pet.level % 25 === 0) {
        const bonus = this.rollBonusForLevel(pet.level, pet.rarity);
        pet.bonuses.push(bonus);
        game.onChat(
          "notice",
          `★ [Pet Milestone] ${pet.name} (Lv. ${pet.level} ${PET_RARITY_NAME[pet.rarity] ?? ""}) unlocked milestone bonus: ${bonus.label}!`
        );
      } else {
        game.onChat("notice", `★ [Pet] ${pet.name} leveled up to Lv. ${pet.level}!`);
      }
    }

    if (leveledUp) {
      // Find active pet instance if this was a PetItem or vice versa
      const instance = "x" in pet ? (pet as PetInstance) : game.pets.find((p) => p.uid === pet.uid || p.id === pet.id);
      const item = "equippedSlot" in pet || !("x" in pet) ? (pet as PetItem) : game.petItems?.find((it) => it.uid === pet.uid || it.id === pet.id);

      // Keep both in sync
      if (instance && item) {
        item.level = instance.level = pet.level;
        item.exp = instance.exp = pet.exp;
        item.maxExp = instance.maxExp = pet.maxExp;
        item.bonuses = instance.bonuses = [...pet.bonuses];
      }

      // Trigger Authentic MapleStory WZ Level-Up effect above pet in world
      if (instance) {
        const eff = (game.fxData?.petLevelUp && game.fxData.petLevelUp.length > 0)
          ? game.fxData.petLevelUp
          : game.fxData?.levelUp;

        if (eff && eff.length > 0) {
          game.fx.push({
            frames: eff,
            x: Math.round(instance.x),
            y: Math.round(instance.y),
            flip: false,
            t: 0,
            follow: false,
          });
        }
      }

      game.recalc();
      game.onChange();
    }

    return leveledUp;
  }

  /** Triggered when an active pet loots a ground drop */
  public static onDropLooted(game: Game, pet: PetInstance) {
    this.addPetExp(game, pet, 20);
  }

  /** Triggered when monsters are slain near active pets */
  public static onMobKilled(game: Game, mobLevel: number) {
    if (!game.pets?.length) return;
    const gained = Math.max(10, Math.min(250, (mobLevel || 10) * 3));
    for (const pet of game.pets) {
      this.addPetExp(game, pet, gained);
    }
  }

  /** Gather all active bonuses from currently equipped pets */
  public static getEquippedPetBonuses(game: Game): PetBonus[] {
    const list: PetBonus[] = [];
    if (!game.pets?.length) return list;
    for (const pet of game.pets) {
      if (pet.bonuses?.length) {
        list.push(...pet.bonuses);
      }
    }
    return list;
  }

  /** Equip a PetItem into a target slot (0, 1, or 2) */
  public static async equipPetItem(game: Game, petItem: PetItem, slotIndex?: number): Promise<boolean> {
    const data = await this.loadPetData(petItem.id);
    if (!data) return false;

    // Ensure petItem exists in game.petItems
    if (!game.petItems) game.petItems = [];
    if (!game.petItems.some((it) => it.uid === petItem.uid)) {
      game.petItems.push(petItem);
    }

    // Determine target slot
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
      }
    }

    // Unequip whatever was in targetSlot
    this.unequipPetSlot(game, targetSlot);

    // Unequip this pet item if it was in another slot
    this.unequipPetByUid(game, petItem.uid);

    petItem.slotIndex = targetSlot;

    const dist = 35 + targetSlot * 32;
    const pet: PetInstance = {
      uid: petItem.uid,
      id: petItem.id,
      name: petItem.name || data.name,
      slotIndex: targetSlot,
      level: petItem.level,
      exp: petItem.exp,
      maxExp: petItem.maxExp,
      rarity: petItem.rarity,
      bonuses: [...petItem.bonuses],
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
      isLocal: true,
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
    game.recalc();
    game.onChange();
    return true;
  }

  /** Unequip a pet by its slot index (0, 1, 2) */
  public static unequipPetSlot(game: Game, slotIndex: number) {
    const pet = game.pets.find((p) => p.slotIndex === slotIndex);
    if (!pet) return;

    // Clear slot on PetItem in bag
    if (game.petItems) {
      const it = game.petItems.find((x) => x.uid === pet.uid || x.id === pet.id);
      if (it) it.slotIndex = undefined;
    }

    game.pets = game.pets.filter((p) => p.slotIndex !== slotIndex);
    game.recalc();
    game.onChange();
  }

  public static unequipPetByUid(game: Game, uid: string) {
    const pet = game.pets.find((p) => p.uid === uid);
    if (pet) {
      this.unequipPetSlot(game, pet.slotIndex);
    }
  }

  /** Legacy equip helper by pet ID */
  public static async equipPet(game: Game, id: number, slotIndex?: number): Promise<boolean> {
    if (!game.petItems) game.petItems = [];
    let item = game.petItems.find((it) => it.id === id);
    if (!item) {
      item = this.createPetItem(id);
      game.petItems.push(item);
    }
    return this.equipPetItem(game, item, slotIndex);
  }

  /** Legacy unequip helper by slot index */
  public static unequipPet(game: Game, slotIndex: number) {
    this.unequipPetSlot(game, slotIndex);
  }

  public static updatePets(game: Game, dt: number) {
    if (!game.pets.length || !game.map || game.loadingMap) return;

    // Passive EXP gain every 5 seconds for moving companion pets
    this.passiveExpTimer += dt;
    const givePassiveExp = this.passiveExpTimer >= 5.0;
    if (givePassiveExp) {
      this.passiveExpTimer = 0;
    }

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

      // Target selection: Follow player (pet item looting permanently disabled)
      const targetX = targetFollowX;
      const targetY = targetFollowY;
      const isLooting = false;

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
        if (givePassiveExp) {
          this.addPetExp(game, pet, 3);
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
