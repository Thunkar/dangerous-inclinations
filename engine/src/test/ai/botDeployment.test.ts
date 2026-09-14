/**
 * Deployment phase. `botChooseDeployment` names a free sector on Black Hole
 * Ring 4 (everyone starts there); the sector becomes the bot's Home. All
 * randomness goes through the `pick` callback the caller wires to the game's
 * seeded RNG.
 */
import { describe, it, expect } from "vitest";
import type { GameState } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import { HOME_RING, HOME_WELL_ID, TRANSFER_LANES, arcSectors } from "../../models/gravityWells.ts";
import { wrapSector } from "../../game/geometry.ts";
import { deployShip } from "../../game/deployment.ts";
import { viewFor } from "../../game/view.ts";
import { botChooseDeployment } from "../../ai/index.ts";
import { ALPHA, BETA, GAMMA, deliverMission, makeGameState, makePlayer } from "../testUtils.ts";

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

/** A deployment-phase game where `occupied` ring-4 sectors already hold ships. */
function deploymentState(missions: Mission[], occupied: number[]): GameState {
  const bot = makePlayer("bot", { wellId: HOME_WELL_ID, ring: HOME_RING, sector: 0 }, undefined, {
    hasDeployed: false,
    home: null,
    missions,
  });
  const others = occupied.map((sector, i) =>
    makePlayer(`other-${i}`, { wellId: HOME_WELL_ID, ring: HOME_RING, sector }, undefined, {
      home: { wellId: HOME_WELL_ID, ring: HOME_RING, sector },
    })
  );
  return makeGameState([bot, ...others], { phase: "deployment", turn: 0 });
}

const PICKERS: Array<(n: number) => number> = [
  () => 0,
  (n) => n - 1,
  (n) => Math.floor(n / 2),
  (n) => Math.max(0, n - 2),
];

describe("botChooseDeployment", () => {
  it("always names the home ring of the black hole", () => {
    const state = deploymentState([], []);
    for (const pick of PICKERS) {
      const choice = botChooseDeployment(viewFor(state, "bot"), pick);
      expect(choice.wellId).toBe(HOME_WELL_ID);
      expect(choice.sector).toBeGreaterThanOrEqual(0);
      expect(choice.sector).toBeLessThan(24);
    }
  });

  it.each([ALPHA, BETA, GAMMA])(
    "lines up with a lane toward the pickup planet of a Deliver card (%s)",
    (planet) => {
      const state = deploymentState([deliverMission(planet, planet === ALPHA ? BETA : ALPHA)], []);
      const wanted = linedUpSectors(planet);
      for (const pick of PICKERS) {
        expect(wanted.has(botChooseDeployment(viewFor(state, "bot"), pick).sector)).toBe(true);
      }
    }
  );

  it("never picks an occupied sector", () => {
    const taken = [...linedUpSectors(BETA)];
    const state = deploymentState([deliverMission(BETA, GAMMA)], taken);
    for (const pick of PICKERS) {
      const choice = botChooseDeployment(viewFor(state, "bot"), pick);
      expect(taken).not.toContain(choice.sector);
    }
  });

  it("spreads out: without a Deliver card it takes the sector farthest from the placed ships", () => {
    const state = deploymentState([], [0, 1]);
    for (const pick of PICKERS) {
      const choice = botChooseDeployment(viewFor(state, "bot"), pick);
      // Farthest from sectors 0 and 1 is the opposite side of the ring (12 or 13).
      expect([12, 13]).toContain(choice.sector);
    }
  });

  it("is deterministic for a given pick function and its choice is accepted by the engine", () => {
    const state = deploymentState([deliverMission(GAMMA, ALPHA)], [3, 4]);
    const a = botChooseDeployment(viewFor(state, "bot"), () => 0);
    const b = botChooseDeployment(viewFor(state, "bot"), () => 0);
    expect(a).toEqual(b);
    const result = deployShip(state, "bot", a.sector);
    expect(result.success).toBe(true);
    expect(result.state.players[0].home).toEqual({
      wellId: HOME_WELL_ID,
      ring: HOME_RING,
      sector: a.sector,
    });
  });
});
