/**
 * Headless bot-vs-bot game. One entry point for every simulator use:
 * strict by construction (a bot producing an invalid turn stops the game and
 * is reported as a failure), optionally recording every turn.
 *
 * Setup uses exactly the engine functions the server uses (createGame,
 * submitLoadout, deployShip), and bots decide from `viewFor`, so sim results
 * describe the same game humans play. Rule overrides (models/rules.ts) let
 * experiments measure a change before it is adopted.
 */
import type { GameState, PlayerAction } from "../models/game.ts";
import type { GameEvent } from "../models/events.ts";
import type { RuleSet } from "../models/rules.ts";
import type { GameRecording, RecordedTurn, RecordingMetadata } from "../recording/types.ts";
import { RECORDING_SCHEMA_VERSION } from "../recording/types.ts";
import { cloneState } from "../recording/replay.ts";
import { applyWeaponOverrides, type WeaponOverrides } from "./weaponOverrides.ts";
import { createGame, submitLoadout } from "../game/setup.ts";
import { deployShip, transitionToActivePhase } from "../game/deployment.ts";
import { executeTurn } from "../game/turns.ts";
import { viewFor } from "../game/view.ts";
import { getDissipationCapacity, isDestroyed } from "../game/ship.ts";
import { pickIndex, freshSeed } from "../utils/rng.ts";
import { botChooseDeployment, botChooseLoadout, botDecideActions } from "../ai/index.ts";

export interface GameConfig {
  seed?: number;
  /** MIN_PLAYERS..MAX_PLAYERS */
  botCount?: number;
  /** Cap on player-turns. */
  maxTurns?: number;
  /** Keep a full recording (snapshots per turn). Default true. */
  record?: boolean;
  label?: string;
  /** Rule overrides for this game (experiments). */
  rules?: Partial<RuleSet>;
  /** At the turn cap, declare the player with most completed missions (then most hull) the winner. */
  tiebreak?: boolean;
  /** Experiment-only weapon stat overrides (see sim/weaponOverrides.ts). */
  weapons?: WeaponOverrides;
}

/** What the active player did on one turn, for balance stats. */
export interface TurnStat {
  turn: number;
  playerId: string;
  coasted: boolean;
  burned: boolean;
  jumped: boolean;
  scooped: boolean;
  shotsFired: number;
  /** Cubes on shields at the end of the turn (after any refunds). */
  shieldCubes: number;
  /** Spent shield cubes waiting for a dock (rule knob). */
  spentCubes: number;
  /** Cubes allocated to any subsystem at the end of the turn. */
  energyInUse: number;
  heatAtCheck: number;
  dissipation: number;
  heatDamage: number;
  /** The turn was a respawn or recovery turn, or the ship is destroyed. */
  lost: boolean;
}

export interface InvalidTurn {
  turnNumber: number;
  playerId: string;
  actions: PlayerAction[];
  errors: string[];
  stateBefore: GameState;
}

export interface GameRunResult {
  seed: number;
  finalState: GameState;
  turnsPlayed: number;
  endReason: RecordingMetadata["endReason"];
  /** Events of every turn, in order (also inside the recording when recorded). */
  turns: Array<{
    turnNumber: number;
    playerId: string;
    actions: PlayerAction[];
    events: GameEvent[];
  }>;
  /** One entry per player-turn. */
  turnStats: TurnStat[];
  recording?: GameRecording;
  failure?: InvalidTurn;
}

const DEFAULT_BOT_COUNT = 2;
const DEFAULT_MAX_TURNS = 200;

export function botIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `bot-${i + 1}`);
}

/**
 * Create a game with `botCount` bots, run loadout and deployment through the
 * AI, and return the state in the active phase.
 */
export function setupBotGame(seed: number, botCount: number, rules?: Partial<RuleSet>): GameState {
  let state = createGame(
    botIds(botCount).map((id, i) => ({ id, name: `Bot ${i + 1}` })),
    seed,
    rules
  );

  for (const player of state.players) {
    const choice = botChooseLoadout(player.missionOffers, { playerCount: botCount, rules });
    const result = submitLoadout(state, player.id, {
      loadout: choice.loadout,
      missionIds: choice.missionIds,
    });
    if (result.error) throw new Error(`Bot ${player.id} loadout rejected: ${result.error}`);
    state = result.state;
  }

  while (state.phase === "deployment") {
    const active = state.players[state.activePlayerIndex];
    const view = viewFor(state, active.id);
    const pick = (n: number) => pickIndex(state, Array.from({ length: n }));
    const choice = botChooseDeployment(view, pick);
    const result = deployShip(state, active.id, choice.sector);
    if (!result.success) throw new Error(`Bot ${active.id} deployment rejected: ${result.error}`);
    state = transitionToActivePhase(result.state);
  }

  return state;
}

export function runGame(config: GameConfig = {}): GameRunResult {
  const seed = config.seed ?? freshSeed();
  const botCount = config.botCount ?? DEFAULT_BOT_COUNT;
  const maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
  applyWeaponOverrides(config.weapons);
  const record = config.record ?? true;

  const initialState = setupBotGame(seed, botCount, config.rules);
  let state = initialState;
  const turns: GameRunResult["turns"] = [];
  const turnStats: TurnStat[] = [];
  const recorded: RecordedTurn[] = [];
  let endReason: RecordingMetadata["endReason"] = "max_turns";
  let failure: InvalidTurn | undefined;

  for (let i = 0; i < maxTurns; i++) {
    if (state.phase === "ended") {
      endReason = "victory";
      break;
    }
    const active = state.players[state.activePlayerIndex];
    const turnNumber = state.turn;
    const actions = botDecideActions(viewFor(state, active.id)).actions;
    const result = executeTurn(state, actions);

    if (result.errors && result.errors.length > 0) {
      failure = {
        turnNumber,
        playerId: active.id,
        actions,
        errors: result.errors,
        stateBefore: state,
      };
      endReason = "invalid_turn";
      break;
    }

    state = result.gameState;
    turns.push({ turnNumber, playerId: active.id, actions, events: result.events });
    turnStats.push(turnStat(turnNumber, active.id, result.events, state));
    if (record) {
      recorded.push({
        turnNumber,
        playerId: active.id,
        actions,
        resultingStateSnapshot: cloneState(state),
        events: result.events,
      });
    }
    if (state.phase === "ended") {
      endReason = "victory";
      break;
    }
  }

  if (endReason === "max_turns" && config.tiebreak) {
    const ranked = [...state.players].sort(
      (a, b) =>
        b.completedMissionCount - a.completedMissionCount || b.ship.hitPoints - a.ship.hitPoints
    );
    state = { ...state, phase: "ended", winnerId: ranked[0].id };
    endReason = "tiebreak";
  }

  const metadata: RecordingMetadata = {
    source: "sim",
    playerKinds: initialState.players.map((p) => ({ playerId: p.id, kind: "bot" })),
    label: config.label,
    turnCount: turns.length,
    winnerId: state.winnerId,
    endReason,
  };

  const recording: GameRecording | undefined = record
    ? {
        schemaVersion: RECORDING_SCHEMA_VERSION,
        recordingId: `sim-${seed.toString(16)}-${botCount}p`,
        createdAt: new Date().toISOString(),
        seed,
        initialState,
        turns: recorded,
        finalState: state,
        metadata,
      }
    : undefined;

  return {
    seed,
    finalState: state,
    turnsPlayed: turns.length,
    endReason,
    turns,
    turnStats,
    recording,
    failure,
  };
}

function turnStat(turn: number, playerId: string, events: GameEvent[], after: GameState): TurnStat {
  const player = after.players.find((p) => p.id === playerId)!;
  const shields = player.ship.subsystems.filter((s) => s.type === "shields");
  const check = events.find((e) => e.type === "heat_check" && e.playerId === playerId);
  const heat = check && check.type === "heat_check" ? check : null;
  return {
    turn,
    playerId,
    coasted: events.some((e) => e.type === "coasted" && e.playerId === playerId),
    burned: events.some((e) => e.type === "burned" && e.playerId === playerId),
    jumped: events.some((e) => e.type === "jumped" && e.playerId === playerId),
    scooped: events.some((e) => e.type === "coasted" && e.playerId === playerId && e.scooped),
    shotsFired: events.filter((e) => e.type === "weapon_fired" && e.attackerId === playerId).length,
    shieldCubes: shields.reduce((sum, s) => sum + s.allocatedEnergy, 0),
    spentCubes: player.ship.spentEnergy,
    energyInUse: player.ship.subsystems.reduce((sum, s) => sum + s.allocatedEnergy, 0),
    heatAtCheck: heat ? heat.heat : 0,
    dissipation: heat ? heat.dissipation : getDissipationCapacity(player.ship.subsystems),
    heatDamage: heat ? heat.damage : 0,
    lost:
      events.some(
        (e) => (e.type === "respawned" || e.type === "turn_skipped") && e.playerId === playerId
      ) || isDestroyed(player.ship),
  };
}

export function formatFailure(f: InvalidTurn): string {
  const p = f.stateBefore.players.find((x) => x.id === f.playerId);
  const ship = p?.ship;
  const where = ship
    ? `${ship.wellId} R${ship.ring} S${ship.sector} ${ship.facing}, hull ${ship.hitPoints}, mass ${ship.reactionMass}`
    : "?";
  return [
    `Invalid turn by ${f.playerId} at T${f.turnNumber} (${where})`,
    `  errors: ${f.errors.join("; ")}`,
    `  actions: ${JSON.stringify(f.actions)}`,
  ].join("\n");
}
