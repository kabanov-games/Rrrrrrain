import colyseus from "colyseus";
import { GameState, Player } from "./schema.js";
const { Room } = colyseus.default || colyseus;
import { NET, COMBAT, ITEMS_BY_ID, SURVIVOR, AI_DIRECTOR, difficultyMul } from "../../shared/index.js";
import { TICK_MS } from "./systems/constants.js";
import { playerMaxHp, playerDamageMult, combatPlayerCount } from "./systems/stats.js";
import {
  nearestEnemy, hitscanEnemy, spawnHoming, throwDaggers, castChainStorm,
  damageEnemy, damagePlayer, consumeExtraLife, pickStarfallImpact,
  tickFriendlyProjectiles, tickEnemyProjectiles, tickRegen, tickDrones,
} from "./systems/combat.js";
import { addPickup, spawnArenaPickups, consumePrinterFuel, takeOneNonScrap } from "./systems/loot.js";
import {
  setupHubStorage, depositToHub, autoDepositPlayerInventory,
  clearRunEconomy, grantKillRewards, teleportAllPlayers, returnToHub, wipeToHub,
  enterArena, nextStage, loopRun, startArena, enterBazaar, leaveBazaar, markBazaarSkip,
  hubSpawn, arenaSpawn,
} from "./systems/runFlow.js";
import {
  spawnWaveOfType, addEnemyAt, addEnemyNear,
  spawnColossus, applyElite, getPlayerFrontAngle, aiDirectorSpawnWave,
  tickEnemies, tickDirector,
} from "./systems/director.js";
import { registerRoomMessages } from "./systems/messages.js";

export class ArenaRoom extends Room {
  onCreate(opts) {
    this.setMetadata({ lobbyId: (opts && opts.lobbyId) ? String(opts.lobbyId) : "public" });
    this.maxClients = NET.MAX_PLAYERS;
    this.setState(new GameState());
    this.projectiles = [];
    this.enemySeq = 0;
    this.pickupSeq = 0;
    this.waveTimer = 0;
    this.spawnInitialPickups();
    setupHubStorage(this);
    this.state.phase = "hub";
    this.setSimulationInterval(dt => {
      try {
        this.tick(dt / 1000);
      } catch (err) {
        console.error("[room] tick", err);
      }
    }, TICK_MS);
    registerRoomMessages(this);
  }

  survivorKit() { return SURVIVOR; }
  aiBudgetStart() { return AI_DIRECTOR.BUDGET_START; }
  cardSpawnMul() { return 1; }
  combatPlayerCount() { return combatPlayerCount(this.state.players); }
  dmul() { return difficultyMul(this.state.runTimeSec, this.combatPlayerCount()); }
  playerMaxHp(p) { return playerMaxHp(p); }
  playerDamageMult(p) { return playerDamageMult(p); }
  nearestEnemy(origin, maxR, dir = null, minDot = null) { return nearestEnemy(this, origin, maxR, dir, minDot); }
  hitscanEnemy(origin, dir, range, tube) { return hitscanEnemy(this, origin, dir, range, tube); }
  spawnHoming(ownerId, origin, dir, spell, damage, tgt) { return spawnHoming(this, ownerId, origin, dir, spell, damage, tgt); }
  throwDaggers(p, sid, origin, dir, spell, dmgMult) { return throwDaggers(this, p, sid, origin, dir, spell, dmgMult); }
  castChainStorm(p, origin, dir, spell, dmgMult) { return castChainStorm(this, origin, dir, spell, dmgMult); }
  pickStarfallImpact(origin, dir, spell) { return pickStarfallImpact(this, origin, dir, spell); }
  consumeExtraLife(p) { return consumeExtraLife(this, p); }
  damageEnemy(e, dmg) { return damageEnemy(this, e, dmg); }
  damagePlayer(p, dmg, sessionId, fromX = 0, fromZ = 0) { return damagePlayer(this, p, dmg, sessionId, fromX, fromZ); }

  equipItem(p, itemId) {
    if (!itemId || !ITEMS_BY_ID[itemId]) return;
    p.itemsInBody.push(itemId);
    p.passiveItemId = p.itemsInBody[0] || itemId;
    const prevMax = p.maxHp || COMBAT.PLAYER_MAX_HP;
    p.maxHp = playerMaxHp(p);
    p.hp = Math.min(p.maxHp, p.hp + Math.max(0, p.maxHp - prevMax));
  }

  refreshItemHp(p) {
    const prevMax = p.maxHp || COMBAT.PLAYER_MAX_HP;
    p.maxHp = playerMaxHp(p);
    if (p.hp > p.maxHp) p.hp = p.maxHp;
    else if (p.maxHp > prevMax) p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - prevMax));
  }

  consumePrinterFuel(p, rarity) { return consumePrinterFuel(p, rarity, (pl) => this.refreshItemHp(pl)); }
  takeOneNonScrap(p) { return takeOneNonScrap(p, (pl) => this.refreshItemHp(pl)); }

  onJoin(client, opts) {
    const p = new Player();
    p.name = (opts?.name || "sgustok").slice(0, 20);
    p.maxHp = COMBAT.PLAYER_MAX_HP;
    p.hp = p.maxHp;
    const spawn = hubSpawn();
    p.pos.x = spawn.x;
    p.pos.y = spawn.y;
    p.pos.z = spawn.z;
    p.gold = 0;
    p.xp = 0;
    p.survivorLevel = 1;
    p.lunarShards = 0;
    p.equipmentId = "HEAL";
    p.droneCount = 0;
    this.state.players.set(client.sessionId, p);
    console.log(`[room] join ${client.sessionId} (${p.name}). total=${this.state.players.size}`);
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    console.log(`[room] leave ${client.sessionId}. total=${this.state.players.size}`);
  }

  setupHubStorage() { return setupHubStorage(this); }
  depositToHub(kind, handType, itemId) { return depositToHub(this, kind, handType, itemId); }
  autoDepositPlayerInventory() { return autoDepositPlayerInventory(this); }
  grantToPlayer(p, kind, handType, itemId) {
    if (kind === "ITEM") this.equipItem(p, itemId || handType);
  }
  spawnInitialPickups() {}
  spawnArenaPickups() { return spawnArenaPickups(this); }
  addPickup(opts) { return addPickup(this, opts); }
  hubSpawn() { return hubSpawn(); }
  arenaSpawn() { return arenaSpawn(); }
  teleportAllPlayers(x, y, z) { return teleportAllPlayers(this, x, y, z); }
  returnToHub() { return returnToHub(this); }
  clearRunEconomy() { return clearRunEconomy(this); }
  grantKillRewards() { return grantKillRewards(this); }
  enterArena() { return enterArena(this); }
  nextStage() { return nextStage(this); }
  loopRun() { return loopRun(this); }
  startArena() { return startArena(this); }
  enterBazaar() { return enterBazaar(this); }
  leaveBazaar() { return leaveBazaar(this); }
  markBazaarSkip() { return markBazaarSkip(this); }
  applyElite(e, typeId) { return applyElite(this, e, typeId); }
  resetArena() {
    this.state.wave = 0;
    this.state.portalActive = false;
    this.state.portalCharge = 0;
    this.state.enemies.clear();
    this.projectiles.length = 0;
    this.state.pickups.clear();
  }
  getPlayerFrontAngle() { return getPlayerFrontAngle(this); }
  spawnWaveOfType(typeId, count) { return spawnWaveOfType(this, typeId, count); }
  addEnemyAt(typeId, angle) { return addEnemyAt(this, typeId, angle); }
  addEnemyNear(typeId, x, z) { return addEnemyNear(this, typeId, x, z); }
  addEnemy(typeId) { return addEnemyAt(this, typeId, Math.random() * Math.PI * 2); }
  spawnColossus() { return spawnColossus(this); }
  wipeToHub() { return wipeToHub(this); }
  aiDirectorSpawnWave() { return aiDirectorSpawnWave(this); }
  tickDrones(dt) { return tickDrones(this, dt); }

  tick(dt) {
    tickRegen(this, dt);
    tickFriendlyProjectiles(this, dt);
    const combatPhase = this.state.phase === "arena" || this.state.phase === "portal_ready";
    if (!combatPhase) return;
    tickEnemies(this, dt);
    tickEnemyProjectiles(this);
    tickDrones(this, dt);
    tickDirector(this, dt);
  }
}
