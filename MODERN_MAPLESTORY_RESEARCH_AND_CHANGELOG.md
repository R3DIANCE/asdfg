# Modern MapleStory Feature Catalog, Research & Changelog

This document maintains a **numbered master catalog of every gameplay and engine feature** in this WebGPU idle/AFK MapleStory project. You can refer to any feature by its number (e.g., **F-04**, **Feature 07**) whenever requesting changes or tuning.

---

## Master Feature Index

| Feature ID | Feature Name | Core Mechanic / Summary | Relevant Files |
| :--- | :--- | :--- | :--- |
| **[F-01]** | **Combat Power (CP) Engine** | Modern *NEW AGE* CP formula based on Main Stat ($4\times$), Sec Stat ($1\times$), ATT, DMG%, Boss%, CritDMG%, and Final DMG%. (IED excluded). | [`StatsSystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/StatsSystem.ts) |
| **[F-02]** | **Combo Kill Streak & Orbs** | 6s kill streak counter. Spawns Blue, Purple, or Red Combo Orbs every 50 kills granting large EXP and % HP/MP recovery. *(Chat notice silenced)*. | [`CombatSystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/CombatSystem.ts), [`game.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/game.ts) |
| **[F-03]** | **Multi-Kill Bonus System** | Vanquishing $\ge 3$ mobs within 0.8s awards $+10\%$ to $+30\%$ bonus EXP. *(Chat notice silenced)*. | [`CombatSystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/CombatSystem.ts) |
| **[F-04]** | **Star Force & Arcane Force Scaling** | Map SF requirements. Reaching $\ge 1.5\times$ required SF grants **$150\%$ damage dealt** and **flat 1 incoming mob damage**. Live HUD badge `★ SF/Req`. | [`stage-system.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/systems/stage-system.ts), [`CombatSystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/CombatSystem.ts), [`windows.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/windows.ts) |
| **[F-05]** | **Ancient Field Runes & Liberated Power** | Field runes (Swiftness, Might, Thunder, Destruction). Liberating grants **+100% EXP (2x EXP) for 180s**. Supported via `[SPACE]` and auto-liberation during AFK mode. | [`render-system.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/systems/render-system.ts), [`game.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/game.ts), [`CombatSystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/CombatSystem.ts) |
| **[F-06]** | **Elite Monster Emergence & Affixes** | Spawns every 75 field kills: $1.35\times$ size, $8\times$ HP, dark foot aura, affixes (*Shadowy*, *Sturdy*, *Unstoppable*, *Reflective*, *Commander*), purple/gold HP bar, $5\times$ EXP, and rare loot. *(Chat notices silenced)*. | [`CombatSystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/CombatSystem.ts), [`render-system.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/systems/render-system.ts) |
| **[F-07]** | **Crystals of Intense Power (Boss Crystals)** | Defeating stage bosses drops item `4001886` with high base value (2.5M+ mesos), tradable via shop and Auction House. | [`stage-system.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/systems/stage-system.ts), [`items.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/items.ts) |
| **[F-08]** | **Semantic Damage Digits & WZ Skins** | Separation of Normal/Crit damage skins from system colors: Arcane Blue for heals, Verdant Green for poison, Shadow Violet for player damage. Supports 641 WZ skins. | [`damage-skin-system.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/systems/damage-skin-system.ts), [`render-system.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/systems/render-system.ts) |
| **[F-09]** | **Level Advantage & Near-Level Curve** | $\pm 4$ levels grant $+15\%$ Near-Level Hunting EXP. Level advantage scales up to $+20\%$ Final Damage. Extreme level gaps receive progressive EXP decay. | [`CombatSystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/CombatSystem.ts), [`game-types.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/game-types.ts) |
| **[F-10]** | **Universal Scrollbars & Touch Engine** | 6px dark-slate custom scrollbars with cyan glow. Momentum touch fling engine with inertia and tap-drag threshold. | [`style.css`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/style.css), [`touch-scroll.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/touch-scroll.ts) |
| **[F-11]** | **Cash Shop & NX Currency** | In-game Cash Shop modal with NX currency, category filters (Equip, Weapon, Pet, Effect, Special), and live character preview dressing room. | [`CashShop.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/CashShop.ts), [`windows.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/windows.ts) |
| **[F-12]** | **Auction House Market System** | 12h/24h marketplace listings supporting Mesos, NX, or Both currencies, search filters, sales history, and claim escrow. | [`auction.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/auction.ts), [`EconomySystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/EconomySystem.ts) |
| **[F-13]** | **Party System & HUD Overlay** | Compact party HUD displaying Level, Name, HP/MP bars, quick actions on hover, and active buff lists on hover. Overhead party health indicators. | [`PartyWidget.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/PartyWidget.ts), [`party.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/party.ts) |
| **[F-14]** | **Auto-Combat & AFK Engine** | Autonomous mob targeting, attack sequencing, potion consumption, auto-boss summon, and auto-rune unsealing. Remembers active state across sessions. | [`CombatSystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/CombatSystem.ts), [`game.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/game.ts) |
| **[F-15]** | **Offline Hunting & Welcome Back** | Calculates accumulated offline hunting kills, mesos, materials, and gear with modal claim dialog. *(Chat notice silenced)*. | [`stage-system.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/systems/stage-system.ts), [`windows.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/windows.ts) |
| **[F-16]** | **Guild System & Guild Emblems** | Guild rosters, custom procedural guild emblem stitching, rank titles, and clean overhead guild tags. | [`guild.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/guild.ts), [`render-system.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/systems/render-system.ts) |
| **[F-17]** | **Gear Star Force & Potential Cubing** | Equipment Star Force enhancement stars, failure protections, Occult/Master Cube potential reset, and rarity tiers (Rare $\rightarrow$ Legendary). | [`InventorySystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/InventorySystem.ts), [`items.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/items.ts) |
| **[F-18]** | **SpacetimeDB Multiplayer Synchronization** | Real-time position, jump, ladder climb, animation frame, chat balloon, damage skin, and party state sync between connected players. | [`spacetimedb.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/spacetimedb.ts), [`NetworkSystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/NetworkSystem.ts) |

---

## Detailed Research & Mechanic Formulas

### [F-01] Combat Power (CP) Calculation
* **Background**: In modern MapleStory (*NEW AGE*), Nexon replaced the legacy 4-line damage range with **Combat Power (CP)** as the definitive metric of character strength.
* **Formula Breakdown**:
  $$\text{Combat Power} = \frac{4 \times \text{MainStat} + \text{SecStat}}{100} \times \text{ATT} \times (1 + \text{ATT}\%) \times (1 + \text{DMG}\% + \text{BossDMG}\%) \times (1.35 + \text{CritDMG}\%) \times (1 + \text{FinalDMG}\%) \times K$$
  - **Why IED is Excluded**: Ignore Enemy Defense (IED) has **0% impact** on visible Combat Power because Combat Power evaluates the character in a vacuum without an active monster defense target.

---

### [F-02] & [F-03] Combo Kill & Multi Kill Engine
* **Combo Kill Counter**:
  - Eliminating consecutive monsters within a 6-second window increments the combo kill streak.
  - Every **50 combo kills** (50, 100, 150...), a **Combo Kill Orb** is generated on the map:
    - **Blue Combo Orb** (Combo 50–300): Grants $5\times$ base monster EXP and restores $15\%$ Max HP & MP.
    - **Purple Combo Orb** (Combo 350–700): Grants $12\times$ base monster EXP and restores $30\%$ Max HP & MP.
    - **Red Combo Orb** (Combo 750+): Grants $25\times$ base monster EXP and restores $50\%$ Max HP & MP.
* **Multi-Kill Bonus System**:
  - Defeating 3 or more monsters within 0.8 seconds awards $+10\%$ to $+30\%$ bonus EXP.
  - Chat notifications for multi-kills have been silenced to prevent chat bloat during fast grinding.

---

### [F-04] Star Force & Arcane Force Scaling Dynamics
* **Authentic Scaling Rules**:
  - **At 100% Required SF**: Deal $100\%$ normal damage, take normal incoming damage.
  - **Below Required SF**: Damage dealt drops progressively down to $10\%$, and monster touch damage increases up to $200\%$.
  - **At $\ge 150\%$ Required SF (1.5x Over-requirement Threshold)**:
    - Deal **$150\%$ Final Damage** to all monsters on the map ($+50\%$ damage amplification).
    - Incoming touch damage is reduced to **flat 1 damage**, granting complete immunity to mob attrition.
* **Live Stage HUD Badge**: Color-coded `★ PlayerSF / ReqSF` (emerald for $\ge 1.5\times$, amber for $\ge 1.0\times$, red for below).

---

### [F-05] Ancient Field Runes & Liberated Rune Power
* **Spawn Cycle**: Field runes spawn on platforms periodically.
* **Liberated Rune Power**: Unsealing a rune grants:
  - **$+100\%$ Bonus EXP (2x EXP)** for **180 seconds** (3 minutes).
  - Cooldown period before the next rune can be activated.
* **Authentic WZ Graphics (`Etc.wz/RuneStone.img`)**:
  - Sourced directly from `Etc.wz/RuneStone.img/runeStone/0`:
    - Type 0: *Rune of Swiftness*
    - Type 2: *Rune of Destruction*
    - Type 3: *Rune of Thunder*
    - Type 4: *Rune of Might*
  - **`stay`**: 8-frame looping hover animation (`stay/0` through `stay/7`) with authentic foothold origin offsets (`ox: 43, oy: 116`).
  - **`appear`**: 13-frame materialization animation played when a Rune emerges on the platform.
  - **`disappear`**: 7-frame explosive liberation effect played when the player unseals the Rune.
* **Secondary Rune Abilities**:
  - **Rune of Swiftness**: Maximum movement speed and jump height.
  - **Rune of Destruction**: $+50\%$ damage boost to instantly annihilate mobs.
  - **Rune of Might**: Massive stomp shockwaves and giant size.
  - **Rune of Thunder**: Continuous lightning bolts across the hunting ground.
* **AFK / Idle Automation**: In Auto-Combat mode, when a Rune is nearby and off cooldown, the character automatically unseals it.

---

### [F-06] Elite Monsters & Affix System
* **Emergence**: Slain field monsters trigger an Elite Monster emergence every 75 kills.
* **Attributes**:
  - $1.35\times$ enlarged sprite with swirling dark purple foot aura.
  - $8\times$ baseline monster HP and distinctive purple/golden health gauge.
  - Affixes: *Shadowy*, *Sturdy*, *Unstoppable*, *Reflective*, *Commander*.
  - Rewards: Awards $5\times$ EXP and drops rare gear, enhancement scrolls, crafting ores, and meso pouches.

---

### [F-07] Crystals of Intense Power (Boss Crystals)
* Defeating area/stage bosses drops item ID `4001886` (*Crystal of Intense Power*).
* Sells for 2,500,000+ base mesos, scaling with stage progression.

---

### [F-08] Semantic Damage Digits & WZ Damage Skins
In `Effect.wz/BasicEff.img`, digits are partitioned by visual intent:
* **Normal Hit Damage (`NoRed0`/`NoRed1`)**: Equipped Damage Skin digits.
* **Critical Hit Damage (`NoCri0`/`NoCri1`)**: Golden/custom critical digits with impact star.
* **Heal / HP Recovery (`NoBlue0`/`NoBlue1`)**: Arcane Blue digits floating during potion/heal ticks.
* **Poison Damage (`NoGreen0`/`NoGreen1`)**: Verdant Green digits during DoT poison ticks.
* **Player Hurt Damage (`NoViolet0`/`NoViolet1`)**: Shadow Violet digits during touch/projectile hits.

---

### [F-19] Modern HUD & Vitals Overhaul
* Translucent steel-slate glass backdrop (`bg-[#242d3d]/90`, `rgba(42,52,68,0.90)`, `border-[#9ca8b8]/35`, `rounded-[4px]`) matching the exact design language, material, and borders of the menu buttons and quickbar slots.
* Crisp rectangular gauge wells (`bg-[#101622]`, `rounded-[2px]`, `border-[#1c2434]`, `shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]`).
* HP Gauge: Rich crimson-rose gradient (`#b91c1c` to `#f43f5e`), white leading edge bar, top gloss shine, with `HP` label and tabular numbers.
* MP Gauge: Deep sapphire-cyan gradient (`#0369a1` to `#38bdf8`), white leading edge bar, top gloss shine, with `MP` label and tabular numbers.
* Golden Level label (`Lv. X`) with high-contrast white name typography and dark drop shadow.

---

### [F-20] Two-Row Bottom Menu Layout
* Restructured navigation menu into a clean 2-row $\times$ 5-column grid (`grid-cols-5 grid-rows-2`).
* Row 1: Core character & combat actions (Chat, Stat, Skill, Equip, Inv).
* Row 2: Community & commerce actions (Party, Guild, Craft, Auction House, Cash Shop).
* Fixed CSS override in `.dock-menu` to guarantee 56px height alignment with status capsule and quick slots.

---

### [F-21] GM Online Player List & Search Alignment
* High-visibility aligned Lucide Search icon rendered on top (`z-10 absolute left-2.5 top-1/2 -translate-y-1/2`) inside fixed $28\text{px}$ input container.
* Fixed button heights ($24\text{px}$) and icon sizing ($13\text{px}$) with dedicated color themes and hover states for all 7 remote actions and 4 local actions.
* Prominent Level badge (`Lv. X`) rendered on every squad operative and player card.
* Synchronized `level` and `job` over WebSockets during `join` and `sync` messages.

---

### [F-22] Pixel-Perfect Head-Focused Character Portraits
* Sourced close-up character portraits via `/wz/char?eq=...&portrait=1` in `wz/compose.ts`.
* Dynamically extracts and crops Head, Face, Hair, and Cap into a balanced square avatar with 4px padding.
* Rendered in sleek square-rounded slot frames (`rounded-[4px] bg-[#141b26] border-[#9ca8b8]/30`) with `object-contain` and `image-rendering: pixelated`.

---

### [F-23] Unified Icon Grid Alignment & Sizing
* Standardized equipment and inventory icon slots to prevent non-uniform scaling or edge clipping.
* Refined `.gcell .ic` to $32\times 32\text{px}$ `background-size: contain` centered.
* Adjusted `.skill-icon` to $34\times 34\text{px}$ to prevent vertical row overflow.

---

## Changelog of Implemented Revisions

### [v2.5.2] — Modern HUD & Vitals Overhaul, Two-Row Nav, GM Search, Head Portraits & Grid Polish
- **[F-19] Modern HUD & Vitals**: Redesigned player identity and status capsule in [`StatusCapsule`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/hud.ts) with `bg-slate-950/95`, `backdrop-blur-[16px]`, `rounded-full` smooth gauge tracks, and high-contrast tabular typography.
- **[F-20] Two-Row Bottom Menu**: Replaced the squeezed single-line flexbox with a clean 2-row $\times$ 5-column grid layout across [`MenuButtons`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/hud.ts) and [`src/style.css`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/style.css).
- **[F-21] GM Search & Level Badges**: Vertically centered the search icon in [`GmOnlinePanel.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/GmOnlinePanel.ts), added prominent amber `Lv. X` badges on every operative card, and propagated player levels through server WebSocket sync.
- **[F-22] Head-Focused Character Portraits**: Added `portrait=1` endpoint parameter in [`wz/compose.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/wz/compose.ts) and [`server.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/server.ts), cropping directly to head/face/hair/cap; updated GM cards and party member cards to circular pixel-perfect head portraits.
- **[F-23] Icon Grid Polish**: Fixed `.gcell .ic` and `.skill-icon` dimensions in [`src/style.css`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/style.css) ensuring $32\times 32\text{px}$ sprite containment with no overflow.

### [v2.5.1] — Chat Polishing & Feature Numbering
- **[F-02]**: Silenced `★ [Combo Kill] ...` chat notice upon reaching 50-kill orb thresholds while preserving orb spawning, EXP bonus, and % recovery.
- **[F-03]**: Silenced repetitive `★ [Multi Kill] ...` chat messages while retaining the bonus EXP reward.
- **[F-05]**: Replaced procedural geometry with authentic MapleStory WZ sprites from `Etc.wz/RuneStone.img`: 8-frame looping `stay` hover animation, 13-frame `appear` emergence effect, and 7-frame `disappear` liberation explosion effect.
- **[F-08]**: Fixed first damage digit rendering smaller than subsequent digits by standardizing all digits to the primary full-size `NoRed1` and `NoCri1` font sets (and `NoBlue1`, `NoGreen1`, `NoViolet1`) across [`WorldRenderer.drawDamage`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/systems/render-system.ts) and [`DamageSkinSystem`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/systems/damage-skin-system.ts).
- **[F-11]**: Silenced all `★ [Cash Shop] ...` purchase and NX credit notices from chat.
- **[F-15]**: Silenced `★ [Welcome Back] Claimed offline rewards...` chat notice when closing or claiming the offline modal.
- **Notice Deduplication Engine**: Added automatic suppression of duplicate notices and identical consecutive messages in [`ChatComponent`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/chat.ts). Removed redundant duplicate boss defeat notice in [`StageSystem`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/systems/stage-system.ts).
- Added numbered catalog (`[F-01]` through `[F-23]`) across documentation for fast user feature referencing.

### [v2.8.0] — Bun Shadcn UI Architecture & Modern HUD Overhaul
- **[F-24] Shadcn UI Architecture**: Created [`src/lib/utils.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/lib/utils.ts) with `cn()` utility (`clsx` + `tailwind-merge`) and scaffolded reusable Shadcn UI components under [`src/components/ui/`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/ui/):
  - [`Button`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/ui/button.tsx) with `cva` variants (`default`, `secondary`, `destructive`, `outline`, `hud`, `gold`, `cyan`) and sizes (`default`, `sm`, `xs`, `icon`, `iconSm`).
  - [`Badge`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/ui/badge.tsx) with `cva` variants (`gold`, `cyan`, `crimson`, `emerald`, `outline`, `secondary`).
  - [`Card`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/ui/card.tsx) (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter) with dark translucent glass backdrop.
  - [`Progress`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/ui/progress.tsx) with specular sheen overlay and customizable indicator gradients.
  - [`Input`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/ui/input.tsx) with startIcon/endIcon slots and focus ring styling.
- **[F-25] Status Capsule Modernization ([`StatusCapsule`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/hud.ts))**:
  - Completely replaced outdated muddy navy styling (`#242d3d`) with modern Shadcn glass card aesthetic (`bg-slate-950/85 backdrop-blur-md border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.65)]`).
  - Formatted player level with Shadcn gold badge (`Lv. X`), character name with crisp text shadow, and sleek rectangular gauges for HP (rose/ruby gradient) and MP (sky/cyan gradient).
  - Aligned full-width bottom EXP bar (9px height) with emerald gradient and tabular percentage display.
- **[F-26] GM Online Panel Search & Icon Fixes ([`GmOnlinePanel`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/GmOnlinePanel.ts))**:
  - Rebuilt the search bar using Shadcn Input with a properly aligned Lucide Search icon in the left slot.
  - Fixed GM action buttons by removing the global CSS `color: #cbd5e1 !important` rule from [`style.css`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/style.css) that stripped colors from child SVG icons, restoring vibrant emerald, amber, gold, sky, purple, and rose colors.
  - Refined operative cards with Shadcn Card styling and head-focused avatar portraits (`portrait=1`).
- **[F-27] Dock Menus, QuickBar & Party Widget Refactor**:
  - Harmonized 2-row navigation buttons (`MenuButtons`) and QuickBar slots (`quick-bar.ts`) with Shadcn button styling (`bg-slate-900/80 hover:bg-slate-800 border-white/10 hover:border-sky-400/50`).
  - Added missing `Gem` icon in [`lucide.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/lucide.ts) for Cash Shop navigation.
  - Refined [`PartyWidget`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/components/PartyWidget.ts) member cards and health/mana bars with Shadcn tokens.
- **[F-28] Inventory Tri-Factor Sorting Engine (Type, Level, CP)**:
  - Added [`GEAR_TYPE_ORDER`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/items.ts#L346) and [`gearCombatPower`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/items.ts#L371) to compute individual item Combat Power (CP) based on base stats, attack power weighting, potential percentage lines, Star Force exponential scaling, and rarity.
  - Rewrote [`InventorySystem.sortBag`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/InventorySystem.ts#L144) to sort items strictly by:
    1. **Type**: Grouped by canonical MapleStory equipment category (`weapon` $\to$ `hat` $\to$ `top` $\to$ `bottom` $\to$ `shoes` $\to$ `gloves` $\to$ `cape` $\to$ `shield` $\to$ accessories).
    2. **Level**: Required equip level descending (highest level first).
    3. **CP**: Gear Combat Power descending (strongest battle prowess first).
  - Extended sorting to `use` and `etc` tabs (potions $\to$ projectiles $\to$ buffs $\to$ cubes by recovery and tier).
  - Added Combat Power display directly onto equipment tooltips ([`renderGearTooltip`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/tooltip.ts#L84)) alongside Required Level.
- **[F-29] Equipped Items Tooltips & Border Beam Rarity Potentials (libraries.dev/beam)**:
  - Fixed tooltips for equipped items and slots by resolving gear directly from `data-uid` against `g.eq`, `g.visualEq`, and `g.bag` in the window `pointermove` listener, preventing tips from disappearing when window signatures update. Added empty slot tooltips for all equipment sockets.
  - Integrated `border-beam` from [`https://libraries.dev/beam`](https://libraries.dev/beam) into [`src/tooltip.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/tooltip.ts#L77) to render an animated traveling border beam around the item's Potential section with colors matching the rarity tier:
    - **Rare**: `colorVariant="ocean"` (Aqua/Blue beam)
    - **Epic**: `colorVariant="sunset"` (Purple/Violet glow beam)
    - **Unique**: `colorVariant="gold"` (Amber/Gold glow beam)
    - **Legendary**: `colorVariant="colorful"` (Full rainbow spectrum beam)
  - Added CSS animated border beams with `@property --item-beam-angle` conic-gradient sweeps to `.gcell` and `.eslot` for all equipment rarity tiers (`.r1`, `.r2`, `.r3`, `.r4`).

### [v2.9.0] — Synchronized Border Beams, Solid Item Backgrounds & Uniform Grid Sizing
- **[F-30] Synchronized Global Border Beam Phase Engine**:
  - Unified all border beam animations to run on an exact uniform period of **`2.4s`** (`2400ms`), matching the Potential card beam in [`renderGearTooltip`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/tooltip.ts#L85).
  - Configured `@property --item-beam-angle` with `inherits: true` on `:root` and bound live `--item-beam-angle` updates to the main rendering RAF loop in [`src/main.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/main.ts#L506) (`((now % 2400) / 2400 * 360).toFixed(1) + 'deg'`).
  - All item border beams across inventory, equipment window, crafting, auction, and tooltips now share the exact same angular keyframe at every instant without phase drift or desync when windows open or items re-render.
- **[F-31] Completely Transparent Item Slots & Clean Icons**:
  - Removed all opaque background colors (`#141c28`, `#0d1e34`, etc.) from `.gcell`, `.eslot`, `.gcell.blank`, `.eslot.empty`, and rarity variants (`.r1`, `.r2`, `.r3`, `.r4`), setting `background: transparent !important;`.
  - Item icons and slots now render completely transparent without any dark opaque box behind the sprite, while retaining the glowing border beam animation and rarity border accents.
  - Added `.eslot .gcell::after { display: none !important; }` to eliminate duplicate border beam overlap inside equipped sockets.
- **[F-32] Standardized Equal Grid Sizing & 8-Column Completion**:
  - Standardized `.eslot`, `.eslot.empty`, and `.eslot.filled` strictly to `38px x 38px` (`box-sizing: border-box`), preventing slot shrinking or unequal heights between empty and filled states.
  - Centered item icons at `32px x 32px` identically across `.gcell` and `.eslot`.
  - Refactored inventory grid padding in [`windows.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/windows.ts#L3718) to round to multiples of **8** (`Math.ceil(... / 8) * 8`) instead of 4, ensuring the 8-column grid always completes every row evenly without jagged bottom slots.
- **[F-33] GTA V Style Seamless Minimap Radar Blend (No Panels)**:
  - Eliminated the boxy `.minimap` window panel border, background, drop shadows, top control bar (`.mini-top-bar`), map badge, and bottom fold tab (`.mini-fold-tab`).
  - Added smooth elliptical radial alpha falloff mask (`-webkit-mask-image: radial-gradient(ellipse 90% 86% at 50% 50%, #000 45%, rgba(0,0,0,0.82) 65%, rgba(0,0,0,0.25) 85%, transparent 100%)`) to `.mini-viewframe`, blending the terrain and footholds seamlessly into transparency without any harsh panel borders.
  - Re-architected location typography to float cleanly above the radar with uppercase high-contrast text and drop shadows (`.mini-street` and `.mini-name`), with interactive click-to-toggle support.
  - Upgraded player, other players, and portal blips to high-visibility glowing radar blips.
- **[F-35] Exact Equal Inventory Grid Dimensions (44px x 44px)**:
  - Fixed inventory grid cells being rectangular or unevenly sized caused by conflicts between explicit `height: 38px` and dynamic `repeat(8, 1fr)`.
  - Locked `.inv-grid-wrap .inv-grid` to `grid-template-columns: repeat(8, 44px) !important; grid-auto-rows: 44px !important; gap: 3px !important; justify-content: center !important;`.
  - Locked `.inv-grid-wrap .gcell` and `.inv-grid-wrap .gcell.blank` strictly to `44px x 44px` (`box-sizing: border-box !important`), with centered `32px` icons and repositioned `.cnt` and `.gstar` badges. Every single slot in every row and column is now mathematically identical.
- **[F-36] Comprehensive Text Paddings & Vertical Alignment Overhaul**:
  - Balanced `.inv-tab-pill` padding (`3px 9px !important; font: 700 9.5px/12px`) preventing horizontal line overflow across all 6 tabs.
  - Re-aligned `.inv-pill-btn` (`3px 9px; gap: 4px; line-height: 12px`) and `.inv-plus-slot` (`height: 20px; padding: 0 8px`) for clean breathing room.
  - Refined `.inv-meso-badge` and `.inv-points-badge` (`padding: 3px 9px; font: 700 10px/12px; gap: 5px`) and `.inv-action-btn` (`padding: 3px 9px; font: 700 9px/12px`).
  - Vertically centered search box input and icon (`height: 22px; padding: 0 26px 0 8px`) and footer buttons (`.inv-foot-btn` `padding: 4px 6px; font: 700 8.5px/11px`).
  - Fixed equipment window text paddings: `.equip-decor-btn` (`padding: 2.5px 8px`), `.preset-apply-btn` (`padding: 2.5px 8px`), and `.equip-act-pill` (`padding: 4px 6px`).

### [v2.9.6] — Static Solid Platform Minimap Box, Tooltip-Style Item Slots, Clean Preview & Sort Persistence
- **[F-41] Static Solid Platform Minimap Box with Corner Fade**:
  - Replaced the circular moving radar with a clean rectangular HUD box (`border-radius: 8px`) framing the map statically without camera tracking or map movement.
  - Prioritized the official WZ `miniMap/canvas` property in [`server.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/server.ts#L2572) to render the authentic solid platform, foothold, ladder, and ground schematics.
  - Added smooth soft corner fade-out with radial mask (`-webkit-mask-image: radial-gradient(ellipse 96% 92% at 50% 50%, #000 70%, rgba(0, 0, 0, 0.6) 88%, transparent 100%)`).
  - Removed compass dial, crosshairs, and directional rotation; player dot moves across the static map to exact coordinates.
- **[F-42] Tooltip-Style Item Cells & Unobstructed Rarity Border Beams**:
  - Updated `.gcell`, `.eslot`, and `.inv-grid-wrap .gcell` to match the exact aesthetic of `.tt-icon-box`: `background: rgba(255, 255, 255, 0.04) !important; border: 1px solid rgba(255, 255, 255, 0.12) !important; border-radius: 6px !important; box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.08), 0 2px 4px rgba(0, 0, 0, 0.25) !important;`.
  - Removed internal inset colored shadows from `.r1`, `.r2`, `.r3`, `.r4`, letting the traveling conic-gradient border beam sweep cleanly around the 6px rounded perimeter.
  - Switched `.inv-grid-wrap` to translucent `rgba(10, 15, 26, 0.65)` instead of solid `#0b1017`.
- **[F-43] Clean Glitch-Free Character Preview**:
  - Removed loose `.eprev-eff-layer` DOM injection loop from [`src/windows.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/windows.ts#L3660) that caused position misalignment and flickering.
  - Character preview relies purely on authentic `/wz/char?eq=...` composite which natively positions all equipment, hats, weapons, and cosmetics with proper stance (`stand1` vs `stand2`) and zero jitter.
- **[F-44] Instant Inventory Sort & Move Persistence**:
  - Added `InventorySystem.persist(game)` in [`src/core/InventorySystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/InventorySystem.ts#L180) to immediately write `game.save()` to `localStorage` under both character and global save keys on `sortBag` and `moveBagSlot`.
  - Re-ordered `game.bag` array in place so sorted order remains permanently saved across page reloads.
- **[F-45] Removed Empty Slot Tooltips**:
  - Cleaned up empty equipment slot markup in [`src/windows.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/windows.ts#L3647), stripping `${this.tip(...)}` so hovering empty sockets produces no popup tooltip.

### [v2.5.0] — Star Force Scaling, Field Runes & Elite Monsters
- **[F-04]**: Added Star Force map scaling ($150\%$ damage and flat 1 incoming damage at $1.5\times$ SF).
- **[F-05]**: Added Field Runes (Swiftness, Might, Thunder, Destruction), Liberated Rune Power (+100% EXP), visual rune pedestal with orbital sparks, and `[SPACE]` / AFK auto-liberation.
- **[F-06]**: Added Elite Monster emergence (every 75 kills), $8\times$ HP, dark auras, procedural affixes, golden/purple health bars, and rare equipment drops.

### [v2.4.0] — Modern Combat Power, Combo Orbs & Boss Crystals
- **[F-01]**: Implemented modern Combat Power formula in [`StatsSystem.ts`](file:///c:/Users/r3dia/Documents/GitHub/asdfg/src/core/StatsSystem.ts).
- **[F-02]**: Implemented 6s combo kill streak and Blue, Purple, and Red Combo Orbs every 50 kills.
- **[F-07]**: Added Crystals of Intense Power (`4001886`) dropping from stage bosses.
- **[F-08]**: Semantic damage digit separation (Arcane Blue, Verdant Green, Shadow Violet).
- **[F-10]**: Added 6px universal MapleStory scrollbars and mobile touch fling momentum engine.
- **[F-11] & [F-12]**: Added Cash Shop for NX cosmetics and Auction House with 12h/24h listings.

