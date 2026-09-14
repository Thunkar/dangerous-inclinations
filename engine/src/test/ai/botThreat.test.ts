/**
 * Reading an opponent's mat.
 *
 * Energy allocation is public but tile identities are not, so everything the
 * bot believes about an enemy's guns and shields comes from cube counts on
 * face-down slots plus whatever is already face-up. These tests pin that
 * reading down: a weapon with no cubes cannot fire, a cube count shared with
 * a harmless tile is only a suspicion, and visible shield cubes have to come
 * off any estimate of how much damage it takes to kill someone.
 */
import { describe, it, expect } from "vitest";
import type { ShipLoadout } from "../../models/game.ts";
import { viewFor } from "../../game/view.ts";
import { analyzeSituation, shieldAbsorption, suspectedWeapon } from "../../ai/index.ts";
import { DEFAULT_BOT_PARAMETERS } from "../../ai/types.ts";
import type { Opponent } from "../../ai/types.ts";
import { chooseCriticalTarget } from "../../ai/behaviors/combat.ts";
import { BH, makeTwoPlayerGame, withPower, withSub } from "../testUtils.ts";

/** Railgun forward; starboard side-2 laser bears inward while prograde. */
const GUNSHIP: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["laser", "shields", "laser", "missiles"],
};

/** p1 one ring inside p2, same sector: p2's starboard laser bears on p1. */
function facingOff(loadout: ShipLoadout = GUNSHIP) {
  return makeTwoPlayerGame(
    { wellId: BH, ring: 3, sector: 0, loadout },
    { wellId: BH, ring: 4, sector: 0, loadout }
  );
}

function opponentOf(state: Parameters<typeof viewFor>[0], viewerId: string): Opponent {
  const situation = analyzeSituation(viewFor(state, viewerId), DEFAULT_BOT_PARAMETERS);
  return situation.opponents[0];
}

describe("suspectedWeapon: what the cubes on a face-down slot can mean", () => {
  it("reads four cubes on the forward slot as a railgun, for certain", () => {
    const read = suspectedWeapon({ group: "forward", allocatedEnergy: 4 });
    expect(read).toEqual({ type: "railgun", damage: 4, confidence: 1 });
  });

  it("reads two cubes on the forward slot as maybe-missiles (it may be a sensor)", () => {
    const read = suspectedWeapon({ group: "forward", allocatedEnergy: 2 });
    expect(read?.type).toBe("missiles");
    expect(read?.confidence).toBeLessThan(1);
    expect(read?.confidence).toBeGreaterThan(0);
  });

  it("reads two cubes on a side slot as the widest envelope, missiles, at reduced weight", () => {
    // Laser, ballistic rack, missiles and shields all fit two cubes; the
    // turret reaches furthest, so that is what the bot plans around.
    const read = suspectedWeapon({ group: "side", allocatedEnergy: 2 });
    expect(read?.type).toBe("missiles");
    expect(read?.confidence).toBeLessThan(1);
  });

  it("reads side slots at 1, 3 or 4 cubes as shields: nothing that can shoot", () => {
    for (const cubes of [1, 3, 4]) {
      expect(suspectedWeapon({ group: "side", allocatedEnergy: cubes })).toBeNull();
    }
  });

  it("reads an empty slot as harmless whatever it is", () => {
    expect(suspectedWeapon({ group: "forward", allocatedEnergy: 0 })).toBeNull();
    expect(suspectedWeapon({ group: "side", allocatedEnergy: 0 })).toBeNull();
  });
});

describe("threat assessment", () => {
  it("does not fear a face-up weapon with no cubes on it: it cannot fire", () => {
    const state = withSub(facingOff(), "p2", "side-2", { isRevealed: true });
    const opponent = opponentOf(state, "p1");

    const laser = opponent.knownWeapons.find((w) => w.slotId === "side-2");
    expect(laser?.type).toBe("laser");
    expect(laser?.isPowered).toBe(false);
    expect(laser?.inRange).toBe(false);
    expect(opponent.threat).toBe(0);
  });

  it("fears the same weapon once it is powered and bearing", () => {
    let state = withSub(facingOff(), "p2", "side-2", { isRevealed: true });
    state = withPower(state, "p2", "side-2", 2);
    const opponent = opponentOf(state, "p1");

    expect(opponent.knownWeapons.find((w) => w.slotId === "side-2")?.inRange).toBe(true);
    expect(opponent.threat).toBeGreaterThan(0);
  });

  it("counts a face-down slot with two cubes as a possible missile threat, at less than full weight", () => {
    // Two cubes on a face-down side slot, three sectors away: out of every
    // broadside arc, but inside a turret's. Worth worrying about, not worth
    // treating as a fact.
    const known = withPower(
      withSub(
        makeTwoPlayerGame(
          { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
          { wellId: BH, ring: 3, sector: 3, loadout: GUNSHIP }
        ),
        "p2",
        "side-3",
        { isRevealed: true }
      ),
      "p2",
      "side-3",
      2
    );
    const hidden = withPower(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
        { wellId: BH, ring: 3, sector: 3, loadout: GUNSHIP }
      ),
      "p2",
      "side-3",
      2
    );

    const suspected = opponentOf(hidden, "p1");
    const confirmed = opponentOf(known, "p1");
    const slot = suspected.unknownSlots.find((s) => s.slot.id === "side-3");

    expect(slot?.suspected?.type).toBe("missiles");
    expect(slot?.inRange).toBe(true);
    expect(suspected.threat).toBeGreaterThan(0);
    expect(suspected.threat).toBeLessThan(confirmed.threat);
  });
});

describe("shieldAbsorption", () => {
  it("counts every cube on a shield tile the bot can see", () => {
    let state = withSub(facingOff(), "p2", "side-1", { isRevealed: true });
    state = withPower(state, "p2", "side-1", 3);
    expect(opponentOf(state, "p1").shieldAbsorption).toBe(3);
  });

  it("counts a face-down side slot that has never fired as half a shield", () => {
    const state = withPower(facingOff(), "p2", "side-1", 3);
    expect(opponentOf(state, "p1").shieldAbsorption).toBe(1.5);
  });

  it("ignores empty slots and forward slots", () => {
    const state = withPower(facingOff(), "p2", "forward-0", 4);
    expect(shieldAbsorption(viewFor(state, "p1").players[1].slots)).toBe(0);
  });
});

describe("chooseCriticalTarget", () => {
  it("names a face-up weapon that is powered before one that is cold", () => {
    let state = withSub(facingOff(), "p2", "side-0", { isRevealed: true });
    state = withSub(state, "p2", "side-2", { isRevealed: true });
    state = withPower(state, "p2", "side-2", 2);
    expect(chooseCriticalTarget(opponentOf(state, "p1"))).toBe("side-2");
  });

  it("gambles on the face-down slot whose cubes read most dangerous", () => {
    let state = withPower(facingOff(), "p2", "forward-0", 4);
    state = withPower(state, "p2", "side-3", 2);
    // Four cubes forward can only be a railgun; two on a side slot might be
    // anything. The railgun is both the likelier and the nastier read.
    expect(chooseCriticalTarget(opponentOf(state, "p1"))).toBe("forward-0");
  });

  it("falls back to the engines when nothing is known and nothing is powered", () => {
    expect(chooseCriticalTarget(opponentOf(facingOff(), "p1"))).toBe("engines");
  });
});
