-- SpacetimeDB Relational Schema for Maple Wayfarer
-- Tables and Reducer signatures for real-time multiplayer networking & database persistence

-- 1. Active Online Players in the World
CREATE TABLE players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    map_id INTEGER NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    face INTEGER NOT NULL,
    anim TEXT NOT NULL,
    frame INTEGER NOT NULL,
    look TEXT NOT NULL,       -- JSON array of equipped cosmetic item IDs
    last_action TEXT,         -- Last executed skill/attack identifier
    updated_at BIGINT NOT NULL
);

-- 2. Character Persistent Data (Account / Progression)
CREATE TABLE characters (
    name TEXT PRIMARY KEY,
    level INTEGER NOT NULL DEFAULT 1,
    job TEXT NOT NULL DEFAULT 'Beginner',
    class_id TEXT NOT NULL DEFAULT 'beginner',
    exp BIGINT NOT NULL DEFAULT 0,
    hp INTEGER NOT NULL DEFAULT 50,
    max_hp INTEGER NOT NULL DEFAULT 50,
    mp INTEGER NOT NULL DEFAULT 20,
    max_mp INTEGER NOT NULL DEFAULT 20,
    meso BIGINT NOT NULL DEFAULT 0,
    stats TEXT NOT NULL,      -- JSON string of STR/DEX/INT/LUK/AP/SP
    inventory TEXT NOT NULL,  -- JSON string of inventory bag & quantities
    equipment TEXT NOT NULL,  -- JSON string of equipped gear slots
    saved_at BIGINT NOT NULL
);

-- 3. Real-Time Chat & System Logs
CREATE TABLE chat_messages (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    player_id TEXT NOT NULL,
    name TEXT NOT NULL,
    map_id INTEGER NOT NULL,
    kind TEXT NOT NULL,       -- say, notice, system, party
    text TEXT NOT NULL,
    created_at BIGINT NOT NULL
);

-- 4. World State & Area Boss Timers
CREATE TABLE world_state (
    map_id INTEGER PRIMARY KEY,
    mobs_killed INTEGER NOT NULL DEFAULT 0,
    boss_active BOOLEAN NOT NULL DEFAULT FALSE,
    boss_hp INTEGER NOT NULL DEFAULT 0,
    boss_max_hp INTEGER NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL
);
