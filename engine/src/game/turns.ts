/**
 * One player's turn.
 *
 *  1. If the ship is destroyed: respawn at Home and drift with the ring. The
 *     turn ends here, and the ship cannot be touched until the end of the turn
 *     its owner plays next, which is a first round of its own: energy and a
 *     move, but no weapon fires and nobody is scanned. The last act of that
 *     turn is clearing the flag.
 *  2. Energy changes, then tactical actions in the chosen order.
 *  3. The player's missiles move and resolve.
 *  4. Docking (if the ship ended on a station).
 *  5. Heat check: heat over the redline becomes hull damage, then the ship
 *     dissipates and carries what is left into its next turn.
 *  6. Missions are updated from everything that happened.
 *  7. Play passes on; at the end of every round stations move, carrying the
 *     ships moored to them.
 *
 * The returned state carries no log; the turn's events are returned alongside.
 */
import type { GameState, PlayerAction } from "../models/game.ts";
import type { GameEvent, EventDraft } from "../models/events.ts";
import { stampEvents } from "../models/events.ts";
import { processActions } from "./actionProcessors.ts";
import { processOwnerMissiles } from "./missiles.ts";
import { processDocking } from "./docking.ts";
import { resolveEndOfTurnHeat } from "./heat.ts";
import { processMissionEvents, checkForWinner, rankPlayers } from "./missions/missionChecks.ts";
import { advanceStations, isMooredAt } from "./stations.ts";
import { needsRespawn, respawnPlayer, dropCargo } from "./respawn.ts";
import { applyOrbitalMovement } from "./movement.ts";
import { positionOf } from "./geometry.ts";
import { isDestroyed, resetSubsystemUsage } from "./ship.ts";

export interface TurnResult {
  gameState: GameState;
  events: GameEvent[];
  errors?: string[];
}

export function executeTurn(gameState: GameState, actions: PlayerAction[]): TurnResult {
  if (gameState.phase !== "active") {
    return {
      gameState,
      events: [],
      errors: [`Cannot take a turn: game phase is "${gameState.phase}"`],
    };
  }

  const turn = gameState.turn;
  const activeIndex = gameState.activePlayerIndex;
  const active = gameState.players[activeIndex];
  const events: EventDraft[] = [];

  // Shallow copy: RNG helpers mutate rngState on the working object.
  let state: GameState = { ...gameState };

  if (needsRespawn(active)) {
    const respawn = respawnPlayer(state, activeIndex);
    state = respawn.state;
    events.push(...respawn.events);
    return finish(gameState, state, events, turn);
  }

  // Only old recordings reach here: they were made when the turn after the
  // respawn was lost as well, and they still replay. Submitted actions are
  // ignored, but the ship is in orbit, so it drifts with its ring like
  // anything else on it. It cannot be moored (Home is on one of the black
  // hole's deployment rings and stations orbit a planet), so no berth to hold and
  // nothing for `advanceStations` to carry. A turn held counts as the turn
  // back, so the untouchable flag is spent here too.
  if (active.skipTurns > 0) {
    const ship = applyOrbitalMovement(active.ship);
    const players = [...state.players];
    players[activeIndex] = {
      ...players[activeIndex],
      ship,
      skipTurns: active.skipTurns - 1,
      recovering: false,
    };
    state = { ...state, players };
    events.push({ type: "turn_skipped", playerId: active.id, remaining: active.skipTurns - 1 });
    // The board moves the token on a `coasted` like any other drift; the flag
    // says the helm was empty, so the log does not claim the player coasted.
    events.push({
      type: "coasted",
      playerId: active.id,
      to: positionOf(ship),
      scooped: false,
      heat: 0,
      recovering: true,
    });
    return finish(gameState, state, events, turn);
  }

  if (actions.some((a) => a.playerId !== active.id)) {
    return { gameState, events: [], errors: ["All actions must belong to the active player"] };
  }

  const processed = processActions(state, actions);
  if (!processed.success) {
    return { gameState, events: [], errors: processed.errors ?? ["Failed to process actions"] };
  }
  state = processed.state;
  events.push(...processed.events);
  state = applyDestructions(state, processed.events, events);

  const missiles = processOwnerMissiles(state, active.id);
  state = missiles.state;
  events.push(...missiles.events);
  state = applyDestructions(state, missiles.events, events);

  // Making port, or holding a berth held since last turn? Only an arrival is
  // staked courtesy fuel (RULES §Stations).
  const wasMoored = isMooredAt(gameState.stations, positionOf(active.ship));
  const docking = processDocking(state, activeIndex, !wasMoored);
  state = docking.state;
  events.push(...docking.events);

  // Heat check for the active player.
  {
    const player = state.players[activeIndex];
    if (!isDestroyed(player.ship)) {
      // The tile its owner named with the turn; it only lands if heat is 0.
      const repairChoice = actions.find((a) => a.type === "repair")?.data.subsystemId;
      const heat = resolveEndOfTurnHeat(player.ship, player.id, repairChoice);
      const players = [...state.players];
      players[activeIndex] = { ...player, ship: heat.ship };
      state = { ...state, players };
      events.push(...heat.events);
      if (isDestroyed(heat.ship)) {
        const destroyed: EventDraft = {
          type: "ship_destroyed",
          victimId: player.id,
          cause: "heat",
        };
        events.push(destroyed);
        state = applyDestructions(state, [destroyed], events);
      }
    }
  }

  const missions = processMissionEvents(state, active.id, events);
  state = missions.state;
  events.push(...missions.events);

  // The turn back is over. The ship came home last turn, flew this one
  // untouchable and fired at nobody while it did; from here it is a target
  // like anyone else (RULES §Destruction and Respawn).
  state = clearRecovering(state, activeIndex);

  return finish(gameState, state, events, turn);
}

/** Spend the untouchable flag: the returning turn has been played out. */
function clearRecovering(state: GameState, index: number): GameState {
  if (!state.players[index].recovering) return state;
  const players = [...state.players];
  players[index] = { ...players[index], recovering: false };
  return { ...state, players };
}

/** For every ship destroyed in `source` events: drop its cargo. */
function applyDestructions(state: GameState, source: EventDraft[], sink: EventDraft[]): GameState {
  let next = state;
  for (const e of source) {
    if (e.type !== "ship_destroyed") continue;
    const index = next.players.findIndex((p) => p.id === e.victimId);
    if (index === -1) continue;
    const dropped = dropCargo(next.players[index]);
    if (dropped.events.length > 0) {
      const players = [...next.players];
      players[index] = dropped.player;
      next = { ...next, players };
      sink.push(...dropped.events);
    }
  }
  return next;
}

/** Pass play to the next player, move stations at round end, check for a winner. */
function finish(
  original: GameState,
  state: GameState,
  events: EventDraft[],
  turn: number
): TurnResult {
  const nextIndex = (original.activePlayerIndex + 1) % state.players.length;
  const newRound = nextIndex === 0;
  // "Once per turn" means once per player-turn for everyone: a rack that
  // intercepted during this turn is ready again when the next player acts.
  let next: GameState = {
    ...state,
    players: state.players.map((p) => ({ ...p, ship: resetSubsystemUsage(p.ship) })),
    activePlayerIndex: nextIndex,
    turn: newRound ? turn + 1 : turn,
  };

  if (newRound) {
    // Stations advance and take their moored ships with them.
    const advanced = advanceStations(next);
    next = advanced.state;
    events.push(...advanced.events);
  }

  // Reaching the points needed does not end the game on the spot: the round
  // is played out so every seat has had the same number of turns, then the
  // standings decide (RULES §Missions).
  const reached = checkForWinner(next);
  if (reached && !state.finalRound) {
    next = { ...next, finalRound: true };
    events.push({
      type: "final_round",
      playerId: reached.id,
      points: reached.completedMissionCount,
      turnsLeft: newRound ? 0 : state.players.length - nextIndex,
    });
  }
  if (next.finalRound && newRound) {
    const { ranked, decidedBy } = rankPlayers(next);
    next = { ...next, phase: "ended", winnerId: ranked[0].id };
    events.push({ type: "game_ended", winnerId: ranked[0].id, decidedBy });
  }

  return { gameState: next, events: stampEvents(events, turn) };
}
