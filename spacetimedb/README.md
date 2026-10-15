# SpacetimeDB Integration for Maple Wayfarer

This directory contains the database schema and architecture for running **SpacetimeDB** as the high-performance relational database and networking engine for Maple Wayfarer.

---

## 1. Quick Start with Docker Compose

To spin up both SpacetimeDB and the Maple Wayfarer game server together:

```bash
docker compose up -d
```

This launches:
- **SpacetimeDB** on port `3001` (internal `3000`), persisting data to the `spacetimedb-data` volume.
- **Maple Game Server** on port `3000`, connected to SpacetimeDB via `SPACETIMEDB_URL=http://spacetimedb:3000`.

To inspect SpacetimeDB status from the game server:
```bash
curl http://localhost:3000/api/spacetimedb/status
```

---

## 2. Relational Schema (`schema.sql`)

- **`players`**: Real-time positions (`x`, `y`), orientations (`face`), active animations (`anim`, `frame`), visual equipment/look IDs, and map instances (`map_id`).
- **`characters`**: Persistent progression data including level, job, EXP, HP/MP, mesos, inventory bag contents, and Star Force equipment.
- **`chat_messages`**: Chat history and system notifications across maps.
- **`world_state`**: Kill counters, area boss spawn timers, and live boss HP.

---

## 3. Reducers & Client Architecture (`src/spacetimedb.ts`)

The client interacts with SpacetimeDB via typed reducers:
- `update_player_position`: Streams spatial coordinates and animation frames.
- `player_action`: Broadcasts skills, attacks, and Flash Jumps to all players in the same map.
- `save_character` & `load_character`: Persists save states directly into SpacetimeDB tables.
- `send_chat`: Relays chat messages across channels and maps.
