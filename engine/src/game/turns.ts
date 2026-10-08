/**
 * One player's turn.
 *
 *  1. If the ship is destroyed: respawn at Home and drift with the ring. The
 *     turn ends here, and the ship cannot be touched until the end of the turn
 *     its owner plays next, which is a first round of its own: energy and a
 *     move, but no weapon fires and nobody is scanned. The last act of that
 *     turn is clearing the flag.
 *  2. The player clears their loadout: every cube they used or powered last
 *     turn comes off, having worked on everyone else's turns since.
 *  3. Actions in the order the player chose: power, rotate, one move, fire,
 *     scan, seize, survey, salvage, mark. Every action but the last four puts
 *     energy on the tile it uses, and it stays there until this player's next
 *     turn. A salvo flies the moment it is launched and resolves there, among
 *     the actions, and a seizure, a survey's data, a black box and an Escort
 *     marker are taken where they come in the sequence. A ship an action
 *     destroys is settled at once (destruction.ts): its wreck, its dropped
 *     cargo and its markers back in hand are there for every later action.
 *  4. The player's missiles launched on earlier turns ride, fly and resolve.
 *  5. Heat check: every cube on the loadout is a point of heat, heat over the
 *     redline becomes hull damage, then the ship dissipates and carries what
 *     is left into its next turn. It comes before the dock, so a hot approach
 *     is paid from the hull the ship arrives with.
 *  6. Docking (if the ship arrived on a station and survived its check):
 *     repairs, full hull, a reload, and one thing: load the crates or one sale.
 *  7. Missions are updated from everything that happened: completed cards
 *     turn face-up, and an Escort on a ship that sold is paid.
 *  8. Play passes on; at the end of every round stations move, carrying the
 *     ships moored to them, and wrecks drift with them.
 *
 * The returned state carries no log; the turn's events are returned alongside.
 */
import type { GameState, Player, PlayerAction } from "../models/game.ts";
import type { GameEvent, EventDraft } from "../models/events.ts";
import { stampEvents } from "../models/events.ts";
import { processActions } from "./actionProcessors.ts";
import { processOwnerMissiles } from "./missiles.ts";
import { processDocking } from "./docking.ts";
import { resolveEndOfTurnHeat } from "./heat.ts";
import { processMissionEvents, checkForWinner, rankPlayers } from "./missions/missionChecks.ts";
import { advanceStations, isMooredAt } from "./stations.ts";
import { needsRespawn, respawnPlayer } from "./respawn.ts";
import { applyDestructions } from "./destruction.ts";
import { positionOf } from "./geometry.ts";
import { clearLoadout, isDestroyed, resetSubsystemUsage } from "./ship.ts";

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

  if (actions.some((a) => a.playerId !== active.id)) {
    return { gameState, events: [], errors: ["All actions must belong to the active player"] };
  }

  // The start of the turn: the energy this player used or powered last turn
  // has been working on everyone else's turns and comes off now (RULES
  // §Energy and Heat). Only the active player's loadout is cleared; everyone
  // else's is still up until their own turn comes round.
  state = withActiveShip(state, activeIndex, clearLoadout(active.ship));

  // Where the turn began: a ship is moored during its own actions only while
  // it holds the berth it began on, and docks only on arrival (RULES §Stations).
  const start = positionOf(active.ship);
  const wasMoored = isMooredAt(gameState.stations, start);
  const processed = processActions(state, actions, { start });
  if (!processed.success) {
    return { gameState, events: [], errors: processed.errors ?? ["Failed to process actions"] };
  }
  // A kill among the actions was settled where it came in the sequence
  // (actionProcessors.ts): its wreck, its cargo and its markers are already
  // in `processed`.
  state = processed.state;
  events.push(...processed.events);

  const missiles = processOwnerMissiles(state, active.id);
  state = missiles.state;
  events.push(...missiles.events);
  state = applyDestructions(state, missiles.events, events);

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
      // A ship its own check destroys on a station's sector leaves its wreck
      // there and does not dock (processDocking skips a destroyed ship).
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

  // Arriving at a station, or holding a berth held since last turn? Only an
  // arrival is a visit (RULES §Stations), and only by a ship that survived its
  // heat check: the dock heals what the approach burned, not what killed it.
  // The sale named for the visit, if any; without one the visit makes the default.
  const dockSale = actions.find((a) => a.type === "dock_sale")?.data.sale;
  const docking = processDocking(state, activeIndex, !wasMoored, dockSale);
  state = docking.state;
  events.push(...docking.events);

  const missions = processMissionEvents(state, active.id, events);
  state = missions.state;
  events.push(...missions.events);

  // The turn back is over. The ship came home last turn, flew this one
  // untouchable and fired at nobody while it did; from here it is a target
  // like anyone else (RULES §Destruction and Respawn).
  state = clearRecovering(state, activeIndex);

  return finish(gameState, state, events, turn);
}

function withActiveShip(state: GameState, index: number, ship: Player["ship"]): GameState {
  if (ship === state.players[index].ship) return state;
  const players = [...state.players];
  players[index] = { ...players[index], ship };
  return { ...state, players };
}

/** Spend the untouchable flag: the returning turn has been played out. */
function clearRecovering(state: GameState, index: number): GameState {
  if (!state.players[index].recovering) return state;
  const players = [...state.players];
  players[index] = { ...players[index], recovering: false };
  return { ...state, players };
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
  // Energy is not touched here: it stays on every tile until its owner's next
  // turn starts, which is what makes a wall, a rack or a sensor work while its
  // owner is not acting.
  let next: GameState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      ship: resetSubsystemUsage(p.ship),
    })),
    activePlayerIndex: nextIndex,
    turn: newRound ? turn + 1 : turn,
  };

  if (newRound) {
    // Stations advance and take their moored ships with them; wrecks drift.
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
      points: reached.points,
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
