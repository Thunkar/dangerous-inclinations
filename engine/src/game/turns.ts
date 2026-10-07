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
 *     scan. Every action puts energy on the tile it uses, and it stays there
 *     until this player's next turn.
 *  4. The player's missiles move and resolve.
 *  5. Docking (if the ship arrived on a station): repairs, crates loaded, and one sale.
 *  6. Heat check: every cube on the loadout is a point of heat, heat over the
 *     redline becomes hull damage, then the ship dissipates and carries what
 *     is left into its next turn.
 *  7. Missions are updated from everything that happened, and any Escort
 *     marker the player chose to place goes on its carrier.
 *  8. Play passes on; at the end of every round stations move, carrying the
 *     ships moored to them, and wrecks drift with them.
 *
 * The returned state carries no log; the turn's events are returned alongside.
 */
import type { GameState, Player, PlayerAction, Wreck } from "../models/game.ts";
import type { GameEvent, EventDraft } from "../models/events.ts";
import { stampEvents } from "../models/events.ts";
import { processActions } from "./actionProcessors.ts";
import { processOwnerMissiles } from "./missiles.ts";
import { processDocking } from "./docking.ts";
import { resolveEndOfTurnHeat } from "./heat.ts";
import { processMissionEvents, checkForWinner, rankPlayers } from "./missions/missionChecks.ts";
import { advanceStations, isMooredAt } from "./stations.ts";
import { needsRespawn, respawnPlayer, dropCargo } from "./respawn.ts";
import { positionOf } from "./geometry.ts";
import { clearLoadout, isDestroyed, resetSubsystemUsage } from "./ship.ts";
import { escortPresent } from "./escort.ts";
import { nextEntityId } from "../utils/rng.ts";

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
  state = processed.state;
  events.push(...processed.events);
  state = applyDestructions(state, processed.events, events);

  const missiles = processOwnerMissiles(state, active.id);
  state = missiles.state;
  events.push(...missiles.events);
  state = applyDestructions(state, missiles.events, events);

  // Arriving at a station, or holding a berth held since last turn? Only an
  // arrival is a visit (RULES §Stations).
  // The sale named for the visit, if any; without one the visit makes the default.
  const dockSale = actions.find((a) => a.type === "dock_sale")?.data.sale;
  const docking = processDocking(state, activeIndex, !wasMoored, dockSale);
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

  // The carriers the player chose to put an Escort marker on, if any: each is
  // settled against where the turn ended (RULES §Missions, Escort).
  const escortMarks = actions.flatMap((a) => (a.type === "escort_mark" ? [a.data.carrierId] : []));
  // The items the player chose to seize (Piracy, "you may"): settled the same way.
  const seizes = actions.flatMap((a) => (a.type === "seize" ? [a.data] : []));
  const missions = processMissionEvents(state, active.id, events, escortMarks, seizes);
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

/**
 * The one place a destruction is settled, whatever did it (a weapon, a
 * missile, the heat check): for every ship destroyed in `source` events it
 * drops its cargo, removes its missiles in flight, leaves a wreck where it
 * died, and hands back every Escort marker on it and every one of its own
 * (RULES §Destruction and Respawn). `sink` is the turn's events so far, which
 * the new ones are appended to.
 */
function applyDestructions(state: GameState, source: EventDraft[], sink: EventDraft[]): GameState {
  let next = state;
  for (const e of source) {
    if (e.type !== "ship_destroyed") continue;
    const index = next.players.findIndex((p) => p.id === e.victimId);
    if (index === -1) continue;
    const victim = next.players[index];
    const dropped = dropCargo(victim);
    const players = [...next.players];
    players[index] = dropped.player;
    sink.push(...dropped.events);
    next = { ...next, players };

    // Its missiles in flight go with it.
    const lost = next.missiles.filter((m) => m.ownerId === victim.id);
    if (lost.length > 0) {
      next = { ...next, missiles: next.missiles.filter((m) => m.ownerId !== victim.id) };
      for (const missile of lost) {
        sink.push({
          type: "missile_expired",
          missileId: missile.id,
          ownerId: victim.id,
          at: positionOf(missile),
        });
      }
    }

    // The wreck: where the ship was when it died. A destroyed ship stays on
    // its sector until it respawns, so its position is the place.
    const wreck: Wreck = { id: nextEntityId(next, "wreck"), ...positionOf(victim.ship) };
    next = { ...next, wrecks: [...next.wrecks, wreck] };
    sink.push({
      type: "wreck_left",
      wreckId: wreck.id,
      victimId: victim.id,
      at: positionOf(victim.ship),
    });

    // Escort, in the order the destructions happened. Every marker on the dead
    // ship comes back to its owner, unless the ship sold earlier this same turn
    // (and then died at its heat check) with that escort in the sale's well:
    // the sale came first, and the mission check pays it. The dead ship's own
    // markers come off whatever they sit on and back to hand.
    const sale = sink.find(
      (d): d is Extract<EventDraft, { type: "cargo_delivered" | "fuel_pumped" }> =>
        (d.type === "cargo_delivered" || d.type === "fuel_pumped") && d.playerId === victim.id
    );
    next = settleEscorts(next, victim.id, sale?.planetId ?? null, sink);
  }
  return next;
}

/**
 * The Escort side of a destruction (RULES §Destruction and Respawn): every
 * undone Escort marking `victimId` comes back to its owner's hand, except one
 * whose escort was in the well of the sale `soldAt` the victim made first
 * this turn; and every Escort `victimId` holds that has a marker out comes
 * back too.
 */
function settleEscorts(
  state: GameState,
  victimId: string,
  soldAt: string | null,
  sink: EventDraft[]
): GameState {
  let changed = false;
  const players = state.players.map((player) => {
    let touched = false;
    const missions = player.missions.map((m) => {
      if (m.type !== "escort" || m.isCompleted || m.markedPlayerId === null) return m;
      if (player.id === victimId) {
        touched = true;
        sink.push({
          type: "escort_released",
          escortId: player.id,
          carrierId: m.markedPlayerId,
          missionId: m.id,
          cause: "escort_destroyed",
        });
        return { ...m, markedPlayerId: null };
      }
      if (m.markedPlayerId !== victimId) return m;
      if (soldAt !== null && escortPresent(player, soldAt)) return m;
      touched = true;
      sink.push({
        type: "escort_released",
        escortId: player.id,
        carrierId: victimId,
        missionId: m.id,
        cause: "carrier_destroyed",
      });
      return { ...m, markedPlayerId: null };
    });
    if (!touched) return player;
    changed = true;
    return { ...player, missions };
  });
  return changed ? { ...state, players } : state;
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
