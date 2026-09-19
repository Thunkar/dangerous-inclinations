# CLAUDE.md - Development Context for Dangerous Inclinations

## This is a tabletop game first

**Every rule must be playable at a table** with tiles, cubes, a d10, cards and a
pencil. The digital version exists to playtest the tabletop rules with bots.
Before adding or changing a mechanic ask: can it be tracked on paper, computed
with simple arithmetic, and explained in one sentence?

`RULES.md` is the authoritative player-facing manual and the only statement of
what the rules are. **Why** a rule is what it is lives in the commit that
changed it — `git log` is the design journal, and unlike a design document it
cannot go stale. `docs/protocol.md` defines the client/server messages;
`docs/benchmark.md` describes how the rules as they stand play. What is open
is the list at the end of this file; there is no handoff document, because a
snapshot goes stale and this file and the commits do not.

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

2–6 players. Ships orbit a black hole (5 rings) and three planets (4 rings
each); every ring has 24 sectors. Everyone deploys on black hole ring 4; that
sector is their Home (destroyed ships respawn there and lose two turns). Transfer lanes are one-way 4-sector arcs: each planet has an outbound lane
from black hole ring 5 to its ring 4 and an inbound lane back. Stations orbit planet ring 2, with a faster ring 1 inside them, and are where cargo is
loaded, ships are repaired and data is delivered.

Loadout tiles (1 forward + 4 side slots) are **face-down** and revealed the
first time they do something; the energy cubes on every slot are public.
Scanning peeks at one tile privately. Completed missions are face-up. Reaching
3 points triggers the final round: the round is played out, then highest score
wins (hull, then fuel, break ties). Six card types in two kinds: primaries
worth 2 (destroy, deliver, intercept) and secondary cards worth 1 (survey, board,
garbage disposal). Two physical decks for the table: rival cards count seats
("the 2nd to your left") so no card can name its own holder and none leaks who
is hunting whom; setup removes offsets the table is too small for. Deal 3
primaries and keep 1; take one off each of the three secondary stacks and keep
2 — five points held and three win, so the primary plus either secondary is the
win and the other secondary is the spare. The secondary offer is the same for
everyone, so those three have to be worth roughly the same or the choice is
fake.
New mission types are proposed to the designer, never added unasked.

Missiles fire in **salvos**: one action launches any number of a tile's missiles
at one ship, and that is **one use of the tile** — the 4-round magazine, refilled
at a station, is what limits missiles, not heat. A powered ballistic rack rolls
at **every** missile that reaches it, also for one use of the rack, and the two
halves stay together: a rack that answers a whole salvo is what keeps a salvo
that costs one tile's heat honest.

Turn: (respawn turn if destroyed) → energy → actions in chosen order (rotate,
one move: coast/burn/jump, fire, scan) → own missiles move → docking (on
arrival only) → heat
check (excess over dissipation = hull damage, reset) → missions → pass.
Stations advance at round end. The first round reaches nobody — no weapon
fires and nobody scans — because everyone deploys on one ring, so the opening
round is for getting off the line.

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
ui/src/                 context/ (game, animation, plan, boardMode), components/table/
ui/src/components/board/  model.ts (useBoardModel: all either renderer draws),
                        geometry.ts (board coordinates), GameBoard.tsx (the 2D/3D switch),
                        svg/ (the flat board), three/ (the WebGL board)
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
yarn workspace @dangerous-inclinations/engine sim --games=100 --bots=3 --baseSeed=1 --tiebreak --tiles=ballistic_rack.damage=3
yarn workspace @dangerous-inclinations/server smoke   # no Redis needed: leak checks on every message
yarn workspace @dangerous-inclinations/engine balance --quick   # balance regression: natural, baselines, logical, illogical, off-book, extreme; flags
yarn workspace @dangerous-inclinations/engine bench --output=../docs/benchmark.md  # the standing benchmark page
yarn workspace @dangerous-inclinations/server seat help          # a seat at the table for an agent or a terminal
node scripts/shot.mjs '/?showcase=1&seed=7&board=2d' shot.png   # photograph the running UI (needs `yarn dev`)
```

Arena (`yarn seat help`, and the header of `server/scripts/seat.ts`): agents
play through `yarn seat` (server): digest of
the view with legal moves, dry-run preview, intent → actions builder
(`engine/src/agent/`), chat with `say` and `think` lanes, and drivers for
Codex (`codex exec`) and Claude (`claude -p`). A player may carry
`agent: {driver, model}`, public like its name; the CLI keeps no local state
and finds a seat on the server by name (`--as`) or id (`--player`). No
autopilot: an illegal intent is refused before submission and the agent gets
the engine's reasons, the legal options and the full rules back until its
turn is legal.

Benchmark: `yarn bench` (engine) writes `docs/benchmark.md` — one page describing
how the rules as they stand play at 3/4/5/6 seats: length in rounds and in table
time, kills, the hulls bots chose and their win rates, and every card's pick rate
and payoff. It stamps the rules it ran under at the top, so two versions of the
page can be diffed to see what a rule change actually did. Keep the games and
seeds fixed between runs or the comparison is worthless. It is a description and
never fails; the gate is below.

Balance regression: `yarn balance` (engine) answers the designer's four
questions in six sections, every forced row at 3 players on seat 1: **natural**
play at 3/2/4; **baselines** (seat 1 dealt Destroy, Deliver or Intercept with
its own mat — the bar every row with that card is read against); **logical**
(the six presets with the card their role implies); **illogical** (a preset
with a card that fights it — sensor bow hauling, compressor hunting); **off-book**
(builds no preset has, with the card they are built for: sensor bow with two
launchers, a missile boat, a rack hunter, a hauler with point defence); and
**extreme** (nineteen wild hulls with a random legal hand, against the own-hand
bar). One table, one flag column. Failing flags: `outlier` (12+ points over its
bar), `stall` (20%+ of games at the cap), `slow` (a natural row), `unpunished`
(an illogical row not below its bar). Informational: `weak` (a preset 12+
under its bar with its own card), `dead` (an off-book build 12+ under),
`glass`, `bloody`, `diluted` (the forced hull stuck in under 90% of games; the
row's other flags are suppressed). Run it after any rule change; `--quick` for
40 games a row, `--games=200` for a number worth quoting, `--only=section` or
row ids, `--output=dir` to keep the table. A forced primary is *dealt* to the
seat, not filtered for, so a Destroy row is a Destroy row on every seed.

Rule experiments: the rules are constants in `engine/src/models/`, not knobs on
the state — a game is played under RULES.md and nothing else. A proposed change
is measured before it is adopted with the simulator's experiment-only override
channels, which mutate the configuration of the process running the batch:
`--tiles=fuel_compressor.slotType=side,ballistic_rack.damage=3` (any field of
any tile), `--weapons=laser.damage=3` (firing stats),
`--rules=missionsToWin=3,secondariesKept=3,compressedJumpFuel=1` (points to
win, the shape of a hand, what a compressed jump costs — `yarn bench --rules=`
takes it too and stamps it on the page), `--loadouts=` (the bots'
hull templates), `--seats=` (a hull forced on one seat) and `--hands=bot-1=destroy`
(the primary a seat is dealt and keeps — the bots price one road to the win
and take it every time, so a plan they never choose is only measurable dealt). The summary prints
turn behaviour (coast/burn/jump/firing shares, shield cubes, heat at check,
damage soaked). A change that survives its experiment moves into the models.

The batch runner and the sim CLI are not exported from the engine's browser
barrel (they use worker threads); use `yarn sim`. A single headless game
(`runGame`, `setupBotGame`) is pure and is exported, because the UI's
`?showcase=1` page builds its canned game with it in the browser.

Seeing a change: `scripts/shot.mjs` drives the running app with Playwright and
writes a PNG, reporting page errors and the text of the status block and turn
log. `?showcase=1` needs no server; `?game=<id>` with `localStorage.playerId`
set renders a real seat, which is the only way to see the turn column.

## The board has two renderers

`GameBoard.tsx` derives one `BoardModel` (`components/board/model.ts`) from the
view, the turn being animated and the plan being built, then hands it to either
the SVG board (`board/svg/`) or the WebGL board (`board/three/`, a lazy chunk).
Neither renderer computes anything rule-shaped: ranges, missile paths and
positions are all in the model, asked of the engine once, so the two boards
cannot drift.

Which one draws is `BoardModeContext` — remembered per player, forced to the
flat board without WebGL 2, and overridable per session with `?board=2d|3d`.
Time is not in the model: a sliding token carries its `motion` and an effect
its `start`/`duration`, and each renderer reads its own clock (`useBoardClock`
for the flat board, `useFrame` for the 3D one). Nothing in the 3D scene may
re-render per frame.

`?showcase=1` plays a bot game generated in the browser with no server —
`&seed=`, `&turns=`, `&seat=` — which is how board work is checked.

## Settled — do not re-propose without measuring

Tried and rejected, so a change that reinvents one of these needs new evidence,
not an argument:

- **Two-way lanes.** One-way costs ~9 rounds of length and is what gives the map
  a direction of travel (Alpha → Gamma → Beta → Alpha is the cheap circuit).
- **Destroy worth 1.** Bots never kept it. Raising it to 2 was the only single
  change that moved behaviour: gun hulls 57% → 91% of seats, kills 0.2 → 0.6.
- **Dealing 6 cards instead of 5.** Six offers raise the bar every card must
  clear; Intercept fell from 16.7% kept-when-offered to 1.7%.
- **An expensive Survey** (a named planet, two turns held on ring 1 with sensors).
  It worked, and the bots stopped keeping the card: a card nobody keeps is a
  missing card, not a priced one.
- **Shields absorbing a point per cube.** One powered tile was permanent immunity
  to every 2-damage weapon; 66% of declined shots were declined as unabsorbable.
- **Radiator at +1 or +3.** Measured after heat became a track: +1 widens the
  hull spread and lengthens games, +3 pushes the wall back up. +2 stays.
- **A bigger shield tile** (`shields.maxEnergy=6`) and **shields in the forward
  slot**. The first makes the game quieter (destructions 3.2 → 2.7), the second
  changes nothing — bots never spend the bow on a shield.
- **Making the engines and thrusters critical-proof** like the scoop, to stop a
  broken one stranding a ship. Solved instead by the cold repair (RULES §Energy
  and Heat), which keeps them as targets: measured on identical seeds, it fires
  on 2% of breaks, every one of them the engines, and leaves destructions and
  the share of damage reaching hulls unchanged.
- **New mission types** are proposed to the designer, never added unasked.
  Ambush, Salvage, Breach and Grand Tour were tried and cut.
- **Two decks dealing a forced hand shape**, to stop the deal being a lottery.
  The shape is not the lottery: 94% of hands at three seats and 98% at six can
  already take three primaries, so every seat is offered the same plan. What
  differs is *which* primaries — Deliver is 32–46% of the deck and completes
  17% of the time against Destroy's 56% — so a forced shape would fix the part
  that works and leave the part that does not.
- **A rack that intercepts once a turn.** Three launchers firing one missile
  each were already a salvo it could not answer: a sensor bow with missiles×3
  won 66% of three-seat games against a 37% Destroy bar. Point defence rolls at
  every missile now, salvos are one action, and that hull sits at 40%.
- **The compressor as a side tile** (`fuel_compressor.slotType=side`). Measured
  on the balance seeds with the hauler templates moved to a sensor bow: the
  weaponless pacifist wins 48% with the compressor on its side as it does with
  it forward. The value is the refund, not the slot.

Known open problems:

- **The jump refund is worth about 18 win-points.** With bots that know the
  circuit, every compressor hull wins 45–63% at three seats against a 34% bar —
  racks, launchers, lasers or nothing but shields and radiators behind it — and
  a compressor bow hunting is as good as the railgun hunter (`unpunished`).
  Switch the refund off (`--tiles=fuel_compressor.refuelOnWellTransfer=false`)
  and the same hulls fall to 29–34% while natural play does not move. The
  compressor is the one forward tile that serves every card, so the price of
  the refund is the lever; a partial refund needs a constant and an override
  channel before it can be measured.
- **Deliver was mostly a bot problem.** It completed 20 per 100 kept because
  the bots' distance estimate was planet-blind and every "any station" was
  Alpha: routes loading at Alpha got their crate 93–100% of the time, routes
  loading at Beta or Gamma 20–38%. With a lane-aware estimate Deliver completes
  39 per 100 and the three primaries are level: dealt Destroy, Deliver or
  Intercept, seat 1 wins 34% with each. The card is not fixed, it is finally
  measured.
- **Intercept is the bot's last card.** Goal ranking is `turns − 3 × urgency`
  and the scan has no urgency, so once far planets read as far the interceptor
  does its one-point cards first and scans last: Intercept completion fell
  46 → 33 per 100 kept when the map fix landed. Next bot change, in
  `ai/behaviors/missions.ts`; not a rule.
- **Two off-book hunters beat the preset hunter.** The rack hunter (railgun +
  racks×2 + shields + radiator) and the aggressive interceptor hunting (sensor +
  shields + lasers×2 + radiator) win 46% and 45% with a Destroy card against
  the hunter-aggressive preset's 34%; the tanky hunter (a second shield for the
  rack) is 27%. Either the preset is wrong or missiles are the weak gun; the
  sensor bow with two launchers, the build the designer asked about, is a fair
  37%, and under flat salvo heat the pure launcher hulls are playable without
  being outliers (missiles×3 39%, missiles×5 32%).
- **The secondary offer is still lopsided.** Everyone is offered all three;
  Garbage Disposal is the one left out (kept 46% against 76–78%) though the map
  fix lifted its completion 28 → 48 per 100. Survey 71, Board 52.
- **The bots keep cards uniformly among the legal ones, which skews every
  forced-hull measurement involving a weapon.** A mat that can hold a gun is a
  mat that gets dealt into Destroy (44% of games) whether or not that gun can
  finish one: Destroy completes 35% behind a railgun, 12% behind a laser, 5%
  behind missiles. Splitting a hull's games by whether it kept a Destroy moves
  the missiles hull between 5% and 32%. Read any weapon hull's balance number as
  a band. Fixing this is a change to `ai/behaviors/loadout.ts`, not to a rule,
  and it has to price cards by the mat without going back to a hand-tuned
  scorer (see the note on `selectBotMissions`).
- **Carrying cargo does not draw fire**, though the table says it does. Over 200
  games on each of four hulls, every one took *less* hull damage per turn while
  holding a crate than while empty. Kills still fall on carriers — 72% of
  destroyed ships were carrying something, nearly all of it data chits — but
  that is the hunt for the leader, not the crate.
- **Two players is thin**, and seat 1 wins 61% of them on the balance seeds.
- **Six seats runs long**: 46 rounds at the median, 4h36 at a minute a turn,
  and a human turn is longer than a minute. Four seats is 45 rounds, 3h00.

## Adding a rule

1. Write it in one sentence for `RULES.md`; if you can't, simplify it.
2. Types in `engine/src/models/`, logic in `engine/src/game/`, event(s) in
   `models/events.ts` + text in `game/describe.ts`.
3. Decide what is public and what is private (`view.ts`, event `privateTo`).
4. Teach the bots (`engine/src/ai/`) and run the sim to see the effect.
5. Tests, then server/UI.
