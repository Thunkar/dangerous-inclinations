# CLAUDE.md - Development Context for Dangerous Inclinations

## This is a tabletop game first

**Every rule must be playable at a table** with tiles, cubes, a d10, cards and a
pencil. The digital version exists to playtest the tabletop rules with bots.
Before adding or changing a mechanic ask: can it be tracked on paper, computed
with simple arithmetic, and explained in one sentence?

`RULES.md` is the authoritative player-facing manual. `docs/redesign.md`
records the reasoning behind the current rules. `docs/protocol.md` defines the
client/server messages.

## Monorepo

Yarn workspaces + turbo:

```
engine/   @dangerous-inclinations/engine   pure game logic, bots, simulator
server/   @dangerous-inclinations/server   Fastify + WebSocket + Redis
ui/       @dangerous-inclinations/ui       React 19 + Vite + MUI
```

### Separation of concerns

- **Engine**: pure functions, no I/O. All rules live here. `executeTurn(state,
  actions)` returns `{ gameState, events, errors? }`. The state carries no log:
  everything that happens is a typed `GameEvent` (`models/events.ts`).
- **Hidden information**: the server never sends `GameState` to a client. It
  sends `viewFor(state, playerId)` (`game/view.ts`) and events filtered with
  `filterEventsFor`. Bots decide from the same `GameView`.
- **Server**: owns state, runs bots, persists to Redis, records games.
- **UI**: renders a `GameView` from the logged-in player's perspective and
  sends actions. It may call **pure engine functions for previews** (ranges,
  projected positions, costs, missile paths) but never advances state.

Data flow: `UI → WebSocket → server → engine → new state → viewFor → UI`.

## Game summary

2–4 players. Ships orbit a black hole (5 rings) and three planets (3 rings
each); every ring has 24 sectors. Everyone deploys on black hole ring 4; that
sector is their Home (destroyed ships respawn there and lose two turns). Transfer lanes are one-way 4-sector arcs: each planet has an outbound lane
from black hole ring 5 to its ring 3 and an inbound lane back. Stations orbit planet ring 1 and are where cargo is
loaded, ships are repaired and data is delivered.

Loadout tiles (1 forward + 4 side slots) are **face-down** and revealed the
first time they do something; the energy cubes on every slot are public.
Scanning peeks at one tile privately. Completed missions are face-up. First to
3 points wins; four card types: destroy (worth 2), deliver, intercept, survey
(worth 1 each).
New mission types are proposed to the designer, never added unasked.

Turn: (respawn turn if destroyed) → energy → actions in chosen order (rotate,
one move: coast/burn/jump, fire, scan) → own missiles move → docking → heat
check (excess over dissipation = hull damage, reset) → missions → pass.
Stations advance at round end.

## Key files

```
engine/src/models/      game.ts (state, actions), subsystems.ts (tiles, ids), missions.ts,
                        events.ts, gravityWells.ts (rings, lanes), rings.ts (costs)
engine/src/game/        turns.ts (pipeline), actionProcessors.ts, validators.ts,
                        ship.ts (subsystem helpers, useSubsystem/reveal/break),
                        geometry.ts, movement.ts, targeting.ts, damage.ts, heat.ts,
                        missiles.ts, scan.ts, docking.ts, stations.ts, respawn.ts,
                        deployment.ts, setup.ts (createGame/submitLoadout),
                        missions/ (deck, checks), view.ts, describe.ts
engine/src/ai/          botDecideActions(view), botChooseLoadout, botChooseDeployment
engine/src/sim/         runGame, runBatch (workers), stats (from events), cli
engine/src/test/        vitest; helpers in testUtils.ts
server/src/             services/gameService.ts, websocket/roomHandler.ts, routes/
ui/src/                 context/, components/board/, components/table/
```

## Conventions

- Subsystems are addressed by stable id: `engines`, `rotation`, `scoop`,
  `forward-0`, `side-0`..`side-3`. Never by type or array index.
- Positions are `{ wellId, ring, sector }`; use `game/geometry.ts` for sector
  arithmetic (never re-implement wrap-around).
- Anything visible that happens emits an event through the helpers in
  `ship.ts` (`useSubsystem`, `revealSubsystem`, `breakSubsystem`).
- Randomness only through `utils/rng.ts` against `GameState.rngState`. No
  `Math.random` in engine, ai, or server game logic.
- Tests: use `test/testUtils.ts`; every test must be able to fail; prefer
  `it.each` tables; don't assert on message strings.

## Commands

```bash
yarn install
yarn dev            # UI (localhost:5173)
yarn dev:server     # server (localhost:3000), needs Redis: docker-compose up -d
yarn dev:all
yarn build          # engine must build before server/ui typecheck
yarn workspace @dangerous-inclinations/engine test --run
yarn workspace @dangerous-inclinations/engine sim --games=100 --bots=3 --baseSeed=1
yarn workspace @dangerous-inclinations/engine sim --games=100 --bots=3 --baseSeed=1 --tiebreak --rules=shieldRefill=on_dock,dockHullRepair=1
yarn workspace @dangerous-inclinations/server smoke   # no Redis needed: leak checks on every message
```

Rule experiments: `engine/src/models/rules.ts` lists the knobs (defaults =
RULES.md). `--rules=k=v,...` overrides them for a sim run; the summary prints
turn behaviour (coast/burn/jump/firing shares, shield cubes, heat at check,
damage soaked) so a proposed rule change can be measured before it is adopted.
Bots read `view.rules` for the knobs that change what is legal or valuable.

The simulator is not exported from the engine's browser barrel (it uses worker
threads); import it by path or use `yarn sim`.

## Adding a rule

1. Write it in one sentence for `RULES.md`; if you can't, simplify it.
2. Types in `engine/src/models/`, logic in `engine/src/game/`, event(s) in
   `models/events.ts` + text in `game/describe.ts`.
3. Decide what is public and what is private (`view.ts`, event `privateTo`).
4. Teach the bots (`engine/src/ai/`) and run the sim to see the effect.
5. Tests, then server/UI.
