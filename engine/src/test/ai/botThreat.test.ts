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
import type { GameState, ShipLoadout } from "../../models/game.ts";
import type { SubsystemId } from "../../models/subsystems.ts";
import { viewFor } from "../../game/view.ts";
import { shieldAbsorption, suspectedWeapon } from "../../ai/index.ts";
import type { Opponent } from "../../ai/types.ts";
import { LOADOUTS, BH, makeTwoPlayerGame, situationOf, withPower, withSub } from "../testUtils.ts";

/** p1 one ring inside p2, same sector: p2's starboard laser bears on p1. */
function facingOff(loadout: ShipLoadout = LOADOUTS.starboardLaser) {
  return makeTwoPlayerGame(
    { wellId: BH, ring: 3, sector: 0, loadout },
    { wellId: BH, ring: 4, sector: 0, loadout }
  );
}

function opponentOf(state: GameState, viewerId: string): Opponent {
  return situationOf(state, viewerId).opponents[0];
}

describe("suspectedWeapon: what the cubes on a face-down slot can mean", () => {
  it.each<[string, "forward" | "side", number, string | null]>([
    // The powerable bow subsystems are the sensor and shields: no weapon.
    ["a loaded bow as no weapon", "forward", 2, null],
    // A full wall or a rack, and the rack is the one that shoots back.
    ["two cubes on a side slot as a possible rack", "side", 2, "ballistic_rack"],
    // Only a shield holds one cube.
    ["one cube on a side slot as a half wall", "side", 1, null],
    // Every gun is dark between shots, so silence is what a scan is for.
    ["a dark slot as saying nothing", "side", 0, null],
  ])("reads %s", (_label, group, allocatedEnergy, type) => {
    const read = suspectedWeapon({ group, allocatedEnergy });
    expect(read?.type ?? null).toBe(type);
    // A guess, never a fact.
    if (read) expect(read.confidence).toBeGreaterThan(0);
    if (read) expect(read.confidence).toBeLessThan(1);
  });
});

describe("threat assessment", () => {
  it("fears a face-up weapon whether or not it is lit: firing is what powers it", () => {
    const state = withSub(facingOff(), "p2", "side-2", { isRevealed: true });
    const opponent = opponentOf(state, "p1");

    const laser = opponent.knownWeapons.find((w) => w.slotId === "side-2");
    expect(laser?.type).toBe("laser");
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
    // Two cubes on a face-down side slot one sector away: a full wall or a
    // rack, and a rack reaches exactly that far. Worth worrying about, not
    // worth treating as a fact.
    const known = withPower(
      withSub(
        makeTwoPlayerGame(
          { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.starboardLaser },
          { wellId: BH, ring: 3, sector: 1, loadout: LOADOUTS.starboardLaser }
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
        { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.starboardLaser },
        { wellId: BH, ring: 3, sector: 1, loadout: LOADOUTS.starboardLaser }
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
  // A face-up wall stops what the engine says it does (damage.test); these
  // are the guesses about face-down slots.
  it.each<[string, SubsystemId, number, number]>([
    ["a face-down side slot at two cubes at half weight: it may be a rack", "side-1", 2, 1],
    ["a face-down side slot at one cube whole: nothing else holds one", "side-1", 1, 1],
    ["nothing for a loaded bow", "forward-0", 2, 0],
  ])("prices %s", (_label, slot, cubes, points) => {
    const state = withPower(facingOff(), "p2", slot, cubes);
    expect(shieldAbsorption(viewFor(state, "p1").players[1].slots)).toBe(points);
  });
});
