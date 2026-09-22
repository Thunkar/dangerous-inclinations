/**
 * Scan action. Requires an unbroken sensor array and a target on the same
 * ring within SCAN_SECTOR_RANGE sectors. Reveals the
 * sensor, generates heat, lets the scanner look at one face-down slot of the
 * target (private knowledge) and acquires the transmission for any Intercept
 * mission on that target.
 *
 * The scan powers the sensor itself, like any other action. Switching one on
 * is for the critical range it gives every weapon aboard while it is up, which
 * is worth cubes on a turn with no scan in it (RULES §Energy and Heat).
 */
import type { GameState, Player, ScanAction } from "../models/game.ts";
import type { SubsystemId } from "../models/subsystems.ts";
import type { EventDraft } from "../models/events.ts";
import type { Cargo } from "../models/missions.ts";
import { isInterceptTransmissionMission } from "../models/missions.ts";
import { findSubsystem, useSubsystem } from "./ship.ts";

export interface ScanResult {
  state: GameState;
  events: EventDraft[];
}

export function findReadySensor(ship: GameState["players"][number]["ship"]) {
  return ship.subsystems.find(
    (s) => s.type === "sensor_array" && !s.isBroken && !s.usedThisTurn
  );
}

/**
 * The slot actually peeked: the requested one if the scanner doesn't know it
 * yet, otherwise the first face-down slot still unknown to them, otherwise
 * the requested one (everything is known; the scan still counts for Intercept).
 */
export function choosePeekSlot(
  scanner: Player,
  target: Player,
  requested: SubsystemId
): SubsystemId {
  const known = new Set(scanner.intel[target.id] ?? []);
  const isKnown = (id: SubsystemId) => {
    const s = findSubsystem(target.ship, id);
    return !s || s.isRevealed || known.has(id);
  };
  if (!isKnown(requested)) return requested;
  const next = target.ship.subsystems.find((s) => s.slotGroup !== undefined && !isKnown(s.id));
  return next?.id ?? requested;
}

export function processScan(state: GameState, action: ScanAction): ScanResult {
  const scannerIndex = state.players.findIndex((p) => p.id === action.playerId);
  const scanner = state.players[scannerIndex];
  const target = state.players.find((p) => p.id === action.data.targetPlayerId)!;
  const sensor = findReadySensor(scanner.ship)!;
  const events: EventDraft[] = [];
  const peekSlot = choosePeekSlot(scanner, target, action.data.peekSlot);

  const used = useSubsystem(scanner.ship, scanner.id, sensor.id, "scanned");
  events.push({
    type: "scanned",
    scannerId: scanner.id,
    targetId: target.id,
    peekedSlot: peekSlot,
    heat: used.heat,
  });
  events.push(...used.events);

  // Peek at one slot. Knowledge is private to the scanner.
  const peeked = findSubsystem(target.ship, peekSlot);
  const known = scanner.intel[target.id] ?? [];
  const intel = {
    ...scanner.intel,
    [target.id]: known.includes(peekSlot) ? known : [...known, peekSlot],
  };
  if (peeked) {
    events.push({
      type: "scan_result",
      scannerId: scanner.id,
      targetId: target.id,
      slot: peeked.id,
      subsystemType: peeked.type,
      privateTo: [scanner.id],
    });
  }

  // Intercept missions on this target acquire their transmission.
  let cargo = scanner.cargo;
  const missions = scanner.missions.map((mission) => {
    if (
      isInterceptTransmissionMission(mission) &&
      !mission.isCompleted &&
      !mission.scanAcquired &&
      mission.targetPlayerId === target.id
    ) {
      const data: Cargo = {
        id: mission.dataCargoId,
        missionId: mission.id,
        kind: "data",
        deliveryPlanetId: mission.deliveryPlanetId,
        isPickedUp: true,
      };
      // A chit a pirate took is still in the hold, un-picked: scanning again
      // puts the same chit back aboard rather than a second copy of it.
      cargo = cargo.some((c) => c.id === data.id)
        ? cargo.map((c) => (c.id === data.id ? data : c))
        : [...cargo, data];
      events.push({
        type: "data_acquired",
        playerId: scanner.id,
        kind: "scan",
        missionId: mission.id,
        privateTo: [scanner.id],
      });
      return { ...mission, scanAcquired: true };
    }
    return mission;
  });

  const players = [...state.players];
  players[scannerIndex] = { ...scanner, ship: used.ship, intel, missions, cargo };
  return { state: { ...state, players }, events };
}
