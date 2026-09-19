import * as THREE from "three";
import { Client } from "colyseus.js";
import { NET, WORLD, HAND_TYPES, SPELLS, ENEMY_TYPES, ITEMS, ITEMS_BY_ID, COMBAT, SURVIVOR, difficultyLabel, LEVELS, stackedPassives, sumItemStat, xpToNextLevel, RUN, EQUIPMENT, stageKind } from "@mhfps/shared";
import { setupHub, setupArena, disposeGroup, animateTorches, updateArenaPortal, getArenaPortalPos, setArenaPortalPosition, updateHubPortal, getHubPortalPos, playerInsidePortal, playerNearPortal, animateDangerZones, createHubSlotMesh, makeSlotContent, createHubChestMesh, updateChestCount, setChestOpen } from "./world.js";
import { setupTerrainV3, terrainHeight, applyArenaTheme } from "./worldV3.js";
import { createCacodemonSprite, updateCacodemonSprite } from "./enemyV3.js";

// v0.0.3.1 — Звёздный Блок (ПКМ) + AI Director + Flying Shooter + карты/инвентарь
const V3_MODE = true;
const V31_MODE = true;
import { createEnemy3D, animateEnemy } from "./enemies3d.js";
import { createHandsGroup, animateHands, setSpellInHand, showHandDamage, fadeHandCracks } from "./hands3d.js";
import { createOtherPlayer, animateOtherPlayer } from "./otherplayer.js";
import { createPedestalMesh, animatePedestal, createFloatingLootCard, animateFloatingLoot } from "./pedestal.js";
import { FpsController } from "./controller.js";
import { initAudio, playSound, playSoundLoop, stopSoundLoop, setMasterVolume, getMasterVolume } from "./assets.js";
import { hudSprite, HAND_SPRITE } from "./weaponHud.js";

// ═══════════════════════════════════════════════════════════════════
// DOM
// ═══════════════════════════════════════════════════════════════════
const canvas = document.getElementById("canvas");
const menu = document.getElementById("menu");
const status = document.getElementById("status");
const crackHud = document.getElementById("hud-crack");
const deadHud = document.getElementById("dead");
const crosshair = document.getElementById("crosshair");

const radar = document.createElement("canvas");
radar.width = 240; radar.height = 44;
radar.id = "radarHud";
radar.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);pointer-events:none;z-index:15;opacity:0.85;display:none;";
document.body.appendChild(radar);
const rctx = radar.getContext("2d");

const dmgOverlay = document.createElement("div");
dmgOverlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:14;opacity:0;transition:opacity .3s;";
document.body.appendChild(dmgOverlay);
let dmgAngle = 0, dmgTimer = 0;

// Рука — ниже центра, наклонена вперёд (меньше вертикали, запястье в кадре).
// Оружие — отдельный спрайт справа снизу, не на гигантской ладони.
const fpsHud = document.createElement("div");
fpsHud.id = "fpsHud";
fpsHud.style.cssText = [
  "position:fixed", "left:50%", "right:auto", "bottom:-8%",
  "transform:translateX(-50%) rotateX(-50deg)",
  "width:min(34vw, 300px)",
  "height:min(22vh, 190px)",
  "overflow:visible",
  "pointer-events:none", "z-index:12",
  "perspective:560px",
  "transform-origin:50% 100%",
].join(";");
const handHud = document.createElement("img");
const weaponHud = document.createElement("img");
handHud.draggable = false;
weaponHud.draggable = false;
handHud.style.cssText = [
  "position:absolute", "left:50%", "bottom:-4%",
  "transform:translateX(-50%)",
  "transform-origin:50% 100%",
  "height:112%", "width:auto", "max-width:none",
  "object-fit:contain", "object-position:center bottom",
  "user-select:none", "image-rendering:pixelated",
  "filter:drop-shadow(0 -8px 12px rgba(0,0,0,0.7))",
].join(";");
weaponHud.id = "weaponHud";
weaponHud.style.cssText = [
  "position:fixed", "right:1.6vw", "bottom:1.2vh", "left:auto",
  "transform:none",
  "height:min(36vh, 320px)", "width:auto", "max-width:min(30vw, 260px)",
  "object-fit:contain", "object-position:right bottom",
  "user-select:none", "image-rendering:auto",
  "pointer-events:none", "z-index:13",
  "filter:drop-shadow(0 8px 16px rgba(0,0,0,0.6))",
].join(";");
handHud.src = HAND_SPRITE;
weaponHud.src = hudSprite("sword");
fpsHud.appendChild(handHud);
document.body.appendChild(fpsHud);
document.body.appendChild(weaponHud);
let swordBob = 0, viewKick = 0;
let localBlockHp = 0, shieldGraceUntil = 0;
function triggerSwordSwing() { viewKick = 1; }

const wpnCdHud = document.createElement("div");
wpnCdHud.id = "wpnCdHud";
wpnCdHud.style.cssText = "position:fixed;right:16px;bottom:16px;left:auto;transform:none;display:flex;flex-direction:row;gap:8px;pointer-events:none;z-index:21;font-family:'Trebuchet MS',sans-serif;";
function makeCdChip(label) {
  const d = document.createElement("div");
  d.style.cssText = "position:relative;min-width:72px;padding:6px 10px 9px;border-radius:7px;background:rgba(8,6,4,0.78);border:1px solid rgba(200,140,80,0.35);color:#f2e6d4;font-size:12px;text-align:center;letter-spacing:0.3px;overflow:hidden;";
  d.innerHTML = `<div style="opacity:.75;font-size:11px;font-weight:700;">${label}</div><div class="cdv">готово</div><div class="cdbar" style="position:absolute;left:0;bottom:0;height:3px;width:0;background:#ffcc66;"></div>`;
  return d;
}
const lmbChip = makeCdChip("Primary");
const rmbChip = makeCdChip("Secondary");
const extraChip = makeCdChip("Utility R");
extraChip.style.display = "flex";
const specChip = makeCdChip("Special");
const eqChip = makeCdChip("Q");
wpnCdHud.append(lmbChip, rmbChip, extraChip, specChip, eqChip);
document.body.appendChild(wpnCdHud);
fpsHud.style.display = "none";
wpnCdHud.style.display = "none";
let lmbHeld = false;

// v0.0.3.1: HUD звёздного блока (абсорб — в центре экрана)
const blockHud = document.createElement("div");
blockHud.id = "blockHud";
blockHud.style.cssText = "position:fixed;left:16px;bottom:16px;transform:none;width:min(280px,38vw);height:18px;margin-bottom:0;border:1px solid #ff40a0;background:rgba(0,0,0,0.45);border-radius:6px;overflow:hidden;pointer-events:none;z-index:21;opacity:0;box-shadow:0 0 10px rgba(255,64,160,0.45);";
const blockHudFill = document.createElement("div");
blockHudFill.style.cssText = "width:100%;height:100%;background:linear-gradient(90deg,#ff8ac8,#ff40a0);transition:width .1s;";
blockHud.appendChild(blockHudFill);
const blockHudLabel = document.createElement("div");
blockHudLabel.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#ffcce6;font-family:inherit;font-size:10px;letter-spacing:0.8px;text-shadow:0 0 4px #000;";
blockHud.appendChild(blockHudLabel);
document.body.appendChild(blockHud);

// v0.0.3.1: HUD-кулдаун звёздного блока (в нижнем-левом)
const blockCdHud = document.createElement("div");
blockCdHud.style.display = "none";
blockCdHud.textContent = "☆";
document.body.appendChild(blockCdHud);

// HUD-подсказка (центр экрана)
const hintText = document.createElement("div");
hintText.style.cssText = "position:fixed;top:18%;left:50%;transform:translateX(-50%);color:#f6ead8;text-shadow:0 0 8px #000;font-family:'Trebuchet MS',sans-serif;font-size:15px;padding:8px 14px;background:rgba(8,6,4,0.72);border:1px solid rgba(200,140,80,0.35);border-radius:8px;pointer-events:none;z-index:16;opacity:0;transition:opacity .25s;";
document.body.appendChild(hintText);
let hintTimer = 0;
const tpFlash = document.createElement("div");
tpFlash.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:80;background:radial-gradient(ellipse at center, rgba(196,80,255,0.9) 0%, rgba(40,0,70,0.95) 55%, #090014 100%);opacity:0;transition:opacity .18s;";
document.body.appendChild(tpFlash);
function flashTeleport() {
  tpFlash.style.opacity = "1";
  setTimeout(() => { tpFlash.style.opacity = "0"; }, 280);
}

// ── UI-панель инвентаря СУНДУКА ────────────────────────
const chestPanel = document.createElement("div");
chestPanel.id = "chestPanel";
chestPanel.style.cssText = [
  "position:fixed",
  "left:50%",
  "top:50%",
  "transform:translate(-50%,-50%)",
  "z-index:30",
  "display:none",
  "font-family:'Trebuchet MS',sans-serif",
  "background:linear-gradient(180deg,#2a1a10 0%,#1a0f08 100%)",
  "border:3px solid #6a4a28",
  "border-radius:10px",
  "box-shadow:0 0 40px rgba(255,170,50,0.5),inset 0 0 20px rgba(0,0,0,0.6)",
  "padding:20px 24px",
  "width:900px",
  "max-height:640px",
  "color:#f0d090",
].join(";");
// v0.0.3.4: панель сундука — две колонки: СУНДУК ↔ МОЙ ИНВЕНТАРЬ
chestPanel.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #6a4a28;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:2px;text-shadow:0 0 8px rgba(255,170,50,0.6);">СУНДУК ЛОББИ</div>
    <div id="chestCounter" style="font-size:14px;color:#d0b070;">0 / 24</div>
    <div id="chestClose" style="cursor:pointer;font-size:20px;color:#d0b070;padding:2px 10px;border:1px solid #6a4a28;border-radius:4px;">✕ ESC</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <!-- ЛЕВАЯ: СУНДУК -->
    <div style="background:#0000002a;border:1px solid #6a4a2844;border-radius:8px;padding:12px;">
      <div style="font-size:13px;color:#ffd08a;letter-spacing:2px;text-align:center;padding-bottom:6px;border-bottom:1px solid #6a4a2833;margin-bottom:8px;">← СУНДУК (клик = забрать)</div>
      <div id="chestGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;"></div>
    </div>
    <!-- ПРАВАЯ: МОЙ ИНВЕНТАРЬ -->
    <div style="background:#0000002a;border:1px solid #6a4a2844;border-radius:8px;padding:12px;">
      <div style="font-size:13px;color:#ffd08a;letter-spacing:2px;text-align:center;padding-bottom:6px;border-bottom:1px solid #6a4a2833;margin-bottom:8px;">ТВОЙ ИНВЕНТАРЬ (клик = положить →)</div>
      <div id="chestMyInv" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;"></div>
    </div>
  </div>
  <div style="margin-top:12px;font-size:12px;color:#8a7050;text-align:center;">Левая колонка — вещи сундука (общее для всего лобби). Правая — твои вещи. ESC или отойди — закрыть.</div>
`;
document.body.appendChild(chestPanel);
let openChestIndex = -1; // -1 = закрыт

// FIRE/ICE/BONE → визуальный ключ магии в ладони
function handTypeToVisual(ht) {
  return ({ FIRE: "fireball", ICE: "ice", BONE: "bone", CHAIN: "chain" })[ht] || "fireball";
}

// ── v0.0.3.1 ПАНЕЛЬ СНАРЯЖЕНИЯ: свиток-папирус (TAB — hold) ──────────────
// v0.0.3.3: чистая сетка СНАРЯЖЕНИЕ — без фона-свитка; 2 колонки: НАДЕТО / РЮКЗАК
const loadoutPanel = document.createElement("div");
loadoutPanel.id = "loadoutPanel";
loadoutPanel.style.cssText = [
  "position:fixed", "left:50%", "top:50%", "transform:translate(-50%,-50%)",
  "z-index:29", "display:none", "font-family:'Trebuchet MS',sans-serif",
  V31_MODE
    ? "background:linear-gradient(180deg,rgba(18,14,10,0.96) 0%,rgba(8,6,4,0.96) 100%)"
    : "background:linear-gradient(180deg,#1a1210 0%,#0b0806 100%)",
  V31_MODE ? "border:1px solid #6a4a28" : "border:3px solid #6a4a28",
  "border-radius:10px",
  "box-shadow:0 12px 60px rgba(0,0,0,0.7), 0 0 20px rgba(255,170,50,0.15)",
  V31_MODE ? "padding:20px 24px" : "padding:18px 24px",
  V31_MODE ? "width:min(960px,94vw);max-height:min(640px,88vh);height:auto;overflow:auto" : "min-width:560px",
  "color:#e6d9c2",
  "backdrop-filter:blur(4px)",
].join(";");
loadoutPanel.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #6a4a2866;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:3px;color:#ffd08a;">ЗАБЕГ</div>
    <div id="loadoutHp" style="font-size:14px;color:#e6b070;font-weight:bold;">HP: –</div>
    <div style="font-size:12px;color:#8a7050;">TAB — закрыть</div>
  </div>
  <div style="display:flex;flex-direction:column;gap:12px;">
    <div style="font-size:12px;color:#cbbba8;" id="lpKit">Выживший · ЛКМ атака · ПКМ барьер · R рывок · Q снаряжение</div>
    <div>
      <div style="font-size:11px;color:#8a7050;letter-spacing:1px;margin-bottom:6px;">СНАРЯЖЕНИЕ Q</div>
      <div id="lpEquip" style="color:#e6d9c2;font-size:14px;"></div>
    </div>
    <div>
      <div style="font-size:11px;color:#8a7050;letter-spacing:1px;margin-bottom:6px;">ПАССИВКИ (стаки без лимита)</div>
      <div id="lpPassivesV31" style="max-height:280px;overflow:auto;font-size:13px;color:#c0a070;line-height:1.5;"></div>
    </div>
  </div>
`;
document.body.appendChild(loadoutPanel);
let loadoutOpen = false;
function showLoadoutPanel() {
  if (loadoutOpen) return;
  loadoutOpen = true;
  loadoutPanel.style.display = "block";
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch {}
  renderLoadoutPanel();
}
function hideLoadoutPanel() {
  loadoutOpen = false;
  loadoutPanel.style.display = "none";
  hideItemTooltip();
  if (document.body.classList.contains("in-game")) {
    try { canvas.requestPointerLock(); } catch {}
  }
}

const aimEnemyHud = document.createElement("div");
aimEnemyHud.id = "aimEnemyHud";
aimEnemyHud.style.cssText = "position:fixed;left:50%;top:52px;transform:translateX(-50%);z-index:16;pointer-events:none;min-width:220px;max-width:42vw;display:none;font-family:'Trebuchet MS',sans-serif;";
aimEnemyHud.innerHTML = `<div id="aimEnemyName" style="text-align:center;font-size:12px;color:#f0e6d4;text-shadow:0 1px 3px #000;margin-bottom:4px;"></div><div style="height:10px;background:rgba(8,6,4,0.75);border:1px solid rgba(200,80,80,0.55);border-radius:5px;overflow:hidden;"><div id="aimEnemyFill" style="height:100%;width:100%;background:linear-gradient(90deg,#d83a3a,#d87f3a);"></div></div>`;
document.body.appendChild(aimEnemyHud);

function updateAimEnemyHud() {
  if (!room || room.state.phase === "hub") {
    aimEnemyHud.style.display = "none";
    return;
  }
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let best = null, bestDot = 0.88, bestId = "";
  room.state.enemies.forEach((e, id) => {
    if (!e || !e.alive) return;
    const vx = e.pos.x - camera.position.x;
    const vy = e.pos.y - camera.position.y;
    const vz = e.pos.z - camera.position.z;
    const len = Math.hypot(vx, vy, vz) || 1;
    if (len > 90) return;
    const dot = (vx * dir.x + vy * dir.y + vz * dir.z) / len;
    if (dot > bestDot) { bestDot = dot; best = e; bestId = id; }
  });
  if (!best) { aimEnemyHud.style.display = "none"; return; }
  const pct = Math.max(0, Math.min(1, best.hp / (best.maxHp || 1)));
  document.getElementById("aimEnemyName").textContent = (ENEMY_TYPES[best.enemyType]?.id || best.enemyType || "враг") + "  " + Math.round(best.hp) + "/" + Math.round(best.maxHp || 0);
  document.getElementById("aimEnemyFill").style.width = (pct * 100).toFixed(1) + "%";
  aimEnemyHud.style.display = "block";
  void bestId;
}
const passivesHud = document.createElement("div");
passivesHud.id = "passivesHud";
passivesHud.style.cssText = "position:fixed;left:50%;top:58px;transform:translateX(-50%);z-index:16;pointer-events:none;font-size:12px;color:#e6d9c2;text-shadow:0 1px 3px #000;letter-spacing:0.4px;text-align:center;max-width:70vw;";
document.body.appendChild(passivesHud);
function renderPassivesHud() {
  if (!myPlayer || !room || room.state.phase === "hub") {
    passivesHud.textContent = "";
    return;
  }
  const stacks = stackedPassives(myPlayer);
  passivesHud.textContent = stacks.map(s => `${s.glyph || "•"}${s.n > 1 ? "×" + s.n : ""}`).join("  ");
}
const cardHud = document.createElement("div");
cardHud.id = "cardHud";
cardHud.style.cssText = "position:fixed;left:16px;bottom:92px;display:none;gap:8px;z-index:16;pointer-events:none;";
document.body.appendChild(cardHud);
function renderCardHud() { cardHud.innerHTML = ""; }

// v0.0.3.1: иконки для инвентаря. v0.0.3.4: SVG-генерация для всего
function svgIcon(bg, fg, emoji) {
  const s = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
    <defs><radialGradient id='g' cx='50%' cy='40%' r='60%'><stop offset='0' stop-color='${bg}' stop-opacity='0.9'/><stop offset='1' stop-color='#000' stop-opacity='0.9'/></radialGradient></defs>
    <rect width='64' height='64' fill='url(#g)'/>
    <text x='32' y='40' font-size='34' text-anchor='middle' fill='${fg}' font-family='Segoe UI Emoji,Apple Color Emoji,sans-serif'>${emoji}</text>
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(s);
}
const V31_ICON = {};
function v31IconFor(raw) {
  const [kind, sub] = String(raw).split(":");
  if (kind === "ITEM") {
    const it = ITEMS_BY_ID[sub] || ITEMS.find(x => x.id === sub);
    if (it) return { src: svgIcon("#805020", "#fff", it.glyph || "◆"), label: it.name, desc: it.effect || "пассив" };
    return { src: svgIcon("#805020", "#fff", "◆"), label: sub || "Предмет", desc: "Пассивный предмет" };
  }
  return { src: svgIcon("#666", "#fff", "◆"), label: sub || raw, desc: "" };
}

const itemTooltip = document.createElement("div");
itemTooltip.id = "itemTooltip";
itemTooltip.style.cssText = [
  "position:fixed", "z-index:80", "display:none", "pointer-events:none",
  "max-width:280px", "padding:10px 12px",
  "background:rgba(12,8,6,0.96)", "border:1px solid #c08858", "border-radius:8px",
  "color:#f0e0c8", "font-family:'Trebuchet MS',sans-serif",
  "box-shadow:0 8px 24px rgba(0,0,0,0.6), 0 0 12px rgba(255,140,60,0.25)",
].join(";");
document.body.appendChild(itemTooltip);
function hideItemTooltip() { itemTooltip.style.display = "none"; }
function showItemTooltip(ev, raw) {
  const info = v31IconFor(raw);
  if (!info || !info.label) { hideItemTooltip(); return; }
  const desc = info.desc || "";
  itemTooltip.innerHTML = `<div style="font-size:14px;font-weight:bold;color:#ffd08a;margin-bottom:4px;">${info.label}</div>`
    + (desc ? `<div style="font-size:12px;line-height:1.35;color:#e6d9c2;">${desc}</div>` : "");
  itemTooltip.style.display = "block";
  const pad = 14;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  const w = 280, h = 90;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - 8;
  if (y + h > window.innerHeight - 8) y = ev.clientY - h - 8;
  itemTooltip.style.left = x + "px";
  itemTooltip.style.top = y + "px";
}
function bindItemTooltip(el, raw) {
  if (!el || !raw) return;
  el.addEventListener("mouseenter", (ev) => showItemTooltip(ev, raw));
  el.addEventListener("mousemove", (ev) => showItemTooltip(ev, raw));
  el.addEventListener("mouseleave", hideItemTooltip);
}
// v0.0.3.3: все действия в инвентаре — через атомарный op:"swap" (from,to)
function v31SendSwap(from, to) {
  if (!room) return;
  room.send("inv", { op: "swap", from, to });
  setTimeout(renderLoadoutPanel, 120);
}
function v31FirstFreeCard() {
  if (!myPlayer || !myPlayer.cards) return -1;
  for (let i = 0; i < 10; i++) if (!myPlayer.cards[i]) return i;
  return -1;
}
function v31CardCell(cardId, slotIndex) {
  const has = !!cardId;
  const info = has ? v31IconFor("CARD:" + cardId) : null;
  const cell = document.createElement("div");
  cell.className = "lp-slot lp-card";
  cell.dataset.slotType = "card";
  cell.dataset.slotIndex = String(slotIndex);
  cell.style.cssText = `aspect-ratio:1;background:${has ? "#1a0f0844" : "#00000022"};border:2px ${has ? "solid" : "dashed"} ${has ? "#c08858" : "#6a4a2888"};border-radius:6px;position:relative;overflow:hidden;cursor:${has ? "grab" : "default"};display:flex;align-items:center;justify-content:center;transition:border-color 0.1s, transform 0.1s;`;
  if (has) {
    const img = document.createElement("img");
    img.src = info.src; img.style.cssText = "width:100%;height:100%;object-fit:cover;pointer-events:none;";
    img.draggable = false;
    cell.appendChild(img);
    const lbl = document.createElement("div");
    lbl.style.cssText = "position:absolute;bottom:1px;left:0;right:0;font-size:9px;text-align:center;color:#fff;text-shadow:0 0 3px #000;font-weight:bold;";
    lbl.textContent = info.label;
    cell.appendChild(lbl);
    bindItemTooltip(cell, "CARD:" + cardId);
    cell.draggable = true;
    cell.addEventListener("dragstart", (ev) => {
      ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "card", index: slotIndex, raw: "CARD:" + cardId }));
      ev.dataTransfer.effectAllowed = "move";
      cell.style.opacity = "0.4";
    });
    cell.addEventListener("dragend", () => { cell.style.opacity = "1"; });
    // двойной клик — быстрое перемещение в рюкзак
    cell.addEventListener("dblclick", () => {
      v31SendSwap({ type: "card", index: slotIndex }, { type: "backpack", index: 9999 });
    });
  }
  cell.addEventListener("dragover", (ev) => { ev.preventDefault(); cell.style.borderColor = "#ffcc55"; });
  cell.addEventListener("dragleave", () => { cell.style.borderColor = has ? "#c08858" : "#6a4a2888"; });
  cell.addEventListener("drop", (ev) => {
    ev.preventDefault();
    cell.style.borderColor = has ? "#c08858" : "#6a4a2888";
    let d; try { d = JSON.parse(ev.dataTransfer.getData("text/plain") || "{}"); } catch { return; }
    if (!d.raw) return;
    // в card-слот можно только CARD
    if (!String(d.raw).startsWith("CARD:")) return;
    v31SendSwap({ type: d.type, index: d.index }, { type: "card", index: slotIndex });
    // v0.0.3.7: fallback — если через 200мс слот всё ещё пуст и старый в бэкпэке — вызовем legacy ops
    if (d.type === "backpack") {
      const cardId = String(d.raw).split(":")[1];
      setTimeout(() => {
        if (!myPlayer || myPlayer.cards[slotIndex]) return;
        room.send("inv", { op: "card_set", slot: slotIndex, cardId });
        room.send("inv", { op: "backpack_remove", index: d.index });
        setTimeout(renderLoadoutPanel, 120);
      }, 200);
    }
  });
  return cell;
}
function v31BackpackCell(raw, bpIndex) {
  const info = v31IconFor(raw);
  const cell = document.createElement("div");
  cell.style.cssText = "aspect-ratio:1;background:#1a0f0844;border:2px solid #c08858;border-radius:6px;position:relative;overflow:hidden;cursor:grab;transition:border-color 0.1s, transform 0.1s;";
  const img = document.createElement("img");
  img.src = info.src; img.style.cssText = "width:100%;height:100%;object-fit:cover;pointer-events:none;";
  img.draggable = false;
  cell.appendChild(img);
  const lbl = document.createElement("div");
  lbl.style.cssText = "position:absolute;bottom:1px;left:0;right:0;font-size:9px;text-align:center;color:#fff;text-shadow:0 0 3px #000;font-weight:bold;";
  lbl.textContent = info.label;
  cell.appendChild(lbl);
  bindItemTooltip(cell, raw);
  cell.draggable = true;
  cell.addEventListener("dragstart", (ev) => {
    ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "backpack", index: bpIndex, raw }));
    ev.dataTransfer.effectAllowed = "move";
    cell.style.opacity = "0.4";
  });
  cell.addEventListener("dragend", () => { cell.style.opacity = "1"; });
  // двойной клик в рюкзаке — надеть в первый свободный слот
  cell.addEventListener("dblclick", () => {
    if (raw.startsWith("WEAPON:")) {
      v31SendSwap({ type: "backpack", index: bpIndex }, { type: "weapon", index: 0 });
    } else if (raw.startsWith("CARD:")) {
      const free = v31FirstFreeCard();
      if (free < 0) return;
      // v0.0.3.7: двойной fallback — swap мог не сработать если backpack уже изменился. Продублируем legacy card_set + backpack_remove.
      v31SendSwap({ type: "backpack", index: bpIndex }, { type: "card", index: free });
      setTimeout(() => {
        if (!myPlayer || !myPlayer.cards || myPlayer.cards[free]) return;
        const cardId = raw.split(":")[1];
        if (!cardId) return;
        room.send("inv", { op: "card_set", slot: free, cardId });
        room.send("inv", { op: "backpack_remove", index: bpIndex });
        setTimeout(renderLoadoutPanel, 120);
      }, 200);
    }
  });
  return cell;
}
function v31WeaponSlot(weaponId) {
  const el = document.getElementById("lpWeapon");
  if (!el) return;
  el.innerHTML = "";
  el.style.cursor = weaponId ? "grab" : "default";
  if (weaponId) {
    const info = v31IconFor("WEAPON:" + weaponId);
    const img = document.createElement("img");
    img.src = info.src; img.style.cssText = "width:100%;height:100%;object-fit:cover;pointer-events:none;";
    img.draggable = false;
    el.appendChild(img);
    const lbl = document.createElement("div");
    lbl.style.cssText = "position:absolute;bottom:2px;left:0;right:0;font-size:10px;text-align:center;color:#fff;text-shadow:0 0 3px #000;font-weight:bold;";
    lbl.textContent = info.label;
    el.style.position = "relative";
    el.appendChild(lbl);
    bindItemTooltip(el, "WEAPON:" + weaponId);
    el.draggable = true;
    el.ondragstart = (ev) => {
      ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "weapon", index: 0, raw: "WEAPON:" + weaponId }));
      ev.dataTransfer.effectAllowed = "move";
      el.style.opacity = "0.4";
    };
    el.ondragend = () => { el.style.opacity = "1"; };
    el.ondblclick = () => v31SendSwap({ type: "weapon", index: 0 }, { type: "backpack", index: 9999 });
    el.style.borderColor = "#c08858";
    el.style.borderStyle = "solid";
  } else {
    el.textContent = "+";
    el.style.color = "#4a3520";
    el.style.borderColor = "#6a4a28";
    el.style.borderStyle = "dashed";
    el.draggable = false;
    el.ondragstart = null;
    el.ondragend = null;
    el.ondblclick = null;
  }
  el.ondragover = (ev) => { ev.preventDefault(); el.style.borderColor = "#ffcc55"; };
  el.ondragleave = () => { el.style.borderColor = weaponId ? "#c08858" : "#6a4a28"; };
  el.ondrop = (ev) => {
    ev.preventDefault();
    el.style.borderColor = weaponId ? "#c08858" : "#6a4a28";
    let d; try { d = JSON.parse(ev.dataTransfer.getData("text/plain") || "{}"); } catch { return; }
    if (!d.raw || !String(d.raw).startsWith("WEAPON:")) return;
    v31SendSwap({ type: d.type, index: d.index }, { type: "weapon", index: 0 });
  };
}
// Принимаем drop в сам контейнер РЮКЗАКА — это то, чего не было в v0.0.3.1 и почему не работало обратное перетаскивание
function v31InstallBackpackDrop() {
  const bp = document.getElementById("lpBackpack");
  if (!bp || bp._dropInstalled) return;
  bp._dropInstalled = true;
  bp.addEventListener("dragover", (ev) => { ev.preventDefault(); bp.style.background = "#00000044"; });
  bp.addEventListener("dragleave", () => { bp.style.background = "transparent"; });
  bp.addEventListener("drop", (ev) => {
    ev.preventDefault();
    bp.style.background = "transparent";
    let d; try { d = JSON.parse(ev.dataTransfer.getData("text/plain") || "{}"); } catch { return; }
    if (!d.raw || d.type === "backpack") return; // внутри рюкзака двигать не надо (только из надетого)
    v31SendSwap({ type: d.type, index: d.index }, { type: "backpack", index: 9999 });
  });
}
function handTypeName(ht) {
  return ({ FIRE: "Огненная", ICE: "Ледяная", BONE: "Костяная", CHAIN: "Грозовая" })[ht] || "—";
}
function handTypeColorHex(ht) {
  return ({ FIRE: "#ff5522", ICE: "#66ccff", BONE: "#d0c0a0", CHAIN: "#9be7ff" })[ht] || "#8a7050";
}
function spellName(ht) {
  return ({ FIRE: "Fireball", ICE: "Icebolt", BONE: "Bone Shard", CHAIN: "Chain Lightning" })[ht] || "—";
}
function itemInfo(id) {
  const it = ITEMS.find(x => x.id === id);
  if (!it) return { name: id || "—", effect: "—", color: "#8a7050", glyph: "?" };
  return { name: it.name || it.id, effect: it.effect || "—",
           color: "#" + (it.color || 0x8a7050).toString(16).padStart(6, "0"),
           glyph: it.glyph || "?" };
}
function handSlotHtml(label, ht) {
  const empty = !ht;
  const color = handTypeColorHex(ht);
  return `<div style="background:linear-gradient(180deg,#1a0f08,#0a0503);border:2px solid #3a2818;border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;gap:10px;align-items:center;${empty?"opacity:0.55;":"box-shadow:inset 0 0 10px " + color + "33;"}">
    <div style="width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 40% 40%, ${color}, #000);box-shadow:0 0 12px ${color}80;"></div>
    <div style="flex:1;">
      <div style="font-size:11px;color:#8a7050;letter-spacing:1px;">${label}</div>
      <div style="font-size:16px;color:${empty?"#666":color};font-weight:bold;">${empty?"Пусто":handTypeName(ht)}</div>
      <div style="font-size:12px;color:#c0a070;">${empty?"":spellName(ht)}</div>
    </div>
  </div>`;
}
function passiveSlotHtml(id, isSpare = false) {
  const empty = !id;
  const info = itemInfo(id);
  return `<div style="background:linear-gradient(180deg,#1a0f08,#0a0503);border:2px solid ${empty?"#3a2818":info.color};border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;gap:10px;align-items:center;${empty?"opacity:0.55;":""}">
    <div style="width:44px;height:44px;border-radius:8px;background:${empty?"#1a0f08":info.color+"33"};border:1px solid ${info.color};display:flex;align-items:center;justify-content:center;color:${info.color};font-size:24px;">${empty?"":info.glyph}</div>
    <div style="flex:1;">
      <div style="font-size:11px;color:#8a7050;letter-spacing:1px;">${isSpare?"ЗАПАС":"ПАССИВ (надето)"}</div>
      <div style="font-size:16px;color:${empty?"#666":info.color};font-weight:bold;">${empty?"Пусто":info.name}</div>
      <div style="font-size:12px;color:#c0a070;">${empty?"":info.effect}</div>
    </div>
  </div>`;
}
function renderLoadoutPanel() {
  if (!myPlayer) return;
  const hpEl = document.getElementById("loadoutHp");
  if (hpEl) hpEl.textContent = `HP: ${Math.round(myPlayer.hp)}/${myPlayer.maxHp || 3}` + (myPlayer.isGhost ? "  • НАБЛЮДАТЕЛЬ" : "");
  const eqEl = document.getElementById("lpEquip");
  if (eqEl) {
    const eq = EQUIPMENT[myPlayer.equipmentId || "HEAL"] || EQUIPMENT.HEAL;
    eqEl.textContent = (eq.name || "аптечка") + (myPlayer.droneCount ? ` · дроны ${myPlayer.droneCount}` : "");
  }
  const ps = document.getElementById("lpPassivesV31");
  if (ps) {
    const stacks = stackedPassives(myPlayer);
    if (!stacks.length) ps.textContent = "пусто — сундуки за золото на арене";
    else ps.innerHTML = stacks.map(s => `${s.glyph || "•"} ${s.name || s.id} ×${s.n}<div style="opacity:.7;font-size:11px;">${s.effect || ""}</div>`).join("");
  }
  renderCardHud();
}

// Чат (внизу слева)
const chatBox = document.createElement("div");
chatBox.style.cssText = "position:fixed;left:12px;bottom:60px;width:420px;max-height:200px;overflow:hidden;pointer-events:none;z-index:15;display:flex;flex-direction:column;justify-content:flex-end;font-family:sans-serif;font-size:14px;";
document.body.appendChild(chatBox);

const chatInput = document.createElement("input");
chatInput.type = "text";
chatInput.maxLength = 200;
chatInput.placeholder = "сообщение...";
chatInput.style.cssText = "position:fixed;left:12px;bottom:20px;width:420px;padding:8px 10px;background:rgba(0,0,0,0.75);border:1px solid #555;color:#fff;font-family:sans-serif;font-size:14px;outline:none;z-index:20;display:none;";
document.body.appendChild(chatInput);
chatInput.addEventListener("keydown", (ev) => {
  ev.stopPropagation(); // чтобы канвас-листенер не ловил W/A/S/D
  if (ev.code === "Enter") {
    const text = chatInput.value.trim();
    if (text && room) room.send("chat", { text });
    chatInput.value = "";
    chatInput.style.display = "none";
    chatInput.blur();
    chatOpen = false;
    ev.preventDefault();
    return;
  }
  if (ev.code === "Escape") {
    chatInput.value = "";
    chatInput.style.display = "none";
    chatInput.blur();
    chatOpen = false;
    ev.preventDefault();
  }
});

let chatOpen = false;
// Escape в чат-инпуте закрывает без отправки
// (иначе pointerlock перехватывает и мы в лимбе)
function addChatMessage(name, text, self = false) {
  const line = document.createElement("div");
  line.style.cssText = "padding:4px 8px;margin-top:2px;background:rgba(0,0,0,0.55);color:#fff;text-shadow:0 0 4px #000;border-radius:4px;word-wrap:break-word;";
  line.innerHTML = `<span style="color:${self ? '#ffaa44' : '#66ccff'};font-weight:bold">${escapeHtml(name)}:</span> ${escapeHtml(text)}`;
  chatBox.appendChild(line);
  // Авто-удаление через 10 секунд
  setTimeout(() => {
    line.style.transition = "opacity 1s";
    line.style.opacity = "0";
    setTimeout(() => line.remove(), 1000);
  }, 10000);
  // Ограничение на число видимых
  while (chatBox.children.length > 10) chatBox.children[0].remove();
}
// ── ДЕБАГ-ПАНЕЛЬ ──────────────────────────────────────
const debugPanel = document.getElementById("debug-panel");
let debugOpen = false;
let debugSyncing = false;
function toggleDebugPanel() {
  debugOpen = !debugOpen;
  debugPanel.style.display = debugOpen ? "block" : "none";
  if (debugOpen) {
    if (window.room?.state) syncDebugPanelFromState(window.room.state);
    if (window.controller?.releasePointer) window.controller.releasePointer();
  } else {
    if (window.controller?.enable) window.controller.enable();
  }
}
function sendDebug(payload) {
  if (debugSyncing) return;
  if (window.room) window.room.send("debug", payload);
}
// Привязка обработчиков (после DOMContentLoaded — но HTML уже в памяти)
(function initDebugPanel() {
  const god = document.getElementById("dbg-god");
  const ammo = document.getElementById("dbg-ammo");
  const speed = document.getElementById("dbg-speed");
  const dmg = document.getElementById("dbg-dmg");
  const spawn = document.getElementById("dbg-spawn");
  if (!god) return;
  god.addEventListener("change", () => sendDebug({ god: god.checked }));
  ammo.addEventListener("change", () => sendDebug({ infAmmo: ammo.checked }));
  speed.addEventListener("input", () => {
    document.getElementById("dbg-speed-v").textContent = speed.value;
    sendDebug({ speedMul: parseFloat(speed.value) });
  });
  dmg.addEventListener("input", () => {
    document.getElementById("dbg-dmg-v").textContent = dmg.value;
    sendDebug({ damageMul: parseFloat(dmg.value) });
  });
  spawn.addEventListener("input", () => {
    document.getElementById("dbg-spawn-v").textContent = spawn.value;
    sendDebug({ spawnMul: parseFloat(spawn.value) });
  });
  // Ползунок громкости — локальный, без синхрона
  const vol = document.getElementById("dbg-vol");
  const volV = document.getElementById("dbg-vol-v");
  if (vol && volV) {
    const cur = Math.round(getMasterVolume() * 100);
    vol.value = String(cur);
    volV.textContent = String(cur);
    vol.addEventListener("input", () => {
      const v = parseInt(vol.value, 10) / 100;
      volV.textContent = String(vol.value);
      setMasterVolume(v);
    });
  }
  document.querySelectorAll(".dbg-btn").forEach(b => {
    b.addEventListener("click", () => {
      if (b.dataset.giveHand && b.dataset.giveType) {
        sendDebug({ action: "giveWeapon", hand: b.dataset.giveHand, type: b.dataset.giveType });
      } else if (b.dataset.giveWeapon) {
        // v0.0.3.4: выдать оружие в weaponSlot (меч)
        sendDebug({ action: "giveWeaponSlot", type: b.dataset.giveWeapon });
      } else if (b.dataset.act) {
        sendDebug({ action: b.dataset.act });
      }
    });
  });
  const fly = document.getElementById("dbg-fly");
  if (fly) fly.addEventListener("change", () => sendDebug({ fly: fly.checked }));
  // Локальные ползунки: дальность и пикселизация
  const far = document.getElementById("dbg-far");
  const farV = document.getElementById("dbg-far-v");
  if (far && farV) {
    const savedFar = parseInt(localStorage.getItem("rain_far") || "500", 10);
    far.value = String(savedFar); farV.textContent = String(savedFar);
    if (window.__setRenderFar) window.__setRenderFar(savedFar);
    far.addEventListener("input", () => {
      const v = parseInt(far.value, 10);
      farV.textContent = String(v);
      localStorage.setItem("rain_far", String(v));
      if (window.__setRenderFar) window.__setRenderFar(v);
    });
  }
  // v0.0.3.1: dithering + weapon damage
  const dith = document.getElementById("dbg-dither");
  const dithV = document.getElementById("dbg-dither-v");
  if (dith && dithV) {
    dith.addEventListener("input", () => {
      dithV.textContent = dith.value;
      // v0.0.3.4: дизеринг — локальный post-effect (глобально ко всей сцене)
      if (window.__setDither) window.__setDither(parseInt(dith.value, 10));
      sendDebug({ dither: parseInt(dith.value, 10) });
    });
    // инитциализация стартового значения
    setTimeout(() => { if (window.__setDither) window.__setDither(parseInt(dith.value, 10)); }, 100);
  }
  const wdmg = document.getElementById("dbg-wdmg");
  const wdmgV = document.getElementById("dbg-wdmg-v");
  if (wdmg && wdmgV) {
    wdmg.addEventListener("input", () => {
      wdmgV.textContent = wdmg.value;
      sendDebug({ weaponDmgMul: parseFloat(wdmg.value) });
    });
  }
  const pix = document.getElementById("dbg-pix");
  const pixV = document.getElementById("dbg-pix-v");
  if (pix && pixV) {
    const savedPix = parseInt(localStorage.getItem("rain_pix") || "2", 10);
    pix.value = String(savedPix); pixV.textContent = String(savedPix);
    if (window.__setPixelScale) window.__setPixelScale(savedPix);
    pix.addEventListener("input", () => {
      const v = parseInt(pix.value, 10);
      pixV.textContent = String(v);
      localStorage.setItem("rain_pix", String(v));
      if (window.__setPixelScale) window.__setPixelScale(v);
    });
  }
})();

// ==== HUD: HP-бар, damage numbers, cooldown-индикаторы ====
function updateHpBar(hp, maxHp) {
  const fill = document.getElementById("hp-fill");
  const text = document.getElementById("hp-text");
  if (!fill || !text) return;
  const pct = Math.max(0, Math.min(1, hp / (maxHp || 1)));
  fill.style.width = (pct * 100).toFixed(1) + "%";
  const lv = (typeof myPlayer !== "undefined" && myPlayer && myPlayer.survivorLevel) ? myPlayer.survivorLevel : 1;
  text.textContent = `${Math.round(hp)} / ${Math.round(maxHp)}  ·  ур.${lv}`;
  // Зелёный → жёлтый → красный
  if (pct > 0.6) fill.style.background = "linear-gradient(90deg, #4bd85a, #7fd83a)";
  else if (pct > 0.3) fill.style.background = "linear-gradient(90deg, #d8b03a, #d87f3a)";
  else fill.style.background = "linear-gradient(90deg, #d83a3a, #d85a5a)";
}
function spawnScreenDmgNumber(amount, isCrit) {
  const wrap = document.getElementById("dmg-numbers");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "dmg-num";
  el.textContent = "-" + Math.round(amount);
  el.style.color = isCrit ? "#ffaa22" : "#ff5555";
  el.style.left = (window.innerWidth / 2 + (Math.random() - 0.5) * 200) + "px";
  el.style.top = (window.innerHeight / 2 + 40) + "px";
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}
// Мировые damage numbers (над врагом) — проецируем 3D-координату на экран
function spawnWorldDmgNumber(worldPos, amount) {
  const wrap = document.getElementById("dmg-numbers");
  if (!wrap) return;
  const v = worldPos.clone().project(camera);
  if (v.z > 1) return; // за камерой
  const el = document.createElement("div");
  el.className = "dmg-num";
  el.textContent = String(Math.round(amount));
  el.style.color = "#ffee66";
  el.style.fontSize = "16px";
  el.style.left = ((v.x + 1) / 2 * window.innerWidth + (Math.random() - 0.5) * 30) + "px";
  el.style.top = ((1 - v.y) / 2 * window.innerHeight + (Math.random() - 0.5) * 20) + "px";
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}
// Кулдаун-индикаторы (вызываем в каждом кадре)
let cdLeftEndMs = 0, cdRightEndMs = 0, cdLeftDurMs = 250, cdRightDurMs = 250;
function startCooldown(hand, durMs) {
  if (hand === "left") { cdLeftEndMs = performance.now() + durMs; cdLeftDurMs = durMs; }
  else { cdRightEndMs = performance.now() + durMs; cdRightDurMs = durMs; }
}
function updateCooldownHud() {
  const now = performance.now();
  const l = document.querySelector("#cd-left .fill");
  const r = document.querySelector("#cd-right .fill");
  if (l) {
    const rem = Math.max(0, cdLeftEndMs - now);
    l.style.height = (rem / cdLeftDurMs * 100).toFixed(0) + "%";
  }
  if (r) {
    const rem = Math.max(0, cdRightEndMs - now);
    r.style.height = (rem / cdRightDurMs * 100).toFixed(0) + "%";
  }
}
// Синхронизация панели с серверным состоянием (вызвать после подключения)
function syncDebugPanelFromState(state) {
  if (!state) return;
  debugSyncing = true;
  try {
    const g = document.getElementById("dbg-god"); if (g) g.checked = !!state.dbgGodMode;
    const a = document.getElementById("dbg-ammo"); if (a) a.checked = !!state.dbgInfiniteAmmo;
    const sp = document.getElementById("dbg-speed"); if (sp && state.dbgSpeedMul) { sp.value = state.dbgSpeedMul; const el = document.getElementById("dbg-speed-v"); if (el) el.textContent = state.dbgSpeedMul; }
    const dm = document.getElementById("dbg-dmg"); if (dm && state.dbgDamageMul) { dm.value = state.dbgDamageMul; const el = document.getElementById("dbg-dmg-v"); if (el) el.textContent = state.dbgDamageMul; }
    const sw = document.getElementById("dbg-spawn"); if (sw && state.dbgSpawnMul != null) { sw.value = state.dbgSpawnMul; const el = document.getElementById("dbg-spawn-v"); if (el) el.textContent = state.dbgSpawnMul; }
    const fl = document.getElementById("dbg-fly"); if (fl) fl.checked = !!state.dbgFly;
  } finally {
    debugSyncing = false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ═══════════════════════════════════════════════════════════════════
// РЕНДЕР
// ═══════════════════════════════════════════════════════════════════
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
// НЕ обрезаем dpr — иначе на Retina Mac (dpr=2) буфер в 2× меньше канваса → aspect врёт → прицел уезжает
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setClearColor(0x1a2030);

const scene = new THREE.Scene();
// Без тумана — чтобы было видно всё.
// Общее яркое освещение в самой scene (не в группах), чтобы всё гарантированно освещалось.
scene.add(new THREE.AmbientLight(0xffffff, 1.4));
const globalHemi = new THREE.HemisphereLight(0xffffff, 0x776655, 1.2);
scene.add(globalHemi);

// На коротком экране ноутбука чуть шире FOV — иначе при 100% zoom кадр кажется «в упор».
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.01, 500);

// ПИКСЕЛИЗАЦИЯ (Devil Daggers-style): рендер в low-res рендер-таргет + upscale NEAREST
let pixelScale = 1; // 1 = отключено
let rtLowRes = null;
let postScene = null, postCamera = null, postMesh = null;
// v0.0.3.4: post-effect с глобальным дизерингом ко всей сцене (не только туман)
function ensurePostFx() {
  if (postScene) return;
  postScene = new THREE.Scene();
  postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      uDither: { value: 3.0 },
      uTime:   { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tScene;
      uniform float uDither; // сила дизера 1..10
      uniform float uTime;
      varying vec2 vUv;
      // Bayer 4x4
      float bayer(vec2 p){
        int x = int(mod(p.x, 4.0));
        int y = int(mod(p.y, 4.0));
        int i = y*4 + x;
        float m[16];
        m[0]=0.0/16.0;  m[1]=8.0/16.0;  m[2]=2.0/16.0;  m[3]=10.0/16.0;
        m[4]=12.0/16.0; m[5]=4.0/16.0;  m[6]=14.0/16.0; m[7]=6.0/16.0;
        m[8]=3.0/16.0;  m[9]=11.0/16.0; m[10]=1.0/16.0; m[11]=9.0/16.0;
        m[12]=15.0/16.0;m[13]=7.0/16.0; m[14]=13.0/16.0;m[15]=5.0/16.0;
        return m[i] - 0.5;
      }
      void main(){
        vec4 c = texture2D(tScene, vUv);
        vec2 pix = gl_FragCoord.xy;
        float d = bayer(pix) * (uDither / 32.0);
        c.rgb += vec3(d);
        // Квантование цвета — цвета становятся видимо-дизерными
        c.rgb = floor(c.rgb * 32.0) / 32.0;
        gl_FragColor = c;
      }
    `,
    depthTest: false, depthWrite: false,
  });
  postMesh = new THREE.Mesh(geo, mat);
  postScene.add(postMesh);
  window.__setDither = (v) => { mat.uniforms.uDither.value = v; };
}
function resizeLowResRT() {
  const w = Math.max(80, Math.floor(window.innerWidth / pixelScale));
  const h = Math.max(60, Math.floor(window.innerHeight / pixelScale));
  if (rtLowRes) rtLowRes.dispose();
  rtLowRes = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false,
  });
  if (postMesh) {
    if (postMesh.material.uniforms && postMesh.material.uniforms.tScene) {
      postMesh.material.uniforms.tScene.value = rtLowRes.texture;
    } else {
      postMesh.material.map = rtLowRes.texture;
    }
  }
}
window.__setPixelScale = (v) => {
  pixelScale = Math.max(1, parseInt(v, 10) || 1);
  if (pixelScale > 1) { ensurePostFx(); resizeLowResRT(); }
};
window.__setRenderFar = (v) => {
  // v0.0.3.4: дальность на самом деле — туман + camera.far. Меняем вместе, чтобы картинка реально была как выбрал.
  const far = Math.max(50, parseInt(v, 10) || 500);
  camera.far = far;
  camera.updateProjectionMatrix();
  if (scene && scene.fog) {
    scene.fog.near = Math.max(20, far * 0.6);
    scene.fog.far  = far;
  }
};

function layoutHudScale() {
  const vv = window.visualViewport;
  const insetBottom = vv ? Math.max(0, window.innerHeight - vv.offsetTop - vv.height) : 0;
  fpsHud.style.left = "50%";
  fpsHud.style.right = "auto";
  fpsHud.style.bottom = `calc(-8% + ${insetBottom}px)`;
  fpsHud.style.width = "min(34vw, 300px)";
  fpsHud.style.height = "min(22vh, 190px)";
  fpsHud.style.transformOrigin = "50% 100%";
  fpsHud.style.transform = "translateX(-50%) rotateX(-50deg)";
  fpsHud.style.perspective = "560px";
  weaponHud.style.right = "1.6vw";
  weaponHud.style.bottom = `calc(1.2vh + ${insetBottom}px)`;
  weaponHud.style.left = "auto";
  wpnCdHud.style.left = "16px";
  wpnCdHud.style.bottom = (42 + insetBottom) + "px";
  cardHud.style.left = "16px";
  cardHud.style.bottom = (92 + insetBottom) + "px";
}

function fitToViewport() {
  const vv = window.visualViewport;
  const w = Math.max(1, Math.floor((vv && vv.width) || window.innerWidth));
  const h = Math.max(1, Math.floor((vv && vv.height) || window.innerHeight));
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.fov = h < 700 ? 62 : (h < 850 ? 58 : 55);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h, false);
  layoutHudScale();
}
window.addEventListener("resize", fitToViewport);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", fitToViewport);
  window.visualViewport.addEventListener("scroll", fitToViewport);
}
fitToViewport();

// ── Разные сцены для хаба/арены (отдельные пространства) ────────
const hubGroup = new THREE.Group();
const arenaGroup = new THREE.Group();
// Хаб парит "в космосе" — можно сместить по Y для отдельности
scene.add(hubGroup, arenaGroup);
if (V3_MODE) {
  // v0.0.3.4 — включаем ХАБ (старт в нём) + арена (V3 террайн)
  setupHub(hubGroup);
  setupTerrainV3(arenaGroup, 0);
  hubGroup.visible = true;      // виден в phase==="hub"
  arenaGroup.visible = false;    // показывается когда игрок перейдёт на арену
  // v0.0.3.6: туман только на арене. В хабе его нет — всё ясно видно.
  scene.fog = null;
  window.__ARENA_FOG = new THREE.Fog(0x000000, 60, 100);
} else {
  setupHub(hubGroup);
  setupArena(arenaGroup);
  arenaGroup.visible = false;
}

// ── Руки: детальные 3D-модели ────────────────────────────────────
const handsRoot = createHandsGroup();
camera.add(handsRoot);
scene.add(camera);
// v3: скрываем 3D руки — вместо них плоский HUD-меч (см. sword-hand.jpg)
handsRoot.userData.leftHand.visible = !V3_MODE;
handsRoot.userData.rightHand.visible = !V3_MODE;
handsRoot.visible = !V3_MODE;
// ФОРС видимости рук: renderOrder=999 + depthTest=false + frustumCulled=false
// — чтобы руки точно рисовались поверх всего и никогда не обрезались
handsRoot.renderOrder = 999;
handsRoot.traverse((obj) => {
  if (obj.isMesh) {
    obj.renderOrder = 999;
    obj.frustumCulled = false;
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => { if (m) { m.depthTest = false; m.depthWrite = false; } });
    }
  }
});

// Диагностика mac Chrome: логируем ключевые параметры в консоль
console.log("[rrain diag]",
  "DPR:", window.devicePixelRatio,
  "innerSize:", window.innerWidth + "x" + window.innerHeight,
  "canvas:", canvas.width + "x" + canvas.height,
  "UA:", navigator.userAgent);
// GL renderer info — важно для Mac (SwiftShader/ANGLE bug)
try {
  const gl = renderer.getContext();
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  if (dbg) console.log("[rrain diag] GPU:", gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
} catch {}

// ═══════════════════════════════════════════════════════════════════
// ХРАНИЛИЩА МЕШЕЙ
// ═══════════════════════════════════════════════════════════════════
// Враги: {mesh, targetX, targetY, targetZ, prevX, prevZ}
const enemyMeshes = new Map();

// Другие игроки: {mesh, targetX, targetY, targetZ, targetYaw, prevX, prevZ}
const otherPlayers = new Map();
let colorIdxCounter = 0;

// Пикапы = пьедесталы
const pickupMeshes = new Map();
function makePickupMesh(pk) {
  const shrineTint = {
    SHRINE_BLOOD: [0xff2244, 0x880011],
    SHRINE_CHANCE: [0x44eebb, 0x116644],
    SHRINE_COMBAT: [0xffaa22, 0x884400],
    SHRINE_NEWT: [0x6688ff, 0x2233aa],
    SCRAPPER: [0x99aacc, 0x223344],
    PRINTER: [0x66ccff, 0x114466],
    DRONE: [0xdddd88, 0x555522],
    EQUIP: [0xff88cc, 0x662244],
    BLUE_PORTAL: [0x4466ff, 0x112288],
    RETURN_PORTAL: [0xaa88ff, 0x442266],
    BAZAAR_ITEM: [0x6688ff, 0x223388],
    BAZAAR_SKIP: [0x88aaff, 0x224466],
    CHEST_LARGE: [0xffcc44, 0x664400],
    CHEST_TRIPLE: [0x88ffaa, 0x226644],
  };
  if (shrineTint[pk.kind]) {
    const ped = createPedestalMesh("ACCESSORY", "bone");
    const [col, em] = shrineTint[pk.kind];
    if (ped.userData.crystal) {
      ped.userData.crystal.material = ped.userData.crystal.material.clone();
      ped.userData.crystal.material.color.setHex(col);
      ped.userData.crystal.material.emissive.setHex(em);
    }
    if ((pk.kind === "PRINTER" || pk.kind === "EQUIP" || pk.kind === "BAZAAR_ITEM") && pk.itemId) {
      const loot = createFloatingLootCard("ITEM:" + pk.itemId);
      loot.position.y = 2.22;
      ped.add(loot);
      ped.userData.floatCard = loot.userData.floatCard;
      ped.userData.floatBaseY = loot.userData.floatBaseY;
    }
    return ped;
  }
  const isChest = pk.kind === "CHEST" || pk.kind === "CHEST_LARGE" || pk.kind === "CHEST_TRIPLE" || (pk.goldCost || 0) > 0;
  const lootKey = isChest
    ? ("ITEM:" + String(pk.itemId || pk.handType || "").split("|")[0])
    : (pk.kind + ":" + (pk.handType || pk.itemId || ""));
  const ped = createPedestalMesh(isChest ? "ACCESSORY" : "HAND", "bone");
  if (ped.userData.crystal) ped.userData.crystal.visible = false;
  const loot = createFloatingLootCard(lootKey);
  loot.position.y = 2.22;
  ped.add(loot);
  ped.userData.floatCard = loot.userData.floatCard;
  ped.userData.floatBaseY = loot.userData.floatBaseY;
  ped.userData.goldCost = pk.goldCost || 0;
  return ped;
}


// ── Хабовое хранилище: 3D-меши слотов/сундуков ─────────
const hubSlotMeshes = [];   // index → group
const hubChestMeshes = [];  // index → group
let hubStorageInitDone = false;

function ensureHubStorageInit() {
  if (hubStorageInitDone || !room || !room.state) return;
  const slots = room.state.hubSlots;
  const chests = room.state.hubChests;
  if (!slots || !chests || slots.length === 0 || chests.length === 0) return;
  slots.forEach((s, i) => {
    const g = createHubSlotMesh();
    g.position.set(s.pos.x, 0, s.pos.z);
    if (s.pos.x || s.pos.z) g.rotation.y = Math.atan2(-s.pos.x, -s.pos.z);
    hubGroup.add(g);
    hubSlotMeshes[i] = g;
    refreshSlotContent(i, s);
    if (typeof s.onChange === "function") s.onChange(() => refreshSlotContent(i, s));
  });
  chests.forEach((c, i) => {
    const g = createHubChestMesh();
    g.position.set(c.pos.x, 0, c.pos.z);
    if (c.pos.x || c.pos.z) g.rotation.y = Math.atan2(-c.pos.x, -c.pos.z);
    hubGroup.add(g);
    hubChestMeshes[i] = g;
    updateChestCount(g, c.contents.length);
    if (c.contents && typeof c.contents.onChange === "function") {
      c.contents.onChange(() => updateChestCount(g, c.contents.length));
    }
    if (c.contents && typeof c.contents.onAdd === "function") {
      c.contents.onAdd(() => updateChestCount(g, c.contents.length));
    }
    if (c.contents && typeof c.contents.onRemove === "function") {
      c.contents.onRemove(() => updateChestCount(g, c.contents.length));
    }
  });
  hubStorageInitDone = true;
}

function refreshSlotContent(i, s) {
  const g = hubSlotMeshes[i];
  if (!g) return;
  const mount = g.userData.contentMount;
  while (mount.children.length) {
    const c = mount.children[0];
    mount.remove(c); disposeGroup(c);
  }
  if (!s.empty) {
    const content = makeSlotContent(s.kind, s.handType);
    mount.add(content);
    g.userData.emptyRing.material.opacity = 0.15;
    g.userData.floatCard = content.userData.floatCard || null;
    g.userData.floatBaseY = content.userData.floatBaseY ?? 1.075;
  } else {
    g.userData.emptyRing.material.opacity = 0.35;
    g.userData.floatCard = null;
  }
}

// FX — все fx-меши используют общие (shared) geometry, а материалы клонируются с одного базового шаблона.
// Это убирает GC-спайки при массовых попаданиях (главная причина 0 FPS).
const shots = [];
const MAX_SHOT_FX = 120;                // жёсткий потолок; старые выбрасываются
const FX_GEOM = {
  sphereSmall: new THREE.SphereGeometry(0.35, 8, 6),
  sphereHalo:  new THREE.SphereGeometry(0.8, 8, 6),
  sphereFlash: new THREE.SphereGeometry(0.6, 10, 6),
  sphereChip:  new THREE.SphereGeometry(0.09, 5, 3),
  ringShot:    new THREE.RingGeometry(0.3, 0.8, 12),
  ringSmoke:   new THREE.RingGeometry(0.2, 1.2, 16),
  ringWave:    new THREE.RingGeometry(0.2, 1.0, 20),
  // Кристаллический ледяной шип (ICE)
  iceShard:    new THREE.OctahedronGeometry(0.45, 0),
  starCore:    new THREE.OctahedronGeometry(0.38, 0),
  boneHead:    new THREE.ConeGeometry(0.25, 0.6, 6),
  daggerBlade: new THREE.ConeGeometry(0.11, 0.95, 5),
  daggerGuard: new THREE.BoxGeometry(0.32, 0.06, 0.08),
  daggerHilt:  new THREE.CylinderGeometry(0.045, 0.05, 0.28, 6),
};
const FX_MAT_TPL = {
  basic:  new THREE.MeshBasicMaterial({ color: 0xffffff }),
  halo:   new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }),
  ring:   new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
  chip:   new THREE.MeshBasicMaterial({ color: 0x992222 }),
  flash:  new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.9 }),
  smoke:  new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  wave:   new THREE.MeshBasicMaterial({ color: 0xa080ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
};
function pushShot(entry) {
  shots.push(entry);
  // Лимит: если переполнили — старейший убираем немедленно
  if (shots.length > MAX_SHOT_FX) {
    const old = shots.shift();
    if (old && old.mesh) {
      scene.remove(old.mesh);
      if (old.mesh.userData && old.mesh.userData.disposeExtras) old.mesh.userData.disposeExtras();
      // материал клон, geometry общая — диспозим только материал
      disposeMatOnly(old.mesh);
    }
  }
}
function disposeMatOnly(obj) {
  obj.traverse?.(o => {
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(mt => mt.dispose?.());
      else o.material.dispose?.();
    }
  });
  if (obj.material && !obj.traverse) {
    if (Array.isArray(obj.material)) obj.material.forEach(mt => mt.dispose?.());
    else obj.material.dispose?.();
  }
}
// Цвета из SPELLS: FIRE=0xff5a1f, ICE=0x66ccff, BONE=0xffe0a0.
// Разветвляем визуал по цвету, чтобы не менять протокол.
function spawnShotFx(x, y, z, color, dx = 0, dy = 0, dz = 0) {
  const speed = 40;
  const vx = dx * speed, vy = dy * speed, vz = dz * speed;
  if (color === 0x66ccff) {
    spawnIceShardFx(x, y, z, color, vx, vy, vz);
  } else if (color === 0xffe0a0) {
    spawnLightningFx(x, y, z, color, vx, vy, vz);
  } else {
    spawnFireballFx(x, y, z, color, vx, vy, vz);
  }
  // Общее кольцо вспышки в точке каста (остаётся)
  const matRing = FX_MAT_TPL.ring.clone(); matRing.color.setHex(color);
  const ring = new THREE.Mesh(FX_GEOM.ringShot, matRing);
  ring.position.set(x, y, z);
  ring.lookAt(camera.position);
  scene.add(ring);
  pushShot({ mesh: ring, ttl: 0.25, maxTtl: 0.25, vx: 0, vy: 0, vz: 0 });
}

// ── FIRE: шар с ореолом (было раньше)
function spawnFireballFx(x, y, z, color, vx, vy, vz, ttl = 1.2) {
  const matBody = FX_MAT_TPL.basic.clone(); matBody.color.setHex(color);
  const m = new THREE.Mesh(FX_GEOM.sphereSmall, matBody);
  m.position.set(x, y, z);
  const matHalo = FX_MAT_TPL.halo.clone(); matHalo.color.setHex(color);
  const halo = new THREE.Mesh(FX_GEOM.sphereHalo, matHalo);
  m.add(halo);
  scene.add(m);
  pushShot({ mesh: m, ttl, maxTtl: ttl, vx, vy, vz });
}

function spawnHitscanFx(x, y, z, tx, ty, tz, color) {
  const pts = [];
  const segs = 10;
  const dx = tx - x, dy = ty - y, dz = tz - z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const px = -dz / len, pz = dx / len;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const wob = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * 0.45;
    pts.push(x + dx * t + px * wob, y + dy * t + wob * 0.3, z + dz * t + pz * wob);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 20;
  scene.add(line);
  line.userData.disposeExtras = () => { geo.dispose(); mat.dispose(); };
  pushShot({ mesh: line, ttl: 0.28, maxTtl: 0.28, vx: 0, vy: 0, vz: 0 });
}

function spawnSmokeFx(x, y, z, blow) {
  const n = blow ? 10 : 4;
  for (let i = 0; i < n; i++) {
    const mat = FX_MAT_TPL.halo.clone();
    mat.color.setHex(0xaaaaaa);
    mat.opacity = 0.35;
    const m = new THREE.Mesh(FX_GEOM.sphereHalo, mat);
    m.position.set(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2);
    scene.add(m);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const sp = blow ? 3.5 : 0.9;
    pushShot({
      mesh: m, ttl: blow ? 1.6 : 0.9, maxTtl: blow ? 1.6 : 0.9,
      vx: dir.x * sp + (Math.random() - 0.5),
      vy: 0.6 + Math.random() * 0.8,
      vz: dir.z * sp + (Math.random() - 0.5),
    });
  }
}

function spawnStarBoltFx(x, y, z, dx, dy, dz, speed = 34, homeId = "") {
  const g = new THREE.Group();
  const mat = FX_MAT_TPL.basic.clone(); mat.color.setHex(0xff66cc);
  const core = new THREE.Mesh(FX_GEOM.starCore, mat);
  const spike = new THREE.Mesh(FX_GEOM.starCore, mat.clone());
  spike.rotation.z = Math.PI / 2;
  spike.scale.set(0.45, 1.7, 0.45);
  core.scale.set(1.1, 0.55, 1.1);
  g.add(core, spike);
  const haloMat = FX_MAT_TPL.halo.clone(); haloMat.color.setHex(0xff40a0); haloMat.opacity = 0.7;
  const halo = new THREE.Mesh(FX_GEOM.sphereHalo, haloMat);
  halo.scale.setScalar(0.85);
  g.add(halo);
  g.position.set(x, y, z);
  scene.add(g);
  const L = Math.hypot(dx, dy, dz) || 1;
  pushShot({
    mesh: g, ttl: 2.6, maxTtl: 2.6,
    vx: dx / L * speed, vy: dy / L * speed, vz: dz / L * speed,
    spin: 10, homeId: homeId || "",
  });
}

function spawnDaggerFx(x, y, z, dx, dy, dz, speed = 38, homeId = "") {
  const g = new THREE.Group();
  const bladeMat = FX_MAT_TPL.basic.clone(); bladeMat.color.setHex(0xd8e4ee);
  const guardMat = FX_MAT_TPL.basic.clone(); guardMat.color.setHex(0x6a4428);
  const blade = new THREE.Mesh(FX_GEOM.daggerBlade, bladeMat);
  blade.rotation.x = Math.PI / 2;
  blade.position.z = 0.28;
  const guard = new THREE.Mesh(FX_GEOM.daggerGuard, guardMat);
  const hilt = new THREE.Mesh(FX_GEOM.daggerHilt, guardMat);
  hilt.rotation.x = Math.PI / 2;
  hilt.position.z = -0.22;
  g.add(blade, guard, hilt);
  g.position.set(x, y, z);
  const L = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / L, uy = dy / L, uz = dz / L;
  g.lookAt(x + ux, y + uy, z + uz);
  scene.add(g);
  pushShot({
    mesh: g, ttl: 3.2, maxTtl: 3.2,
    vx: ux * speed, vy: uy * speed, vz: uz * speed,
    spin: 18, homeId: homeId || "", align: true,
  });
}

const starShieldGroup = new THREE.Group();
{
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff79d2, transparent: true, opacity: 0.95, depthWrite: false });
    const s = new THREE.Mesh(FX_GEOM.iceShard, mat);
    s.userData.ang = (i / 12) * Math.PI * 2;
    s.scale.setScalar(0.28);
    starShieldGroup.add(s);
  }
  starShieldGroup.visible = false;
  starShieldGroup.renderOrder = 8;
  scene.add(starShieldGroup);
}
const otherShields = new Map();
function syncOrbitShield(group, x, y, z, dt) {
  group.visible = true;
  group.position.set(x, y, z);
  const t = performance.now() * 0.001;
  group.children.forEach((ch, i) => {
    if (ch.userData.ang == null) ch.userData.ang = (i / Math.max(1, group.children.length)) * Math.PI * 2;
    const a = ch.userData.ang + t * 2.6;
    ch.position.set(Math.cos(a) * 1.45, Math.sin(a * 2) * 0.32, Math.sin(a) * 1.45);
    ch.rotation.y += dt * 4;
  });
}

// ── ICE: вращающийся кристаллический шип с бледным свечением
function spawnIceShardFx(x, y, z, color, vx, vy, vz) {
  const mat = FX_MAT_TPL.basic.clone(); mat.color.setHex(0xffffff);
  const m = new THREE.Mesh(FX_GEOM.iceShard, mat);
  m.position.set(x, y, z);
  // цветной halo вокруг
  const haloMat = FX_MAT_TPL.halo.clone(); haloMat.color.setHex(color);
  const halo = new THREE.Mesh(FX_GEOM.sphereHalo, haloMat);
  halo.scale.setScalar(0.7);
  m.add(halo);
  scene.add(m);
  pushShot({ mesh: m, ttl: 1.2, maxTtl: 1.2, vx, vy, vz, spin: 8 });
}

// ── BONE: конус-головка + зигзаг-хвост (молния)
// Хвост — одна общая BufferGeometry на каждый выстрел (маленькая), материал общий клонируемый
function spawnLightningFx(x, y, z, color, vx, vy, vz) {
  // головка
  const headMat = FX_MAT_TPL.basic.clone(); headMat.color.setHex(color);
  const head = new THREE.Mesh(FX_GEOM.boneHead, headMat);
  head.position.set(x, y, z);
  // ориентируем конус по направлению полёта
  const dirLen = Math.hypot(vx, vy, vz) || 1;
  head.lookAt(x + vx / dirLen, y + vy / dirLen, z + vz / dirLen);
  head.rotateX(Math.PI / 2); // конус по-умолчанию вверх — повернем
  scene.add(head);
  pushShot({ mesh: head, ttl: 1.5, maxTtl: 1.5, vx, vy, vz });

  // зигзаг-луч позади головки (короткий хвост, быстро гаснет)
  const segs = 6;
  const pts = new Float32Array(segs * 3);
  const nx = -vx / dirLen, ny = -vy / dirLen, nz = -vz / dirLen;
  const perpAx = ny, perpAy = -nx, perpAz = 0; // примерный перпендикуляр
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const dist = t * 2.2; // общая длина хвоста
    const wob = i === 0 || i === segs - 1 ? 0 : (Math.random() - 0.5) * 0.55;
    pts[i * 3    ] = nx * dist + perpAx * wob;
    pts[i * 3 + 1] = ny * dist + perpAy * wob;
    pts[i * 3 + 2] = nz * dist + perpAz * wob;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, linewidth: 2 });
  const line = new THREE.Line(geo, lineMat);
  head.add(line); // зигзаг двигается вместе с головкой
  // аккуратный dispose — для line geometry уникальна, привязана к head.userData
  head.userData.disposeExtras = () => { geo.dispose(); lineMat.dispose(); };
}
// ЦЕПНАЯ МОЛНИЯ: ломаная линия через точки (от игрока через всех врагов в цепи)
function spawnChainLightningFx(points, color) {
  if (!points || points.length < 2) return;
  // Сегменты между соседними точками — каждый с лёгким зигзагом
  const allPts = [];
  const segsPerJump = 5;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y + 0.6, dz = b.z - a.z; // поднимаем к голове
    const len = Math.hypot(dx, dy, dz) || 1;
    const px = -dz / len, py = 0, pz = dx / len; // перпендикуляр
    for (let s = 0; s <= segsPerJump; s++) {
      const t = s / segsPerJump;
      const wob = (s === 0 || s === segsPerJump) ? 0 : (Math.random() - 0.5) * 0.8;
      allPts.push(
        a.x + dx * t + px * wob,
        a.y + 0.6 + (dy - 0.6) * t + py * wob,
        a.z + dz * t + pz * wob
      );
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(allPts), 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1.0, linewidth: 3 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  pushShot({
    mesh: line, ttl: 0.35, maxTtl: 0.35, vx: 0, vy: 0, vz: 0,
    disposeExtras: () => { geo.dispose(); mat.dispose(); },
  });
  // Вспышки в каждой точке цепи (враге — где ударило)
  for (let i = 1; i < points.length; i++) {
    const matF = FX_MAT_TPL.flash.clone(); matF.color.setHex(color);
    const flash = new THREE.Mesh(FX_GEOM.sphereFlash, matF);
    flash.position.set(points[i].x, points[i].y + 0.6, points[i].z);
    flash.scale.setScalar(0.5);
    scene.add(flash);
    pushShot({ mesh: flash, ttl: 0.25, maxTtl: 0.25, vx: 0, vy: 0, vz: 0 });
  }
}

// Эффект смерти: общая geometry, меньше частиц
function spawnDeathBurst(x, y, z, kind) {
  const isColossus = kind === "COLOSSUS";
  const scale = isColossus ? 2.6 : 1;
  const flash = new THREE.Mesh(FX_GEOM.sphereFlash, FX_MAT_TPL.flash.clone());
  flash.position.set(x, y, z); flash.scale.setScalar(scale);
  scene.add(flash);
  pushShot({ mesh: flash, ttl: 0.35, maxTtl: 0.35, vx: 0, vy: 0, vz: 0 });
  const cnt = isColossus ? 8 : 4;
  for (let i = 0; i < cnt; i++) {
    const c = new THREE.Mesh(FX_GEOM.sphereChip, FX_MAT_TPL.chip.clone());
    c.position.set(x, y, z); c.scale.setScalar(scale);
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 4;
    const vy = 1.5 + Math.random() * 3;
    scene.add(c);
    pushShot({
      mesh: c, ttl: 0.9, maxTtl: 0.9,
      vx: Math.cos(a) * s, vy, vz: Math.sin(a) * s, gravity: 6,
    });
  }
  const smoke = new THREE.Mesh(FX_GEOM.ringSmoke, FX_MAT_TPL.smoke.clone());
  smoke.position.set(x, y + 0.05, z); smoke.scale.setScalar(scale);
  smoke.rotation.x = -Math.PI / 2;
  scene.add(smoke);
  pushShot({ mesh: smoke, ttl: 1.1, maxTtl: 1.1, vx: 0, vy: 0.4, vz: 0 });
}

function spawnWaveFx(x, y, z, r) {
  const m = new THREE.Mesh(FX_GEOM.ringWave, FX_MAT_TPL.wave.clone());
  m.position.set(x, y, z); m.scale.setScalar(r / 1.0);
  m.rotation.x = -Math.PI / 2;
  scene.add(m);
  shots.push({ mesh: m, ttl: 0.8, maxTtl: 0.8, vx: 0, vy: 0, vz: 0 });
}

// ═══════════════════════════════════════════════════════════════════
// КОНТРОЛЛЕР, СЕТЬ
// ═══════════════════════════════════════════════════════════════════
const controller = new FpsController(camera, canvas);
window.controller = controller;
let localHero = null;
function syncLocalHero(dt) {
  if (!localHero) {
    localHero = createOtherPlayer("ты", 0);
    if (localHero.userData.nameSprite) localHero.userData.nameSprite.visible = false;
    scene.add(localHero);
  }
  localHero.position.set(controller.position.x, controller.position.y - 1.6, controller.position.z);
  localHero.scale.y = controller.crouching ? 0.72 : 1;
  localHero.userData.facingYaw = controller.yaw + Math.PI;
  const moving = Math.hypot(controller.vel.x, controller.vel.z) > 0.35;
  animateOtherPlayer(localHero, dt, moving, camera);
}

// Надёжный выход из Pointer Lock — чтобы курсор не пропадал во всём браузере
function safeExitPointerLock() {
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch {}
}
window.addEventListener("blur", safeExitPointerLock);
window.addEventListener("beforeunload", safeExitPointerLock);
window.addEventListener("pagehide", safeExitPointerLock);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") safeExitPointerLock();
});
// Escape всегда отпускает курсор
document.addEventListener("keydown", (e) => {
  if (e.code === "Escape") safeExitPointerLock();
}, true);
let client, room, selfId, myPlayer = null, lastHpSeen = 3;
let deathTimer = 0;
let ambientLoop = null;
let footstepTimer = 0;

// Сохранённый ник
const savedName = localStorage.getItem("rrrrrrain_name");
if (savedName) document.getElementById("name").value = savedName;
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  document.getElementById("server").value = "ws://127.0.0.1:2567";
}

document.getElementById("play").addEventListener("click", async () => {
  const playBtn = document.getElementById("play");
  const menuError = document.getElementById("menu-error");
  const name = document.getElementById("name").value.trim() || "sgustok";
  localStorage.setItem("rrrrrrain_name", name);
  const url  = document.getElementById("server").value.trim();
  playBtn.disabled = true;
  playBtn.textContent = "подключение…";
  if (menuError) menuError.textContent = "";
  try {
    initAudio(); // разбудить AudioContext сразу после клика
    client = new Client(url);
    // v0.0.3.4: лобби-код — filterBy на сервере группирует комнаты по одинаковому коду
    const lobbyId = (document.getElementById("lobby")?.value || "1").trim() || "1";
    localStorage.setItem("rrrrrrain_lobby", lobbyId);
    room = await client.joinOrCreate(NET.ROOM_NAME, { name, lobbyId });
    window.room = room;
    // Панель синхронизируется при первом получении состояния
    room.onStateChange.once((state) => syncDebugPanelFromState(state));
    selfId = room.sessionId;
    menu.style.display = "none";
    document.body.classList.add("in-game");
    crosshair.style.display = "block";
    radar.style.display = "none";
    controller.enable();
    setupRoomHandlers();
    setInterval(sendInput, 1000 / NET.PLAYER_SEND_HZ);
  } catch (e) {
    console.error(e);
    const msg = "не удалось подключиться: " + (e?.message || e);
    status.textContent = msg;
    if (menuError) menuError.textContent = msg;
    playBtn.disabled = false;
    playBtn.textContent = "начать";
  }
});

function setupRoomHandlers() {
  room.state.players.onAdd((p, id) => {
    if (id === selfId) {
      myPlayer = p;
      window.myPlayer = p;
    } else {
      // Другой игрок — создаём модель.
      // Сервер шлёт pos.y = 1.6 (центр камеры), а модель рисуется от ног (Y=0).
      // Поэтому опускаем на 1.6.
      const otherMesh = createOtherPlayer(p.name || "player", colorIdxCounter++);
      otherMesh.position.set(p.pos.x, p.pos.y - 1.6, p.pos.z);
      scene.add(otherMesh);
      const entry = {
        mesh: otherMesh, targetX: p.pos.x, targetY: p.pos.y - 1.6, targetZ: p.pos.z,
        targetYaw: p.yaw || 0, prevX: p.pos.x, prevZ: p.pos.z, moving: false,
      };
      otherPlayers.set(id, entry);
      p.onChange(() => {
        entry.targetX = p.pos.x;
        entry.targetY = p.pos.y - 1.6;
        entry.targetZ = p.pos.z;
        entry.targetYaw = p.yaw || 0;
      });
    }

    p.onChange(() => {
      if (id === selfId) {
        // Руки: обновить видимость + заклинания в ладонях
        // Руки всегда видны, меняется только заклинание в ладони
        if (p.hasLeftHand && !V3_MODE) {
          setSpellInHand(handsRoot, -1, handTypeToVisual(p.leftHandType));
        } else if (!V3_MODE) {
          setSpellInHand(handsRoot, -1, null);
        }
        if (p.hasRightHand && !V3_MODE) {
          setSpellInHand(handsRoot, 1, handTypeToVisual(p.rightHandType));
        } else if (!V3_MODE) {
          setSpellInHand(handsRoot, 1, null);
        }
        renderCardHud();

        const maxHp = p.maxHp || 3;
        if (p.hp < maxHp && p.hp > 0) crackHud.classList.add("on");
        if (p.hp >= maxHp) crackHud.classList.remove("on");
        if (p.isGhost) {
          deadHud.classList.add("on");
          crackHud.classList.remove("on");
        } else {
          deadHud.classList.remove("on");
        }

        // Обновить HP-бар
        updateHpBar(p.hp, maxHp);

        // Звук урона + damage-number
        if (lastHpSeen > p.hp && p.hp > 0) {
          playSound("player_hurt");
          spawnScreenDmgNumber(lastHpSeen - p.hp, false);
        }
        if (lastHpSeen > 0 && p.hp <= 0) {
          playSound("player_death");
        }
        lastHpSeen = p.hp;
      }
    });
  });

  room.state.players.onRemove((_p, id) => {
    if (id === selfId) return;
    const entry = otherPlayers.get(id);
    if (entry) {
      scene.remove(entry.mesh);
      disposeGroup(entry.mesh);
      otherPlayers.delete(id);
    }
  });

  // ── Мобы: 3D-модели с интерполяцией ─────────────────────────
  room.state.enemies.onAdd((e, id) => {
    let m;
    if (V3_MODE) {
      m = createCacodemonSprite();
      m.userData.cacoV3 = true;
      m.userData.flying = true;
      const sc = Math.min(8, ENEMY_TYPES[e.enemyType]?.scale || 3.45);
      m.scale.set(sc, sc, 1);
      if (m.userData.cacoAtlas) m.userData.cacoAtlas.baseScale = sc;
    } else {
      m = createEnemy3D(e.enemyType);
    }
    const yOff = 0;
    m.userData.yOff = yOff;
    m.position.set(e.pos.x, e.pos.y - yOff, e.pos.z);
    if (e.elite) {
      const tint = e.elite === "fire" ? 0xff5533 : e.elite === "ice" ? 0x66ccff : 0xffee55;
      m.traverse((ch) => {
        if (ch.material && ch.material.color) {
          ch.material = ch.material.clone();
          ch.material.color.lerp(new THREE.Color(tint), 0.45);
        }
      });
    }
    scene.add(m);
    const entry = {
      mesh: m, targetX: e.pos.x, targetY: e.pos.y - yOff, targetZ: e.pos.z,
      prevX: e.pos.x, prevZ: e.pos.z, moving: false,
      wasAlive: true, alive: e.alive !== false,
    };
    enemyMeshes.set(id, entry);

    e.onChange(() => {
      entry.targetX = e.pos.x;
      entry.targetY = e.pos.y - yOff;
      entry.targetZ = e.pos.z;
      entry.alive = e.alive !== false;
      if (!e.alive && entry.wasAlive) {
        entry.wasAlive = false;
        entry.deathAt = performance.now();
        m.visible = true;
      }
    });
    if (e.pos && e.pos.onChange) {
      e.pos.onChange(() => {
        entry.targetX = e.pos.x;
        entry.targetY = e.pos.y - yOff;
        entry.targetZ = e.pos.z;
      });
    }
  });
  room.state.enemies.onRemove((_e, id) => {
    const entry = enemyMeshes.get(id);
    if (entry) {
      scene.remove(entry.mesh); disposeGroup(entry.mesh); enemyMeshes.delete(id);
    }
  });

  // ── Пьедесталы (арена И хаб) ─────────────────────────────
  // Куда добавлять — решаем по текущей фазе (на арене → arenaGroup)
  room.state.pickups.onAdd((pk, id) => {
    const m = makePickupMesh(pk);
    m.position.set(pk.pos.x, 0, pk.pos.z);
    const parent = room.state.phase === "hub" ? hubGroup : arenaGroup;
    parent.add(m);
    m.userData.parentGroup = parent;
    pickupMeshes.set(id, m);
    pk.onChange(() => { if (pk.taken) { m.visible = false; } });
  });
  room.state.pickups.onRemove((_pk, id) => {
    const m = pickupMeshes.get(id);
    if (m) {
      const parent = m.userData.parentGroup || hubGroup;
      parent.remove(m);
      disposeGroup(m);
      pickupMeshes.delete(id);
    }
  });

  // Инициализация хаб-хранилища (после того как схема пришла)
  ensureHubStorageInit();
  room.onStateChange((_state) => {
    if (!hubStorageInitDone) ensureHubStorageInit();
  });


  // ── Фаза (хаб/арена) ──────────────────────────────────────
  let appliedPhase = null;
  function applyPhase(v, force = false) {
    if (!v) return;
    if (!force && v === appliedPhase) return;
    const first = appliedPhase == null;
    const prev = appliedPhase;
    appliedPhase = v;
    hubGroup.visible = v === "hub";
    arenaGroup.visible = v !== "hub";
    if (V3_MODE) scene.fog = (v === "hub") ? null : (window.__ARENA_FOG || null);
    stopSoundLoop(ambientLoop);
    ambientLoop = null;
    if (!first) {
      playSound("teleport");
      flashTeleport();
    }
    const toHub = v === "hub" && (force || prev !== "hub");
    const toArena = (v === "arena" || v === "bazaar") && (force || prev === "hub" || prev == null);
    if (v === "bazaar") {
      controller.setPosition(0, 1.6, 4);
      portalGraceUntil = performance.now() + 2500;
    } else if (toArena) {
      controller.setPosition(0, 1.6, 0);
      portalGraceUntil = performance.now() + 2500;
    }
    if (toHub) {
      const hz = WORLD.LOBBY_SPAWN_Z || 14;
      controller.setPosition(0, 1.6, hz);
      controller.yaw = Math.atan2(0, hz);
      if (!first) portalGraceUntil = performance.now() + 2500;
      deadHud.classList.remove("on");
      deathTimer = 0;
    }
  }
  room.state.listen("phase", (v) => applyPhase(v));
  room.state.listen("levelIndex", (v) => applyArenaTheme(arenaGroup, v || 0));
  applyPhase(room.state.phase);
  applyArenaTheme(arenaGroup, room.state.levelIndex || 0);
  room.onStateChange(() => applyPhase(room.state.phase));

  // ── FX ────────────────────────────────────────────────────
  room.onMessage("chat", (msg) => {
    addChatMessage(msg.name || "?", msg.text || "", msg.id === selfId);
  });

  room.onMessage("fx", (msg) => {
    if (msg.type === "shot") {
      spawnShotFx(msg.x, msg.y + 0.6, msg.z, msg.color, msg.dx, msg.dy, msg.dz);
      // Звук каста — по цвету определяем тип (цвета из SPELLS)
      if (msg.color === 0xff5a1f || msg.color === 0xff4400) playSound("fireball_cast");
      else if (msg.color === 0x66ccff) playSound("ice_cast");
      else playSound("chain_cast");
    }
    else if (msg.type === "chain") {
      spawnChainLightningFx(msg.points, msg.color);
      playSound("chain_cast");
    }
    else if (msg.type === "wave") {
      spawnWaveFx(msg.x, msg.y, msg.z, msg.r);
      playSound("fireball_impact", { volume: 0.35 });
    }
    else if (msg.type === "homing") {
      if (msg.kind === "dagger") {
        spawnDaggerFx(msg.x, msg.y, msg.z, msg.dx || 0, msg.dy || 0, msg.dz || 0, 38, msg.targetId || "");
      } else {
        spawnStarBoltFx(msg.x, msg.y, msg.z, msg.dx || 0, msg.dy || 0, msg.dz || 0, 34, msg.targetId || "");
      }
      playSound("fireball_cast", { volume: 0.35 });
    }
    else if (msg.type === "hitscan") {
      const tx = msg.hx ?? msg.tx, ty = msg.hy ?? msg.ty, tz = msg.hz ?? msg.tz;
      spawnHitscanFx(msg.x, msg.y, msg.z, tx, ty, tz, msg.color || 0x88eeff);
      playSound("chain_cast");
    }
    else if (msg.type === "star_shield") {
      if (msg.target === selfId) {
        localBlockHp = msg.absorb || 100;
        shieldGraceUntil = performance.now() + 1500;
      }
      playSound("fireball_impact", { volume: 0.3 });
    }
    else if (msg.type === "cig_puff" || msg.type === "cig_blow") {
      spawnSmokeFx(msg.x, msg.y + 0.4, msg.z, msg.type === "cig_blow");
    }
    else if (msg.type === "block_absorb") {
      if (msg.target === selfId) {
        if (typeof msg.left === "number") localBlockHp = Math.max(0, msg.left);
        blockHud.style.opacity = 1;
      }
    }
    else if (msg.type === "fall_respawn" && msg.target === selfId) {
      fellFlashUntil = performance.now() + 400;
      hintText.textContent = "Ты упал — возврат к краю (без урона)";
      hintText.style.opacity = 1;
      setTimeout(() => { hintText.style.opacity = 0; }, 1800);
      if (msg.x != null && msg.z != null) controller.setPosition(msg.x, 2, msg.z);
      playSound("teleport");
    }
    else if (msg.type === "caco_shoot") {
      // v0.0.3.1: вражеский фаербол от Cacodemon/Flying Shooter — летит к (tx,ty,tz)
      const dx = (msg.tx - msg.x), dy = (msg.ty - msg.y), dz = (msg.tz - msg.z);
      const len = Math.hypot(dx, dy, dz) || 1;
      const speed = 22;
      spawnFireballFx(msg.x, msg.y, msg.z, msg.color || 0xff5a1f, dx / len * speed, dy / len * speed, dz / len * speed, 4.5);
      playSound("fireball_cast", { volume: 0.4 });
      // v0.0.3.2: пометить ближайшего какодемона как "attacking" на 400мс — чтобы стрелял лицом
      let bestEntry = null, bestD = 10;
      enemyMeshes.forEach((entry) => {
        const m = entry.mesh;
        if (!m || !m.userData.cacoV3) return;
        const ddx = m.position.x - msg.x, ddy = m.position.y - msg.y, ddz = m.position.z - msg.z;
        const d = Math.hypot(ddx, ddy, ddz);
        if (d < bestD) { bestD = d; bestEntry = entry; }
      });
      if (bestEntry) bestEntry._attackingUntil = performance.now() + 700;
    }
    else if (msg.type === "meteor") {
      const tx = msg.tx ?? msg.x, tz = msg.tz ?? msg.z, ty = msg.ty ?? 1;
      spawnFireballFx(msg.x, msg.y ?? 22, msg.z, msg.color || 0xff3311, 0, -38, 0);
      spawnWaveFx(tx, ty, tz, msg.r || 7);
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        const off = Math.random() * (msg.r || 6);
        spawnShotFx(tx + Math.cos(ang) * off, ty + 18 + Math.random() * 8, tz + Math.sin(ang) * off, 0xff4411, 0, -1, 0);
      }
      playSound("fireball_impact", { volume: 0.45 });
    }
    else if (msg.type === "enemy_spawn") {
      // без аудио пока
    }
    else if (msg.type === "starfall") {
      // v0.0.3.0 Звёздопад: гроздь звёзд падает в точке, AoE-вспышка
      spawnWaveFx(msg.x, msg.y, msg.z, msg.r || 5);
      // 5-8 звёзд падают с неба в радиусе
      const nStars = 8;
      for (let i = 0; i < nStars; i++) {
        const ang = (i / nStars) * Math.PI * 2;
        const off = Math.random() * (msg.r || 5);
        const sx = msg.x + Math.cos(ang) * off;
        const sz = msg.z + Math.sin(ang) * off;
        spawnShotFx(sx, msg.y + 30, sz, msg.color || 0xff40a0, 0, -1, 0);
      }
      playSound("fireball_impact", { volume: 0.5 });
    }
    else if (msg.type === "hurt" && msg.target === selfId) {
      // Трещины на руках вместо красного экрана
      if (handsRoot) showHandDamage(handsRoot, 1.5);
      flashCracks();
      if (typeof msg.fromX === "number" && myPlayer) {
        const dx = msg.fromX - myPlayer.pos.x;
        const dz = msg.fromZ - myPlayer.pos.z;
        dmgAngle = Math.atan2(dx, dz) - controller.yaw;
        dmgTimer = 0.6;
      }
    }
    else if (msg.type === "hit_enemy") {
      // Сервер шлёт для звука попадания + damage number
      playSound("enemy_hit");
      if (msg.dmg) spawnWorldDmgNumber(new THREE.Vector3(msg.x, msg.y + 1.5, msg.z), msg.dmg);
      let bestE = null, bestD = 6;
      enemyMeshes.forEach((entry) => {
        const m = entry.mesh;
        if (!m || !m.userData.cacoV3) return;
        const d = Math.hypot(m.position.x - (msg.x || 0), m.position.z - (msg.z || 0));
        if (d < bestD) { bestD = d; bestE = entry; }
      });
      if (bestE) bestE._painUntil = performance.now() + 220;
    }
    else if (msg.type === "enemy_die") {
      spawnDeathBurst(msg.x, msg.y, msg.z, msg.kind);
      playSound("enemy_death");
    }
    else if (msg.type === "equip_heal" || msg.type === "equip_missile" || msg.type === "equip_phase" || msg.type === "equip_swap") {
      playSound("pickup");
      if (msg.target === selfId) {
        hintText.textContent = msg.type === "equip_missile" ? "залп ракет"
          : (msg.type === "equip_phase" ? "сдвиг фазы"
            : (msg.type === "equip_swap" ? ("снаряжение: " + (EQUIPMENT[msg.equipmentId]?.name || msg.equipmentId))
              : ("аптечка +" + (msg.heal || 30))));
        hintText.style.opacity = 1;
        hintTimer = 1.1;
      }
      if (msg.type === "equip_missile") spawnWaveFx(msg.x, msg.y, msg.z, msg.r || 7);
    }
    else if (msg.type === "drone_shot") {
      spawnHitscanFx(msg.x, msg.y, msg.z, msg.tx, msg.ty, msg.tz, 0xffee88);
    }
    else if (msg.type === "dio" && msg.target === selfId) {
      hintText.textContent = "Дио — вторая жизнь";
      hintText.style.opacity = 1;
      hintTimer = 1.6;
    }
    else if (msg.type === "newt" || msg.type === "bazaar" || msg.type === "bazaar_buy") {
      spawnWaveFx(msg.x || 0, msg.y || 1, msg.z || 0, 4);
      playSound("teleport");
    }
    else if (msg.type === "shrine_combat" || msg.type === "printer" || msg.type === "scrapper") {
      spawnWaveFx(msg.x, msg.y, msg.z, 3);
      playSound("pickup");
      if (msg.target === selfId || msg.type === "shrine_combat") {
        const it = ITEMS.find(x => x.id === (msg.item || msg.scrap));
        hintText.textContent = msg.type === "shrine_combat"
          ? "алтарь боя — волна врагов"
          : (msg.type === "printer"
            ? ("принтер · " + (it?.name || msg.item || "предмет"))
            : ("утильщик · " + (it?.name || "лом")));
        hintText.style.opacity = 1;
        hintTimer = 1.4;
      }
    }
    else if (msg.type === "shrine_blood" || msg.type === "shrine_chance") {
      spawnWaveFx(msg.x, msg.y, msg.z, 3);
      playSound("pickup");
      if (msg.target === selfId) {
        hintText.textContent = msg.type === "shrine_blood"
          ? ("алтарь крови · +" + (msg.gold || 0) + " золота")
          : (msg.win ? ("алтарь шанса · " + (msg.item || "предмет")) : "алтарь шанса · пусто");
        hintText.style.opacity = 1;
        hintTimer = 1.4;
      }
    }
    else if (msg.type === "ping") {
      spawnWaveFx(msg.x, msg.y, msg.z, 4);
      hintText.textContent = (msg.name || "?") + " · ping";
      hintText.style.opacity = 1;
      hintTimer = 1.4;
    }
    else if (msg.type === "wipe_hub") {
      applyPhase("hub", true);
    }
    else if (msg.type === "next_stage") {
      applyArenaTheme(arenaGroup, msg.levelIndex || 0);
    }
    else if (msg.type === "phase_teleport") {
      if (msg.x != null && msg.z != null) {
        controller.setPosition(msg.x, msg.y != null ? msg.y : 1.6, msg.z);
        portalGraceUntil = performance.now() + 2500;
      }
      if (msg.phase) applyPhase(msg.phase, true);
    }
    else if (msg.type === "death" && msg.target === selfId) {
      deadHud.classList.add("on");
      deathTimer = 3.0;
    }
    else if (msg.type === "respawn" && msg.target === selfId) {
      deadHud.classList.remove("on");
      crackHud.classList.remove("on");
      deathTimer = 0;
    }
  });
}

function flashCracks() {
  crackHud.classList.add("on");
  clearTimeout(flashCracks._t);
  flashCracks._t = setTimeout(() => { if (myPlayer && myPlayer.hp >= 3) crackHud.classList.remove("on"); }, 1200);
}

// ═══════════════════════════════════════════════════════════════════
// ВВОД
// ═══════════════════════════════════════════════════════════════════
let lastCastMs = 0;
canvas.addEventListener("mousedown", (ev) => {
  if (!room || !myPlayer || myPlayer.isGhost) return;
  if (V3_MODE) {
    const kit = SURVIVOR;
    const combat = room.state.phase === "arena" || room.state.phase === "portal_ready";
    if (ev.button === 0) lmbHeld = true;
    if (ev.button === 1) {
      ev.preventDefault();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      room.send("ping", {
        x: controller.position.x + dir.x * 18,
        y: controller.position.y + dir.y * 18,
        z: controller.position.z + dir.z * 18,
      });
      return;
    }
    const spellId = ev.button === 0 ? kit.lmb : ev.button === 2 ? kit.rmb : null;
    if (!spellId) return;
    const spell = SPELLS[spellId];
    if (!spell) return;
    if (!spell.isCosmetic && !combat) return;
    const nowMs = performance.now();
    if (!spell.isDaggerCharge && nowMs - lastCastMs < 120) return;
    lastCastMs = nowMs;
    triggerSwordSwing();
    camera.rotation.order = "YXZ";
    camera.rotation.y = controller.yaw;
    camera.rotation.x = controller.pitch;
    camera.rotation.z = 0;
    camera.updateMatrixWorld(true);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = controller.position.clone();
    sendInput();
    if (spell.isDaggerCharge) return;
    if (spell.isShield) { localBlockHp = 100; shieldGraceUntil = performance.now() + 1500; }
    room.send("cast", {
      spell: spellId, dx: dir.x, dy: dir.y, dz: dir.z,
      ox: origin.x, oy: origin.y, oz: origin.z, hand: ev.button === 2 ? "right" : "left",
    });
    return;
  }
  const hand = ev.button === 0 ? "left" : ev.button === 2 ? "right" : null;
  if (!hand) return;
  const has = hand === "left" ? myPlayer.hasLeftHand : myPlayer.hasRightHand;
  if (!has && myPlayer.itemsInBody.length === 0) return;
  const nowMs = performance.now();
  if (nowMs - lastCastMs < 250) return;
  lastCastMs = nowMs;
  const spellId = HAND_TYPES[hand === "left" ? myPlayer.leftHandType : myPlayer.rightHandType]?.spell
                || "FIREBALL";
  // НАПРАВЛЕНИЕ: СИНХРОННО ОБНОВЛЯЕМ камеру из controller.yaw/pitch, потом берём getWorldDirection.
  // Это гарантирует, что cast летит точно туда, куда будет смотреть следующий кадр.
  // Нельзя брать только controller.yaw — есть рассинхрон с рендером камеры.
  camera.rotation.order = "YXZ";
  camera.rotation.y = controller.yaw;
  camera.rotation.x = controller.pitch;
  camera.rotation.z = 0;
  camera.updateMatrixWorld(true);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = controller.position.clone().add(new THREE.Vector3(0, 0.4, 0));
  // ДИАГНОСТИКА Mac: лог каждого cast — первые 5
  if (!window._castLogCnt) window._castLogCnt = 0;
  if (window._castLogCnt < 5) {
    window._castLogCnt++;
    const pl = document.pointerLockElement === canvas ? "ON" : "OFF";
    console.log(`[CAST #${window._castLogCnt}] PL=${pl} y=${controller.yaw.toFixed(3)} p=${controller.pitch.toFixed(3)} dir=(${dir.x.toFixed(2)},${dir.y.toFixed(2)},${dir.z.toFixed(2)}) cam=(${camera.rotation.y.toFixed(3)},${camera.rotation.x.toFixed(3)})`);
  }
  // ФОРС-ОТПРАВКА input ПЕРЕД cast — чтобы другие клиенты видели модель
  // с тем же yaw/pitch, откуда летит снаряд (без этого до 50мс рассинхрона)
  sendInput();
  // ДИАГНОСТИКА ПРИЦЕЛА: белая линия от камеры по dir на 30м — видно совпадает ли с crosshair
  {
    const from = origin.clone();
    const to = origin.clone().add(dir.clone().multiplyScalar(30));
    const lineGeom = new THREE.BufferGeometry().setFromPoints([from, to]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0, depthTest: false });
    const line = new THREE.Line(lineGeom, lineMat);
    line.renderOrder = 998;
    scene.add(line);
    setTimeout(() => { scene.remove(line); lineGeom.dispose(); lineMat.dispose(); }, 1200);
  }
  room.send("cast", {
    spell: spellId, dx: dir.x, dy: dir.y, dz: dir.z,
    ox: origin.x, oy: origin.y, oz: origin.z, hand
  });
  // Запустить визуальный кулдаун
  const spellDef = SPELLS[spellId];
  if (spellDef) startCooldown(hand, (spellDef.cooldown || 0.3) * 1000);
  // Анимация отдачи руки
  handsRoot.userData[hand === "left" ? "leftHand" : "rightHand"].userData.recoil = 1.0;
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("mouseup", (ev) => {
  if (ev.button === 0) { lmbHeld = false; sendInput(); }
});

document.addEventListener("keydown", (ev) => {
  if (!room) return;
  // Чат: Enter — открыть/отправить
  if (ev.code === "Enter") {
    if (chatOpen) {
      const text = chatInput.value.trim();
      if (text) room.send("chat", { text });
      chatInput.value = "";
      chatInput.style.display = "none";
      chatInput.blur();
      chatOpen = false;
      controller.enable();
    } else {
      chatOpen = true;
      chatInput.style.display = "block";
      chatInput.focus();
      controller.releasePointer();
    }
    ev.preventDefault();
    return;
  }
  if (chatOpen) return; // пока открыт чат — остальные вводы игнорируем
  // Тильда — дебаг-панель
  if (ev.code === "Backquote") {
    toggleDebugPanel();
    ev.preventDefault();
    return;
  }
  if (ev.code === "Escape") controller.releasePointer();
  if (ev.code === "KeyQ") {
    if (myPlayer && !myPlayer.isGhost) room.send("equipment");
    return;
  }
  if (ev.code === "Tab") {
    ev.preventDefault();
    if (loadoutOpen) hideLoadoutPanel();
    else showLoadoutPanel();
    return;
  }
  // R-респ убран — теперь в дебаг-панели
  if (ev.code === "KeyG") {
    if (room && room.state.phase === "portal_ready") {
      flashTeleport();
      playSound("teleport");
      sendPortalPhase("hub");
      portalGraceUntil = performance.now() + 2500;
    }
    return;
  }
  if (ev.code === "KeyL") {
    if (room && room.state.phase === "portal_ready" && stageKind(room.state.levelIndex || 0) === "fork") {
      flashTeleport();
      playSound("teleport");
      room.send("loop_run");
      portalPendingPhase = "__stage";
      portalPendingAt = performance.now();
      portalGraceUntil = performance.now() + 2500;
    }
    return;
  }
  if (ev.code === "Digit1" || ev.code === "Digit2" || ev.code === "Digit3") {
    const pid = window.__nearPickupId;
    const pk = pid && room ? room.state.pickups.get(pid) : null;
    if (pk && pk.kind === "CHEST_TRIPLE" && !pk.taken) {
      const choice = Number(ev.code.slice(-1)) - 1;
      room.send("pickup", { id: pid, choice });
      playSound("pickup");
      return;
    }
  }
  if (ev.code === "KeyE") {
    if (ev.repeat) return;
    // 1) На арене или в хабе — пикапы приоритетнее
    let bestId = null, bestD = Infinity;
    pickupMeshes.forEach((m, id) => {
      const pk = room.state.pickups.get(id);
      if (!pk || pk.taken) return;
      const d = m.position.distanceTo(controller.position);
      if (d < 3 && d < bestD) { bestD = d; bestId = id; }
    });
    if (bestId) {
      const pk = room.state.pickups.get(bestId);
      if (pk && pk.kind === "CHEST_TRIPLE") return;
      room.send("pickup", { id: bestId });
      playSound("pickup");
      return;
    }
    // 2) На арене: активация портала если рядом и ещё не активен
    if (room.state.phase === "arena" && !room.state.portalActive) {
      const pos = getArenaPortalPos(arenaGroup);
      if (pos) {
        const d = Math.hypot(controller.position.x - pos.x, controller.position.z - pos.z);
        if (d < 5.5) {
          room.send("activate_portal");
          playSound("pickup");
          return;
        }
      }
    }
    // 3) В хабе — слоты, сундуки, алтарь
    if (room.state.phase === "hub") {
      // Ближайший слот
      let bestSlot = -1, bsD = 3;
      hubSlotMeshes.forEach((g, i) => {
        const d = g.position.distanceTo(controller.position);
        if (d < bsD) { bsD = d; bestSlot = i; }
      });
      // Ближайший сундук
      let bestChest = -1, bcD = 3;
      hubChestMeshes.forEach((g, i) => {
        const d = g.position.distanceTo(controller.position);
        if (d < bcD) { bcD = d; bestChest = i; }
      });
      const cands = [];
      if (bestSlot >= 0) cands.push({ kind: "slot", i: bestSlot, d: bsD });
      if (bestChest >= 0) cands.push({ kind: "chest", i: bestChest, d: bcD });
      cands.sort((a, b) => a.d - b.d);
      const c = cands[0];
      if (!c) return;
      if (c.kind === "slot") {
        const slot = room.state.hubSlots[c.i];
        if (slot && !slot.empty) {
          room.send("hub_take", { source: "slot", index: c.i });
          playSound("pickup");
        } else if (slot && slot.empty && myPlayer) {
          let what = null;
          if (myPlayer.itemsInBody && myPlayer.itemsInBody.length) what = "item";
          if (what) {
            room.send("hub_put", { index: c.i, what });
            playSound("pickup");
          }
        }
      } else if (c.kind === "chest") {
        openChestPanel(c.i);
      }
    }
  }
  // v0.0.3.6: кровать больше не телепортирует. Единственный путь на арену — портал (см. handlePortalTriggers).
  // E-телепорт убран — телепортация только через порталы или дебаг-панель
  if (ev.code === "Space") {
    playSound("jump");
  }
});

document.addEventListener("keyup", (ev) => {
  if (ev.code === "Tab") ev.preventDefault();
});

function sendInput() {
  if (!room) return;
  const p = controller.position;
  room.send("input", { x: p.x, y: p.y, z: p.z, yaw: controller.yaw, pitch: controller.pitch, lmbHeld });
}

// ═══════════════════════════════════════════════════════════════════
// РАДАР
// ═══════════════════════════════════════════════════════════════════
function drawRadar() {
  rctx.clearRect(0, 0, radar.width, radar.height);
  if (!myPlayer || !room) return;
  if (room.state.phase === "hub") return;
  let nearest = null, nd = Infinity;
  room.state.enemies.forEach(e => {
    if (!e.alive) return;
    const dx = e.pos.x - myPlayer.pos.x;
    const dz = e.pos.z - myPlayer.pos.z;
    const d = dx*dx + dz*dz;
    if (d < nd) { nd = d; nearest = e; }
  });
  if (!nearest) return;
  const dx = nearest.pos.x - myPlayer.pos.x;
  const dz = nearest.pos.z - myPlayer.pos.z;
  const enemyAngle = Math.atan2(dx, dz);
  let rel = enemyAngle - controller.yaw;
  while (rel > Math.PI) rel -= 2*Math.PI;
  while (rel < -Math.PI) rel += 2*Math.PI;
  const clamped = Math.max(-Math.PI/2, Math.min(Math.PI/2, rel));
  const x = (clamped / (Math.PI/2)) * (radar.width/2 - 20) + radar.width/2;
  const behind = Math.abs(rel) > Math.PI/2;
  rctx.fillStyle = behind ? "#ff2222" : "#ffcc22";
  rctx.beginPath();
  rctx.moveTo(x, 10);
  rctx.lineTo(x - 8, 30);
  rctx.lineTo(x + 8, 30);
  rctx.closePath();
  rctx.fill();
  rctx.fillStyle = "#fff";
  rctx.font = "12px monospace";
  rctx.textAlign = "center";
  rctx.fillText(behind ? "СЗАДИ" : Math.round(Math.sqrt(nd)) + "м", x, 50);
}

// ═══════════════════════════════════════════════════════════════════
// АНИМАЦИОННЫЙ ЦИКЛ
// ═══════════════════════════════════════════════════════════════════
const clock = new THREE.Clock();
let prevControllerPos = new THREE.Vector3();

// ── ПОРТАЛЫ: автотриггер ────────────────────────────────
let portalHoldTime = 0;
let lastPortalKind = null;
let portalPendingPhase = null;
let portalGraceUntil = 0;
let portalPendingAt = 0;
const PORTAL_HOLD_S = WORLD.PORTAL_HOLD_S || 1.5;
const PORTAL_PENDING_MS = 5000;
function sendPortalPhase(phase) {
  if (!phase) return;
  if (phase === "arena") {
    room.send("phase", { phase });
    room.send("enter_arena");
    portalPendingPhase = "arena";
  } else if (phase === "hub") {
    room.send("phase", { phase });
    room.send("return_hub");
    portalPendingPhase = "hub";
  } else if (phase === "next") {
    room.send("next_stage");
    portalPendingPhase = "__stage";
  } else if (phase === "bazaar_leave") {
    room.send("leave_bazaar");
    portalPendingPhase = "__stage";
  } else {
    room.send("phase", { phase });
    portalPendingPhase = phase;
  }
  portalPendingAt = performance.now();
}
function handlePortalTriggers(dt) {
  if (!room || !myPlayer) return;
  const cur = room.state.phase;
  if (performance.now() < portalGraceUntil) {
    portalHoldTime = 0;
    lastPortalKind = null;
    return;
  }
  if (portalPendingPhase) {
    const arrived = portalPendingPhase === "__stage"
      ? (cur === "arena" || cur === "hub" || cur === "bazaar")
      : (cur === portalPendingPhase);
    if (arrived || performance.now() - portalPendingAt > PORTAL_PENDING_MS) {
      portalPendingPhase = null;
      portalHoldTime = 0;
    }
    if (portalPendingPhase) {
      hintText.style.opacity = 0;
      return;
    }
  }
  const p = controller.position;
  const hubP = hubGroup.userData.hubPortal;
  const arenaP = arenaGroup.userData.portal;
  let inside = false, near = false, ready = false, target = null, mesh = null, goPhase = null;
  if (cur === "hub") {
    mesh = hubP;
    inside = playerInsidePortal(hubP, p.x, p.y, p.z);
    near = playerNearPortal(hubP, p.x, p.z, 6);
    if (inside || near) { ready = true; goPhase = "arena"; target = "hub"; }
  } else {
    mesh = arenaP;
    inside = playerInsidePortal(arenaP, p.x, p.y, p.z);
    near = playerNearPortal(arenaP, p.x, p.z, 6);
    if (inside || near) target = "arena";
    if ((inside || near) && cur === "portal_ready") { ready = true; goPhase = "next"; }
    if (cur === "bazaar" && (inside || near)) { ready = true; goPhase = "bazaar_leave"; }
  }
  if (ready) {
    if (lastPortalKind !== target) { portalHoldTime = 0; lastPortalKind = target; }
    portalHoldTime += dt;
    const pct = Math.min(100, Math.round(portalHoldTime / PORTAL_HOLD_S * 100));
    hintText.textContent = (goPhase === "next"
      ? `следующий этап… ${pct}%`
      : (goPhase === "bazaar_leave" ? `вернуться с Базара… ${pct}%` : `вход в портал… ${pct}%`));
    hintText.style.opacity = 1;
    hintTimer = 0.3;
    if (mesh) updateArenaPortal({ userData: { portal: mesh } }, "hold", performance.now() * 0.001, pct / 100);
    if (portalHoldTime >= PORTAL_HOLD_S) {
      flashTeleport();
      playSound("teleport");
      sendPortalPhase(goPhase);
      portalHoldTime = 0;
      lastPortalKind = null;
      portalGraceUntil = performance.now() + 2500;
      hintText.textContent = "телепортация…";
      hintText.style.opacity = 1;
      hintTimer = 2.0;
    }
  } else if (inside || near) {
    portalHoldTime = 0;
    if (cur === "arena" && !room.state.portalActive) {
      hintText.textContent = inside ? "[E] зажечь портал" : "подойди в проём · [E] зажечь";
    } else if (cur === "arena" && room.state.portalActive && cur !== "portal_ready") {
      const cur2 = Math.floor(room.state.portalCharge);
      const tot = Math.floor(room.state.portalTarget);
      hintText.textContent = inside ? `оборона: ${cur2}/${tot} с` : `держите зону телепорта · ${cur2}/${tot} с`;
    } else if (cur === "portal_ready") {
      const kind = stageKind(room.state.levelIndex || 0);
      if (kind === "fork") hintText.textContent = "удержи — босс Митрикс · [L] Loop · [G] лобби";
      else if (kind === "boss") hintText.textContent = "удержи — эвакуация после Митрикса · [G] лобби";
      else hintText.textContent = "удержи — следующий этап · [G] лобби";
    } else if (cur === "bazaar") {
      hintText.textContent = "Базар Ньюта · удержи портал чтобы вернуться";
    } else if (cur === "hub") {
      hintText.textContent = inside ? "стой в портале — переход на арену" : "войди в фиолетовую рамку";
    } else {
      hintText.textContent = "портал ещё не заряжен";
    }
    hintText.style.opacity = 1;
    hintTimer = 0.3;
  } else {
    portalHoldTime = 0;
    lastPortalKind = null;
  }
}


function updateArenaLootHint() {
  if (!room || !myPlayer) return;
  if (room.state.phase === "hub") return;
  let best = null, bestD = 3, bestId = null;
  pickupMeshes.forEach((m, id) => {
    const pk = room.state.pickups.get(id);
    if (!pk || pk.taken) return;
    const d = m.position.distanceTo(controller.position);
    if (d < bestD) { bestD = d; best = pk; bestId = id; }
  });
  window.__nearPickupId = bestId;
  if (!best) return;
  if (best.kind === "SHRINE_BLOOD") {
    hintText.textContent = "[E] алтарь крови · 20% HP → золото";
  } else if (best.kind === "SHRINE_CHANCE") {
    hintText.textContent = "[E] алтарь шанса · золото, 50% предмет";
  } else if (best.kind === "SHRINE_COMBAT") {
    hintText.textContent = "[E] алтарь боя · волна врагов";
  } else if (best.kind === "PRINTER") {
    const it = ITEMS.find(x => x.id === best.itemId);
    hintText.textContent = `[E] принтер · ${it?.name || best.itemId} за лом/предмет той же редкости`;
  } else if (best.kind === "SHRINE_NEWT") {
    hintText.textContent = "[E] алтарь Ньюта · синий портал на Базар";
  } else if (best.kind === "BLUE_PORTAL") {
    hintText.textContent = "[E] синий портал · Базар между мирами";
  } else if (best.kind === "RETURN_PORTAL") {
    hintText.textContent = "[E] вернуться с Базара";
  } else if (best.kind === "BAZAAR_ITEM") {
    const it = ITEMS.find(x => x.id === best.itemId);
    hintText.textContent = `[E] ${it?.name || best.itemId} · ${best.goldCost || 1} лунных`;
  } else if (best.kind === "BAZAAR_SKIP") {
    hintText.textContent = "[E] сменить следующий этап · 1 лунная";
  } else if (best.kind === "DRONE") {
    hintText.textContent = `[E] починить дрона · ${best.goldCost || 0} золота`;
  } else if (best.kind === "EQUIP") {
    const eq = EQUIPMENT[best.itemId] || EQUIPMENT.HEAL;
    hintText.textContent = `[E] снаряжение: ${eq.name} · ${best.goldCost || 0} золота`;
  } else if (best.kind === "CHEST_TRIPLE") {
    const opts = String(best.itemId || "").split("|");
    const names = opts.map(id => ITEMS.find(x => x.id === id)?.name || id).join(" / ");
    hintText.textContent = `[1/2/3] трипл-сундук · ${names} · ${best.goldCost || 0} золота`;
  } else if (best.kind === "CHEST_LARGE") {
    const it = ITEMS.find(x => x.id === best.itemId);
    hintText.textContent = `[E] большой сундук · ${it?.name || "лут"} · ${best.goldCost || 0} золота`;
  } else if (best.kind === "SCRAPPER") {
    hintText.textContent = "[E] утильщик · предмет → лом";
  } else {
    const it = ITEMS.find(x => x.id === (best.itemId || best.handType));
    const name = it?.name || best.handType || best.itemId || "лут";
    const cost = best.goldCost || 0;
    hintText.textContent = cost > 0 ? `[E] ${name} · ${cost} золота` : `[E] взять ${name}`;
  }
  hintText.style.opacity = 1;
  hintTimer = 0.25;
}

// Подсказка о взаимодействии с хаб-объектами
function updateHubInteractionHint() {
  if (!room || !myPlayer || room.state.phase !== "hub") return;
  // Показываем ТОЛЬКО когда действительно можно нажать F/G рядом с объектом (< 2м)
  let action = null;
  hubSlotMeshes.forEach((g, i) => {
    const d = g.position.distanceTo(controller.position);
    if (d < 2 && !action) {
      const slot = room.state.hubSlots[i];
      if (slot && !slot.empty) action = `[E] взять ${slotLabel(slot.kind, slot.handType, slot.itemId)}`;
      else if (slot && slot.empty && myPlayer) {
        if (myPlayer.itemsInBody && myPlayer.itemsInBody.length) action = "[E] положить пассив";
      }
    }
  });
  hubChestMeshes.forEach((g, i) => {
    const d = g.position.distanceTo(controller.position);
    if (d < 2.5 && !action) {
      const chest = room.state.hubChests[i];
      const n = chest ? chest.contents.length : 0;
      if (n > 0) action = `[E] открыть сундук (${n})`;
      else action = "сундук пуст";
    }
  });
  // v0.0.3.6: портал в хабе — единственный путь на арену (подсказка через handlePortalTriggers)
  const hubPortalPos = getHubPortalPos(hubGroup);
  if (hubPortalPos && !action) {
    const dPortal = Math.hypot(controller.position.x - hubPortalPos.x, controller.position.z - hubPortalPos.z);
    if (dPortal < 2.5) action = "Стой на портале → телепорт на арену";
  }
  // алтарь перековки рук убран
  if (action) {
    hintText.textContent = action;
    hintText.style.opacity = 1.0;
    hintTimer = 0.2;
  }
}

function slotLabel(kind, handType, itemId) {
  if (kind === "HAND") return `руку (${handType || "?"})`;
  if (kind === "LEG") return "ногу";
  if (kind === "ITEM") return `предмет (${itemId || "?"})`;
  if (kind === "WEAPON") return `оружие (${handType || itemId || "?"})`;
  if (kind === "CARD") return `карту (${handType || itemId || "?"})`;
  return "предмет";
}

// ── ИНВЕНТАРЬ СУНДУКА ────────────────────────────────
function parseChestItem(raw) {
  // Формат "KIND:SUB" (HAND:FIRE, LEG:, ITEM:SIGIL_DASH)
  const [kind, sub] = String(raw).split(":");
  return { kind, sub: sub || "" };
}
function chestItemLabel(raw) {
  const { kind, sub } = parseChestItem(raw);
  if (kind === "HAND") {
    const t = ({ FIRE: "ОГНЕННАЯ", ICE: "ЛЕДЯНАЯ", BONE: "КОСТЯНАЯ", CHAIN: "ГРОЗОВАЯ" })[sub] || sub;
    return `Рука: ${t}`;
  }
  if (kind === "LEG") return "Нога";
  if (kind === "ITEM") {
    const it = ITEMS.find(x => x.id === sub);
    return it ? it.name : (sub || "Предмет");
  }
  return "Предмет";
}
function chestItemColor(raw) {
  const { kind, sub } = parseChestItem(raw);
  if (kind === "HAND") {
    return { FIRE: "#ff5522", ICE: "#66ccff", BONE: "#d0c0a0", CHAIN: "#66e0ff" }[sub] || "#c0a070";
  }
  if (kind === "LEG") return "#a0c060";
  if (kind === "ITEM") return "#c080ff";
  if (kind === "WEAPON") return "#e8c040";
  if (kind === "CARD") return "#ff4040";
  return "#c0a070";
}
function drawChestIcon(ctx, raw, size) {
  const { kind, sub } = parseChestItem(raw);
  const cx = size / 2, cy = size / 2;
  const col = chestItemColor(raw);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  if (kind === "HAND") {
    // Ладонь: круг + 4 пальца + бase
    ctx.fillStyle = col;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    // Ладонь
    ctx.beginPath();
    ctx.roundRect(cx - 16, cy - 8, 32, 26, 6);
    ctx.fill(); ctx.stroke();
    // 4 пальца
    for (let i = -1.5; i <= 1.5; i++) {
      ctx.beginPath();
      ctx.roundRect(cx + i * 8 - 3, cy - 22, 6, 18, 3);
      ctx.fill(); ctx.stroke();
    }
    // Б. палец
    ctx.beginPath();
    ctx.roundRect(cx + 14, cy - 4, 8, 16, 3);
    ctx.fill(); ctx.stroke();
    // Свечение в ладони
    const g = ctx.createRadialGradient(cx, cy + 4, 2, cx, cy + 4, 14);
    g.addColorStop(0, col);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy + 4, 14, 0, Math.PI * 2); ctx.fill();
  } else if (kind === "LEG") {
    // Стилизованный сапог
    ctx.fillStyle = col;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 22);
    ctx.lineTo(cx + 6, cy - 22);
    ctx.lineTo(cx + 6, cy + 12);
    ctx.lineTo(cx + 20, cy + 12);
    ctx.lineTo(cx + 20, cy + 22);
    ctx.lineTo(cx - 8, cy + 22);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else if (kind === "ITEM") {
    // Кристалл/сигил: ромб с внутренним свечением
    ctx.fillStyle = col;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 22);
    ctx.lineTo(cx + 16, cy);
    ctx.lineTo(cx, cy + 22);
    ctx.lineTo(cx - 16, cy);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 22); ctx.lineTo(cx, cy + 22);
    ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
    ctx.stroke();
  } else if (kind === "WEAPON") {
    ctx.fillStyle = col;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 22);
    ctx.lineTo(cx + 6, cy + 8);
    ctx.lineTo(cx + 2, cy + 8);
    ctx.lineTo(cx + 2, cy + 22);
    ctx.lineTo(cx - 2, cy + 22);
    ctx.lineTo(cx - 2, cy + 8);
    ctx.lineTo(cx - 6, cy + 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff8";
    ctx.fillRect(cx - 8, cy + 4, 16, 4);
  } else if (kind === "CARD") {
    ctx.fillStyle = col;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - 14, cy - 20, 28, 40, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(({ ANGER: "A", FRENZY: "F", RAIN: "R" })[sub] || "C", cx, cy);
  } else {
    ctx.fillStyle = "#666";
    ctx.fillRect(cx - 12, cy - 12, 24, 24);
  }
  ctx.restore();
}
function renderChestPanel() {
  if (openChestIndex < 0 || !room) return;
  const chest = room.state.hubChests[openChestIndex];
  if (!chest) return closeChestPanel();
  const grid = document.getElementById("chestGrid");
  const counter = document.getElementById("chestCounter");
  const n = chest.contents.length;
  const CAP = 24; // v0.0.3.4: сетка 4х6 — лимит сундука на сервере
  counter.textContent = `${n} / ${CAP}`;
  grid.innerHTML = "";
  const total = Math.max(CAP, Math.ceil(n / 4) * 4);
  for (let i = 0; i < total; i++) {
    const cell = document.createElement("div");
    cell.style.cssText = [
      "aspect-ratio:1",
      "background:linear-gradient(180deg,#1a0f08 0%,#0a0503 100%)",
      "border:2px solid #3a2818",
      "border-radius:6px",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "position:relative",
      i < n ? "cursor:pointer" : "opacity:0.4",
      i < n ? "box-shadow:inset 0 0 8px rgba(255,170,50,0.3)" : "",
    ].join(";");
    if (i < n) {
      const raw = chest.contents[i];
      // Канвас-иконка
      const cnv = document.createElement("canvas");
      cnv.width = 64; cnv.height = 64;
      cnv.style.cssText = "width:56px;height:56px;image-rendering:crisp-edges;";
      drawChestIcon(cnv.getContext("2d"), raw, 64);
      cell.appendChild(cnv);
      // Подпись
      const label = document.createElement("div");
      label.style.cssText = "font-size:11px;color:#e0c090;margin-top:2px;text-align:center;line-height:1.1;padding:0 2px;";
      label.textContent = chestItemLabel(raw);
      cell.appendChild(label);
      // Клик — забрать
      cell.addEventListener("click", () => {
        room.send("hub_take", { source: "chest", index: openChestIndex, item: i });
        playSound("pickup");
        // Перерендер по onChange придёт автоматом через ~100мс; оптимистично:
        setTimeout(renderChestPanel, 120);
      });
      cell.addEventListener("mouseenter", (ev) => { cell.style.borderColor = "#d4a020"; showItemTooltip(ev, raw); });
      cell.addEventListener("mousemove", (ev) => showItemTooltip(ev, raw));
      cell.addEventListener("mouseleave", () => { cell.style.borderColor = "#3a2818"; hideItemTooltip(); });
    }
    grid.appendChild(cell);
  }
  // v0.0.3.4: ПРАВАЯ КОЛОНКА — мой инвентарь (клик → hub_put_chest)
  const myGrid = document.getElementById("chestMyInv");
  if (myGrid && myPlayer) {
    myGrid.innerHTML = "";
    const myItems = [];
    const body = myPlayer.itemsInBody && (myPlayer.itemsInBody.toArray ? myPlayer.itemsInBody.toArray() : [...myPlayer.itemsInBody]);
    (body || []).forEach((id) => {
      if (!id) return;
      const it = ITEMS.find(x => x.id === id);
      myItems.push({ raw: "ITEM:" + id, what: "item", label: it?.name || id });
    });
    const CAP2 = 24;
    const total2 = Math.max(CAP2, Math.ceil(myItems.length / 4) * 4);
    for (let i = 0; i < total2; i++) {
      const cell = document.createElement("div");
      cell.style.cssText = [
        "aspect-ratio:1",
        "background:linear-gradient(180deg,#1a0f08 0%,#0a0503 100%)",
        "border:2px solid #3a2818",
        "border-radius:6px",
        "display:flex", "flex-direction:column",
        "align-items:center", "justify-content:center", "position:relative",
        i < myItems.length ? "cursor:pointer" : "opacity:0.35",
        i < myItems.length ? "box-shadow:inset 0 0 8px rgba(100,200,255,0.25)" : "",
      ].join(";");
      if (i < myItems.length) {
        const it = myItems[i];
        const cnv = document.createElement("canvas");
        cnv.width = 64; cnv.height = 64;
        cnv.style.cssText = "width:56px;height:56px;image-rendering:crisp-edges;";
        drawChestIcon(cnv.getContext("2d"), it.raw, 64);
        cell.appendChild(cnv);
        const label = document.createElement("div");
        label.style.cssText = "font-size:10px;color:#c8d8f0;margin-top:2px;text-align:center;line-height:1.1;padding:0 2px;";
        label.textContent = it.label;
        cell.appendChild(label);
        cell.addEventListener("click", () => {
          room.send("hub_put_chest", { index: openChestIndex, what: it.what });
          playSound("pickup");
          setTimeout(renderChestPanel, 120);
        });
        cell.addEventListener("mouseenter", (ev) => { cell.style.borderColor = "#5a90d4"; showItemTooltip(ev, it.raw); });
        cell.addEventListener("mousemove", (ev) => showItemTooltip(ev, it.raw));
        cell.addEventListener("mouseleave", () => { cell.style.borderColor = "#3a2818"; hideItemTooltip(); });
      }
      myGrid.appendChild(cell);
    }
  }
}
function openChestPanel(i) {
  if (openChestIndex === i) return;
  openChestIndex = i;
  chestPanel.style.display = "block";
  // Освободить курсор мыши
  if (document.pointerLockElement) document.exitPointerLock();
  renderChestPanel();
}
function closeChestPanel() {
  if (openChestIndex < 0) return;
  openChestIndex = -1;
  chestPanel.style.display = "none";
  hideItemTooltip();
}
document.getElementById("chestClose").addEventListener("click", closeChestPanel);
// ESC — закрыть панель если открыта (также освобождает pointer lock по-браузерному)
document.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && openChestIndex >= 0) {
    closeChestPanel();
    e.stopPropagation();
  }
});

let fellFlashUntil = 0;
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  controller.update(dt, myPlayer);
  syncLocalHero(dt);

  // v0.0.3.1: ПАДЕНИЕ С КРАЯ НА АРЕНЕ → сервер возвращает игрока на край с 5% HP
  if (room && myPlayer && (room.state.phase === "arena" || room.state.phase === "portal_ready" || room.state.phase === "bazaar")) {
    const p = controller.position;
    if (p.y < -5 && !myPlayer.isGhost) {
      // send once every 2s
      if (!animate._lastFallSend || performance.now() - animate._lastFallSend > 2000) {
        animate._lastFallSend = performance.now();
        room.send("fall", { x: p.x, z: p.z });
      }
    }
  }
  // v0.0.3.1: HUD Звёздного Блока
  if (myPlayer && V31_MODE) {
    const nowS = Date.now() / 1000;
    const active = (myPlayer.blockAbsorbLeft || 0) > 0;
    if (active) {
      const pct = Math.max(0, Math.min(1, (myPlayer.blockAbsorbLeft || 0) / 100));
      blockHudFill.style.width = (pct * 100).toFixed(1) + "%";
      blockHudLabel.textContent = `ЩИТ: ${Math.round(myPlayer.blockAbsorbLeft)} HP`;
      blockHud.style.opacity = 0.9;
    } else {
      blockHud.style.opacity = 0;
    }
    // ЛКМ / ПКМ кулдауны с сервера
    const kit = SURVIVOR;
    const fillChip = (chip, until, hint, cdMax) => {
      const left = Math.max(0, (until || 0) - nowS);
      const v = chip.querySelector(".cdv");
      const bar = chip.querySelector(".cdbar");
      chip.style.opacity = "1";
      chip.title = hint || "";
      if (left > 0.05) {
        v.textContent = "КД " + (left >= 10 ? left.toFixed(0) : left.toFixed(1)) + "с";
        chip.style.borderColor = "#a64";
        if (bar) {
          const max = Math.max(0.2, cdMax || 1);
          bar.style.width = Math.min(100, (left / max) * 100).toFixed(1) + "%";
          bar.style.background = "#ff8844";
        }
      } else {
        v.textContent = "готово";
        chip.style.borderColor = "#6c6";
        if (bar) { bar.style.width = "100%"; bar.style.background = "#66cc88"; }
      }
    };
    const lmbSpell = SPELLS[kit.lmb];
    const rmbSpell = SPELLS[kit.rmb];
    const specSpell = SPELLS[kit.special];
    fillChip(lmbChip, myPlayer.lmbCdUntil, kit.lmbHint, lmbSpell?.cooldown);
    fillChip(rmbChip, myPlayer.rmbCdUntil, kit.rmbHint, rmbSpell?.cooldown);
    extraChip.style.display = "flex";
    extraChip.querySelector(".cdv").textContent = controller.dashCd > 0.05
      ? ("КД " + controller.dashCd.toFixed(1) + "с")
      : "рывок";
    fillChip(specChip, myPlayer.specCdUntil, kit.specialHint, specSpell?.cooldown);
    const eqLeft = Math.max(0, (myPlayer.equipCdUntil || 0) - nowS);
    const eqDef = EQUIPMENT[myPlayer.equipmentId || "HEAL"] || EQUIPMENT.HEAL;
    eqChip.querySelector(".cdv").textContent = eqLeft > 0.05 ? ("КД " + eqLeft.toFixed(1) + "с") : (eqDef.name || "Q");
    eqChip.style.borderColor = eqLeft > 0.05 ? "#a64" : "#6c6";
    blockCdHud.style.display = "none";
  }
  // ── ПАДЕНИЕ С КРАЯ: смерть + респаун в центре хаба ────────
  if (room && myPlayer && room.state.phase === "hub") {
    const p = controller.position;
    // Падаем с края если: вне радиуса хаба ИЗ высота < -5
    const distXZ = Math.hypot(p.x, p.z);
    const outside = distXZ > WORLD.HUB_RADIUS * 1.05;
    const belowDeath = p.y < -5;
    if (belowDeath || (outside && p.y < 0)) {
      controller.setPosition(0, 2, WORLD.LOBBY_SPAWN_Z || 14);
      // Обнулить вертикальную скорость внутри контроллера
      if (controller.velocity) { controller.velocity.x = 0; controller.velocity.y = 0; controller.velocity.z = 0; }
      playSound("teleport");
      fellFlashUntil = performance.now() + 350;
      // Кратко мигнуть подсказкой
      hintText.textContent = "Не падай с края";
      hintText.style.opacity = 1;
      setTimeout(() => { hintText.style.opacity = 0; }, 1500);
    }
  }

  // Определяем движется ли игрок (для звука шагов)
  const nowP = controller.position;
  const moved = nowP.distanceTo(prevControllerPos) > 0.01;
  if (moved && myPlayer && !myPlayer.isGhost) {
    footstepTimer -= dt;
    if (footstepTimer <= 0) {
      playSound("footstep");
      footstepTimer = 0.4;
    }
  }
  prevControllerPos.copy(nowP);

  // ── Враги: интерполяция + анимация ──────────────────────
  const lerpSpeed = 12;
  // v0.0.3.6: в хабе враги всегда невидимы (страховка от рассинхрона)
  const hideEnemies = room && room.state && room.state.phase === "hub";
  enemyMeshes.forEach(entry => {
    const m = entry.mesh;
    if (hideEnemies) { m.visible = false; return; }
    m.visible = true;
    if (!entry.alive) entry.targetY = 0.9;
    const a = Math.min(1, dt * lerpSpeed);
    m.position.x += (entry.targetX - m.position.x) * a;
    m.position.y += (entry.targetY - m.position.y) * a;
    m.position.z += (entry.targetZ - m.position.z) * a;

    // Определяем движение
    const moved = Math.hypot(m.position.x - entry.prevX, m.position.z - entry.prevZ) > 0.005;
    entry.moving = moved;
    entry.prevX = m.position.x;
    entry.prevZ = m.position.z;

    // Поворот в сторону движения
    if (moved) {
      const dx = entry.targetX - m.position.x;
      const dz = entry.targetZ - m.position.z;
      if (dx * dx + dz * dz > 0.001) {
        const targetYaw = Math.atan2(dx, dz);
        // Плавный поворот
        let diff = targetYaw - m.rotation.y;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        m.rotation.y += diff * Math.min(1, dt * 6);
      }
    }
      if (m.userData.cacoV3) {
      const attacking = !!(entry._attackingUntil && performance.now() < entry._attackingUntil);
      const inPain = !!(entry._painUntil && performance.now() < entry._painUntil);
      const lookYaw = myPlayer
        ? Math.atan2(controller.position.x - m.position.x, controller.position.z - m.position.z)
        : m.rotation.y;
      if (!entry.alive) {
        const tDeath = Math.min(1, (performance.now() - (entry.deathAt || 0)) / 780);
        updateCacodemonSprite(m, camera, lookYaw, tDeath, false, false, false);
      } else {
        entry.animPhase = ((entry.animPhase || 0) + dt * (attacking ? 8 : 3.2)) % 1;
        updateCacodemonSprite(m, camera, lookYaw, entry.animPhase, true, attacking, inPain);
      }
    } else {
      animateEnemy(m, dt, moved);
    }
  });

  // ── Другие игроки ─────────────────────────────────────
  otherPlayers.forEach(entry => {
    const m = entry.mesh;
    const a = Math.min(1, dt * 12);
    m.position.x += (entry.targetX - m.position.x) * a;
    m.position.y += (entry.targetY - m.position.y) * a;
    m.position.z += (entry.targetZ - m.position.z) * a;
    const moved = Math.hypot(m.position.x - entry.prevX, m.position.z - entry.prevZ) > 0.005;
    entry.prevX = m.position.x; entry.prevZ = m.position.z;
    m.userData.facingYaw = (entry.targetYaw || 0) + Math.PI;
    animateOtherPlayer(m, dt, moved, camera);

    // Табличка с именем всегда смотрит на камеру (билборд)
    if (m.userData.nameSprite) {
      // Sprite автоматически смотрит на камеру
    }
  });

  // ── Пьедесталы (кристаллы вращаются) ─────────────────
  pickupMeshes.forEach(m => {
    if (m.userData.crystal) animatePedestal(m, dt);
    if (m.userData.floatCard) animateFloatingLoot(m, camera, performance.now() * 0.001);
  });
  hubSlotMeshes.forEach(g => {
    if (g && g.userData.floatCard) animateFloatingLoot(g, camera, performance.now() * 0.001);
  });

  // ── Факелы (пламя мерцает) ──────────────────────────
  const activeGroup = hubGroup.visible ? hubGroup : arenaGroup;
  animateTorches(activeGroup, dt);
  if (room) {
    const tSec = performance.now() * 0.001;
    // Перемещаем портал в точку от сервера (случайная каждый забег)
    setArenaPortalPosition(arenaGroup, room.state.portalX, room.state.portalZ);
    let pstate = "idle";
    if (room.state.phase === "portal_ready") pstate = "ready";
    else if (room.state.portalActive) pstate = "charging";
    const ratio = room.state.portalTarget > 0 ? (room.state.portalCharge / room.state.portalTarget) : 0;
    updateArenaPortal(arenaGroup, pstate, tSec, ratio);
    updateHubPortal(hubGroup, tSec);
    animateDangerZones(arenaGroup, tSec);
  // Открытие ближайшего сундука в хабе + автозакрытие UI если отошли
  if (room && room.state.phase === "hub") {
    hubChestMeshes.forEach((g, i) => {
      const d = g.position.distanceTo(controller.position);
      const open = d < 3;
      setChestOpen(g, open, dt);
    });
    if (openChestIndex >= 0) {
      const g = hubChestMeshes[openChestIndex];
      if (!g || g.position.distanceTo(controller.position) > 4) closeChestPanel();
    }
    // v0.0.3.6: лайв-рендер открытой панели — таймер 5гц (надёжно)
    if (openChestIndex >= 0) {
      window.__chestRerender = (window.__chestRerender || 0) + dt;
      if (window.__chestRerender >= 0.2) { window.__chestRerender = 0; renderChestPanel(); }
    }
  } else {
    hubChestMeshes.forEach(g => setChestOpen(g, false, dt));
    if (openChestIndex >= 0) closeChestPanel();
  }
  // TAB — обновлять сетку только при смене инвентаря (иначе DnD ломается каждый кадр)
  if (loadoutOpen) {
    const hpEl = document.getElementById("loadoutHp");
    if (hpEl && myPlayer) hpEl.textContent = `HP: ${myPlayer.hp}/${myPlayer.maxHp || 3}` + (myPlayer.isGhost ? "  • НАБЛЮДАТЕЛЬ" : "");
    const sig = String(myPlayer?.equipmentId || "") + "|" + stackedPassives(myPlayer).map(s => s.id + s.n).join(",");
    if (sig !== window.__loadoutSig) {
      window.__loadoutSig = sig;
      renderLoadoutPanel();
    }
  }
    updateArenaLootHint();
    updateHubInteractionHint();
    handlePortalTriggers(dt);
  }

  // HUD-подсказка
  if (hintTimer > 0) {
    hintTimer -= dt;
    hintText.style.opacity = hintTimer > 0 ? 1 : 0;
  }

  // ── Снаряды ─────────────────────────────────────────
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.ttl -= dt;
    if (s.homeId && enemyMeshes) {
      const tgt = enemyMeshes.get(s.homeId);
      if (tgt && tgt.mesh && tgt.alive !== false) {
        const p = tgt.mesh.position;
        const dx = p.x - s.mesh.position.x, dy = p.y - s.mesh.position.y, dz = p.z - s.mesh.position.z;
        const L = Math.max(0.001, Math.hypot(dx, dy, dz));
        const sp = Math.hypot(s.vx, s.vy, s.vz) || 34;
        s.vx = s.vx * 0.7 + (dx / L) * sp * 0.3;
        s.vy = s.vy * 0.7 + (dy / L) * sp * 0.3;
        s.vz = s.vz * 0.7 + (dz / L) * sp * 0.3;
        const ns = Math.hypot(s.vx, s.vy, s.vz) || 1;
        s.vx = s.vx / ns * sp; s.vy = s.vy / ns * sp; s.vz = s.vz / ns * sp;
      }
    }
    if (s.vx || s.vy || s.vz) {
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
    }
    if (s.gravity) { s.vy -= s.gravity * dt; }
    if (s.spin) { s.mesh.rotation.x += s.spin * dt; s.mesh.rotation.y += s.spin * 0.7 * dt; }
    if (s.mesh.material) {
      s.mesh.material.opacity = Math.max(0, s.ttl / s.maxTtl);
      s.mesh.material.transparent = true;
    }
    if (s.ttl <= 0) {
      scene.remove(s.mesh);
      if (s.mesh.userData && s.mesh.userData.disposeExtras) s.mesh.userData.disposeExtras();
      disposeMatOnly(s.mesh);
      shots.splice(i, 1);
    }
  }

  if (deathTimer > 0) {
    deathTimer -= dt;
    // Авто-респ убран — через дебаг-панель
    void deathTimer;
  }
  if (dmgTimer > 0) {
    dmgTimer -= dt;
    // Красный экранный overlay убран — трещины на руках вместо этого (в hands3d)
    dmgOverlay.style.opacity = 0;
  } else {
    dmgOverlay.style.opacity = 0;
  }

  // ── Анимация рук ─────────────────────────────────────
  animateHands(handsRoot, dt, { moving: moved });

  // рука — ниже и с перспективой; оружие отдельно справа снизу
  if (V3_MODE) {
    const inGame = menu.style.display === "none";
    fpsHud.style.display = "none";
    weaponHud.style.display = "none";
    wpnCdHud.style.display = inGame ? "flex" : "none";
  }
  if (starShieldGroup) {
    const on = !!(myPlayer && (myPlayer.blockAbsorbLeft || 0) > 0);
    if (on) {
      const p = controller.position;
      syncOrbitShield(starShieldGroup, p.x, p.y + 0.95, p.z, dt);
    } else starShieldGroup.visible = false;
  }
  if (room && room.state && room.state.players) {
    const live = new Set();
    room.state.players.forEach((p, id) => {
      if (id === selfId) return;
      if ((p.blockAbsorbLeft || 0) <= 0) return;
      live.add(id);
      let g = otherShields.get(id);
      if (!g) {
        g = starShieldGroup.clone(true);
        g.traverse((o) => {
          if (o.isMesh && o.material) o.material = o.material.clone();
        });
        g.children.forEach((ch, i) => {
          ch.userData.ang = (i / Math.max(1, g.children.length)) * Math.PI * 2;
        });
        scene.add(g);
        otherShields.set(id, g);
      }
      const e = otherPlayers.get(id);
      const x = e ? e.mesh.position.x : p.pos.x;
      const y = e ? e.mesh.position.y + 0.9 : p.pos.y + 0.9;
      const z = e ? e.mesh.position.z : p.pos.z;
      syncOrbitShield(g, x, y, z, dt);
    });
    otherShields.forEach((g, id) => {
      if (!live.has(id)) g.visible = false;
    });
  }
  fadeHandCracks(handsRoot, dt);

  drawRadar();
  updateAimEnemyHud();
  updateCooldownHud();
  // v0.0.3.4: всегда через post (глобальный дизеринг). Pixelscale дополнительно пикселизует.
  if (!postScene) { ensurePostFx(); resizeLowResRT(); }
  if (rtLowRes && postScene) {
    renderer.setRenderTarget(rtLowRes);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  } else {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}
animate();

// ═══════════════════════════════════════════════════════════════════
// СТАТУС-ЛЕНТА
// ═══════════════════════════════════════════════════════════════════
function phaseLabelRu(ph) {
  return ({ hub: "Лобби", arena: "Арена", portal_ready: "Портал готов", bazaar: "Базар", wipe_hub: "Возврат" })[ph] || ph;
}
setInterval(() => {
  if (!room) return;
  const ph = room.state.phase;
  const bits = [phaseLabelRu(ph)];
  if (ph === "arena") bits.push("волна " + room.state.wave);
  if (ph === "arena" && room.state.portalActive) {
    bits.push(`портал ${Math.floor(room.state.portalCharge)}/${Math.floor(room.state.portalTarget)}`);
  } else if (ph === "portal_ready") {
    const kind = stageKind(room.state.levelIndex || 0);
    bits.push(kind === "fork" ? "Митрикс / [L] Loop" : (kind === "boss" ? "эвакуация" : "следующий этап"));
  } else if (ph === "bazaar") {
    bits.push("лунный магазин");
  } else if (ph === "hub") {
    bits.push("удержи портал");
  }
  const L = LEVELS[room.state.levelIndex || 0];
  if (ph !== "hub" && L) bits.push(L.label);
  if ((room.state.loopCount || 0) > 0) bits.push("Loop " + room.state.loopCount);
  const n = room.state.players.size;
  if (n > 1) bits.push(n + " игрока");
  if (myPlayer && (myPlayer.lunarShards || 0) > 0) bits.push("лунные " + myPlayer.lunarShards);
  status.textContent = bits.join(" · ");
  renderPassivesHud();
  const runHud = document.getElementById("runHud");
  if (runHud) {
    if (ph === "hub") {
      runHud.textContent = "";
    } else {
      const t = Math.floor(room.state.runTimeSec || 0);
      const mm = String(Math.floor(t / 60)).padStart(2, "0");
      const ss = String(t % 60).padStart(2, "0");
      const gold = myPlayer && myPlayer.gold != null ? Math.floor(myPlayer.gold) : 0;
      const lv = myPlayer && myPlayer.survivorLevel ? myPlayer.survivorLevel : 1;
      const xp = myPlayer && myPlayer.xp != null ? Math.floor(myPlayer.xp) : 0;
      const need = xpToNextLevel(lv);
      const lunar = myPlayer && myPlayer.lunarShards != null ? Math.floor(myPlayer.lunarShards) : 0;
      runHud.innerHTML = `${difficultyLabel(t)} · ${mm}:${ss}<br>золото ${gold} · лунные ${lunar}<br>ур. ${lv} · ${xp}/${need} XP`;
    }
  }
}, 250);
