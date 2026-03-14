# CLAUDE.md - Development Context for Dangerous Inclinations

## Critical Context: This is a Tabletop Game First

**THIS GAME MUST WORK AS A TABLETOP GAME.** Every feature must be feasible for players to execute with physical components, dice, and paper. The digital implementation is a simulator to playtest the tabletop rules.

When implementing any feature, always ask:
- Can this be tracked with pen and paper?
- Can players calculate this with simple arithmetic?
- Would this be fun to play in person?

## Architecture: Monorepo with Client-Server Separation

Yarn workspaces monorepo with three packages:

```
dangerous-inclinations/
├── engine/          - @dangerous-inclinations/engine (pure game logic)
├── server/          - @dangerous-inclinations/server (Fastify + WS + Redis)
├── ui/              - @dangerous-inclinations/ui (React 19 + Vite + MUI)
└── package.json     - Root workspace configuration
```

### Strict Separation of Concerns

**Engine**: Pure functions only. No React, no I/O, no server imports. All game rules live here.

**Server**: Uses engine functions to process game state. Manages WebSocket connections, Redis persistence, lobbies.

**UI**: Renders state from server. Sends actions via WebSocket. Imports **types only** from engine (not functions). No local game logic.

### Data Flow

```
User Input → UI → WebSocket → Server → Engine → New State → Server → WebSocket → UI
```

## Game Overview

Turn-based tactical space combat for 2–4 players. Ships orbit gravity wells, manage energy/heat, fire weapons, and race to complete 3 secret missions.

**Win condition**: First player to complete 3 missions wins.

**Full rules**: See `RULES.md` — the authoritative tabletop game manual.

## Game Rules Summary

See `RULES.md` for complete rules. Key mechanics:

1. **Energy System**: 10-unit reactor, allocate to subsystems, unlimited deallocation
2. **Heat-on-Use**: Subsystems generate heat = allocated energy ONLY when used
3. **Dissipation**: Base 5 capacity. Excess heat at turn start → hull damage, then heat resets.
4. **Shields**: Convert incoming damage to heat (up to allocated energy, max 4)
5. **Critical Hits**: 10% base chance (d10=10). Sensor array adds +20% each when powered.
6. **Orbital Movement**: Variable velocity per ring (1–8 sectors/turn). Inner rings are faster.
7. **Ring Transfers**: Immediate burns (soft/medium/hard). Prograde=outward, retrograde=inward.
8. **Well Transfers**: Jump BH↔Planet at outermost rings via fixed transfer sectors. Costs 3 mass.
9. **Weapons**: Railgun (spinal, 4dmg), laser (broadside, 2dmg), missiles (turret, 2dmg, guided), ballistic rack/PDC (1dmg, intercepts missiles)
10. **Missions**: Destroy ship, deliver cargo, intercept transmission. Draw 5 keep 3 at game start.

## Multi-Gravity-Well System

### Layout

- **1 Black Hole** at center — 5 rings (velocities: 8, 6, 4, 2, 1)
- **3 Planets** (Alpha, Beta, Gamma) at 120° intervals — 3 rings each (velocities: 4, 2, 1)
- **All rings have 24 sectors**

### Ring Velocities

| Well | Ring 1 | Ring 2 | Ring 3 | Ring 4 | Ring 5 |
|------|--------|--------|--------|--------|--------|
| BH   | 8      | 6      | 4      | 2      | 1      |
| Planet | 4    | 2      | 1      | —      | —      |

### Transfer Points (Fixed)

Transfers occur between BH Ring 5 and Planet Ring 3 at specific sectors:

| Planet | BH → Planet | Planet → BH |
|--------|-------------|-------------|
| Alpha  | BH R5 S18 → Alpha R3 S5 | Alpha R3 S18 → BH R5 S5 |
| Beta   | BH R5 S2 → Beta R3 S5 | Beta R3 S18 → BH R5 S13 |
| Gamma  | BH R5 S10 → Gamma R3 S5 | Gamma R3 S18 → BH R5 S21 |

### Space Stations

Each planet has a station orbiting on Ring 1 (velocity 4). Stations advance each round. Used for cargo pickup/delivery.

## Subsystem Reference

### Fixed (always present)

| Subsystem | Energy | Notes |
|-----------|--------|-------|
| Engines | 1–3 | Burns: soft(1), medium(2), hard(3) |
| Maneuvering Thrusters | 1 | Rotation |
| Fuel Scoop | 3 | Coast only. Recovers mass = ring velocity |

### Forward Slots (2)

| Subsystem | Energy | Notes |
|-----------|--------|-------|
| Railgun | 4 | 4 dmg, spinal arc, same ring, 5 sector range |
| Sensor Array | 2 | Passive: +20% crit chance when powered |

### Side Slots (4)

| Subsystem | Energy | Notes |
|-----------|--------|-------|
| Broadside Laser | 2 | 2 dmg, ±2 rings, ±1 sector, side-restricted |
| Shields | 1–4 | Absorbs damage as heat |
| Radiator | 0 (passive) | +2 dissipation capacity |
| Fuel Compressor | 0 (passive) | +6 max mass, free well transfers |
| Ballistic Rack (PDC) | 2 | 1 dmg, ±1 ring, intercepts missiles |

### Either Slot (forward or side)

| Subsystem | Energy | Notes |
|-----------|--------|-------|
| Missiles | 2 | 2 dmg, turret, ±2 rings, ±3 sectors, 4 ammo, guided |

## Mission System

Players draw 5 missions from a shuffled deck, keep 3 during the loadout phase.

**Mission types:**
- **Destroy Ship**: Reduce target's HP to 0 (they respawn)
- **Deliver Cargo**: Pick up at origin station, deliver to destination station
- **Intercept Transmission**: Shadow target (same ring, ±3 sectors, sensor array powered) for 1 turn → get scan data → deliver to any station

**Mission deck composition**: All possible destroy missions (1 per opponent), intercept missions (1 per opponent), and cargo missions (every planet-pair route), shuffled together. Each player draws 5, picks 3.

## Game Phases

1. **Loadout**: Draw 5 missions, pick 3. Choose ship loadout (2 forward + 4 side slots).
2. **Deployment**: Place ships on BH Ring 4, one per sector.
3. **Active**: Take turns. First to complete 3 missions wins.

## File Structure

### Engine (`engine/src/`)

```
models/          - Type definitions and configs
  game.ts        - Player, ShipState, GameState, actions, constants
  subsystems.ts  - SubsystemType, configs, weapon stats, passive effects
  missions.ts    - Mission types (destroy, cargo, intercept), Cargo
  rings.ts       - SECTORS_PER_RING (24), burn costs, adjustment range
  gravityWells.ts - BH (5 rings) + 3 planets (3 rings), TRANSFER_POINTS
  transferPoints.ts - Fixed transfer sector calculations
game/            - Core game engine
  turns.ts       - Turn execution, phase sequencing
  actionProcessors.ts - Process all action types
  movement.ts    - Orbital movement, burns, rotation
  energy.ts      - Allocation/deallocation
  heat.ts        - Heat generation, dissipation, damage
  damage.ts      - Weapon damage, shields, critical hits (d10)
  missiles.ts    - Missile tracking, interception, PDC
  cargo.ts       - Cargo pickup/delivery at stations
  stations.ts    - Station creation and orbital movement
  loadout.ts     - Loadout validation, subsystem creation
  deployment.ts  - Ship placement on BH Ring 4
  respawn.ts     - Respawn at BH Ring 4, preserve cargo
  validation.ts  - Action validation
  missions/      - Mission deck, dealing, completion checks
  lobby/         - Lobby management
ai/              - Bot AI and movement planning
  movementPlanner/ - Multi-turn pathfinding (BFS, cross-well routing)
utils/           - Pure helpers (weapon range, subsystem helpers)
test/            - Vitest test suites
```

### Server (`server/src/`)

```
services/
  gameService.ts    - Game creation, loadout submission, turn execution
  lobbyService.ts   - Lobby CRUD
  playerService.ts  - Player sessions
  redis.ts          - Redis connection
websocket/
  gameHandler.ts    - WebSocket action handlers
  roomHandler.ts    - Room-based broadcasting
routes/
  game.ts           - REST endpoints (loadout, deploy, etc.)
  lobby.ts          - Lobby endpoints
  player.ts         - Player endpoints
```

### UI (`ui/src/`)

```
components/
  board/            - SVG game board (gravity wells, rings, ships)
  actions/          - Action panels (movement, weapons, energy)
  loadout/          - Loadout selection UI
  lobby/            - Lobby and matchmaking
  LoadoutScreen.tsx - Mission selection + loadout configuration
  ControlPanel.tsx  - Main game controls
context/
  LobbyContext.tsx  - Lobby + loadout state management
  GameContext.tsx   - Game state (WebSocket-based)
  PlayerContext.tsx - Player identity
api/
  game.ts           - HTTP API calls
  client.ts         - Base API client
```

## Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| Reactor capacity | 10 | `models/game.ts` |
| Base dissipation | 5 | `models/game.ts` |
| Starting reaction mass | 10 | `models/game.ts` |
| Starting HP | 10 | `utils/subsystemHelpers.ts` |
| Sectors per ring | 24 | `models/rings.ts` |
| BH rings | 5 (vel: 8,6,4,2,1) | `models/gravityWells.ts` |
| Planet rings | 3 (vel: 4,2,1) | `models/gravityWells.ts` |
| Burn costs | soft:1, med:2, hard:3 | `models/rings.ts` |
| Well transfer cost | 3 mass, 3 energy | `models/rings.ts` |
| Max sector adjustment | ±3 | `models/rings.ts` |
| Critical hit chance | 10% base | `game/damage.ts` |
| Missions to win | 3 | `models/missions.ts` |
| Mission offers | 5 (keep 3) | `game/missions/missionDeck.ts` |

## Development Commands

```bash
# Install
yarn install

# Development
yarn dev              # UI on localhost:5173
yarn dev:server       # Server on localhost:3000
yarn dev:all          # Both concurrently

# Build
yarn build            # All packages
yarn build:engine     # Engine only (must build first for server/UI)

# Test
yarn test             # All engine tests (vitest)
yarn workspace @dangerous-inclinations/engine test --run  # Single run

# Redis (required for server)
docker-compose up -d
```

## Development Guidelines

### Adding a Feature

1. Check `RULES.md` — does this make sense for tabletop?
2. Add types to `engine/src/models/`
3. Add logic to `engine/src/game/` (pure functions)
4. Add tests to `engine/src/test/`
5. Update server handlers in `server/src/`
6. Update UI components in `ui/src/`
7. Update `RULES.md`

### Common Pitfalls

- **Wrong ring count**: BH has 5 rings, planets have 3. Transfer: BH Ring 5 ↔ Planet Ring 3.
- **Wrong velocity**: Rings have variable velocity (not all 1). Check `gravityWells.ts`.
- **UI game logic**: UI should never compute game state. Send actions to server.
- **Visualization**: Always use `getGravityWellPosition()` + `getSectorRotationOffset()` for positioning.
- **Player model**: Players have `missionOffers` (5 drawn), `missions` (3 chosen), `cargo`, `ship`.

### Testing Player Objects

When creating test `Player` objects, always include `missionOffers: []`:

```typescript
const player: Player = {
  id: "player1",
  name: "Alpha",
  ship: createInitialShipState({ wellId: "blackhole", ring: 3, sector: 0, facing: "prograde" }),
  missionOffers: [],
  missions: [],
  completedMissionCount: 0,
  cargo: [],
  hasDeployed: true,
  hasSubmittedLoadout: true,
};
```
