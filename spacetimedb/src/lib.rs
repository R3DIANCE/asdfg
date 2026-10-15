use spacetimedb::{table, reducer, ReducerContext, Table};

#[table(accessor = user, public)]
pub struct User {
    #[primary_key]
    pub username: String,
    pub password_hash: String,
    pub created_at: u64,
}

#[table(accessor = character, public)]
pub struct Character {
    #[primary_key]
    pub name: String,
    #[index(btree)]
    pub username: String,
    pub class_id: String,
    pub gender: String,
    pub level: u32,
    pub exp: u64,
    pub hp: i32,
    pub max_hp: i32,
    pub mp: i32,
    pub max_mp: i32,
    pub meso: i64,
    pub map_id: u32,
    pub x: i32,
    pub y: i32,
    pub look: String,
    pub stats: String,
    pub inventory: String,
    pub equipment: String,
    pub skills: String,
    pub updated_at: u64,
}

#[table(accessor = player, public)]
pub struct Player {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub map_id: u32,
    pub x: i32,
    pub y: i32,
    pub face: i32,
    pub anim: String,
    pub frame: i32,
    pub look: String,
    pub last_action: String,
    pub updated_at: u64,
}

#[table(accessor = chat_message, public)]
pub struct ChatMessage {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub player_id: String,
    pub name: String,
    pub map_id: u32,
    pub kind: String,
    pub text: String,
    pub created_at: u64,
}

#[reducer(init)]
pub fn init(_ctx: &ReducerContext) {}

#[reducer]
pub fn register_user(ctx: &ReducerContext, username: String, password_hash: String) {
    if username.trim().is_empty() {
        return;
    }
    if ctx.db.user().username().find(&username).is_some() {
        return;
    }
    let now = ctx.timestamp.duration_since(spacetimedb::Timestamp::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    ctx.db.user().insert(User {
        username,
        password_hash,
        created_at: now,
    });
}

#[reducer]
pub fn create_char(
    ctx: &ReducerContext,
    username: String,
    name: String,
    class_id: String,
    gender: String,
    look: String,
    stats: String,
    equipment: String,
) {
    if name.trim().is_empty() {
        return;
    }
    if ctx.db.character().name().find(&name).is_some() {
        return;
    }
    let now = ctx.timestamp.duration_since(spacetimedb::Timestamp::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    ctx.db.character().insert(Character {
        name,
        username,
        class_id,
        gender,
        level: 1,
        exp: 0,
        hp: 50,
        max_hp: 50,
        mp: 20,
        max_mp: 20,
        meso: 1000,
        map_id: 100000000,
        x: 0,
        y: 0,
        look,
        stats,
        inventory: "[]".to_string(),
        equipment,
        skills: "{}".to_string(),
        updated_at: now,
    });
}

#[reducer]
pub fn delete_char(ctx: &ReducerContext, name: String) {
    ctx.db.character().name().delete(&name);
}

#[reducer]
pub fn save_char(
    ctx: &ReducerContext,
    name: String,
    level: u32,
    exp: u64,
    hp: i32,
    max_hp: i32,
    mp: i32,
    max_mp: i32,
    meso: i64,
    map_id: u32,
    x: i32,
    y: i32,
    look: String,
    stats: String,
    inventory: String,
    equipment: String,
    skills: String,
) {
    if let Some(mut ch) = ctx.db.character().name().find(&name) {
        let now = ctx.timestamp.duration_since(spacetimedb::Timestamp::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        ch.level = level;
        ch.exp = exp;
        ch.hp = hp;
        ch.max_hp = max_hp;
        ch.mp = mp;
        ch.max_mp = max_mp;
        ch.meso = meso;
        ch.map_id = map_id;
        ch.x = x;
        ch.y = y;
        ch.look = look;
        ch.stats = stats;
        ch.inventory = inventory;
        ch.equipment = equipment;
        ch.skills = skills;
        ch.updated_at = now;
        ctx.db.character().name().update(ch);
    }
}

#[reducer]
pub fn update_pos(
    ctx: &ReducerContext,
    id: String,
    name: String,
    map_id: u32,
    x: i32,
    y: i32,
    face: i32,
    anim: String,
    frame: i32,
    look: String,
) {
    let now = ctx.timestamp.duration_since(spacetimedb::Timestamp::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    if let Some(mut pl) = ctx.db.player().id().find(&id) {
        pl.name = name;
        pl.map_id = map_id;
        pl.x = x;
        pl.y = y;
        pl.face = face;
        pl.anim = anim;
        pl.frame = frame;
        pl.look = look;
        pl.updated_at = now;
        ctx.db.player().id().update(pl);
    } else {
        ctx.db.player().insert(Player {
            id,
            name,
            map_id,
            x,
            y,
            face,
            anim,
            frame,
            look,
            last_action: String::new(),
            updated_at: now,
        });
    }
}

#[reducer]
pub fn act(
    ctx: &ReducerContext,
    id: String,
    map_id: u32,
    kind: String,
    skill_id: String,
    anim: String,
    face: i32,
    x: i32,
    y: i32,
    frame: i32,
) {
    let now = ctx.timestamp.duration_since(spacetimedb::Timestamp::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    if let Some(mut pl) = ctx.db.player().id().find(&id) {
        pl.map_id = map_id;
        pl.x = x;
        pl.y = y;
        pl.face = face;
        pl.anim = anim.clone();
        pl.frame = frame;
        pl.last_action = format!("{}:{}:{}", kind, skill_id, anim);
        pl.updated_at = now;
        ctx.db.player().id().update(pl);
    }
}

#[reducer]
pub fn leave(ctx: &ReducerContext, id: String) {
    ctx.db.player().id().delete(&id);
}

#[reducer]
pub fn chat(ctx: &ReducerContext, player_id: String, name: String, map_id: u32, kind: String, text: String) {
    let now = ctx.timestamp.duration_since(spacetimedb::Timestamp::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    ctx.db.chat_message().insert(ChatMessage {
        id: 0,
        player_id,
        name,
        map_id,
        kind,
        text,
        created_at: now,
    });
}
