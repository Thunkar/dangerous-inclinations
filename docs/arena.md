# The arena: humans and agents at one table

A playtest where people play in the browser, AI agents play through the seat
CLI, and everyone's reasoning is on the table.

## Pieces

- **The game server** (`yarn dev:server`, Redis via `docker compose up -d`) plays humans, bots and
  agents through one API. Every seat gets only its own `GameView`.
- **The UI** (`yarn dev`) is a seat's table. Its **Table talk** panel shows the chat: `say` lines are
  heard by everyone, `think` lines are a player's reasoning in italics with a "thinking" tag.
- **The seat CLI** (`yarn seat` in `server/`) is a seat for an agent or a person at a terminal:
  identities, lobby, loadout, deployment, a plain-text digest of the view with the legal moves,
  a dry run of any turn, submission over the same socket a browser uses, and chat.
- **The Codex driver** (`yarn seat agent --driver codex`) plays a seat with `codex exec` and the
  `gpt-6-astra` model: it reads the digest, answers with `{think, say, intent}`, and the CLI builds,
  dry-runs and submits the turn, posting the thought and the table talk.

Agents cannot stall the game. The engine's dry run (`POST /api/games/:id/preview`) rejects an
illegal turn before it is sent; the intent builder fills in the cubes a move or a shot needs; and
when an intent is illegal twice or the model does not answer, the engine's own bot plays the turn
from the same view (`bot-turn`, `act --fallback`, and the driver, always).

## A session

```bash
# once
cd server
yarn seat register --as Codex
yarn seat register --as Claude

# per game (a person creates the lobby in the browser, or:)
yarn seat lobby --as Claude --name "Arena" --max 3          # prints the lobby id
yarn seat join --as Codex --lobby <lobbyId>
# the human joins from the browser; then
yarn seat start --as Claude --lobby <lobbyId>               # prints the game id
yarn seat use --as Codex --game <gameId>

# the Codex seat plays itself, in its own terminal
yarn seat agent --as Codex --driver codex                   # add --turns N to stop after N turns

# the Claude seat, from a Claude Code session, one turn at a time
yarn seat wait --as Claude              # blocks until it is Claude's turn, prints the digest
yarn seat try --as Claude --intent '{"move":{"kind":"burn","intensity":"soft"}}'
yarn seat act --as Claude --intent '{...}' --think "why" --say "table talk"

# anyone
yarn seat chat --as Claude
yarn seat say --as Claude "good game"
```

Setup phases: `yarn seat loadout --as X` prints the offers and presets; `--forward ... --sides ...
--missions ...` submits, `--auto` takes the bot's choice. `yarn seat deploy --as X --sector N` or
`--auto`. The driver handles both on its own.

The digest (`yarn seat view`) is what the agent reads: rules in brief (`--rules`), the ship and its
cubes, cards with their progress, opponents' public information and known tiles, stations, missiles,
**LEGAL THIS TURN** (burns with their costs, the jump if any, each weapon's targets before and after a
coast, scan targets, heat budget) and the events since the last turn. `yarn seat options` gives the
same as JSON; `yarn seat guide` prints the intent format.

Prompts and answers of the Codex driver are kept in
`~/.config/dangerous-inclinations/logs/<game>-<seat>.log`.

## Reading a game afterwards

The recording (`?replay=<id>` in the UI, `/api/recordings`) holds every turn; the chat holds the
reasoning. Together they are the playtest record.
