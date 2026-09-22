/**
 * Reading an opponent's loadout.
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
  it.each([2, 4])("reads a loaded forward slot (%i cubes) as no weapon: only a sensor stands", (cubes) => {
    expect(suspectedWeapon({ group: "forward", allocatedEnergy: cubes })).toBeNull();
  });

  it("reads two cubes on a side slot as a possible ballistic rack", () => {
    // Two cubes on a side slot is a half wall or a rack, and the rack is the
    // one that shoots back.
    const read = suspectedWeapon({ group: "side", allocatedEnergy: 2 });
    expect(read?.type).toBe("ballistic_rack");
    expect(read?.confidence).toBeLessThan(1);
    expect(read?.confidence).toBeGreaterThan(0);
  });

  it("reads four cubes on a side slot as a full wall: nothing that can shoot", () => {
    expect(suspectedWeapon({ group: "side", allocatedEnergy: 4 })).toBeNull();
  });

  it("reads a dark slot as unknown, not as harmless", () => {
    // It says nothing, which is the point: every gun on the board is dark
    // between shots, so silence here is what a scan is for.
    expect(suspectedWeapon({ group: "forward", allocatedEnergy: 0 })).toBeNull();
    expect(suspectedWeapon({ group: "side", allocatedEnergy: 0 })).toBeNull();
  });
});

describe("threat assessment", () => {
  it("fears a face-up weapon whether or not it is lit: firing is what powers it", () => {
    const state = withSub(facingOff(), "p2", "side-2", { isRevealed: true });
    const opponent = opponentOf(state, "p1");

    const laser = opponent.knownWeapons.find((w) => w.slotId === "side-2");
    expect(laser?.type).toBe("laser");
    expect(laser?.isPowered).toBe(false);
    expect(laser?.inRange).toBe(true);
    expect(opponent.threat).toBeGreaterThan(0);
  });

  it("stops fearing it once it is broken", () => {
    let state = withSub(facingOff(), "p2", "side-2", { isRevealed: true });
    state = withSub(state, "p2", "side-2", { isBroken: true });
    const opponent = opponentOf(state, "p1");

    expect(opponent.knownWeapons.find((w) => w.slotId === "side-2")?.inRange).toBe(false);
    expect(opponent.threat).toBe(0);
  });

  it("counts a face-down slot with two cubes as a possible rack, at less than full weight", () => {
    // Two cubes on a face-down side slot one sector away: a half wall or a
    // rack, and a rack reaches exactly that far. Worth worrying about, not
    // worth treating as a fact.
    const known = withPower(
      withSub(
        makeTwoPlayerGame(
          { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
          { wellId: BH, ring: 3, sector: 1, loadout: GUNSHIP }
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
        { wellId: BH, ring: 3, sector: 1, loadout: GUNSHIP }
      ),
      "p2",
      "side-3",
      2
    );

    const suspected = opponentOf(hidden, "p1");
    const confirmed = opponentOf(known, "p1");
    const slot = suspected.unknownSlots.find((s) => s.slot.id === "side-3");

    expect(slot?.suspected?.type).toBe("ballistic_rack");
    expect(slot?.inRange).toBe(true);
    expect(suspected.threat).toBeGreaterThan(0);
    expect(suspected.threat).toBeLessThan(confirmed.threat);
  });
});

describe("shieldAbsorption", () => {
  it("prices a shield tile it can see at one point per two cubes", () => {
    let state = withSub(facingOff(), "p2", "side-1", { isRevealed: true });
    state = withPower(state, "p2", "side-1", 2);
    expect(opponentOf(state, "p1").shieldAbsorption).toBe(1);
  });

  it("counts a face-down side slot at two cubes as half a shield: it may be a rack", () => {
    const state = withPower(facingOff(), "p2", "side-1", 2);
    expect(opponentOf(state, "p1").shieldAbsorption).toBe(0.5);
  });

  it("counts a face-down side slot at four cubes whole: nothing else holds four", () => {
    const state = withPower(facingOff(), "p2", "side-1", 4);
    expect(opponentOf(state, "p1").shieldAbsorption).toBe(2);
  });

  it("ignores empty slots and forward slots", () => {
    const state = withPower(facingOff(), "p2", "forward-0", 4);
    expect(shieldAbsorption(viewFor(state, "p1").players[1].slots)).toBe(0);
  });
});

describe("chooseCriticalTarget", () => {
  it("names the biggest gun it has seen, lit or not", () => {
    // A railgun face-up in the bow and a laser face-up on the side: both are
    // dark between turns, so the choice is damage, not cubes.
    let state = withSub(facingOff(), "p2", "side-0", { isRevealed: true });
    state = withSub(state, "p2", "forward-0", { isRevealed: true });
    expect(chooseCriticalTarget(opponentOf(state, "p1"))).toBe("forward-0");
  });

  it("gambles on a loaded face-down slot when it has seen no gun at all", () => {
    // Nothing face-up, one side slot carrying cubes: it is standing, so it is
    // a wall, a rack or a sensor, and breaking it dumps the cubes as heat.
    const state = withPower(facingOff(), "p2", "side-3", 2);
    expect(chooseCriticalTarget(opponentOf(state, "p1"))).toBe("side-3");
  });

  it("falls back to the engines when nothing is known and nothing is powered", () => {
    expect(chooseCriticalTarget(opponentOf(facingOff(), "p1"))).toBe("engines");
  });
});
