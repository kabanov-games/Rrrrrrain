import { WORLD, LEVELS, RUN, ITEMS, lootPool, pickRandom, stageKind, xpToNextLevel } from "../../../shared/index.js";
import { HubSlot, HubChest } from "../schema.js";
import { lobbyDisplayPositions, lobbyChestPositions } from "../../../shared/index.js";
import { playerMaxHp } from "./stats.js";
import { addPickup, spawnArenaPickups } from "./loot.js";

export function hubSpawn() {
  return { x: 0, y: 1.6, z: WORLD.LOBBY_SPAWN_Z || 14 };
}

export function arenaSpawn() {
  return { x: 0, y: 1.6, z: 0 };
}

export function setupHubStorage(room) {
  for (const p of lobbyDisplayPositions()) {
    const s = new HubSlot();
    s.pos.x = p.x;
    s.pos.y = 0.7;
    s.pos.z = p.z;
    s.empty = true;
    room.state.hubSlots.push(s);
  }
  for (const p of lobbyChestPositions()) {
    const c = new HubChest();
    c.pos.x = p.x;
    c.pos.y = 0.6;
    c.pos.z = p.z;
    room.state.hubChests.push(c);
  }
}

export function depositToHub(room, kind, handType, itemId) {
  const val = (kind === "HAND" || kind === "WEAPON" || kind === "CARD")
    ? (handType || "")
    : (itemId || "");
  for (const s of room.state.hubSlots) {
    if (s.empty) {
      s.kind = kind || "";
      s.handType = (kind === "HAND" || kind === "WEAPON" || kind === "CARD") ? val : "";
      s.itemId = kind === "ITEM" ? val : "";
      s.empty = false;
      return true;
    }
  }
  let best = null, bestLen = Infinity;
  for (const c of room.state.hubChests) {
    if (c.contents.length < bestLen) { bestLen = c.contents.length; best = c; }
  }
  if (best) {
    best.contents.push((kind || "") + ":" + val);
    return true;
  }
  return false;
}

export function autoDepositPlayerInventory(room) {
  room.state.players.forEach(p => {
    while (p.itemsInBody.length > 0) {
      const it = p.itemsInBody.pop();
      depositToHub(room, "ITEM", "", it);
    }
    p.passiveItemId = "";
    p.xp = 0;
    p.survivorLevel = 1;
    p.maxHp = playerMaxHp(p);
    p.hp = p.maxHp;
    p.isGhost = false;
  });
}

export function clearRunEconomy(room) {
  room.state.runTimeSec = 0;
  room.state.players.forEach((p) => { p.gold = 0; });
}

export function grantXp(p, amount) {
  if (!p || p.isGhost) return;
  p.xp = (p.xp || 0) + amount;
  const cap = RUN.LEVEL_CAP || 94;
  while ((p.survivorLevel || 1) < cap) {
    const need = xpToNextLevel(p.survivorLevel || 1);
    if ((p.xp || 0) < need) break;
    p.xp -= need;
    p.survivorLevel = (p.survivorLevel || 1) + 1;
    const prevMax = p.maxHp;
    p.maxHp = playerMaxHp(p);
    p.hp = Math.min(p.maxHp, (p.hp || 0) + Math.max(0, p.maxHp - prevMax));
  }
}

export function grantKillRewards(room) {
  const gold = RUN.GOLD_PER_KILL || 8;
  const xpGain = RUN.XP_PER_KILL || 12;
  room.state.players.forEach((p) => {
    if (p.isGhost || p.hp <= 0) return;
    p.gold = (p.gold || 0) + gold;
    grantXp(p, xpGain);
  });
}

export function teleportAllPlayers(room, x, y, z) {
  const until = Date.now() + 2200;
  room.state.players.forEach((p) => {
    p.pos.x = x;
    p.pos.y = y;
    p.pos.z = z;
    p._posLockUntil = until;
  });
  room.broadcast("fx", { type: "phase_teleport", phase: room.state.phase, x, y, z });
}

export function resetArena(room) {
  room.state.wave = 0;
  room.state.portalActive = false;
  room.state.portalCharge = 0;
  room.state.enemies.clear();
  room.projectiles.length = 0;
  room.state.pickups.clear();
}

export function returnToHub(room) {
  const prev = room.state.phase;
  room.state.phase = "hub";
  room.state.levelIndex = 0;
  resetArena(room);
  if (prev !== "hub") autoDepositPlayerInventory(room);
  clearRunEconomy(room);
  const s = hubSpawn();
  teleportAllPlayers(room, s.x, s.y, s.z);
}

export function wipeToHub(room) {
  const prev = room.state.phase;
  if (prev === "hub") return;
  room.broadcast("chat", { name: "система", text: "команда пала — возврат в лобби", id: "" });
  room.broadcast("fx", { type: "wipe_hub" });
  room.state.phase = "hub";
  room.state.levelIndex = 0;
  room.state.wave = 0;
  room.state.waveTimer = 0;
  room.state.portalActive = false;
  room.state.portalCharge = 0;
  room.state.enemies.clear();
  room.projectiles.length = 0;
  room.state.pickups.clear();
  if (prev !== "hub") autoDepositPlayerInventory(room);
  clearRunEconomy(room);
  const s = hubSpawn();
  room.state.players.forEach((pl, sid) => {
    pl.isGhost = false;
    pl.maxHp = playerMaxHp(pl);
    pl.hp = pl.maxHp;
    pl.pos.x = s.x; pl.pos.y = s.y; pl.pos.z = s.z;
    pl._posLockUntil = Date.now() + 2200;
    room.broadcast("fx", { type: "respawn", target: sid, x: s.x, y: s.y, z: s.z });
  });
  room.broadcast("fx", { type: "phase_teleport", phase: "hub", x: s.x, y: s.y, z: s.z });
}

export function startArena(room) {
  room.state.wave = 1;
  room.state.portalCharge = 0;
  room.state.portalActive = false;
  const L = LEVELS[room.state.levelIndex || 0];
  room.state.portalTarget = (L && L.portalCharge) || RUN.PORTAL_DEFEND_S || 90;
  const minD = WORLD.PORTAL_DIST_MIN || 74;
  const maxD = WORLD.PORTAL_DIST_MAX || 90;
  const dist = minD + Math.random() * (maxD - minD);
  const ang = Math.random() * Math.PI * 2;
  room.state.portalX = Math.sin(ang) * dist;
  room.state.portalZ = Math.cos(ang) * dist;
  room.state.bluePortal = false;
  room.state.bluePortalX = 0;
  room.state.bluePortalZ = 0;
  room.waveTimer = 0;
  room.state.pickups.clear();
  spawnArenaPickups(room);
  room.state.enemies.clear();
  room.state.aiBudget = room.aiBudgetStart();
  room.state.aiNextWaveAt = 0;
  room.spawnWaveOfType("GROUND_CRAWLER", 3);
  room.spawnWaveOfType("CACO", 2);
  if (L && L.boss) room.spawnColossus();
}

export function enterArena(room) {
  if (room.state.phase === "arena" || room.state.phase === "portal_ready") return;
  room.state.phase = "arena";
  room.state.levelIndex = 0;
  room.state.loopCount = 0;
  room.state.bluePortal = false;
  clearRunEconomy(room);
  startArena(room);
  const s = arenaSpawn();
  teleportAllPlayers(room, s.x, s.y, s.z);
}

export function nextStage(room) {
  if (room.state.phase !== "portal_ready") return;
  const idx = room.state.levelIndex || 0;
  const kind = stageKind(idx);
  if (kind === "boss") {
    const shards = RUN.LUNAR_SHARDS_BOSS || 1;
    room.state.players.forEach((p) => { p.lunarShards = (p.lunarShards || 0) + shards; });
    room.broadcast("chat", { name: "система", text: "Митрикс пал — лунные монеты в карман, возврат в лобби", id: "" });
    returnToHub(room);
    return;
  }
  let next = idx + 1;
  if (room._bazaarSkipStage) {
    room._bazaarSkipStage = false;
    next = Math.min(LEVELS.length - 1, idx + 2);
  }
  if (kind === "fork") next = LEVELS.findIndex(L => L.boss);
  if (next < 0) next = LEVELS.length - 1;
  room.state.levelIndex = Math.min(LEVELS.length - 1, next);
  room.state.players.forEach((p) => {
    p.gold = 0;
    if (p.isGhost || p.hp <= 0) {
      p.isGhost = false;
      p.maxHp = playerMaxHp(p);
      p.hp = p.maxHp;
    }
  });
  room.state.phase = "arena";
  startArena(room);
  const s = arenaSpawn();
  teleportAllPlayers(room, s.x, s.y, s.z);
  const L = LEVELS[room.state.levelIndex] || LEVELS[0];
  room.broadcast("chat", { name: "система", text: `следующий этап: ${L.label}`, id: "" });
  room.broadcast("fx", { type: "next_stage", levelIndex: room.state.levelIndex });
}

export function loopRun(room) {
  if (room.state.phase !== "portal_ready") return;
  if (stageKind(room.state.levelIndex || 0) !== "fork") {
    room.broadcast("chat", { name: "система", text: "Loop доступен только на развилке 5-го этапа", id: "" });
    return;
  }
  room.state.loopCount = (room.state.loopCount || 0) + 1;
  room.state.levelIndex = 0;
  room.state.players.forEach((p) => {
    p.gold = 0;
    if (p.isGhost || p.hp <= 0) {
      p.isGhost = false;
      p.maxHp = playerMaxHp(p);
      p.hp = p.maxHp;
    }
  });
  room.state.phase = "arena";
  startArena(room);
  const s = arenaSpawn();
  teleportAllPlayers(room, s.x, s.y, s.z);
  room.broadcast("chat", { name: "система", text: `Loop ${room.state.loopCount} — круг сначала, билд и таймер остаются`, id: "" });
  room.broadcast("fx", { type: "next_stage", levelIndex: 0 });
}

export function enterBazaar(room) {
  if (room.state.phase === "hub") return;
  if (room.state.phase === "bazaar") return;
  room._preBazaarPhase = room.state.phase;
  room.state.phase = "bazaar";
  room.state.pickups.clear();
  addPickup(room, { kind: "RETURN_PORTAL", itemId: "", handType: "", goldCost: 0, x: 0, y: 1.2, z: -10 });
  const lunar = lootPool("blue");
  const shop = lunar.length ? lunar : ITEMS.filter(x => x.lunar);
  for (let i = 0; i < 3; i++) {
    const it = pickRandom(shop.length ? shop : ITEMS.filter(x => !x.scrap));
    addPickup(room, {
      kind: "BAZAAR_ITEM", itemId: it.id, handType: "", goldCost: 1,
      x: -8 + i * 8, y: 1.2, z: 8,
    });
  }
  addPickup(room, { kind: "BAZAAR_SKIP", itemId: "", handType: "", goldCost: 1, x: 0, y: 1.2, z: 14 });
  teleportAllPlayers(room, 0, 1.6, 4);
  room.broadcast("chat", { name: "система", text: "Базар между мирами — Ньют молчит. Лунные монеты.", id: "" });
  room.broadcast("fx", { type: "bazaar", phase: "bazaar" });
}

export function leaveBazaar(room) {
  if (room.state.phase !== "bazaar") return;
  const back = room._preBazaarPhase || "arena";
  room.state.phase = back;
  room.state.pickups.clear();
  if (back === "arena" || back === "portal_ready") spawnArenaPickups(room);
  const s = arenaSpawn();
  teleportAllPlayers(room, s.x, s.y, s.z);
  room.broadcast("fx", { type: "bazaar", phase: back });
}

export function markBazaarSkip(room) {
  const idx = room.state.levelIndex || 0;
  if (stageKind(idx) !== "boss") room._bazaarSkipStage = true;
}
