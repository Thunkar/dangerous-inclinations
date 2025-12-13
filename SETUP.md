# Dangerous Inclinations - Monorepo Setup Guide

## Architecture Overview

This project is now organized as a monorepo with three packages:

```
dangerous-inclinations/
├── engine/          # Pure game logic (no UI dependencies)
├── ui/              # React frontend
├── server/          # Fastify backend with WebSocket support
└── package.json     # Workspace root
```

## Package Structure

### 🎮 Engine (`@dangerous-inclinations/engine`)

The core game engine containing:

- All game logic (actions, turns, movement, combat)
- Type definitions (GameState, PlayerAction, etc.)
- Constants (rings, gravity wells, weapons)
- Utilities (weapon range, transfer points, etc.)

**No UI dependencies** - can be used by both client and server.

### 🖥️ UI (`@dangerous-inclinations/ui`)

React-based frontend:

- Game board visualization
- Control panels
- Player interactions
- WebSocket client for multiplayer

### 🚀 Server (`@dangerous-inclinations/server`)

Fastify + TypeScript + Redis server:

- HTTP API for player auth and lobby management
- WebSocket for real-time game actions
- Redis for persistent game state
- Zod validation for all requests

## Initial Setup

### Prerequisites

- Node.js 18+
- Yarn 1.22.22 (specified in package.json)
- Redis server (for multiplayer)

### Installation

```bash
# Install all dependencies
yarn install
```

This will install dependencies for all three packages.

## Development

### Start UI Only (Single Player)

```bash
yarn dev
```

Starts the UI at http://localhost:5173

### Start Server Only

```bash
yarn dev:server
```

Starts the server at http://localhost:3000

**Note:** You need Redis running locally. See [Redis Setup](#redis-setup) below.

### Start Both (Multiplayer)

```bash
yarn dev:all
```

Starts both server and UI concurrently.

## Redis Setup

The server requires Redis for storing game state and lobby information.

### Option 1: Local Redis (Docker)

```bash
docker run -d -p 6379:6379 redis:latest
```

### Option 2: Local Redis (Native)

Install Redis for your platform and start it:

- **Windows**: Use WSL or Redis for Windows
- **macOS**: `brew install redis && brew services start redis`
- **Linux**: `sudo apt install redis-server && sudo systemctl start redis`

### Option 3: Remote Redis

Set environment variables in `server/.env`:

```env
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your-password
```

## Environment Variables

### Server (`server/.env`)

Copy `server/.env.example` to `server/.env` and configure:

```env
PORT=3000
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5173

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

## Building

### Build All Packages

```bash
yarn build
```

### Build Individual Packages

```bash
yarn build:engine
yarn build:ui
yarn build:server
```

## Testing

```bash
# Run engine tests
yarn test
```

## API Documentation

### HTTP Endpoints

#### Player Management

- `POST /api/players` - Create or authenticate player

  ```json
  {
    "playerId": "uuid-optional",
    "playerName": "John Doe"
  }
  ```

- `GET /api/players/:playerId` - Get player info

#### Lobby Management

- `POST /api/lobbies` - Create lobby (requires `x-player-id` header)

  ```json
  {
    "lobbyName": "My Game",
    "password": "optional",
    "maxPlayers": 6
  }
  ```

- `GET /api/lobbies` - List all lobbies

- `GET /api/lobbies/:lobbyId` - Get lobby details

- `POST /api/lobbies/join` - Join lobby (requires `x-player-id` header)

  ```json
  {
    "lobbyId": "uuid",
    "password": "optional"
  }
  ```

- `POST /api/lobbies/:lobbyId/leave` - Leave lobby

- `POST /api/lobbies/:lobbyId/start` - Start game (host only)

### WebSocket

#### Connect to Game

```
ws://localhost:3000/ws/game/:gameId
```

Query params: `x-player-id` header required

#### Messages

**Client → Server:**

```json
{
  "type": "SUBMIT_TURN",
  "payload": {
    "gameId": "uuid",
    "actions": [
      {
        "type": "ALLOCATE_ENERGY",
        "payload": {
          "subsystem": "engines",
          "amount": 3
        }
      }
    ]
  }
}
```

**Server → Client:**

```json
{
  "type": "GAME_STATE",
  "payload": {
    // Full GameState object
  }
}
```

```json
{
  "type": "ERROR",
  "payload": {
    "message": "Error description"
  }
}
```

## Client Integration

### Player Authentication Flow

```typescript
// 1. Check localStorage for existing playerId
let playerId = localStorage.getItem("playerId");

// 2. If no playerId, create new player
if (!playerId) {
  const response = await fetch("http://localhost:3000/api/players", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerName: "My Name" }),
  });
  const player = await response.json();
  playerId = player.playerId;
  localStorage.setItem("playerId", playerId);
}

// 3. Use playerId in all subsequent requests via x-player-id header
```

### WebSocket Connection

```typescript
const ws = new WebSocket(`ws://localhost:3000/ws/game/${gameId}`);

// Add player ID as header (use query param workaround for browser WebSocket)
// Better: use a WebSocket library that supports headers

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "GAME_STATE") {
    // Update local game state
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
        /* player actions */
      ],
    },
  }),
);
```

## Project Structure Details

### Engine Exports

The engine exports everything through a single entry point:

```typescript
import {
  // Types
  type GameState,
  type PlayerAction,
  type Ship,

  // Logic
  executeTurn,
  processActions,

  // Constants
  GRAVITY_WELLS,
  RINGS,

  // Utils
  calculateWeaponRange,
  getTransferPoints,
} from "@dangerous-inclinations/engine";
```

### Server Architecture

- **Routes** (`src/routes/`): HTTP endpoint handlers
- **Schemas** (`src/schemas/`): Zod validation schemas
- **Services** (`src/services/`): Business logic (player, lobby, game)
- **WebSocket** (`src/websocket/`): WebSocket handlers for real-time game

### UI Components

- **GameBoard**: SVG visualization (multi-gravity-well system)
- **ControlPanel**: Energy allocation, movement, weapons
- **Context**: Game state management (will be replaced with WebSocket)

## Migration Notes

### Breaking Changes

1. **Import paths changed**: All engine imports now use `@dangerous-inclinations/engine`
2. **Context may need updates**: GameContext should connect to WebSocket instead of local state
3. **AI module**: Still in UI, may need to be moved or refactored for server-side bots

### TODO

- [ ] Initialize game state properly in `gameService.ts` (currently placeholder)
- [ ] Update UI GameContext to use WebSocket instead of local game engine
- [ ] Implement proper game initialization from lobby
- [ ] Add authentication/authorization (currently just playerId in header)
- [ ] Add rate limiting and security measures
- [ ] Move AI to server for server-side bot players (optional)
- [ ] Add spectator mode
- [ ] Add reconnection handling for WebSocket
- [ ] Add game replay/history

## Troubleshooting

### "Cannot find module '@dangerous-inclinations/engine'"

Run `yarn install` at the root to set up workspace links.

### "Redis connection failed"

Ensure Redis is running on localhost:6379 or set correct connection info in `server/.env`.

### TypeScript errors in UI after refactor

The import path updates were automated. Check for any remaining `../types/`, `../game-logic/`, etc. imports and replace with `@dangerous-inclinations/engine`.

### WebSocket connection refused

Ensure the server is running (`yarn dev:server`) before connecting from UI.

## Contributing

When adding new features:

1. **Game logic** → Add to `engine/src/game-logic/`
2. **Types** → Add to `engine/src/types/`
3. **API endpoints** → Add to `server/src/routes/`
4. **Validation** → Add Zod schemas to `server/src/schemas/`
5. **UI components** → Add to `ui/src/components/`

Always maintain the separation: **engine has no UI dependencies**, **UI has no game logic**.
