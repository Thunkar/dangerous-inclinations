import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type {
  GameState,
  PlayerAction,
  Facing,
  BurnIntensity,
  TurnHistoryEntry,
  ActionType,
  Subsystem,
  SubsystemType,
  ReactorState,
  HeatState,
  Player,
} from '@dangerous-inclinations/engine'
import {
  getSubsystemConfig,
  canSubsystemFunction,
  calculateProjectedHeat,
  TRANSFER_POINTS,
} from '@dangerous-inclinations/engine'
import { useWebSocket } from './WebSocketContext'

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
  criticalTarget?: SubsystemType // For weapon actions - subsystem to break on critical hit
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
  allocateEnergy: (subsystemIndex: number, newTotal: number) => void
  deallocateEnergy: (subsystemIndex: number, amount: number) => void
  setFacing: (facing: Facing) => void
  setMovement: (movement: MovementPreview) => void
  setTacticalSequence: (sequence: TacticalAction[]) => void
  executeTurn: () => void
  weaponRangeVisibility: WeaponRangeVisibility
  toggleWeaponRange: (weaponType: 'laser' | 'railgun' | 'missiles') => void
  // Animation handler registration (for BoardContext)
  registerAnimationHandlers: (handlers: AnimationHandlers) => void
  // Callback to notify parent when game ends or needs restart
  onGameStateChange: (newState: GameState) => void
}

const GameContext = createContext<GameContextType | undefined>(undefined)

interface GameProviderProps {
  children: ReactNode
  initialGameState: GameState
  gameId: string
  onGameStateChange: (newState: GameState) => void
}

export function GameProvider({
  children,
  initialGameState,
  gameId,
  onGameStateChange,
}: GameProviderProps) {
  const [gameState, setGameState] = useState<GameState>(initialGameState)
  const [turnErrors, setTurnErrors] = useState<string[]>([])
  const [turnHistory, setTurnHistory] = useState<TurnHistoryEntry[]>([])
  const [weaponRangeVisibility, setWeaponRangeVisibility] = useState<WeaponRangeVisibility>({
    laser: false,
    railgun: false,
    missiles: false,
  })

  // WebSocket client for server communication
  const { client, connect, isConnected } = useWebSocket()

  // Animation handlers registered by BoardContext
  const animationHandlersRef = useRef<AnimationHandlers | null>(null)
  const gameStateRef = useRef<GameState>(gameState)
  gameStateRef.current = gameState

  // Turn queue for sequential animation processing
  interface QueuedTurn {
    gameState: GameState
    actions: PlayerAction[]
    playerId: string
    turnNumber: number
  }
  const turnQueueRef = useRef<QueuedTurn[]>([])
  const isProcessingTurnRef = useRef(false)

  const registerAnimationHandlers = useCallback((handlers: AnimationHandlers) => {
    animationHandlersRef.current = handlers
    // Initialize display state when handlers are registered
    handlers.syncDisplayState(gameStateRef.current)
  }, [])

  // Active player is guaranteed to exist in active phase
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
    const currentActivePlayer = gameState.players[gameState.activePlayerIndex]
    if (!currentActivePlayer) return

    setPendingStateInternal({
      subsystems: currentActivePlayer.ship.subsystems.map(s => ({ ...s })),
      reactor: { ...currentActivePlayer.ship.reactor },
      heat: { ...currentActivePlayer.ship.heat },
      facing: currentActivePlayer.ship.facing,
      movement: {
        actionType: 'coast',
        sectorAdjustment: 0,
        activateScoop: false,
      },
      tacticalSequence: [],
    })
  }, [gameState.activePlayerIndex, gameState.turn])

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

  // Helper to calculate projected heat based on planned actions (pure function)
  const computeProjectedHeat = (
    subsystems: Subsystem[],
    sequence: TacticalAction[],
    movement: MovementPreview,
    facing: Facing,
    committedFacing: Facing
  ): number => {
    const subsystemsToUse: Array<
      'engines' | 'rotation' | 'scoop' | 'laser' | 'railgun' | 'missiles'
    > = []

    // Check if rotation is used (facing changed and rotation action in sequence)
    const hasRotation = sequence.some(a => a.type === 'rotate')
    if (hasRotation && facing !== committedFacing) {
      subsystemsToUse.push('rotation')
    }

    // Check movement type
    if (movement.actionType === 'burn') {
      subsystemsToUse.push('engines')
    } else if (movement.activateScoop) {
      subsystemsToUse.push('scoop')
    }

    // Check weapon firing
    for (const action of sequence) {
      if (action.type === 'fire_laser') {
        subsystemsToUse.push('laser')
      } else if (action.type === 'fire_railgun') {
        subsystemsToUse.push('railgun')
      } else if (action.type === 'fire_missiles') {
        subsystemsToUse.push('missiles')
      }
    }

    return calculateProjectedHeat(subsystems, subsystemsToUse)
  }

  // High-level game action: Allocate energy to a subsystem by index
  const allocateEnergy = useCallback(
    (subsystemIndex: number, newTotal: number) => {
      if (subsystemIndex < 0 || subsystemIndex >= pendingState.subsystems.length) return

      const subsystem = pendingState.subsystems[subsystemIndex]
      const currentEnergy = subsystem.allocatedEnergy
      const diff = newTotal - currentEnergy

      // Check if newTotal exceeds absolute maximum
      const config = getSubsystemConfig(subsystem.type)
      if (newTotal > config.maxEnergy) {
        return // Cannot allocate beyond absolute maximum capacity
      }

      if (diff > 0 && pendingState.reactor.availableEnergy >= diff) {
        // Allocate energy
        const newSubsystems = [...pendingState.subsystems]
        const updatedSubsystem = {
          ...newSubsystems[subsystemIndex],
          allocatedEnergy: newTotal,
        }
        newSubsystems[subsystemIndex] = {
          ...updatedSubsystem,
          isPowered: canSubsystemFunction(updatedSubsystem),
        }
        setPendingStateInternal(prev => ({
          ...prev,
          subsystems: newSubsystems,
          reactor: {
            ...prev.reactor,
            availableEnergy: prev.reactor.availableEnergy - diff,
            energyToReturn: calculateEnergyToReturn(newSubsystems),
          },
          heat: {
            currentHeat: computeProjectedHeat(
              newSubsystems,
              prev.tacticalSequence,
              prev.movement,
              prev.facing,
              activePlayer.ship.facing
            ),
          },
        }))
      }
    },
    [pendingState, calculateEnergyToReturn, activePlayer.ship.facing]
  )

  // High-level game action: Deallocate energy from a subsystem by index
  const deallocateEnergy = useCallback(
    (subsystemIndex: number, amount: number) => {
      if (subsystemIndex < 0 || subsystemIndex >= pendingState.subsystems.length) return

      const currentPendingEnergy = pendingState.subsystems[subsystemIndex].allocatedEnergy
      if (currentPendingEnergy === 0) return

      // Deallocate the specified amount (clamped to current allocation)
      const amountToReturn = Math.min(amount, currentPendingEnergy)
      const newAllocatedEnergy = currentPendingEnergy - amountToReturn

      const newSubsystems = [...pendingState.subsystems]
      const updatedSubsystem = {
        ...newSubsystems[subsystemIndex],
        allocatedEnergy: newAllocatedEnergy,
      }
      newSubsystems[subsystemIndex] = {
        ...updatedSubsystem,
        isPowered: canSubsystemFunction(updatedSubsystem),
      }

      // Deallocation is now unlimited - no rate limits
      setPendingStateInternal(prev => ({
        ...prev,
        subsystems: newSubsystems,
        reactor: {
          ...prev.reactor,
          availableEnergy: prev.reactor.availableEnergy + amountToReturn,
        },
        heat: {
          currentHeat: computeProjectedHeat(
            newSubsystems,
            prev.tacticalSequence,
            prev.movement,
            prev.facing,
            activePlayer.ship.facing
          ),
        },
      }))
    },
    [pendingState, activePlayer.ship.facing]
  )

  // High-level game action: Set facing
  const setFacing = useCallback((facing: Facing) => {
    setPendingStateInternal(prev => ({ ...prev, facing }))
  }, [])

  // High-level game action: Set movement preview
  const setMovement = useCallback(
    (movement: MovementPreview) => {
      setPendingStateInternal(prev => ({
        ...prev,
        movement,
        heat: {
          currentHeat: computeProjectedHeat(
            prev.subsystems,
            prev.tacticalSequence,
            movement,
            prev.facing,
            activePlayer.ship.facing
          ),
        },
      }))
    },
    [activePlayer.ship.facing]
  )

  // High-level game action: Set tactical sequence
  const setTacticalSequence = useCallback(
    (sequence: TacticalAction[]) => {
      setPendingStateInternal(prev => ({
        ...prev,
        tacticalSequence: sequence,
        heat: {
          currentHeat: computeProjectedHeat(
            prev.subsystems,
            sequence,
            prev.movement,
            prev.facing,
            activePlayer.ship.facing
          ),
        },
      }))
    },
    [activePlayer.ship.facing]
  )

  // Helper to update game state and notify parent
  const updateGameState = useCallback(
    (newState: GameState) => {
      setGameState(newState)
      onGameStateChange(newState)
    },
    [onGameStateChange]
  )

  // Execute turn: compute diff between committed and pending, create actions using tactical sequence
  // Then send to server via WebSocket
  const executeTurn = useCallback(() => {
    // Don't execute turns if game is over
    if (gameState.phase === 'ended') {
      return
    }

    // Don't allow turn execution while animations are playing
    if (animationHandlersRef.current?.isAnimating()) {
      return
    }

    // Check if game has missions/respawn enabled
    const hasMissions = gameState.phase === 'active' && gameState.stations.length > 0

    // Don't execute if active player is dead (unless respawn is enabled)
    if (activePlayer.ship.hitPoints <= 0 && !hasMissions) {
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

    // 2. Add tactical actions from the tactical sequence (with sequence numbers)
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
            criticalTarget: tacticalAction.criticalTarget || 'shields',
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
            criticalTarget: tacticalAction.criticalTarget || 'shields',
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
            criticalTarget: tacticalAction.criticalTarget || 'shields',
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
            },
          })
        }
      }
    })

    // Send turn to server via WebSocket
    // State update will happen when TURN_EXECUTED message arrives
    client?.send(
      'game',
      {
        type: 'SUBMIT_TURN',
        payload: {
          gameId,
          playerId: activePlayer.id,
          actions,
        },
      },
      gameId
    )

    // Clear turn errors optimistically
    setTurnErrors([])

    // Reset weapon range visibility
    setWeaponRangeVisibility({
      laser: false,
      railgun: false,
      missiles: false,
    })
  }, [activePlayer, pendingState, gameState, client, gameId])

  const toggleWeaponRange = useCallback((weaponType: 'laser' | 'railgun' | 'missiles') => {
    setWeaponRangeVisibility(prev => ({
      ...prev,
      [weaponType]: !prev[weaponType],
    }))
  }, [])

  // Ensure we're connected to the game room and listen for messages
  useEffect(() => {
    if (!client || !gameId) {
      return
    }

    // Connect to game room if not already connected
    const ensureConnection = async () => {
      if (!isConnected('game', gameId)) {
        try {
          await connect('game', gameId)
        } catch (error) {
          console.error('[GameContext] Failed to connect to game room:', error)
        }
      }
    }

    ensureConnection()

    // Process the next turn in the queue
    const processNextTurn = () => {
      if (turnQueueRef.current.length === 0) {
        isProcessingTurnRef.current = false
        return
      }

      isProcessingTurnRef.current = true
      const turn = turnQueueRef.current.shift()!
      const { gameState: newState, actions, playerId, turnNumber } = turn

      const beforeState = gameStateRef.current

      // Record in turn history
      const player = newState.players.find((p: Player) => p.id === playerId)
      setTurnHistory(prev => [
        ...prev,
        {
          turn: turnNumber ?? newState.turn - 1,
          playerId,
          playerName: player?.name || playerId,
          actions,
        },
      ])

      // Start animation with before/after states + actions
      if (animationHandlersRef.current) {
        animationHandlersRef.current.startAnimation(beforeState, newState, actions, () => {
          // Animation complete - commit new state and process next turn
          updateGameState(newState)
          // Use setTimeout to allow React to process state update before next animation
          setTimeout(processNextTurn, 50)
        })
      } else {
        // No animation handlers, just update and process next
        updateGameState(newState)
        processNextTurn()
      }
    }

    const handleMessage = (message: {
      type: string
      payload?: {
        gameState?: GameState
        actions?: PlayerAction[]
        playerId?: string
        turnNumber?: number
        error?: string
        errors?: string[]
      }
    }) => {
      if (message.type === 'TURN_EXECUTED' && message.payload) {
        const { gameState: newState, actions, playerId, turnNumber } = message.payload

        if (!newState || !actions || !playerId) return

        // Queue the turn for sequential processing
        turnQueueRef.current.push({
          gameState: newState,
          actions,
          playerId,
          turnNumber: turnNumber ?? newState.turn - 1,
        })

        // Start processing if not already doing so
        if (!isProcessingTurnRef.current) {
          processNextTurn()
        }
      }

      if (message.type === 'TURN_ERROR' && message.payload) {
        const { error, errors } = message.payload
        setTurnErrors(errors || (error ? [error] : ['Unknown error']))
      }
    }

    // Subscribe to game room messages
    const cleanup = client.onMessage('game', handleMessage, gameId)
    return cleanup
    // Note: connect/isConnected are stable refs, but we only need client and gameId for re-subscription
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, gameId, updateGameState])

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
        setFacing,
        setMovement,
        setTacticalSequence,
        executeTurn,
        weaponRangeVisibility,
        toggleWeaponRange,
        registerAnimationHandlers,
        onGameStateChange: updateGameState,
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
