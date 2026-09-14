/**
 * Game creation and the loadout phase. Shared by the server and the simulator
 * so both build games exactly the same way.
 */
import type { GameState, Player, ShipLoadout } from "../models/game.ts";
import { DEFAULT_LOADOUT, MAX_PLAYERS, MIN_PLAYERS } from "../models/game.ts";
import { HOME_RING, PLANETS } from "../models/gravityWells.ts";
import { Rng, createDeterminismFields } from "../utils/rng.ts";
import { createInitialShipState } from "./ship.ts";
import { createInitialStations } from "./stations.ts";
import { dealMissionOffers, selectMissionsFromOffers } from "./missions/missionDeck.ts";
import { validateLoadout } from "./loadout.ts";

export interface PlayerSpec {
  id: string;
  name: string;
}

/** A player before loadout: placeholder ship, no missions yet. */
export function createPlayer(spec: PlayerSpec): Player {
  return {
    id: spec.id,
    name: spec.name,
    ship: createInitialShipState(
      { wellId: PLANETS[0].id, ring: HOME_RING, sector: 0, facing: "prograde" },
      DEFAULT_LOADOUT
    ),
    missionOffers: [],
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: false,
    hasSubmittedLoadout: false,
    home: null,
    intel: {},
  };
}

/**
 * Create a game in the loadout phase with mission offers dealt.
 * @param seed omit for a fresh random seed (captured on the state)
 */
export function createGame(specs: PlayerSpec[], seed?: number): GameState {
  if (specs.length < MIN_PLAYERS || specs.length > MAX_PLAYERS) {
    throw new Error(`A game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players (got ${specs.length})`);
  }
  if (new Set(specs.map((s) => s.id)).size !== specs.length) {
    throw new Error("Player ids must be unique");
  }
  const determinism = createDeterminismFields(seed);
  const rng = new Rng(determinism.rngState);
  const players = specs.map(createPlayer);
  const offers = dealMissionOffers(players, rng);

  return {
    turn: 0,
    activePlayerIndex: 0,
    players: players.map((p) => ({ ...p, missionOffers: offers.get(p.id) ?? [] })),
    missiles: [],
    stations: createInitialStations(),
    phase: "loadout",
    rngSeed: determinism.rngSeed,
    rngState: rng.state,
    nextEntityId: determinism.nextEntityId,
  };
}

export interface LoadoutSubmission {
  loadout: ShipLoadout;
  missionIds: string[];
}

/** Record a player's loadout and mission picks. Moves to deployment when everyone has submitted. */
export function submitLoadout(
  state: GameState,
  playerId: string,
  submission: LoadoutSubmission
): { state: GameState; error?: string } {
  if (state.phase !== "loadout") return { state, error: "Game is not in the loadout phase" };
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index === -1) return { state, error: `Player ${playerId} not found` };
  const player = state.players[index];
  if (player.hasSubmittedLoadout)
    return { state, error: `${player.name} has already submitted a loadout` };

  const validation = validateLoadout(submission.loadout);
  if (!validation.valid) return { state, error: validation.errors.join("; ") };

  const picked = selectMissionsFromOffers(player.missionOffers, submission.missionIds);
  if (picked.error) return { state, error: picked.error };

  const players = [...state.players];
  players[index] = {
    ...player,
    ship: createInitialShipState(
      {
        wellId: player.ship.wellId,
        ring: player.ship.ring,
        sector: player.ship.sector,
        facing: "prograde",
      },
      submission.loadout
    ),
    missions: picked.missions,
    cargo: picked.cargo,
    hasSubmittedLoadout: true,
  };

  const next: GameState = { ...state, players };
  return {
    state: players.every((p) => p.hasSubmittedLoadout)
      ? { ...next, phase: "deployment", activePlayerIndex: 0 }
      : next,
  };
}
