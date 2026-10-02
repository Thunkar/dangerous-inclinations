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
each); every ring has 24 sectors. Everyone deploys on black hole ring 2, 3 or 4, at least three
sectors from every placed ship; that position is their Home (destroyed ships respawn there, drift one turn, and
their next turn is a first round of their own: untouchable until it is over, and
firing at and scanning nobody on it). Transfer lanes are one-way 4-sector arcs: each planet has an outbound lane
from black hole ring 5 to its ring 4 and an inbound lane back. Stations orbit planet ring 2, with a faster ring 1 inside them, and are where cargo is
loaded, ships are repaired and data is delivered. A moored ship can neither fire nor be
fired at, missiles included (scans still reach it).

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
played out, then highest score wins (hull, then fuel, break ties). Eight card types in two kinds: primaries
worth 2 (destroy, deliver, intercept) and secondary cards worth 1 (survey, piracy
(end a turn on an undocked rival carrying cargo and take one item of your
choice, named with a `seize`; loot that sells anywhere, their card back to
undone), tanker (arrive at a station
with five fuel and pump it in), escort (you may put your marker, face-up, on
an undocked rival carrying cargo on your ring; it pays when that ship next
sells or pumps fuel with the escort in its well, and comes back if either
ship dies) and salvage (a destroyed ship leaves a
wreck that drifts with the stations; end a turn on it and take its black box,
data filed anywhere)). A visit does one thing: load the crates waiting
there, or sell one item; and each station buys from each player once per
game: a Deliver crate, one piece of data, one loot item or a Tanker's fuel
(`dock_sale` names it, "load" or "none"; the default is the sale that scores
most, else the load; the bots keep the primary's station for the primary).
Loading is not a sale and the hold has no limit. Which stations a player has sold at is
public (`PlayerView.soldAt`), and so is each item aboard by kind and an opaque
`item-<n>` token (`PlayerView.hold`), never by the card behind it. Deliver
routes run only round the circuit (Alpha → Gamma → Beta → Alpha, the short
way through the black hole's lanes). Two physical decks for the table: rival cards count seats
("the 2nd to your left") so no card can name its own holder and none leaks who
is hunting whom; setup removes offsets the table is too small for. Deal 3
primaries and keep 1; deal 3 secondaries from a shuffled pile (four of each
of the five) and keep any 2: two of a kind are two jobs, nothing completes
both at once. Four points held and three win, so the primary plus either
secondary is the win and the other secondary is the spare. The secondary
offer differs seat to seat, so the five have to be worth roughly the same or
the deal is a lottery.
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
                        missiles.ts, scan.ts, docking.ts, piracy.ts, stations.ts, respawn.ts,
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
yarn test           # every test, engine and ui (turbo builds the engine first)
yarn workspace @dangerous-inclinations/engine sim --games=100 --bots=3 --baseSeed=1
yarn workspace @dangerous-inclinations/engine sim --games=100 --bots=3 --baseSeed=1 --tiebreak --tiles=ballistic_rack.damage=3
yarn workspace @dangerous-inclinations/server smoke   # no Redis needed: leak checks on every message
yarn workspace @dangerous-inclinations/engine balance --quick   # balance regression: natural, baselines, logical, illogical, off-book, extreme; flags
yarn workspace @dangerous-inclinations/engine bench --output=../docs/benchmark.md  # the standing benchmark page
yarn workspace @dangerous-inclinations/server seat help          # a seat at the table for an agent or a terminal
node scripts/shot.mjs '/' shot.png                    # photograph the running UI (needs `yarn dev`; PLAYER_ID + ?game=<id> for a seat)
DOCKERHUB_USER=<you> scripts/deploy.sh               # build + push both images, restart the stack on the NAS (Dockerfile, deploy/)
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
time, kills, how games unfold (lead changes, comebacks, the first card, Escort
markers, wrecks, seizures, sales), the hulls bots chose and their win rates
(natural bots take the bow from the primary and the side slots from the
secondaries, so this is the hand table by another name), every card's pick rate and payoff, and where each card fails
(`sim/cardFunnel.ts`: how often and when its first step happens, how often the
item is lost and to what, how long the second step takes, and how many games
end with it started). The last is how a bot playing a card badly shows up as
a number: both fixes of 28 Sept were found that way. It stamps the rules it ran under at the top, so two versions of the
page can be diffed to see what a rule change actually did. Keep the games and
seeds fixed between runs or the comparison is worthless. It is a description and
never fails; the gate is below.

Balance regression: `yarn balance` (engine) answers the designer's four
questions in six sections, every forced row at 3 players on seat 1: **natural**
play at 3/2/4; **baselines** (seat 1 dealt Destroy, Deliver or Intercept with
its own loadout: the bar every row with that card is read against); **logical**
(the nine presets, three per bow, with the card their bow implies); **illogical** (a preset
with a card that fights it: sensor bow hauling, compressor hunting); **off-book**
(builds no preset has, with the card they are built for: sensor bow with three
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
`--tiles=fuel_compressor.slotType=side,laser.damage=3` (any field of any
subsystem, a weapon's firing stats included),
`--rules=missionsToWin=4` (the table's points to win, a real game option,
passed to `createGame`; `yarn bench --rules=` takes it too and stamps it on
the page), `--bot=aggressiveness=0.8,targetPreference=weakest` (the bots'
parameters), `--loadouts=` (the bots' presets, by id), `--seats=` (a hull
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

**The words live in text files that hold only strings**, in on-screen order:
`engine/src/text/missionCards.ts` (every card's name, title and rule) and
`ui/src/text/` (`cheatsheet.ts`, `printedCard.ts`, `turn.ts`,
`rulesDialog.ts`, `missionProgress.ts`, `landing.ts`). A number is a `{name}`
slot the caller fills from the engine (`fill` for one string, `rich` in
`ui/src/utils/rich.tsx` for elements, which also sets `<b>` and the few tags a
caller names); `{_}` is a space set as a text run of its own, kept so the
pages render pixel for pixel as they did. Rewording a rule is an edit to those
files and nothing else.

**One press, two sheets.** The table (`design/tokens.ts`) is the poster's
inks at night: an ink ground, cream print, one red (a lifted `accent` for type
and lines, the poster `accentBlock` for solid blocks), Oswald capitals for
labels and mono for numbers, square corners, nothing glowing. The one thing
drawn as physics rather than ink is the black hole's accretion disc
(`ACCRETION_ORANGE`). Everything that would come out of a box is printed
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
the order a first table meets it, nine numbered sections: the goal (the six
mission cards drawn by the game's own `MissionCard`), setup with the loadout's
slots, the turn (seven steps, then the stations once a round), moving (the
three moves drawn, and phasing across two rings), heat (with a check worked by
`heatAfterCheck`), fighting (the roll strip asks `rollToResult` about every
face, and a missile's two turns drawn fired before and after the drift), what
is hidden, destruction, and the orbital windows (`guide/WindowsSection.tsx`:
when to reach a lane mouth, arrive with a Tanker's fuel or leave a pickup,
read off the station clock every station shares; the tables are the route
planner's answers, worked out in the browser after first paint). It
compresses RULES.md and says so; the manual wins.

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

The 3D board's Auto camera (`three/Director.tsx`) films a turn as it plays:
the animator names each moment worth a shot (`CameraShot` in
`AnimationContext`) and, while Auto is on, plays turns slower with a lead-in
before each new shot (longer for a turn's first) and a hold on its last. It
cuts between shots that are far apart or face another way, glides on a spring
otherwise, and keeps the black hole out of the eye and out of the line of
sight, and it pulls back to the
player's own well when their turn comes, or after 1.6 s of quiet, so not
between two bots that follow each other quickly. Only the board reads `useAnimation()`, which changes on
every beat; the rest of the table reads `useAnimationControls`, `useDice` and
`usePulses`, so a long game's log and transport are not re-rendered on each.
`TurnBanner` (over both boards) names whose turn is playing from `usePlayback`.

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
- **A missile hunter as the default.** In a duel against the compressor with
  racks×2 the old preset (railgun, missiles, rack, shields, radiator) completed
  Destroy 34% of the time and the prey won 69%: a powered rack rolls at every
  missile. Since 2 Oct 2026 the missile hunter (railgun, missiles, laser) is
  the preset a Salvage asks for, and the rack gunship stays the default,
  because sending more hunters to missiles takes the racks off the table.
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
  face-up. Recordings were schema v3 then; v7 since the 27 Sept cleanup.

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

- **Deliver in both directions, and the one-stop Deliver + Tanker.** Adopted
  26 Sept 2026 as three rules together: the Deliver deck prints only the
  circuit routes (`circuitRoutes`), a dock visit that loads or unloads a crate
  pumps no Tanker fuel, and Tanker needs 7 fuel, not 8. The same day the
  second rule became **one job per visit** (crates, data or fuel, the
  player's choice), which is one sentence with no exception for data. At 1000
  games against the crates-only rule it moved little: Destroy 37.9 → 39.3%,
  Deliver 32.9 → 33.4%, Intercept 31.4 → 29.6% (its filing now competes with
  fuel), natural 3-seat games 28 → 30 rounds, Tanker completed 22 → 18 per
  100 kept, no failing flag. The bots take the default, the job that scores
  most on the visit (ties: crates, data, fuel). Before, the route
  decided the card: over 600 dealt games a Deliver won 58% with the circuit and
  18% against it, 74% and 31% completed. Neither direction alone works: easy
  routes only made a dealt Deliver 52.5% in 14-round games, hard only 22% in
  33, and in the easy-only games every seat dealt Deliver kept Survey + Tanker
  on the compressor hauler and won almost only when Deliver and Tanker landed
  on one stop. The fixes tried on top of easy-only, 200 games a row: "a visit
  is one deal" for data too 31% / 38 rounds (it slowed every Survey + Tanker
  hand); for crates only 28% with natural games at 33 / 37 / 39 rounds (the
  one-stop had been the game's clock); "a compressor cannot be a Tanker" 36.5%
  with the tightest primaries (29.5 to 37) but 35-round four-seat games and the
  aggressive hauler unpunished with Destroy; a 2-fuel compressed jump 35.5% at
  natural length, rejected because it prices the compressor out. Crates-only
  with Tanker at 7 is the one adopted, and at 1000 games a row: dealt Destroy
  37.9%, Deliver 32.9%, Intercept 31.4%; natural play 28 / 31 / 33 rounds at
  3 / 4 / 2 seats with a 33 / 33 / 33 seat spread; no failing flag. The cost is
  length (below) and a few more kills.
- **Piracy on either turn.** "Whenever a turn ends with you in the same sector
  as an undocked carrier, you take it", measured 26 Sept against the pirate's
  own turn only: mean row −0.6pp, dealt Deliver 48.5% → 45.5%, one new
  `outlier` from a bar that moved rather than a hull. It needs a second clause
  (one seizure per turn end, or two pirates trade the loot for ever) and buys
  nothing; the designer kept the simpler rule.

- **Deployment on black hole rings 2, 3 or 4.** Adopted 30 Sept 2026 so a
  player can start nearer the others or further from them; never ring 5, the
  lane ring, where a ship could jump out on its first turn. Measured against
  rings 3 and 4 on the same seeds (benchmark 120 games a seat count, balance
  300 a row), with the bots' hunters taking the fastest ring allowed: kills
  1.7 / 3.7 / 6.5 / 9.1 -> 1.9 / 4.3 / 7.6 / 10.3, dealt Destroy / Deliver /
  Intercept 39 / 34 / 33 -> 43 / 34 / 30%, every card within 3 per 100 kept,
  length unchanged, no failing flag. Rings 1 to 4 read the same (kills 1.9 /
  4.5 / 8.8 / 10.2, 42 / 36 / 30%) with a Survey holder deploying on the
  dive ring: the dive moves to round one and the card barely moves (21 ->
  24), because the data is then lost more often on the crowded fast rings.

- **A jump faces prograde; recoil pushes against the facing.** Adopted 30
  Sept 2026 from the designer's play: a jump is a burn out of the well, so it
  needs prograde facing (rotate first), and a railgun's shot goes forward so
  the ship goes back, one ring inward facing prograde and outward facing
  retrograde. Both used to follow the facing like a burn. Measured against
  the rules before on the same seeds (benchmark 120 games a seat count,
  balance 300 a row): Destroy 58 -> 68 completed per 100 kept, the railgun
  hull 24% -> 29% of its seats, kills 1.5 / 3.0 / 5.5 / 7.5 -> 1.7 / 3.7 /
  6.5 / 9.1; dealt Destroy / Deliver / Intercept 39 / 34 / 33%; no failing
  flag (`offbook:armed_legs` drops back under the line). A hunter firing
  prograde now drops to the faster ring and keeps pace with the target
  instead of falling behind on a slower one.

- **One action a visit, Tanker at 5.** Adopted 28 Sept 2026 as one
  package: a visit does one thing, load the crates waiting or sell one item
  (loading spends no station); Tanker hands in 5 fuel, not 7; and a bot
  holding a Tanker with its primary open pumps at the station of the well it
  is already in. Tanker at 7 was the hardest card at the table and for the
  bots (14 completed per 100 kept): a jump costs 3 fuel and the descent to
  the station 2, so from a full tank nobody arrived with 7 and every Tanker
  refilled inside the planet's well. Tanker at 6 on its own took the card to
  23 but through a shortcut: loading was free, so the Deliver hauler pumped
  at its crate pickup (67% of all pumps), Deliver + Tanker hands won 47%
  and the dealt Deliver bar rose 37 → 43% at 1000 games. One action a visit
  closes that (those hands 24%) and on its own takes Tanker back to 13.
  Measured, one action a visit, benchmark 120 games a seat count and
  balance 1000 a row: Tanker at 6 13, at 5 19, at 6 with the bot fix 17, at
  5 with it 23 (Survey 27, Escort 29, Piracy 22, Salvage 14); dealt Destroy /
  Deliver / Intercept 42 / 35 / 33% (against 37 / 37 / 31 at 7 before the
  package); rounds 28 / 27 / 27 / 29. At 5 a hull that jumps with a full
  tank arrives with 5 (a compressor with 7), so the card needs no refill in
  the well. The cost: hands holding a Tanker win more than hands without one
  whatever the primary (Deliver 33 / 22%, Destroy 31 / 25%, Intercept 17 /
  14%), and Salvage is the weakest secondary.

- **One sale per station, no hold limit.** Adopted 28 Sept 2026 as one
  package: each station buys one item from each player, once per game (a
  Deliver crate, one piece of data, one loot item or a Tanker's fuel), loading
  a crate is free (until the next entry made loading the visit's one action), the hold has no limit, and a pirate takes one item of its
  choice. It replaces a visit doing one job, the one-crate hold, loot filling
  the hold and the automatic crate-first seizure. Measured against the rules
  it replaced on the same seeds (benchmark 240 games a seat count, balance
  300 a row, 27 Sept, bots with the deployment and patrol fixes): dealt
  Destroy / Deliver / Intercept 38 / 29 / 32 → 40 / 37 / 29; kills 2.7 / 5.1
  / 7.5 / 10.7 → 2.1 / 4.1 / 6.8 / 9.3; rounds 28 / 28 / 28 / 30 → 29 / 29 /
  29 / 31; turns ending in a planet well at three seats 39% → 43%; Deliver
  kept by 23% → 33% of seats; no balance flag either way. **Adopted for
  simplicity, not for balance.** The designer's original aim, ships going
  back to the black hole once their stations are spent, is not met by the
  bots: their planet time after the primary comes from the secondaries'
  station trips and Tanker fills. `SALE_RULES`, `HOLD_RULES` and the two rule
  switches are gone with every path that read them off.

- **Secondaries dealt from a pile, with Escort and Salvage.** Adopted 27 Sept
  2026 as one package: the secondary pile is shuffled and dealt like the
  primaries (3, keep any 2, two of a kind allowed as two jobs), Escort and
  Salvage join Survey, Piracy and Tanker, and a moored ship neither fires nor
  is fired at. The deal alone is neutral (benchmark at 240 games a seat count,
  same seeds, with only the old three kinds: rounds 31 / 32 / 32 / 33 against
  31 / 33 / 32 / 33, every card within 3 per 100 kept). Both cards passed the
  free-ride screen (with nobody trying, 9–11% of seats would score an Escort
  and 1–5% a Salvage with a wreck that lasted the round). With bots flying
  them they read like the old cards: completed per 100 kept Survey 34, Escort
  33, Piracy 27, Salvage 23, Tanker 19. The balance suite (baselines,
  logical, illogical, off-book, 300 games a row) has **no flag at all**
  against one failing and six glass on main; dealt Destroy / Deliver /
  Intercept 39 / 32 / 30 against 41 / 38 / 30. Roads measured on the way:
  **Salvage as a crate** (the first shape) put two of five kinds in Deliver's
  one-crate hold and took dealt Deliver to 28% and Destroy to 45%; the black
  box as data gave back Destroy's edge and removed the clash. **An automatic
  Escort marker** made hunters mark their own prey at point blank; marking is
  a "you may". **Moored-safe** on its own is small (Deliver +3, Intercept +2,
  kills unchanged) and was kept for the table: it is what a berth reads as.
  The cost is kills, about a third fewer at every seat count (2.2 / 4.7 / 8.2
  / 10.4 against 3.6 / 7.5 / 11.8 / 15.4), and adding one card at a time
  shows why: Escort is a truce, a bot never shoots the ship its own marker is
  on (3.4 kills at three seats, 3.0 with Salvage, 2.3 with Escort, 3.3 with
  Escort when the bots ignore their markers). The designer wants that table
  politics; the escorted ship may always turn on its escort.

- **Absorbing makes no heat.** Adopted 1 Oct 2026 for simplicity: a shield's
  cost is its cubes at its owner's check like every other subsystem's, and the
  cubes it spends absorbing simply come off. Before, the spent cubes went onto
  the track a second time (2 heat a point), while a rack that intercepted made
  none. Measured against it on the same seeds, 200 games a row: natural play
  does not move (rounds 26 → 27, kills 2.1 / 4.0 / 6.3 / 8.5 → 2.0 / 4.1 / 5.8
  / 8.5 at 3–6 seats, shields powered 55 → 56%), but the railgun hunter lost
  its edge, because heat dumped through a wall was how a railgun hurt a walled
  ship: dealt Destroy 42 → 30%, Deliver 29 → 34%, the hunter's natural seats
  41 → 27%. That was the strong card coming back to the pack: at 1000 games a
  row the dealt primaries read Destroy 35%, Deliver 34%, Intercept 33%, the
  most even yet, with the aggressive hunter unchanged. The tanky hunter took a
  laser for its rack (29 → 32% at 1000 games, 1.10 deaths a game either way).
  Benchmark at 120 games a seat count: kills 1.9 / 4.3 / 7.6 / 10.3 → 2.0 /
  3.2 / 6.5 / 9.8, rounds 26 / 27 / 27 / 30 → 27 / 26 / 27 / 30, Deliver 68 →
  73 and Destroy 66 → 62 completed per 100 kept.
- **The plasma cannon and the disruptor.** Adopted 1 Oct 2026 as the
  designer's two weapons. Plasma (side, 3 energy): 4 damage, ±1 ring ±1 sector,
  one side only; shields stop it a point per cube, so a full wall stops it
  whole. Swept under heat-free absorption, 200 games a row: 3 damage for 1
  energy read as a laser that walls stop; 2 damage was weaker than a laser at
  1 or 2 energy (the disruptor + plasma×2 row fell to 13–20%); 4 for 2 put
  railgun + plasma×2 nine points over its bar; 4 for 3 keeps every plasma row
  within six (railgun + plasma×2 36% against 31 at 300 games). Firing only
  abeam (±0 sectors) made every plasma row weak. In no hunter slot does it
  beat the laser: a wall stops plasma and not a laser. The disruptor (either
  slot, 3 energy) is an EMP burst with the ballistic rack's box (±1 ring ±1
  sector, its own ring too, either side): no damage, a hit breaks the named
  subsystem and dumps its cubes, any powered shield stops it whole and turns
  face-up; it does not satisfy Destroy. It was first spinal in the bow (1–8
  ahead): there its energy (2/3/4) and range (5/8) read the same, because the
  bow priced it by displacing the railgun, and with lasers×2 it read 29%
  against 31. As the EMP, 300 games a row, every build sits within six of its
  bar but one (sensor bow + shields×2 + radiator + disruptor, Intercept, +8);
  at 2 energy disruptor + plasma×2 reads +9. Its partner is plasma, which
  strips a wall cheaply so the disruptor fired after it gets through.
- **Nine presets, three per bow, picked by the secondaries.** Adopted 2 Oct
  2026 in place of the six role × variant presets, from the designer: the
  primary chooses the bow, the secondaries the side slots, the way a player
  would. Each bow has a default, and a card that wants a different kit asks
  for it (Piracy > Salvage > Escort > Tanker > Survey when two ask): railgun
  gunship (laser, rack), brawler for Piracy (plasma, rack), missile hunter for
  Salvage (missiles, laser); sensor raider (disruptor, plasma), watcher for
  Escort (shields×2, laser), missile picket for Salvage; compressor hauler
  (shields×2, laser), runner for Tanker or Salvage (disruptor, laser),
  privateer for Piracy (shields×2, plasma). Every system now flies in natural
  play (missiles 19–22% of seats, plasma 37%, the disruptor 27–30%). The first
  mapping sent Survey and Piracy hunters to the missiles: racks fell to 7% of
  seats, missiles went unanswered and the dealt primaries moved to 39 / 30 /
  31, which is why the gunship is the hunter's default and keeps racks on
  21–25% of seats. Measured at 1000 games a row: dealt Destroy / Deliver /
  Intercept 37 / 32 / 33 (35 / 34 / 33 with the six); at 300, 39 / 37 / 31
  with no failing flag and every preset within six of its card's bar.
  Benchmark at 120 games a seat count: kills 2.0 / 3.2 / 6.5 / 9.8 → 1.7 /
  3.7 / 7.0 / 9.6, rounds 27 / 26 / 27 / 30 → 26 / 26 / 28 / 27, Escort 23 →
  25, Salvage 9 → 12 and Piracy 14 → 12 completed per 100 kept. The hull table
  is the hand table now: the brawler (17%), the privateer (15%) and the raider
  (14%) are the Piracy and Intercept hands' hulls, and those hands are weak
  with any hull (forced, every preset with its card reads 30–39%).

- **Escort on the ring, back on either death.** Adopted 2 Oct 2026 as the
  designer's rule: mark an undocked rival carrying cargo on your ring; done
  when it next sells with you in its well; your marker comes back if either
  ship is destroyed. It replaced a rework (presence in the well, the card
  spent if the carrier died) that read 5 per 100 kept. Measured 300 games at
  three / four seats, Escort completions: the old same-sector rule 60 / 115,
  the rework 21 / 32, this rule 58 / 73; in the benchmark 13 per 100 kept
  against the old card's 25 (with the nine presets). Presence in the well is
  the cost; the spent state cost almost nothing (21 / 32 either way).

Known open problems:

- **Escort is the weakest secondary, and the bots are not the lever.**
  Measured 2 Oct 2026 under the designer's rule (settled above): 13
  completed per 100 kept (Survey 26, Tanker 22, Salvage 15, Piracy 14), and
  seats holding an Escort win about two points under the share (31 / 23% at
  three / four seats against 33 / 25). Most marks are made on black hole
  rings and the marked ship sells with the escort elsewhere (0.75 missed
  sales a game against 0.19 paid at three seats). Every bot that rides along
  more completes more Escorts and wins less (ride first: 19.5 / 12.9%), so the
  card stays opportunistic. Markers churn at a big table: at six seats 5.6 are
  placed a game and 4.3 come back on deaths. Marking in the same *planet*
  well instead of on the same ring read 19 per 100 kept, and is the measured
  alternative if the card needs lifting.
- **Piracy and Salvage live off bots that wander.** Since 28 Sept the bots
  put the primary's next step first (a side goal may delay it a turn at
  most), which evened the primaries and cost the secondaries that need
  carriers or wrecks in reach. Piracy hands are weak with any hull: forced,
  every preset with a Piracy hand reads 24–37% against 26–49% with Survey.
- **Two cubes on any shield are immunity to the disruptor**, and bots hold a
  shield up 55–65% of turns, so it hits mostly ships that walls have left. A
  shield that stops it by spending cubes, rather than at any level, is the
  untried variant.
- **The compressor with two guns and a wall beats the hunters in a duel.**
  Both hands dealt Destroy, 400 games each with seats swapped (1 Oct 2026):
  compressor + plasma×2 + shields + radiator 219–161 against the railgun +
  laser + rack hunter, 238–144 against railgun + laser + shields +
  radiators×2; with lasers instead of plasma 229–154 (the mirror is
  186–186). At three seats the compressor-with-guns rows sit inside their
  bar (2 Oct, 300 games: lasers×2 35%, racks×2 33%, plasma×2 35%,
  missiles×2 42% against 40%), so it is a two-player shape. The older
  weaponless-runner and compressor-outlier readings were before the circuit
  routes, one action a visit and heat-free absorption.
- **Data aboard makes every Intercept and Survey holder prey.** A scan is
  data and data is loot: three seizures in four are data, and 40% of
  Intercept scans come on the first legal turn as the interceptor moves into
  range. Dealt Intercept now reads 33–35%, but the raider and the watcher
  are the presets that sit lowest with their own card (30% against 35).
- **Point defence lives on the hunters.** The gunship and the brawler carry
  the only racks in natural play (21–25% of seats); the missile hunter and
  the picket launch 8–13 missiles a game and racks shoot down about one in
  six. A mapping that sent more hunters to missiles left racks on 7% of seats
  and Destroy at 39%; watch the rack share whenever the presets move.
- **The bots keep cards uniformly among the legal ones**, so a weapon hull is
  dealt into Destroy whether or not its gun can finish one (measured before
  the presets: Destroy completed 35% behind a railgun, 12% behind a laser, 5%
  behind missiles). Read a forced weapon hull's number as a band. The fix is
  in `ai/behaviors/loadout.ts`, pricing cards by the loadout without a
  hand-tuned scorer (see `selectBotMissions`).
- **Carrying cargo does not draw fire**, though the table says it does: every
  hull took less hull damage per turn holding a crate than empty. Kills still
  fall on carriers (72% of destroyed ships carried something, nearly all
  data), but that is the hunt for the leader, not the crate.
- **The bots never name the scoop**, so the simulator cannot price the
  critical that strands a ship: `chooseCriticalTarget` reaches it only once
  the engines and thrusters are broken. Teaching it is a bot change to
  measure first, because a hunter that strands its prey is a different
  hunter.
- **Two players is thin**: seat 1 wins 55–59% on the balance seeds. The
  designer wants no artificial limit; special rules for two may come later.
- **Length** (2 Oct 2026, benchmark, 120 games a seat count): 27 / 26 / 29 /
  27 rounds at 3 / 4 / 5 / 6 seats, 1h21 to 2h42 at a minute a turn, kills
  1.9 / 3.5 / 8.0 / 9.1, 0.6–0.7 lead changes a game, the first card at
  round 7–9. The bots' fuel husbandry decides it: with the Tanker holder's
  reserve unlimited games ran 19 rounds, with none 39. The history is in the
  commits that moved it.

## Adding a rule

1. Write it in one sentence for `RULES.md`; if you can't, simplify it.
2. Types in `engine/src/models/`, logic in `engine/src/game/`, event(s) in
   `models/events.ts` + text in `game/describe.ts`.
3. Decide what is public and what is private (`view.ts`, event `privateTo`).
4. Teach the bots (`engine/src/ai/`) and run the sim to see the effect.
5. Tests, then server/UI.
