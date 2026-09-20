/**
 * Deployment. Everyone starts together: in reverse turn order (the last seat
 * first, the first seat last) each player places their ship, facing prograde,
 * on Black Hole Ring 3 or Ring 4, at least three sectors from every ship
 * already placed — and if the ring is too crowded for that, on the clearest
 * sector left. That position becomes their Home marker (where a destroyed ship
 * returns). Ring 3 drifts four sectors a turn against ring 4's two, which is
 * the point of offering it. The seat that acts first every round picks last.
 */
import type { GameState, Player, Position } from "../models/game.ts";
import { FIRST_TURN } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import { HOME_RING, HOME_RINGS, HOME_WELL_ID } from "../models/gravityWells.ts";
import { SECTORS_PER_RING } from "../models/rings.ts";
import { samePosition, sectorDistance } from "./geometry.ts";
import { createInitialShipState } from "./ship.ts";

/** Sectors that must separate a new ship from every ship already placed. */
export const DEPLOYMENT_GAP = 3;

export function deploymentPositions(): Position[] {
  return HOME_RINGS.flatMap((ring) =>
    Array.from({ length: SECTORS_PER_RING }, (_, sector) => ({
      wellId: HOME_WELL_ID,
      ring,
      sector,
    }))
  );
}

export function isDeploymentPositionFree(state: GameState, position: Position): boolean {
  return !state.players.some((p) => p.hasDeployed && samePosition(p.ship, position));
}

/** Where the ships already placed sit. */
function placedShips(state: GameState): Position[] {
  return state.players.filter((p) => p.hasDeployed).map((p) => p.ship);
}

/**
 * The rule itself, read against the ships already on the board: the free
 * deployment positions three sectors clear of every one of them, or — if no
 * position is that clear — the free positions as clear as the board allows.
 * The ring is ignored in the distance: ring 3 and ring 4 in the same sector
 * are neighbours.
 */
export function legalDeploymentsAgainst(placed: readonly Position[]): Position[] {
  const free = deploymentPositions().filter((p) => !placed.some((q) => samePosition(p, q)));
  if (placed.length === 0 || free.length === 0) return free;
  const clearance = (p: Position) =>
    Math.min(...placed.map((q) => sectorDistance(p.sector, q.sector)));
  const clear = free.filter((p) => clearance(p) >= DEPLOYMENT_GAP);
  if (clear.length > 0) return clear;
  const best = Math.max(...free.map(clearance));
  return free.filter((p) => clearance(p) === best);
}

/** Where this player may place their ship right now. Never empty in a real game. */
export function legalDeploymentPositions(state: GameState): Position[] {
  return legalDeploymentsAgainst(placedShips(state));
}

export function isDeploymentPositionLegal(state: GameState, position: Position): boolean {
  return legalDeploymentPositions(state).some((p) => samePosition(p, position));
}

/** Legal sectors on the outer deployment ring, or its free ones if none is legal. */
export function getAvailableDeploymentSectors(state: GameState): number[] {
  const legal = legalDeploymentPositions(state).filter((p) => p.ring === HOME_RING);
  if (legal.length > 0) return legal.map((p) => p.sector);
  return Array.from({ length: SECTORS_PER_RING }, (_, s) => s).filter((sector) =>
    isDeploymentPositionFree(state, { wellId: HOME_WELL_ID, ring: HOME_RING, sector })
  );
}

export interface DeploymentResult {
  success: boolean;
  error?: string;
  state: GameState;
  events: EventDraft[];
}

export function deployShip(
  state: GameState,
  playerId: string,
  sector: number,
  ring: number = HOME_RING
): DeploymentResult {
  const fail = (error: string): DeploymentResult => ({ success: false, error, state, events: [] });

  if (state.phase !== "deployment")
    return fail("Cannot deploy: game is not in the deployment phase");
  const playerIndex = state.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) return fail(`Player ${playerId} not found`);
  const player = state.players[playerIndex];
  if (player.hasDeployed) return fail(`${player.name} has already deployed`);
  if (state.players[state.activePlayerIndex].id !== playerId)
    return fail(`Not ${player.name}'s turn to deploy`);
  if (!Number.isInteger(sector) || sector < 0 || sector >= SECTORS_PER_RING) {
    return fail(`Sector ${sector} is out of range`);
  }
  if (!(HOME_RINGS as readonly number[]).includes(ring)) {
    return fail(`Ring ${ring} is not on Black Hole ring ${HOME_RINGS.join(" or ")}`);
  }

  const position: Position = { wellId: HOME_WELL_ID, ring, sector };
  if (!isDeploymentPositionFree(state, position)) return fail(`Sector ${sector} is occupied`);
  if (!isDeploymentPositionLegal(state, position)) {
    return fail(
      `Ring ${ring} sector ${sector} is within ${DEPLOYMENT_GAP} sectors of a placed ship`
    );
  }

  const deployed: Player = {
    ...player,
    ship: createInitialShipState({ ...position, facing: "prograde" }, player.ship.loadout),
    hasDeployed: true,
    home: position,
  };
  const players = [...state.players];
  players[playerIndex] = deployed;

  // Next player who still has to deploy, walking backwards through the seats:
  // deployment runs in reverse turn order (the last seat places first).
  let nextIndex = state.activePlayerIndex;
  for (let i = 1; i <= players.length; i++) {
    const idx = (state.activePlayerIndex - i + players.length) % players.length;
    if (!players[idx].hasDeployed) {
      nextIndex = idx;
      break;
    }
  }

  return {
    success: true,
    state: { ...state, players, activePlayerIndex: nextIndex },
    events: [{ type: "deployed", playerId, position }],
  };
}

export function checkAllDeployed(state: GameState): boolean {
  return state.players.every((p) => p.hasDeployed);
}

/** All ships placed: start the game with the first player. */
export function transitionToActivePhase(state: GameState): GameState {
  if (!checkAllDeployed(state)) return state;
  return { ...state, phase: "active", activePlayerIndex: 0, turn: FIRST_TURN };
}
