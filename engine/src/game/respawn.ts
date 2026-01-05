/**
 * Respawn System for Dangerous Inclinations
 *
 * When a ship is destroyed, it respawns at the start of its next turn.
 * Respawn location: BH Ring 4, random available sector.
 * Ship retains: cargo (for missions)
 * Ship resets: HP, subsystems, heat, reaction mass
 */

import type { GameState, Player, ShipState, ShipLoadout } from "../models/game";
import { DEFAULT_LOADOUT } from "../models/game";
import { createInitialShipState } from "../utils/subsystemHelpers";
import type { Cargo } from "../models/missions";

/**
 * Respawn constants
 */
export const RESPAWN_CONSTANTS = {
  WELL_ID: "blackhole",
  RING: 4,
  SECTORS: 24, // BH Ring 4 has 24 sectors
} as const;

/**
 * Find an available sector for respawn
 * Avoids sectors occupied by other ships
 */
export function findAvailableRespawnSector(gameState: GameState): number {
  // Get all occupied sectors on BH Ring 4
  const occupiedSectors = new Set<number>();

  for (const player of gameState.players) {
    if (
      player.ship.wellId === RESPAWN_CONSTANTS.WELL_ID &&
      player.ship.ring === RESPAWN_CONSTANTS.RING &&
      player.ship.hitPoints > 0 // Only count alive ships
    ) {
      occupiedSectors.add(player.ship.sector);
    }
  }

  // Find all available sectors
  const availableSectors: number[] = [];
  for (let i = 0; i < RESPAWN_CONSTANTS.SECTORS; i++) {
    if (!occupiedSectors.has(i)) {
      availableSectors.push(i);
    }
  }

  // If no sectors available (very unlikely with 24 sectors and max 6 players), use sector 0
  if (availableSectors.length === 0) {
    return 0;
  }

  // Return a random available sector
  return availableSectors[Math.floor(Math.random() * availableSectors.length)];
}

/**
 * Create a respawned ship state
 * Keeps cargo intact and loadout, resets everything else
 */
export function createRespawnedShip(
  sector: number,
  _cargoToPreserve: Cargo[], // Cargo is preserved on player, not ship
  loadout: ShipLoadout = DEFAULT_LOADOUT
): ShipState {
  return createInitialShipState(
    {
      wellId: RESPAWN_CONSTANTS.WELL_ID,
      ring: RESPAWN_CONSTANTS.RING,
      sector,
      facing: "prograde",
    },
    loadout
  );
}

/**
 * Check if a player needs to respawn
 */
export function needsRespawn(player: Player): boolean {
  return player.ship.hitPoints <= 0;
}

/**
 * Respawn a player's ship
 * Returns updated player with new ship at respawn location
 * Ship keeps its loadout from before destruction
 */
export function respawnPlayer(player: Player, gameState: GameState): Player {
  const respawnSector = findAvailableRespawnSector(gameState);
  // Preserve the player's loadout when respawning
  const loadout = player.ship.loadout ?? DEFAULT_LOADOUT;
  const newShip = createRespawnedShip(respawnSector, player.cargo, loadout);

  return {
    ...player,
    ship: newShip,
    // Cargo is preserved - player keeps their mission cargo
  };
}

/**
 * Process respawns for all dead players
 * Called at the start of a player's turn if they are dead
 */
export function processRespawn(
  gameState: GameState,
  playerId: string
): GameState {
  const playerIndex = gameState.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) return gameState;

  const player = gameState.players[playerIndex];
  if (!needsRespawn(player)) return gameState;

  const respawnedPlayer = respawnPlayer(player, gameState);

  const updatedPlayers = [...gameState.players];
  updatedPlayers[playerIndex] = respawnedPlayer;

  return { ...gameState, players: updatedPlayers };
}

/**
 * Check how many times a player has been destroyed (for stats/UI)
 * This would need to be tracked separately if we want to show it
 */
export interface RespawnInfo {
  playerId: string;
  respawnSector: number;
  previousPosition: {
    wellId: string;
    ring: number;
    sector: number;
  };
}

/**
 * Get respawn info for logging purposes
 */
export function getRespawnInfo(player: Player, newSector: number): RespawnInfo {
  return {
    playerId: player.id,
    respawnSector: newSector,
    previousPosition: {
      wellId: player.ship.wellId,
      ring: player.ship.ring,
      sector: player.ship.sector,
    },
  };
}
