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
| GET | `/api/players/:playerId/status` | none | `{ player, lobby, view }`: the caller's lobby (if any) and its game view (once started); own id only, as for PUT. A game saved under other rules is `410` once: the player leaves its lobby on the way out |
| POST | `/api/lobbies` | `{ lobbyName, password?, maxPlayers? }` | the lobby, with the caller as host; `maxPlayers` is `MIN_PLAYERS`..`MAX_PLAYERS` (default `MAX_PLAYERS`) |
| GET | `/api/lobbies` | none | `{ lobbyId, lobbyName, hasPassword, maxPlayers, currentPlayers, gameStarted, createdAt }[]` |
| GET | `/api/lobbies/:lobbyId` | none | the lobby: seats, `hostPlayerId`, `hasPassword` and, once started, `gameId` (never the password) |
| POST | `/api/lobbies/join` | `{ lobbyId, password? }` | the lobby, or `400 { error }` (not found, full, started, wrong password); joining a lobby you already sit in returns it |
| POST | `/api/lobbies/:lobbyId/leave` | none | `{ success: true }`, or `404` for an unknown lobby; a host who leaves hands the lobby to the first remaining seat, and a lobby left with no humans is deleted with its game |
| POST | `/api/lobbies/:lobbyId/start` | none | `{ gameId }` (host only; `MIN_PLAYERS`..`MAX_PLAYERS` seats, at least one human, not started yet), or `400 { error }` |
| POST | `/api/lobbies/:lobbyId/bot` | `{ botName? }` | the lobby with a bot seat added (host only, before the start, not full), or `400 { error }` |
| DELETE | `/api/lobbies/:lobbyId/bot/:botId` | none | `{ success: true }` (host only, before the start), or `400 { error }` |

Every lobby route but the two GETs needs `x-player-id` (`401` without it; creating
and joining also refuse an unknown player with `401`). A body that fails its
schema is `400 { error, details }`.

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
| GET | `/api/games/:gameId/turns` | none | `{ turns: { index, turn, actorId, eventCount }[] }`: every player-turn so far the caller saw an event of, oldest first, with no views (the timeline); `404` before the game is active (the recording starts there) |
| GET | `/api/games/:gameId/turns/:index` | none | `{ from: GameView, to: GameView, events: GameEvent[] }`: that turn as the caller saw it, to replay over the board; `400` for an index that is not a non-negative integer, `404` past the end |
| POST | `/api/games/:gameId/loadout` | `{ loadout: ShipLoadout, missionIds: string[], appearance?: ShipAppearance }` | `{ view }` or `400 { error }` |
| POST | `/api/games/:gameId/deploy` | `{ ring: 2 \| 3 \| 4, sector: number }` | `{ view }` or `400 { error }`. Black Hole ring 2, 3 or 4, at least three sectors from every ship already placed (if no position is that clear, the clearest ones are legal instead); the position becomes the player's Home |
| POST | `/api/games/:gameId/preview` | `{ actions: PlayerAction[] }` (at most 64) | `{ ok, error?, errors?, events? }` (dry run of a turn against the live state, nothing committed; the tool agents use to never submit an illegal turn). `error` when it is not the caller's turn or the game is not active, `errors` for the engine's reasons; a malformed body is `400` with `ok: false` |
| GET | `/api/games/:gameId/chat` | none | `{ messages: ChatMessage[] }` (table talk, oldest first) |
| POST | `/api/games/:gameId/chat` | `{ text, kind?: "say" \| "think" }` (`text` 1–2000 characters after trimming, `kind` default `say`) | `{ message }`; broadcast to the table as a `CHAT` socket message. `say` is heard by everyone; `think` is a player's reasoning, shown to humans, not fed to other agents |
| POST | `/api/games/fork` | `{ recordingId, turnIndex, impersonateOriginalPlayerId }` (all required; `turnIndex` `-1` is the initial state) | `{ gameId, view }`, or `400 { error }` (archived recordings of the current schema only, from a snapshot after deployment; the seat must be your own original seat or a bot's). The fork has no lobby, so its `seats` is empty |
| GET | `/api/health` | none | `{ status, uptimeSeconds, botInvalidTurns, pendingFinalizations, recordingsDir }` |
| GET | `/api/recordings` | none | `{ recordings: { recordingId, createdAt, source, turnCount, winnerId?, label? }[] }`: the **finished** recordings made under the current recording schema, newest first |
| GET | `/api/recordings/:id` | none | a finished recording (full states; the game is over), `404` for an unknown one, or `410 { error }` for a stale one |

Every `/api/games/:gameId` route needs `x-player-id`: `401` without it, `404` for
an unknown game, `403` for a caller who is not one of its players. Fork needs it
too (`401` without it or for an unknown player). A loadout or deployment body
that fails its schema is `400 { error, details }`.

Loadout and deployment submissions for bots happen server-side through the AI
(`botChooseLoadout`, `botChooseDeployment` with the game's seeded RNG via
`pickIndex`).

## WebSocket (`/ws/game?playerId=&roomId=<gameId>`)

Server → client:

```ts
{ type: "CONNECTED", room: "game", roomId }
{ type: "GAME_VIEW", payload: { view: GameView, events: GameEvent[] } }
  // on connect (events = full filtered history), and to every seat after each
  // loadout or deployment submission (events = the deployments it made, the submitter's and the bots' that followed)
{ type: "TURN_EXECUTED", payload: {
    view: GameView,            // for this recipient
    events: GameEvent[],       // this turn's events, filtered for this recipient
    playerId: string,          // who acted
    turnNumber: number,
    actions?: PlayerAction[] } }  // actions only included when recipient === playerId
{ type: "TURN_ERROR", payload: { error?: string, errors?: string[] } }
  // only to the submitter: `errors` for a malformed message or the engine's reasons,
  // `error` for a stale or out-of-turn submission, a game not active, or a failed save
{ type: "CHAT", payload: { id, gameId, playerId, name, kind: "say" | "think", text, turn, at } }
  // a line posted with POST /api/games/:gameId/chat, to every seat
```

Client → server:

```ts
{ type: "SUBMIT_TURN", payload: { actions: PlayerAction[] /* at most 64 */, turn: number, activePlayerId: string } }
  // rejected with TURN_ERROR if turn/activePlayerId don't match the server state (stale or duplicate submission)
  // actions are schema-checked (strict discriminated union, finite integers); one malformed action rejects the submission
```

A turn's `PlayerAction[]` is tactical actions numbered from 1 in the order
they run: `power` (`{ subsystemId, amount? }`: shields 1 or 2, a ballistic
rack 2, a sensor array 2; absent is the subsystem's minimum), `rotate`, one of
`coast` / `burn` / `well_transfer`, `fire_weapon` and `scan`. Every action
puts energy on the subsystem it uses and it stays there until its owner's next
turn, when the loadout is cleared, so `allocatedEnergy` on a slot between
turns is what its owner used or powered last turn. A `power` emits the public
`subsystem_powered` event, which names the subsystem's type only if it is already
face-up: powering reveals nothing. Beside them a turn may carry one `repair`
(`{ subsystemId }`, no sequence): the subsystem a cold ship fixes if its heat is 0
at the check, and one `dock_sale` (`{ sale }`, no sequence): what the visit
does if the turn arrives at a station. A visit does one thing: `sale` is an
item's cargo id, `"fuel"` for a Tanker's pump (`SELL_FUEL`), `"load"` to load
the crates waiting there (`LOAD_CRATES`) or `"none"` to do nothing
(`SELL_NOTHING`). A station buys one item from each player, once per game;
loading is not a sale, so a station sold at still loads. A choice the visit
cannot make is not refused; without a `dock_sale`, or with one the visit
cannot make, the visit sells what completes the most mission points, ties
going to crates (loot included), then data, then fuel, and with nothing to
sell it loads. The engine's `salesOnArrival` gives the
sales on offer (each with its `sale`, `kind`, `missionId` and `points`), the
default, whether the station has bought from this player already
(`soldHere`) and the crates that load (`loads`). The public `docked` event
carries what was `sold` (`"crate" | "loot" | "data" | "fuel"`, null for
nothing), and `PlayerView.soldAt` lists the planets whose station has bought
from that player (public: a marker on the station).

A turn may also carry `escort_mark` actions (`{ carrierId }`, no sequence),
one per Escort card whose marker is in hand, each naming a different rival:
the marker goes on that ship at the end of the turn if the player is then on
its ring (same well, any sector), neither ship is moored and it carries a
crate or data; a name
that does not qualify by then is passed over, not refused. Without one, no
marker is placed. The engine's `escortCandidates(view, playerId, position)`
lists who qualifies. A moored ship can neither fire nor be fired at, so a
`fire_weapon` from a berth or at a moored target is refused.

A turn may also carry `seize` actions (`{ victimId, cargoId }`, no
sequence), one per Piracy card free to take an item (undone, with no loot of
its own aboard), each naming a different item: the item comes off that ship
at the end of the turn if the pirate then shares its sector, neither ship is
moored and the item is still aboard; one that is not there by then is passed
over, not refused. Without one, nothing is seized. The engine's
`seizableItems(view, playerId, position)` lists what qualifies.
`PlayerView.hold` is every item aboard a ship as `{ cargoId, kind }`, kind
`"crate" | "loot" | "data"`. The `cargoId` is an opaque `item-<n>` token dealt
with the card from a shuffled range: it names the item and says nothing about
the card behind it, so a rival's two pieces of data do not show which is an
Intercept's. The destination of a rival's crate stays private.

The view carries the public board state these cards add: `GameView.wrecks`
(`{ id, wellId, ring, sector }[]`, left where a ship is destroyed, drifting
with the stations), `PlayerView.escortedBy` (the ids of the players whose
Escort markers are on that ship). The events `wreck_left`,
`wreck_salvaged`, `escort_marked` and `escort_released` (`{ escortId,
carrierId, missionId, cause }`: the marker came off the carrier and back to
its owner, `cause` being `"carrier_destroyed"` or `"escort_destroyed"`) are
public, `stations_moved` carries the drifted `wrecks`, and
`mission_completed` can arrive for a player who is not the one taking the
turn (an Escort pays on the carrier's sale, with the escort in that planet's
well).

The game socket is closed with code 1008 when `playerId` or `roomId` is
missing, the player or game is unknown, or the player has no seat in the game
(1001 if the game is deleted during the handshake). `TURN_EXECUTED` is sent for
every committed turn, bots' included, and a connection resumes the bots of a
game left with one to act (after a server restart), so turns can arrive right
after the initial `GAME_VIEW` without anyone submitting.

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
                                                  // (the last human leaving deletes the lobby instead: LOBBY_DELETED on /ws/global)
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
4. A socket's initial `GAME_VIEW` comes before any `TURN_EXECUTED`: the
   socket joins the room inside the snapshot and its messages are held until
   that view is sent. A `SUBMIT_TURN` sent before then is queued, not dropped.
5. A game is torn down only after its last human socket has been closed for
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
`secondaryPaint` (`#` and six hex digits) and `livery` (`band`, `split`,
`chevron`, `stern`, `spine`: the pattern, always in the seat's colour). Those
three fields are all it accepts: the strict
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
