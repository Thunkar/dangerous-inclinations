import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type {
  GameState,
  Player,
  PlayerAction,
  Facing,
  BurnIntensity,
  TurnHistoryEntry,
  ActionType,
} from '../types/game'
import type { Subsystem, SubsystemType, ReactorState, HeatState } from '../types/subsystems'
import { getSubsystemConfig } from '../types/subsystems'
import { STARTING_REACTION_MASS } from '../constants/rings'
import { ALL_GRAVITY_WELLS } from '../constants/gravityWells'
import { calculateTransferPoints } from '../utils/transferPoints'
import {
  createInitialSubsystems,
  createInitialReactorState,
  createInitialHeatState,
} from '../utils/subsystemHelpers'
import { executeTurn as executeGameTurn } from '../game-logic/turns'
import { botDecideActions } from '../ai'

interface WeaponRangeVisibility {
  laser: boolean
  railgun: boolean
  missiles: boolean
}

interface MovementPreview {
  actionType: ActionType
  burnIntensity?: BurnIntensity
  sectorAdjustment: number
  activateScoop: boolean
}

export type TacticalActionType =
  | 'rotate'
  | 'move'
  | 'fire_laser'
  | 'fire_railgun'
  | 'fire_missiles'
  | 'well_transfer'

export interface TacticalAction {
  id: string // unique identifier for this action instance
  type: TacticalActionType
  sequence: number
  targetPlayerId?: string // For weapon actions
  destinationWellId?: string // For well transfer actions
}

interface PendingState {
  subsystems: Subsystem[]
  reactor: ReactorState
  heat: HeatState
  facing: Facing
  movement: MovementPreview
  tacticalSequence: TacticalAction[] // Ordered list of tactical actions
}

interface GameContextType {
  gameState: GameState
  pendingState: PendingState
  turnErrors: string[]
  turnHistory: TurnHistoryEntry[]
  clearTurnErrors: () => void
  // High-level game actions
  allocateEnergy: (subsystemType: SubsystemType, newTotal: number) => void
  deallocateEnergy: (subsystemType: SubsystemType, amount: number) => void
  ventHeat: (newTotal: number) => void
  setFacing: (facing: Facing) => void
  setMovement: (movement: MovementPreview) => void
  setTacticalSequence: (sequence: TacticalAction[]) => void
  executeTurn: () => void
  restartGame: () => void
  weaponRangeVisibility: WeaponRangeVisibility
  toggleWeaponRange: (weaponType: 'laser' | 'railgun' | 'missiles') => void
}

const GameContext = createContext<GameContextType | undefined>(undefined)

const createInitialPlayers = (): Player[] => [
  {
    id: 'player1',
    name: 'Ship Alpha',
    color: '#2196f3',
    ship: {
      wellId: 'blackhole', // Start in black hole gravity well
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
      missileInventory: 4, // Start with 4 missiles
    },
  },
  {
    id: 'player3',
    name: 'Ship Gamma',
    color: '#4caf50',
    ship: {
      wellId: 'blackhole', // Start in black hole gravity well
      ring: 2,
      sector: 5,
      facing: 'prograde',
      reactionMass: STARTING_REACTION_MASS,
      hitPoints: 10,
      maxHitPoints: 10,
      transferState: null,
      subsystems: createInitialSubsystems(),
      reactor: createInitialReactorState(),
      heat: createInitialHeatState(),
      missileInventory: 4, // Start with 4 missiles
    },
  },
]

const createInitialState = (): GameState => {
  const gravityWells = ALL_GRAVITY_WELLS
  const transferPoints = calculateTransferPoints(gravityWells)

  return {
    turn: 1,
    activePlayerIndex: 0,
    players: createInitialPlayers(),
    turnLog: [],
    gravityWells,
    transferPoints,
    missiles: [], // No missiles in flight initially
    status: 'active',
  }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [gameState, setGameState] = useState<GameState>(createInitialState())
  const [turnErrors, setTurnErrors] = useState<string[]>([])
  const [turnHistory, setTurnHistory] = useState<TurnHistoryEntry[]>([])
  const [weaponRangeVisibility, setWeaponRangeVisibility] = useState<WeaponRangeVisibility>({
    laser: false,
    railgun: false,
    missiles: false,
  })

  const activePlayer = gameState.players[gameState.activePlayerIndex]

  const clearTurnErrors = useCallback(() => {
    setTurnErrors([])
  }, [])

  // Track previous values to detect actual changes (not just initial mount)
  const prevPlayerIdRef = useRef<string>(activePlayer.id)
  const prevTurnRef = useRef<number>(gameState.turn)

  // Initialize pending state from current committed state
  const [pendingState, setPendingStateInternal] = useState<PendingState>(() => ({
    subsystems: activePlayer.ship.subsystems.map(s => ({ ...s })),
    reactor: { ...activePlayer.ship.reactor },
    heat: { ...activePlayer.ship.heat },
    facing: activePlayer.ship.facing,
    movement: {
      actionType: 'coast',
      sectorAdjustment: 0,
      activateScoop: false,
    },
    tacticalSequence: [],
  }))

  // Reset pending state when active player changes or turn completes
  // But NOT on initial mount (when refs match current values)
  useEffect(() => {
    const playerChanged = prevPlayerIdRef.current !== activePlayer.id
    const turnChanged = prevTurnRef.current !== gameState.turn

    if (playerChanged || turnChanged) {
      setPendingStateInternal({
        subsystems: activePlayer.ship.subsystems.map(s => ({ ...s })),
        reactor: { ...activePlayer.ship.reactor },
        heat: { ...activePlayer.ship.heat },
        facing: activePlayer.ship.facing,
        movement: {
          actionType: 'coast',
          sectorAdjustment: 0,
          activateScoop: false,
        },
        tacticalSequence: [], // Clear on actual player/turn change
      })
    }

    // Update refs for next comparison
    prevPlayerIdRef.current = activePlayer.id
    prevTurnRef.current = gameState.turn
  }, [activePlayer.id, gameState.turn, activePlayer.ship])

  // Helper to calculate energy to return based on deallocations
  const calculateEnergyToReturn = useCallback(
    (newSubsystems: Subsystem[]) => {
      let totalDeallocated = 0
      activePlayer.ship.subsystems.forEach((committedSub, index) => {
        const pendingSub = newSubsystems[index]
        const diff = committedSub.allocatedEnergy - pendingSub.allocatedEnergy
        if (diff > 0) {
          totalDeallocated += diff
        }
      })
      return totalDeallocated
    },
    [activePlayer.ship.subsystems]
  )

  // High-level game action: Allocate energy to a subsystem
  const allocateEnergy = useCallback(
    (subsystemType: SubsystemType, newTotal: number) => {
      const subsystemIndex = pendingState.subsystems.findIndex(s => s.type === subsystemType)
      if (subsystemIndex === -1) return

      const subsystem = pendingState.subsystems[subsystemIndex]
      const currentEnergy = subsystem.allocatedEnergy
      const diff = newTotal - currentEnergy

      // Check if newTotal exceeds absolute maximum
      const config = getSubsystemConfig(subsystemType)
      if (newTotal > config.maxEnergy) {
        return // Cannot allocate beyond absolute maximum capacity
      }

      if (diff > 0 && pendingState.reactor.availableEnergy >= diff) {
        // Allocate energy
        const newSubsystems = [...pendingState.subsystems]
        newSubsystems[subsystemIndex] = {
          ...newSubsystems[subsystemIndex],
          allocatedEnergy: newTotal,
          isPowered: newTotal > 0,
        }
        setPendingStateInternal(prev => ({
          ...prev,
          subsystems: newSubsystems,
          reactor: {
            ...prev.reactor,
            availableEnergy: prev.reactor.availableEnergy - diff,
            energyToReturn: calculateEnergyToReturn(newSubsystems),
          },
        }))
      }
    },
    [pendingState, calculateEnergyToReturn]
  )

  // High-level game action: Deallocate energy from a subsystem
  const deallocateEnergy = useCallback(
    (subsystemType: SubsystemType, amount: number) => {
      const subsystemIndex = pendingState.subsystems.findIndex(s => s.type === subsystemType)
      if (subsystemIndex === -1) return

      const currentPendingEnergy = pendingState.subsystems[subsystemIndex].allocatedEnergy
      if (currentPendingEnergy === 0) return

      // Deallocate the specified amount (clamped to current allocation)
      const amountToReturn = Math.min(amount, currentPendingEnergy)
      const newAllocatedEnergy = currentPendingEnergy - amountToReturn

      const newSubsystems = [...pendingState.subsystems]
      newSubsystems[subsystemIndex] = {
        ...newSubsystems[subsystemIndex],
        allocatedEnergy: newAllocatedEnergy,
        isPowered: newAllocatedEnergy > 0,
      }

      const energyToReturn = calculateEnergyToReturn(newSubsystems)

      // Check if we exceed the maxReturnRate with current heat venting
      if (energyToReturn + pendingState.heat.heatToVent > pendingState.reactor.maxReturnRate) {
        // Can't deallocate - would exceed limit
        return
      }

      setPendingStateInternal(prev => ({
        ...prev,
        subsystems: newSubsystems,
        reactor: {
          ...prev.reactor,
          availableEnergy: prev.reactor.availableEnergy + amountToReturn,
          energyToReturn,
        },
      }))
    },
    [pendingState, calculateEnergyToReturn]
  )

  // High-level game action: Vent heat
  const ventHeat = useCallback(
    (newTotal: number) => {
      // Check if we exceed the maxReturnRate with current deallocations
      if (pendingState.reactor.energyToReturn + newTotal > pendingState.reactor.maxReturnRate) {
        // Can't vent this much heat - would exceed limit
        return
      }

      setPendingStateInternal(prev => ({
        ...prev,
        heat: {
          ...prev.heat,
          heatToVent: newTotal,
        },
      }))
    },
    [pendingState.reactor.energyToReturn, pendingState.reactor.maxReturnRate]
  )

  // High-level game action: Set facing
  const setFacing = useCallback((facing: Facing) => {
    setPendingStateInternal(prev => ({ ...prev, facing }))
  }, [])

  // High-level game action: Set movement preview
  const setMovement = useCallback((movement: MovementPreview) => {
    setPendingStateInternal(prev => ({ ...prev, movement }))
  }, [])

  // High-level game action: Set tactical sequence
  const setTacticalSequence = useCallback((sequence: TacticalAction[]) => {
    setPendingStateInternal(prev => ({ ...prev, tacticalSequence: sequence }))
  }, [])

  // Execute turn: compute diff between committed and pending, create actions using tactical sequence
  const executeTurn = useCallback(() => {
    // Don't execute turns if game is over
    if (gameState.status !== 'active') {
      return
    }

    const actions: PlayerAction[] = []

    // 1. Compute energy allocation/deallocation actions (no sequence - always first)
    const committedSubsystems = activePlayer.ship.subsystems
    const pendingSubsystems = pendingState.subsystems

    committedSubsystems.forEach((committedSub, index) => {
      const pendingSub = pendingSubsystems[index]
      const diff = pendingSub.allocatedEnergy - committedSub.allocatedEnergy

      if (diff > 0) {
        // Allocate energy
        actions.push({
          playerId: activePlayer.id,
          type: 'allocate_energy',
          data: {
            subsystemType: committedSub.type,
            amount: diff,
          },
        })
      } else if (diff < 0) {
        // Deallocate energy (by the amount reduced)
        actions.push({
          playerId: activePlayer.id,
          type: 'deallocate_energy',
          data: {
            subsystemType: committedSub.type,
            amount: Math.abs(diff),
          },
        })
      }
    })

    // 2. Compute heat venting action (no sequence - always first)
    const committedVenting = activePlayer.ship.heat.heatToVent || 0
    const pendingVenting = pendingState.heat.heatToVent || 0
    const ventingDiff = pendingVenting - committedVenting

    if (ventingDiff > 0) {
      actions.push({
        playerId: activePlayer.id,
        type: 'vent_heat',
        data: {
          amount: ventingDiff,
        },
      })
    }

    // 3. Add tactical actions from the tactical sequence (with sequence numbers)
    pendingState.tacticalSequence.forEach(tacticalAction => {
      if (tacticalAction.type === 'rotate') {
        // Only add rotate action if facing actually changed
        if (pendingState.facing !== activePlayer.ship.facing) {
          actions.push({
            playerId: activePlayer.id,
            type: 'rotate',
            sequence: tacticalAction.sequence,
            data: {
              targetFacing: pendingState.facing,
            },
          })
        }
      } else if (tacticalAction.type === 'move') {
        if (pendingState.movement.actionType === 'burn') {
          actions.push({
            playerId: activePlayer.id,
            type: 'burn',
            sequence: tacticalAction.sequence,
            data: {
              burnIntensity: pendingState.movement.burnIntensity || 'soft',
              sectorAdjustment: pendingState.movement.sectorAdjustment,
            },
          })
        } else {
          actions.push({
            playerId: activePlayer.id,
            type: 'coast',
            sequence: tacticalAction.sequence,
            data: {
              activateScoop: pendingState.movement.activateScoop,
            },
          })
        }
      } else if (tacticalAction.type === 'fire_laser' && tacticalAction.targetPlayerId) {
        actions.push({
          playerId: activePlayer.id,
          type: 'fire_weapon',
          sequence: tacticalAction.sequence,
          data: {
            weaponType: 'laser',
            targetPlayerIds: [tacticalAction.targetPlayerId],
          },
        })
      } else if (tacticalAction.type === 'fire_railgun' && tacticalAction.targetPlayerId) {
        actions.push({
          playerId: activePlayer.id,
          type: 'fire_weapon',
          sequence: tacticalAction.sequence,
          data: {
            weaponType: 'railgun',
            targetPlayerIds: [tacticalAction.targetPlayerId],
          },
        })
      } else if (tacticalAction.type === 'fire_missiles' && tacticalAction.targetPlayerId) {
        actions.push({
          playerId: activePlayer.id,
          type: 'fire_weapon',
          sequence: tacticalAction.sequence,
          data: {
            weaponType: 'missiles',
            targetPlayerIds: [tacticalAction.targetPlayerId],
          },
        })
      } else if (tacticalAction.type === 'well_transfer' && tacticalAction.destinationWellId) {
        const transferPoint = gameState.transferPoints.find(
          tp =>
            tp.fromWellId === activePlayer.ship.wellId &&
            tp.toWellId === tacticalAction.destinationWellId
        )
        if (transferPoint) {
          actions.push({
            playerId: activePlayer.id,
            type: 'well_transfer',
            sequence: tacticalAction.sequence,
            data: {
              destinationWellId: tacticalAction.destinationWellId,
              // destinationSector is automatically determined from transfer points
            },
          })
        }
      }
    })

    // 4. Execute turn with all actions
    const currentTurn = gameState.turn
    setGameState(prev => {
      const result = executeGameTurn(prev, actions)
      if (result.errors && result.errors.length > 0) {
        setTurnErrors(result.errors)
        return prev
      }
      setTurnErrors([])
      return result.gameState
    })

    // Record turn in history (human player) - do this outside setGameState callback
    setTurnHistory(prevHistory => [
      ...prevHistory,
      {
        turn: currentTurn,
        playerId: activePlayer.id,
        playerName: activePlayer.name,
        actions,
      },
    ])
  }, [activePlayer, pendingState, gameState.turn])

  const toggleWeaponRange = useCallback((weaponType: 'laser' | 'railgun' | 'missiles') => {
    setWeaponRangeVisibility(prev => ({
      ...prev,
      [weaponType]: !prev[weaponType],
    }))
  }, [])

  // Auto-execute bot turns for non-human players
  useEffect(() => {
    const currentActivePlayer = gameState.players[gameState.activePlayerIndex]

    // Only execute bot turn if:
    // 1. Active player exists
    // 2. Active player is not player1 (the human)
    // 3. Active player's ship is still alive
    if (
      currentActivePlayer &&
      currentActivePlayer.id !== 'player1' &&
      currentActivePlayer.ship.hitPoints > 0
    ) {
      // Small delay to show state transition to user
      const timer = setTimeout(() => {
        try {
          const botDecision = botDecideActions(gameState, currentActivePlayer.id)

          // Log bot's thinking process
          console.log(`[Bot ${currentActivePlayer.id}] Decision:`, botDecision.log)

          const currentTurn = gameState.turn
          setGameState(prev => {
            const result = executeGameTurn(prev, botDecision.actions)
            if (result.errors && result.errors.length > 0) {
              console.error(`[Bot ${currentActivePlayer.id}] Turn errors:`, result.errors)
              setTurnErrors(result.errors)
              return prev // Don't advance if bot turn had errors
            }
            setTurnErrors([])
            return result.gameState
          })

          // Record turn in history (bot player with decision log) - do this outside setGameState callback
          setTurnHistory(prevHistory => [
            ...prevHistory,
            {
              turn: currentTurn,
              playerId: currentActivePlayer.id,
              playerName: currentActivePlayer.name,
              actions: botDecision.actions,
              botDecision: botDecision.log,
            },
          ])
        } catch (error) {
          console.error(`[Bot ${currentActivePlayer.id}] Failed to execute turn:`, error)
        }
      }, 800) // 800ms delay for visibility

      return () => clearTimeout(timer)
    }
  }, [gameState.activePlayerIndex, gameState.turn, gameState])

  // Restart game - reset to initial state
  const restartGame = useCallback(() => {
    const newGameState = createInitialState()
    setGameState(newGameState)

    // Reset pending state to match the new initial player
    const newActivePlayer = newGameState.players[0]
    setPendingStateInternal({
      subsystems: newActivePlayer.ship.subsystems.map(s => ({ ...s })),
      reactor: { ...newActivePlayer.ship.reactor },
      heat: { ...newActivePlayer.ship.heat },
      facing: newActivePlayer.ship.facing,
      movement: {
        actionType: 'coast',
        sectorAdjustment: 0,
        activateScoop: false,
      },
      tacticalSequence: [],
    })

    setTurnErrors([])
    setTurnHistory([])
  }, [])

  return (
    <GameContext.Provider
      value={{
        gameState,
        pendingState,
        turnErrors,
        turnHistory,
        clearTurnErrors,
        allocateEnergy,
        deallocateEnergy,
        ventHeat,
        setFacing,
        setMovement,
        setTacticalSequence,
        executeTurn,
        restartGame,
        weaponRangeVisibility,
        toggleWeaponRange,
      }}
    >
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
