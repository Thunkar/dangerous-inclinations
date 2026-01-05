# Ship Loadout System Implementation Plan

## Overview

**Goal**: Implement a customizable ship loadout system where players choose their ship's subsystems after seeing their missions but before deployment.

**Key Design Decisions**:
- New game phase: `loadout` (between `setup` and `deployment`)
- Loadout sent to server before deployment, stored per-game (not on Player object)
- Duplicates allowed (e.g., 2 lasers in side slots)
- 2 forward slots + 4 side slots (2 per side)
- Engines and maneuvering thrusters are mandatory (not selectable)

---

## Slot System Design

### Slot Types
```
FORWARD SLOTS (2):
  - Railgun (spinal weapon, forward-facing)
  - Fuel Scoop (forward intake)
  - Sensor Array (forward sensor dish)

SIDE SLOTS (4, 2 per side):
  - Laser (broadside weapon)
  - Missiles (turret mount - can go in either)
  - Shields (side-mounted deflectors)
  - Radiator (heat dissipation panels)
  - Fuel Tank (side-mounted tanks)

EITHER SLOT:
  - Missiles (turret mount, flexible placement)
```

### New Subsystems
| Subsystem | Slot Type | Effect | Energy |
|-----------|-----------|--------|--------|
| Radiator | Side | +2 dissipation capacity | Passive (no energy) |
| Fuel Tank | Side | +6 reaction mass | Passive (no energy) |
| Sensor Array | Forward | Critical chance 10%→30% | min=2, max=2 |

---

## Data Model Changes

### Engine Types (`engine/src/models/subsystems.ts`)

```typescript
// Add slot type
type SlotType = "forward" | "side" | "either" | "fixed"

// Extend SubsystemType
type SubsystemType =
  | "engines" | "rotation"  // Fixed (always present)
  | "scoop" | "railgun" | "sensor_array"  // Forward only
  | "laser" | "shields" | "radiator" | "fuel_tank"  // Side only
  | "missiles"  // Either

// Add to SubsystemConfig
interface SubsystemConfig {
  // ... existing fields
  slotType: SlotType
  isPassive?: boolean  // For fuel_tank (no energy allocation)
}

// New type for loadout
interface ShipLoadout {
  forwardSlots: [SubsystemType | null, SubsystemType | null]
  sideSlots: [SubsystemType | null, SubsystemType | null, SubsystemType | null, SubsystemType | null]
}

// Loadout validation result
interface LoadoutValidation {
  valid: boolean
  errors: string[]
}
```

### Game State Changes (`engine/src/models/game.ts`)

```typescript
// Add phase
type GamePhase = "lobby" | "setup" | "loadout" | "deployment" | "active" | "ended"
```

### Ship State Changes (`engine/src/models/game.ts`)

```typescript
// Loadout lives in the ship (players "build" their ships for that game)
interface ShipState {
  // ... existing fields
  loadout: ShipLoadout           // The chosen loadout for this ship
  dissipationCapacity: number    // Base 5, +2 per radiator
  criticalChance: number         // Base 0.1, +0.2 per sensor array
  // subsystems array is built from loadout + fixed systems
}
```

---

## Phase Flow

```
LOBBY → START GAME → SETUP (deal missions) → LOADOUT → DEPLOYMENT → ACTIVE
                                    ↑
                           New phase here
```

### Loadout Phase
1. All players see their dealt missions
2. Each player selects their loadout (can happen in parallel)
3. Player sends `SUBMIT_LOADOUT` to server
4. Server validates and stores loadout
5. When all players have submitted, transition to deployment

---

## Engine Changes

### 1. New Subsystem Configs (`engine/src/models/subsystems.ts`)

Add configs for new subsystems:
```typescript
radiator: {
  id: "radiator",
  name: "Radiator",
  slotType: "side",
  minEnergy: 0,  // Fully passive - no energy allocation
  maxEnergy: 0,
  isPassive: true,
  passiveEffect: { dissipationBonus: 2 }
}

fuel_tank: {
  id: "fuel_tank",
  name: "Fuel Tank",
  slotType: "side",
  minEnergy: 0,  // Fully passive - no energy allocation
  maxEnergy: 0,
  isPassive: true,
  passiveEffect: { reactionMassBonus: 6 }
}

sensor_array: {
  id: "sensor_array",
  name: "Sensor Array",
  slotType: "forward",
  minEnergy: 2,  // Fixed energy requirement
  maxEnergy: 2,
  generatesHeatOnUse: false,
  passiveEffect: { criticalChanceBonus: 20 }  // 10% + 20% = 30%
}
```

Add slotType to existing configs:
- `engines`: fixed
- `rotation`: fixed
- `scoop`: forward
- `railgun`: forward
- `laser`: side
- `missiles`: either
- `shields`: side

### 2. Loadout Validation (`engine/src/game/loadout.ts` - NEW)

```typescript
function validateLoadout(loadout: ShipLoadout): LoadoutValidation

function createSubsystemsFromLoadout(loadout: ShipLoadout): Subsystem[]

function calculateShipStatsFromLoadout(loadout: ShipLoadout): {
  dissipationCapacity: number  // 5 + 2*radiators
  reactionMass: number         // 10 + 6*fuelTanks
  criticalChance: number       // 0.1 + 0.2*sensorArrays
}
```

### 3. Ship Creation (`engine/src/utils/subsystemHelpers.ts`)

Modify `createInitialShipState` to accept loadout:
```typescript
function createInitialShipState(
  position: ShipPosition,
  loadout: ShipLoadout,
  overrides?: Partial<ShipState>
): ShipState
```

### 4. Combat Changes (`engine/src/game/damage.ts`)

Modify critical hit calculation to use ship's criticalChance:
```typescript
// Currently hardcoded: Math.random() < 0.1
// Change to: Math.random() < ship.criticalChance
```

### 5. Action Validation (`engine/src/game/validation.ts`)

Add validation that actions are consistent with loadout:
- Can't fire railgun if not in loadout
- Can't activate scoop if not in loadout
- etc.

---

## Server Changes

### 1. Loadout Storage (`server/src/services/gameService.ts`)

Loadout is stored in the ship state, sent via HTTP before deployment:
```typescript
// HTTP endpoint to submit loadout (POST /api/game/:gameId/loadout)
async function submitPlayerLoadout(gameId: string, playerId: string, loadout: ShipLoadout): Promise<{ success: boolean; error?: string }>

// Check if all players have submitted loadouts
async function checkAllLoadoutsSubmitted(gameId: string): boolean
```

### 2. WebSocket Handler (`server/src/websocket/roomHandler.ts`)

Only ONE real-time event for loadout phase (loadouts are secret until game starts):
```typescript
// Server → All Clients (broadcast when all loadouts are in)
{ type: "ALL_LOADOUTS_READY", payload: {} }  // Triggers transition to deployment
```

Note: No `LOADOUT_ACCEPTED` or `LOADOUT_ERROR` events - these are handled via HTTP response.
Loadouts are NOT revealed to other players until the game starts.

### 3. HTTP Endpoint (`server/src/routes/game.ts`)

```typescript
// POST /api/game/:gameId/loadout
// Body: { loadout: ShipLoadout }
// Response: { success: true } or { success: false, errors: string[] }
```

### 4. Phase Transition

After setup (missions dealt) → set phase to "loadout"
When all loadouts submitted → broadcast `ALL_LOADOUTS_READY`, set phase to "deployment"

---

## UI Changes

### 1. New Component: `LoadoutScreen.tsx`

Located at: `ui/src/components/LoadoutScreen.tsx`

Features:
- Shows player's dealt missions (context for loadout choice)
- Visual ship diagram with 6 slots (2 forward, 4 side)
- Drag-and-drop or click-to-select subsystems
- Shows subsystem descriptions and stats
- Submit button (disabled until valid loadout)
- Shows other players' ready status

### 2. App.tsx Routing

Add routing for loadout phase:
```typescript
case "loadout":
  return <LoadoutScreen />
```

### 3. Context Updates

Update `LobbyContext` or create `LoadoutContext` to manage:
- Current loadout state (local until submitted)
- Submit loadout action (HTTP POST, not WebSocket)
- Listen for ALL_LOADOUTS_READY WebSocket event to transition to deployment

---

## Files to Modify/Create

### Engine (create/modify)

| File | Action | Description |
|------|--------|-------------|
| `engine/src/models/subsystems.ts` | Modify | Add SlotType, new subsystem configs |
| `engine/src/models/game.ts` | Modify | Add ShipLoadout type, playerLoadouts to GameState |
| `engine/src/game/loadout.ts` | **Create** | Loadout validation and ship creation |
| `engine/src/utils/subsystemHelpers.ts` | Modify | Update createInitialShipState |
| `engine/src/game/damage.ts` | Modify | Use ship.criticalChance |
| `engine/src/game/validation.ts` | Modify | Validate actions against loadout |
| `engine/src/game/deployment.ts` | Modify | Use loadout when creating ship |
| `engine/src/index.ts` | Modify | Export new types and functions |

### Server (modify/create)

| File | Action | Description |
|------|--------|-------------|
| `server/src/services/gameService.ts` | Modify | Add loadout submission/validation |
| `server/src/routes/game.ts` | **Create** | HTTP endpoint for loadout submission |
| `server/src/websocket/roomHandler.ts` | Modify | Broadcast ALL_LOADOUTS_READY |

### UI (create/modify)

| File | Action | Description |
|------|--------|-------------|
| `ui/src/components/LoadoutScreen.tsx` | **Create** | Main loadout selection UI |
| `ui/src/components/LoadoutScreen/` | **Create** | Sub-components (SlotSelector, SubsystemCard, etc.) |
| `ui/src/App.tsx` | Modify | Route to LoadoutScreen for loadout phase |
| `ui/src/context/GameContext.tsx` | Modify | Add loadout state and actions |

---

## Implementation Order

### Phase 1: Engine Foundation
1. Add new types (SlotType, ShipLoadout, new SubsystemTypes)
2. Add new subsystem configs (radiator, fuel_tank, sensor_array)
3. Add slotType to existing configs
4. Create loadout.ts with validation functions
5. Update createInitialShipState to use loadout

### Phase 2: Engine Integration
6. Update damage.ts for variable critical chance
7. Update deployment.ts to use loadout
8. Add action validation against loadout
9. Write tests for loadout validation

### Phase 3: Server Integration
10. Add loadout storage to gameService
11. Add SUBMIT_LOADOUT handler
12. Add phase transition logic

### Phase 4: UI Implementation
13. Create LoadoutScreen component
14. Add slot/subsystem selection UI
15. Wire up to WebSocket
16. Add to App.tsx routing

### Phase 5: Polish
17. Add loadout to deployment preview
18. Show loadout in game UI (status display)
19. Update RULES.md

---

## Testing Checklist

- [ ] Loadout validation rejects invalid slot assignments
- [ ] Loadout validation allows duplicates
- [ ] Ship stats correctly calculated from loadout (dissipation, reaction mass, crit chance)
- [ ] Radiator increases dissipation capacity
- [ ] Fuel tank increases starting reaction mass
- [ ] Sensor array increases critical hit chance
- [ ] Actions fail if subsystem not in loadout
- [ ] Server stores and retrieves loadouts correctly
- [ ] Phase transitions work (setup → loadout → deployment)
- [ ] UI allows selecting all valid configurations
- [ ] Multiplayer: all players can submit loadouts independently

---

## Default Loadout (for backwards compatibility / testing)

```typescript
const DEFAULT_LOADOUT: ShipLoadout = {
  forwardSlots: ["scoop", "railgun"],
  sideSlots: ["laser", "laser", "shields", "missiles"]
}
```

This matches the current fixed loadout for easy comparison.
