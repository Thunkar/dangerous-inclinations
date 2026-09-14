# Dangerous Inclinations — Redesign Notes (September 2026)

This document records the design decisions behind the second major revision of the
rules and the code. It is written for the designer. `RULES.md` remains the player-facing
manual and is updated to match. Everything here is meant to be tested with the bot
simulator before being trusted; numbers are starting points, not conclusions.

Guiding constraint, unchanged: **every rule must be playable at a table with tiles,
cubes, a d10 and a pencil.** Where a rule was simplified, the simpler version wins even
if the old one was "more realistic".

---

## 1. Problems observed

| # | Problem | Evidence |
|---|---------|----------|
| 1 | Start of game feels flat. Everyone appears on the same ring, one per sector. | Deployment code and rules. |
| 2 | Free respawn. A destroyed ship returns at the start of its next turn with full hull, full fuel and its cargo, then acts immediately. Dying costs nothing, so "die on purpose to teleport" is a real line of play. | `respawn.ts`, `turns.ts`. |
| 3 | Bots and humans do not start the same way. Sims deploy bots with the seeded RNG; the live server deploys them with `Math.random()`. | `gameService.ts:571`. |
| 4 | Too few missions, and they blur together. Three types; two of them are "go to the target". | `missionDeck.ts`. |
| 5 | Map feels small yet slow. There is one transfer sector per route on the slowest ring (1 sector/turn), so reaching a gate takes up to 23 turns of drifting. Nothing but stations gives a reason to be anywhere. | `transferPoints.ts`. |
| 6 | Broken subsystems can never be repaired. A critical hit is permanent until you die. | No repair code exists. |
| 7 | No hidden information. The server sends the full state to everyone; the UI shows the active player's secret missions, energy and loadout to every viewer; bots read every enemy weapon and its power state. | `roomHandler.ts:322`, `App.tsx:135`, `analyzer.ts:161`. |
| 8 | Missiles are hard to remember. The rule has a special case ("missiles fired after moving skip their drift this turn") and the UI does not show the path. | `missiles.ts`, `MissileRenderer.tsx`. |
| 9 | Code: duplicated setup in three sim entry points, five copies of the dead-bot-coast block, sector distance computed in five places, stale sector-count formula in the intercept check, dead exports, string-parsed stats, energy allocation by subsystem type. | Codebase audit (see §7). |

---

## 2. Decisions

### 2.1 Home ports (fixes 1, 2, 3)

**Deployment.** In turn order, each player places their ship on **Black Hole Ring 4**, in any empty sector, facing prograde, and places their **Home marker** there. (First draft: a planet's Ring 3. The designer pointed out that a planet start pushes everyone toward Deliver cards from that planet and kills the opening scatter; the shared ring keeps both, and Home only has to be fixed and neutral, not remote.)

**Respawn.** When a ship is destroyed:
- it is removed from the board and **drops its cargo** (cargo is lost; scan/survey data too);
- on the owner's next turn they **do nothing except** place the ship on their Home sector (nearest empty sector if occupied) with full hull, full fuel, no energy allocated, and heat 0, and the turn after that is lost as well (designer's choice among half fuel / empty tanks / extra turn: dying costs two turns, which is more than any legitimate trip across the map);
- subsystems are repaired; revealed tiles stay revealed (the table already saw them).

Why this shape:
- Spreading players to the planets (120° apart) makes the black hole the contested middle and puts the transfer lanes between every player and their objectives.
- A fixed, self-chosen home removes the "choose where to reappear" exploit while keeping player agency at setup. Missions are dealt before deployment, so the choice is informed.
- Losing cargo removes the hauler shortcut. Losing a turn makes the destroy mission worth something to the killer even against a player who cannot be knocked out of the game.
- Bots and humans use the same engine function to deploy and to respawn; the bot's deployment choice is made by the AI from the same information a human has, with the game's seeded RNG.

### 2.2 Transfer lanes (fixes 5)

Single transfer sectors become **4-sector arcs**. Every lane connects an arc on Black Hole Ring 5 with an arc on a planet's Ring 3 and is **two-way**. Jumping keeps your offset inside the arc (enter at the 2nd sector of an arc, arrive at the 2nd sector of the connected arc). Cost is unchanged: engines at 3, 3 fuel.

| Lane | Black Hole R5 | Planet R3 |
|------|---------------|-----------|
| Beta A  | 0–3   | Beta 4–7 |
| Alpha A | 4–7   | Alpha 16–19 |
| Gamma A | 8–11  | Gamma 4–7 |
| Beta B  | 12–15 | Beta 16–19 |
| Alpha B | 16–19 | Alpha 4–7 |
| Gamma B | 20–23 | Gamma 16–19 |

The whole of BH Ring 5 is lanes. Reading clockwise the order is Beta, Alpha, Gamma, Beta, Alpha, Gamma, so from any arrival the *next* planet clockwise is 1–7 turns away and the one after it 5–11. Going the "long way" is still possible by burning inward to a faster ring and back out, which is exactly the trade-off the movement system is built around. The old single sectors (BH 18/2/10 and 5/13/21, planet 5 and 18) all lie inside these arcs, so the geometry of the board is preserved.

Everything about lanes lives in one data table (`models/gravityWells.ts`), so arc width and placement are tunable by the simulator.

### 2.3 Docking (fixes 5, 6)

You are **docked** if you end your turn on a station's sector. While docked:
- cargo is picked up and delivered (unchanged);
- **repair one broken subsystem**;
- **restore 2 hull**;
- **reload missiles** to full.

Stations become the map's hubs: haulers go there for cargo, everyone goes there to fix crits, and hunters know where to wait. Repair only at stations also means a crit on a ship far from port matters for several turns, which is what makes sensor arrays worth carrying.

### 2.4 Hidden loadouts (fixes 7)

Every loadout tile starts **face-down**. A tile is **flipped face-up the first time it does something**:

| Tile | Revealed when |
|------|---------------|
| Railgun, laser, missiles, ballistic rack | it fires (or a rack intercepts a missile) |
| Shields | they absorb damage |
| Sensor array | it scans, or a critical lands on an 8 or 9 |
| Radiator | your heat goes above 5 at a heat check (it is visibly shedding heat) |
| Fuel compressor | a jump is refunded |
| Any tile | it is broken by a critical hit |

Fixed systems (engines, thrusters, scoop) are always known. Face-up tiles stay face-up for the rest of the game.

**Public:** position, facing, hull, heat, **energy on every slot**, number of crates/data/salvage carried, wrecks, face-up tiles, completed missions.
**Private:** what a face-down tile is, fuel, missile ammo, missions in hand, cargo destinations.

Energy allocation is deliberately public (a later decision by the designer): cubes sit on the tiles in the open, so you can see that a rival put four cubes on their forward slot without knowing for sure what it is. It gives hints without giving the answer, and it costs nothing at the table. Only cards and the fuel track go behind the screen; in the app the server sends each client only what that player may know.

**Critical hits target slots, not systems.** On a critical the attacker names a slot (forward, side 1–4, or one of the three fixed systems). The tile in it is revealed and broken. Naming a face-down slot is a gamble; naming a face-up one is a plan. This replaces "name a subsystem type", which cannot work when types are hidden.

**Completed missions are face-up.** When you complete a mission you flip the card. Everyone sees the score, and everyone learns what kind of player you are (a flipped cargo card says "hauler"). This is the catch-up mechanism a hidden-objective race needs: the player on two completed missions becomes everybody's problem.

### 2.5 Scanning (fixes 4, 7)

The passive "be within 3 sectors with sensors powered" check becomes an **action**:

> **Scan [target].** Requires a powered sensor array and a target on your ring within 3 sectors. Reveal your sensor tile, take 2 heat, and **look at one of the target's face-down tiles** (privately; the target shows it only to you). If you hold an Intercept mission for that target, you also acquire their transmission.

The sensor array is now an intelligence tool for everyone, not a mission-specific key. Being scanned is visible ("they are looking at me"), which is the tension the intercept mission always wanted. What you learned from a scan is yours alone, so the app tracks per-player knowledge in addition to the public face-up tiles.

### 2.6 Missions (fixes 4)

Four mission types. One card is one point; first to three wins.

| Card | Complete when |
|--------|---------------|
| **Destroy [player]** | you reduce their hull to 0 |
| **Deliver [A → B]** | you dock at A, then dock at B carrying the crate |
| **Intercept [player]** | you scan them, then dock at any station |
| **Survey the Event Horizon** | you end a turn on Black Hole Ring 1, then dock at any station |

Deck: one Destroy and one Intercept per opponent; all six Deliver routes; two Survey. Two players see 10 cards, three 12, four 14. Draw 5, keep 3.

Survey is the one card added in this redesign (a dive into the 8-sector ring and back out, then a delivery). Three other candidates were tried and rejected by the designer: Ambush (4+ hull damage in one turn: a watered-down Destroy), Salvage with wreck tokens (impossible in a game where nobody dies), Breach (break a tile with a critical: anyone holding Destroy on the same player completes it for free), and Grand Tour (dock at all three stations) was cut as well. Rule for the future: new mission cards are proposed to the designer, not shipped.

### 2.7 Missiles (fixes 8)

The rule is kept; the problem was how it was conveyed:

> At the end of your turn each of your missiles **rides its orbit** (drifts with its ring), then **flies up to 3 steps** toward its target (a step is one ring or one sector; it closes rings first). If it ends on the target's sector it attacks: the target's powered PDC may intercept on a 2+, otherwise roll to hit as normal. A missile that has flown three times without hitting is removed.
>
> The turn you launch it: a missile launched **after** you moved has already ridden along with your ship, so it does not drift again that turn.

The launch-after-move exception stays because it is physically right (the missile was carried by the ship) and removing it would give late launches a free extra move. What changes: the missile now carries a `launchedAfterMove` flag set per missile at launch (the old code marked every missile fired that round, which corrupted mixed-order launches), the rule is written as "rides its orbit, then flies", and the app draws the projected path for each missile with the drift segment shown or omitted accordingly, plus a one-line tooltip.

### 2.8 Things deliberately unchanged

Energy/heat model, dissipation 5, shields as heat converters, burn table, phasing table, weapon stats, ring velocities, 24 sectors, one forward and four side slots (the docs said two forward slots; the code has had one since May, and the tension "railgun or sensor" is good — the docs are now corrected).

---

## 3. Bot parity

Bots must play with **exactly the information a human has**. The engine exposes a
`GameView` for a viewer (own ship in full; opponents as public info plus face-up
and scanned tiles). Bots decide from a `GameView`, never from `GameState`. Deployment
and respawn go through the same engine functions for humans and bots, and bot choices
use the game's seeded RNG so live games are reproducible from their seed.

---

## 4. UI direction

- **Perspective is the logged-in player**, always. The active player is highlighted, never impersonated.
- The layout is a **table**: the board in the middle; *your* ship mat below it (tiles, energy cubes, heat and hull tracks, missions in hand); opponents' mats along the top showing only their face-up tiles, hull, heat and score, with a "?" on each face-down slot and a note of what you learned from scans.
- Dice rolls are shown as a d10 with the threshold marked (1 miss, 2–9 hit, 8–10 crit with sensors).
- Missile paths are drawn for the coming turn.
- The UI may call pure engine functions for previews (ranges, projected positions, costs); it never advances state. `CLAUDE.md` is updated to say so; the earlier "types only" rule was never followed and forced the UI to re-implement rules.

---

## 5. What to measure

The simulator should report, before and after:
- game length (turns to first win), by player count;
- turns from deployment to first docking, and to first jump;
- mission completion by type, and win rate by mission family;
- deaths per game and turns lost to respawn;
- how often a face-down tile is still unknown at game end (is hidden info actually hidden?).

---

## 5b. First results

Bot-vs-bot, 100 games per row (30 for "before"), seeds 1000+. "Rounds" = full rounds of the table. The old simulator capped games at 150 player-turns (75/50/37 rounds for 2/3/4 bots); the new one at 400.

| | 2 bots before | 2 bots after | 3 bots before | 3 bots after | 4 bots before | 4 bots after |
|---|---|---|---|---|---|---|
| Games finished (not timed out) | 67% | 95% | 30% | 97% | 43% | 100% |
| Median length (rounds) | 69 | 27 | >50 (cap) | 24 | >37 (cap) | 27 |
| Hull damage per game (median) | 4 | 0 | 8 | 2 | 10 | 2 |
| Destructions per game (mean) | — | 0 | — | 0 | — | 0 |
| First dock / first jump (turn, median) | — | 3 / 6 | — | 3 / 6 | — | 3 / 6 |
| Scans per game | — | 2.8 | — | 5.8 | — | 9.9 |
| Tiles still face-down per player at end (of 5) | — | 1.8 | — | 1.2 | — | 0.6 |

Completions by type (3 bots, 100 games): {"deliver_cargo": 347, "survey": 106, "intercept_transmission": 124, "grand_tour": 1, "salvage": 3}.

What this says:
- **Length and pacing are fixed.** Every player count now finishes in about 25 rounds, players dock by turn 3 and jump by turn 6, and the lanes are used every game.
- **Hidden information works but erodes fast.** With four players almost every tile is face-up by the end (scans average 10 per game); with two, about a third of tiles stay hidden. Scanning may be too cheap, or the sensor array too common in bot loadouts.
- **Combat does not happen.** Destructions per game are effectively zero and combat loadouts almost never win. Bots pick the scout/hauler loadout (sensor, shields, radiator, compressor, laser) nine times out of ten. Part of this is the bots' risk aversion, part is the rules: a Deliver card takes a few rounds, a kill takes a hunt across the map against a target that can repair at any station. See the first open question below.

## 6. Open questions for playtesting

- **Combat is under-rewarded.** In the first bot simulations after the redesign almost no fights happen: games are decided by Deliver cards, with Survey and Intercept next. With the four-card deck the bots never keep a Destroy card at all (0 of 81 offered over 90 hands at 3 players): their cost model rates a hunt at ~22 turns against 12–16 for the other cards, and forcing them to keep it produced zero kills, so their pessimism is accurate. Bot games therefore contain no combat. Candidates, in order of simplicity (to be decided by the designer, not shipped by default):
  1. Destroy is worth **two** points (it needs another player's active cooperation to fail, and costs the victim a turn and cargo, so the payoff should match the difficulty).
  2. A destroyed ship's picked-up **crates** are left as loot on its sector for anyone to collect, so a kill near a hauler is doubly valuable.
  3. Deployment closer together (Home on planet ring 2, or all players sharing one side of the map).
  Measure with the sim: kills per game, and share of wins that include a combat card.
- Home is the deployment sector on Black Hole Ring 4 (decided). Ring 3 or 5 would change the opening tempo; untested.
- Death now costs two turns (decided). Watch 2-player games for snowballing.
- Is +3 hull per dock enough to matter, or should docking fully repair?
- Arc width 4 versus 3 or 6.
- Scan peeks: should a peek at an already face-up tile be refused (forcing a face-down choice)? The engine currently allows any loadout slot so a scan still works for Intercept when everything is face-up.

## 6b. Why nobody fights: measurements (14 Sept 2026, 60 games × 3 bots per row)

After teaching the bots denial (interdict a rival who is one delivery from winning, ambush at lanes and stations, value damage by the victim's danger), hull damage per game went from a mean of 1.1 to 8.8 and destructions from 0 to 0.2, and 57% of bots now carry a gun. Games still contain almost no kills and Destroy is still never kept in 3-player hands. The reasons are in the rules, measured one at a time:

1. **Shields switch combat off.** A shield tile holds 4 cubes, absorbs 4 damage and refills for free next turn. Heat caps a clean volley at 5 energy of weapons; the railgun is exactly 4, exactly absorbed. The broadside laser cannot fire on the railgun's ring, so the only combination that reaches a hull through full shields is railgun + missiles + radiator (2 hull per turn). Only 7% of damage reached hulls before the AI change, 36% after. Levers: spent shield cubes stay spent until the ship docks; or shields cap at 2; or a critical breaks the named tile even when shields absorb the shot.
2. **A kill takes about 5 turns of contact and docking gives it back.** 10 hull, ~2 hull per turn, +3 per dock. Damage short of a kill denies nothing. Levers, in order of effect: dock repair +3 → +1 (or tiles only), hull 10 → 8, then damage values.
3. **Destroy is dominated, not just slow.** Forcing bots to keep it produced 12 completions and 0.6 destructions per game, but median length went 27 → 39 rounds with 12% timeouts, and the pure-trade hands that stayed out of it won 93% of their games. Combat must produce points, not only denial: Destroy worth 2, or a killed ship's crates left as loot on its sector.
4. **The deck decides games before anyone moves.** On a uniform hull, hands with an Intercept win 45%, hands without win 24%. Intercept is the cheapest card (a scan and one dock, both of which a cargo run does anyway) and there is one per opponent; Deliver is the most expensive and there are six. Levers: deal only 3 of the 6 Deliver routes per game; give Intercept a real cost (deliver to a named station, or scan from another ring).
5. **Policing the leader costs the policeman.** Interdicting drops the interdictor's win rate from 24% to 19%; the third player collects. Until a kill is worth a point, leaving the leader alone is individually correct.
6. **Endgame deadlock is possible** when everyone sits at 2/3 and interdicts (1 game in 60 hit the cap). A tiebreak at the cap (most completed missions, then hull) is enough.

None of these levers has been pulled; they are the designer's calls.

## 7. Code plan

Order matters; each step keeps the tests green. **Status (14 Sept 2026): all eight steps are done.** The engine has 608 tests; the server has a no-network smoke harness (`yarn smoke` in `server/`) that checks every message a human would receive for leaks; the simulator runs on worker threads (`yarn sim` in `engine/`). Two adversarial Codex reviews were run on the result and their confirmed findings fixed (id shuffling so crate ids don't reveal routes, private scoop amounts, per-turn rack reset, burns that would leave the rings rejected, face-down-first scans, multi-wreck recovery, tile counts per set, player bounds, and a list of server races and leaks).

1. **Engine foundations.** Stable subsystem ids (`forward-0`, `side-2`, `engines`) used by all actions; `isRevealed`; one `geometry.ts` for sector arithmetic; one `useSubsystem` helper for "mark used + heat + reveal"; structured log entries with a visibility flag.
2. **Turn pipeline.** `executeTurn` becomes start-of-turn (respawn, heat) → actions → end-of-turn (missiles, docking, missions) → advance. Heat damage moves to the start of the affected player's turn, matching the rules.
3. **New rules.** Home ports, lanes, docking, scan action, slot-based crits, new missions, missile rule, face-up completed missions.
4. **GameView + redaction.** `viewFor(state, playerId)`; bots and server use it.
5. **Sim cleanup.** One `setupGame`, one dead-player rule, structured stats instead of regex on log strings, one CLI.
6. **Server.** Per-client views; bots deploy through the AI with the seeded RNG.
7. **UI.** Consume `GameView`; player perspective; intel mats; missile paths; table layout.
8. **Tests.** Delete tests that assert log strings or trivial getters; add tests for every rule in §2.
