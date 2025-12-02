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
import { TRANSFER_POINTS } from '../constants/gravityWells'
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

// Animation handlers that BoardContext will register
export interface AnimationHandlers {
  startAnimation: (
    beforeState: GameState,
    afterState: GameState,
    actions: PlayerAction[],
    onComplete: () => void
  ) => void
  syncDisplayState: (state: GameState) => void
  isAnimating: () => boolean
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
  // Animation handler registration (for BoardContext)
  registerAnimationHandlers: (handlers: AnimationHandlers) => void
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

const createInitialState = (): GameState => ({
  turn: 1,
  activePlayerIndex: 0,
  players: createInitialPlayers(),
  turnLog: [],
  missiles: [],
  status: 'active',
})

export function GameProvider({ children }: { children: ReactNode }) {
  const [gameState, setGameState] = useState<GameState>(createInitialState())
  const [turnErrors, setTurnErrors] = useState<string[]>([])
  const [turnHistory, setTurnHistory] = useState<TurnHistoryEntry[]>([])
  const [weaponRangeVisibility, setWeaponRangeVisibility] = useState<WeaponRangeVisibility>({
    laser: false,
    railgun: false,
    missiles: false,
  })
  const lastBotTurnKeyRef = useRef<string>('')

  // Animation handlers registered by BoardContext
  const animationHandlersRef = useRef<AnimationHandlers | null>(null)
  const gameStateRef = useRef<GameState>(gameState)
  gameStateRef.current = gameState

  const registerAnimationHandlers = useCallback((handlers: AnimationHandlers) => {
    animationHandlersRef.current = handlers
    // Initialize display state when handlers are registered
    handlers.syncDisplayState(gameStateRef.current)
  }, [])

  const activePlayer = gameState.players[gameState.activePlayerIndex]

  const clearTurnErrors = useCallback(() => {
    setTurnErrors([])
  }, [])

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
  useEffect(() => {
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
      tacticalSequence: [],
    })
  }, [gameState.activePlayerIndex, gameState.turn, activePlayer.ship])

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

    // Don't allow turn execution while animations are playing
    if (animationHandlersRef.current?.isAnimating()) {
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
        const transferPoint = TRANSFER_POINTS.find(
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

    const result = executeGameTurn(gameState, actions)
    if (result.errors && result.errors.length > 0) {
      setTurnErrors(result.errors)
      return
    }
    setTurnErrors([])

    const afterState = result.gameState

    // Record turn in history
    setTurnHistory(prevHistory => [
      ...prevHistory,
      {
        turn: currentTurn,
        playerId: activePlayer.id,
        playerName: activePlayer.name,
        actions,
      },
    ])

    // Start animation - gameState will be updated when animation completes
    if (animationHandlersRef.current) {
      animationHandlersRef.current.startAnimation(gameState, afterState, actions, () => {
        setGameState(afterState)
      })
    } else {
      // No animation handlers registered, just update state
      setGameState(afterState)
    }
  }, [activePlayer, pendingState, gameState])

  const toggleWeaponRange = useCallback((weaponType: 'laser' | 'railgun' | 'missiles') => {
    setWeaponRangeVisibility(prev => ({
      ...prev,
      [weaponType]: !prev[weaponType],
    }))
  }, [])

  // Auto-execute bot turns for non-human players
  useEffect(() => {
    const currentActivePlayer = gameState.players[gameState.activePlayerIndex]

    // Create a unique key for this turn to prevent duplicate execution
    const currentTurnKey = `${gameState.activePlayerIndex}-${gameState.turn}`

    // Check if animating
    const isAnimating = animationHandlersRef.current?.isAnimating() ?? false

    // Only execute bot turn if:
    // 1. Active player exists
    // 2. Active player is not player1 (the human)
    // 3. Active player's ship is still alive
    // 4. Animations are not playing
    // 5. Haven't already executed this specific player+turn combination
    if (
      currentActivePlayer &&
      currentActivePlayer.id !== 'player1' &&
      currentActivePlayer.ship.hitPoints > 0 &&
      !isAnimating &&
      lastBotTurnKeyRef.current !== currentTurnKey
    ) {
      // Mark this turn as executed IMMEDIATELY to prevent duplicate effect runs
      // from scheduling multiple timeouts
      lastBotTurnKeyRef.current = currentTurnKey

      // Small delay to show state transition
      const timer = setTimeout(() => {
        try {
          const botDecision = botDecideActions(gameState, currentActivePlayer.id)

          const currentTurn = gameState.turn

          const result = executeGameTurn(gameState, botDecision.actions)
          if (result.errors && result.errors.length > 0) {
            console.error(`[Bot ${currentActivePlayer.id}] Turn errors:`, result.errors)
            setTurnErrors(result.errors)
            // Reset on error so it can be retried
            lastBotTurnKeyRef.current = ''
            return
          }
          setTurnErrors([])

          const afterState = result.gameState

          // Record turn in history
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

          // Start animation - gameState will be updated when animation completes
          if (animationHandlersRef.current) {
            animationHandlersRef.current.startAnimation(gameState, afterState, botDecision.actions, () => {
              setGameState(afterState)
            })
          } else {
            setGameState(afterState)
          }
        } catch (error) {
          console.error(`[Bot ${currentActivePlayer.id}] Failed to execute turn:`, error)
          lastBotTurnKeyRef.current = '' // Reset on error
        }
      }, 400)

      return () => clearTimeout(timer)
    }
  }, [gameState])

  // Restart game - reset to initial state
  const restartGame = useCallback(() => {
    const newGameState = createInitialState()
    setGameState(newGameState)

    // Sync display state if handlers are registered
    if (animationHandlersRef.current) {
      animationHandlersRef.current.syncDisplayState(newGameState)
    }

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
    lastBotTurnKeyRef.current = ''
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
        registerAnimationHandlers,
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
