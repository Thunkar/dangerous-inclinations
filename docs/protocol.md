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
the name. `GET /api/players/:id/status` (own id only) returns the player, its
lobby and its game view; `GET /api/lobbies` and `GET /api/lobbies/:id` list
seats with their ids, `agent` and, once started, `gameId`. The seat CLI keeps
nothing locally and resolves a seat from these.

## REST (`/api/games`)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/games/:gameId` | — | `{ view: GameView, events: GameEvent[], seats }` (full filtered history; `seats` = `{ playerId, playerName, isBot, agent? }[]` from the lobby: who plays each seat) |
| POST | `/api/games/:gameId/loadout` | `{ loadout: ShipLoadout, missionIds: string[], appearance?: ShipAppearance }` | `{ view }` or `400 { error }` |
| POST | `/api/games/:gameId/deploy` | `{ wellId: string, sector: number }` | `{ view }` or `400 { error }` |
| POST | `/api/games/:gameId/preview` | `{ actions: PlayerAction[] }` | `{ ok, errors?, events? }` — dry run of a turn against the live state, nothing committed; the tool agents use to never submit an illegal turn |
| GET | `/api/games/:gameId/chat` | — | `{ messages: ChatMessage[] }` — table talk, oldest first |
| POST | `/api/games/:gameId/chat` | `{ text, kind?: "say" \| "think" }` | `{ message }`; broadcast to the table as a `CHAT` socket message. `say` is heard by everyone; `think` is a player's reasoning, shown to humans, not fed to other agents |
| POST | `/api/games/:gameId/rewind` | `{ turnIndex: number }` | `{ view }` (dev tool; live games only, refused once a game is finalized) |
| POST | `/api/games/fork` | `{ recordingId, turnIndex, impersonateOriginalPlayerId }` | `{ gameId, view }` (archived recordings only; the seat must be your own original seat or a bot's) |
| GET | `/api/health` | — | `{ status, uptimeSeconds, botInvalidTurns, pendingFinalizations, recordingsDir }` |
| GET | `/api/recordings` | — | list of **finished** recordings only |
| GET | `/api/recordings/:id` | — | a finished recording (full states; the game is over) |

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
    actions?: PlayerAction[],  // only included when recipient === playerId
    rewind?: true } }
{ type: "TURN_ERROR", payload: { error?: string, errors?: string[] } }
```

Client → server:

```ts
{ type: "SUBMIT_TURN", payload: { actions: PlayerAction[], turn: number, activePlayerId: string } }
  // rejected with TURN_ERROR if turn/activePlayerId don't match the server state (stale or duplicate submission)
  // actions are schema-checked (strict discriminated union, finite integers); one malformed action rejects the submission
```

Per-recipient sending: `sendToPlayer(room, roomId, playerId, message)` and
`broadcastViews(room, roomId, (playerId) => message)`; the old single-string
`broadcastToRoom` remains only for lobby messages that carry no game state.

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
recordings API only lists and serves finalized recordings.

### Ship appearance

Loadout submission optionally includes a version-1 `ShipAppearance`: `paint` and
`secondaryPaint` (six-digit hex), `livery` (`panels`, `bands`, `split`), `finish`
(`matte`, `metal`), and `armorRelief`, `spineHeight`, `wear` (finite 0–1). The strict
shared schema rejects extra fields, including custom player identification colors.
It is validated and saved atomically with loadout and mission choices, then locked
for the match. Appearance is public through `PlayerView.appearance` after submission;
slot identities remain filtered independently. Seat order still determines player
color. Older clients/saves/recordings without appearance use the reference corvette.
Appearance lives on `Player`, survives respawn and recording/fork, and never changes
gameplay rules or consumes gameplay RNG.
