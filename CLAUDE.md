# CLAUDE.md - Development Context for Dangerous Inclinations

## This is a tabletop game first

**Every rule must be playable at a table** with subsystems, cubes, a d10, cards and a
pencil. The digital version exists to playtest the tabletop rules with bots.
Before adding or changing a mechanic ask: can it be tracked on paper, computed
with simple arithmetic, and explained in one sentence?

`RULES.md` is the authoritative player-facing manual and the only statement of
what the rules are. **Why** a rule is what it is lives in the commit that
changed it. `git log` is the design journal, and unlike a design document it
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
each); every ring has 24 sectors. Everyone deploys on black hole ring 3 or 4, at least three
sectors from every placed ship; that position is their Home (destroyed ships respawn there, drift one turn, and
their next turn is a first round of their own: untouchable until it is over, and
firing at and scanning nobody on it). Transfer lanes are one-way 4-sector arcs: each planet has an outbound lane
from black hole ring 5 to its ring 4 and an inbound lane back. Stations orbit planet ring 2, with a faster ring 1 inside them, and are where cargo is
loaded, ships are repaired and data is delivered.

Loadout subsystems (1 forward + 4 side slots) are **face-down** and revealed the
first time they do something; the energy cubes on every slot are public.
**Every action puts energy on the subsystem it uses, and every energy cube on a
loadout is a point of heat at its owner's check**: that is the whole of energy,
there is no reactor and nothing caps what a ship powers at once. The energy
stays on the subsystem until its owner's next turn, when the loadout is cleared, so
the three subsystems that work on other players' turns (shields, ballistic rack,
sensor array) are powered by an action every turn like anything else, and a
rack that fired is up as well. Each subsystem does one thing a turn. Scanning peeks at one
subsystem privately. Completed missions are face-up. Reaching
the table's points (3; the value rides on `GameState.pointsToWin` and the
view, and only the simulator's `--rules=missionsToWin=4` plays to four) triggers the final round: the round is
played out, then highest score wins (hull, then fuel, break ties). Six card types in two kinds: primaries
worth 2 (destroy, deliver, intercept) and secondary cards worth 1 (survey, piracy
(seize an undocked rival's crate or data, loot that fills the hold and
sells anywhere, their card back to undone) and tanker (arrive at a station
with eight fuel and pump it in)). Two physical decks for the table: rival cards count seats
("the 2nd to your left") so no card can name its own holder and none leaks who
is hunting whom; setup removes offsets the table is too small for. Deal 3
primaries and keep 1; take one of each secondary and keep 2. Five points
held and three win, so the primary plus either secondary is the win and the
other secondary is the spare. The secondary offer is the same for everyone
and needs no shuffle, so those three have to be worth roughly the same or the
choice is fake.
New mission types are proposed to the designer, never added unasked.

Missiles fire in **salvos**: one action launches any number of a subsystem's missiles
at one ship, and that is **one use of the subsystem**: the 4-round magazine, refilled
at a station, is what limits missiles, not heat. A powered ballistic rack rolls
at **every** missile that reaches it, also for one use of the rack, and the two
halves stay together: a rack that answers a whole salvo is what keeps a salvo
that costs one subsystem's heat honest.

Turn: (respawn turn if destroyed) → clear the loadout → actions in chosen order (power,
rotate, one move: coast/burn/jump, fire, scan) → own missiles move → docking (on
arrival only) → heat
check (over 10 is hull damage, then dissipate and carry the rest) → missions →
pass. Once a round, after the last seat's turn, the stations advance (their own
step, carrying moored ships). The first round reaches nobody (no weapon
fires and nobody scans) because everyone deploys around one hole, so the opening
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
ui/src/                 context/ (game, animation, plan, boardMode, navigation),
                        components/table/, art/glyphs.tsx (the one drawn icon set)
ui/src/site/            routes.ts (the four sections), Landing, Tools, Cheatsheet,
                        turn.ts (the turn, stated once), numbers.ts, poster.tsx,
                        guide/ (the cheatsheet's sections), tools/, card/ (the printed card)
ui/src/design/          tokens.ts (the dark table), press.ts (paper, ink, red: all printed matter)
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
node scripts/shot.mjs '/' shot.png                    # photograph the running UI (needs `yarn dev`; PLAYER_ID + ?game=<id> for a seat)
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

Benchmark: `yarn bench` (engine) writes `docs/benchmark.md`, one page describing
how the rules as they stand play at 3/4/5/6 seats: length in rounds and in table
time, kills, the hulls bots chose and their win rates, and every card's pick rate
and payoff. It stamps the rules it ran under at the top, so two versions of the
page can be diffed to see what a rule change actually did. Keep the games and
seeds fixed between runs or the comparison is worthless. It is a description and
never fails; the gate is below.

Balance regression: `yarn balance` (engine) answers the designer's four
questions in six sections, every forced row at 3 players on seat 1: **natural**
play at 3/2/4; **baselines** (seat 1 dealt Destroy, Deliver or Intercept with
its own loadout: the bar every row with that card is read against); **logical**
(the six presets with the card their role implies); **illogical** (a preset
with a card that fights it: sensor bow hauling, compressor hunting); **off-book**
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
the state. A game is played under RULES.md and nothing else. A proposed change
is measured before it is adopted with the simulator's experiment-only override
channels, which mutate the configuration of the process running the batch:
`--tiles=fuel_compressor.slotType=side,ballistic_rack.damage=3` (any field of
any subsystem), `--weapons=laser.damage=3` (firing stats),
`--rules=missionsToWin=4` (the table's points to win, a real game option,
passed to `createGame`; `yarn bench --rules=` takes it too and stamps it on
the page), `--bot=aggressiveness=0.8,targetPreference=weakest` (the bots'
parameters), `--loadouts=` (the bots' hull templates), `--seats=` (a hull
forced on one seat) and `--hands=bot-1=destroy` (the primary a seat is dealt
and keeps: the bots price one road to the win and take it every time, so a
plan they never choose is only measurable dealt). The summary prints turn
behaviour (coast/burn/jump/firing shares, shield cubes, heat at check, damage
soaked). A change that survives its experiment moves into the models, and a
switch whose experiment is over is deleted, not kept: the measurement lives
in the settled list below and in the commit that removed it.

The batch runner and the sim CLI are not exported from the engine's browser
barrel (they use worker threads); use `yarn sim`. A single headless game
(`runGame`, `setupBotGame`) is pure and is exported, so a browser page can
build a canned game with it (the showcase page that did was removed on 20 Sept
2026; `ui/dev-three.html` renders the 3D board from a hand-made fixture).

Seeing a change: `scripts/shot.mjs` drives the running app with Playwright and
writes a PNG, reporting page errors and the text of the status block and turn
log. `?game=<id>` with `localStorage.playerId` set renders a real seat; there
is no server-less table page any more, so a screenshot means running the
stack (docker compose, server, Vite) and creating a game over REST.

## The site is four sections

The video game is one of them. `ui/src/site/routes.ts` is the whole router (a
path, no dependency): `/` the landing page, `/play` everything the app was
before, `/tools` the things a real table wants and `/card` the cheatsheet with
the card it prints. The three query flags still decide the route **from any
path**, so `?game=<id>` from a fork, from `yarn seat` and from
`scripts/shot.mjs` keeps working. Every `/play` screen before a table exists
(connecting, a failure, the name, the lobby list) keeps the site's bar, so
nobody who arrives there is stranded; a table brings its own chrome.

Only `/play` needs a player, a socket or a server. The tools and the cheatsheet
call pure engine functions (`planMovementAlternatives`, `heatAfterCheck`,
`rollToResult`, the subsystem and ring configs) and render from a browser with
nothing else running, which is the point: they are used standing over a real
table. Every number on them is read from the engine; `site/numbers.ts` works
out the derived ones once (critical faces, slot contents, cube labels) and
`site/turn.ts` states the turn once for the cheatsheet, the card and the
in-game rules dialog.

**Two looks, on purpose.** The table is the dark instrument panel
(`design/tokens.ts`). Everything that would come out of a box is printed
matter, **modern Soviet-poster flat** (`design/press.ts`): cream paper, black
ink and one red, the mission families' teal, violet and ochre only where a family is
meant, condensed capitals in Oswald (bundled by `@fontsource-variable/oswald`,
so the tools work offline) for every label and number, solid blocks and heavy
rules, and no radius, shadow or gradient anywhere. The mission cards, the
site's pages and the printed card are all set from it, and the red diagonal at
`BAND_ANGLE` is the one motif they share (the cards' band, the landing page's
wedge through the black hole, the mark). `site/poster.tsx` holds the pieces
(display type, slabs, the mark) and `site/guide/parts.tsx` the cheatsheet's
(numbered sections, points, chips, the ledger a heat check is written in).

**One icon set** (`ui/src/art/`): the artwork is the PNGs in
`public/assets/icons`, traced to vector once by `scripts/trace-icons.py` into
the generated `art/paths.ts`. Drawn from the vector rather than the bitmap for
two reasons: a bitmap flattened by a CSS filter can be made white but not
black, and the card needs black ink; and a 400px bitmap at 6mm is not what you
want on paper. `SubsystemIcon` draws from it, so a subsystem is the same mark on the
board, in the loadout and on the card, and nothing in it carries a colour.
Re-run the script after changing an icon. The site's nav is type, not icons;
the rest of the app's chrome stays on MUI icons.

**The cheatsheet** (`site/Cheatsheet.tsx`, `site/guide/`) teaches the game in
the order a first table meets it, eight numbered sections: the goal (the six
mission cards drawn by the game's own `MissionCard`), setup with the loadout's
slots, the turn (seven steps, then the stations once a round), moving (the
three moves drawn, and phasing across two rings), heat (with a check worked by
`heatAfterCheck`), fighting (the roll strip asks `rollToResult` about every
face, and a missile's two turns drawn fired before and after the drift), what
is hidden, and destruction. It compresses RULES.md and says so; the manual wins.

**The tools** call pure engine functions and nothing else, so they work with
the server down. The route planner is not a second interface: it builds a
`BoardModel` by hand and hands it to the game's own `GameBoardSvg`, the way
`three/dev/fixtureModel.ts` does, so clicking a sector on it is clicking a
sector on the board. Body, ring and sector can also be typed (a phone's number
pad), and a station is a destination of its own: the route is planned against
where it will be (`planMovementToTarget` with `orbitingTarget`), not where it
is. The heat check is a mat of the player's loadout that follows the turn: a
click powers a subsystem a step, a right click takes one off, the check bills
the energy and leaves it on until "start my turn" clears it, and absorbing or
breaking moves energy onto the track the way the engine does.

**The card** (`ui/src/site/card/`) is two 70x120mm faces: **your turn** (the
goal, the seven steps, the three moves drawn and what they cost) and **the
fight** (the roll, the guns, what a hit does, what is held up, the heat check,
what gives a subsystem away). Black and one red on white stock, which survives a
black-and-white printer as ink and a mid grey. It is drawn at true size with
the preview scaled by a transform, so what is seen is the geometry that
reaches the printer, and printing puts both faces on one A4 sheet with
nothing else. It does not repeat the board or the missions: ring speeds, lane
sectors and card text are printed in front of you. About 105mm of column per
face; content that does not fit is content to cut, and nothing in the card
shrinks to hide that (`.di-card > *` never shrinks, so overflow shows).

## The board has two renderers

`GameBoard.tsx` derives one `BoardModel` (`components/board/model.ts`) from the
view, the turn being animated and the plan being built, then hands it to either
the SVG board (`board/svg/`) or the WebGL board (`board/three/`, a lazy chunk).
Neither renderer computes anything rule-shaped: ranges, missile paths and
positions are all in the model, asked of the engine once, so the two boards
cannot drift.

Which one draws is `BoardModeContext`, remembered per player, forced to the
flat board without WebGL 2, and overridable per session with `?board=2d|3d`.
Time is not in the model: a sliding token carries its `motion` and an effect
its `start`/`duration`, and each renderer reads its own clock (`useBoardClock`
for the flat board, `useFrame` for the 3D one). Nothing in the 3D scene may
re-render per frame.

`ui/dev-three.html` mounts the 3D board on a fixture with no server
(`board/three/dev/fixtureModel.ts`), which is how board work is checked.

## Settled: do not re-propose without measuring

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
- **Shields absorbing a point per cube.** One powered subsystem was permanent immunity
  to every 2-damage weapon; 66% of declined shots were declined as unabsorbable.
- **Radiator at +1 or +3.** Measured after heat became a track: +1 widens the
  hull spread and lengthens games, +3 pushes the wall back up. +2 stays.
- **A bigger shield subsystem** (`shields.maxEnergy=6`). It makes the game quieter
  (destructions 3.2 → 2.7). **Shields in the forward slot** was rejected with
  it, on the grounds that bots never spend the bow on a shield, and adopted on
  22 Sept for a reason the first pass was not looking for: after the energy
  rewrite the bow held exactly one subsystem that could stand powered, so cubes on a
  face-down forward slot were a certain sensor array and the only certain tell
  on the board. Shields are `either` now (the rack stays side-only, below). Measured as
  builds on forced hulls: a bow shield is never the best bow and never a bad
  one (16% on a Deliver hauler against the sensor's 15% and the compressor's
  49%; 32% on a Destroy brawler against the railgun's 32%), which is the
  profile of an option worth having rather than a lever. The bots still never
  take one, so `offbook:bow_shield` carries the coverage.
- **A ballistic rack in the bow.** Tried on 22 Sept for the same reason
  shields went there, and the arc costs nothing (`sideRestricted` is false, so
  a forward rack fires exactly as a side one does). It fails on balance: rack
  bow + lasers×2 + shields + radiator reads 46% against a 31% Destroy bar, an
  `outlier` at 200 games. Controlled on that hull with only the bow changing,
  rack 42% / sensor 38% / missiles 37% / railgun 33%, so the brawler is strong
  with any bow and the rack adds the four to nine that tip it over. **No hull
  preys on it.** In 200-game duels with both hands forced to Destroy, against
  a mirror baseline of 98–86: hunter-aggressive 89–95, railgun + lasers×2 +
  radiators×2 87–94, railgun + radiators×3 85–100, railgun + laser +
  radiators×3 83–101, missile boat 86–109, sensor bow with missiles×3 68–120.
  The only thing that edges it is railgun + lasers×4 at 102–86, which is what
  a copy of the prey itself manages. The lesson is not about the rack: **the
  bow's expense is load-bearing.** Railgun-or-nothing up front is what had
  been stopping three-cheap-guns-and-a-wall from existing, and the reason it
  took a duel to see is that clearing the rack as a *sole* gun (6% against the
  railgun's 25%) answers the wrong question.
- **A sensor array on a side slot.** It would finish the rule (every subsystem that
  stands powered fits any slot) and deepen the side-slot guess, and it is not
  worth it: the bow is the only thing stopping a railgun carrying a sensor, and
  a railgun that criticals on an 8 is the best Destroy weapon in the game with
  its best failure mode removed. Not measured; refused on the shape of it.
- **Critical-proof slots.** The engines and thrusters were never protected, and
  the fuel scoop stopped being on 22 Sept: **nothing is critical-proof now** and
  a critical may name any slot. The scoop was the exception because a break is
  repaired at a station, a dry ship cannot burn or jump to one, and a coast only
  carries it along the ring it is already on, so a critical on the scoop of an
  empty ship away from a planet could end that player's game outright. The cold
  repair is the answer to all of it: a ship that lights nothing reaches 0 heat
  and fixes one subsystem a turn wherever it is, so no break strands anyone and the
  exception was paying for a problem that no longer exists. Measured on 300
  games at three seats against the same seeds, **the output is byte-identical**,
  and that is the finding rather than the balance: the bots never name the scoop
  (see the open problems), so the change is invisible to the simulator and
  matters only at a table.
- **New mission types** are proposed to the designer, never added unasked.
  Ambush, Salvage, Breach and Grand Tour were tried and cut.
- **Two decks dealing a forced hand shape**, to stop the deal being a lottery.
  The shape is not the lottery: 94% of hands at three seats and 98% at six can
  already take three primaries, so every seat is offered the same plan. What
  differs is *which* primaries (Deliver is 32–46% of the deck and completes
  17% of the time against Destroy's 56%), so a forced shape would fix the part
  that works and leave the part that does not.
- **A rack that intercepts once a turn.** Three launchers firing one missile
  each were already a salvo it could not answer: a sensor bow with missiles×3
  won 66% of three-seat games against a 37% Destroy bar. Salvos became one
  action and point defence rolled at *every* missile, which fixed it and
  overshot: one rack then answered any number of launchers. Since 22 Sept a
  rack rolls at `interceptsPerRack()` missiles a turn, which is the missiles
  subsystem's magazine read off the config, so two cubes shoot down exactly what two
  cubes can throw and the fifth gets through. Racks stack: a ship expecting
  eight carries two and pays both at every check.

  **It is a symmetry fix, not a lever.** Measured at 200 games a row against
  the uncapped rack: mean row move +0.1pp, nothing moved 5pp or more, the
  benchmark is unchanged at every seat count and the failing flag set is the
  same one row. That follows from the shape of it: a salvo is one subsystem's
  magazine, so a single launcher can never put more than four on a ship at
  once and one rack answers it exactly. The cap only bites when two launchers'
  missiles arrive in the same turn, which the bots rarely arrange. The number
  to watch if that changes is `offbook:sensor_missiles3`, the one hull that
  can land twelve.
- **The compressor as a side subsystem** (`fuel_compressor.slotType=side`). Measured
  on the balance seeds with the hauler templates moved to a sensor bow: the
  weaponless pacifist wins 48% with the compressor on its side as it does with
  it forward. The value is the refund, not the slot.
- **A compressed jump for free.** The refund was worth about 18 points to a
  weaponless hull: with the jump free every compressor hull won 40–50% at
  three seats against 32%, and no hunter preset could take the compressor with
  two racks in a duel (prey wins 59–89%). A compressor needing 4 cubes instead
  missed its target: the gunboats did not move (racks 63% → 59%) and the
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
- **Heat per missile, and per interception roll.** Measured against one subsystem
  use on both sides: no row moved outside noise and missiles launched per game
  were identical (10.5), because the four-round magazine is the limit. Flat
  adopted and the switch removed. Charging only the attacker flat shifts power
  to the launcher hulls (+4 to +7), so the halves stayed together until the
  rack moved onto standing heat (21 Sept, above): the launcher pays when it
  fires and the rack pays at every check it is up, which is that asymmetry
  taken on purpose. Watch the launcher hulls if point defence looks thin.
- **Four points to win with three mandatory cards.** 41–49 rounds by seat
  count; three points with the same hand runs 27–31 and every game finishes.
  Keeping all three secondaries (any three points) let Deliver holders win 44%
  while completing Deliver 21% of the time, so the primary stays mandatory.
- **An "efficiency" secondary: end a turn at 10 heat with an empty tank.**
  84% of seats do both in one turn incidentally by round 11 (24% of turns end
  at exactly 10 heat, 20% dry). A free point as stated; it needs a cost.
- **A missile-carrying hunter preset.** In a duel against the compressor with
  racks×2 the old preset (railgun, missiles, rack, shields, radiator) completed
  Destroy 34% of the time and the prey won 69%: a powered rack rolls at every
  missile. The presets carry a laser and a rack (aggressive) or a rack, a
  shield and two radiators (tanky) now; two lasers on the hunter left the
  field with no rack at all and the compressor with two launchers at 52%.
- **Two lost turns on death.** A respawned ship sat at a known sector with no
  cubes allocated for two rounds: a free kill on repeat, with no counter-play.
  One lost turn now, and untouchable (no shot, missile or scan) until the ship
  acts again. Not a measurement: a table would have found it in an evening.
  Amended 20 Sept 2026: coming back is deploying again, so the turn after the
  respawn is a first round of the ship's own. It powers, rotates and
  moves, and stays untouchable until that turn ends, but no weapon of its fires
  and it scans nobody. The old shape gave a returning ship a round of immunity
  and then the first shot out of a sector everyone already knew, which reads
  wrong at the table. Removing the lost turn instead was rejected: respawn
  hands back full hull, full fuel and zero heat, so with no tempo cost death is
  a free refit for a dry ship. This is not the two lost turns above: the second
  turn has energy and a move, and the ship is untouchable while it makes them.
- **Board and Garbage Disposal.** Garbage was a worse Survey by construction
  (a station stop, a full hold, then the same dive: kept 47% against 76%,
  17 completed per 100 kept) and Board scored on the opening turn at a
  crowded table. Replaced by Piracy and Tanker (RULES §Missions). Roads not
  taken on the way: **Freight** (a crate from any station to a station of another planet,
  Deliver with the route left open, too close to Deliver); **blocking
  cards in the opening rounds** (accounting the designer will not have);
  **Tanker at six fuel** (once the bots held fuel back for the run in it
  read 47 per 100 kept and sat in three winners' hands out of four: the
  free point the "efficiency" secondary was cut for); **Piracy on crates
  only** (one carrier on the board at a time, 9 per 100 kept). Data is
  cargo now, the victim's card goes back to undone, and the card reads 22–31
  per 100.
- **A same-ring deployment gap of four.** Measured against the three-sector
  rule: the round-two Intercept scan stays at 40% of kept either way (the
  interceptor moves into range on its first legal turn, it is not standing
  in it), so the gap stays at three.
- **Four points as a table option.** Offered in the lobby for a day: 39–51
  rounds by seat count against three points' 27, and the designer pulled it
  as too long. The value still rides on the state and `--rules=missionsToWin=4`
  still measures it.
- **A sensor that reveals itself on a sensor-assisted critical.** It used to
  flip face-up the first time a critical landed on an 8 or a 9, since only a
  sensor could have done that. Cut 22 Sept: switching a subsystem on is not doing
  its job, and the reveal table now reads the same way for all three standing
  subsystems (a wall reveals when it absorbs, a rack when it rolls, a sensor when it
  scans). `sensorAssistedCritical` and the `critical_bonus` reveal reason are
  gone with it. The cubes still give a held-up sensor away by deduction, which
  is the tell doing its job and not a reveal.

- **The reactor, and heat charged on use.** Two halves of one simplification,
  taken together because the cap was what priced *readiness* and removing it
  without pricing readiness some other way makes every standing subsystem free.
  Now: a subsystem's cubes are heat at its owner's check, however they got there.
  An action powers the subsystem it uses and the cubes come off at the end of the
  turn, so acting costs its cubes once; a switched-on subsystem carries them the
  whole time and pays at every check. `generatesHeatOnUse` and `ReactorState`
  are gone, `getStandingHeat` became `heatFromCubes` over every subsystem, and no
  action is refused for energy any more. The rack and the sensor moved onto
  standing heat with the shields, which is the asymmetry the salvo note below
  warns about, taken deliberately: point defence is now bought a turn ahead and
  a sensor bow can hold its 8–10 critical range up for two heat a check.
  `Subsystem.isStanding` is what keeps the two apart: firing a dark rack or
  scanning with a dark sensor is one use of a subsystem, not a decision to hold it
  up, so those cubes clear with everything else and nobody is billed at every
  check for a rack they fired once. An action's reported heat is the cubes it
  *adds*, so a rack already up reports nothing when it fires or intercepts,
  and what the actions report plus what stands is what the check bills (there
  is a test for that invariant). The switches themselves went on 22 Sept
  (next entry).

- **Standing subsystems that stay on until switched off.** Replaced 22 Sept by one
  kind of subsystem: every action puts energy on the subsystem it uses and it stays
  until its owner's next turn, when the loadout is cleared; shields, racks and
  sensors are powered by an action each turn like everything else, and nothing
  is switched off. The designer's reason: at a table there is no difference
  between a standing system and a powered one, everything is an action and most
  actions make heat. The heat economy is the same (a wall was billed at every
  check it was up, and is billed at every check it is powered); what changes is
  that a used subsystem carries its energy through everyone else's turn, so a
  critical on a railgun that just fired dumps its 4, and a rack that fired is
  up and intercepts. Measured against the switch rules on the same seeds, 200
  games a row, 43 rows: **mean row +0.6pp, median +0.5pp, nothing moved 5pp**;
  natural three-seat play unchanged at 27 rounds and 2.5 kills; the one failing
  flag (`illogical:hauler_aggressive+destroy` unpunished, 35 → 33.5 against 34)
  cleared, though at 1000 games it sits exactly on its bar under both rules
  (33.2 → 32.4 against 33.4 → 32.6), so it is a coin flip rather than a fix.
  The same 1000 games show nothing moved on the hunters: dealt Destroy 33.4 →
  32.6, the tanky hunter 23.8 → 23.7, the rack hunter 30.8 → 31.7; the `weak`
  flag the 200-game run gave the tanky hunter was the bar's noise. The 300-game sim: destructions 2.5 → 2.7,
  hull damage 39.9 → 41.3, heat at the check 7.09 both. `Subsystem.isStanding`,
  `set_standing_power` and `standing_power_set` are gone; the action is `power`
  and the event `subsystem_powered`, which names the subsystem only once it is
  face-up. Recordings are schema v3.

  Measured against the pre-rewrite code on the same seeds, 200 games a row,
  42 comparable rows: **the mean row moves +0.9pp and the median +1.0pp, and
  only 8 rows move 5pp or more.** Natural three-seat play is 27 rounds, 2.5
  kills and the flattest seat spread yet (34 / 33 / 34 against 35 / 31 / 34);
  dealt Destroy 31 → 31, Deliver 45 → 46, Intercept 31 → 29. Failing flags
  fall from two to one (`offbook:rail_lasers2`'s outlier goes,
  `illogical:hauler_aggressive+destroy` stays unpunished), and
  `baselines:destroy` loses its `glass`. The 300-game sim has destructions
  2.8 → 2.5 and hull damage 41.5 → 39.9.

  **The salvo note's warning did not land the way it reads.** Charging the
  rack at every check and the launcher only when it fires should have moved
  power to the launchers; instead both rose a little, because dropping the cap
  helps every hull that wants several subsystems up at once more than the standing
  bill hurts the one that wants a rack. Racks: railgun + racks×2 20 → 26,
  compressor + racks×2 35 → 41, rack hunter 31 → 35, railgun + racks×4 24 →
  25, tanky hunter 24 → 22. Launchers: sensor bow + missile hunter 31 → 38,
  missiles×3 34 → 39, missiles×5 32 → 34, missile boat 34 → 33. What actually
  fell is the interceptors, which pay two a check for a sensor they used to
  hold for nothing: the aggressive preset 25 → 22 and the tanky one with a
  Destroy card 21 → 11, the latter an `illogical` row that is supposed to be
  punished. Both rack hulls still sit well under their bar, so point defence
  is no healthier than it was; it is just no worse.

- **Manual energy allocation.** Every subsystem but the engines and the shields has
  exactly one legal non-zero setting, so placing its cubes was transcription,
  not a decision, and the bots' `energyActions` was 45 lines translating intent
  into allocations nobody chose. An action powers the subsystem it uses now, and the
  three subsystems that act while their owner is not acting are switched on instead
  (`STANDING_SUBSYSTEM_TYPES`). The 10-cap stays and still forbids a full wall
  beside a full burn. Not behaviour-neutral, and the reason is the second half:
  cubes no longer say anything about a gun, so `suspectedWeapon` reads a loaded
  slot as defence (bow = sensor, side 4 = full wall, side 2 = wall or rack) and
  a known gun is a threat while it is unbroken rather than while it is lit. That
  last one was a bug the old rules hid: a rival's dark gun was never safe, its
  owner simply powered it on their own turn, and the bots believed otherwise.
  Measured at 200 games a row: the three primaries move by a point (Destroy 31
  → 32, Deliver 45 → 46, Intercept 31 → 30), natural three-seat length is
  unchanged at 27 rounds, the seat spread flattens (35/31/34 → 35/33/33) and
  `baselines:destroy` loses its `glass` flag. The one real move is that the
  game gets quieter: natural kills 3.0 → 2.3 at three seats and 5.7 → 5.3 at
  four (300-game sim: destructions 2.8 → 2.6), because a bot that respects
  every unbroken gun walks into fewer of them; `docs/benchmark.md`, re-run at
  its own 240 games, has the same fall at every seat count.

- **Criticals naming the forward subsystem first**, to break compressors: within
  noise, and the compressor hulls gained if anything (a broken compressor is
  repaired at the next dock, where that hull was going). **Shields stopping
  lasers**: halves kills a game and costs the hunter preset six points to get
  the compressor-with-a-laser hunter from 32% to 15%. Both left alone; the
  critical-order switch is gone, and shields-stop-lasers is a subsystem field
  (`--tiles=laser.ignoresShields=false`), not a switch.

Known open problems:

- **The primary you are dealt is worth about ten points, and which way flips
  with the bots.** At 400 games a row: dealt Destroy 32%, Deliver 42%,
  Intercept 32%, against 33% with a hand of its own choosing (three points;
  four points not re-measured since the secondaries changed). Before Piracy
  and Tanker the same cards read 37 / 31 / 26, with the jump free 32 / 36 /
  23, and with bots that scanned last 55 / 34 / 33. The swing says the rules are sensitive to how well
  each card is played, which humans will differ on too. Levers not yet
  measured: Intercept's scan range or filing station, a Deliver that pays on
  pickup, the primary's value.
- **Deliver is the strong dealt card, and data aboard makes every Intercept
  and Survey holder prey.** Dealt Deliver 42% against 33 (31 before Piracy
  and Tanker): the hauler presets read 42% and 39% against 42, and Deliver +
  Tanker is a fight-free road to three for the hull that arrives with fuel
  (the compressor, below). Dealt Intercept 32% (26 before): the hunting hands
  deploy on ring 3 with their targets and 40% of scans come on the first
  legal turn: the interceptor moving into range, which the designer calls
  play. In natural three-seat games the sensor bow wins 24% against the
  railgun's 36 and the compressor's 36: a scan is data and data is loot,
  three seizures in four are data, and the benchmark has Intercept at 21 and
  Survey at 23 completed per 100 kept. The sensor's standing cost (21 Sept)
  gave the bow something to do on a turn it does not scan, and the bots now
  hold it up whenever they mean to shoot: the forced sensor-bow rows rose most
  of any hull in the suite (missile hunter 31 → 38, missiles×3 34 → 39). It
  cuts the other way for a hull that only scans, though: the interceptor
  presets pay two a check for a sensor they used to hold for nothing and fell
  2–3 points. Whether any of this reaches the *natural* sensor bow is
  unmeasured, because the bots' hull templates still put the bow on a hauler.
- **The compressor runner sits on the line, and Tanker put it there.**
  Under Piracy and Tanker, 400 games a row against 33%: compressor +
  shields×2 + radiators×2 44% (one point under the `outlier` line; 46% and
  flagged before the quiet returning turn), racks×2 38%, launchers×2 35%,
  lasers×2 35%; the compressor-with-a-laser hull hunting 34% against 32
  (`unpunished` by two, the matrix's one failing flag). Split by hand before
  the quiet turn, 85% of the weaponless runner's wins were Deliver + Tanker: a compressor pays one fuel for a lane, so it is the
  hull that arrives at a station holding eight, and the fuel card is its
  free point. Under the old secondaries the same hull read 33%. Every
  answer measured on the same seeds trades the runner's excess for
  something worse: a 2-fuel jump takes the runner only to 42% and dealt
  Deliver 41% → 32%; "a fuel compressor cannot be a Tanker" (the deal refuses
  the card on that hull) takes it to 40% but dealt Deliver to 32%, the
  railgun hull to 41% of natural games and games to 33–39 rounds; "a visit
  is one deal, cargo or fuel" takes it to 32% with Deliver at 27% and Tanker
  at 12 per 100; Tanker at 7 changes nothing for the runner and gives
  20-round games. Left as it stands: missions are public, a runner with a
  crate aboard is Piracy's prey, and the designer's line is that a hull may
  dominate a game but not every game.
- **The secondary offer is still lopsided, but the cards are level.**
  Everyone is offered all three; Piracy is the one left out now (kept 47%
  against 76–77% for Survey and Tanker). Completed per 100 kept in the
  benchmark: Survey 23, Piracy 25, Tanker 26 (the same card within noise,
  which the deal wanted). Tanker is in 27% of winners' cards, Survey 15%,
  Piracy 12%. Half of all Survey dives now complete in round one, because
  ring 3 is one turn from ring 1; the data is not the point, the filing is,
  and round-one data is round-one loot for a pirate from ring 3.
- **Point defence lives on one preset, and now it costs more to keep.** Bots
  holding Destroy always fly the aggressive hunter, so the aggressive hunter's
  rack is the only rack in natural play, and no hull a bot can reach carries a
  launcher (the aggressive hauler's missiles want a Destroy card a hauler never
  holds), so no missile is fired in natural play at all. The salvo rule is
  exercised only by forced hulls; when the hunter briefly carried two lasers
  instead, missiles went unanswered and the compressor with two launchers
  reached 52%. The rack moved onto standing heat on 21 Sept, so it is two heat
  at every check whether anything comes or not; that did not sink the rack
  hulls (railgun + racks×2 went 20 → 26 on the same seeds, because losing the
  cap let them run the rack beside a gun and a wall), but it did not lift them
  over their bar either: they read 26% and 25% against 34. The tanky hunter
  was the poorest predator among the gun hulls with two shields (23% against
  32 at 1000 games) and a second gun was not the answer: racks×2 or lasers×2
  in place of a shield read 33% and 35% but died as often as the aggressive
  hunter or more, a second aggressive preset. The second wall was the problem
  (eight heat a turn stops a hunter firing): since 22 Sept it is railgun +
  rack + shields + radiators×2, 28% at 600 games with the fewest deaths of any
  hunter (1.09 a game against the aggressive preset's 1.32). Bots holding
  Destroy still fly the aggressive preset, so natural play does not see it.
- **The bots keep cards uniformly among the legal ones, which skews every
  forced-hull measurement involving a weapon.** A loadout that can hold a gun is a
  loadout that gets dealt into Destroy (44% of games) whether or not that gun can
  finish one: Destroy completes 35% behind a railgun, 12% behind a laser, 5%
  behind missiles. Splitting a hull's games by whether it kept a Destroy moves
  the missiles hull between 5% and 32%. Read any weapon hull's balance number as
  a band. Fixing this is a change to `ai/behaviors/loadout.ts`, not to a rule,
  and it has to price cards by the loadout without going back to a hand-tuned
  scorer (see the note on `selectBotMissions`).
- **Carrying cargo does not draw fire**, though the table says it does. Over 200
  games on each of four hulls, every one took *less* hull damage per turn while
  holding a crate than while empty. Kills still fall on carriers (72% of
  destroyed ships were carrying something, nearly all of it data), but
  that is the hunt for the leader, not the crate.
- **The bots never name the scoop, so the simulator cannot price the slot that
  was just opened.** `chooseCriticalTarget` (`ai/behaviors/combat.ts`) ranks a
  known gun, then a loaded unknown slot, then any powered slot, then the
  engines, and only then anything else fixed: the scoop is reachable only once
  the engines and thrusters are both already broken, which is why removing its
  protection moved nothing across 300 games. The play the rule opens is a human
  one, and a specific one: name the scoop of a ship that is low on fuel and far
  from a station, and it spends its turns running cold instead of playing.
  Teaching that is a change to the bot's preference order, not to a rule, and it
  wants measuring before it is adopted, because a hunter that strands its prey
  is a different hunter.
- **Two players is thin**, and seat 1 wins 55% of them on the balance seeds. The designer wants no artificial limit; special
  rules for two may come later.
- **Length**: 25 / 23 / 27 / 27 rounds at 3 / 4 / 5 / 6 seats under three
  points, 1h15 to 2h42 at a minute a turn, 99–100% of games decided, five
  cards completed a game at three seats; kills 2.9 / 5.0 / 9.3 / 14.5, well
  above the old cards' 1.9 / 3.9 / 7.7 / 11.0, because data aboard is a
  reason to fight. The quiet returning turn (20 Sept) took kills down from
  3.3 / 6.5 / 10.8 / 17.8 and the six-seat game from 33 rounds to 27: a ship
  back from Home no longer opens with a revenge shot. The energy rewrite
  (21 Sept) took another 0.1–1.1 off every seat count and a couple of rounds
  off the short games, because a bot that respects every unbroken gun walks
  into fewer of them; at three seats it is no longer a kill per seat per game.
  The bots' fuel husbandry decides the length: with the
  Tanker holder's reserve unlimited games ran 19 rounds, with none 39; the
  standing bots keep a one-fuel margin and detour up to three turns. Four
  points not re-measured since the secondaries changed. The benchmark's seat
  spread is 33 / 32 / 35 at three seats, and the balance suite's natural row
  reads 34 / 33 / 34.

## Adding a rule

1. Write it in one sentence for `RULES.md`; if you can't, simplify it.
2. Types in `engine/src/models/`, logic in `engine/src/game/`, event(s) in
   `models/events.ts` + text in `game/describe.ts`.
3. Decide what is public and what is private (`view.ts`, event `privateTo`).
4. Teach the bots (`engine/src/ai/`) and run the sim to see the effect.
5. Tests, then server/UI.
