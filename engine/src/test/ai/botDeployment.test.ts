/**
 * Deployment phase. `botChooseDeployment` names a legal position on Black Hole
 * ring 3 or ring 4 (three sectors clear of every ship already placed) and it
 * becomes the bot's Home. A Destroy or Intercept holder whose target is placed
 * sits next to it on its ring. All randomness goes through the `pick`
 * callback the caller wires to the game's seeded RNG.
 */
import { describe, it, expect } from "vitest";
import type { GameState, Player, ShipLoadout } from "../../models/game.ts";
import { DEFAULT_LOADOUT } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import {
  HOME_RING,
  HOME_RINGS,
  BLACK_HOLE_ID,
  TRANSFER_LANES,
  arcSectors,
} from "../../models/gravityWells.ts";
import { forwardDistance, sectorDistance, wrapSector } from "../../game/geometry.ts";
import { isInWeaponRange } from "../../game/targeting.ts";
import { deployShip, legalDeploymentPositions } from "../../game/deployment.ts";
import { viewFor } from "../../game/view.ts";
import { botChooseDeployment } from "../../ai/index.ts";
import {
  ALPHA,
  BETA,
  GAMMA,
  deliverMission,
  destroyMission,
  escortMission,
  interceptMission,
  makeGameState,
  makePlayer,
  piracyMission,
  surveyMission,
} from "../testUtils.ts";

const FAST_RING = HOME_RINGS[0];

/** Ring-4 sectors lined up with a lane toward `planetId` (under the arc, or two behind it). */
function linedUpSectors(planetId: string): Set<number> {
  const sectors = new Set<number>();
  for (const lane of TRANSFER_LANES) {
    if (lane.planetId !== planetId) continue;
    for (const s of arcSectors(lane.blackHoleArc)) {
      sectors.add(s);
      sectors.add(wrapSector(s - 2));
    }
  }
  return sectors;
}

/** A placed ship `other-<i>` on Black Hole `ring`, sector `sector`. */
function placed(i: number, ring: number, sector: number): Player {
  const position = { wellId: BLACK_HOLE_ID, ring, sector };
  return makePlayer(`other-${i}`, position, undefined, { home: position });
}

/**
 * A deployment-phase game where `occupied` sectors of `ring` already hold
 * ships (`other-0`, `other-1`, ...), with `extra` players seated after them.
 */
function deploymentState(
  missions: Mission[],
  occupied: number[],
  { ring = HOME_RING, loadout = DEFAULT_LOADOUT, extra = [] as Player[] } = {}
): GameState {
  const bot = makePlayer("bot", { wellId: BLACK_HOLE_ID, ring: HOME_RING, sector: 0 }, loadout, {
    hasDeployed: false,
    home: null,
    missions,
  });
  const others = occupied.map((sector, i) => placed(i, ring, sector));
  return makeGameState([bot, ...others, ...extra], { phase: "deployment", turn: 0 });
}

/** No railgun in the bow. */
const SENSOR_BOW: ShipLoadout = { ...DEFAULT_LOADOUT, forwardSlots: ["sensor_array"] };

const PICKERS: Array<(n: number) => number> = [
  () => 0,
  (n) => n - 1,
  (n) => Math.floor(n / 2),
  (n) => Math.max(0, n - 2),
];

describe("botChooseDeployment", () => {
  it.each([ALPHA, BETA, GAMMA])(
    "lines up with a lane toward the pickup planet of a Deliver card (%s)",
    (planet) => {
      const state = deploymentState([deliverMission(planet, planet === ALPHA ? BETA : ALPHA)], []);
      const wanted = linedUpSectors(planet);
      for (const pick of PICKERS) {
        const choice = botChooseDeployment(viewFor(state, "bot"), pick);
        expect(choice.ring).toBe(HOME_RING);
        expect(wanted.has(choice.sector)).toBe(true);
      }
    }
  );

  it.each([
    ["a Destroy card on a target not placed yet", destroyMission("late")],
    ["an Intercept card on a target not placed yet", interceptMission("late")],
    ["a Piracy card", piracyMission()],
    ["an Escort card", escortMission()],
  ])("takes the fast inner ring with %s, away from the ships placed", (_label, mission) => {
    const late = makePlayer("late", undefined, undefined, { hasDeployed: false, home: null });
    const state = deploymentState([mission], [0, 1], { extra: [late] });
    for (const pick of PICKERS) {
      const choice = botChooseDeployment(viewFor(state, "bot"), pick);
      expect(choice.ring).toBe(FAST_RING);
      // Farthest from sectors 0 and 1 is the opposite side of the ring.
      expect([12, 13]).toContain(choice.sector);
    }
  });

  it("never picks an occupied sector", () => {
    const taken = [...linedUpSectors(BETA)];
    const state = deploymentState([deliverMission(BETA, GAMMA)], taken);
    for (const pick of PICKERS) {
      const choice = botChooseDeployment(viewFor(state, "bot"), pick);
      expect(choice.ring === HOME_RING && taken.includes(choice.sector)).toBe(false);
    }
  });

  it.each([
    ["no card", []],
    ["a Survey card", [surveyMission()]],
  ])("spreads out on the outer ring with %s, farthest from the placed ships", (_label, hand) => {
    const state = deploymentState(hand, [0, 1]);
    for (const pick of PICKERS) {
      const choice = botChooseDeployment(viewFor(state, "bot"), pick);
      expect(choice.ring).toBe(HOME_RING);
      // Farthest from sectors 0 and 1 is the opposite side of the ring (12 or 13).
      expect([12, 13]).toContain(choice.sector);
    }
  });

  it.each([
    [FAST_RING, 0],
    [FAST_RING, 10],
    [HOME_RING, 22],
    [HOME_RING, 1],
  ])(
    "an Intercept card sits scan range behind its placed target (ring %i, sector %i)",
    (ring, target) => {
      const state = deploymentState([interceptMission("other-0")], [target], { ring });
      for (const pick of PICKERS) {
        const choice = botChooseDeployment(viewFor(state, "bot"), pick);
        expect(choice.ring).toBe(ring);
        expect(sectorDistance(choice.sector, target)).toBe(3);
        // Behind: the target is ahead of the ship in the prograde drift.
        expect(forwardDistance(choice.sector, target)).toBe(3);
      }
    }
  );

  it.each([
    [FAST_RING, 0],
    [FAST_RING, 10],
    [HOME_RING, 22],
    [HOME_RING, 1],
  ])(
    "a Destroy card on a railgun hull puts its placed target 3 to 5 ahead (ring %i, sector %i)",
    (ring, target) => {
      const state = deploymentState([destroyMission("other-0")], [target], { ring });
      for (const pick of PICKERS) {
        const choice = botChooseDeployment(viewFor(state, "bot"), pick);
        expect(choice.ring).toBe(ring);
        expect(forwardDistance(choice.sector, target)).toBe(3);
        const railgun = viewFor(state, "bot").me!.ship.subsystems.find(
          (s) => s.type === "railgun"
        )!;
        const attacker = { ...choice, facing: "prograde" as const };
        expect(
          isInWeaponRange(railgun, attacker, { wellId: BLACK_HOLE_ID, ring, sector: target })
        ).toBe(true);
      }
    }
  );

  // Target on ring 3 sector 10; a second ship on ring 4 at `blocker` (an offset
  // from the target) closes sectors on both rings, since the gap is ring-blind.
  it.each([
    ["Intercept, nothing in the way", interceptMission("other-0"), DEFAULT_LOADOUT, null, -3],
    [
      "Destroy with a railgun, nothing in the way",
      destroyMission("other-0"),
      DEFAULT_LOADOUT,
      null,
      -3,
    ],
    ["Intercept, 3 behind closed", interceptMission("other-0"), DEFAULT_LOADOUT, -1, 3],
    ["Destroy with a railgun, 3 behind closed", destroyMission("other-0"), DEFAULT_LOADOUT, -1, -4],
    ["Destroy with no railgun, 3 behind closed", destroyMission("other-0"), SENSOR_BOW, -1, 3],
    [
      "Destroy with a railgun, the whole window closed",
      destroyMission("other-0"),
      DEFAULT_LOADOUT,
      -4,
      3,
    ],
  ] as const)("%s", (_label, mission, loadout, blocker, expected) => {
    const target = 10;
    const extra = blocker === null ? [] : [placed(1, HOME_RING, wrapSector(target + blocker))];
    const state = deploymentState([mission], [target], { ring: FAST_RING, loadout, extra });
    for (const pick of PICKERS) {
      const choice = botChooseDeployment(viewFor(state, "bot"), pick);
      expect(choice).toEqual({
        wellId: BLACK_HOLE_ID,
        ring: FAST_RING,
        sector: wrapSector(target + expected),
      });
    }
  });

  it.each([
    ["a Destroy card", destroyMission("other-2")],
    ["an Intercept card", interceptMission("other-2")],
  ])(
    "falls back to the fast ring with %s when the target's ring has no legal sector",
    (_l, mission) => {
      // The target sits on ring 5, where nobody may deploy.
      const extra = [placed(2, 5, 0)];
      const state = deploymentState([mission], [0, 1], { extra });
      for (const pick of PICKERS) {
        const choice = botChooseDeployment(viewFor(state, "bot"), pick);
        expect(choice.ring).toBe(FAST_RING);
        expect([12, 13]).toContain(choice.sector);
      }
    }
  );

  it("never names a position the rules refuse, whatever the hand or the crowd", () => {
    const hands: Array<[Mission[], ShipLoadout]> = [
      [[], DEFAULT_LOADOUT],
      [[deliverMission(ALPHA, BETA)], DEFAULT_LOADOUT],
      [[destroyMission("other-0")], DEFAULT_LOADOUT],
      [[destroyMission("other-0")], SENSOR_BOW],
      [[interceptMission("other-0")], DEFAULT_LOADOUT],
    ];
    for (let seed = 0; seed < 100; seed++) {
      const crowd = Array.from({ length: seed % 7 }, (_, i) => wrapSector(seed * 5 + i * 3));
      const occupied = [...new Set(crowd)];
      const [hand, loadout] = hands[seed % hands.length];
      const ring = seed % 3 === 0 ? FAST_RING : HOME_RING;
      const state = deploymentState(hand, occupied, { ring, loadout });
      const choice = botChooseDeployment(viewFor(state, "bot"), (n) => seed % n);
      const legal = legalDeploymentPositions(state);
      expect(legal).toContainEqual({
        wellId: choice.wellId,
        ring: choice.ring,
        sector: choice.sector,
      });
      expect(deployShip(state, "bot", choice.sector, choice.ring).success).toBe(true);
    }
  });
});
