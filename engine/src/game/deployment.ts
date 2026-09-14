/**
 * Deployment. Everyone starts together: in turn order each player places
 * their ship, facing prograde, on Black Hole Ring 4 in any empty sector.
 * That sector becomes their Home marker (where a destroyed ship returns).
 */
import type { GameState, Player, Position } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import { HOME_RING, HOME_WELL_ID } from "../models/gravityWells.ts";
import { SECTORS_PER_RING } from "../models/rings.ts";
import { samePosition } from "./geometry.ts";
import { createInitialShipState } from "./ship.ts";
import { hullOverride } from "./setup.ts";

export function deploymentPositions(): Position[] {
  return Array.from({ length: SECTORS_PER_RING }, (_, sector) => ({
    wellId: HOME_WELL_ID,
    ring: HOME_RING,
    sector,
  }));
}

export function isDeploymentPositionFree(state: GameState, position: Position): boolean {
  return !state.players.some((p) => p.hasDeployed && samePosition(p.ship, position));
}

/** Free sectors on the deployment ring. */
export function getAvailableDeploymentSectors(state: GameState): number[] {
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

export function deployShip(state: GameState, playerId: string, sector: number): DeploymentResult {
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

  const position: Position = { wellId: HOME_WELL_ID, ring: HOME_RING, sector };
  if (!isDeploymentPositionFree(state, position)) return fail(`Sector ${sector} is occupied`);

  const deployed: Player = {
    ...player,
    ship: createInitialShipState(
      { ...position, facing: "prograde" },
      player.ship.loadout,
      hullOverride(state)
    ),
    hasDeployed: true,
    home: position,
  };
  const players = [...state.players];
  players[playerIndex] = deployed;

  // Next player who still has to deploy.
  let nextIndex = state.activePlayerIndex;
  for (let i = 1; i <= players.length; i++) {
    const idx = (state.activePlayerIndex + i) % players.length;
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
  return { ...state, phase: "active", activePlayerIndex: 0, turn: 1 };
}
