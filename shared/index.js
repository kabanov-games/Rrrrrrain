// Shared constants and item catalog for client + server.
// Keep this file plain JS so both browser and Node import cleanly.
// v0.0.9.0: named exports used by the client HUD/controller (sumItemStat).

export const NET = {
  TICK_RATE: 20,                 // server broadcast Hz
  PLAYER_SEND_HZ: 30,            // client input send rate (повышено для меньшего рассинхрона yaw)
  ROOM_NAME: "arena",
  MAX_PLAYERS: 4,
};

export const WORLD = {
  ARENA_RADIUS: 600,             // 1200м диаметр по ТЗ v0.0.3.0
  ARENA_HEIGHT: 100,
  HUB_RADIUS: 36,                // радиус лобби (край площадки)
  HUB_PORTAL_R: 0,               // портал лобби в центре, как на арене
  HUB_PORTAL_ANG: 0,
  LOBBY_SPAWN_Z: 14,             // спавн лицом к порталу, не на площадке
  LOBBY_VAULT_X: 12,             // хранилище справа от портала
  GRAVITY: 20,                   // руки-меч уже с гравитацией — не летаем
  BASE_MOVE_SPEED: 6,
  BASE_FLY_SPEED: 5,
  DASH_SPEED: 22,
  DASH_DURATION: 0.18,
  DASH_COOLDOWN: 1.1,
  RUN_MULT: 1.5,                 // Shift
  FOG_NEAR: 60,                  // начало тумана
  FOG_FAR: 100,                  // полный туман (ТЗ: обзор 100м)
  PICKUP_RING: 32,               // пикапы арены — внутри тумана, видны со спавна
  PORTAL_DIST: 82,               // арена: далеко от спавна, игрок ищет; внутри тумана 100м
  PORTAL_DIST_MIN: 74,
  PORTAL_DIST_MAX: 90,
  PORTAL_HOLD_S: 1.5,
  CAM_DIST: 6.6,
  CAM_SHOULDER: 1.05,
  CAM_LIFT: 0.55,
};

/** Петля ливня — золото, XP, таймер сложности, оборона портала. */
export const RUN = {
  GOLD_PER_KILL: 8,
  XP_PER_KILL: 12,
  LEVEL_CAP: 94,
  HP_PER_LEVEL: 5,
  DMG_PER_LEVEL: 0.02,
  CHEST_BASE_GOLD: 25,
  COOP_PLAYER_SCALE: 0.2,
  LUNAR_SHARDS_BOSS: 1,
  EQUIP_HEAL: 30,
  EQUIP_CD_S: 15,
  PORTAL_DEFEND_S: 90,
  LUNAR_DROP: 0.04,
  ELITE_CHANCE: 0.08,
  FORK_INDEX: 4,
  DIFFICULTY_STEPS: [
    { t: 0, ru: "Easy" },
    { t: 60, ru: "Medium" },
    { t: 180, ru: "Hard" },
    { t: 360, ru: "I'M READY TO DIE" },
  ],
};

export function difficultyLabel(runTimeSec) {
  let ru = RUN.DIFFICULTY_STEPS[0].ru;
  for (const s of RUN.DIFFICULTY_STEPS) {
    if ((runTimeSec || 0) >= s.t) ru = s.ru;
  }
  return ru;
}

export function difficultyMul(runTimeSec, playerCount = 1) {
  const time = 1 + Math.max(0, runTimeSec || 0) / 180;
  const coop = 1 + (RUN.COOP_PLAYER_SCALE || 0.2) * Math.max(0, (playerCount || 1) - 1);
  return time * coop;
}

export function chestGoldCost(runTimeSec) {
  return Math.max(8, Math.round((RUN.CHEST_BASE_GOLD || 25) * difficultyMul(runTimeSec, 1)));
}

export function xpToNextLevel(level) {
  const lv = Math.max(1, level || 1);
  return Math.round(40 + lv * 18);
}

export function lobbyDisplayPositions() {
  const vx = WORLD.LOBBY_VAULT_X || 12;
  const out = [];
  for (let i = 0; i < 20; i++) {
    const row = i < 10 ? 0 : 1;
    const col = i % 10;
    out.push({ x: vx + 1.4 + row * 2.3, z: -9 + col * 2 });
  }
  return out;
}

export function lobbyChestPositions() {
  const vx = WORLD.LOBBY_VAULT_X || 12;
  return [-4.8, -1.6, 1.6, 4.8].map(z => ({ x: vx - 1.6, z }));
}

// v0.0.3.0: HP=100 по ТЗ
export const COMBAT = {
  PLAYER_MAX_HP: 100,
  ENEMY_MAX_HP: 40,              // Cacodemon-крохи, чтобы меч ощущался
  ARMORED_ENEMY_MAX_HP: 80,
  GHOST_STAT_MULT: 0.1,
  MELEE_RANGE: 2.2,
  RESPAWN_INVULN_S: 1.5,
  FALL_RESPAWN_HP_PCT: 0.05,     // ТЗ: падение в дыру → 5% HP на краю
  REGEN_DELAY_S: 3.0,            // регенерация вне боя
  REGEN_PER_S: 5,
};

// Cast definitions — 3 hand types (FIRE / ICE / BONE), каждый со своим спеллом.
export const HAND_TYPES = {
  FIRE: { id: "FIRE", color: 0xff5a1f, name: "Огненная",  spell: "FIREBALL" },
  ICE:  { id: "ICE",  color: 0x66ccff, name: "Ледяная",   spell: "ICEBOLT" },
  BONE: { id: "BONE", color: 0xe6d8b0, name: "Костяная",  spell: "BONE_SHARD" },
  CHAIN:{ id: "CHAIN",color: 0x9be7ff, name: "Грозовая", spell: "CHAIN_LIGHTNING" },
};

export const SPELLS = {
  FIREBALL:   { cooldown: 0.35, projectileSpeed: 40, damage: 1, radius: 0.6, color: 0xff5a1f, life: 2.0 },
  ICEBOLT:    { cooldown: 0.30, projectileSpeed: 48, damage: 1, radius: 0.4, color: 0x66ccff, life: 1.8 },
  BONE_SHARD: { cooldown: 0.20, projectileSpeed: 55, damage: 1, radius: 0.3, color: 0xffe0a0, life: 1.5 },
  // Цепная молния: мгновенный хит, не снаряд, прыгает по цепи
  CHAIN_LIGHTNING: {
    cooldown: 0.60, isChain: true, damage: 2, color: 0x9be7ff,
    initialRange: 30,   // дальность первого захвата (конус)
    initialConeCos: 0.85, // ~±32° от взгляда
    jumpRange: 10,      // дальность прыжка между врагами
    maxJumps: 10,       // макс целей в цепи
    falloff: 0.85,      // урон каждого следующего = 85% от предыдущего
  },
  STARFALL: {
    cooldown: 0.5, isStarfall: true, damage: 30, color: 0xff40a0,
    range: 15, radius: 5, aimTube: 2.8, damageMin: 25, damageMax: 35, aimSpread: 0.4,
  },
  STAR_BOLT: {
    cooldown: 1.0, isHoming: true, damage: 34, projectileSpeed: 34,
    visRange: 100, visConeCos: 0.12, life: 4.2, radius: 0.55, color: 0xff40a0,
  },
  STAR_SHIELD: {
    cooldown: 2.0, isShield: true, absorb: 100, duration: 0, color: 0xff40a0,
  },
  STAR_BLOCK: {
    cooldown: 2.0, isShield: true, absorb: 100, duration: 0, color: 0xff40a0,
  },
  BOLT_HITSCAN: {
    cooldown: 0.45, isHitscan: true, damage: 42, range: 120, tube: 0.6, color: 0x88eeff,
  },
  CHAIN_STORM: {
    cooldown: 30, isChainStorm: true, damage: 150, damageStep: 10, maxJumps: 10,
    initialRange: 90, jumpRange: 24, initialConeCos: 0.7, color: 0xaaddff,
  },
  DAGGER_CHARGE: { cooldown: 1.0, isDaggerCharge: true },
  DAGGER_THROW: {
    cooldown: 0.7, isDaggerThrow: true, damage: 18, projectileSpeed: 38,
    visRange: 100, life: 3.6, radius: 0.38, color: 0xc8d8e8,
  },
  CIG_PUFF: { cooldown: 0.7, isCosmetic: true, fx: "cig_puff", color: 0x888888 },
  CIG_BLOW: { cooldown: 1.1, isCosmetic: true, fx: "cig_blow", color: 0xbbbbbb },
};

// Один выживший: 4 слота GDD (Primary / Secondary / Utility=рывок / Special), без карт и сменного оружия.
export const SURVIVOR = {
  id: "COMMANDO",
  name: "Выживший",
  lmb: "BOLT_HITSCAN",
  rmb: "STAR_SHIELD",
  special: "CHAIN_STORM",
  lmbHint: "основная атака",
  rmbHint: "барьер",
  specialHint: "особый залп, долгий КД",
};

// v0.0.3.1: AI Director — бюджет-based спавн
export const AI_DIRECTOR = {
  BUDGET_START: 10000,
  BUDGET_REGEN_PER_SEC: 8,   // приток бюджета в секунду
  WAVE_MIN_SIZE: 3,
  WAVE_MAX_SIZE: 7,
  WAVE_INTERVAL_MIN: 6,
  WAVE_INTERVAL_MAX: 12,
  AGGRO_RANGE: 92,
  VISION_RANGE: 92,
  LEASH_RANGE: 115,
  CORPSE_LINGER_S: 8.0,
  // стоимость в бюджете для каждого типа
  COSTS: {
    GROUND_CRAWLER: 25,
    FLYING_SHOOTER: 80,
    CACO: 60,
    IMP: 20,
    PINKY: 60,
    BARON: 200,
    COLOSSUS: 800,
  },
};

// Enemies — DOOM 1 inspired + v0.0.3.1 новые: GROUND_CRAWLER, FLYING_SHOOTER
export const ENEMY_TYPES = {
  IMP:       { id: "IMP",       hp: 2, speed: 4.5, size: 1.0,  scale: 1.8,  damage: 1, sprite: "imp",       colorTint: 0xffffff, hidden: true },
  PINKY:     { id: "PINKY",     hp: 4, speed: 5.5, size: 1.4,  scale: 2.6,  damage: 1, sprite: "pinky",     colorTint: 0xffffff, armored: true, hidden: true  },
  CACO:      { id: "CACO",      hp: 2, speed: 3.5, size: 1.2,  scale: 3.0,  damage: 1, sprite: "caco",      colorTint: 0xffffff, flying: true   },
  BARON:     { id: "BARON",     hp: 4, speed: 3.0, size: 2.0,  scale: 4.5,  damage: 1, sprite: "baron",     colorTint: 0xffffff, hidden: true },
  FLYER:     { id: "FLYER",     hp: 1, speed: 4.5, size: 0.9,  scale: 2.4,  damage: 1, sprite: "caco",      colorTint: 0xffee88, flying: true, hidden: true   },
  COLOSSUS:  { id: "COLOSSUS",  hp: 10, speed: 1.2, size: 8.0, scale: 6.5, damage: 1, sprite: "colossus",  colorTint: 0xffffff, boss: true     },
  // v0.0.3.1: Наземный вылазок — 5 процедурных вариаций (см. GROUND_CRAWLER_VARIANTS)
  GROUND_CRAWLER: {
    id: "GROUND_CRAWLER", hp: 22, speed: 4.2, size: 1.5, scale: 3.2, damage: 8,
    sprite: "caco", colorTint: 0xffffff, flying: true, hoverY: 10,
    fireCount: 3, fireDamage: 9, fireSpeed: 26, fireCooldown: 0.38,
    engageRange: 126, disengageRange: 140, fireLife: 11.4, fireSpread: 0.22,
  },
  FLYING_SHOOTER: {
    id: "FLYING_SHOOTER", hp: 25, speed: 4.5, size: 1.5, scale: 3.5, damage: 10,
    sprite: "caco", colorTint: 0xffffff, flying: true, hoverY: 12,
    fireCount: 3, fireDamage: 8, fireSpeed: 24, fireCooldown: 0.4, engageRange: 120, disengageRange: 140,
    fireLife: 11, fireSpread: 0.22,
  },
};

// v0.0.3.1: 5 процедурных вариаций Ground Crawler.
// Клиент/сервер каждый раз выбирает variant 0..4 при спавне.
export const GROUND_CRAWLER_VARIANTS = [
  { tint: 0xff8080, sizeMul: 1.00, speedMul: 1.00, hpMul: 1.00 },
  { tint: 0x80ff80, sizeMul: 0.85, speedMul: 1.15, hpMul: 0.85 },
  { tint: 0x8080ff, sizeMul: 1.15, speedMul: 0.85, hpMul: 1.20 },
  { tint: 0xffff80, sizeMul: 0.95, speedMul: 1.05, hpMul: 0.90 },
  { tint: 0xff80ff, sizeMul: 1.10, speedMul: 0.95, hpMul: 1.10 },
];

// Пассивки забега: стакаются без лимита. Редкость — цвет GDD.
export const ITEMS = [
  { id: "BLOODSTONE",  rarity: "white", name: "Кровавый камень", effect: "+12 макс. HP / стак", color: 0xe8e8e8, glyph: "◇", hp: 12 },
  { id: "SWIFTBOOT",   rarity: "white", name: "Скороход",         effect: "+12% скорость / стак", color: 0xd0d0d0, glyph: "△", move: 0.12 },
  { id: "EMBER_SIGIL", rarity: "white", name: "Сигил углей",     effect: "+12% урон / стак", color: 0xf0f0f0, glyph: "✦", dmg: 0.12 },
  { id: "STORM_LINK",  rarity: "green", name: "Цепь ливня",      effect: "+8% урон и +6 HP / стак", color: 0x44cc66, glyph: "⛓", hp: 6, dmg: 0.08 },
  { id: "CRIMSON_PACT", rarity: "red",  name: "Багровый пакт",   effect: "+25% урон и +20 HP / стак", color: 0xee3030, glyph: "☠", hp: 20, dmg: 0.25 },
  { id: "SCRAP_WHITE", rarity: "white", name: "Лом",            effect: "материал для принтера", color: 0xb8b8b8, glyph: "▣", scrap: true },
  { id: "SCRAP_GREEN", rarity: "green", name: "Лом+",           effect: "материал для принтера", color: 0x66dd88, glyph: "▣", scrap: true },
  { id: "SCRAP_RED",   rarity: "red",   name: "Лом++",          effect: "материал для принтера", color: 0xee5555, glyph: "▣", scrap: true },
  { id: "CRITLENS",    rarity: "white", name: "Линза ливня",    effect: "+8% крит / стак", color: 0xe8e8e8, glyph: "◎", crit: 0.08 },
  { id: "BONEPLATE",   rarity: "green", name: "Костяная пластина", effect: "+12 броня / стак", color: 0x44cc66, glyph: "▣", armor: 12 },
  { id: "MOSQUITO",    rarity: "green", name: "Москит",         effect: "+0.8 реген / стак", color: 0x44cc66, glyph: "✧", regen: 0.8 },
  { id: "STEALTHKIT",  rarity: "green", name: "Стелскит",       effect: "невидимость 1.5с при ударе", color: 0x44cc66, glyph: "◌", stealth: 1 },
  { id: "DIO",         rarity: "red",   name: "Дио",            effect: "один раз воскрешает", color: 0xee3030, glyph: "✝", extraLife: 1 },
  { id: "LUNAR_GLASS", rarity: "blue",  name: "Лунное стекло",  effect: "+40% урон, −25 макс HP", color: 0x6688ff, glyph: "☽", dmg: 0.4, hp: -25, lunar: true },
];
export const ITEMS_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

export function playerItemList(p) {
  const out = [];
  if (!p) return out;
  const body = p.itemsInBody;
  if (body && body.length) {
    const arr = typeof body.toArray === "function" ? body.toArray() : [...body];
    for (const id of arr) if (id) out.push(id);
    return out;
  }
  if (p.passiveItemId) out.push(p.passiveItemId);
  return out;
}

export function sumItemStat(p, key) {
  let s = 0;
  for (const id of playerItemList(p)) {
    const it = ITEMS_BY_ID[id];
    if (it && typeof it[key] === "number") s += it[key];
  }
  return s;
}

export function scrapIdForRarity(rarity) {
  if (rarity === "green") return "SCRAP_GREEN";
  if (rarity === "red") return "SCRAP_RED";
  return "SCRAP_WHITE";
}

export function stackedPassives(p) {
  const counts = {};
  for (const id of playerItemList(p)) counts[id] = (counts[id] || 0) + 1;
  return Object.entries(counts).map(([id, n]) => ({ id, n, ...ITEMS_BY_ID[id] }));
}

// Этапы круга: магический ливень, не sci-fi планеты.
export const EQUIPMENT = {
  HEAL:    { id: "HEAL",    name: "аптечка",     cd: 15, heal: 30 },
  MISSILE: { id: "MISSILE", name: "залп ракет",  cd: 12, damage: 48, radius: 7 },
  PHASE:   { id: "PHASE",   name: "сдвиг фазы",  cd: 18, duration: 2.2 },
};
export const EQUIPMENT_IDS = Object.keys(EQUIPMENT);

export const LEVELS = [
  { id: "L1", label: "Морось на костях",     skyColor: 0x2a2238, floorColor: 0x4a4038, portalCharge: 90 },
  { id: "L2", label: "Ливень пепла",         skyColor: 0x2a1018, floorColor: 0x4a2418, portalCharge: 90 },
  { id: "L3", label: "Стеклянный град",      skyColor: 0x102028, floorColor: 0x2a4050, portalCharge: 90 },
  { id: "L4", label: "Золотая жила ливня",   skyColor: 0x241808, floorColor: 0x4a3a18, portalCharge: 90 },
  { id: "L5", label: "Фиолетовая бездна",    skyColor: 0x160428, floorColor: 0x2a1840, portalCharge: 90, fork: true },
  { id: "BOSS", label: "Митрикс",             skyColor: 0x1a0008, floorColor: 0x2a0808, portalCharge: 90, boss: true },
];

export function stageKind(levelIndex) {
  const L = LEVELS[levelIndex] || LEVELS[0];
  if (L.boss) return "boss";
  if (L.fork) return "fork";
  return "stage";
}

export function lootPool(rarity) {
  return ITEMS.filter(it => !it.scrap && it.rarity === rarity);
}

export function pickRandom(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}
