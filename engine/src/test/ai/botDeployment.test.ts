/**
 * Deployment phase. `botChooseDeployment` names a planet and a free sector
 * on its outer ring; the sector becomes the bot's Home. All randomness goes
 * through the `pick` callback the caller wires to the game's seeded RNG.
 */
import { describe, it, expect } from "vitest";
import type { GameState } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import { HOME_RING, PLANETS, TRANSFER_LANES, arcSectors } from "../../models/gravityWells.ts";
import { deployShip } from "../../game/deployment.ts";
import { viewFor } from "../../game/view.ts";
import { botChooseDeployment } from "../../ai/index.ts";
import {
  ALPHA,
  BETA,
  GAMMA,
  deliverMission,
  destroyMission,
  interceptMission,
  makeGameState,
  makePlayer,
} from "../testUtils.ts";

function laneSectorsOf(wellId: string): Set<number> {
  const sectors = new Set<number>();
  for (const lane of TRANSFER_LANES) {
    if (lane.planetId === wellId) for (const s of arcSectors(lane.planetArc)) sectors.add(s);
  }
  return sectors;
}

/** A deployment-phase game where `occupied` sectors already hold ships. */
function deploymentState(
  missions: Mission[],
  occupied: Array<{ wellId: string; sector: number }>
): GameState {
  const bot = makePlayer("bot", { wellId: ALPHA, ring: HOME_RING, sector: 0 }, undefined, {
    hasDeployed: false,
    home: null,
    missions,
  });
  const others = occupied.map((o, i) =>
    makePlayer(`other-${i}`, { wellId: o.wellId, ring: HOME_RING, sector: o.sector })
  );
  return makeGameState([bot, ...others], { phase: "deployment", turn: 0 });
}

/** A deployment-phase game where `rival` has already taken a seat. */
function withRivalAt(missions: Mission[], wellId: string, rivalId = "rival"): GameState {
  const bot = makePlayer("bot", { wellId: ALPHA, ring: HOME_RING, sector: 0 }, undefined, {
    hasDeployed: false,
    home: null,
    missions,
  });
  const rival = makePlayer(rivalId, { wellId, ring: HOME_RING, sector: 4 }, undefined, {
    home: { wellId, ring: HOME_RING, sector: 4 },
  });
  return makeGameState([bot, rival], { phase: "deployment", turn: 0 });
}

const PICKERS: Array<(n: number) => number> = [
  () => 0,
  (n) => n - 1,
  (n) => Math.floor(n / 2),
  (n) => Math.max(0, n - 2),
];

describe("botChooseDeployment", () => {
  it("prefers the pickup planet of a Deliver card", () => {
    const state = deploymentState([deliverMission(GAMMA, ALPHA)], []);
    for (const pick of PICKERS) {
      expect(botChooseDeployment(viewFor(state, "bot"), pick).wellId).toBe(GAMMA);
    }
  });

  it("never picks an occupied sector", () => {
    // Fill every lane sector of the preferred planet: the bot must fall back
    // to a free one instead of stacking on a rival's Home.
    const taken = [...laneSectorsOf(BETA)];
    const state = deploymentState(
      [deliverMission(BETA, ALPHA)],
      taken.map((sector) => ({ wellId: BETA, sector }))
    );

    for (const pick of PICKERS) {
      const choice = botChooseDeployment(viewFor(state, "bot"), pick);
      expect(choice.wellId).toBe(BETA);
      expect(taken).not.toContain(choice.sector);
      const result = deployShip(state, "bot", choice.wellId, choice.sector);
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
    }
  });

  it("stands on a transfer lane when one is free, so a jump is possible at once", () => {
    const state = deploymentState([], []);
    for (const pick of PICKERS) {
      const choice = botChooseDeployment(viewFor(state, "bot"), pick);
      expect(laneSectorsOf(choice.wellId).has(choice.sector)).toBe(true);
    }
  });

  it("spreads out: picks a planet no one has taken yet", () => {
    const state = deploymentState(
      [],
      [
        { wellId: ALPHA, sector: 4 },
        { wellId: BETA, sector: 4 },
      ]
    );
    const choice = botChooseDeployment(viewFor(state, "bot"), () => 0);
    expect(choice.wellId).toBe(GAMMA);
  });

  it("always names a planet's outer ring sector the engine will accept", () => {
    const planetIds = PLANETS.map((p) => p.id);
    const state = deploymentState([], []);
    for (const pick of PICKERS) {
      const choice = botChooseDeployment(viewFor(state, "bot"), pick);
      expect(planetIds).toContain(choice.wellId);
      expect(choice.sector).toBeGreaterThanOrEqual(0);
      expect(choice.sector).toBeLessThan(24);
      const result = deployShip(state, "bot", choice.wellId, choice.sector);
      expect(result.success).toBe(true);
      expect(result.state.players[0].home).toEqual({
        wellId: choice.wellId,
        ring: HOME_RING,
        sector: choice.sector,
      });
    }
  });

  it("starts on the planet where a Destroy target already sits", () => {
    // A hunt that begins 120 degrees away is a hunt that never happens.
    const state = withRivalAt([destroyMission("rival")], GAMMA);
    for (const pick of PICKERS) {
      expect(botChooseDeployment(viewFor(state, "bot"), pick).wellId).toBe(GAMMA);
    }
  });

  it("starts on the planet where an Intercept target already sits", () => {
    const state = withRivalAt([interceptMission("rival")], BETA);
    for (const pick of PICKERS) {
      expect(botChooseDeployment(viewFor(state, "bot"), pick).wellId).toBe(BETA);
    }
  });

  it("hauls first and hunts second when it holds both cards", () => {
    const state = withRivalAt([destroyMission("rival"), deliverMission(ALPHA, BETA)], GAMMA);
    for (const pick of PICKERS) {
      expect(botChooseDeployment(viewFor(state, "bot"), pick).wellId).toBe(ALPHA);
    }
  });

  it("ignores a hunt target that has not deployed yet and spreads out instead", () => {
    const undeployed = makePlayer("rival", { wellId: GAMMA, ring: HOME_RING, sector: 4 }, undefined, {
      hasDeployed: false,
      home: null,
    });
    const bot = makePlayer("bot", { wellId: ALPHA, ring: HOME_RING, sector: 0 }, undefined, {
      hasDeployed: false,
      home: null,
      missions: [destroyMission("rival")],
    });
    const state = makeGameState([bot, undeployed], { phase: "deployment", turn: 0 });
    // Nobody is on the board, so every planet ties and `pick` decides.
    const planetIds = PLANETS.map((p) => p.id);
    expect(planetIds).toContain(botChooseDeployment(viewFor(state, "bot"), () => 0).wellId);
    expect(botChooseDeployment(viewFor(state, "bot"), (n) => n - 1).wellId).toBe(
      planetIds[planetIds.length - 1]
    );
  });

  it("never stacks on the hunt target's own sector", () => {
    const state = withRivalAt([destroyMission("rival")], GAMMA);
    for (const pick of PICKERS) {
      const choice = botChooseDeployment(viewFor(state, "bot"), pick);
      expect(choice.wellId).toBe(GAMMA);
      expect(choice.sector).not.toBe(4);
      expect(deployShip(state, "bot", choice.wellId, choice.sector).success).toBe(true);
    }
  });
});
