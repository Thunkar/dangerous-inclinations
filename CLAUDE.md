# CLAUDE.md - Development Context for Orbit Simulator

## 🎯 Critical Context: This is a Tabletop Game First

**THIS GAME MUST WORK AS A TABLETOP GAME.** This is not negotiable. Every feature, mechanic, and implementation must be feasible for players to execute with physical components, dice, and paper. The digital implementation is a simulator to validate and playtest the tabletop rules.

When implementing any feature, always ask:
- Can this be tracked with pen and paper?
- Can players calculate this with simple arithmetic?
- Are the numbers reasonable for tabletop gameplay?
- Would this be fun to play in person?

## 🌐 Critical Architecture: Client-Server Separation

**ALL GAME LOGIC MUST LIVE IN `src/game-logic/`** - The game will be moved to a multiplayer server implementation. This means:

### Strict Separation of Concerns:
1. **Game Logic (`src/game-logic/`)**:
   - Pure functions that process game state
   - Action processors
   - Movement calculations
   - Combat resolution
   - All game rules enforcement
   - **Zero UI dependencies** - no React, no DOM, no rendering

2. **UI (`src/components/`, `src/context/`)**:
   - Renders the game state
   - Captures user input
   - Sends actions to game logic
   - Displays results
   - **Zero game logic** - no calculations, no rule enforcement

### Implementation Rules:
- ❌ **NEVER** compute game state in UI components
- ❌ **NEVER** put game logic in React components or hooks
- ❌ **NEVER** calculate positions, damage, or outcomes in the UI
- ✅ **ALWAYS** compute everything in `game-logic/`
- ✅ **UI only sends actions** (e.g., `{ type: 'BURN', intensity: 'low' }`)
- ✅ **UI only renders state** (positions, HP, energy, etc.)

### Data Flow:
```
User Input → UI → Action → Game Logic → New State → UI Renders
```

Example of correct architecture:
```typescript
// ✅ CORRECT: UI just sends action
const handleBurn = () => {
  dispatch({ type: 'BURN', payload: { intensity: 'low' } })
}

// ❌ WRONG: UI calculates game state
const handleBurn = () => {
  const newPosition = calculateBurnPosition(ship) // NO! This belongs in game-logic/
  dispatch({ type: 'UPDATE_POSITION', payload: newPosition })
}
```

This architecture ensures the game can be moved to a server where:
- Server runs `game-logic/` code
- Clients send actions via network
- Server broadcasts state updates
- Clients render the received state

## Project Overview

**Orbit Simulator** is a turn-based tactical space combat game where players control ships navigating through multiple gravity wells in a binary star system. Ships orbit around gravity wells (a central black hole and three orbiting planets), manage energy allocation, fire weapons, and transfer between gravity wells.

The game combines:
- **Orbital mechanics**: Ships move through circular sectors, with automatic orbital velocity
- **Energy management**: Reactor power allocation to subsystems with heat/overclock mechanics
- **Tactical combat**: Weapons with different firing arcs, ranges, and mechanics
- **Multi-gravity-well navigation**: Ships can transfer between the black hole and planet gravity wells

## Tech Stack

- **React 18** with TypeScript
- **Vite** for build tooling
- **Material-UI (MUI)** for UI components
- **State Management**: React Context API (see `src/context/GameContext.tsx`)

## File Structure Overview

### Core Game Logic (`src/game-logic/`)
- `index.ts` - Main game engine, processes turns and actions
- `actionProcessors.ts` - Individual action processors (move, fire weapons, allocate energy, etc.)
- `movement.ts` - Orbital movement calculations, ring transfers, well transfers
- `turns.ts` - Turn resolution, tactical sequence ordering
- `test/` - Test fixtures and test files

### Game State & Configuration (`src/`)
- `types/game.ts` - Core TypeScript types (Player, Ship, GravityWell, GameState, etc.)
- `types/subsystems.ts` - Subsystem types and configurations
- `constants/rings.ts` - Ring configurations (5 rings with different sector counts)
- `constants/gravityWells.ts` - **CRITICAL FILE** - Defines black hole and 3 planets with positions
- `context/GameContext.tsx` - React context managing game state

### Visualization (`src/components/`)
- `GameBoard.tsx` - **CRITICAL FILE** - Main SVG visualization of gravity wells, rings, ships, and transfer sectors
- `ControlPanel.tsx` - UI for energy allocation, weapons, movement controls
- Other UI components

### Utilities (`src/utils/`)
- `transferPoints.ts` - Calculates which sectors connect between gravity wells
- `weaponRange.ts` - Firing solutions and range calculations
- `tacticalSequence.ts` - Action sequencing (movement before/after weapons)
- `burnPreview.ts` - Preview burn trajectories

## Game Rules

**COMPREHENSIVE RULES ARE IN `RULES.md`** - Always consult this file before making changes.

Key mechanics:
1. **Energy System**: 10-unit reactor, allocate to subsystems, 3-unit/turn deallocation limit
2. **Heat & Overclock**: Systems generate heat when overclocked, heat causes hull damage
3. **Orbital Movement**: All rings have velocity=1 (1 sector/turn), automatic movement
4. **Ring Transfers**: Ships burn prograde/retrograde to change rings (2-turn process)
5. **Well Transfers**: Ships can jump between gravity wells at Ring 5 transfer sectors
6. **Weapons**: Broadside (perpendicular), spinal (tangential), turret (omnidirectional)
7. **Turn Phases**: Planning phase (pending state) → Execute Turn → Game engine processes actions

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
]

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
if (well.type === 'blackhole') {
  return -(Math.PI / blackHoleSectors) // Counterclockwise
}
if (well.orbitalPosition) {
  const pointInward = ((well.orbitalPosition.angle + 180) * Math.PI) / 180
  const halfSector = Math.PI / planetSectors
  return pointInward - halfSector // Clockwise rotation
}
```

### Transfer Points
Location: `src/utils/transferPoints.ts`

- Calculated dynamically based on planet positions
- Black hole sector pointing at planet connects to planet's sector 0 (which points back at black hole)
- Bidirectional: can transfer from black hole → planet or planet → black hole
- **Only available on Ring 5** (outermost ring)

### Visualization
Location: `GameBoard.tsx:302-372`

The transfer sectors are visualized as **lens-shaped overlaps** (like a Venn diagram):
- Two circular arcs from each ring's sector boundaries
- Golden fill (#FFD700) with 25% opacity
- 2px golden stroke
- Each overlap represents a bidirectional transfer point

## Key Implementation Patterns

### 1. Game State Updates
```typescript
// ALWAYS use the context's dispatch system
const { gameState, dispatch } = useGame()
dispatch({ type: 'EXECUTE_TURN', payload: pendingActions })
```

### 2. Sector Calculations
```typescript
// Ships are positioned at sector CENTERS, not boundaries
const angle = ((sector + 0.5) / totalSectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset
const x = centerX + radius * Math.cos(angle)
const y = centerY + radius * Math.sin(angle)
```

### 3. Well-Aware Positioning
```typescript
// ALWAYS get gravity well position first
const wellPosition = getGravityWellPosition(ship.wellId)
// Then calculate position relative to that well's center
const x = wellPosition.x + radius * Math.cos(angle)
```

### 4. Rotation Offsets
```typescript
// Each gravity well has its own sector rotation offset
const rotationOffset = getSectorRotationOffset(wellId)
// Apply this to all sector angle calculations for that well
```

## Common Pitfalls & Solutions

### ❌ Assuming single gravity well
**Wrong**: Using global center for all ships
```typescript
const x = centerX + radius * Math.cos(angle) // WRONG
```

**Right**: Get well position first
```typescript
const wellPos = getGravityWellPosition(ship.wellId)
const x = wellPos.x + radius * Math.cos(angle) // CORRECT
```

### ❌ Trying to align sector boundaries
**Wrong**: Making wedge-shaped sectors with radial lines from black hole center

**Right**: Rotate sector CENTERS to align, keep circular arcs. The arcs naturally create identical overlaps when centers are aligned.

### ❌ Forgetting rotation offsets
**Wrong**: Assuming sector 0 points "up" for all wells

**Right**: Black hole rotated by -π/96, planets rotated to point sector 0 inward (toward black hole) minus π/96

## Testing

Tests are in `src/game-logic/test/`:
- `movement.test.ts` - Orbital movement, ring transfers
- `weapons.test.ts` - Weapon firing, damage calculations
- `wellTransfers.test.ts` - Well transfer mechanics
- `fixtures/` - Test data (ships, game states, actions)

Run tests: `npm test`

## Building & Running

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm test             # Run tests
```

## Git Status & Recent Changes

Recent major changes:
1. **Multi-gravity-well system**: Added 3 planets orbiting black hole
2. **Sector alignment fix**: Implemented half-sector rotation for proper Venn diagram overlap
3. **Transfer point visualization**: Golden lens-shaped overlaps between Ring 5s
4. **Planet distance**: Set to 520 units (tangent Ring 5s)

## Future Development Guidelines

### When Adding New Features

1. **Check RULES.md first** - Is this mechanic documented? Does it make sense for tabletop?
2. **Update types** - Add to `types/game.ts` or `types/subsystems.ts`
3. **Add action processor** - Create handler in `actionProcessors.ts`
4. **Update game engine** - Add to `index.ts` if needed
5. **Add UI controls** - Update `ControlPanel.tsx` or relevant component
6. **Write tests** - Add to `src/game-logic/test/`
7. **Update RULES.md** - Document the mechanic for future reference

### When Debugging Visualization Issues

1. **Check rotation offsets** - Are they applied correctly for each well?
2. **Verify well positions** - Is `getGravityWellPosition()` being called?
3. **Inspect sector calculations** - Using `sector + 0.5` for centers?
4. **Scale factor** - Are all radii multiplied by `scaleFactor`?
5. **Check transfer points** - Are they calculated correctly in `transferPoints.ts`?

### When Modifying Game Rules

1. **Tabletop feasibility check** - Can players calculate this by hand?
2. **Update RULES.md** - Document the change
3. **Update tests** - Modify or add test cases
4. **Check action processors** - Update validation logic
5. **Update UI** - Add controls or displays as needed

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
- Deallocation limit: 3 units/turn (shared with heat venting)
- Heat damage: 1 damage/heat/turn (after first turn)
- Overclock threshold: Varies by subsystem

## Emergency Reference: Key Files

When running out of context, read these files first:
1. **RULES.md** - Complete game rules
2. **src/constants/gravityWells.ts** - Gravity well configuration
3. **src/components/GameBoard.tsx** - Visualization logic (lines 101-372 critical)
4. **src/game-logic/movement.ts** - Well transfer mechanics
5. **src/types/game.ts** - Core type definitions

## Contact & Notes

This game is designed to be played on a tabletop with printed components. Every mechanic must translate to physical gameplay. When in doubt, prioritize tabletop feasibility over digital convenience.

The visualization creates a "Venn diagram" effect where transfer sectors appear as lens-shaped overlaps between gravity wells. This is achieved by aligning sector **centers** (not boundaries) through half-sector rotation of both the black hole and planets in opposite directions.
