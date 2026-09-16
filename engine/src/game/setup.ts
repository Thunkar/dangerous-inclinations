import { ShipAppearanceSchema, type ShipAppearance } from "../models/appearance.ts";
/**
 * Game creation and the loadout phase. Shared by the server and the simulator
 * so both build games exactly the same way.
 */
import type { GameState, Player, ShipLoadout } from "../models/game.ts";
import { DEFAULT_LOADOUT, MAX_PLAYERS, MIN_PLAYERS } from "../models/game.ts";
import { HOME_RING, HOME_WELL_ID } from "../models/gravityWells.ts";
import { Rng, createDeterminismFields } from "../utils/rng.ts";
import type { RuleSet } from "../models/rules.ts";
import { resolveRules } from "../models/rules.ts";
import { createInitialShipState } from "./ship.ts";
import { createInitialStations } from "./stations.ts";
import { dealMissionOffers, selectMissionsFromOffers } from "./missions/missionDeck.ts";
import { missionsMissingRequirements, validateLoadout } from "./loadout.ts";
import { describeMission, describeMissionRequirement } from "./describe.ts";

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
      { wellId: HOME_WELL_ID, ring: HOME_RING, sector: 0, facing: "prograde" },
      DEFAULT_LOADOUT
    ),
    missionOffers: [],
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: false,
    hasSubmittedLoadout: false,
    home: null,
    skipTurns: 0,
    intel: {},
  };
}

/**
 * Create a game in the loadout phase with mission offers dealt.
 * @param seed omit for a fresh random seed (captured on the state)
 */
export function createGame(
  specs: PlayerSpec[],
  seed?: number,
  rules?: Partial<RuleSet>
): GameState {
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
    ...(rules ? { rules } : {}),
    rngSeed: determinism.rngSeed,
    rngState: rng.state,
    nextEntityId: determinism.nextEntityId,
  };
}

export interface LoadoutSubmission {
  appearance?: ShipAppearance;
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

  const appearance =
    submission.appearance === undefined
      ? undefined
      : ShipAppearanceSchema.safeParse(submission.appearance);
  if (appearance && !appearance.success) return { state, error: "Invalid ship appearance" };

  const validation = validateLoadout(submission.loadout);
  if (!validation.valid) return { state, error: validation.errors.join("; ") };

  const picked = selectMissionsFromOffers(player.missionOffers, submission.missionIds);
  if (picked.error) return { state, error: picked.error };

  // A card you can never complete is not a card: Intercept and Survey need the
  // sensor array, Destroy needs a gun, and a mat is fixed for the game.
  const gaps = missionsMissingRequirements(picked.missions, submission.loadout);
  if (gaps.length > 0) {
    const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
    return {
      state,
      error: gaps
        .map(
          ({ mission, missing }) =>
            `${describeMission(mission, nameOf)} cannot be completed without ${missing
              .map(describeMissionRequirement)
              .join(" and ")}`
        )
        .join("; "),
    };
  }

  const players = [...state.players];
  players[index] = {
    ...player,
    ...(appearance?.success ? { appearance: appearance.data } : {}),
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
      ? // The last seat places first and the first seat last: whoever acts first
        // each round gets the last pick of a Home sector.
        { ...next, phase: "deployment", activePlayerIndex: players.length - 1 }
      : next,
  };
}

/** The rules in force for a game (defaults plus the state's overrides). */
export function rulesOf(state: GameState): RuleSet {
  return resolveRules(state.rules);
}
