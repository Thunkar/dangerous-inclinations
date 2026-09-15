# The arena: humans and agents at one table

A playtest where people play in the browser, AI agents play through the seat
CLI, and everyone's reasoning is on the table.

## Pieces

- **The game server** (`yarn dev:server`, Redis via `docker compose up -d`) plays humans, bots and
  agents through one API. Every seat gets only its own `GameView`. Players, lobbies and games live
  there and nowhere else: the CLI keeps no state on your machine.
- **The UI** (`yarn dev`) is a seat's table. Its **Table talk** panel shows the chat: `say` lines are
  heard by everyone, `think` lines are a player's reasoning in italics with a "thinking" tag. Agent
  seats are labelled with their driver and model (`Codex · gpt-6-astra`) in the lobby and on their
  mats.
- **The seat CLI** (`yarn seat` in `server/`) is a seat for an agent or a person at a terminal:
  a player on the server, a lobby, loadout, deployment, a plain-text digest of the view with the
  legal moves, a dry run of any turn, submission over the same socket a browser uses, and chat.
- **The drivers** (`yarn seat agent`) let a model play a seat: Codex through `codex exec`
  (`gpt-6-astra` by default) or Claude through `claude -p` (`claude-fable-5-1` by default). The
  driver reads the digest, the model answers with `{think, say, intent}`, and the CLI builds,
  dry-runs and submits the turn, posting the thought and the table talk. Both run in the repository
  with read-only tools, so the model can open RULES.md itself.

There is no autopilot. The engine's dry run (`POST /api/games/:id/preview`) rejects an illegal turn
before it is sent and hands back its reasons; the intent builder fills in the cubes a move or a shot
needs; and the driver keeps asking the model, with the errors, the legal options as data and the
full RULES.md attached from the second attempt on, until the turn is legal. The human reads the
retries as "(legal on attempt N)" in the thought and, every fifth failed attempt, a line of table
talk.

## Starting fresh

```bash
docker compose up -d          # Redis
yarn dev:all                  # API server on :3000 and the UI on :5173 (or dev:server + dev in two terminals)
```

Open http://localhost:5173, give yourself a name, and either create a lobby there or let an agent
create one. Each agent seat is added from a terminal:

```bash
cd server
yarn seat                     # the menu
```

The menu asks for the server (Enter keeps http://localhost:3000), then **who sits down**: a new
Claude agent, a new Codex agent (name and model have defaults), a new person at this terminal, or
back into a seat that is already at one of the server's lobbies. It creates the player on the
server, lists the lobbies with their seats and lets you join one or create one (with bots). At the
table the host can start the game now or seat bots; anyone can wait for the host to start it from
the browser, or leave. When the game starts the menu prints the commands for that seat and, for an
agent, offers to start its driver right there.

## Seats live on the server

There is no identity file. A seat is named on every command with `--as <name>`, which finds the
non-bot player of that name at one of the server's lobbies (add `--lobby <id>` or `--game <id>` if
the same name sits at several tables), or with `--player <id>` (also `DI_PLAYER`). The game is the
one the seat's lobby started. Restart Redis and the players are gone with it: run `yarn seat` and
sit down again.

If you want the ids: `yarn seat lobbies` prints every lobby with its lobby id, each seat with its
player id and, once started, the game id; the browser's address bar carries `?game=<gameId>` while
you are at a table; `GET /api/lobbies/<lobbyId>` returns the seats and `gameId`.

## A session, command by command

```bash
cd server

# without the menu: players, a lobby, a start (a new player is at no table yet, so it goes by id)
CODEX=$(yarn seat register --name Codex --agent codex)                 # prints the player id
CLAUDE=$(yarn seat register --name Claude --agent claude)
LOBBY=$(yarn seat lobby --player $CLAUDE --name "Arena" --max 3)       # Claude hosts; prints the lobby id
yarn seat join --player $CODEX --lobby $LOBBY
# the human joins from the browser (or `yarn seat lobby ... --bots 1` for a bot); then
yarn seat start --as Claude                                            # host only; prints the game id

# the Codex seat plays itself, in its own terminal
yarn seat agent --as Codex                      # driver and model from the seat; add --turns N to stop after N turns

# the Claude seat, from a Claude Code session, one turn at a time
yarn seat wait --as Claude              # blocks until it is Claude's turn, prints the digest
yarn seat try --as Claude --intent '{"move":{"kind":"burn","intensity":"soft"}}'
yarn seat act --as Claude --intent '{...}' --think "why" --say "table talk"
# or let `claude -p` play it:
yarn seat agent --as Claude

# anyone
yarn seat lobbies
yarn seat chat --as Claude
yarn seat say --as Claude "good game"
yarn seat leave --as Claude
```

Setup phases: `yarn seat loadout --as X` prints the offers and presets; `--forward ... --sides ...
--missions ...` submits. `yarn seat deploy --as X --sector N`. The drivers handle both on their own,
retrying with the server's reason if a choice is refused.

The digest (`yarn seat view`) is what the agent reads: rules in brief (`--rules`), the ship and its
cubes, cards with their progress, opponents' public information and known tiles, stations, missiles,
**LEGAL THIS TURN** (burns with their costs, the jump if any, each weapon's targets before and after a
coast, scan targets, heat budget) and the events since the last turn. `yarn seat options` gives the
same as JSON; `yarn seat guide` prints the intent format.

`--driver claude|codex` and `--model` override what is stored with the seat, so a person's seat can
be handed to a model for a while. Prompts and answers of the drivers are kept in
`~/.config/dangerous-inclinations/logs/<game>-<seat>.log`; that directory holds nothing else.

## Reading a game afterwards

The recording (`?replay=<id>` in the UI, `/api/recordings`) holds every turn; the chat holds the
reasoning. Together they are the playtest record.
