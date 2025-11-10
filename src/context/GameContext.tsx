import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { GameState, Player, PlayerAction, Facing, BurnIntensity } from '../types/game'
import type { Subsystem, SubsystemType, ReactorState, HeatState } from '../types/subsystems'
import { STARTING_REACTION_MASS } from '../constants/rings'
import {
  createInitialSubsystems,
  createInitialReactorState,
  createInitialHeatState,
} from '../utils/subsystemHelpers'
import { executeTurn as executeGameTurn } from '../game-logic/turns'

interface WeaponRangeVisibility {
  laser: boolean
  railgun: boolean
  missiles: boolean
}

interface MovementPreview {
  actionType: 'coast' | 'burn'
  burnIntensity?: BurnIntensity
  sectorAdjustment: number
  activateScoop: boolean
}

interface PendingState {
  subsystems: Subsystem[]
  reactor: ReactorState
  heat: HeatState
  facing: Facing
  movement: MovementPreview
}

interface GameContextType {
  gameState: GameState
  pendingState: PendingState
  // High-level game actions
  allocateEnergy: (subsystemType: SubsystemType, newTotal: number) => void
  deallocateEnergy: (subsystemType: SubsystemType, amount: number) => void
  ventHeat: (newTotal: number) => void
  setFacing: (facing: Facing) => void
  setMovement: (movement: MovementPreview) => void
  executeTurn: (
    movementType: 'coast' | 'burn',
    burnIntensity?: BurnIntensity,
    sectorAdjustment?: number,
    activateScoop?: boolean,
    weaponTargets?: { laser?: string; railgun?: string; missiles?: string }
  ) => void
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
  },
  {
    id: 'player3',
    name: 'Ship Gamma',
    color: '#4caf50',
    ship: {
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
    },
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
  const [weaponRangeVisibility, setWeaponRangeVisibility] = useState<WeaponRangeVisibility>({
    laser: false,
    railgun: false,
    missiles: false,
  })

  const activePlayer = gameState.players[gameState.activePlayerIndex]

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
    })
  }, [activePlayer.id, gameState.turn])

  // Helper to calculate energy to return based on deallocations
  const calculateEnergyToReturn = useCallback((newSubsystems: Subsystem[]) => {
    let totalDeallocated = 0
    activePlayer.ship.subsystems.forEach((committedSub, index) => {
      const pendingSub = newSubsystems[index]
      const diff = committedSub.allocatedEnergy - pendingSub.allocatedEnergy
      if (diff > 0) {
        totalDeallocated += diff
      }
    })
    return totalDeallocated
  }, [activePlayer.ship.subsystems])

  // High-level game action: Allocate energy to a subsystem
  const allocateEnergy = useCallback((subsystemType: SubsystemType, newTotal: number) => {
    const subsystemIndex = pendingState.subsystems.findIndex(s => s.type === subsystemType)
    if (subsystemIndex === -1) return

    const currentEnergy = pendingState.subsystems[subsystemIndex].allocatedEnergy
    const diff = newTotal - currentEnergy

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
  }, [pendingState, calculateEnergyToReturn])

  // High-level game action: Deallocate energy from a subsystem
  const deallocateEnergy = useCallback((subsystemType: SubsystemType, amount: number) => {
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
  }, [pendingState, calculateEnergyToReturn])

  // High-level game action: Vent heat
  const ventHeat = useCallback((newTotal: number) => {
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
  }, [pendingState.reactor.energyToReturn, pendingState.reactor.maxReturnRate])

  // High-level game action: Set facing
  const setFacing = useCallback((facing: Facing) => {
    setPendingStateInternal(prev => ({ ...prev, facing }))
  }, [])

  // High-level game action: Set movement preview
  const setMovement = useCallback((movement: MovementPreview) => {
    setPendingStateInternal(prev => ({ ...prev, movement }))
  }, [])

  // Execute turn: compute diff between committed and pending, create actions, execute
  const executeTurn = useCallback(
    (
      movementType: 'coast' | 'burn',
      burnIntensity?: BurnIntensity,
      sectorAdjustment?: number,
      activateScoop?: boolean,
      weaponTargets?: { laser?: string; railgun?: string; missiles?: string }
    ) => {
      const actions: PlayerAction[] = []

      // 1. Compute energy allocation/deallocation actions
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

      // 2. Compute heat venting action
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

      // 3. Add rotation action if facing changed
      if (pendingState.facing !== activePlayer.ship.facing) {
        actions.push({
          playerId: activePlayer.id,
          type: 'rotate',
          data: {
            targetFacing: pendingState.facing,
          },
        })
      }

      // 4. Add movement action
      if (movementType === 'burn') {
        actions.push({
          playerId: activePlayer.id,
          type: 'burn',
          data: {
            burnIntensity: burnIntensity || 'light',
            sectorAdjustment: sectorAdjustment || 0,
          },
        })
      } else {
        actions.push({
          playerId: activePlayer.id,
          type: 'coast',
          data: {
            activateScoop: activateScoop || false,
          },
        })
      }

      // 5. Add weapon actions
      if (weaponTargets?.laser) {
        actions.push({
          playerId: activePlayer.id,
          type: 'fire_weapon',
          data: {
            weaponType: 'laser',
            targetPlayerIds: [weaponTargets.laser],
          },
        })
      }
      if (weaponTargets?.railgun) {
        actions.push({
          playerId: activePlayer.id,
          type: 'fire_weapon',
          data: {
            weaponType: 'railgun',
            targetPlayerIds: [weaponTargets.railgun],
          },
        })
      }
      if (weaponTargets?.missiles) {
        actions.push({
          playerId: activePlayer.id,
          type: 'fire_weapon',
          data: {
            weaponType: 'missiles',
            targetPlayerIds: [weaponTargets.missiles],
          },
        })
      }

      // 6. Execute turn with all actions
      setGameState(prev => {
        const result = executeGameTurn(prev, actions)
        if (result.errors && result.errors.length > 0) {
          console.error('Turn execution errors:', result.errors)
          return prev
        }
        return result.gameState
      })
    },
    [activePlayer, pendingState]
  )

  const toggleWeaponRange = useCallback((weaponType: 'laser' | 'railgun' | 'missiles') => {
    setWeaponRangeVisibility(prev => ({
      ...prev,
      [weaponType]: !prev[weaponType],
    }))
  }, [])

  return (
    <GameContext.Provider
      value={{
        gameState,
        pendingState,
        allocateEnergy,
        deallocateEnergy,
        ventHeat,
        setFacing,
        setMovement,
        executeTurn,
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
