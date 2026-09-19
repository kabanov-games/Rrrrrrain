import { COMBAT, ENEMY_TYPES, ITEMS_BY_ID, SPELLS, AI_DIRECTOR, RUN, sumItemStat } from "../../../shared/index.js";
import { playerDamageMult } from "./stats.js";

export function nearestEnemy(room, origin, maxR, dir = null, minDot = null) {
  let best = null, bd = maxR * maxR, bid = "";
  const dl = dir ? (Math.hypot(dir.x, dir.y, dir.z) || 1) : 1;
  room.state.enemies.forEach((e, id) => {
    if (!e.alive) return;
    const dx = e.pos.x - origin.x, dy = e.pos.y - origin.y, dz = e.pos.z - origin.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= bd || d2 < 0.04) return;
    if (dir && minDot != null) {
      const dist = Math.sqrt(d2) || 1;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (dist * dl);
      if (dot < minDot) return;
    }
    bd = d2; best = e; bid = id;
  });
  return best ? { e: best, id: bid } : null;
}

export function hitscanEnemy(room, origin, dir, range, tube) {
  let best = null, bestT = range;
  const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const ux = dir.x / dl, uy = dir.y / dl, uz = dir.z / dl;
  room.state.enemies.forEach(e => {
    if (!e.alive) return;
    const vx = e.pos.x - origin.x, vy = e.pos.y - origin.y, vz = e.pos.z - origin.z;
    const t = vx * ux + vy * uy + vz * uz;
    if (t < 0.2 || t > range) return;
    const px = origin.x + ux * t, py = origin.y + uy * t, pz = origin.z + uz * t;
    const rad = tube + (ENEMY_TYPES[e.enemyType]?.size || 1);
    const dx = e.pos.x - px, dy = e.pos.y - py, dz = e.pos.z - pz;
    if (dx * dx + dy * dy + dz * dz <= rad * rad && t < bestT) { bestT = t; best = e; }
  });
  return best;
}

export function pickStarfallImpact(room, origin, dir, spell) {
  const range = spell.range || 15;
  const tube = spell.aimTube || 2.8;
  const len = Math.hypot(dir.x || 0, dir.y || 0, dir.z || 0) || 1;
  const dx = dir.x / len, dy = dir.y / len, dz = dir.z / len;
  let bestT = Infinity;
  let best = null;
  room.state.enemies.forEach(e => {
    if (!e.alive) return;
    const vx = e.pos.x - origin.x, vy = e.pos.y - origin.y, vz = e.pos.z - origin.z;
    const t = vx * dx + vy * dy + vz * dz;
    if (t < 0.2 || t > range) return;
    const px = origin.x + dx * t, py = origin.y + dy * t, pz = origin.z + dz * t;
    const dist = Math.hypot(e.pos.x - px, e.pos.y - py, e.pos.z - pz);
    const hitR = tube + (ENEMY_TYPES[e.enemyType]?.size || 1) * 0.5;
    if (dist <= hitR && t < bestT) {
      bestT = t;
      best = { x: e.pos.x, y: e.pos.y, z: e.pos.z, lock: true };
    }
  });
  if (best) return best;
  const groundY = 1.0;
  if (dy < -0.02) {
    const tG = (groundY - origin.y) / dy;
    if (tG > 0.15 && tG <= range) {
      return { x: origin.x + dx * tG, y: groundY, z: origin.z + dz * tG, lock: false };
    }
  }
  const tFar = Math.min(range, 8);
  return { x: origin.x + dx * tFar, y: groundY, z: origin.z + dz * tFar, lock: false };
}

export function spawnHoming(room, ownerId, origin, dir, spell, damage, tgt) {
  let vx = dir.x, vy = dir.y, vz = dir.z;
  const sp = spell.projectileSpeed || 32;
  if (tgt && tgt.e) {
    const dx = tgt.e.pos.x - origin.x, dy = tgt.e.pos.y - origin.y, dz = tgt.e.pos.z - origin.z;
    const L = Math.max(0.001, Math.hypot(dx, dy, dz));
    vx = dx / L; vy = dy / L; vz = dz / L;
  }
  room.projectiles.push({
    ownerId, homing: true, targetId: tgt ? tgt.id : "",
    visRange: spell.visRange || 100,
    x: origin.x, y: origin.y, z: origin.z,
    vx: vx * sp, vy: vy * sp, vz: vz * sp,
    life: spell.life || 4, damage, radius: spell.radius || 0.5, color: spell.color,
  });
  const kind = spell.isDaggerThrow ? "dagger" : "star";
  room.broadcast("fx", {
    type: "homing", x: origin.x, y: origin.y, z: origin.z,
    color: spell.color, dx: vx, dy: vy, dz: vz,
    kind, star: kind === "star",
    targetId: tgt ? tgt.id : "",
  });
}

export function throwDaggers(room, p, sid, origin, dir, spell, dmgMult) {
  const n = Math.max(1, p.daggerCount | 0);
  const vis = spell.visRange || 100;
  const vis2 = vis * vis;
  const dmg = spell.damage * dmgMult;
  const list = [];
  room.state.enemies.forEach((e, id) => {
    if (!e.alive) return;
    const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > vis2) return;
    list.push({ e, id, d2, hp: e.hp });
  });
  list.sort((a, b) => a.d2 - b.d2);
  let left = n;
  const assign = [];
  for (const t of list) {
    if (left <= 0) break;
    const need = Math.max(1, Math.ceil(t.hp / Math.max(1, dmg)));
    const take = Math.min(need, left);
    assign.push({ t, take });
    left -= take;
  }
  while (left > 0 && assign.length > 1) {
    for (let i = 1; i < assign.length && left > 0; i++) {
      assign[i].take++;
      left--;
    }
    if (assign.length <= 1) break;
  }
  for (const a of assign) {
    for (let i = 0; i < a.take; i++) {
      spawnHoming(room, sid, origin, dir || { x: 0, y: 0, z: 1 }, spell, dmg, { e: a.t.e, id: a.t.id });
    }
  }
  while (left > 0) {
    spawnHoming(room, sid, origin, dir || { x: 0, y: 0, z: 1 }, spell, dmg, null);
    left--;
  }
  p.daggerCount = 1;
}

export function castChainStorm(room, origin, dir, spell, dmgMult) {
  let firstEnemy = null, firstDist = Infinity;
  const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const ux = dir.x / dl, uy = dir.y / dl, uz = dir.z / dl;
  room.state.enemies.forEach(e => {
    if (!e.alive) return;
    const dx = e.pos.x - origin.x, dy = e.pos.y - origin.y, dz = e.pos.z - origin.z;
    const dist2 = dx * dx + dy * dy + dz * dz;
    if (dist2 > spell.initialRange * spell.initialRange) return;
    const dist = Math.sqrt(dist2);
    const dot = (dx * ux + dy * uy + dz * uz) / (dist || 1);
    if (dot < (spell.initialConeCos || 0.7)) return;
    if (dist < firstDist) { firstDist = dist; firstEnemy = e; }
  });
  if (!firstEnemy) return;
  const hitIds = new Set();
  const chain = [{ x: origin.x, y: origin.y, z: origin.z }];
  let cur = firstEnemy;
  let dmg = spell.damage * dmgMult;
  const step = spell.damageStep || 10;
  for (let jump = 0; jump < (spell.maxJumps || 10); jump++) {
    damageEnemy(room, cur, dmg);
    hitIds.add(cur);
    chain.push({ x: cur.pos.x, y: cur.pos.y, z: cur.pos.z });
    let next = null, nd = Infinity;
    room.state.enemies.forEach(e => {
      if (!e.alive || hitIds.has(e)) return;
      const dx = e.pos.x - cur.pos.x, dy = e.pos.y - cur.pos.y, dz = e.pos.z - cur.pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > spell.jumpRange * spell.jumpRange) return;
      if (d2 < nd) { nd = d2; next = e; }
    });
    if (!next) break;
    cur = next;
    dmg = Math.max(10, dmg - step * dmgMult);
  }
  room.broadcast("fx", { type: "chain", color: spell.color, points: chain });
}

export function consumeExtraLife(room, p) {
  if (!p || !p.itemsInBody) return false;
  const arr = [...p.itemsInBody];
  const idx = arr.findIndex((id) => ITEMS_BY_ID[id] && ITEMS_BY_ID[id].extraLife);
  if (idx < 0) return false;
  p.itemsInBody.splice(idx, 1);
  p.passiveItemId = p.itemsInBody[0] || "";
  room.refreshItemHp(p);
  p.hp = p.maxHp;
  p.isGhost = false;
  return true;
}

export function damageEnemy(room, e, dmg) {
  if (!e.alive) return;
  const actualDmg = dmg * (room.state.dbgDamageMul || 1);
  e.hp -= actualDmg;
  room.broadcast("fx", { type: "hit_enemy", x: e.pos.x, y: e.pos.y, z: e.pos.z, dmg: actualDmg });
  if (e.hp <= 0) {
    e.alive = false;
    room.broadcast("fx", { type: "enemy_die", x: e.pos.x, y: e.pos.y, z: e.pos.z, kind: e.enemyType, elite: e.elite });
    e.state = "dying";
    e.corpseUntil = Date.now() / 1000 + AI_DIRECTOR.CORPSE_LINGER_S;
    room.grantKillRewards();
    if (Math.random() < (RUN.LUNAR_DROP || 0)) {
      room.state.players.forEach((p) => {
        if (p.isGhost || p.hp <= 0) return;
        p.lunarShards = (p.lunarShards || 0) + 1;
      });
      room.broadcast("chat", { name: "система", text: "редкий дроп — лунная монета", id: "" });
    }
  }
}

export function damagePlayer(room, p, dmg, sessionId, fromX = 0, fromZ = 0) {
  if (p.hp <= 0 || p.isGhost) return;
  if (room.state.dbgGodMode) return;
  if (room.state.phase !== "arena" && room.state.phase !== "portal_ready") return;
  const nowSec = Date.now() / 1000;
  if ((p._phaseUntil || 0) > nowSec) return;
  if ((p._stealthUntil || 0) > nowSec) return;
  if ((p.blockAbsorbLeft || 0) > 0) {
    const absorb = Math.min(p.blockAbsorbLeft, dmg);
    p.blockAbsorbLeft -= absorb;
    dmg -= absorb;
    room.broadcast("fx", { type: "block_absorb", target: sessionId, absorb, left: p.blockAbsorbLeft });
    if (p.blockAbsorbLeft <= 0) { p.blockActiveUntil = 0; p.blockAbsorbLeft = 0; }
    if (dmg <= 0) return;
  }
  const armor = Math.max(0, sumItemStat(p, "armor"));
  if (armor > 0) dmg *= 100 / (100 + armor);
  p.hp -= dmg;
  p._lastDmgAt = Date.now();
  if (sumItemStat(p, "stealth") > 0) {
    p._stealthUntil = nowSec + 1.5;
    room.broadcast("fx", { type: "stealth", target: sessionId });
  }
  if (p.hp < 1) {
    if (consumeExtraLife(room, p)) {
      room.broadcast("fx", { type: "dio", target: sessionId });
      room.broadcast("chat", { name: "система", text: `${p.name || "игрок"} воскрес (Дио)`, id: "" });
      return;
    }
    p.hp = 0;
    let alive = 0;
    room.state.players.forEach((pl) => {
      if (!pl.isGhost && pl.hp >= 1) alive++;
    });
    if (alive > 0) {
      p.isGhost = true;
      room.broadcast("fx", { type: "death", target: sessionId });
    } else {
      room.broadcast("fx", { type: "death", target: sessionId });
      room.wipeToHub();
    }
  } else {
    room.broadcast("fx", { type: "hurt", target: sessionId, fromX, fromZ });
  }
}

export function tickFriendlyProjectiles(room, dt) {
  for (let i = room.projectiles.length - 1; i >= 0; i--) {
    const pr = room.projectiles[i];
    if (!pr) { room.projectiles.splice(i, 1); continue; }
    if (pr.homing && !pr.enemyProjectile) {
      let te = pr.targetId ? room.state.enemies.get(pr.targetId) : null;
      if (!te || !te.alive) {
        const n = nearestEnemy(room, pr, pr.visRange || 100);
        te = n ? n.e : null;
        pr.targetId = n ? n.id : "";
      }
      if (te) {
        const dx = te.pos.x - pr.x, dy = te.pos.y - pr.y, dz = te.pos.z - pr.z;
        const L = Math.max(0.001, Math.hypot(dx, dy, dz));
        const sp = Math.hypot(pr.vx, pr.vy, pr.vz) || 32;
        const ux = dx / L, uy = dy / L, uz = dz / L;
        pr.vx = pr.vx * 0.72 + ux * sp * 0.28;
        pr.vy = pr.vy * 0.72 + uy * sp * 0.28;
        pr.vz = pr.vz * 0.72 + uz * sp * 0.28;
        const ns = Math.hypot(pr.vx, pr.vy, pr.vz) || 1;
        pr.vx = pr.vx / ns * sp; pr.vy = pr.vy / ns * sp; pr.vz = pr.vz / ns * sp;
      }
    }
    pr.life -= dt;
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt;
    if (pr.enemyProjectile) {
      if (pr.life <= 0) room.projectiles.splice(i, 1);
      continue;
    }
    let hit = false;
    room.state.enemies.forEach(e => {
      if (hit || !e.alive) return;
      const dx = e.pos.x - pr.x, dy = e.pos.y - pr.y, dz = e.pos.z - pr.z;
      const r = pr.radius + (ENEMY_TYPES[e.enemyType]?.size || 1);
      if (dx * dx + dy * dy + dz * dz <= r * r) { damageEnemy(room, e, pr.damage); hit = true; }
    });
    if (hit || pr.life <= 0) room.projectiles.splice(i, 1);
  }
}

export function tickEnemyProjectiles(room) {
  for (let i = room.projectiles.length - 1; i >= 0; i--) {
    const pr = room.projectiles[i];
    if (!pr || !pr.enemyProjectile) continue;
    let hitAny = false;
    room.state.players.forEach((pl, sid) => {
      if (hitAny || pl.isGhost || pl.hp <= 0) return;
      const dx = pl.pos.x - pr.x, dy = pl.pos.y - pr.y, dz = pl.pos.z - pr.z;
      const r = pr.radius + 0.8;
      if (dx * dx + dy * dy + dz * dz <= r * r) {
        damagePlayer(room, pl, pr.damage, sid, pr.x, pr.z);
        hitAny = true;
      }
    });
    if (hitAny) room.projectiles.splice(i, 1);
  }
}

export function tickRegen(room, dt) {
  const nowMs = Date.now();
  room.state.players.forEach(p => {
    if (p.isGhost || p.hp <= 0 || p.hp >= p.maxHp) return;
    const last = p._lastDmgAt || 0;
    if (nowMs - last < (COMBAT.REGEN_DELAY_S || 3) * 1000) return;
    p._regenAcc = (p._regenAcc || 0) + dt;
    if (p._regenAcc >= 1.0) {
      p._regenAcc -= 1.0;
      const lv = Math.max(1, p.survivorLevel || 1);
      const regen = (COMBAT.REGEN_PER_S || 5) * 0.2 + (lv - 1) * 0.12 + sumItemStat(p, "regen");
      p.hp = Math.min(p.maxHp, p.hp + Math.max(0.2, regen));
    }
  });
}

export function tickDrones(room, dt) {
  if (room.state.phase !== "arena" && room.state.phase !== "portal_ready") return;
  room.state.players.forEach((p, sid) => {
    const n = p.droneCount || 0;
    if (n <= 0 || p.isGhost || p.hp <= 0) return;
    p._droneAcc = (p._droneAcc || 0) + dt;
    const interval = Math.max(0.28, 0.85 / n);
    if (p._droneAcc < interval) return;
    p._droneAcc = 0;
    const hit = nearestEnemy(room, p.pos, 32);
    if (!hit) return;
    damageEnemy(room, hit.e, 7 * playerDamageMult(p));
    room.broadcast("fx", {
      type: "drone_shot", target: sid,
      x: p.pos.x, y: (p.pos.y || 1.6) + 1.4, z: p.pos.z,
      tx: hit.e.pos.x, ty: hit.e.pos.y, tz: hit.e.pos.z,
    });
  });
}

export function handleCast(room, client, msg) {
  const p = room.state.players.get(client.sessionId);
  if (!p || p.hp <= 0 || p.isGhost) return;
  const spellId = msg.spell;
  const spell = SPELLS[spellId];
  if (!spell) return;
  const combatPhase = room.state.phase === "arena" || room.state.phase === "portal_ready";
  if (!spell.isCosmetic && !combatPhase) return;
  const kit = room.survivorKit();
  if (spellId !== kit.lmb && spellId !== kit.rmb && spellId !== kit.special) return;
  const isRmb = kit.rmb === spellId;
  const isSpec = kit.special === spellId;
  const now = Date.now() / 1000;
  const cdField = isSpec ? "specCdUntil" : (isRmb ? "rmbCdUntil" : "lmbCdUntil");
  if (now < (p[cdField] || 0)) return;

  let dmgMult = (p.isGhost ? COMBAT.GHOST_STAT_MULT : 1) * playerDamageMult(p);
  if (Math.random() < Math.min(0.75, sumItemStat(p, "crit"))) dmgMult *= 2;
  const origin = {
    x: typeof msg.ox === "number" ? msg.ox : p.pos.x,
    y: typeof msg.oy === "number" ? msg.oy : p.pos.y,
    z: typeof msg.oz === "number" ? msg.oz : p.pos.z,
  };
  const dir = { x: msg.dx || 0, y: msg.dy || 0, z: msg.dz || 0 };

  if (spell.isCosmetic) {
    p[cdField] = now + (spell.cooldown || 0.8);
    room.broadcast("fx", { type: spell.fx || "cig_puff", target: client.sessionId, x: origin.x, y: origin.y, z: origin.z, color: spell.color });
    return;
  }
  if (spell.isDaggerCharge) return;
  if (spell.isShield) {
    p.blockAbsorbLeft = spell.absorb;
    p.blockActiveUntil = 1e15;
    p[cdField] = now + (spell.cooldown || 2);
    room.broadcast("fx", {
      type: "star_shield", target: client.sessionId, absorb: spell.absorb,
      x: origin.x, y: origin.y, z: origin.z, color: spell.color,
    });
    return;
  }
  if (spell.isHitscan) {
    p[cdField] = now + (spell.cooldown || 0.45);
    const hit = hitscanEnemy(room, origin, dir, spell.range || 100, spell.tube || 0.55);
    if (hit) damageEnemy(room, hit, spell.damage * dmgMult);
    const len = spell.range || 80;
    room.broadcast("fx", {
      type: "hitscan", color: spell.color,
      x: origin.x, y: origin.y, z: origin.z,
      tx: origin.x + dir.x * len, ty: origin.y + dir.y * len, tz: origin.z + dir.z * len,
      hx: hit ? hit.pos.x : null, hy: hit ? hit.pos.y : null, hz: hit ? hit.pos.z : null,
    });
    return;
  }
  if (spell.isChainStorm || spell.isChain) {
    p[cdField] = now + (spell.cooldown || 30);
    castChainStorm(room, origin, dir, spell, dmgMult);
    return;
  }
  if (spell.isHoming) {
    p[cdField] = now + (spell.cooldown || 1);
    const vis = spell.visRange || 100;
    const tgt = nearestEnemy(room, origin, vis, dir, spell.visConeCos ?? 0.12);
    spawnHoming(room, client.sessionId, origin, dir, spell, spell.damage * dmgMult, tgt);
    return;
  }
  if (spell.isDaggerThrow) {
    p[cdField] = now + (spell.cooldown || 0.7);
    throwDaggers(room, p, client.sessionId, origin, dir, spell, dmgMult);
    return;
  }
  if (spell.isStarfall) {
    p[cdField] = now + (spell.cooldown || 0.5);
    const dmgMulSf = dmgMult * (room.state.dbgWeaponDmgMul || 1);
    const aimed = pickStarfallImpact(room, origin, dir, spell);
    const dmgVal = spell.damageMin + Math.random() * (spell.damageMax - spell.damageMin);
    room.state.enemies.forEach(e => {
      if (!e.alive) return;
      const dx = e.pos.x - aimed.x, dy = e.pos.y - aimed.y, dz = e.pos.z - aimed.z;
      if (dx * dx + dy * dy + dz * dz <= spell.radius * spell.radius) damageEnemy(room, e, dmgVal * dmgMulSf);
    });
    room.broadcast("fx", { type: "starfall", x: aimed.x, y: aimed.y, z: aimed.z, r: spell.radius, color: spell.color });
    return;
  }
  p[cdField] = now + (spell.cooldown || 0.35);
  room.projectiles.push({
    ownerId: client.sessionId,
    x: origin.x, y: origin.y, z: origin.z,
    vx: dir.x * spell.projectileSpeed, vy: dir.y * spell.projectileSpeed, vz: dir.z * spell.projectileSpeed,
    life: spell.life, damage: spell.damage * dmgMult, radius: spell.radius, color: spell.color,
  });
  room.broadcast("fx", { type: "shot", x: origin.x, y: origin.y, z: origin.z, color: spell.color, dx: dir.x, dy: dir.y, dz: dir.z });
}
