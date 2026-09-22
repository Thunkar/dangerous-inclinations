/**
 * How a bot budgets a jump it takes with a fuel compressor aboard.
 *
 * The tile is passive: it asks for no cubes and the candidate that jumps
 * budgets the engines alone, so the only thing the compressor changes is what
 * the lane costs in fuel.
 */
import { describe, it, expect } from "vitest";
import type { GameState, ShipLoadout } from "../../models/game.ts";
import { COMPRESSED_JUMP_MASS, WELL_TRANSFER_COSTS } from "../../models/rings.ts";
import { PLANET_OUTER_RING } from "../../models/gravityWells.ts";
import { viewFor } from "../../game/view.ts";
import { executeTurn } from "../../game/turns.ts";
import { analyzeSituation } from "../../ai/index.ts";
import { generateCandidates } from "../../ai/planner.ts";
import { DEFAULT_BOT_PARAMETERS } from "../../ai/types.ts";
import type { ActionPlan } from "../../ai/types.ts";
import {
  ALPHA,
  BETA,
  BH,
  deliverMission,
  eventsOf,
  getShip,
  makeGameState,
  makePlayer,
  withMissions,
} from "../testUtils.ts";

/** A hauler on Alpha's outbound lane: the compressor is the forward tile. */
const HAULER: ShipLoadout = {
  forwardSlots: ["fuel_compressor"],
  sideSlots: ["shields", "shields", "radiator", "laser"],
};

/**
 * A hauler at the end of Alpha's departure arc with a crate to fetch there:
 * the route planner's first step from S19 is the lane itself, so the goal
 * candidate is a jump.
 */
function onAlphasLane() {
  const state = makeGameState([
    makePlayer("p1", { wellId: BH, ring: 5, sector: 19 }, HAULER),
    makePlayer("p2", { wellId: BH, ring: 1, sector: 0 }),
  ]);
  return withMissions(state, "p1", [deliverMission(ALPHA, BETA)]);
}

function jumpCandidate(state: GameState): ActionPlan {
  const situation = analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS);
  const candidate = generateCandidates(situation, DEFAULT_BOT_PARAMETERS).find((c) =>
    c.actions.some((a) => a.type === "well_transfer")
  );
  if (!candidate) throw new Error("no candidate jumps the lane");
  return candidate;
}

/**
 * Play the candidate and read back what the lane cost. Phasing is never
 * cheapened, so the fuel a jump spends is the lane's own cost (one with a
 * working compressor) plus a point per sector of phasing.
 */
function takeTheLane(state: GameState, candidate: ActionPlan) {
  const jump = candidate.actions.find((a) => a.type === "well_transfer");
  if (jump?.type !== "well_transfer") throw new Error("the candidate does not jump");
  const phasing = Math.abs(jump.data.sectorAdjustment ?? 0);
  const result = executeTurn(state, candidate.actions);
  expect(result.errors).toBeUndefined();
  const ship = getShip(result.gameState, "p1");
  expect(ship.wellId).toBe(ALPHA);
  expect(ship.ring).toBe(PLANET_OUTER_RING);
  return {
    jumped: eventsOf(result.events, "jumped")[0],
    laneFuel: getShip(state, "p1").reactionMass - ship.reactionMass - phasing,
  };
}

describe("a bot jumping with a fuel compressor", () => {
  it("leaves the tile cold and takes the lane for one fuel", () => {
    const state = onAlphasLane();
    const candidate = jumpCandidate(state);

    // Nothing to switch on for the lane itself: the jump powers the engines,
    // and the compressor is passive, so no cubes are ever routed to its slot.
    expect(
      candidate.actions.some(
        (a) => a.type === "set_standing_power" && a.data.subsystemId === "forward-0"
      )
    ).toBe(false);

    const { jumped, laneFuel } = takeTheLane(state, candidate);
    expect(jumped).toMatchObject({ compressed: true, heat: WELL_TRANSFER_COSTS.energy });
    expect(laneFuel).toBe(COMPRESSED_JUMP_MASS);
  });
});
