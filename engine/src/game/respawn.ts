/**
 * Destruction and respawn.
 *
 * When a ship is destroyed it drops its cargo: a Deliver crate returns to its
 * origin station (it must be picked up again), and data and Piracy loot are
 * lost, to be taken again. On the owner's next
 * turn the ship returns to their Home sector (nearest empty sector if it is
 * occupied) fully repaired and refuelled, drifts with its ring like anything
 * else in orbit, and the turn ends. It is `recovering` from then until the end
 * of the turn its owner plays next: nobody may fire at it, missile it or scan
 * it, and that turn is a first round of its own, so it powers subsystems,
 * rotates and moves but fires at nobody and scans nobody. Face-up tiles stay
 * face-up.
 *
 * One turn lost, not two: two lost turns at a known sector with no cubes on
 * the loadout was a free kill for a hunter waiting at Home, with no
 * counter-play. The turn back is a real turn; it is only a silent one, because
 * immunity and a free opening shot in the same turn read wrong at the table.
 */
import type { GameState, Player, Position, ShipState } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import { aboard } from "../models/missions.ts";
import { SECTORS_PER_RING } from "../models/rings.ts";
import { wrapSector, samePosition, positionOf } from "./geometry.ts";
import { applyOrbitalMovement } from "./movement.ts";
import { createInitialShipState, isDestroyed } from "./ship.ts";

export function needsRespawn(player: Player): boolean {
  return player.hasDeployed && isDestroyed(player.ship);
}

/**
 * Empty the hold of a destroyed ship. A Deliver crate aboard goes back to its
 * pickup station, to be loaded again; loot and data aboard are lost, so a
 * pirate seizes again, an Intercept scans again and a Survey dives again.
 * Only what is aboard is dropped and counted: a Deliver crate still waiting on
 * its dock stays there. Loot and data entries not aboard (taken by a pirate)
 * go with the rest, since nothing can bring them back but doing the job again.
 */
export function dropCargo(player: Player): { player: Player; events: EventDraft[] } {
  const held = aboard(player.cargo);
  const crates = held.filter((c) => c.kind === "crate").length;
  const data = held.filter((c) => c.kind === "data").length;
  // A Deliver crate is the only item with a dock of its own to go back to.
  const cargo = player.cargo
    .filter((c) => c.pickupPlanetId !== undefined)
    .map((c) => (c.isPickedUp ? { ...c, isPickedUp: false } : c));
  const unchanged =
    cargo.length === player.cargo.length && cargo.every((c, i) => c === player.cargo[i]);
  if (unchanged) return { player, events: [] };
  const events: EventDraft[] =
    crates + data > 0 ? [{ type: "cargo_dropped", playerId: player.id, crates, data }] : [];
  return { player: { ...player, cargo }, events };
}

/** Home sector if free, otherwise the nearest free sector on the Home marker's ring. */
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

export function createRespawnedShip(previous: ShipState, position: Position): ShipState {
  const fresh = createInitialShipState({ ...position, facing: "prograde" }, previous.loadout, {
    hitPoints: previous.maxHitPoints,
    maxHitPoints: previous.maxHitPoints,
  });
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
  const placed = findRespawnPosition(state, player.home, player.id);
  // The ship is in orbit the moment it is placed, so the respawn turn ends
  // with the ring carrying it exactly as a coast would. Home is on one of the
  // black hole's deployment rings and stations orbit a planet, so there is no
  // berth to hold and nothing for `advanceStations` to carry.
  const ship = applyOrbitalMovement(createRespawnedShip(player.ship, placed));
  const position = positionOf(ship);
  const players = [...state.players];
  players[playerIndex] = { ...player, ship, recovering: true };
  return {
    state: { ...state, players },
    events: [
      { type: "respawned", playerId: player.id, position },
      // The board moves the token on a `coasted` like any other drift; the
      // flag says the helm was empty, so the log does not claim a coast.
      {
        type: "coasted",
        playerId: player.id,
        to: position,
        scooped: false,
        heat: 0,
        recovering: true,
      },
    ],
  };
}
