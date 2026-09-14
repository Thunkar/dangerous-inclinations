# Dangerous Inclinations

A tactical space game of orbital manoeuvre, heat management and hidden objectives for 2–4 players. It is designed as a **board game**; this repository is the digital prototype used to playtest the rules with bots and with people.

- **Rules:** [RULES.md](RULES.md)
- **Design notes:** [docs/redesign.md](docs/redesign.md)
- **Client/server protocol:** [docs/protocol.md](docs/protocol.md)
- **Development guide:** [CLAUDE.md](CLAUDE.md)

## Packages

| Package | What |
|---------|------|
| `engine/` | Pure game rules, bot AI, headless simulator |
| `server/` | Fastify + WebSocket + Redis game server |
| `ui/` | React client |

## Quick start

```bash
yarn install
docker-compose up -d          # Redis
yarn build:engine
yarn dev:all                  # server on :3000, UI on :5173
```

## Simulating

```bash
yarn workspace @dangerous-inclinations/engine sim --games=200 --bots=3 --baseSeed=1
```

Runs bot-vs-bot games on worker threads and prints game length, mission completion by type, combat volume, docking and lane usage, and how much of each loadout stayed hidden.

## Tests

```bash
yarn workspace @dangerous-inclinations/engine test --run
```
