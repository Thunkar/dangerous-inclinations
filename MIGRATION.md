# Migration to Multiplayer Architecture - Completed

## Summary

Successfully refactored **Dangerous Inclinations** from a single-package React app to a true multiplayer-ready monorepo with three packages:

1. **`engine/`** - Pure game logic (no UI dependencies)
2. **`ui/`** - React frontend
3. **`server/`** - Fastify + Redis + WebSocket backend

## What Was Done

### ✅ 1. Monorepo Structure Created

```
dangerous-inclinations/
├── engine/          # @dangerous-inclinations/engine
│   ├── src/
│   │   ├── game-logic/    # All game rules and logic
│   │   ├── types/         # GameState, PlayerAction, etc.
│   │   ├── constants/     # Rings, gravity wells, weapons
│   │   └── utils/         # Weapon range, transfer points, etc.
│   ├── package.json
│   └── tsconfig.json
├── ui/              # @dangerous-inclinations/ui
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── context/       # Game state context
│   │   └── ai/            # Bot logic (UI-specific)
│   ├── package.json
│   └── vite.config.ts
├── server/          # @dangerous-inclinations/server
│   ├── src/
│   │   ├── routes/        # HTTP endpoints
│   │   ├── schemas/       # Zod validation
│   │   ├── services/      # Business logic
│   │   └── websocket/     # WebSocket handlers
│   └── package.json
└── package.json     # Workspace root
```

### ✅ 2. Engine Package

**Completely UI-independent** - can run in Node.js, browser, or any JS environment.

**Exports:**

- All game logic (movement, combat, energy, heat, etc.)
- Type definitions (GameState, PlayerAction, Ship, etc.)
- Constants (gravity wells, rings, weapons)
- Utilities (weapon range, transfer points, tactical sequence)

**Build:** TypeScript compiled to `engine/dist/`

### ✅ 3. Server Package

**Fastify + TypeScript + Redis + WebSocket**

#### HTTP Endpoints (Player & Lobby Management)

**Player Authentication:**

- `POST /api/players` - Create/authenticate player
  - Accepts optional `playerId` (from localStorage)
  - Returns `{ playerId, playerName }`
- `GET /api/players/:playerId` - Get player info

**Lobby Management:**

- `POST /api/lobbies` - Create lobby (password-protected optional)
- `GET /api/lobbies` - List all lobbies
- `GET /api/lobbies/:lobbyId` - Get lobby details
- `POST /api/lobbies/join` - Join lobby with optional password
- `POST /api/lobbies/:lobbyId/leave` - Leave lobby
- `POST /api/lobbies/:lobbyId/start` - Start game (host only)

**Authentication:** All requests require `x-player-id` header (except player creation)

#### WebSocket (Game Actions)

**Connection:** `ws://localhost:3000/ws/game/:gameId`

**Client → Server:**

```typescript
{
  type: "SUBMIT_TURN",
  payload: {
    gameId: string,
    actions: PlayerAction[]  // From engine types
  }
}
```

**Server → Client:**

```typescript
{
  type: "GAME_STATE",
  payload: GameState  // Full game state from engine
}
```

#### Zod Validation

All requests validated with Zod schemas:

- `CreatePlayerSchema`
- `CreateLobbySchema`, `JoinLobbySchema`
- `PlayerActionSchema` (all action types: allocate, deallocate, burn, coast, fire weapons, etc.)
- `SubmitTurnSchema`

### ✅ 4. UI Package

**React + Vite + Material-UI**

**Changes:**

- All imports updated to use `@dangerous-inclinations/engine`
- Old relative imports (`../types/game`, `../game-logic/`, etc.) → `@dangerous-inclinations/engine`
- GameContext now ready to connect to WebSocket (currently uses local engine)

### ✅ 5. Yarn 4 Workspaces

Upgraded from Yarn 1 to Yarn 4 for proper workspace support with `workspace:*` protocol.

**Scripts:**

- `yarn dev` - Start UI only
- `yarn dev:server` - Start server only
- `yarn dev:all` - Start both (requires Redis)
- `yarn build` - Build all packages
- `yarn build:engine` / `yarn build:ui` / `yarn build:server` - Build individual packages
- `yarn test` - Run engine tests

## How to Use

### Development Setup

1. **Install dependencies:**

   ```bash
   yarn install
   ```

2. **Start Redis** (required for server):

   ```bash
   docker run -d -p 6379:6379 redis:latest
   ```

3. **Start server:**

   ```bash
   yarn dev:server
   # Server runs on http://localhost:3000
   ```

4. **Start UI:**

   ```bash
   yarn dev
   # UI runs on http://localhost:5173
   ```

   Or start both:

   ```bash
   yarn dev:all
   ```

### Client Integration Flow

1. **Player Authentication:**

   ```typescript
   // Check localStorage for playerId
   let playerId = localStorage.getItem("playerId");

   // If not found, create new player
   if (!playerId) {
     const res = await fetch("http://localhost:3000/api/players", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ playerName: "Alice" }),
     });
     const player = await res.json();
     playerId = player.playerId;
     localStorage.setItem("playerId", playerId);
   }
   ```

2. **Create/Join Lobby:**

   ```typescript
   // Create lobby
   const res = await fetch("http://localhost:3000/api/lobbies", {
     method: "POST",
     headers: {
       "Content-Type": "application/json",
       "x-player-id": playerId,
     },
     body: JSON.stringify({
       lobbyName: "My Game",
       password: "optional",
       maxPlayers: 6,
     }),
   });
   const lobby = await res.json();

   // Or join existing lobby
   const res2 = await fetch("http://localhost:3000/api/lobbies/join", {
     method: "POST",
     headers: {
       "Content-Type": "application/json",
       "x-player-id": playerId,
     },
     body: JSON.stringify({
       lobbyId: lobby.lobbyId,
       password: "optional",
     }),
   });
   ```

3. **Start Game:**

   ```typescript
   const res = await fetch(
     `http://localhost:3000/api/lobbies/${lobbyId}/start`,
     {
       method: "POST",
       headers: { "x-player-id": playerId },
     },
   );
   const { gameId } = await res.json();
   ```

4. **Connect WebSocket:**

   ```typescript
   const ws = new WebSocket(`ws://localhost:3000/ws/game/${gameId}`);

   ws.onmessage = (event) => {
     const message = JSON.parse(event.data);
     if (message.type === "GAME_STATE") {
       setGameState(message.payload);
     }
   };

   // Submit turn
   ws.send(
     JSON.stringify({
       type: "SUBMIT_TURN",
       payload: {
         gameId: gameId,
         actions: [
           {
             type: "ALLOCATE_ENERGY",
             payload: { subsystem: "engines", amount: 3 },
           },
           {
             type: "BURN",
             payload: { intensity: "medium", direction: "prograde" },
           },
         ],
       },
     }),
   );
   ```

## Architecture Benefits

### ✅ Complete Separation of Concerns

- **Engine:** Pure game logic, no UI dependencies
- **UI:** Rendering only, no game calculations
- **Server:** Authoritative game state, validates actions

### ✅ Multiplayer-Ready

- Server runs game engine authoritatively
- Clients send actions via WebSocket
- Server broadcasts state updates to all players
- Impossible for clients to cheat (all logic server-side)

### ✅ Type Safety

- Engine exports TypeScript types
- Server validates all inputs with Zod
- UI gets full type inference from engine

### ✅ Testability

- Engine can be tested in isolation (no UI setup needed)
- Server routes can be tested with HTTP requests
- UI can mock the engine for component tests

## Next Steps

### Required for Full Multiplayer

1. **Game Initialization** (server/src/services/gameService.ts)
   - Currently placeholder
   - Need to create initial game state from lobby player list
   - Use engine's initialization functions

2. **UI WebSocket Integration**
   - Update `GameContext.tsx` to connect to server WebSocket
   - Replace local game engine calls with WebSocket messages
   - Handle reconnection logic

3. **Player ID Header in WebSocket**
   - Browser WebSocket doesn't support custom headers
   - Options:
     - Send `playerId` as first message after connection
     - Use query parameter in WebSocket URL
     - Use a WebSocket library that supports headers

### Recommended Enhancements

- [ ] Add JWT authentication (replace simple playerId header)
- [ ] Add rate limiting (prevent spam actions)
- [ ] Add game spectator mode
- [ ] Add game replay/history
- [ ] Move AI bot logic to server (server-side bots)
- [ ] Add lobby chat
- [ ] Add player kick/ban
- [ ] Add game pause/resume
- [ ] Add turn timeouts
- [ ] Persist game state to disk (Redis + periodic snapshots)

## Files Changed

### Deleted (Old Structure)

- `src/` (top level) - Moved to `ui/src/`
- `index.html`, `vite.config.ts`, `tsconfig.*.json` (top level) - Moved to `ui/`

### Added (New Structure)

- `engine/` - Complete new package
- `server/` - Complete new package
- `ui/` - Moved and updated from old `src/`
- `SETUP.md` - Setup and API documentation
- `MIGRATION.md` - This file

### Modified

- `package.json` - Now workspace root with Yarn 4
- `.yarnrc.yml` - Yarn 4 configuration
- `.yarn/` - Yarn 4 release files
- All UI imports - Updated to use `@dangerous-inclinations/engine`

## Testing

Engine build tested successfully:

```bash
cd engine && yarn build
# ✓ TypeScript compilation successful
# ✓ Declaration files generated
```

Dependencies installed successfully:

```bash
yarn install
# ✓ All workspace packages linked
# ✓ 436 packages installed
```

## Notes

- **Redis required** for server to run (stores game state and lobbies)
- **Player ID authentication** is basic (just a header) - implement proper auth for production
- **Game initialization** needs to be completed in `gameService.ts`
- **WebSocket auth** may need adjustment (browser limitations with headers)
- **AI module** currently in UI - consider moving to server for bot players

## Questions?

See [SETUP.md](./SETUP.md) for detailed setup instructions and API documentation.
