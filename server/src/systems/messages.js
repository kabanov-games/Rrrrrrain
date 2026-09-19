import { WORLD, EQUIPMENT, RUN } from "../../../shared/index.js";
import { PORTAL_INTERACT_RANGE } from "./constants.js";
import { handleCast } from "./combat.js";
import { handlePickup } from "./loot.js";
import { playerMaxHp, playerDamageMult } from "./stats.js";

export function registerRoomMessages(room) {
  room.onMessage("input", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    const locked = p._posLockUntil && Date.now() < p._posLockUntil;
    if (!locked) {
      if (typeof msg.x === "number") p.pos.x = msg.x;
      if (typeof msg.y === "number") p.pos.y = msg.y;
      if (typeof msg.z === "number") p.pos.z = msg.z;
    }
    if (typeof msg.yaw === "number") p.yaw = msg.yaw;
    if (typeof msg.pitch === "number") p.pitch = msg.pitch;
    p._lmbHeld = !!msg.lmbHeld;
  });

  room.onMessage("cast", (client, msg) => handleCast(room, client, msg));
  room.onMessage("pickup", (client, msg) => handlePickup(room, client, msg));

  room.onMessage("fall", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    const R = WORLD.ARENA_RADIUS * 0.9;
    const px = typeof msg?.x === "number" ? msg.x : p.pos.x;
    const pz = typeof msg?.z === "number" ? msg.z : p.pos.z;
    const ang = Math.atan2(px, pz);
    p.pos.x = Math.sin(ang) * R;
    p.pos.z = Math.cos(ang) * R;
    p.pos.y = 3;
    room.broadcast("fx", { type: "fall_respawn", target: client.sessionId, x: p.pos.x, z: p.pos.z });
  });

  room.onMessage("inv", () => {});

  room.onMessage("respawn", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    p.maxHp = playerMaxHp(p);
    p.hp = p.maxHp;
    p.isGhost = false;
    p.pos.x = (Math.random() - 0.5) * 4;
    p.pos.y = 1.6;
    p.pos.z = (Math.random() - 0.5) * 4;
    room.broadcast("fx", { type: "respawn", target: client.sessionId });
  });

  room.onMessage("debug", (client, msg) => {
    if (!msg || typeof msg !== "object") return;
    const s = room.state;
    if (typeof msg.god === "boolean" && s.dbgGodMode !== msg.god) s.dbgGodMode = msg.god;
    if (typeof msg.infAmmo === "boolean" && s.dbgInfiniteAmmo !== msg.infAmmo) s.dbgInfiniteAmmo = msg.infAmmo;
    if (typeof msg.speedMul === "number") {
      const v = Math.max(0.1, Math.min(10, msg.speedMul));
      if (s.dbgSpeedMul !== v) s.dbgSpeedMul = v;
    }
    if (typeof msg.damageMul === "number") {
      const v = Math.max(0.1, Math.min(20, msg.damageMul));
      if (s.dbgDamageMul !== v) s.dbgDamageMul = v;
    }
    if (typeof msg.spawnMul === "number") {
      const v = Math.max(0, Math.min(10, msg.spawnMul));
      if (s.dbgSpawnMul !== v) s.dbgSpawnMul = v;
    }
    if (typeof msg.dither === "number") {
      const v = Math.max(1, Math.min(10, msg.dither));
      if (s.dbgDither !== v) s.dbgDither = v;
    }
    if (typeof msg.weaponDmgMul === "number") {
      const v = Math.max(0.1, Math.min(20, msg.weaponDmgMul));
      if (s.dbgWeaponDmgMul !== v) s.dbgWeaponDmgMul = v;
    }
    if (msg.action === "respawn") {
      const p = room.state.players.get(client.sessionId);
      if (p) { p.maxHp = playerMaxHp(p); p.hp = p.maxHp; p.isGhost = false; p.pos.x = 0; p.pos.y = 1.6; p.pos.z = 0; room.broadcast("fx", { type: "respawn", target: client.sessionId }); }
    }
    if (msg.action === "respawnAll") {
      room.state.players.forEach((p, sid) => { p.maxHp = playerMaxHp(p); p.hp = p.maxHp; p.isGhost = false; p.pos.x = 0; p.pos.y = 1.6; p.pos.z = 0; room.broadcast("fx", { type: "respawn", target: sid }); });
    }
    if (msg.action === "killAllEnemies") {
      room.state.enemies.forEach(e => { if (e.alive) room.damageEnemy(e, 9999); });
    }
    if (msg.action === "fillPortal") {
      if (room.state.phase === "arena" || room.state.phase === "portal_ready") {
        room.state.portalActive = true;
        room.state.portalCharge = room.state.portalTarget;
        room.state.phase = "portal_ready";
        room.broadcast("fx", { type: "portal_ready" });
      }
    }
    if (msg.action === "giveHands") {
      const p = room.state.players.get(client.sessionId);
      if (p) { p.hasLeftHand = true; p.hasRightHand = true; p.leftHandType = "FIRE"; p.rightHandType = "ICE"; p.hasLegs = 2; }
    }
    if (typeof msg.fly === "boolean" && s.dbgFly !== msg.fly) s.dbgFly = msg.fly;
    if (msg.action === "givePassive") {
      const p = room.state.players.get(client.sessionId);
      if (p) room.equipItem(p, msg.itemId || "BLOODSTONE");
    }
    if (msg.action === "resetRun") {
      room.state.phase = "hub";
      room.state.wave = 0;
      room.state.levelIndex = 0;
      room.state.portalCharge = 0;
      room.state.portalActive = false;
      room.state.enemies.clear();
      room.projectiles.length = 0;
      room.state.players.forEach(pl => {
        pl.hasLeftHand = false; pl.leftHandType = "";
        pl.hasRightHand = false; pl.rightHandType = "";
        pl.hasLegs = 0;
        pl.itemsInBody.clear();
        pl.passiveItemId = "";
        pl.xp = 0;
        pl.survivorLevel = 1;
        pl.gold = 0;
        pl.maxHp = playerMaxHp(pl);
        pl.hp = pl.maxHp; pl.isGhost = false;
      });
      room.clearRunEconomy();
    }
    if (msg.action === "tpHub") room.returnToHub();
    if (msg.action === "tpArena") room.enterArena();
  });

  room.onMessage("activate_portal", (client) => {
    try {
      if (room.state.phase !== "arena") return;
      if (room.state.portalActive) return;
      const p0 = room.state.players.get(client.sessionId);
      if (!p0 || p0.isGhost || p0.hp <= 0) return;
      const dx = p0.pos.x - room.state.portalX;
      const dz = p0.pos.z - room.state.portalZ;
      if (dx * dx + dz * dz > PORTAL_INTERACT_RANGE * PORTAL_INTERACT_RANGE) return;
      room.state.portalActive = true;
      room.state.portalCharge = 0;
      room.spawnWaveOfType("GROUND_CRAWLER", 6);
      room.spawnWaveOfType("CACO", 3);
      room.spawnColossus();
      room.broadcast("fx", { type: "portal_activated", x: room.state.portalX, y: 0, z: room.state.portalZ });
      room.broadcast("chat", { name: "система", text: "телепорт зажжён — держите зону 90 секунд, босс телепорта уже здесь", id: "" });
    } catch (err) {
      console.error("[room] activate_portal", err);
    }
  });

  room.onMessage("hub_take", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    if (room.state.phase !== "hub") return;
    if (msg.source === "slot") {
      const slot = room.state.hubSlots[msg.index];
      if (!slot || slot.empty) return;
      if (slot.kind !== "ITEM") {
        slot.kind = ""; slot.handType = ""; slot.itemId = ""; slot.empty = true;
        return;
      }
      room.grantToPlayer(p, slot.kind, slot.handType, slot.itemId);
      slot.kind = ""; slot.handType = ""; slot.itemId = ""; slot.empty = true;
    } else if (msg.source === "chest") {
      const chest = room.state.hubChests[msg.index];
      if (!chest || chest.contents.length === 0) return;
      const idx = Math.max(0, Math.min(chest.contents.length - 1, msg.item | 0));
      const raw = chest.contents[idx];
      const [kind, val] = String(raw).split(":");
      if (kind !== "ITEM") {
        chest.contents.splice(idx, 1);
        return;
      }
      room.grantToPlayer(p, "ITEM", "", val || "");
      chest.contents.splice(idx, 1);
    }
  });

  room.onMessage("hub_put", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    if (room.state.phase !== "hub") return;
    const slot = room.state.hubSlots[msg.index];
    if (!slot || !slot.empty) return;
    const what = String(msg.what || "");
    if ((what === "item" || what === "passive") && p.itemsInBody.length > 0) {
      const it = p.itemsInBody.pop();
      p.passiveItemId = p.itemsInBody[0] || "";
      room.refreshItemHp(p);
      slot.kind = "ITEM"; slot.handType = ""; slot.itemId = it; slot.empty = false;
    }
  });

  room.onMessage("hub_go_arena", () => {
    if (room.state.phase !== "hub") return;
    room.enterArena();
  });

  room.onMessage("hub_put_chest", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    if (room.state.phase !== "hub") return;
    const chest = room.state.hubChests[msg.index | 0];
    if (!chest) return;
    if (chest.contents.length >= 24) return;
    const what = String(msg.what || "");
    if ((what === "item" || what === "passive") && p.itemsInBody.length > 0) {
      const it = p.itemsInBody.pop();
      p.passiveItemId = p.itemsInBody[0] || "";
      room.refreshItemHp(p);
      chest.contents.push("ITEM:" + it);
    }
  });

  room.onMessage("hub_reforge", () => {});

  room.onMessage("chat", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    const text = String(msg?.text || "").slice(0, 200);
    if (!text.trim()) return;
    room.broadcast("chat", { name: p.name || "?", text, id: client.sessionId });
  });

  room.onMessage("phase", (_c, msg) => {
    if (msg?.phase === "hub") room.returnToHub();
    else if (msg?.phase === "arena") room.enterArena();
  });
  room.onMessage("return_hub", () => room.returnToHub());
  room.onMessage("enter_arena", () => room.enterArena());
  room.onMessage("next_stage", () => room.nextStage());
  room.onMessage("loop_run", () => room.loopRun());
  room.onMessage("leave_bazaar", () => room.leaveBazaar());
  room.onMessage("equipment", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (!p || p.isGhost || p.hp <= 0) return;
    if (room.state.phase === "hub") return;
    const now = Date.now() / 1000;
    if (now < (p.equipCdUntil || 0)) return;
    const eqId = p.equipmentId || "HEAL";
    const eq = EQUIPMENT[eqId] || EQUIPMENT.HEAL;
    p.equipCdUntil = now + (eq.cd || RUN.EQUIP_CD_S || 15);
    if (eqId === "MISSILE") {
      const dmg = (eq.damage || 48) * playerDamageMult(p);
      const r = eq.radius || 7;
      room.state.enemies.forEach((e) => {
        if (!e.alive) return;
        const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y, dz = e.pos.z - p.pos.z;
        if (dx * dx + dy * dy + dz * dz <= r * r) room.damageEnemy(e, dmg);
      });
      room.broadcast("fx", { type: "equip_missile", target: client.sessionId, x: p.pos.x, y: p.pos.y, z: p.pos.z, r });
      return;
    }
    if (eqId === "PHASE") {
      p._phaseUntil = now + (eq.duration || 2.2);
      room.broadcast("fx", { type: "equip_phase", target: client.sessionId, x: p.pos.x, y: p.pos.y, z: p.pos.z, duration: eq.duration || 2.2 });
      return;
    }
    const heal = eq.heal || RUN.EQUIP_HEAL || 30;
    p.hp = Math.min(p.maxHp, p.hp + heal);
    room.broadcast("fx", { type: "equip_heal", target: client.sessionId, x: p.pos.x, y: p.pos.y, z: p.pos.z, heal });
  });
  room.onMessage("ping", (client, msg) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    const x = typeof msg?.x === "number" ? msg.x : p.pos.x;
    const y = typeof msg?.y === "number" ? msg.y : p.pos.y;
    const z = typeof msg?.z === "number" ? msg.z : p.pos.z;
    room.broadcast("fx", { type: "ping", name: p.name || "?", x, y, z });
  });
}
