/**
 * Headless game simulation.
 *
 * Drives N bot players through a complete game with no server, no Redis, no
 * UI. Produces a {@link GameRecording} identical in shape to one captured
 * from a live game, so any sim run can be loaded into the replay viewer.
 *
 * Usage:
 *   const result = runSimulation({ seed: 1, botCount: 4 });
 *   console.log(result.recording.metadata);
 */

import type { GameState, Player, PlayerAction } from "../models/game.ts";
import type {
  GameRecording,
  RecordedTurn,
  RecordingMetadata,
} from "../recording/types.ts";
import { RECORDING_SCHEMA_VERSION } from "../recording/types.ts";
import { executeTurn } from "../game/turns.ts";
import { botDecideActions, selectBotMissions } from "../ai/index.ts";
import { selectBotLoadout } from "../ai/behaviors/loadout.ts";
import { dealMissionOffers, selectMissionsFromOffers } from "../game/missions/missionDeck.ts";
import { createInitialShipState } from "../utils/subsystemHelpers.ts";
import {
  createSubsystemsFromLoadout,
  calculateShipStatsFromLoadout,
} from "../game/loadout.ts";
import { createInitialStations } from "../game/stations.ts";
import { GRAVITY_WELLS } from "../models/gravityWells.ts";
import { createDeterminismFields, Rng, freshSeed, pickIndex } from "../utils/rng.ts";
import {
  getAvailableDeploymentSectors,
  deployShip,
  transitionToActivePhase,
} from "../game/deployment.ts";

/**
 * Thrown by {@link runSimulation} when a bot produces an action plan that
 * fails engine validation. Strict mode: no coast fallback, the run halts
 * and the caller decides what to do. The error carries enough context to
 * diagnose the bot bug.
 */
export class BotInvalidActionError extends Error {
  constructor(
    public readonly turnNumber: number,
    public readonly playerId: string,
    public readonly actions: PlayerAction[],
    public readonly errors: string[]
  ) {
    super(
      `Bot ${playerId} produced an invalid turn at T${turnNumber}: ${errors.join("; ")}`
    );
    this.name = "BotInvalidActionError";
  }
}

/**
 * Configuration for a single sim run.
 */
export interface SimConfig {
  /** PRNG seed; if omitted, a fresh seed is generated and captured. */
  seed?: number;
  /** Number of bot players (2..6). Default 2. */
  botCount?: number;
  /** Hard cap on turns to prevent runaway games. Default 200. */
  maxTurns?: number;
  /** Optional label included in recording metadata. */
  label?: string;
}

/**
 * Result of a sim run.
 */
export interface SimResult {
  recording: GameRecording;
  /** Final state after the game ended (or the last state if maxTurns hit). */
  finalState: GameState;
  /** Why the loop terminated. */
  endReason: RecordingMetadata["endReason"];
}

const DEFAULT_BOT_COUNT = 2;
const DEFAULT_MAX_TURNS = 200;

/**
 * Run a single bot-vs-bot simulation end-to-end.
 *
 * The loop drives loadout → deployment → active phases, captures every turn's
 * actions and resulting state, and returns a complete GameRecording.
 */
export function runSimulation(config: SimConfig = {}): SimResult {
  const seed = config.seed ?? freshSeed();
  const botCount = config.botCount ?? DEFAULT_BOT_COUNT;
  const maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;

  if (botCount < 2 || botCount > 6) {
    throw new Error(`botCount must be 2..6 (got ${botCount})`);
  }

  // Build initial state through loadout + deployment.
  const initialState = setupGame(seed, botCount);

  // Take the snapshot AFTER loadout/deployment so replay starts from "active".
  const recordingId = `sim-${seed.toString(16)}-${Date.now()}`;
  const turns: RecordedTurn[] = [];

  let state = initialState;
  let endReason: RecordingMetadata["endReason"] = "max_turns";

  for (let i = 0; i < maxTurns; i++) {
    if (state.phase === "ended") {
      endReason = "victory";
      break;
    }

    const turnNumber = state.turn;
    const activePlayer = state.players[state.activePlayerIndex];
    const actions = decideActionsForTurn(state, activePlayer);

    // Strict execution: a bot bug = a thrown error. No coast fallback.
    // Use strictBatch.runStrictGame if you want to capture failures
    // structurally instead of crashing.
    const result = executeTurn(state, actions);
    if (result.errors && result.errors.length > 0) {
      throw new BotInvalidActionError(turnNumber, activePlayer.id, actions, result.errors);
    }

    state = result.gameState;
    turns.push({
      turnNumber,
      playerId: activePlayer.id,
      actions,
      resultingStateSnapshot: cloneState(state),
      logEntries: result.logEntries,
    });
  }

  const metadata: RecordingMetadata = {
    source: "sim",
    playerKinds: initialState.players.map((p) => ({
      playerId: p.id,
      kind: "bot",
    })),
    label: config.label,
    turnCount: turns.length,
    winnerId: state.winnerId,
    endReason,
  };

  const recording: GameRecording = {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    recordingId,
    createdAt: new Date().toISOString(),
    seed,
    initialState,
    turns,
    finalState: state,
    metadata,
  };

  return { recording, finalState: state, endReason };
}

/**
 * Build players, deal missions, auto-pick, apply bot loadouts, deploy.
 * Returns a GameState in the "active" phase, ready for turn execution.
 */
function setupGame(seed: number, botCount: number): GameState {
  const planets = GRAVITY_WELLS.filter((w) => w.type === "planet");

  const players: Player[] = Array.from({ length: botCount }, (_, i) => ({
    id: `bot-${i + 1}`,
    name: `Bot ${i + 1}`,
    ship: createInitialShipState({
      wellId: "blackhole",
      ring: 4,
      sector: 0, // overwritten during deployment
      facing: "prograde",
    }),
    missionOffers: [],
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: false,
    hasSubmittedLoadout: false,
  }));

  const determinism = createDeterminismFields(seed);
  const rng = new Rng(determinism.rngState);
  const { playerOffers } = dealMissionOffers(players, planets, rng);

  const stations = createInitialStations(GRAVITY_WELLS);
  // Smart 3-of-5 pick + matching loadout.
  const playersAfterLoadout = players.map((p) => {
    const offers = playerOffers.get(p.id) ?? [];
    const chosen = selectBotMissions(offers, p.ship, players, stations);
    const selection = selectMissionsFromOffers(
      offers,
      chosen.map((m) => m.id),
    );
    const missions = selection.missions;
    const cargo = selection.cargo;

    const loadout = selectBotLoadout(missions);
    const stats = calculateShipStatsFromLoadout(loadout);

    return {
      ...p,
      missionOffers: offers,
      missions,
      cargo,
      hasSubmittedLoadout: true,
      ship: {
        ...p.ship,
        loadout,
        subsystems: createSubsystemsFromLoadout(loadout),
        dissipationCapacity: stats.dissipationCapacity,
        reactionMass: stats.reactionMass,
        criticalChance: stats.criticalChance,
      },
    };
  });

  let state: GameState = {
    turn: 0,
    activePlayerIndex: 0,
    players: playersAfterLoadout,
    turnLog: [],
    missiles: [],
    phase: "deployment",
    stations,
    rngSeed: determinism.rngSeed,
    rngState: rng.state,
    nextEntityId: determinism.nextEntityId,
  };

  // Deploy each bot to a deterministic random open sector on BH Ring 4.
  for (const bot of state.players) {
    const available = getAvailableDeploymentSectors(state);
    if (available.length === 0) break;
    const sector = available[pickIndex(state, available)];
    const result = deployShip(state, bot.id, sector);
    if (!result.success) {
      throw new Error(`Bot ${bot.id} deployment failed: ${result.error}`);
    }
    state = result.gameState;
  }

  return transitionToActivePhase(state);
}

/**
 * Pick actions for the active player. Dead bots coast (engine respawns them);
 * live bots run the AI.
 */
function decideActionsForTurn(state: GameState, player: Player): PlayerAction[] {
  if (player.ship.hitPoints <= 0) {
    return [
      {
        type: "coast",
        playerId: player.id,
        sequence: 1,
        data: { activateScoop: false },
      },
    ];
  }
  return botDecideActions(state, player.id).actions;
}

/**
 * Deep-clone a GameState through JSON. The state is fully JSON-serializable
 * by design, so this is safe and produces a snapshot independent from
 * subsequent mutations.
 */
function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
