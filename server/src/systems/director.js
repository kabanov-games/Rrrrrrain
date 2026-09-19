import { ENEMY_TYPES, AI_DIRECTOR, GROUND_CRAWLER_VARIANTS, COMBAT, RUN, pickRandom } from "../../../shared/index.js";
import { Enemy } from "../schema.js";
import { ENEMY_GRACE_SEC, MELEE_RANGE, ATTACK_COOLDOWN, MAX_ALIVE_ENEMIES, MIN_ALIVE_ENEMIES, FLY_STANDOFF } from "./constants.js";
import { damagePlayer } from "./combat.js";

export function getPlayerFrontAngle(room) {
  let sumX = 0, sumZ = 0, n = 0;
  room.state.players.forEach(p => {
    if (p.isGhost) return;
    sumX += Math.sin(p.yaw || 0);
    sumZ += Math.cos(p.yaw || 0);
    n++;
  });
  if (n === 0) return 0;
  return Math.atan2(sumX, sumZ);
}

export function applyElite(room, e, typeId) {
  const t = ENEMY_TYPES[typeId];
  if (!e || !t || t.boss) return;
  const chance = (RUN.ELITE_CHANCE || 0.08) * Math.min(2.5, room.dmul());
  if (Math.random() > chance) {
    e.elite = "";
    return;
  }
  e.elite = pickRandom(["fire", "ice", "lightning"]);
  e.hp = Math.max(1, Math.round(e.hp * 2.2));
  e.maxHp = e.hp;
}

function fillEnemyStats(room, e, typeId) {
  const t = ENEMY_TYPES[typeId];
  let baseHp = t.hp;
  if (typeof baseHp !== "number" || baseHp < 5) {
    baseHp = t.armored ? COMBAT.ARMORED_ENEMY_MAX_HP : COMBAT.ENEMY_MAX_HP;
  }
  if (typeId === "GROUND_CRAWLER") {
    const v = Math.floor(Math.random() * GROUND_CRAWLER_VARIANTS.length);
    const vv = GROUND_CRAWLER_VARIANTS[v];
    e.variant = v;
    baseHp = Math.round(baseHp * (vv.hpMul || 1));
  }
  e.hp = Math.max(1, Math.round(baseHp * room.dmul()));
  e.maxHp = e.hp;
  e.spawnedAt = Date.now() / 1000;
  e._grace = ENEMY_GRACE_SEC;
  applyElite(room, e, typeId);
}

export function addEnemyAt(room, typeId, angle) {
  const t = ENEMY_TYPES[typeId]; if (!t) return;
  const e = new Enemy();
  e.enemyType = typeId;
  const r = 62 + Math.random() * 32;
  e.pos.x = Math.sin(angle) * r;
  e.pos.z = Math.cos(angle) * r;
  e._homeX = e.pos.x;
  e._homeZ = e.pos.z;
  if (t.flying) {
    e._hoverY = 10 + Math.random() * 16;
    e.pos.y = e._hoverY;
    e.state = "patrol";
  } else {
    e.pos.y = 1;
    e.state = "patrol";
  }
  fillEnemyStats(room, e, typeId);
  const id = `e${++room.enemySeq}`;
  room.state.enemies.set(id, e);
  room.broadcast("fx", { type: "enemy_spawn", x: e.pos.x, y: e.pos.y, z: e.pos.z, kind: typeId, variant: e.variant, elite: e.elite });
  return id;
}

export function addEnemyNear(room, typeId, x, z) {
  const t = ENEMY_TYPES[typeId]; if (!t) return;
  const ang = Math.random() * Math.PI * 2;
  const dist = 7 + Math.random() * 6;
  const e = new Enemy();
  e.enemyType = typeId;
  e.pos.x = (x || 0) + Math.sin(ang) * dist;
  e.pos.z = (z || 0) + Math.cos(ang) * dist;
  e.pos.y = t.flying ? (10 + Math.random() * 8) : 1;
  e._homeX = e.pos.x;
  e._homeZ = e.pos.z;
  e._hoverY = e.pos.y;
  e.state = "patrol";
  fillEnemyStats(room, e, typeId);
  const id = `e${++room.enemySeq}`;
  room.state.enemies.set(id, e);
  room.broadcast("fx", { type: "enemy_spawn", x: e.pos.x, y: e.pos.y, z: e.pos.z, kind: typeId, variant: e.variant, elite: e.elite });
  return id;
}

export function spawnWaveOfType(room, typeId, count) {
  const frontAngle = getPlayerFrontAngle(room);
  const mul = (room.state.dbgSpawnMul == null ? 1 : room.state.dbgSpawnMul) * room.cardSpawnMul();
  const finalCount = Math.max(0, Math.round(count * mul));
  for (let i = 0; i < finalCount; i++) {
    const spread = (Math.random() - 0.5) * (Math.PI * 2 / 3);
    addEnemyAt(room, typeId, frontAngle + spread);
  }
}

export function spawnColossus(room) {
  const id = addEnemyAt(room, "COLOSSUS", getPlayerFrontAngle(room));
  const e = room.state.enemies.get(id);
  if (e) { e.hp = ENEMY_TYPES.COLOSSUS.hp; e.maxHp = e.hp; }
}

export function aiDirectorSpawnWave(room) {
  const size = Math.round(
    (AI_DIRECTOR.WAVE_MIN_SIZE + Math.floor(Math.random() * (AI_DIRECTOR.WAVE_MAX_SIZE - AI_DIRECTOR.WAVE_MIN_SIZE + 1)))
    * room.cardSpawnMul()
    * Math.min(2.4, room.dmul())
  );
  const frontAngle = getPlayerFrontAngle(room) + (Math.random() - 0.5) * 1.2;
  const pool = [
    { id: "GROUND_CRAWLER", w: 0.42 },
    { id: "CACO", w: 0.33 },
    { id: "FLYING_SHOOTER", w: 0.25 },
  ];
  for (let i = 0; i < size; i++) {
    const roll = Math.random();
    let acc = 0, chosen = pool[0].id;
    for (const c of pool) { acc += c.w; if (roll < acc) { chosen = c.id; break; } }
    const cost = AI_DIRECTOR.COSTS[chosen] || 50;
    if (room.state.aiBudget < cost) break;
    room.state.aiBudget -= cost;
    const spread = (Math.random() - 0.5) * (Math.PI * 2 / 3);
    addEnemyAt(room, chosen, frontAngle + spread);
  }
}

export function tickEnemies(room, dt) {
  room.state.enemies.forEach((e, eid) => {
    if (!e.alive) {
      if (e.corpseUntil && Date.now() / 1000 > e.corpseUntil) {
        room.state.enemies.delete(eid);
      }
      return;
    }
    if (e._grace > 0) e._grace -= dt;
    if (e.state === "emerging") {
      if (Date.now() / 1000 < e.emergeUntil) {
        e.pos.y = Math.min(1, e.pos.y + dt * 1.5);
        return;
      } else {
        e.state = "aggro"; e.pos.y = 1;
      }
    }
    const t = ENEMY_TYPES[e.enemyType];
    if (!t) return;
    let nearest = null, nd = Infinity, nid = "";
    room.state.players.forEach((p, sid) => {
      if (p.isGhost || p.hp <= 0) return;
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nd) { nd = d2; nearest = p; nid = sid; }
    });
    if (!nearest) return;
    const vis = AI_DIRECTOR.VISION_RANGE || 34;
    const leash = AI_DIRECTOR.LEASH_RANGE || 48;
    const dist = Math.sqrt(nd);
    const inVision = dist <= vis;
    if (!inVision) {
      e.state = "patrol";
      e.targetId = "";
      if (e._patrolAng == null) e._patrolAng = Math.random() * Math.PI * 2;
      e._patrolAng += dt * 0.45;
      const hx = e._homeX ?? e.pos.x, hz = e._homeZ ?? e.pos.z;
      const homePull = dist > leash ? 0.7 : 0.35;
      const prx = hx + Math.sin(e._patrolAng) * 8;
      const prz = hz + Math.cos(e._patrolAng) * 8;
      const pdx = prx - e.pos.x, pdz = prz - e.pos.z;
      const pd = Math.max(0.001, Math.hypot(pdx, pdz));
      const speedP = (t.speed || 3) * homePull;
      e.pos.x += (pdx / pd) * speedP * dt;
      e.pos.z += (pdz / pd) * speedP * dt;
      if (t.flying) {
        const targetY = (e._hoverY || t.hoverY || 10) + Math.sin(Date.now() * 0.001 + e._patrolAng) * 0.8;
        e.pos.y += (targetY - e.pos.y) * dt * 2;
      }
      return;
    }
    e.state = "aggro";
    e.targetId = nid;

    const dx = nearest.pos.x - e.pos.x;
    const dz = nearest.pos.z - e.pos.z;
    const horizD = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));

    let moveX = 0, moveZ = 0;
    if (t.flying) {
      if (horizD > FLY_STANDOFF + 0.5) {
        moveX = (dx / horizD) * t.speed * dt;
        moveZ = (dz / horizD) * t.speed * dt;
      } else if (horizD < FLY_STANDOFF - 0.5) {
        let awayX = -dx / horizD, awayZ = -dz / horizD;
        if (horizD < 0.6) {
          if (e._escapeAng == null) e._escapeAng = Math.random() * Math.PI * 2;
          awayX = Math.sin(e._escapeAng);
          awayZ = Math.cos(e._escapeAng);
        } else {
          e._escapeAng = null;
        }
        moveX = awayX * t.speed * dt;
        moveZ = awayZ * t.speed * dt;
      } else {
        if (e._orbitDir == null) e._orbitDir = Math.random() < 0.5 ? 1 : -1;
        const perpX = -dz / horizD * e._orbitDir;
        const perpZ = dx / horizD * e._orbitDir;
        moveX = perpX * t.speed * dt;
        moveZ = perpZ * t.speed * dt;
      }
    } else {
      moveX = (dx / horizD) * t.speed * dt;
      moveZ = (dz / horizD) * t.speed * dt;
    }
    if (t.flying) {
      const targetY = (e._hoverY || t.hoverY || 10) + Math.sin(Date.now() * 0.001 + e._grace) * 0.7;
      e.pos.y += (targetY - e.pos.y) * dt * 2;
    } else {
      e.pos.y = 1;
    }
    e.pos.x += moveX;
    e.pos.z += moveZ;

    if (t.fireCount && e._grace <= 0) {
      e._fireCd = (e._fireCd || 0) - dt;
      e._burstIdx = e._burstIdx || 0;
      e._burstCount = e._burstCount || 0;
      if (e._fireCd <= 0 && horizD < t.engageRange) {
        if (e._burstIdx >= e._burstCount) {
          e._burstCount = 1 + Math.floor(Math.random() * t.fireCount);
          e._burstIdx = 0;
        }
        const px = nearest.pos.x, py = nearest.pos.y + 1.15, pz = nearest.pos.z;
        const dxF = px - e.pos.x, dyF = py - e.pos.y, dzF = pz - e.pos.z;
        const dL = Math.max(0.001, Math.sqrt(dxF * dxF + dyF * dyF + dzF * dzF));
        const ux = dxF / dL, uy = dyF / dL, uz = dzF / dL;
        const spread = t.fireSpread || 0.14;
        const rx = (Math.random() - 0.5) * spread;
        const ry = (Math.random() - 0.5) * spread * 0.6;
        const rz = (Math.random() - 0.5) * spread;
        let sx = ux + rx, sy = uy + ry, sz = uz + rz;
        const sL = Math.max(0.001, Math.hypot(sx, sy, sz));
        sx /= sL; sy /= sL; sz /= sL;
        const spawnOff = (t.size || 1.5) + 1.1;
        room.projectiles.push({
          ownerId: eid,
          enemyProjectile: true,
          x: e.pos.x + sx * spawnOff, y: e.pos.y + sy * spawnOff, z: e.pos.z + sz * spawnOff,
          vx: sx * t.fireSpeed, vy: sy * t.fireSpeed, vz: sz * t.fireSpeed,
          life: t.fireLife || 11.4, damage: t.fireDamage, radius: 0.75, color: 0xff2a12,
        });
        room.broadcast("fx", {
          type: "caco_shoot",
          x: e.pos.x + sx * spawnOff, y: e.pos.y + sy * spawnOff, z: e.pos.z + sz * spawnOff,
          tx: e.pos.x + sx * 80, ty: e.pos.y + sy * 80, tz: e.pos.z + sz * 80,
          color: 0xff5a1f,
        });
        e._burstIdx++;
        e._fireCd = e._burstIdx < e._burstCount ? t.fireCooldown : (2.0 + Math.random() * 1.5);
      }
      return;
    }

    const canAttack = horizD < MELEE_RANGE + t.size * 0.3
      && (!t.flying || Math.abs(nearest.pos.y - e.pos.y) < 3)
      && e._grace <= 0;
    if (canAttack) {
      e._atkCd = (e._atkCd || 0) - dt;
      if (e._atkCd <= 0) {
        e._atkCd = ATTACK_COOLDOWN;
        damagePlayer(room, nearest, t.damage, nid, e.pos.x, e.pos.z);
      }
    }
  });
}

export function tickDirector(room, dt) {
  if (room.state.phase !== "arena" && room.state.phase !== "portal_ready") return;
  room.state.runTimeSec = (room.state.runTimeSec || 0) + dt;
  if (room.state.portalActive && room.state.portalCharge < room.state.portalTarget) {
    room.state.portalCharge = Math.min(room.state.portalTarget, room.state.portalCharge + dt);
    if (room.state.portalCharge >= room.state.portalTarget && room.state.phase === "arena") {
      room.state.phase = "portal_ready";
      room.broadcast("fx", { type: "portal_ready" });
    }
  }
  room.state.aiBudget = Math.min(AI_DIRECTOR.BUDGET_START,
    (room.state.aiBudget || 0) + AI_DIRECTOR.BUDGET_REGEN_PER_SEC * dt);
  let aliveCount = 0;
  room.state.enemies.forEach(e => { if (e.alive) aliveCount++; });
  const nowT = Date.now() / 1000;
  const forceWave = aliveCount < MIN_ALIVE_ENEMIES && room.state.aiBudget > 30;
  if ((forceWave || nowT >= (room.state.aiNextWaveAt || 0)) && aliveCount < MAX_ALIVE_ENEMIES && room.state.aiBudget > 30) {
    aiDirectorSpawnWave(room);
    const interval = AI_DIRECTOR.WAVE_INTERVAL_MIN + Math.random() * (AI_DIRECTOR.WAVE_INTERVAL_MAX - AI_DIRECTOR.WAVE_INTERVAL_MIN);
    room.state.aiNextWaveAt = nowT + interval;
  }
}
