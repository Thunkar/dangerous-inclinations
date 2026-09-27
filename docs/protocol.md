# Client ↔ Server Protocol

The server is authoritative and holds `GameState`. Clients never receive a
`GameState` during a live game: every message carries a `GameView`
(`engine/src/game/view.ts`) computed for the recipient with `viewFor(state,
playerId)`, plus the turn's `GameEvent[]` filtered with `filterEventsFor`.
Bots receive exactly the same view through `viewFor`.

## Identity

Every request carries the player id (`x-player-id` header on REST, `playerId`
query on the WebSocket). The server checks the player belongs to the game
before joining the room or answering. Player ids are not secrets; this is a
trust boundary against accidental leaks, not authentication.

## Players and lobbies

A player is `{ playerId, playerName, agent?, createdAt }`. `agent` is
`{ driver: "claude" | "codex", model }` when an outside program plays the seat
(a bot is the server's own AI, flagged `isBot` on the lobby seat); it is set
at `POST /api/players` and copied onto the lobby seat, so it is as public as
the name. The server picks every player id. A lobby seat is
`{ playerId, playerName, isBot, agent? }`. The seat CLI keeps nothing locally
and resolves a seat from these routes.

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/players` | `{ playerName, agent? }` | the new player; a body with any other field (a `playerId` included) is `400` |
| GET | `/api/players/:playerId` | none | the player, or `404` |
| PUT | `/api/players/:playerId` | `{ playerName }` | the renamed player; `x-player-id` must be that player (`401` without it, `403` for anyone else) |
| GET | `/api/players/:playerId/status` | none | `{ player, lobby, view }`: the caller's lobby (if any) and its game view (once started); own id only, as for PUT |
| POST | `/api/lobbies` | `{ lobbyName, password?, maxPlayers? }` | the lobby, with the caller as host; `maxPlayers` is `MIN_PLAYERS`..`MAX_PLAYERS` (default `MAX_PLAYERS`) |
| GET | `/api/lobbies` | none | `{ lobbyId, lobbyName, hasPassword, maxPlayers, currentPlayers, gameStarted, createdAt }[]` |
| GET | `/api/lobbies/:lobbyId` | none | the lobby: seats, `hostPlayerId`, `hasPassword` and, once started, `gameId` (never the password) |
| POST | `/api/lobbies/join` | `{ lobbyId, password? }` | the lobby, or `400 { error }` (full, started, wrong password) |
| POST | `/api/lobbies/:lobbyId/leave` | none | `{ success: true }`; a lobby left with no humans is deleted with its game |
| POST | `/api/lobbies/:lobbyId/start` | none | `{ gameId }` (host only; `MIN_PLAYERS`..`MAX_PLAYERS` seats, at least one human) |
| POST | `/api/lobbies/:lobbyId/bot` | `{ botName? }` | the lobby with a bot seat added (host only) |
| DELETE | `/api/lobbies/:lobbyId/bot/:botId` | none | `{ success: true }` (host only, before the start) |

Every lobby route but the two GETs needs `x-player-id`.

A lobby settles nothing but its name, its seats and its password: a game is
played to `DEFAULT_POINTS_TO_WIN` and there is no table agreement to negotiate.
The number still rides on `GameState.pointsToWin` and reaches every client as
the public `GameView.pointsToWin` (what the table is playing to is not hidden
information) and the simulator can still play a batch at another number
(`--rules=missionsToWin=4`).

## REST (`/api/games`)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/games/:gameId` | none | `{ view: GameView, events: GameEvent[], seats }` (full filtered history; `seats` = `{ playerId, playerName, isBot, agent? }[]` from the lobby: who plays each seat) |
| GET | `/api/games/:gameId/turns` | none | `{ turns: { index, turn, actorId, eventCount }[] }`: every player-turn so far the caller saw an event of, oldest first, with no views (the timeline) |
| GET | `/api/games/:gameId/turns/:index` | none | `{ from: GameView, to: GameView, events: GameEvent[] }`: that turn as the caller saw it, to replay over the board; `404` past the end |
| POST | `/api/games/:gameId/loadout` | `{ loadout: ShipLoadout, missionIds: string[], appearance?: ShipAppearance }` | `{ view }` or `400 { error }` |
| POST | `/api/games/:gameId/deploy` | `{ ring: 3 \| 4, sector: number }` | `{ view }` or `400 { error }`. Black Hole ring 3 or ring 4, at least three sectors from every ship already placed (if no position is that clear, the clearest ones are legal instead); the position becomes the player's Home |
| POST | `/api/games/:gameId/preview` | `{ actions: PlayerAction[] }` (at most 64) | `{ ok, errors?, events? }` (dry run of a turn against the live state, nothing committed; the tool agents use to never submit an illegal turn) |
| GET | `/api/games/:gameId/chat` | none | `{ messages: ChatMessage[] }` (table talk, oldest first) |
| POST | `/api/games/:gameId/chat` | `{ text, kind?: "say" \| "think" }` | `{ message }`; broadcast to the table as a `CHAT` socket message. `say` is heard by everyone; `think` is a player's reasoning, shown to humans, not fed to other agents |
| POST | `/api/games/fork` | `{ recordingId, turnIndex, impersonateOriginalPlayerId }` (all required) | `{ gameId, view }` (archived recordings of the current schema only; the seat must be your own original seat or a bot's) |
| GET | `/api/health` | none | `{ status, uptimeSeconds, botInvalidTurns, pendingFinalizations, recordingsDir }` |
| GET | `/api/recordings` | none | `{ recordings: { recordingId, createdAt, source, turnCount, winnerId?, label? }[] }`: the **finished** recordings made under the current recording schema, newest first |
| GET | `/api/recordings/:id` | none | a finished recording (full states; the game is over), or `410 { error }` for a stale one |

Loadout and deployment submissions for bots happen server-side through the AI
(`botChooseLoadout`, `botChooseDeployment` with the game's seeded RNG via
`pickIndex`).

## WebSocket (`/ws/game?playerId=&roomId=<gameId>`)

Server → client:

```ts
{ type: "CONNECTED", room: "game", roomId }
{ type: "GAME_VIEW", payload: { view: GameView, events: GameEvent[] } }
  // on connect (events = full filtered history) and on any phase change
{ type: "TURN_EXECUTED", payload: {
    view: GameView,            // for this recipient
    events: GameEvent[],       // this turn's events, filtered for this recipient
    playerId: string,          // who acted
    turnNumber: number,
    actions?: PlayerAction[] } }  // actions only included when recipient === playerId
{ type: "TURN_ERROR", payload: { error?: string, errors?: string[] } }
  // only to the submitter
{ type: "CHAT", payload: { id, gameId, playerId, name, kind: "say" | "think", text, turn, at } }
  // a line posted with POST /api/games/:gameId/chat, to every seat
```

Client → server:

```ts
{ type: "SUBMIT_TURN", payload: { actions: PlayerAction[], turn: number, activePlayerId: string } }
  // rejected with TURN_ERROR if turn/activePlayerId don't match the server state (stale or duplicate submission)
  // actions are schema-checked (strict discriminated union, finite integers); one malformed action rejects the submission
```

A turn's `PlayerAction[]` is tactical actions numbered from 1 in the order
they run: `power` (`{ subsystemId, amount? }`: shields 2 or 4, a ballistic
rack 2, a sensor array 2; absent is the subsystem's minimum), `rotate`, one of
`coast` / `burn` / `well_transfer`, `fire_weapon` and `scan`. Every action
puts energy on the subsystem it uses and it stays there until its owner's next
turn, when the loadout is cleared, so `allocatedEnergy` on a slot between
turns is what its owner used or powered last turn. A `power` emits the public
`subsystem_powered` event, which names the subsystem's type only if it is already
face-up: powering reveals nothing. Beside them a turn may carry one `repair`
(`{ subsystemId }`, no sequence): the subsystem a cold ship fixes if its heat is 0
at the check, and one `dock_job` (`{ job: "crates" | "data" | "fuel" }`, no
sequence): the one job the visit does if the turn arrives at a station. A job
the visit cannot do is not refused; without a `dock_job`, or with one the
visit cannot do, the visit does the job that completes the most mission
points, ties going to crates, then data, then fuel. The engine's
`dockJobsOnArrival` gives the jobs on offer and that default, and the public
`docked` event carries the `job` done (null when there was none).

A turn may also carry `escort_mark` actions (`{ carrierId }`, no sequence),
one per Escort card whose marker is in hand, each naming a different rival:
the marker goes on that ship at the end of the turn if the player then shares
its sector, neither ship is moored and it carries a crate or data; a name
that does not qualify by then is passed over, not refused. Without one, no
marker is placed. The engine's `escortCandidates(view, playerId, position)`
lists who qualifies. A moored ship can neither fire nor be fired at, so a
`fire_weapon` from a berth or at a moored target is refused.

The view carries the public board state these cards add: `GameView.wrecks`
(`{ id, wellId, ring, sector }[]`, left where a ship is destroyed, drifting
with the stations) and `PlayerView.escortedBy` (the ids of the players whose
Escort markers are on that ship). The events `wreck_left`, `wreck_salvaged`,
`escort_marked` and `escort_released` are public, `stations_moved` carries
the drifted `wrecks`, and `mission_completed` can arrive for a player who is
not the one taking the turn (an Escort pays on the carrier's delivery).

Per-recipient sending: `broadcastViews(room, roomId, (playerId) => message)`
builds every game message for its recipient; the single-string
`broadcastToRoom` is only for lobby and global messages, which carry no game
state.

## WebSocket (`/ws/global?playerId=` and `/ws/lobby?playerId=&roomId=<lobbyId>`)

Server to client only; both carry no game state.

```ts
// /ws/global: the lobby browser
{ type: "CONNECTED", room: "global" }
{ type: "LOBBY_CREATED", payload: { lobbyId, lobbyName, hasPassword, maxPlayers, currentPlayers, createdAt } }
{ type: "LOBBY_UPDATED", payload: { lobbyId, currentPlayers, gameStarted } }
{ type: "LOBBY_DELETED", payload: { lobbyId } }

// /ws/lobby: one lobby (only its seated players may connect)
{ type: "CONNECTED", room: "lobby", roomId }
{ type: "PLAYER_JOINED", payload: { playerId, playerName, isBot, agent? } }
{ type: "PLAYER_LEFT", payload: { playerId } }   // left through the route, or a bot removed
{ type: "GAME_STARTING", payload: { gameId } }   // each client then joins /ws/game for its own view
```

Seats change only through the lobby routes: a lobby socket that closes
leaves its seat where it is and announces nothing.

## Ordering guarantees

1. The server saves the new state (and appends to the recording) **before**
   sending `TURN_EXECUTED`.
2. Bot turns are executed one at a time in the same loop; each produces its
   own `TURN_EXECUTED`.
3. The human player set comes from the persisted registry
   (`getHumanPlayerIds`), never from who happens to be connected.
4. A game is torn down only after its last human socket has been closed for
   90 seconds with no human reconnecting, so reloads and flaky connections
   don't destroy a game in progress.

## Recordings

Live recordings hold full states and stay private until the game ends. The
recordings API only lists and serves finalized recordings. A recording whose
`schemaVersion` is not the engine's `RECORDING_SCHEMA_VERSION` was made under
other rules: it is left out of the list and refused by replay and fork,
never migrated.

A live game is stored with the same stamp, and one saved under other rules
is refused the same way: `410 { error }` on REST, the game socket closed
with code 1008, and `TURN_ERROR` for a turn submitted to it. It is never
migrated; the table starts a new game.

### Ship appearance

Loadout submission optionally includes a `ShipAppearance`: `paint` and
`secondaryPaint` (six-digit hex), `finish` (`matte`, `metal`), and `armorRelief`,
`spineHeight` (finite 0–1). Those five fields are all it accepts: the strict
shared schema rejects any other, custom player identification colors included,
and a submission carrying an appearance it rejects is refused whole.
It is validated and saved atomically with loadout and mission choices, then locked
for the match. Appearance is public through `PlayerView.appearance` after submission;
slot identities remain filtered independently. Seat order still determines player
color. A player who submits no appearance (bots and seat agents do not) flies the
reference corvette.
Appearance lives on `Player`, survives respawn and recording/fork, and never changes
gameplay rules or consumes gameplay RNG.

## Server environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3000` | HTTP and WebSocket port |
| `HOST` | `0.0.0.0` | interface to listen on |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | none | Redis password |
| `REDIS_DB` | `0` | Redis database number |
| `CORS_ORIGIN` | `http://localhost:5173` | the origin browsers may call the API from (the UI) |
| `RECORDINGS_DIR` | `./recordings` | where finished recordings are archived; point the sim CLI at the same folder to share them |
