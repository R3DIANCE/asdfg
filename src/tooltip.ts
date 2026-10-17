// Authentic 1:1 MapleStory Tooltip Generator (Image 2 standard)
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { BorderBeam, type BorderBeamColorVariant } from "border-beam";
import {
  GEAR,
  MATS,
  RARITY,
  RARITY_COLOR,
  SLOT_NAME,
  gearCombatPower,
  gearIcon,
  gearStats,
  gearValue,
  isHoverItem,
  isWizetHat,
  canClassEquipWeapon,
  getWeaponType,
  WEAPON_TYPE_NAME,
  getWeaponAllowedClassesDesc,
  canClassEquipItem,
  getItemAllowedClassesDesc,
  isOverallItem,
  getItemGender,
  canGenderEquip,
  type Gear,
  type GearBase,
  type Slot,
} from "./items.ts";
import { ITEMS, itemIcon, type ClassId } from "./skills.ts";
import { esc, fmt } from "./util.ts";
import { lucideIcon } from "./lucide.ts";

export function getRarityBeamVariant(rarity: number): BorderBeamColorVariant {
  switch (rarity) {
    case 1: return "ocean";     // Rare: Blue / Aqua glow
    case 2: return "sunset";    // Epic: Violet / Purple / Magenta glow
    case 3: return "gold";      // Unique: Amber / Gold glow
    case 4: return "colorful";  // Legendary: Full rainbow spectrum
    default: return "mono";
  }
}

/** Renders a 25-star row with 5-star groups matching MapleStory */
function renderStarsRow(stars: number, maxStars = 25): string {
  if (stars <= 0) return "";
  let html = `<div class="tt-stars-row">`;
  for (let i = 0; i < maxStars; i++) {
    if (i > 0 && i % 5 === 0) html += `<span class="tt-star-gap"></span>`;
    const filled = i < stars;
    html += `<span class="tt-star ${filled ? "filled" : "empty"}">★</span>`;
  }
  html += `</div>`;
  return html;
}

/** Formats a gear stat row with base and bonus (yellow) */
function statRow(label: string, total: number, base: number, bonus = 0): string {
  if (!total) return "";
  const bonusStr = bonus > 0 ? ` <span class="tt-bonus">(${base} +${bonus})</span>` : "";
  return `<div class="tt-stat-line"><span>${label}</span> <b>+${total}${bonusStr}</b></div>`;
}

/** Tooltip for an owned / equipped Gear instance */
export function renderGearTooltip(g: Gear, isEquipped = false, note = "", playerLevel = 200, playerClassId?: ClassId, playerGender?: string): string {
  const b = GEAR.get(g.id);
  if (!b) return "";
  const st = gearStats(g);
  const rarityName = RARITY[g.rarity] ?? "Normal";
  const rarityColor = RARITY_COLOR[g.rarity] ?? "#ffffff";
  const isOverall = isOverallItem(b.id);
  const slotName = isOverall ? "Overall" : (SLOT_NAME[b.slot as Slot] ?? b.slot);
  const isAcc = ["ring", "ring1", "ring2", "ring3", "ring4", "earrings", "pendant", "shoulder", "belt", "pocket", "emblem", "badge"].includes(b.slot);
  const catLabel = isAcc ? "Accessory" : b.slot === "weapon" ? "Weapon" : "Armor";
  const isWeapon = b.slot === "weapon";
  const wType = getWeaponType(b.id);
  const weaponTypeName = isWeapon && !b.cosmetic && !b.cash ? (WEAPON_TYPE_NAME[wType] ?? "Weapon") : null;
  const isClassAllowed = !playerClassId || canClassEquipItem(playerClassId, b);
  const allowedDesc = getItemAllowedClassesDesc(b);

  // Gender requirement
  const itemGender = b.gender ?? getItemGender(b.id, b.name);
  const isGenderAllowed = canGenderEquip(playerGender, itemGender);
  const genderLabel = itemGender === "male" ? "Male" : itemGender === "female" ? "Female" : "Shared";

  // Deduplicated tags (prevents "Weapon Weapon" duplication)
  const tagList: string[] = [];
  if (isWeapon) {
    tagList.push("Weapon");
    if (weaponTypeName && weaponTypeName !== "Weapon") tagList.push(weaponTypeName);
  } else if (isOverall) {
    tagList.push("Armor", "Overall");
  } else {
    tagList.push(catLabel);
    if (slotName && slotName !== catLabel) tagList.push(slotName);
  }
  const uniqueTags = [...new Set(tagList)];

  // Stars
  const starsHtml = renderStarsRow(g.star);

  // Stats lines with bonus calculation from starforce
  const starMultiplier = g.star * 2;
  const statsHtml = [
    statRow("STR", st.str, b.str, st.str - b.str),
    statRow("DEX", st.dex, b.dex, st.dex - b.dex),
    statRow("INT", st.int, b.int, st.int - b.int),
    statRow("LUK", st.luk, b.luk, st.luk - b.luk),
    statRow("Max HP", st.hp, b.hp, st.hp - b.hp),
    statRow("Attack Power", st.watk, b.watk, st.watk - b.watk),
    statRow("Defense", st.def, b.def, st.def - b.def),
  ].filter(Boolean).join("");

  // Potential lines with BorderBeam glowing border animation (libraries.dev/beam standard)
  let potHtml = "";
  if (g.pot && g.pot.length > 0) {
    const potHead = `<div class="tt-pot-head font-bold flex items-center gap-1.5 text-[11px] mb-1" style="color:${rarityColor}"><span class="tt-pot-box w-2 h-2 rounded-full inline-block" style="background:${rarityColor}; box-shadow: 0 0 6px ${rarityColor}"></span> Potential : ${rarityName}</div>`;
    const potLines = g.pot.map((p) => `<div class="tt-pot-line font-mono text-[9.5px] text-zinc-200">▪ ${p.stat.toUpperCase()}: +${p.pct}%</div>`).join("");

    const potCard = createElement("div", {
      className: "p-2 bg-zinc-950/85 rounded-[6px] border border-white/10 backdrop-blur-sm",
      dangerouslySetInnerHTML: { __html: potHead + potLines },
    });

    const beamWrap = createElement(
      BorderBeam,
      {
        children: potCard,
        size: "sm",
        colorVariant: getRarityBeamVariant(g.rarity),
        borderRadius: 6,
        strength: 0.95,
        duration: 2.4,
      }
    );

    potHtml = `<div class="tt-divider"></div><div class="tt-pot-section my-1.5">${renderToString(beamWrap)}</div>`;
  }

  const reqMet = playerLevel >= b.req;

  return `
    <div class="ms-tooltip-card">
      ${starsHtml}
      <div class="tt-title" style="color:${g.rarity >= 2 ? rarityColor : '#ffffff'}">${esc(b.name)}${g.star ? ` (+${g.star})` : ""}</div>
      <div class="tt-trade">${b.cosmetic ? "Cosmetic / Cash Item" : "Untradable"}</div>
      <div class="tt-divider"></div>
      <div class="tt-meta-row">
        <div class="tt-icon-box">
          <img src="${gearIcon(g.id)}" alt="" class="tt-icon" />
        </div>
        <div class="tt-meta-info">
          <div class="tt-combat-label">${isEquipped ? "Currently Equipped" : "Equipment Inventory"}</div>
          <div class="tt-tags">
            ${uniqueTags.map((t) => `<span class="tt-tag">${t}</span>`).join("")}
            ${isHoverItem(g.id) ? `<span class="tt-tag" style="background: rgba(14, 165, 233, 0.25); color: #38bdf8; border: 1px solid #0284c7;">Hovering Effect</span>` : ""}
            ${isWizetHat(g.id) ? `<span class="tt-tag" style="background: rgba(239, 68, 68, 0.25); color: #f87171; border: 1px solid #dc2626;">Wizet GM Hat</span>` : ""}
          </div>
        </div>
      </div>
      <div class="tt-req-row">
        <div class="tt-req-item"><span>Required Job</span> <b class="${!b.cosmetic && !b.cash && allowedDesc !== "Shared" ? (isClassAllowed ? "tt-good" : "tt-bad") : ""}">${allowedDesc}</b></div>
        ${itemGender !== "both" ? `<div class="tt-req-item"><span>Gender</span> <b class="${isGenderAllowed ? "tt-good" : "tt-bad"}">${genderLabel}</b></div>` : ""}
        <div class="tt-req-item"><span>Required Level</span> <b class="${reqMet ? "tt-good" : "tt-bad"}">Lv. ${b.req}</b></div>
        ${!b.cosmetic && !b.cash ? `<div class="tt-req-item"><span>Combat Power</span> <b class="tt-good">+${fmt(gearCombatPower(g))} CP</b></div>` : ""}
      </div>
      <div class="tt-divider"></div>
      ${b.cosmetic || b.cash || g.cosmetic || g.cash ? `<div class="tt-stats"><div class="tt-stat-row" style="color:#a1a1aa; font-style:italic; padding: 4px 0; justify-content:center;">Pure Visual Cosmetic · No Combat Stats</div></div>` : `<div class="tt-stats">${statsHtml}</div>${potHtml}`}
      <div class="tt-divider"></div>
      <div class="tt-footer-meta">
        <div class="tt-value">Estimated Value ≈ ${fmt(gearValue(g))} mesos</div>
        ${isHoverItem(g.id) ? `<div class="tt-note highlight">${lucideIcon("sparkles", 13)} Special: Only Raven Persona hats grant graceful levitation & hovering effect when equipped.</div>` : ""}
        ${isWizetHat(g.id) ? `<div class="tt-note highlight" style="color:#f87171; border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.1);">${lucideIcon("shield-alert", 13)} GM Power: Official Wizet GameMaster hat. Iconic developer headwear.</div>` : ""}
        ${note ? `<div class="tt-note">${note}</div>` : ""}
      </div>
    </div>
  `;
}

/** Tooltip for an uninstantiated GearBase (e.g. All Items browser) */
export function renderBaseGearTooltip(b: GearBase, note = "Click to claim into inventory", playerLevel = 200, playerClassId?: ClassId, playerGender?: string): string {
  const isOverall = isOverallItem(b.id);
  const slotName = isOverall ? "Overall" : (SLOT_NAME[b.slot as Slot] ?? b.slot);
  const isAcc = ["ring", "ring1", "ring2", "ring3", "ring4", "earrings", "pendant", "shoulder", "belt", "pocket", "emblem", "badge"].includes(b.slot);
  const catLabel = isAcc ? "Accessory" : b.slot === "weapon" ? "Weapon" : "Armor";
  const reqMet = playerLevel >= b.req;
  const isWeapon = b.slot === "weapon";
  const wType = getWeaponType(b.id);
  const weaponTypeName = isWeapon && !b.cosmetic && !b.cash ? (WEAPON_TYPE_NAME[wType] ?? "Weapon") : null;
  const isClassAllowed = !playerClassId || canClassEquipItem(playerClassId, b);
  const allowedDesc = getItemAllowedClassesDesc(b);

  // Gender requirement
  const itemGender = b.gender ?? getItemGender(b.id, b.name);
  const isGenderAllowed = canGenderEquip(playerGender, itemGender);
  const genderLabel = itemGender === "male" ? "Male" : itemGender === "female" ? "Female" : "Shared";

  // Deduplicated tags (prevents "Weapon Weapon" duplication)
  const tagList: string[] = [];
  if (isWeapon) {
    tagList.push("Weapon");
    if (weaponTypeName && weaponTypeName !== "Weapon") tagList.push(weaponTypeName);
  } else if (isOverall) {
    tagList.push("Armor", "Overall");
  } else {
    tagList.push(catLabel);
    if (slotName && slotName !== catLabel) tagList.push(slotName);
  }
  const uniqueTags = [...new Set(tagList)];

  const statsHtml = [
    statRow("STR", b.str, b.str),
    statRow("DEX", b.dex, b.dex),
    statRow("INT", b.int, b.int),
    statRow("LUK", b.luk, b.luk),
    statRow("Max HP", b.hp, b.hp),
    statRow("Attack Power", b.watk, b.watk),
    statRow("Defense", b.def, b.def),
  ].filter(Boolean).join("");

  return `
    <div class="ms-tooltip-card">
      <div class="tt-title">${esc(b.name)}</div>
      <div class="tt-trade">${b.cosmetic ? "Cosmetic Item" : "Base Equipment"}</div>
      <div class="tt-divider"></div>
      <div class="tt-meta-row">
        <div class="tt-icon-box">
          <img src="${gearIcon(b.id)}" alt="" class="tt-icon" />
        </div>
        <div class="tt-meta-info">
          <div class="tt-combat-label">Maple Catalog</div>
          <div class="tt-tags">
            ${uniqueTags.map((t) => `<span class="tt-tag">${t}</span>`).join("")}
            ${isHoverItem(b.id) ? `<span class="tt-tag" style="background: rgba(14, 165, 233, 0.25); color: #38bdf8; border: 1px solid #0284c7;">Hovering Effect</span>` : ""}
            ${isWizetHat(b.id) ? `<span class="tt-tag" style="background: rgba(239, 68, 68, 0.25); color: #f87171; border: 1px solid #dc2626;">Wizet GM Hat</span>` : ""}
          </div>
        </div>
      </div>
      <div class="tt-req-row">
        <div class="tt-req-item"><span>Required Job</span> <b class="${!b.cosmetic && !b.cash && allowedDesc !== "Shared" ? (isClassAllowed ? "tt-good" : "tt-bad") : ""}">${allowedDesc}</b></div>
        ${itemGender !== "both" ? `<div class="tt-req-item"><span>Gender</span> <b class="${isGenderAllowed ? "tt-good" : "tt-bad"}">${genderLabel}</b></div>` : ""}
        <div class="tt-req-item"><span>Required Level</span> <b class="${reqMet ? "tt-good" : "tt-bad"}">Lv. ${b.req}</b></div>
      </div>
      <div class="tt-divider"></div>
      ${b.cosmetic || b.cash ? `<div class="tt-stats"><div class="tt-stat-row" style="color:#a1a1aa; font-style:italic; padding: 4px 0; justify-content:center;">Pure Visual Cosmetic · No Combat Stats</div></div>` : `<div class="tt-stats">${statsHtml}</div>`}
      <div class="tt-divider"></div>
      <div class="tt-footer-meta">
        <div class="tt-value">Base Price: ${fmt(b.price)} mesos</div>
        ${isHoverItem(b.id) ? `<div class="tt-note highlight">${lucideIcon("sparkles", 13)} Special: Only Raven Persona hats grant graceful levitation & hovering effect when equipped.</div>` : ""}
        ${isWizetHat(b.id) ? `<div class="tt-note highlight" style="color:#f87171; border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.1);">${lucideIcon("shield-alert", 13)} GM Power: Official Wizet GameMaster hat. Iconic developer headwear.</div>` : ""}
        <div class="tt-note highlight">${note}</div>
      </div>
    </div>
  `;
}

/** Formats human-readable usage/recovery effect for consumable & ammo items */
export function itemUsageText(id: number): string {
  const it = ITEMS[id];
  if (!it) return "Restores vitality";
  if (it.type === "star") return `+${it.att ?? 15} Weapon Attack`;
  if (it.type === "arrow") return `+${it.att ?? 1} Weapon Attack`;
  if (it.type === "bullet") return `+${it.att ?? 10} Weapon Attack`;
  if (it.hpPct && it.mpPct) return `Recovers ${it.hpPct}% HP & ${it.mpPct}% MP`;
  if (it.hpPct) return `Recovers ${it.hpPct}% Max HP`;
  if (it.mpPct) return `Recovers ${it.mpPct}% Max MP`;
  if (it.hp && it.mp) return `Recovers ${fmt(it.hp)} HP & ${fmt(it.mp)} MP`;
  if (it.hp) return `Recovers ${fmt(it.hp)} HP`;
  if (it.mp) return `Recovers ${fmt(it.mp)} MP`;
  if (it.id === 2050004) return "Cures all abnormal status conditions";
  return "Restores vitality";
}

/** Tooltip for Use / Consumable items & Throwables */
export function renderUseTooltip(id: number, owned = 0, note = ""): string {
  const it = ITEMS[id];
  const name = it?.name ?? `Item #${id}`;
  const isThrowable = it?.type === "star" || it?.type === "arrow" || it?.type === "bullet";
  const catLabel = isThrowable
    ? (it.type === "star" ? "Throwing Star" : it.type === "arrow" ? "Bow / Crossbow Ammo" : "Gun Bullet")
    : "Consumable Potion";
  const tag2 = isThrowable ? "Infinite Ammo" : "Recovery";
  const effect = itemUsageText(id);
  const usageDesc = isThrowable
    ? "Ammunition consumed during ranged skill attacks"
    : `Restores vitality when consumed (heals ${effect.toLowerCase()})`;

  return `
    <div class="ms-tooltip-card">
      <div class="tt-title">${esc(name)}</div>
      <div class="tt-trade">Tradeable</div>
      <div class="tt-divider"></div>
      <div class="tt-meta-row">
        <div class="tt-icon-box">
          <img src="${itemIcon(id)}" alt="" class="tt-icon" />
        </div>
        <div class="tt-meta-info">
          <div class="tt-combat-label">${catLabel}</div>
          <div class="tt-tags">
            <span class="tt-tag">Use</span>
            <span class="tt-tag">${tag2}</span>
          </div>
        </div>
      </div>
      <div class="tt-divider"></div>
      <div class="tt-stats">
        <div class="tt-stat-line"><span>Effect</span> <b class="tt-good">${effect}</b></div>
        <div class="tt-stat-line"><span>Usage</span> <b>${isThrowable ? "Infinite Combat Ammo" : "Direct Consumption"}</b></div>
        <div class="tt-stat-line"><span>Owned Quantity</span> <b class="tt-good">${isThrowable ? "∞ (Infinite)" : owned}</b></div>
      </div>
      <div class="tt-divider"></div>
      <div class="tt-footer-meta">
        <div class="tt-note highlight">${usageDesc}</div>
        ${note ? `<div class="tt-note">${note}</div>` : ""}
      </div>
    </div>
  `;
}

/** Tooltip for Crafting Material items */
export function renderMatTooltip(id: number, owned = 0, note = ""): string {
  const name = MATS.get(id) ?? `Material #${id}`;

  return `
    <div class="ms-tooltip-card">
      <div class="tt-title">${esc(name)}</div>
      <div class="tt-trade">Tradeable</div>
      <div class="tt-divider"></div>
      <div class="tt-meta-row">
        <div class="tt-icon-box">
          <img src="${itemIcon(id)}" alt="" class="tt-icon" />
        </div>
        <div class="tt-meta-info">
          <div class="tt-combat-label">Crafting Component</div>
          <div class="tt-tags">
            <span class="tt-tag">Etc.</span>
            <span class="tt-tag">Crafting</span>
          </div>
        </div>
      </div>
      <div class="tt-divider"></div>
      <div class="tt-stats">
        <div class="tt-stat-line"><span>Usage</span> <b>Star Force & Gear Crafting</b></div>
        ${owned > 0 ? `<div class="tt-stat-line"><span>Owned Quantity</span> <b class="tt-good">${owned}</b></div>` : ""}
      </div>
      <div class="tt-divider"></div>
      <div class="tt-footer-meta">
        <div class="tt-note">${note || "Craft at the Crafting panel (J)"}</div>
      </div>
    </div>
  `;
}

/** Tooltip for Pet Companions */
export function renderPetTooltip(pet: { id: number; name: string; level: number; exp: number; maxExp: number; rarity: number; bonuses?: { level: number; label: string }[] }, isEquipped = false, note = ""): string {
  const rarities = ["Normal", "Rare", "Epic", "Unique", "Legendary"];
  const rarityColors = ["#e4e4e7", "#38bdf8", "#c084fc", "#facc15", "#4ade80"];
  const rar = Math.min(4, Math.max(0, pet.rarity ?? 0));
  const rarName = rarities[rar];
  const rarColor = rarityColors[rar];
  const pct = Math.min(100, Math.floor(((pet.exp || 0) / (pet.maxExp || 100)) * 100));

  let nextMilestone = 25;
  if (pet.level >= 75) nextMilestone = 100;
  else if (pet.level >= 50) nextMilestone = 75;
  else if (pet.level >= 25) nextMilestone = 50;

  const bonusesHtml = pet.bonuses && pet.bonuses.length > 0 ? pet.bonuses.map((b) => `
    <div class="tt-stat-line"><span style="color:#a1a1aa">Lv.${b.level} Milestone</span> <b class="tt-good">${esc(b.label)}</b></div>
  `).join("") : `<div class="text-[9.5px] text-zinc-400 italic">No bonuses yet. Unlocks first bonus at Lv. 25!</div>`;

  return `
    <div class="ms-tooltip-card min-w-[210px]">
      <div class="tt-title" style="color:${rarColor}">${esc(pet.name)}</div>
      <div class="tt-trade flex items-center justify-between">
        <span>Pet Companion</span>
        <span style="color:${rarColor};font-weight:bold">${rarName}</span>
      </div>
      <div class="tt-divider"></div>
      <div class="tt-meta-row">
        <div class="tt-icon-box">
          <img src="/wz/pet-icon/${pet.id}" alt="" class="tt-icon" onerror="this.src='/wz/item/${pet.id}/icon'" />
        </div>
        <div class="tt-meta-info">
          <div class="text-[11px] font-bold text-amber-300">Level ${pet.level || 1}</div>
          <div class="text-[9px] text-zinc-400 mt-0.5">Auto-Loot & Follow</div>
          <div class="w-full bg-zinc-800 rounded-full h-1.5 mt-1 overflow-hidden border border-white/10">
            <div class="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full" style="width:${pct}%"></div>
          </div>
          <div class="text-[8px] font-mono text-zinc-400 mt-0.5">${pet.exp || 0} / ${pet.maxExp || 100} EXP (${pct}%)</div>
        </div>
      </div>
      <div class="tt-divider"></div>
      <div class="tt-stats">
        <div class="text-[9.5px] font-bold text-zinc-300 uppercase tracking-wider mb-1">Milestone Bonuses (Every 25 Lvls)</div>
        ${bonusesHtml}
        ${pet.level < 100 ? `<div class="text-[8.5px] text-sky-400 mt-1 font-semibold">★ Next milestone unlocks at Level ${nextMilestone}</div>` : ""}
      </div>
      <div class="tt-divider"></div>
      <div class="tt-footer-meta">
        <div class="tt-note highlight">${note || (isEquipped ? "Currently Summoned · Click to unequip" : "Companion Inventory · Click to equip")}</div>
      </div>
    </div>
  `;
}

