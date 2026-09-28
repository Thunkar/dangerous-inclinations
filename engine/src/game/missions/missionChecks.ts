/**
 * Mission progress and completion, driven by the events of the turn.
 *
 * Called once at the end of the active player's turn with everything that
 * happened. Completed missions are flipped face-up (public event).
 */
import type { GameState, Player } from "../../models/game.ts";
import type { EventDraft } from "../../models/events.ts";
import type { PlayerView } from "../view.ts";
import type {
  Cargo,
  EscortMission,
  PiracyMission,
  SalvageMission,
  Mission,
} from "../../models/missions.ts";
import { SURVEY_RING, dataAboard, missionPoints } from "../../models/missions.ts";
import { BLACK_HOLE_ID } from "../../models/gravityWells.ts";
import { isDestroyed } from "../ship.ts";
import { positionOf, samePosition } from "../geometry.ts";
import { escortCandidatesAtEndOfTurn, unplacedEscorts } from "../escort.ts";
import { freePiracyCards, seizableItemsAtEndOfTurn } from "../piracy.ts";

/**
 * The seizure itself: `taken` comes off the victim's hold and the pirate's
 * card's loot goes aboard. What the victim loses goes back to undone: the
 * item is off the hold, a Deliver holder loads again at its pickup station, a
 * Survey dives again, an Intercept scans again, and a pirate who has been
 * pirated has to seize again. `players` is written in place (the victim); the
 * pirate's hold comes back as `cargo`.
 */
function takeItem(
  players: Player[],
  pirateIndex: number,
  victimIndex: number,
  taken: Cargo,
  mission: PiracyMission,
  cargo: Cargo[]
): { cargo: Cargo[]; event: EventDraft } {
  const pirate = players[pirateIndex];
  const victim = players[victimIndex];
  players[victimIndex] = {
    ...victim,
    // The card the item was doing goes back to undone with it: a Deliver
    // reloads its crate, a Survey or an Intercept has no data aboard.
    cargo: victim.cargo.map((c) => (c.id === taken.id ? { ...c, isPickedUp: false } : c)),
  };
  // The loot rides as the card's own item whatever was taken, loot to
  // everyone watching. Seized before and lost since, it is the same item
  // coming back aboard.
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
      at: positionOf(pirate.ship),
    },
  };
}

/**
 * Piracy (RULES §Missions): the items the pirate named with its `seize`
 * actions, in the order submitted, one per free Piracy card in hand order.
 * No name is no seizure. Each is checked against the table as it stands now,
 * the seizures before it included; one that is not there to take (the ship
 * moved on, docked, died or no longer carries it) is passed over and the card
 * waits for the next name. `players` is written in place (the victims).
 */
function seizeNamed(
  players: Player[],
  pirateIndex: number,
  missions: readonly Mission[],
  cargo: Cargo[],
  stations: GameState["stations"],
  named: readonly SeizeOrder[]
): { cargo: Cargo[]; events: EventDraft[] } {
  const events: EventDraft[] = [];
  const pirateId = players[pirateIndex].id;
  const used = new Set<string>();
  for (const order of named) {
    const mission = freePiracyCards(missions, cargo).find((m) => !used.has(m.id));
    if (!mission) break;
    const eligible = seizableItemsAtEndOfTurn(players, stations, pirateId).some(
      (i) => i.victimId === order.victimId && i.cargoId === order.cargoId
    );
    if (!eligible) continue;
    const victimIndex = players.findIndex((p) => p.id === order.victimId);
    const taken = players[victimIndex].cargo.find((c) => c.id === order.cargoId && c.isPickedUp)!;
    const result = takeItem(players, pirateIndex, victimIndex, taken, mission, cargo);
    used.add(mission.id);
    cargo = result.cargo;
    events.push(result.event);
  }
  return { cargo, events };
}

/**
 * Salvage: a ship that ends its turn on a wreck's sector takes its black box
 * (RULES §Missions). It is data: a pirate can seize it, and it is filed at
 * any station. A moored ship salvages like any other. A card whose black box is already
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

/** An item a `seize` action names. */
export interface SeizeOrder {
  victimId: string;
  cargoId: string;
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
 * @param seizes the items the player's `seize` actions named, in the order
 *   submitted; one that is not there to take now is passed over
 */
export function processMissionEvents(
  state: GameState,
  playerId: string,
  turnEvents: EventDraft[],
  escortMarks: readonly string[] = [],
  seizes: readonly SeizeOrder[] = []
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

  // Seizures first: loot taken this turn is aboard for the rest of it. The
  // pirate picks the item, and no name is no seizure.
  const taken = seizeNamed(players, index, player.missions, cargo, state.stations, seizes);
  cargo = taken.cargo;
  events.push(...taken.events);
  const seized = taken.events.length > 0;

  // Salvage next. One wreck a turn: the first undone card in hand order
  // without its black box aboard takes it.
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
  // sale pays one Tanker, the first undone card of the kind in hand order.
  let dived = false;
  let pumped = false;
  // The dive: the black hole's innermost ring, held to the end of a turn. A
  // destroyed ship is off the board until it is rebuilt at Home.
  const onSurveyRing =
    !isDestroyed(player.ship) &&
    player.ship.wellId === BLACK_HOLE_ID &&
    player.ship.ring === SURVEY_RING;

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
        // Only data aboard is filed, so filing it is the whole check.
        if (deliveredCargoIds.has(mission.dataCargoId)) next = { ...mission, isCompleted: true };
        break;
      case "piracy":
        // The loot is sold like any other item, at any station (game/docking.ts).
        if (deliveredCargoIds.has(mission.cargoId)) next = { ...mission, isCompleted: true };
        break;
      case "salvage":
        // The black box is data for "any" station.
        if (deliveredCargoIds.has(mission.cargoId)) next = { ...mission, isCompleted: true };
        break;
      case "tanker":
        // Paid by a visit that sells the fuel: the pumping is the card.
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
        // Only data aboard is filed, so filing it is the whole check.
        if (deliveredCargoIds.has(mission.dataCargoId)) {
          next = { ...mission, isCompleted: true };
          break;
        }
        if (dived || !onSurveyRing || dataAboard({ cargo }, mission)) break;
        dived = true;
        // Data a pirate took is still in the hold, un-picked: the dive that
        // takes it again puts the same data back aboard.
        const data: Cargo = {
          id: mission.dataCargoId,
          missionId: mission.id,
          kind: "data",
          deliveryPlanetId: "any",
          isPickedUp: true,
        };
        cargo = cargo.some((c) => c.id === data.id)
          ? cargo.map((c) => (c.id === data.id ? data : c))
          : [...cargo, data];
        events.push({
          type: "data_acquired",
          playerId,
          kind: mission.type,
          missionId: mission.id,
          privateTo: [playerId],
        });
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

/** What the standings read off a seat: its points, its hull and its fuel. */
function standing(p: Player | PlayerView): { points: number; hull: number; fuel: number } {
  if ("isMe" in p)
    return { points: p.points, hull: p.ship?.hitPoints ?? 0, fuel: p.ship?.fuel ?? 0 };
  return { points: p.points, hull: p.ship.hitPoints, fuel: p.ship.reactionMass };
}

/**
 * Standings: most points, then most hull, then most fuel, then the earlier
 * seat. Used when the final round has been played out and at the simulator's
 * turn cap, and by anything that ranks the table from a view (all three are
 * public). Also says what separated first from second.
 */
export function rankPlayers<T extends Player | PlayerView>(table: {
  players: readonly T[];
}): { ranked: T[]; decidedBy: Decider } {
  const seat = (p: T) => table.players.indexOf(p);
  const ranked = [...table.players].sort((a, b) => {
    const x = standing(a);
    const y = standing(b);
    return y.points - x.points || y.hull - x.hull || y.fuel - x.fuel || seat(a) - seat(b);
  });
  const [first, second] = ranked.map(standing);
  const decidedBy: Decider = !second
    ? "points"
    : first.points !== second.points
      ? "points"
      : first.hull !== second.hull
        ? "hull"
        : first.fuel !== second.fuel
          ? "fuel"
          : "seat";
  return { ranked, decidedBy };
}

/** Face-up cards: the missions a player has completed. Public information. */
export function completedMissions(player: Player): Mission[] {
  return player.missions.filter((m) => m.isCompleted);
}
