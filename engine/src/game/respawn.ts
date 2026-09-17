/**
 * Destruction and respawn.
 *
 * When a ship is destroyed it drops its cargo: crates return to their origin
 * station (they must be picked up again), data is lost, and a load of garbage
 * is simply gone — collect another at any station, which is the same thing. On the owner's next
 * turn the ship returns to their Home sector (nearest empty sector if it is
 * occupied) fully repaired and refuelled, and the turn ends; the next turn is
 * lost too (the ship is recovering: it takes no action, it only drifts with
 * its ring — see `executeTurn`). Face-up tiles stay face-up.
 */
import type { GameState, Player, Position, ShipState } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import { isDaringMission } from "../models/missions.ts";
import { SECTORS_PER_RING } from "../models/rings.ts";
import { wrapSector, samePosition } from "./geometry.ts";
import { createInitialShipState, isDestroyed } from "./ship.ts";

export function needsRespawn(player: Player): boolean {
  return player.hasDeployed && isDestroyed(player.ship);
}

/** Drop everything the ship carries. Returns the updated player and events. */
export function dropCargo(player: Player): { player: Player; events: EventDraft[] } {
  const crates = player.cargo.filter((c) => c.kind === "crate");
  const data = player.cargo.filter((c) => c.kind === "data");
  const cratesAboard = crates.filter((c) => c.isPickedUp).length;
  if (cratesAboard === 0 && data.length === 0) return { player, events: [] };

  // Only data still aboard is lost; data already handed in this turn stays delivered.
  const lostData = new Set(data.map((c) => c.missionId));
  const missions = player.missions.map((m) => {
    if (
      m.type === "intercept_transmission" &&
      !m.isCompleted &&
      m.scanAcquired &&
      lostData.has(m.id)
    )
      return { ...m, scanAcquired: false };
    // A daring chit goes down with the ship: the dive, the boarding or the
    // tour has to be made again.
    if (isDaringMission(m) && !m.isCompleted && m.acquired && lostData.has(m.id))
      return { ...m, acquired: false };
    return m;
  });

  return {
    player: {
      ...player,
      missions,
      cargo: crates.map((c) => ({ ...c, isPickedUp: false })),
    },
    events: [
      {
        type: "cargo_dropped",
        playerId: player.id,
        crates: cratesAboard,
        data: data.length,
      },
    ],
  };
}

/** Home sector if free, otherwise the nearest free sector on the home ring. */
export function findRespawnPosition(state: GameState, home: Position, selfId: string): Position {
  const occupied = (pos: Position) =>
    state.players.some(
      (p) => p.id !== selfId && p.hasDeployed && !isDestroyed(p.ship) && samePosition(p.ship, pos)
    );
  for (let offset = 0; offset <= SECTORS_PER_RING / 2; offset++) {
    for (const sign of offset === 0 ? [1] : [1, -1]) {
      const candidate = { ...home, sector: wrapSector(home.sector + sign * offset) };
      if (!occupied(candidate)) return candidate;
    }
  }
  return home;
}

export function createRespawnedShip(
  previous: ShipState,
  position: Position,
  hull: { hitPoints: number; maxHitPoints: number } = {
    hitPoints: previous.maxHitPoints,
    maxHitPoints: previous.maxHitPoints,
  }
): ShipState {
  const fresh = createInitialShipState({ ...position, facing: "prograde" }, previous.loadout, hull);
  const revealed = new Set(previous.subsystems.filter((s) => s.isRevealed).map((s) => s.id));
  return {
    ...fresh,
    subsystems: fresh.subsystems.map((s) => (revealed.has(s.id) ? { ...s, isRevealed: true } : s)),
  };
}

export function respawnPlayer(
  state: GameState,
  playerIndex: number
): { state: GameState; events: EventDraft[] } {
  const player = state.players[playerIndex];
  if (!player.home) return { state, events: [] };
  const position = findRespawnPosition(state, player.home, player.id);
  const players = [...state.players];
  players[playerIndex] = {
    ...player,
    ship: createRespawnedShip(player.ship, position),
    skipTurns: 1,
  };
  return {
    state: { ...state, players },
    events: [{ type: "respawned", playerId: player.id, position }],
  };
}
