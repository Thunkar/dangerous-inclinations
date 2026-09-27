/**
 * Mission progress and completion, driven by the events of the turn.
 *
 * Called once at the end of the active player's turn with everything that
 * happened. Completed missions are flipped face-up (public event).
 */
import type { GameState, Player } from "../../models/game.ts";
import type { EventDraft } from "../../models/events.ts";
import type {
  Cargo,
  EscortMission,
  PiracyMission,
  SalvageMission,
  SecondaryMission,
  Mission,
} from "../../models/missions.ts";
import { SURVEY_RING, aboard, crateAboard, missionPoints } from "../../models/missions.ts";
import { BLACK_HOLE_ID } from "../../models/gravityWells.ts";
import { isDestroyed } from "../ship.ts";
import { positionOf, samePosition } from "../geometry.ts";
import { isMooredAt } from "../stations.ts";
import { escortCandidatesAtEndOfTurn, unplacedEscorts } from "../escort.ts";

/**
 * Whether a secondary card's thing has been done, read off the board at the end
 * of the turn.
 *
 * A destroyed ship does nothing: it is off the board until it is
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

/**
 * Piracy: a pirate that ends its turn in a loaded ship's sector takes what it
 * carries: a crate or data (RULES §Missions).
 *
 * The hold is the whole constraint ({@link CARGO_HOLD_CRATES} is one, so a
 * pirate with freight of its own takes nothing), and a moored ship is out of
 * it at both ends: a berth is not a place cargo changes hands. A crate first
 * when the mark carries both. What the victim loses goes back to undone: the
 * item is off the hold, a Deliver holder loads again at its pickup station, a
 * Survey dives again, an Intercept scans again, and a pirate who has been
 * pirated has to seize again.
 *
 * `players` is written in place (the victim's hold and cards); the pirate's
 * own hold comes back as `cargo` because the caller is already carrying it.
 */
function seizeLoot(
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
    const held = aboard(victim.cargo);
    const taken = held.find((c) => c.kind === "crate") ?? held.find((c) => c.kind === "data");
    if (!taken) continue;
    players[victimIndex] = {
      ...victim,
      cargo: victim.cargo.map((c) => (c.id === taken.id ? { ...c, isPickedUp: false } : c)),
      // The card the item was doing goes back to undone. A Deliver keeps its
      // crate to reload, so only the cards that remember having done the thing
      // have anything to forget.
      missions: victim.missions.map((m) => {
        if (m.id !== taken.missionId || m.isCompleted) return m;
        if (m.type === "survey") return { ...m, acquired: false };
        if (m.type === "intercept_transmission") return { ...m, scanAcquired: false };
        return m;
      }),
    };
    // The loot rides as the card's own crate whatever was taken: it fills the
    // hold and everyone can see it. Seized before and lost since, it is the
    // same crate coming back aboard.
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
        kind: taken.kind,
        cargoId: taken.id,
        at: positionOf(ship),
      },
    };
  }
  return null;
}

/**
 * Salvage: a ship that ends its turn on a wreck's sector takes its black box
 * (RULES §Missions). It is data: it rides free beside whatever is in the hold,
 * a pirate can seize it, and it is filed at any station by the data job. A
 * moored ship salvages like any other. A card whose black box is already
 * aboard takes nothing; the caller stops at the first card that takes one
 * (one wreck a turn). The killer may take its own kill.
 */
function salvageWreck(
  player: Player,
  mission: SalvageMission,
  cargo: Cargo[],
  state: GameState
): { cargo: Cargo[]; wreckId: string; event: EventDraft } | null {
  const ship = player.ship;
  if (isDestroyed(ship)) return null;
  if (cargo.some((c) => c.id === mission.cargoId && c.isPickedUp)) return null;
  const wreck = state.wrecks.find((w) => samePosition(w, positionOf(ship)));
  if (!wreck) return null;
  // The same black box id as last time if a pirate took it or it went down
  // with the ship: one card, one cargo id.
  const blackBox: Cargo = {
    id: mission.cargoId,
    missionId: mission.id,
    kind: "data",
    deliveryPlanetId: "any",
    isPickedUp: true,
  };
  const next = cargo.some((c) => c.id === blackBox.id)
    ? cargo.map((c) => (c.id === blackBox.id ? blackBox : c))
    : [...cargo, blackBox];
  return {
    cargo: next,
    wreckId: wreck.id,
    event: {
      type: "wreck_salvaged",
      playerId: player.id,
      wreckId: wreck.id,
      cargoId: blackBox.id,
      at: positionOf(ship),
    },
  };
}

/**
 * Escort completion: every other player's undone Escort marking a ship that
 * delivered, sold or filed anything, or pumped a Tanker's fuel, this turn is
 * done. Those happen on the carrier's own turn, so this pays players who are
 * not the active one. `players` is written in place; the events come back.
 */
function payEscorts(players: Player[], deliveredBy: ReadonlySet<string>): EventDraft[] {
  const events: EventDraft[] = [];
  if (deliveredBy.size === 0) return events;
  players.forEach((player, index) => {
    let earned = 0;
    const done: Mission[] = [];
    const missions = player.missions.map((m) => {
      if (m.type !== "escort" || m.isCompleted || m.markedPlayerId === null) return m;
      if (!deliveredBy.has(m.markedPlayerId)) return m;
      const completed: EscortMission = { ...m, isCompleted: true };
      earned += missionPoints(completed.type);
      done.push(completed);
      return completed;
    });
    if (done.length === 0) return;
    const points = player.points + earned;
    players[index] = { ...player, missions, points };
    for (const mission of done) {
      events.push({
        type: "mission_completed",
        playerId: player.id,
        mission,
        points,
      });
    }
  });
  return events;
}

interface MissionCheckResult {
  state: GameState;
  events: EventDraft[];
}

/**
 * Apply the turn's events to the active player's missions.
 * @param turnEvents everything emitted so far this turn (actions, missiles, docking)
 * @param escortMarks the carriers the player's `escort_mark` actions named,
 *   in the order submitted; one that does not qualify now is passed over
 */
export function processMissionEvents(
  state: GameState,
  playerId: string,
  turnEvents: EventDraft[],
  escortMarks: readonly string[] = []
): MissionCheckResult {
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index === -1) return { state, events: [] };
  const player = state.players[index];
  const events: EventDraft[] = [];

  const kills = new Set<string>();
  const deliveredCargoIds = new Set<string>();
  /** Every ship that delivered, sold or filed anything, or pumped fuel, this turn (Escort). */
  const deliveredBy = new Set<string>();
  let pumpedFuel = false;

  for (const e of turnEvents) {
    if (e.type === "ship_destroyed" && e.killerId === playerId) kills.add(e.victimId);
    if (e.type === "cargo_delivered") {
      deliveredBy.add(e.playerId);
      if (e.playerId === playerId) deliveredCargoIds.add(e.cargoId);
    }
    if (e.type === "fuel_pumped") {
      deliveredBy.add(e.playerId);
      if (e.playerId === playerId) pumpedFuel = true;
    }
  }

  const players = [...state.players];
  let wrecks = state.wrecks;
  let cargo = player.cargo;
  let completed = 0;

  // Seizures first: loot taken this turn is aboard for the rest of it, so
  // a second Piracy card in the same hand finds the hold full.
  let seized = false;
  for (const mission of player.missions) {
    if (mission.type !== "piracy" || mission.isCompleted) continue;
    const taken = seizeLoot(players, index, mission, cargo, state);
    if (!taken) continue;
    cargo = taken.cargo;
    events.push(taken.event);
    seized = true;
  }

  // Salvage next. The black box is data and takes no room in the hold, so
  // nothing a pirate just seized stands in its way. One wreck a turn: the
  // first undone card in hand order without its black box aboard takes it.
  for (const mission of player.missions) {
    if (mission.type !== "salvage" || mission.isCompleted) continue;
    const salvaged = salvageWreck(player, mission, cargo, { ...state, wrecks });
    if (!salvaged) continue;
    cargo = salvaged.cargo;
    wrecks = wrecks.filter((w) => w.id !== salvaged.wreckId);
    events.push(salvaged.event);
    break;
  }

  // Escort markers last, and only where the player put one: against the
  // table as it stands now (a carrier a pirate has just emptied is no longer
  // a carrier). Each named ship that qualifies takes the first marker still
  // in hand; one that does not is passed over, and the marker stays put.
  const marks = new Map<string, string>();
  if (escortMarks.length > 0) {
    const eligible = new Set(escortCandidatesAtEndOfTurn(players, state.stations, playerId));
    const free = unplacedEscorts(player.missions);
    for (const carrierId of escortMarks) {
      const mission = free.find((m) => !marks.has(m.id));
      if (!mission) break;
      if (!eligible.has(carrierId) || [...marks.values()].includes(carrierId)) continue;
      marks.set(mission.id, carrierId);
      events.push({ type: "escort_marked", escortId: playerId, carrierId, missionId: mission.id });
    }
  }

  // Two of a kind are two jobs: one dive takes one Survey's data and one fuel
  // visit pays one Tanker, the first undone card of the kind in hand order.
  let dived = false;
  let pumped = false;

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
      case "salvage":
        // The black box is data for "any" station, filed by the data job.
        if (deliveredCargoIds.has(mission.cargoId)) next = { ...mission, isCompleted: true };
        break;
      case "tanker":
        // Paid by a visit that does the fuel job: the pumping is the card.
        if (pumpedFuel && !pumped) {
          pumped = true;
          next = { ...mission, isCompleted: true };
        }
        break;
      case "escort": {
        const carrierId = marks.get(mission.id);
        if (carrierId) next = { ...mission, markedPlayerId: carrierId };
        break;
      }
      case "survey": {
        let m = mission;
        if (!m.acquired && !dived) {
          if (secondaryDone(m, player)) {
            dived = true;
            m = { ...m, acquired: true };
            // Data a pirate took is still in the hold, un-picked: the dive
            // that takes it again puts the same data back aboard.
            const data: Cargo = {
              id: m.dataCargoId,
              missionId: m.id,
              kind: "data",
              deliveryPlanetId: m.deliveryPlanetId,
              isPickedUp: true,
            };
            cargo = cargo.some((c) => c.id === data.id)
              ? cargo.map((c) => (c.id === data.id ? data : c))
              : [...cargo, data];
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

  const points = player.points + completed;
  for (const m of missions) {
    const before = player.missions.find((pm) => pm.id === m.id);
    if (m.isCompleted && before && !before.isCompleted) {
      events.push({
        type: "mission_completed",
        playerId,
        mission: m,
        points,
      });
    }
  }

  const changed =
    completed > 0 ||
    seized ||
    cargo !== player.cargo ||
    missions.some((m, i) => m !== player.missions[i]);
  if (changed) players[index] = { ...player, missions, cargo, points };
  // Everyone else's Escorts on a ship that delivered or pumped fuel this turn:
  // the carrier is the active player, so this pays a card held at another seat.
  const escortEvents = payEscorts(players, deliveredBy);
  events.push(...escortEvents);

  if (!changed && escortEvents.length === 0 && wrecks === state.wrecks) {
    return { state, events };
  }
  return { state: { ...state, players, wrecks }, events };
}

/** The first seat, in turn order, that has reached the points needed to trigger the final round. */
export function checkForWinner(state: GameState): Player | undefined {
  return state.players.find((p) => p.points >= state.pointsToWin);
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
      b.points - a.points ||
      b.ship.hitPoints - a.ship.hitPoints ||
      b.ship.reactionMass - a.ship.reactionMass ||
      state.players.indexOf(a) - state.players.indexOf(b)
  );
  const [first, second] = ranked;
  const decidedBy: Decider = !second
    ? "points"
    : first.points !== second.points
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
