import { COMBAT, RUN, sumItemStat } from "../../../shared/index.js";

export function playerMaxHp(p) {
  const lv = Math.max(1, p.survivorLevel || 1);
  return Math.max(1, Math.round(
    COMBAT.PLAYER_MAX_HP
    + (lv - 1) * (RUN.HP_PER_LEVEL || 5)
    + sumItemStat(p, "hp")
  ));
}

export function playerDamageMult(p) {
  const lv = Math.max(1, p.survivorLevel || 1);
  return 1 + (lv - 1) * (RUN.DMG_PER_LEVEL || 0.02) + sumItemStat(p, "dmg");
}

export function combatPlayerCount(players) {
  let n = 0;
  players.forEach((p) => { if (!p.isGhost && p.hp > 0) n++; });
  return Math.max(1, n);
}
