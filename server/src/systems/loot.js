import { ITEMS, ITEMS_BY_ID, WORLD, EQUIPMENT, pickRandom, lootPool, chestGoldCost, scrapIdForRarity } from "../../../shared/index.js";
import { Pickup } from "../schema.js";

export function addPickup(room, { kind, itemId, handType, x, y, z, goldCost = 0 }) {
  const id = `p${++room.pickupSeq}`;
  const pk = new Pickup();
  pk.kind = kind; pk.itemId = itemId || ""; pk.handType = handType || "";
  pk.goldCost = goldCost || 0;
  pk.pos.x = x; pk.pos.y = y; pk.pos.z = z;
  room.state.pickups.set(id, pk);
  return id;
}

export function spawnArenaPickups(room) {
  const cost = chestGoldCost(room.state.runTimeSec);
  const whites = lootPool("white");
  const greens = lootPool("green");
  const reds = lootPool("red");
  const anyLoot = ITEMS.filter(x => !x.scrap);
  const scatter = () => {
    const R = WORLD.PICKUP_RING || 32;
    const a = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * (R - 10);
    return { x: Math.cos(a) * r, y: 1.2, z: Math.sin(a) * r };
  };
  const nChests = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < nChests; i++) {
    const item = pickRandom(whites.length ? whites : anyLoot);
    const p = scatter();
    addPickup(room, { kind: "CHEST", itemId: item.id, handType: "", goldCost: cost, ...p });
  }
  {
    const pool = [...greens, ...reds];
    const item = pickRandom(pool.length ? pool : anyLoot);
    addPickup(room, { kind: "CHEST_LARGE", itemId: item.id, handType: "", goldCost: Math.round(cost * 1.8), ...scatter() });
  }
  {
    const pick3 = () => pickRandom(anyLoot).id;
    addPickup(room, {
      kind: "CHEST_TRIPLE",
      itemId: `${pick3()}|${pick3()}|${pick3()}`,
      handType: "",
      goldCost: Math.round(cost * 1.4),
      ...scatter(),
    });
  }
  addPickup(room, { kind: "SHRINE_BLOOD", itemId: "", handType: "", goldCost: 0, ...scatter() });
  addPickup(room, { kind: "SHRINE_CHANCE", itemId: "", handType: "", goldCost: 0, ...scatter() });
  addPickup(room, { kind: "SHRINE_COMBAT", itemId: "", handType: "", goldCost: 0, ...scatter() });
  addPickup(room, { kind: "SHRINE_NEWT", itemId: "", handType: "", goldCost: 0, ...scatter() });
  const printed = pickRandom(anyLoot);
  addPickup(room, { kind: "PRINTER", itemId: printed.id, handType: "", goldCost: 0, ...scatter() });
  addPickup(room, { kind: "SCRAPPER", itemId: "", handType: "", goldCost: 0, ...scatter() });
  addPickup(room, { kind: "DRONE", itemId: "", handType: "", goldCost: Math.round(cost * 1.6), ...scatter() });
  const eqId = pickRandom(Object.keys(EQUIPMENT));
  addPickup(room, { kind: "EQUIP", itemId: eqId, handType: "", goldCost: Math.round(cost * 1.3), ...scatter() });
}

export function handlePickup(room, client, msg) {
  const p = room.state.players.get(client.sessionId);
  const item = room.state.pickups.get(msg.id);
  if (!p || !item || item.taken) return;
  const dx = item.pos.x - p.pos.x, dy = item.pos.y - p.pos.y, dz = item.pos.z - p.pos.z;
  if (dx * dx + dy * dy + dz * dz > 9) return;
  if (item.kind === "SHRINE_BLOOD") {
    const tax = Math.max(1, Math.round((p.maxHp || 1) * 0.2));
    if ((p.hp || 0) <= tax) {
      room.broadcast("chat", { name: "система", text: `${p.name || "игрок"}: мало HP для алтаря крови`, id: "" });
      return;
    }
    p.hp -= tax;
    const pay = Math.round(chestGoldCost(room.state.runTimeSec) * 2.2);
    p.gold = (p.gold || 0) + pay;
    item.taken = true;
    room.broadcast("fx", { type: "shrine_blood", target: client.sessionId, gold: pay, x: item.pos.x, y: item.pos.y, z: item.pos.z });
    return;
  }
  if (item.kind === "SHRINE_CHANCE") {
    const cost = chestGoldCost(room.state.runTimeSec);
    if ((p.gold || 0) < cost) {
      room.broadcast("chat", { name: "система", text: `${p.name || "игрок"}: не хватает золота на алтарь шанса (${cost})`, id: "" });
      return;
    }
    p.gold -= cost;
    item.taken = true;
    if (Math.random() < 0.5) {
      const it = pickRandom(ITEMS.filter(x => !x.scrap));
      room.grantToPlayer(p, "ITEM", "", it.id);
      room.broadcast("chat", { name: "система", text: `${p.name || "игрок"} выиграл ${it.name}`, id: "" });
      room.broadcast("fx", { type: "shrine_chance", target: client.sessionId, win: true, item: it.name, x: item.pos.x, y: item.pos.y, z: item.pos.z });
    } else {
      room.broadcast("chat", { name: "система", text: `${p.name || "игрок"} проиграл алтарь шанса`, id: "" });
      room.broadcast("fx", { type: "shrine_chance", target: client.sessionId, win: false, x: item.pos.x, y: item.pos.y, z: item.pos.z });
    }
    return;
  }
  if (item.kind === "SHRINE_COMBAT") {
    item.taken = true;
    const n = 6 + Math.floor(room.dmul());
    for (let i = 0; i < n; i++) room.addEnemyNear("GROUND_CRAWLER", item.pos.x, item.pos.z);
    room.broadcast("fx", { type: "shrine_combat", x: item.pos.x, y: item.pos.y, z: item.pos.z });
    room.broadcast("chat", { name: "система", text: `${p.name || "игрок"} активировал алтарь боя`, id: "" });
    return;
  }
  if (item.kind === "SHRINE_NEWT") {
    item.taken = true;
    room.state.bluePortal = true;
    room.state.bluePortalX = item.pos.x;
    room.state.bluePortalZ = item.pos.z;
    addPickup(room, {
      kind: "BLUE_PORTAL", itemId: "", handType: "", goldCost: 0,
      x: item.pos.x, y: 1.2, z: item.pos.z + 3,
    });
    room.broadcast("fx", { type: "newt", x: item.pos.x, y: item.pos.y, z: item.pos.z });
    room.broadcast("chat", { name: "система", text: `${p.name || "игрок"} открыл синий портал на Базар`, id: "" });
    return;
  }
  if (item.kind === "BLUE_PORTAL") {
    room.enterBazaar();
    return;
  }
  if (item.kind === "RETURN_PORTAL") {
    room.leaveBazaar();
    return;
  }
  if (item.kind === "BAZAAR_ITEM") {
    const price = item.goldCost || 1;
    if ((p.lunarShards || 0) < price) {
      room.broadcast("chat", { name: "система", text: `${p.name || "игрок"}: нужно ${price} лунных монет`, id: "" });
      return;
    }
    p.lunarShards -= price;
    item.taken = true;
    room.grantToPlayer(p, "ITEM", "", item.itemId || "LUNAR_GLASS");
    room.broadcast("fx", { type: "bazaar_buy", target: client.sessionId, item: item.itemId, x: item.pos.x, y: item.pos.y, z: item.pos.z });
    return;
  }
  if (item.kind === "BAZAAR_SKIP") {
    const price = item.goldCost || 1;
    if ((p.lunarShards || 0) < price) {
      room.broadcast("chat", { name: "система", text: `${p.name || "игрок"}: нужно ${price} лунных монет`, id: "" });
      return;
    }
    p.lunarShards -= price;
    item.taken = true;
    room.markBazaarSkip();
    room.broadcast("chat", { name: "система", text: `${p.name || "игрок"} сменил следующий этап`, id: "" });
    return;
  }
  if (item.kind === "DRONE") {
    const cost = item.goldCost || chestGoldCost(room.state.runTimeSec);
    if ((p.gold || 0) < cost) {
      room.broadcast("chat", { name: "система", text: `${p.name || "игрок"}: не хватает золота на дрона (${cost})`, id: "" });
      return;
    }
    p.gold -= cost;
    item.taken = true;
    p.droneCount = (p.droneCount || 0) + 1;
    room.broadcast("fx", { type: "drone", target: client.sessionId, x: item.pos.x, y: item.pos.y, z: item.pos.z });
    return;
  }
  if (item.kind === "EQUIP") {
    const cost = item.goldCost || chestGoldCost(room.state.runTimeSec);
    if ((p.gold || 0) < cost) {
      room.broadcast("chat", { name: "система", text: `${p.name || "игрок"}: не хватает золота на снаряжение (${cost})`, id: "" });
      return;
    }
    p.gold -= cost;
    item.taken = true;
    p.equipmentId = item.itemId || "HEAL";
    p.equipCdUntil = 0;
    room.broadcast("fx", { type: "equip_swap", target: client.sessionId, equipmentId: p.equipmentId, x: item.pos.x, y: item.pos.y, z: item.pos.z });
    return;
  }
  if (item.kind === "CHEST_TRIPLE") {
    const cost = item.goldCost || 0;
    if (cost > 0 && (p.gold || 0) < cost) {
      room.broadcast("chat", { name: "система", text: `${p.name || "игрок"}: не хватает золота (${cost})`, id: "" });
      return;
    }
    const opts = String(item.itemId || "").split("|").filter(Boolean);
    const choice = Math.max(0, Math.min(opts.length - 1, msg.choice | 0));
    if (!opts[choice]) {
      room.broadcast("chat", { name: "система", text: "трипл-сундук: выбери 1 / 2 / 3", id: "" });
      return;
    }
    if (cost > 0) p.gold -= cost;
    item.taken = true;
    room.grantToPlayer(p, "ITEM", "", opts[choice]);
    room.broadcast("fx", { type: "chest_triple", target: client.sessionId, item: opts[choice], x: item.pos.x, y: item.pos.y, z: item.pos.z });
    return;
  }
  if (item.kind === "PRINTER") {
    const printed = item.itemId || "BLOODSTONE";
    const rarity = (ITEMS_BY_ID[printed] && ITEMS_BY_ID[printed].rarity) || "white";
    const consumed = room.consumePrinterFuel(p, rarity);
    if (!consumed) {
      room.broadcast("chat", { name: "система", text: `${p.name || "игрок"}: нет лома/предмета той же редкости`, id: "" });
      return;
    }
    room.equipItem(p, printed);
    room.broadcast("fx", { type: "printer", target: client.sessionId, item: printed, consumed, x: item.pos.x, y: item.pos.y, z: item.pos.z });
    return;
  }
  if (item.kind === "SCRAPPER") {
    const raw = room.takeOneNonScrap(p);
    if (!raw) {
      room.broadcast("chat", { name: "система", text: `${p.name || "игрок"}: нечего утилизировать`, id: "" });
      return;
    }
    const rarity = (ITEMS_BY_ID[raw] && ITEMS_BY_ID[raw].rarity) || "white";
    room.equipItem(p, scrapIdForRarity(rarity));
    room.broadcast("fx", { type: "scrapper", target: client.sessionId, scrap: scrapIdForRarity(rarity), x: item.pos.x, y: item.pos.y, z: item.pos.z });
    return;
  }
  const cost = item.goldCost || 0;
  if (cost > 0 && (p.gold || 0) < cost) {
    room.broadcast("chat", { name: "система", text: `${p.name || "игрок"}: не хватает золота (${cost})`, id: "" });
    return;
  }
  if (cost > 0) p.gold -= cost;
  item.taken = true;
  if (item.kind === "ITEM" || item.kind === "CHEST" || item.kind === "CHEST_LARGE") {
    room.grantToPlayer(p, "ITEM", "", item.itemId || item.handType);
  }
}

export function consumePrinterFuel(p, rarity, refreshItemHp) {
  const scrapId = scrapIdForRarity(rarity);
  const arr = [...(p.itemsInBody || [])];
  let idx = arr.findIndex(id => id === scrapId);
  if (idx < 0) idx = arr.findIndex(id => (ITEMS_BY_ID[id] && ITEMS_BY_ID[id].rarity) === rarity);
  if (idx < 0) return null;
  const used = arr[idx];
  p.itemsInBody.splice(idx, 1);
  p.passiveItemId = p.itemsInBody[0] || "";
  refreshItemHp(p);
  return used;
}

export function takeOneNonScrap(p, refreshItemHp) {
  const arr = [...(p.itemsInBody || [])];
  const idx = arr.findIndex(id => ITEMS_BY_ID[id] && !ITEMS_BY_ID[id].scrap);
  if (idx < 0) return null;
  const used = arr[idx];
  p.itemsInBody.splice(idx, 1);
  p.passiveItemId = p.itemsInBody[0] || "";
  refreshItemHp(p);
  return used;
}
