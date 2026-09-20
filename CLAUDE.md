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
sector is their Home (destroyed ships respawn there, drift one turn and cannot be
touched until they act again). Transfer lanes are one-way 4-sector arcs: each planet has an outbound lane
from black hole ring 5 to its ring 4 and an inbound lane back. Stations orbit planet ring 2, with a faster ring 1 inside them, and are where cargo is
loaded, ships are repaired and data is delivered.

Loadout tiles (1 forward + 4 side slots) are **face-down** and revealed the
first time they do something; the energy cubes on every slot are public.
Scanning peeks at one tile privately. Completed missions are face-up. Reaching
the table's points (3 by default; the lobby may set 4, and the value rides on
`GameState.pointsToWin` and the view) triggers the final round: the round is
played out, then highest score wins (hull, then fuel, break ties). Six card types in two kinds: primaries
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
`--rules=missionsToWin=4` (the table's points to win — a real game option,
passed to `createGame`; `yarn bench --rules=` takes it too and stamps it on
the page), `--bot=aggressiveness=0.8,targetPreference=weakest` (the bots'
parameters), `--loadouts=` (the bots' hull templates), `--seats=` (a hull
forced on one seat) and `--hands=bot-1=destroy` (the primary a seat is dealt
and keeps — the bots price one road to the win and take it every time, so a
plan they never choose is only measurable dealt). The summary prints turn
behaviour (coast/burn/jump/firing shares, shield cubes, heat at check, damage
soaked). A change that survives its experiment moves into the models, and a
switch whose experiment is over is deleted, not kept: the measurement lives
in the settled list below and in the commit that removed it.

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
- **A compressed jump for free.** The refund was worth about 18 points to a
  weaponless hull: with the jump free every compressor hull won 40–50% at
  three seats against 32%, and no hunter preset could take the compressor with
  two racks in a duel (prey wins 59–89%). A compressor needing 4 cubes instead
  missed its target — the gunboats did not move (racks 63% → 59%) and the
  cargo hauler paid (34% → 26%), because a fighter jumps rarely and a Deliver
  ship jumps every few turns and needs its shields on arrival. A jump at 1
  fuel, measured on the whole matrix at 400 games a row, cleared every
  failing flag at three points (the family 33–37%, every gun hull up 2–9, the
  hauler presets with Deliver at 30% and 37% against 30%) and four of five at
  four points, and gave the hunters their duels back (hunter preset 70% → 55%
  prey wins, rack hunter 59% → 51%, four lasers 65% → 46%). Adopted 20 Sept
  2026: the price is a constant, the powered compressor and the
  `compressedJumpFuel` switch are gone. The cost is three rounds a game and
  Deliver's hulls paying too (hauler-aggressive + Deliver 47% → 37%).
- **Heat per missile, and per interception roll.** Measured against one tile
  use on both sides: no row moved outside noise and missiles launched per game
  were identical (10.5), because the four-round magazine is the limit. Flat
  adopted and the switch removed. Charging only the attacker flat shifts power
  to the launcher hulls (+4 to +7), so the halves stay together.
- **Four points to win with three mandatory cards.** 41–49 rounds by seat
  count; three points with the same hand runs 27–31 and every game finishes.
  Keeping all three secondaries (any three points) let Deliver holders win 44%
  while completing Deliver 21% of the time, so the primary stays mandatory.
- **An "efficiency" secondary — end a turn at 10 heat with an empty tank.**
  84% of seats do both in one turn incidentally by round 11 (24% of turns end
  at exactly 10 heat, 20% dry). A free point as stated; it needs a cost.
- **A missile-carrying hunter preset.** In a duel against the compressor with
  racks×2 the old preset (railgun, missiles, rack, shields, radiator) completed
  Destroy 34% of the time and the prey won 69%: a powered rack rolls at every
  missile. The presets carry a laser and a rack (aggressive) or a rack and two
  shields (tanky) now; two lasers on the hunter left the field with no rack at
  all and the compressor with two launchers at 52%.
- **Two lost turns on death.** A respawned ship sat at a known sector with no
  cubes allocated for two rounds: a free kill on repeat, with no counter-play.
  One lost turn now, and untouchable (no shot, missile or scan) until the ship
  acts again. Not a measurement — a table would have found it in an evening.
- **Criticals naming the forward tile first**, to break compressors: within
  noise, and the compressor hulls gained if anything (a broken compressor is
  repaired at the next dock, where that hull was going). **Shields stopping
  lasers**: halves kills a game and costs the hunter preset six points to get
  the compressor-with-a-laser hunter from 32% to 15%. Both left alone; the
  critical-order switch is gone, and shields-stop-lasers is a tile field
  (`--tiles=laser.ignoresShields=false`), not a switch.

Known open problems:

- **The primary you are dealt is worth about ten points, and which way flips
  with the bots.** At 400 games a row: dealt Destroy 37%, Deliver 31%,
  Intercept 26%, against 32% with a hand of its own choosing (three points);
  36 / 30 / 32 against 35 at four. With the jump free the same cards read
  32 / 36 / 23, and with bots that scanned last 55 / 34 / 33. The swing says the rules are sensitive to how well
  each card is played, which humans will differ on too. Levers not yet
  measured: Intercept's scan range or filing station, a Deliver that pays on
  pickup, the primary's value.
- **Intercept and Deliver are the weak cards, and the designer calls
  Intercept the player's problem.** Intercept: 29 completed per 100 kept,
  dealt Intercept 26% (32% under four points, where the interceptor has
  time). The bots scan first now; what remains is the card — a rival on your
  ring within three sectors, then a named station — and a sensor bow that
  reveals itself early. Not a rule change for now. Deliver: dealt Deliver
  31% (30% at four) since the jump costs a fuel — the hauler pays what the
  runner used to get free, and its presets sit on the reference (30% and 37%
  against 30%). Priced any further, the hauler goes with the runner.
- **The compressor family is in band, two points from the line at four
  points.** With a jump at 1 fuel: compressor + launchers×2 37%, shields×2 +
  radiators×2 33%, lasers×2 36%, racks×2 37% against 32% at three points;
  39 / 34 / 41 / 39 against 35% at four, where the compressor-with-a-laser
  hull hunting (hauler-aggressive + Destroy) sits at 38% against 36% and
  trips `unpunished`, a flag that fires at equality. Its natural predators
  are racks and lasers (400-game duels: hunter preset 55% prey wins, rack
  hunter 51%, four lasers 46%; missiles never, 86–90%; at four points 54 /
  43 / 32). Watch it, do not price it further: the next fuel takes the
  hauler with it.
- **The secondary offer is still lopsided.** Everyone is offered all three;
  Garbage Disposal is the one left out (kept 47% against 76–77%). Completed per
  100 kept under three points: Survey 34, Board 27, Garbage 17 — the spare
  secondary is mostly never attempted, which is the rule working.
- **Point defence lives on one preset.** Bots holding Destroy always fly the
  aggressive hunter, so the aggressive hunter's rack is the only rack in
  natural play; when it briefly carried two lasers instead, missiles went
  unanswered and the compressor with two launchers reached 52%. The tanky
  hunter (rack + shields×2) is `weak` at 22% and the poorest predator among
  the gun hulls (the prey wins 67% of duels against it); if both presets are
  to hunt, it wants a second gun.
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
- **Two players is thin**, and seat 1 wins 54% of them on the balance seeds
  (49% under four points). The designer wants no artificial limit; special
  rules for two may come later.
- **Length**: 27 / 26 / 27 / 27 rounds at 3 / 4 / 5 / 6 seats under three
  points, 1h21 to 2h42 at a minute a turn, every game decided, five cards
  completed a game at three seats; kills 1.9 / 3.9 / 7.7 / 11.0. Under four
  points 45 / 45 / 46 / 53 rounds, kills 3.7 / 6.5 / 11.6 / 20.2. The free
  jump ran three rounds shorter at three to five seats. At 240 games per seat
  count the benchmark's seat spread is 29 / 42 / 30 at three seats and flat
  at four to six.

## Adding a rule

1. Write it in one sentence for `RULES.md`; if you can't, simplify it.
2. Types in `engine/src/models/`, logic in `engine/src/game/`, event(s) in
   `models/events.ts` + text in `game/describe.ts`.
3. Decide what is public and what is private (`view.ts`, event `privateTo`).
4. Teach the bots (`engine/src/ai/`) and run the sim to see the effect.
5. Tests, then server/UI.
