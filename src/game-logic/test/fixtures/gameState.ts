import type { GameState, Player } from '../../../types/game'
import { STARTING_REACTION_MASS } from '../../../constants/rings'
import {
  createInitialSubsystems,
  createInitialReactorState,
  createInitialHeatState,
} from '../../../utils/subsystemHelpers'

// Initial state constants for easy reference in tests
export const INITIAL_RING = 3
export const INITIAL_SECTOR = 0
export const INITIAL_FACING = 'prograde' as const
export const INITIAL_REACTION_MASS = STARTING_REACTION_MASS
export const INITIAL_HIT_POINTS = 10
export const INITIAL_MAX_HIT_POINTS = 10
export const INITIAL_REACTOR_ENERGY = 10
export const INITIAL_HEAT = 0

export const PLAYER2_RING = 3
export const PLAYER2_SECTOR = 12

/**
 * Creates a standard test game state with two players
 * All players start with full resources and no active transfers
 */
export function createTestGameState(): GameState {
  const player1: Player = {
    id: 'player1',
    name: 'Alpha',
    color: '#ff0000',
    ship: {
      wellId: 'blackhole',
      ring: INITIAL_RING,
      sector: INITIAL_SECTOR,
      facing: INITIAL_FACING,
      reactionMass: INITIAL_REACTION_MASS,
      hitPoints: INITIAL_HIT_POINTS,
      maxHitPoints: INITIAL_MAX_HIT_POINTS,
      transferState: null,
      subsystems: createInitialSubsystems(),
      reactor: createInitialReactorState(),
      heat: createInitialHeatState(),
    },
  }

  const player2: Player = {
    id: 'player2',
    name: 'Beta',
    color: '#0000ff',
    ship: {
      wellId: 'blackhole',
      ring: PLAYER2_RING,
      sector: PLAYER2_SECTOR,
      facing: INITIAL_FACING,
      reactionMass: INITIAL_REACTION_MASS,
      hitPoints: INITIAL_HIT_POINTS,
      maxHitPoints: INITIAL_MAX_HIT_POINTS,
      transferState: null,
      subsystems: createInitialSubsystems(),
      reactor: createInitialReactorState(),
      heat: createInitialHeatState(),
    },
  }

  return {
    turn: 1,
    activePlayerIndex: 0,
    players: [player1, player2],
    turnLog: [],
    gravityWells: [],
    transferPoints: [],
  }
}
