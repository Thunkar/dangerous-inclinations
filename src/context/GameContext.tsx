import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { GameState, Player, PlayerAction } from '../types/game'
import type { SubsystemType } from '../types/subsystems'
import { STARTING_REACTION_MASS } from '../constants/rings'
import { resolvePlayerTurn, resolveTransferOnly } from '../utils/turnResolution'
import {
  createInitialSubsystems,
  createInitialReactorState,
  createInitialHeatState,
  allocateEnergy,
  updateSubsystem,
  requestEnergyReturn,
  getSubsystem,
} from '../utils/subsystemHelpers'
import { canSubsystemFunction } from '../types/subsystems'

interface GameContextType {
  gameState: GameState
  setPendingAction: (action: PlayerAction) => void
  executeTurn: () => void
  allocateSubsystemEnergy: (subsystemType: SubsystemType, amount: number) => void
  deallocateSubsystemEnergy: (subsystemType: SubsystemType, amount: number) => void
  requestHeatVent: (amount: number) => void
}

const GameContext = createContext<GameContextType | undefined>(undefined)

const createInitialPlayers = (): Player[] => [
  {
    id: 'player1',
    name: 'Ship Alpha',
    color: '#2196f3',
    ship: {
      ring: 4,
      sector: 0,
      facing: 'prograde',
      reactionMass: STARTING_REACTION_MASS,
      hitPoints: 10,
      maxHitPoints: 10,
      transferState: null,
      subsystems: createInitialSubsystems(),
      reactor: createInitialReactorState(),
      heat: createInitialHeatState(),
    },
    pendingAction: null,
  },
  {
    id: 'player2',
    name: 'Ship Beta',
    color: '#f44336',
    ship: {
      ring: 5,
      sector: 48, // Ring 5 has 96 sectors (halfway around)
      facing: 'prograde',
      reactionMass: STARTING_REACTION_MASS,
      hitPoints: 10,
      maxHitPoints: 10,
      transferState: null,
      subsystems: createInitialSubsystems(),
      reactor: createInitialReactorState(),
      heat: createInitialHeatState(),
    },
    pendingAction: null,
  },
  {
    id: 'player3',
    name: 'Ship Gamma',
    color: '#4caf50',
    ship: {
      ring: 2,
      sector: 5, // Ring 2 has 12 sectors (halfway around)
      facing: 'prograde',
      reactionMass: STARTING_REACTION_MASS,
      hitPoints: 10,
      maxHitPoints: 10,
      transferState: null,
      subsystems: createInitialSubsystems(),
      reactor: createInitialReactorState(),
      heat: createInitialHeatState(),
    },
    pendingAction: null,
  },
]

const createInitialState = (): GameState => ({
  turn: 1,
  activePlayerIndex: 0,
  players: createInitialPlayers(),
  turnLog: [],
})

export function GameProvider({ children }: { children: ReactNode }) {
  const [gameState, setGameState] = useState<GameState>(createInitialState())

  const setPendingAction = useCallback((action: PlayerAction) => {
    setGameState(prev => {
      const newPlayers = [...prev.players]
      newPlayers[prev.activePlayerIndex] = {
        ...newPlayers[prev.activePlayerIndex],
        pendingAction: action,
      }
      return { ...prev, players: newPlayers }
    })
  }, [])

  const executeTurn = useCallback(() => {
    setGameState(prev => {
      // Execute the active player's turn
      let activePlayer = prev.players[prev.activePlayerIndex]

      // Only commit pending energy allocations if there's a pending action
      // If no action, discard the pending allocations (they were just planning)
      if (activePlayer.pendingAction) {
        // Commit pending energy allocations and heat venting
        if (activePlayer.ship.pendingSubsystems && activePlayer.ship.pendingReactor) {
          activePlayer = {
            ...activePlayer,
            ship: {
              ...activePlayer.ship,
              subsystems: activePlayer.ship.pendingSubsystems,
              reactor: activePlayer.ship.pendingReactor,
              heat: activePlayer.ship.pendingHeat || activePlayer.ship.heat,
              pendingSubsystems: undefined,
              pendingReactor: undefined,
              pendingHeat: undefined,
            },
          }
        } else if (activePlayer.ship.pendingHeat) {
          // Commit pending heat even if no energy changes
          activePlayer = {
            ...activePlayer,
            ship: {
              ...activePlayer.ship,
              heat: activePlayer.ship.pendingHeat,
              pendingHeat: undefined,
            },
          }
        }
      } else {
        // No action - clear any pending allocations without committing them
        activePlayer = {
          ...activePlayer,
          ship: {
            ...activePlayer.ship,
            pendingSubsystems: undefined,
            pendingReactor: undefined,
            pendingHeat: undefined,
          },
        }
      }

      const { updatedPlayer, logEntries } = resolvePlayerTurn(activePlayer, prev.turn)

      const newPlayers = [...prev.players]
      newPlayers[prev.activePlayerIndex] = updatedPlayer

      let newLog = [...prev.turnLog, ...logEntries]

      // Move to next player
      const nextPlayerIndex = (prev.activePlayerIndex + 1) % prev.players.length
      const isNewTurn = nextPlayerIndex === 0

      // Check if the NEXT active player has a pending transfer that needs to resolve
      // This will make the ship appear at its destination when their turn starts
      let finalPlayers = newPlayers
      const nextPlayer = newPlayers[nextPlayerIndex]

      if (nextPlayer.ship.transferState) {
        // Resolve only the transfer/movement without processing energy/heat systems
        const { updatedShip, logEntries: transferLogs } = resolveTransferOnly(
          nextPlayer.ship,
          nextPlayer.id,
          nextPlayer.name,
          isNewTurn ? prev.turn + 1 : prev.turn
        )

        finalPlayers = [...newPlayers]
        finalPlayers[nextPlayerIndex] = {
          ...nextPlayer,
          ship: updatedShip,
        }
        newLog = [...newLog, ...transferLogs]
      }

      // Apply heat damage to the current player at the end of their turn
      const currentPlayer = finalPlayers[prev.activePlayerIndex]

      if (currentPlayer.ship.heat.currentHeat > 0) {
        const heatDamage = currentPlayer.ship.heat.currentHeat
        const newHitPoints = Math.max(0, currentPlayer.ship.hitPoints - heatDamage)

        newLog.push({
          turn: prev.turn,
          playerId: currentPlayer.id,
          playerName: currentPlayer.name,
          action: 'Heat Damage',
          result: `Took ${heatDamage} hull damage from heat (${newHitPoints}/${currentPlayer.ship.maxHitPoints} HP)`,
        })

        finalPlayers[prev.activePlayerIndex] = {
          ...currentPlayer,
          ship: {
            ...currentPlayer.ship,
            hitPoints: newHitPoints,
          },
        }
      }

      return {
        ...prev,
        turn: isNewTurn ? prev.turn + 1 : prev.turn,
        activePlayerIndex: nextPlayerIndex,
        players: finalPlayers,
        turnLog: newLog,
      }
    })
  }, [])

  const allocateSubsystemEnergy = useCallback((subsystemType: SubsystemType, amount: number) => {
    setGameState(prev => {
      const activePlayer = prev.players[prev.activePlayerIndex]

      // Work with pending allocations, or current if no pending exists
      const currentSubsystems = activePlayer.ship.pendingSubsystems || activePlayer.ship.subsystems
      const currentReactor = activePlayer.ship.pendingReactor || activePlayer.ship.reactor

      const { subsystems, reactor } = allocateEnergy(
        currentSubsystems,
        currentReactor,
        subsystemType,
        amount
      )

      const newPlayers = [...prev.players]
      newPlayers[prev.activePlayerIndex] = {
        ...activePlayer,
        ship: {
          ...activePlayer.ship,
          pendingSubsystems: subsystems,
          pendingReactor: reactor,
        },
      }

      return { ...prev, players: newPlayers }
    })
  }, [])

  const deallocateSubsystemEnergy = useCallback((subsystemType: SubsystemType, amount: number) => {
    setGameState(prev => {
      const activePlayer = prev.players[prev.activePlayerIndex]

      // Get the committed (base) subsystem state
      const committedSubsystem = getSubsystem(activePlayer.ship.subsystems, subsystemType)
      if (!committedSubsystem) {
        return prev
      }

      // Work with pending allocations, or current if no pending exists
      const currentSubsystems = activePlayer.ship.pendingSubsystems || activePlayer.ship.subsystems
      const currentReactor = activePlayer.ship.pendingReactor || activePlayer.ship.reactor

      const currentSubsystem = getSubsystem(currentSubsystems, subsystemType)
      if (!currentSubsystem) {
        return prev
      }

      const returnAmount = Math.min(amount, currentSubsystem.allocatedEnergy)

      // Calculate how much energy was allocated this turn (pending energy)
      const pendingEnergy = currentSubsystem.allocatedEnergy - committedSubsystem.allocatedEnergy

      // Determine how much can be instantly returned vs queued
      const instantReturn = Math.min(returnAmount, Math.max(0, pendingEnergy))
      const queuedReturn = returnAmount - instantReturn

      let subsystems = currentSubsystems
      let reactor = currentReactor

      // Handle instant return (energy allocated this turn)
      if (instantReturn > 0) {
        const updatedSubsystem = {
          ...currentSubsystem,
          allocatedEnergy: currentSubsystem.allocatedEnergy - instantReturn,
        }

        subsystems = updateSubsystem(subsystems, subsystemType, {
          allocatedEnergy: updatedSubsystem.allocatedEnergy,
          isPowered: canSubsystemFunction(updatedSubsystem),
        })

        reactor = {
          ...reactor,
          availableEnergy: reactor.availableEnergy + instantReturn,
        }
      }

      // Handle queued return (committed energy from previous turns)
      if (queuedReturn > 0) {
        const result = requestEnergyReturn(subsystems, reactor, subsystemType, queuedReturn)
        subsystems = result.subsystems
        reactor = result.reactor
      }

      const newPlayers = [...prev.players]
      newPlayers[prev.activePlayerIndex] = {
        ...activePlayer,
        ship: {
          ...activePlayer.ship,
          pendingSubsystems: subsystems,
          pendingReactor: reactor,
        },
      }

      return { ...prev, players: newPlayers }
    })
  }, [])

  const requestHeatVent = useCallback((amount: number) => {
    setGameState(prev => {
      const activePlayer = prev.players[prev.activePlayerIndex]

      // Work with pending heat, or current if no pending exists
      const currentHeat = activePlayer.ship.pendingHeat || activePlayer.ship.heat

      const newHeat = {
        ...currentHeat,
        heatToVent: Math.min(amount, currentHeat.currentHeat),
      }

      const newPlayers = [...prev.players]
      newPlayers[prev.activePlayerIndex] = {
        ...activePlayer,
        ship: {
          ...activePlayer.ship,
          pendingHeat: newHeat,
        },
      }

      return { ...prev, players: newPlayers }
    })
  }, [])

  return (
    <GameContext.Provider
      value={{
        gameState,
        setPendingAction,
        executeTurn,
        allocateSubsystemEnergy,
        deallocateSubsystemEnergy,
        requestHeatVent,
      }}
    >
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within GameProvider')
  }
  return context
}
