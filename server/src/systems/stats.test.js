import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COMBAT, RUN, ITEMS_BY_ID } from "../../../shared/index.js";
import { playerMaxHp, playerDamageMult, combatPlayerCount } from "./stats.js";

function fakePlayer(overrides = {}) {
  return {
    survivorLevel: 1,
    itemsInBody: [],
    hp: COMBAT.PLAYER_MAX_HP,
    isGhost: false,
    ...overrides,
  };
}

describe("stats", () => {
  it("base max HP matches COMBAT", () => {
    assert.equal(playerMaxHp(fakePlayer()), COMBAT.PLAYER_MAX_HP);
  });

  it("levels add HP_PER_LEVEL", () => {
    const p = fakePlayer({ survivorLevel: 3 });
    assert.equal(playerMaxHp(p), COMBAT.PLAYER_MAX_HP + 2 * (RUN.HP_PER_LEVEL || 5));
  });

  it("stacks Bloodstone into max HP", () => {
    const p = fakePlayer({ itemsInBody: ["BLOODSTONE", "BLOODSTONE"] });
    const extra = (ITEMS_BY_ID.BLOODSTONE.hp || 0) * 2;
    assert.equal(playerMaxHp(p), COMBAT.PLAYER_MAX_HP + extra);
  });

  it("damage mult grows with Ember Sigil", () => {
    const p = fakePlayer({ itemsInBody: ["EMBER_SIGIL"] });
    assert.equal(playerDamageMult(p), 1 + (ITEMS_BY_ID.EMBER_SIGIL.dmg || 0));
  });

  it("combatPlayerCount ignores ghosts", () => {
    const players = [
      fakePlayer(),
      fakePlayer({ isGhost: true }),
      fakePlayer({ hp: 0 }),
    ];
    players.forEach = (fn) => {
      for (const p of players) fn(p);
    };
    assert.equal(combatPlayerCount(players), 1);
  });
});
