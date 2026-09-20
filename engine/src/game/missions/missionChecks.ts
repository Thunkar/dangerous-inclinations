/**
 * Mission progress and completion, driven by the events of the turn.
 *
 * Called once at the end of the active player's turn with everything that
 * happened. Completed missions are flipped face-up (public event).
 */
import type { GameState, Player } from "../../models/game.ts";
import type { EventDraft } from "../../models/events.ts";
import type { Cargo, PiracyMission, SecondaryMission, Mission } from "../../models/missions.ts";
import { SURVEY_RING, missionPoints } from "../../models/missions.ts";
import { BLACK_HOLE_ID } from "../../models/gravityWells.ts";
import { isDestroyed } from "../ship.ts";
import { positionOf, samePosition } from "../geometry.ts";
import { isMooredAt } from "../stations.ts";

/**
 * Whether a secondary card's thing has been done, read off the board at the end
 * of the turn.
 *
 * A wreck does nothing: a destroyed ship is off the board until it is
 * rebuilt at Home.
 */
function secondaryDone(mission: SecondaryMission, player: Player): boolean {
  const ship = player.ship;
  if (isDestroyed(ship)) return false;
  switch (mission.type) {
    case "survey":
      // The dive: the innermost ring of the black hole, held to the end of a turn.
      return ship.wellId === BLACK_HOLE_ID && ship.ring === SURVEY_RING;
  }
}

/** A crate in the hold, as opposed to one waiting on a dock. */
function crateAboard(cargo: readonly Cargo[]): boolean {
  return cargo.some((c) => c.kind === "crate" && c.isPickedUp);
}

/**
 * Piracy: a pirate that ends its turn in a loaded ship's sector takes the
 * crate (RULES §Missions).
 *
 * The hold is the whole constraint — {@link CARGO_HOLD_CRATES} is one, so a
 * pirate with freight of its own takes nothing — and a moored ship is out of
 * it at both ends: a berth is not a place a crate changes hands. The victim's
 * crate is simply no longer aboard: a Deliver holder loads again at its pickup
 * station, and a pirate who has been pirated has to seize again.
 *
 * `players` is written in place (the victim's hold); the pirate's own hold
 * comes back as `cargo` because the caller is already carrying it.
 */
function seizeCrate(
  players: Player[],
  pirateIndex: number,
  mission: PiracyMission,
  cargo: Cargo[],
  state: GameState
): { cargo: Cargo[]; event: EventDraft } | null {
  const pirate = players[pirateIndex];
  const ship = pirate.ship;
  if (isDestroyed(ship) || isMooredAt(state.stations, positionOf(ship))) return null;
  if (crateAboard(cargo)) return null;
  // Two loaded ships in the same sector are settled by the table, not by a
  // die: the next seat in turn order after the pirate.
  for (let step = 1; step < players.length; step++) {
    const victimIndex = (pirateIndex + step) % players.length;
    const victim = players[victimIndex];
    if (!victim.hasDeployed || isDestroyed(victim.ship)) continue;
    if (!samePosition(positionOf(victim.ship), positionOf(ship))) continue;
    if (isMooredAt(state.stations, positionOf(victim.ship))) continue;
    const crate = victim.cargo.find((c) => c.kind === "crate" && c.isPickedUp);
    if (!crate) continue;
    players[victimIndex] = {
      ...victim,
      cargo: victim.cargo.map((c) => (c.id === crate.id ? { ...c, isPickedUp: false } : c)),
    };
    // The loot rides as the card's own crate, sold at any station. Seized
    // before and lost since, it is the same crate coming back aboard.
    const loot: Cargo = {
      id: mission.cargoId,
      missionId: mission.id,
      kind: "crate",
      deliveryPlanetId: "any",
      isPickedUp: true,
    };
    const next = cargo.some((c) => c.id === loot.id)
      ? cargo.map((c) => (c.id === loot.id ? loot : c))
      : [...cargo, loot];
    return {
      cargo: next,
      event: {
        type: "cargo_seized",
        pirateId: pirate.id,
        victimId: victim.id,
        cargoId: crate.id,
        at: positionOf(ship),
      },
    };
  }
  return null;
}

export interface MissionCheckResult {
  state: GameState;
  events: EventDraft[];
}

/**
 * Apply the turn's events to the active player's missions.
 * @param turnEvents everything emitted so far this turn (actions, missiles, docking)
 */
export function processMissionEvents(
  state: GameState,
  playerId: string,
  turnEvents: EventDraft[]
): MissionCheckResult {
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index === -1) return { state, events: [] };
  const player = state.players[index];
  const events: EventDraft[] = [];

  const kills = new Set<string>();
  const deliveredCargoIds = new Set<string>();
  let pumpedFuel = false;

  for (const e of turnEvents) {
    if (e.type === "ship_destroyed" && e.killerId === playerId) kills.add(e.victimId);
    if (e.type === "cargo_delivered" && e.playerId === playerId) {
      deliveredCargoIds.add(e.cargoId);
    }
    if (e.type === "fuel_sold" && e.playerId === playerId) pumpedFuel = true;
  }

  const players = [...state.players];
  let cargo = player.cargo;
  let completed = 0;

  // Seizures first: a crate taken this turn is aboard for the rest of it, so
  // a second Piracy card in the same hand finds the hold full.
  let seized = false;
  for (const mission of player.missions) {
    if (mission.type !== "piracy" || mission.isCompleted) continue;
    const taken = seizeCrate(players, index, mission, cargo, state);
    if (!taken) continue;
    cargo = taken.cargo;
    events.push(taken.event);
    seized = true;
  }

  const missions: Mission[] = player.missions.map((mission) => {
    if (mission.isCompleted) return mission;
    let next: Mission = mission;

    switch (mission.type) {
      case "destroy_ship":
        if (kills.has(mission.targetPlayerId)) next = { ...mission, isCompleted: true };
        break;
      case "deliver_cargo":
        if (deliveredCargoIds.has(mission.cargoId)) next = { ...mission, isCompleted: true };
        break;
      case "intercept_transmission":
        if (mission.scanAcquired && deliveredCargoIds.has(mission.dataCargoId))
          next = { ...mission, isCompleted: true };
        break;
      case "piracy":
        // The loot is sold like any other freight: a crate bound for "any"
        // station is delivered on arrival (game/docking.ts).
        if (deliveredCargoIds.has(mission.cargoId)) next = { ...mission, isCompleted: true };
        break;
      case "tanker":
        // Paid on arrival, no choice and no chit: the pumping is the card.
        if (pumpedFuel) next = { ...mission, isCompleted: true };
        break;
      case "survey": {
        let m = mission;
        if (!m.acquired) {
          if (secondaryDone(m, player)) {
            m = { ...m, acquired: true };
            cargo = [
              ...cargo,
              {
                id: m.dataCargoId,
                missionId: m.id,
                kind: "data",
                deliveryPlanetId: m.deliveryPlanetId,
                isPickedUp: true,
              },
            ];
            events.push({
              type: "data_acquired",
              playerId,
              kind: m.type,
              missionId: m.id,
              privateTo: [playerId],
            });
          }
        }
        if (m.acquired && deliveredCargoIds.has(m.dataCargoId)) m = { ...m, isCompleted: true };
        next = m;
        break;
      }
    }

    if (next.isCompleted) completed += missionPoints(next.type);
    return next;
  });

  if (
    completed === 0 &&
    !seized &&
    cargo === player.cargo &&
    missions.every((m, i) => m === player.missions[i])
  ) {
    return { state, events };
  }

  const completedMissionCount = player.completedMissionCount + completed;
  for (const m of missions) {
    const before = player.missions.find((pm) => pm.id === m.id);
    if (m.isCompleted && before && !before.isCompleted) {
      events.push({
        type: "mission_completed",
        playerId,
        mission: m,
        completedCount: completedMissionCount,
      });
    }
  }

  players[index] = { ...player, missions, cargo, completedMissionCount };
  return { state: { ...state, players }, events };
}

/** The first seat, in turn order, that has reached the points needed to trigger the final round. */
export function checkForWinner(state: GameState): Player | undefined {
  return state.players.find((p) => p.completedMissionCount >= state.pointsToWin);
}

export type Decider = "points" | "hull" | "fuel" | "seat";

/**
 * Standings: most points, then most hull, then most fuel, then the earlier
 * seat. Used when the final round has been played out and at the simulator's
 * turn cap. Also says what separated first from second.
 */
export function rankPlayers(state: GameState): { ranked: Player[]; decidedBy: Decider } {
  const ranked = [...state.players].sort(
    (a, b) =>
      b.completedMissionCount - a.completedMissionCount ||
      b.ship.hitPoints - a.ship.hitPoints ||
      b.ship.reactionMass - a.ship.reactionMass ||
      state.players.indexOf(a) - state.players.indexOf(b)
  );
  const [first, second] = ranked;
  const decidedBy: Decider = !second
    ? "points"
    : first.completedMissionCount !== second.completedMissionCount
      ? "points"
      : first.ship.hitPoints !== second.ship.hitPoints
        ? "hull"
        : first.ship.reactionMass !== second.ship.reactionMass
          ? "fuel"
          : "seat";
  return { ranked, decidedBy };
}

/** Face-up cards: the missions a player has completed. Public information. */
export function completedMissions(player: Player): Mission[] {
  return player.missions.filter((m) => m.isCompleted);
}
