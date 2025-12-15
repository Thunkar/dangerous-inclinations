# CLAUDE.md - Development Context for Dangerous Inclinations

## 🎯 Critical Context: This is a Tabletop Game First

**THIS GAME MUST WORK AS A TABLETOP GAME.** This is not negotiable. Every feature, mechanic, and implementation must be feasible for players to execute with physical components, dice, and paper. The digital implementation is a simulator to validate and playtest the tabletop rules.

When implementing any feature, always ask:

- Can this be tracked with pen and paper?
- Can players calculate this with simple arithmetic?
- Are the numbers reasonable for tabletop gameplay?
- Would this be fun to play in person?

## 🌐 Critical Architecture: Monorepo with Client-Server Separation

**The game is now a monorepo with three packages**: The game logic is completely separated from the UI, enabling multiplayer through a WebSocket server.

### Monorepo Structure:

The project is organized as a Yarn workspaces monorepo:

```
dangerous-inclinations/
├── engine/          - @dangerous-inclinations/engine
├── server/          - @dangerous-inclinations/server
├── ui/              - @dangerous-inclinations/ui
└── package.json     - Root workspace configuration
```

### Package Overview:

#### 1. **Engine Package** (`engine/`)
- **Package**: `@dangerous-inclinations/engine`
- **Purpose**: Pure game logic, no dependencies on UI or server
- **Location**: All game rules, state management, and action processing
- **Key directories**:
  - `src/game/` - Core game engine (movement, combat, energy, heat, etc.)
  - `src/game/lobby/` - Lobby management for multiplayer
  - `src/game/missions/` - Mission system
  - `src/types/` - TypeScript type definitions
  - `src/constants/` - Game constants (rings, gravity wells, subsystems)
  - `src/utils/` - Pure utility functions
- **Zero dependencies** on React, DOM, WebSockets, or HTTP
- **Exports**: Game engine functions, types, constants
- **Tests**: Vitest test suite in `engine/src/game/test/`

#### 2. **Server Package** (`server/`)
- **Package**: `@dangerous-inclinations/server`
- **Purpose**: Multiplayer game server
- **Tech Stack**: Fastify + WebSockets + Redis
- **Dependencies**: `@dangerous-inclinations/engine` (workspace dependency)
- **Key directories**:
  - `src/services/` - Game, lobby, and player services
  - `src/websocket/` - WebSocket handlers for game actions
  - `src/routes/` - HTTP REST API endpoints
  - `src/schemas/` - Zod validation schemas
- **Responsibilities**:
  - Hosts game instances using the engine
  - Manages player connections via WebSockets
  - Handles lobby creation and matchmaking
  - Broadcasts state updates to all clients
  - Validates actions before processing
  - Persists game state in Redis

#### 3. **UI Package** (`ui/`)
- **Package**: `@dangerous-inclinations/ui`
- **Purpose**: React frontend for the game
- **Tech Stack**: React 19 + TypeScript + Vite + Material-UI
- **Dependencies**: `@dangerous-inclinations/engine` (for types only)
- **Key directories**:
  - `src/components/` - React components
  - `src/components/GameBoard/` - Main game visualization
  - `src/components/actions/` - Action panels (movement, weapons, energy)
  - `src/context/` - React context (transitioning to WebSocket-based state)
  - `src/constants/` - UI constants
- **Responsibilities**:
  - Renders game state received from server
  - Captures user input
  - Sends actions to server via WebSocket
  - Displays game state updates
  - **Zero game logic** - NO calculations, NO rule enforcement

### Strict Separation of Concerns:

#### Engine Rules:
- ❌ **NEVER** import React, DOM APIs, or server libraries
- ❌ **NEVER** perform I/O operations (network, file system)
- ✅ **ALWAYS** use pure functions
- ✅ **ALWAYS** export types for use by server and UI
- ✅ All game rules live here (movement, combat, energy, heat, etc.)

#### Server Rules:
- ❌ **NEVER** implement game logic - import from engine
- ❌ **NEVER** directly modify game state - use engine functions
- ✅ **ALWAYS** validate actions before passing to engine
- ✅ **ALWAYS** broadcast state changes to all clients
- ✅ Manage connections, sessions, and persistence

#### UI Rules:
- ❌ **NEVER** compute game state locally
- ❌ **NEVER** put game logic in React components or hooks
- ❌ **NEVER** calculate positions, damage, or outcomes
- ❌ **NEVER** run the local engine (transitioning away from this)
- ✅ **ALWAYS** send actions to server
- ✅ **ALWAYS** render state received from server
- ✅ Import types from engine for type safety

### Data Flow:

#### Current Architecture (Multiplayer via Server):

```
User Input → UI → WebSocket Action → Server → Engine → New State
                                                          ↓
UI ← WebSocket State Update ← Server ← New State ← Engine
```

#### Legacy Architecture (Being Phased Out):

```
User Input → UI → Local Engine → New State → UI Renders
```

**IMPORTANT**: The UI is being migrated to **fully use the server** and **forgo its local engine**. All game state should come from WebSocket connections to the server.

### Example Patterns:

#### ✅ CORRECT: UI sends action to server

```typescript
// UI sends action via WebSocket
const handleBurn = () => {
  ws.send(JSON.stringify({
    type: "EXECUTE_ACTION",
    payload: { type: "BURN", intensity: "low" }
  }));
};
```

#### ❌ WRONG: UI runs engine locally

```typescript
// NO! Don't do this anymore
const handleBurn = () => {
  const newState = gameEngine.processTurn(currentState, actions); // WRONG
  setGameState(newState);
};
```

#### ✅ CORRECT: Server uses engine

```typescript
// Server processes action using engine
import { processTurn } from "@dangerous-inclinations/engine";

const newState = processTurn(currentState, actions);
broadcastState(gameId, newState);
```

## Project Overview

**Dangerous Inclinations** is a turn-based tactical space combat game where players control ships navigating through multiple gravity wells in a binary star system. Ships orbit around gravity wells (a central black hole and three orbiting planets), manage energy allocation, fire weapons, and transfer between gravity wells.

The game combines:

- **Orbital mechanics**: Ships move through circular sectors, with automatic orbital velocity
- **Energy management**: Reactor power allocation to subsystems with heat-on-use mechanics
- **Tactical combat**: Weapons with different firing arcs, ranges, and mechanics
- **Multi-gravity-well navigation**: Ships can transfer between the black hole and planet gravity wells
- **Multiplayer**: Real-time multiplayer via WebSocket server with lobby system
- **Mission System**: Dynamic mission objectives with rewards
- **Trading**: Space stations for buying/selling cargo

## 🚧 Current Development Phase: UI Migration to Server

**IMPORTANT**: The UI is actively being migrated from local engine execution to server-based multiplayer.

**What this means:**
- **Old pattern (being removed)**: UI imports engine functions and runs game logic locally
- **New pattern (implementing now)**: UI connects to server via WebSocket, sends actions, receives state
- **Mixed state**: Some components may still use legacy `GameContext`, others use WebSocket

**When working on UI:**
1. ❌ Do NOT add new local engine usage in UI
2. ✅ DO use WebSocket for all game state
3. ✅ DO import types from engine (for TypeScript), but NOT functions
4. ✅ DO help migrate legacy components to server-based approach

**Migration Checklist for UI Components:**
- [ ] Replace `GameContext` usage with WebSocket context
- [ ] Change local function calls to WebSocket messages
- [ ] Update state management to use server-provided state
- [ ] Remove engine function imports (keep only type imports)
- [ ] Test with live server connection

## Tech Stack

### Monorepo Management
- **Yarn Workspaces** - Monorepo package management
- **Yarn 4** (Berry) - Modern package manager with workspace support

### Engine Package
- **TypeScript 5.9** - Strict type checking
- **Vitest** - Fast unit testing with Vite-native support
- **Zod** - Runtime type validation for game state

### Server Package
- **Fastify** - Fast, low-overhead web framework
- **@fastify/websocket** - WebSocket support for real-time game updates
- **@fastify/cors** - CORS support for browser clients
- **ioredis** - Redis client for game state persistence
- **Zod** - Request/response validation
- **tsx** - TypeScript execution for development

### UI Package
- **React 19** - Latest React with improved performance
- **TypeScript 5.9** - Type-safe component development
- **Vite** - Fast build tooling and HMR
- **Material-UI (MUI)** - Component library for polished UI
- **@emotion** - CSS-in-JS styling (MUI dependency)

## File Structure Overview

### Engine Package (`engine/`)

```
engine/
├── src/
│   ├── game/                    - Core game engine
│   │   ├── index.ts             - Main game engine, processes turns
│   │   ├── actionProcessors.ts  - Action processors (move, fire, allocate)
│   │   ├── movement.ts          - Orbital movement, ring/well transfers
│   │   ├── turns.ts             - Turn resolution, tactical sequencing
│   │   ├── energy.ts            - Energy allocation system
│   │   ├── heat.ts              - Heat generation and dissipation
│   │   ├── damage.ts            - Damage application and shields
│   │   ├── missiles.ts          - Missile tracking and detonation
│   │   ├── cargo.ts             - Cargo and resource management
│   │   ├── stations.ts          - Space station interactions
│   │   ├── deployment.ts        - Ship deployment mechanics
│   │   ├── respawn.ts           - Ship respawn system
│   │   ├── validation.ts        - Action validation
│   │   ├── lobby/               - Lobby management
│   │   │   ├── index.ts
│   │   │   └── lobbyManager.ts  - Lobby state and player management
│   │   ├── missions/            - Mission system
│   │   │   ├── index.ts
│   │   │   ├── missionDeck.ts   - Mission card deck
│   │   │   └── missionChecks.ts - Mission completion checks
│   │   └── test/                - Test suites
│   ├── types/                   - TypeScript type definitions
│   │   ├── game.ts              - Player, Ship, GameState, etc.
│   │   ├── subsystems.ts        - Subsystem configurations
│   │   ├── actions.ts           - Action type definitions
│   │   └── ...
│   ├── constants/               - Game constants
│   │   ├── rings.ts             - Ring configurations (velocity, sectors)
│   │   ├── gravityWells.ts      - **CRITICAL** - Black hole + 6 planets
│   │   ├── subsystems.ts        - Subsystem stats and limits
│   │   └── ...
│   ├── utils/                   - Pure utility functions
│   │   ├── transferPoints.ts    - Well transfer sector calculations
│   │   ├── weaponRange.ts       - Firing solutions
│   │   ├── tacticalSequence.ts  - Action ordering
│   │   └── ...
│   └── index.ts                 - Package exports
└── package.json
```

### Server Package (`server/`)

```
server/
├── src/
│   ├── index.ts                 - Server entry point
│   ├── services/
│   │   ├── gameService.ts       - Game instance management
│   │   ├── lobbyService.ts      - Lobby CRUD operations
│   │   ├── playerService.ts     - Player session management
│   │   └── redis.ts             - Redis connection and utilities
│   ├── websocket/
│   │   └── gameHandler.ts       - WebSocket action handlers
│   ├── routes/
│   │   ├── lobby.ts             - Lobby HTTP endpoints
│   │   └── player.ts            - Player HTTP endpoints
│   └── schemas/
│       ├── game.ts              - Game validation schemas
│       ├── lobby.ts             - Lobby validation schemas
│       └── player.ts            - Player validation schemas
└── package.json
```

### UI Package (`ui/`)

```
ui/
├── src/
│   ├── App.tsx                  - Main application component
│   ├── main.tsx                 - React entry point
│   ├── components/
│   │   ├── GameBoard/           - **CRITICAL** - Game visualization
│   │   │   ├── GameBoard.tsx    - Main SVG board component
│   │   │   ├── components/      - Board sub-components (rings, ships, etc.)
│   │   │   ├── context/         - Board-specific context
│   │   │   ├── utils/           - Visualization utilities
│   │   │   └── types/           - Board-specific types
│   │   ├── actions/             - Action control panels
│   │   │   ├── energy/          - Energy allocation UI
│   │   │   ├── MovementPanel.tsx
│   │   │   ├── WeaponsPanel.tsx
│   │   │   └── ...
│   │   ├── lobby/               - Lobby and matchmaking UI
│   │   └── ...
│   ├── context/                 - React context providers
│   │   ├── GameContext.tsx      - **LEGACY** - Being replaced by WebSocket
│   │   └── WebSocketContext.tsx - WebSocket connection management
│   ├── constants/               - UI constants
│   └── assets/                  - Static assets
└── package.json
```

## Game Rules

**COMPREHENSIVE RULES ARE IN `RULES.md`** - Always consult this file before making changes.

Key mechanics:

1. **Energy System**: 10-unit reactor, allocate to subsystems, unlimited deallocation
2. **Heat-on-Use**: Systems generate heat ONLY when used, equal to allocated energy
3. **Heat Dissipation**: Ships have dissipation capacity (base 5, see DEFAULT_DISSIPATION_CAPACITY) that auto-removes heat at turn start; excess heat causes damage
4. **Shields**: Convert damage to heat (up to allocated energy, max 4)
5. **Critical Hits**: 10% chance on weapon hit to unpower a subsystem and convert its energy to heat
6. **Orbital Movement**: All rings have velocity=1 (1 sector/turn), automatic movement
7. **Ring Transfers**: Ships burn prograde/retrograde to change rings (2-turn process)
8. **Well Transfers**: Ships can jump between gravity wells at Ring 5 transfer sectors
9. **Weapons**: Broadside (perpendicular), spinal (tangential), turret (omnidirectional)
10. **Turn Phases**: Phase 0 (heat damage/dissipation) → Phase 1 (energy management) → Phase 2 (tactical actions)

## Multi-Gravity-Well System (CRITICAL)

### Overview

The game features 4 gravity wells arranged in a "Venn diagram" configuration:

- 1 **Black Hole** at the center
- 3 **Planets** (Alpha, Beta, Gamma) orbiting the black hole at fixed positions:
  - Alpha: 0° (top)
  - Beta: 120°
  - Gamma: 240°

### Gravity Well Configuration

Location: `src/constants/gravityWells.ts`

```typescript
// Each gravity well has 5 rings with standard configuration
STANDARD_RINGS: [
  { ring: 1, velocity: 1, radius: 60, sectors: 6 },
  { ring: 2, velocity: 1, radius: 110, sectors: 12 },
  { ring: 3, velocity: 1, radius: 160, sectors: 24 },
  { ring: 4, velocity: 1, radius: 210, sectors: 48 },
  { ring: 5, velocity: 1, radius: 260, sectors: 96 }, // Transfer ring
];

// Planet distance: 520 units from black hole center
// This creates a slight overlap of Ring 5s (260 + 260 = 520, so 0 units overlap at centers)
```

### Sector Alignment (CRITICAL VISUALIZATION DETAIL)

**The Problem**: Two circles with different centers cannot have circular arc sectors that share boundaries geometrically. To create a "Venn diagram" overlap where transfer sectors appear shared:

**The Solution** (implemented in `GameBoard.tsx:101-130`):

1. **Align sector CENTERS**, not boundaries
2. Rotate black hole **COUNTERCLOCKWISE** by half a sector: `-π/96` radians
3. Rotate planets **CLOCKWISE** by half a sector: planet's inward angle `- π/96` radians
4. This makes the circular arcs in the overlap region identical, creating the visual effect of shared sectors

```typescript
// GameBoard.tsx - getSectorRotationOffset()
if (well.type === "blackhole") {
  return -(Math.PI / blackHoleSectors); // Counterclockwise
}
if (well.orbitalPosition) {
  const pointInward = ((well.orbitalPosition.angle + 180) * Math.PI) / 180;
  const halfSector = Math.PI / planetSectors;
  return pointInward - halfSector; // Clockwise rotation
}
```

### Reversed Sector Numbering for Planets (CRITICAL)

**Planets have reversed sector numbering to preserve directional meaning when transferring between gravity wells.**

Gravity wells rotate like gears (opposite directions). To preserve the meaning of prograde/retrograde:

- **Black hole**: Sectors 0-23 go **clockwise** (normal numbering)
- **Planets**: Sectors 0-23 go **counterclockwise** (reversed numbering)

This means:

- Sector 0 remains sector 0 for both (transfer point)
- Sector 1 in black hole maps to visual sector 23 in planet
- Sector 2 in black hole maps to visual sector 22 in planet
- etc.

**Implementation**: `GameBoard.tsx:getVisualSector()` function converts logical sector (game state) to visual sector (rendering).

**Result**: A ship moving prograde (with orbit) in the black hole continues moving prograde (with orbit) in a planet after transfer, without needing to flip the facing label.

### Transfer Points

Location: `src/utils/transferPoints.ts`

- Calculated dynamically based on planet positions
- Black hole sector pointing at planet connects to planet's sector 0 (which points back at black hole)
- Bidirectional: can transfer from black hole → planet or planet → black hole
- **Only available on outermost ring** (Black hole Ring 4, Planet Ring 3)

### Visualization

Location: `GameBoard.tsx:302-372`

The transfer sectors are visualized as **lens-shaped overlaps** (like a Venn diagram):

- Two circular arcs from each ring's sector boundaries
- Golden fill (#FFD700) with 25% opacity
- 2px golden stroke
- Each overlap represents a bidirectional transfer point

## Key Implementation Patterns

### 1. WebSocket Communication (UI → Server)

```typescript
// UI sends action to server via WebSocket
const ws = useWebSocket(); // from WebSocketContext

// Send action
ws.send(JSON.stringify({
  type: "EXECUTE_TURN",
  payload: { actions: pendingActions }
}));

// Receive state updates
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    const message = JSON.parse(event.data);
    if (message.type === "STATE_UPDATE") {
      setGameState(message.payload.state);
    }
  };

  ws.addEventListener("message", handleMessage);
  return () => ws.removeEventListener("message", handleMessage);
}, [ws]);
```

### 2. Server-Side Game Processing

```typescript
// Server processes actions using engine
import { processTurn } from "@dangerous-inclinations/engine";
import type { GameState, GameAction } from "@dangerous-inclinations/engine";

const currentState = await gameService.getState(gameId);
const newState = processTurn(currentState, actions);

// Persist and broadcast
await gameService.setState(gameId, newState);
broadcastToPlayers(gameId, { type: "STATE_UPDATE", payload: { state: newState } });
```

### 3. Engine Pure Functions

```typescript
// Engine exports pure functions - no side effects
import type { GameState, Ship } from "../types/game";

export function processMovement(state: GameState, shipId: string): GameState {
  const ship = state.ships[shipId];
  // Pure calculation - no mutations, no I/O
  const newPosition = calculateNewPosition(ship);

  return {
    ...state,
    ships: {
      ...state.ships,
      [shipId]: { ...ship, ...newPosition }
    }
  };
}
```

### 4. Sector Calculations (Visualization in UI)

```typescript
// Ships are positioned at sector CENTERS, not boundaries
const angle =
  ((sector + 0.5) / totalSectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset;
const x = centerX + radius * Math.cos(angle);
const y = centerY + radius * Math.sin(angle);
```

### 5. Well-Aware Positioning (Visualization in UI)

```typescript
// ALWAYS get gravity well position first
const wellPosition = getGravityWellPosition(ship.wellId);
// Then calculate position relative to that well's center
const x = wellPosition.x + radius * Math.cos(angle);
```

### 6. Rotation Offsets (Visualization in UI)

```typescript
// Each gravity well has its own sector rotation offset
const rotationOffset = getSectorRotationOffset(wellId);
// Apply this to all sector angle calculations for that well
```

## Common Pitfalls & Solutions

### ❌ Running game logic in the UI

**Wrong**: Computing game state in React components

```typescript
// UI component - WRONG
const handleBurn = () => {
  const newState = processTurn(gameState, actions); // NO!
  setGameState(newState);
};
```

**Right**: Send actions to server, receive state updates

```typescript
// UI component - CORRECT
const handleBurn = () => {
  ws.send(JSON.stringify({ type: "BURN", payload: burnAction }));
  // State update arrives via WebSocket listener
};
```

### ❌ Importing engine into UI for game logic

**Wrong**: Using engine functions in UI to calculate outcomes

```typescript
// UI component - WRONG
import { calculateDamage } from "@dangerous-inclinations/engine";
const damage = calculateDamage(attacker, target); // NO!
```

**Right**: Only import types from engine in UI

```typescript
// UI component - CORRECT
import type { Ship, GameState } from "@dangerous-inclinations/engine";
// Use types for type safety, but don't call engine functions
```

### ❌ Modifying game state directly in server

**Wrong**: Mutating state instead of using engine functions

```typescript
// Server - WRONG
gameState.ships[shipId].position.sector += 1; // NO!
```

**Right**: Use engine functions to compute new state

```typescript
// Server - CORRECT
const newState = processMovement(gameState, shipId);
```

### ❌ Assuming single gravity well (in UI visualization)

**Wrong**: Using global center for all ships

```typescript
const x = centerX + radius * Math.cos(angle); // WRONG
```

**Right**: Get well position first

```typescript
const wellPos = getGravityWellPosition(ship.wellId);
const x = wellPos.x + radius * Math.cos(angle); // CORRECT
```

### ❌ Trying to align sector boundaries (in UI visualization)

**Wrong**: Making wedge-shaped sectors with radial lines from black hole center

**Right**: Rotate sector CENTERS to align, keep circular arcs. The arcs naturally create identical overlaps when centers are aligned.

### ❌ Forgetting rotation offsets (in UI visualization)

**Wrong**: Assuming sector 0 points "up" for all wells

**Right**: Black hole rotated by -π/96, planets rotated to point sector 0 inward (toward black hole) minus π/96

## Testing

Tests are in the **engine package** (`engine/src/game/test/`):

- `movement.test.ts` - Orbital movement, ring transfers
- `weapons.test.ts` - Weapon firing, damage calculations
- `wellTransfers.test.ts` - Well transfer mechanics
- `fixtures/` - Test data (ships, game states, actions)
- Test framework: **Vitest** with coverage support

### Running Tests:

```bash
# From monorepo root
yarn test                    # Run all engine tests
yarn workspace @dangerous-inclinations/engine test:ui        # Run with UI
yarn workspace @dangerous-inclinations/engine test:coverage  # Run with coverage

# From engine directory
cd engine/
yarn test                    # Run tests in watch mode
yarn test:ui                 # Open Vitest UI
yarn test:coverage           # Generate coverage report
```

## Building & Running

### Development

```bash
# Install all dependencies (run from root)
yarn install

# Run UI only (uses mock/local data)
yarn dev                     # Starts UI on http://localhost:5173

# Run server only
yarn dev:server              # Starts server on http://localhost:3000

# Run both UI and server concurrently
yarn dev:all                 # Starts both with hot reload

# Build engine (TypeScript compilation)
yarn build:engine            # Compiles to engine/dist/
```

### Production Build

```bash
# Build all packages
yarn build                   # Builds engine, server, and UI

# Build individual packages
yarn build:engine            # Build engine only
yarn build:server            # Build server only
yarn build:ui                # Build UI only

# Start production server
yarn workspace @dangerous-inclinations/server start
```

### Project Structure Commands

```bash
# Format code
yarn format                  # Format all packages
yarn format:check            # Check formatting without changes

# Package-specific commands
yarn workspace @dangerous-inclinations/engine <command>
yarn workspace @dangerous-inclinations/server <command>
yarn workspace @dangerous-inclinations/ui <command>
```

### Docker Setup

Redis is required for the server:

```bash
# Start Redis with Docker Compose
docker-compose up -d

# Stop Redis
docker-compose down
```

## Git Status & Recent Changes

Recent major changes:

1. **Monorepo Migration**: Restructured into yarn workspaces with engine/server/ui packages
2. **Server Implementation**: Added Fastify WebSocket server with Redis persistence
3. **Multiplayer Support**: Game now supports multiple players via WebSocket connections
4. **Lobby System**: Added lobby creation, player joining, and game start flow
5. **Mission System**: Implemented mission deck and completion tracking
6. **Cargo System**: Added cargo holds and resource management
7. **Space Stations**: Implemented station docking and trading
8. **Multi-gravity-well system**: Added 6 planets orbiting black hole
9. **Sector alignment fix**: Implemented half-sector rotation for proper Venn diagram overlap
10. **Transfer point visualization**: Transfer arcs between gravity wells

## Future Development Guidelines

### When Adding New Features

1. **Check RULES.md first** - Is this mechanic documented? Does it make sense for tabletop?
2. **Determine the package** - Does this belong in engine, server, or UI?
3. **Update engine types** - Add to `engine/src/types/`
4. **Add engine logic** - Create pure functions in `engine/src/game/`
5. **Update server** - Add WebSocket handlers and validation in `server/src/`
6. **Add UI controls** - Update components in `ui/src/components/`
7. **Write tests** - Add to `engine/src/game/test/`
8. **Update RULES.md** - Document the mechanic for future reference

### Package Decision Guide

**Add to Engine when:**
- It's a game rule or mechanic
- It processes game state
- It needs to be tested independently
- Both server and UI need to know about it (via types)

**Add to Server when:**
- It handles network communication
- It manages player sessions
- It persists game state
- It validates incoming actions
- It broadcasts state updates

**Add to UI when:**
- It's a visualization component
- It captures user input
- It formats data for display
- It manages UI-only state (not game state)

### When Debugging Visualization Issues

1. **Check rotation offsets** - Are they applied correctly for each well?
2. **Verify well positions** - Is `getGravityWellPosition()` being called?
3. **Inspect sector calculations** - Using `sector + 0.5` for centers?
4. **Scale factor** - Are all radii multiplied by `scaleFactor`?
5. **Check transfer points** - Are they calculated correctly in `transferPoints.ts`?

### When Modifying Game Rules

1. **Tabletop feasibility check** - Can players calculate this by hand?
2. **Update RULES.md** - Document the change
3. **Update engine** - Modify pure functions in `engine/src/game/`
4. **Update tests** - Modify or add test cases in `engine/src/game/test/`
5. **Update server validation** - Update schemas in `server/src/schemas/`
6. **Update UI** - Add controls or displays in `ui/src/components/`

### When Working on the UI → Server Migration

The UI is currently in transition from local engine to server-based state:

**Current State:**
- Some components still use local `GameContext` (legacy)
- Some components are being migrated to WebSocket-based state
- Both patterns may coexist temporarily

**Migration Steps:**
1. Identify component using `GameContext`
2. Replace with `WebSocketContext` or similar
3. Change local actions to WebSocket messages
4. Update state handling to receive from WebSocket
5. Remove any local engine imports (keep type imports only)
6. Test with live server connection

**Priority:**
- Focus on making ALL UI components use server state
- Remove local engine execution from UI
- Keep only type imports from engine in UI

## Important Constants

### Gravity Well Distances

- Black hole at `(0, 0)` relative to board center
- Planets at distance `520` from black hole center
- Ring 5 radius: `260` units
- Total system extent: `520 + 260 = 780` from center

### Board Scaling

- Board size: `1868px` (accommodates full system + 20% padding)
- Scale factor: `(boardSize/2 - padding) / maxExtent`
- Max extent: `778` units (520 + 260 - 2 for overlap)

### Sector Counts

- Ring 1: 6 sectors (60° each)
- Ring 2: 12 sectors (30° each)
- Ring 3: 24 sectors (15° each)
- Ring 4: 48 sectors (7.5° each)
- Ring 5: 96 sectors (3.75° each) ← Transfer sectors here

### Energy & Heat

- Reactor capacity: 10 units
- Deallocation: Unlimited (no rate limit)
- Heat-on-Use: Subsystems generate heat = allocated energy when USED
- Dissipation capacity: Base 5 (auto-removes heat at turn start)
- Heat damage: Excess heat above dissipation causes 1 damage/excess at turn start
- Shields: Convert damage to heat (up to allocated energy, max 4)
- Critical hits: 10% chance to unpower subsystem, converting its energy to heat

## Emergency Reference: Key Files

When running out of context, read these files first:

### Documentation
1. **RULES.md** - Complete game rules (MUST READ)
2. **MIGRATION.md** - Monorepo migration notes
3. **README.md** - Project overview and setup

### Engine (Core Game Logic)
4. **engine/src/game/index.ts** - Main game engine
5. **engine/src/types/game.ts** - Core type definitions
6. **engine/src/constants/gravityWells.ts** - Black hole + 6 planets configuration
7. **engine/src/game/movement.ts** - Movement and well transfer mechanics
8. **engine/src/game/actionProcessors.ts** - Action processing logic

### Server (Multiplayer Backend)
9. **server/src/index.ts** - Server entry point
10. **server/src/websocket/gameHandler.ts** - WebSocket action handlers
11. **server/src/services/gameService.ts** - Game instance management

### UI (Frontend Visualization)
12. **ui/src/components/GameBoard/GameBoard.tsx** - Main game visualization
13. **ui/src/context/GameContext.tsx** - LEGACY context (being phased out)
14. **ui/src/App.tsx** - Main application component

### Monorepo Configuration
15. **package.json** (root) - Workspace configuration
16. **engine/package.json** - Engine package config
17. **server/package.json** - Server package config
18. **ui/package.json** - UI package config

## Monorepo Development Workflow

### Typical Development Cycle

**Working on Game Logic:**
1. Make changes in `engine/src/game/`
2. Run tests: `yarn test` (from root or engine/)
3. Server and UI automatically pick up changes via workspace links

**Working on Server:**
1. Make changes in `server/src/`
2. Server hot-reloads via `tsx watch`
3. Test WebSocket endpoints with UI or test client

**Working on UI:**
1. Make changes in `ui/src/`
2. UI hot-reloads via Vite HMR
3. Connect to local server or use mock data

### Cross-Package Dependencies

Packages import from each other using workspace names:

```typescript
// In server or UI
import { processTurn } from "@dangerous-inclinations/engine";
import type { GameState } from "@dangerous-inclinations/engine";
```

Yarn automatically resolves these to the local workspace packages during development.

### Building for Production

1. Build engine first (other packages depend on it)
2. Build server and UI in parallel
3. `yarn build` handles this automatically

### Adding New Dependencies

```bash
# Add to specific package
yarn workspace @dangerous-inclinations/engine add vitest
yarn workspace @dangerous-inclinations/server add fastify
yarn workspace @dangerous-inclinations/ui add react

# Add dev dependency to root (tooling)
yarn add -D prettier -W
```

## Contact & Notes

This game is designed to be played on a tabletop with printed components. Every mechanic must translate to physical gameplay. When in doubt, prioritize tabletop feasibility over digital convenience.

The visualization creates a "Venn diagram" effect where transfer sectors appear as lens-shaped overlaps between gravity wells. This is achieved by aligning sector **centers** (not boundaries) through half-sector rotation of both the black hole and planets in opposite directions.

**Current Development Phase**: Migrating UI from local engine to full server-based multiplayer architecture. The UI should no longer run game logic locally - all game state comes from the server via WebSocket connections.
