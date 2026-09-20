/**
 * Headless bot-vs-bot game. One entry point for every simulator use:
 * strict by construction (a bot producing an invalid turn stops the game and
 * is reported as a failure), optionally recording every turn.
 *
 * Setup uses exactly the engine functions the server uses (createGame,
 * submitLoadout, deployShip), and bots decide from `viewFor`, so sim results
 * describe the same game humans play. The experiment-only override channels
 * (sim/ruleOverrides.ts, tileOverrides.ts, weaponOverrides.ts,
 * loadoutOverrides.ts, botOverrides.ts) let a change be measured before it is
 * adopted.
 */
import type { GameState, PlayerAction } from "../models/game.ts";
import type { GameEvent } from "../models/events.ts";
import type { GameRecording, RecordedTurn, RecordingMetadata } from "../recording/types.ts";
import { RECORDING_SCHEMA_VERSION } from "../recording/types.ts";
import { cloneState } from "../recording/replay.ts";
import { applyWeaponOverrides, type WeaponOverrides } from "./weaponOverrides.ts";
import { applyTileOverrides, type TileOverrides } from "./tileOverrides.ts";
import { type RuleOverrides } from "./ruleOverrides.ts";
import { applyBotOverrides, type BotOverrides } from "./botOverrides.ts";
import {
  applyLoadoutOverrides,
  type LoadoutOverrides,
  type SeatLoadouts,
  type SeatHands,
} from "./loadoutOverrides.ts";
import { createGame, submitLoadout } from "../game/setup.ts";
import { assignMissionId, buildPrimaryDeck, cardForPlayer } from "../game/missions/missionDeck.ts";
import { isPrimaryType } from "../models/missions.ts";
import { rankPlayers } from "../game/missions/missionChecks.ts";
import { deployShip, transitionToActivePhase } from "../game/deployment.ts";
import { executeTurn } from "../game/turns.ts";
import { viewFor } from "../game/view.ts";
import { getDissipationCapacity } from "../game/ship.ts";
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
  /** At the turn cap, declare the player with most completed missions (then most hull) the winner. */
  tiebreak?: boolean;
  /** Experiment-only tile overrides: any field of any tile (see sim/tileOverrides.ts). */
  tiles?: TileOverrides;
  /** Experiment-only rule overrides: points to win, hand shape, jump fuel (see sim/ruleOverrides.ts). */
  rules?: RuleOverrides;
  /** Experiment-only weapon stat overrides (see sim/weaponOverrides.ts). */
  weapons?: WeaponOverrides;
  /** Experiment-only bot parameter overrides (see sim/botOverrides.ts). */
  bots?: BotOverrides;
  /** Experiment-only bot hull overrides (see sim/loadoutOverrides.ts). */
  loadouts?: LoadoutOverrides;
  /** Experiment-only: force a hull on a seat (`bot-1`…), whatever its hand asks for. */
  seatLoadouts?: SeatLoadouts;
  /**
   * Experiment-only: the primary a seat runs. The bots pick among the plans
   * they are offered, so a plan they never choose is only measurable dealt —
   * and dealt is what this is: a seat the shuffle did not serve has an offer
   * swapped for the card (see {@link dealForcedPrimaries}).
   */
  seatHands?: SeatHands;
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
  /** Cubes allocated to any subsystem at the end of the turn. */
  energyInUse: number;
  heatAtCheck: number;
  dissipation: number;
  heatDamage: number;
  /**
   * The turn was the respawn turn: the ship came back at Home and drifted, and
   * that was the whole turn. The turn after it is played in full, so it is not
   * lost (RULES §Destruction and Respawn).
   */
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
 * Experiment only (`--hands=`): make sure a seat told to run a plan was dealt
 * the card for it.
 *
 * A bot can only keep what the deal put in front of it, and the primary pile
 * does not offer every card to every seat — at three seats a hand is offered a
 * Destroy 45% of the time and an Intercept 47%, so *filtering* a forced plan
 * measured that plan in half the games and whatever else turned up in the rest.
 * So the plan is dealt: a seat whose three primary offers hold no card of the
 * forced type has its first primary offer replaced by a printed one that does,
 * drawn from {@link buildPrimaryDeck} with the game's own RNG so a seed still
 * replays exactly. Every other seat, and every seat the shuffle already
 * served, keeps the deal it was given — a seed that needs no swap plays the
 * same game it played before.
 *
 * This never reaches the server: nothing outside the simulator passes
 * `seatHands`, and a dealt hand is the two printed piles and nothing else.
 */
function dealForcedPrimaries(state: GameState, botCount: number, seatHands: SeatHands): GameState {
  for (const [seatId, type] of Object.entries(seatHands)) {
    const seat = state.players.findIndex((p) => p.id === seatId);
    if (seat === -1) continue;
    const offers = state.players[seat].missionOffers;
    if (offers.some((m) => m.type === type)) continue;
    const printed = buildPrimaryDeck(botCount).filter((card) => card.type === type);
    const slot = offers.findIndex((m) => isPrimaryType(m.type));
    if (printed.length === 0 || slot === -1) continue;
    const card = printed[pickIndex(state, printed)];
    offers[slot] = assignMissionId(cardForPlayer(card, seat, state.players), `m-forced-${seatId}`);
  }
  return state;
}

/**
 * Create a game with `botCount` bots, run loadout and deployment through the
 * AI, and return the state in the active phase.
 */
export function setupBotGame(
  seed: number,
  botCount: number,
  seatLoadouts?: SeatLoadouts,
  seatHands?: SeatHands,
  /** What the table plays to; the engine's default when omitted. */
  pointsToWin?: number
): GameState {
  let state = createGame(
    botIds(botCount).map((id, i) => ({ id, name: `Bot ${i + 1}` })),
    seed,
    { pointsToWin }
  );
  if (seatHands) state = dealForcedPrimaries(state, botCount, seatHands);

  for (const player of state.players) {
    // A forced hull is offered to the bot, not stapled on: the bot keeps cards
    // that hull can fly, and a deal with no flyable trio (four of the six
    // offers needing a sensor array) leaves the seat its own loadout for that game.
    const choice = botChooseLoadout(player.missionOffers, {
      playerCount: botCount,
      hull: seatLoadouts?.[player.id],
      primary: seatHands?.[player.id],
      // Seeded: the spread of hands across a batch replays exactly.
      pick: (n) => pickIndex(state, Array.from({ length: n })),
    });
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
    const result = deployShip(state, active.id, choice.sector, choice.ring);
    if (!result.success) throw new Error(`Bot ${active.id} deployment rejected: ${result.error}`);
    state = transitionToActivePhase(result.state);
  }

  return state;
}

export function runGame(config: GameConfig = {}): GameRunResult {
  const seed = config.seed ?? freshSeed();
  const botCount = config.botCount ?? DEFAULT_BOT_COUNT;
  const maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
  applyTileOverrides(config.tiles);
  applyWeaponOverrides(config.weapons);
  applyBotOverrides(config.bots);
  applyLoadoutOverrides(config.loadouts);
  const record = config.record ?? true;

  const initialState = setupBotGame(
    seed,
    botCount,
    config.seatLoadouts,
    config.seatHands,
    // Points to win is a table agreement, not a constant the override channel
    // reassigns: it is dealt into the game like any other setting.
    config.rules?.missionsToWin
  );
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
    const { ranked } = rankPlayers(state);
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
    energyInUse: player.ship.subsystems.reduce((sum, s) => sum + s.allocatedEnergy, 0),
    heatAtCheck: heat ? heat.heat : 0,
    dissipation: heat ? heat.dissipation : getDissipationCapacity(player.ship.subsystems),
    heatDamage: heat ? heat.damage : 0,
    lost: events.some((e) => e.type === "respawned" && e.playerId === playerId),
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
