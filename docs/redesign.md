# Dangerous Inclinations — Redesign Notes (September 2026)

This document records the design decisions behind the second major revision of the
rules and the code. It is written for the designer. `RULES.md` remains the player-facing
manual and is the only authority on what the rules are; where this document and RULES.md
disagree, RULES.md is right and this document is out of date.

**How to read it.** Sections 1–4 are the redesign itself (14 September 2026). Sections 5b,
6 and 6b are the measurements and open questions of that week, kept as history and marked
with the date they were true; several of the levers they weigh were pulled afterwards and
some were pulled the other way. **Section 6d is the decision log** and is the part that is
current: every rule change since the redesign, what it was meant to do, and the number that
said it worked. Section 7 is the code plan, done.

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

**Phasing a jump (16 Sept 2026).** A jump landed on the matching sector of the arrival arc and that was that, while a burn could be phased for 1 fuel a sector. Jumps are now phased the same way, bounded by the arc: from a landing at offset *k* the reachable offsets are 0..3, i.e. an adjustment of −*k*..(3−*k*), at 1 fuel a sector. Three decisions behind that one sentence:

- **The arc is the only bound.** A burn's `getAdjustmentRange` is *not* applied on top. Its lower bound exists to keep at least one sector of forward drift (`MIN_FORWARD_MOVEMENT`), and a jump has no drift to brake against; worse, both lane rings have velocity 1, so that bound would read "0 to +3" and forbid phasing backwards altogether. One bound, and it is the one a player can see drawn on the board: the four sectors of the arrival arc. The rule reads "any departure sector can reach any sector of the arrival arc", which is easier to remember than either bound.
- **The compressor pays for the jump, not for the phasing.** The first draft put the phasing on the compressor's tab so that "jumps cost no fuel" stayed true with no second sentence. The simulator killed that: over 40 bot games, all 464 jumps were made by ships carrying a compressor (four seats in five take one), 52% of them phased, and the adjustments spiked at the maximum free shift (+3 in 127 of 240). Free for four seats in five is a perk, not a decision, and the designer asked for phasing "just like when changing rings", where it always costs. So the compressor refunds the jump's own 3 fuel and phasing costs 1 fuel a sector for everyone; the manual's compressor line reads "a jump's own fuel is refunded". Measured both ways before the designer decided (100 games, 3 bots): paying drops phased jumps from 51% to 17%, breaks up the spike at the maximum free shift (+3 fell from 319 of 604 phased jumps to 60 of 222, leaving +1/+2/+3 near-even), and makes the choice track the tank — 0% of jumps phased on an empty tank against 33–47% on six or seven fuel. It costs about six rounds of median game length against the free version, and still finishes two rounds faster than before phasing existed.
- **No extra heat.** A jump's heat is the cubes on the engines, as for a burn; phasing a burn adds none, so phasing a jump adds none. Nothing new to track.

What it changes at the table: the lanes stop being six fixed doors and become six four-sector windows. A hauler can pay 1–3 fuel to land on the sector that lines its next burn up with the station, and an interceptor can no longer be certain which of four sectors a rival will appear in. Because the phasing is paid even by a compressor, the shift is a real trade against the tank rather than a free three sectors on every transit.

### 2.3 Docking (fixes 5, 6)

You are **docked** if you end your turn on a station's sector. While docked:
- cargo is picked up and delivered (unchanged);
- **repair one broken subsystem**;
- **restore 2 hull**;
- **reload missiles** to full.

Stations become the map's hubs: haulers go there for cargo, everyone goes there to fix crits, and hunters know where to wait. Repair only at stations also means a crit on a ship far from port matters for several turns, which is what makes sensor arrays worth carrying.

**Moored (16 Sept 2026).** A station advanced at the end of the round while the ship docked to it drifted on its own turn. Both move 4 sectors on a planet's ring 1, so they ended every turn together — but for the part of the round between a ship's turn and the round's end, the ship sat 4 sectors ahead of its own station, and staying docked was something a player re-achieved every turn rather than something they *were*. A docked ship is now moored: it does not drift on its own, and it moves with the station when stations advance.

- **Docked is read off the board, not stored.** A ship is moored when it stands on a station's sector — the same test that already decides docking (`getStationAt`). On the table the ship token sits on the station token and that is the whole rule; in the code there is no `dockedAt` field that a burn, a recoil, a destruction or a respawn could leave stale.
- **A coast holds the berth; a burn casts off.** "Does not drift on its own" is exactly a coast that goes nowhere. A burn is unchanged — it drifts and then changes ring, because a ship that lets go of a station lets go with the station's velocity — so a soft prograde burn (1 cube, 1 fuel) always gets a ship under way in one turn, and docking has just repaired its engines. With a dry tank the scoop still runs while moored, which recovers 4 fuel on ring 1: an empty ship is held at the best place on the map to be held, instead of being pushed off it.
- **Speed is unchanged; timing is not.** A moored ship advances 0 on its turn and 4 with the station; a free ring-1 ship advances 4 on its turn and 0 at the round's end. Both are 4 a round, and both end every turn on the same sector they would have before. What changes is where a ship stands during *other* players' turns — on its station, not 4 sectors past it — so a station is now a place a hunter can lie in wait for a whole round, and a departing ship leaves from where the station is now rather than from where it was.
- **Edge cases.** Two ships can share a station sector and both ride it. A destroyed ship is off the board and rides nothing; it respawns at Home (black hole ring 4), where there are no stations, so it is never moored on the way back.

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

_As drafted on 14 September 2026. The card values, the deck and the daring cards all
changed afterwards; RULES.md §Missions and §6d.3 below are current._

Four mission types. One card is one point; first to three wins.

| Card | Complete when |
|--------|---------------|
| **Destroy [player]** | you reduce their hull to 0 |
| **Deliver [A → B]** | you dock at A, then dock at B carrying the crate |
| **Intercept [player]** | you scan them, then dock at any station |
| **Survey the Event Horizon** | you end a turn on Black Hole Ring 1, then dock at any station |

Deck: one Destroy and one Intercept per opponent; all six Deliver routes; two Survey. Two players see 10 cards, three 12, four 14. Draw 6, keep 3.

Survey is the one card added in this redesign (a dive into the 8-sector ring and back out, then a delivery). Three other candidates were tried and rejected by the designer: Ambush (4+ hull damage in one turn: a watered-down Destroy), Salvage with wreck tokens (impossible in a game where nobody dies), Breach (break a tile with a critical: anyone holding Destroy on the same player completes it for free), and Grand Tour (dock at all three stations) was cut as well. Rule for the future: new mission cards are proposed to the designer, not shipped.

### 2.7 Missiles (fixes 8)

The rule is kept; the problem was how it was conveyed:

> At the end of your turn each of your missiles **rides its orbit** (drifts with its ring), then **flies up to 3 steps** toward its target (a step is one ring or one sector; it closes rings first). If it ends on the target's sector it attacks: the target's powered PDC may intercept on a 2+, otherwise roll to hit as normal. A missile that has flown three times without hitting is removed.
>
> The turn you launch it: a missile launched **after** you moved has already ridden along with your ship, so it does not drift again that turn.

The launch-after-move exception stays because it is physically right (the missile was carried by the ship) and removing it would give late launches a free extra move. What changes: the missile now carries a `launchedAfterMove` flag set per missile at launch (the old code marked every missile fired that round, which corrupted mixed-order launches), the rule is written as "rides its orbit, then flies", and the app draws the projected path for each missile with the drift segment shown or omitted accordingly, plus a one-line tooltip.

### 2.8 Things deliberately unchanged

Energy/heat model, dissipation 5, shields as heat converters (they buy absorption with cubes as well since 17 Sept — §6d.5), burn table, phasing table, weapon stats, ring velocities, 24 sectors, one forward and four side slots (the docs said two forward slots; the code has had one since May, and the tension "railgun or sensor" is good — the docs are now corrected).

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

## 5b. First results (14 September 2026 — history)

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

## 6. Open questions for playtesting (14 September 2026 — history; see §6d for what was decided)

- **Combat is under-rewarded.** In the first bot simulations after the redesign almost no fights happen: games are decided by Deliver cards, with Survey and Intercept next. With the four-card deck the bots never keep a Destroy card at all (0 of 81 offered over 90 hands at 3 players): their cost model rates a hunt at ~22 turns against 12–16 for the other cards, and forcing them to keep it produced zero kills, so their pessimism is accurate. Bot games therefore contain no combat. Candidates, in order of simplicity (to be decided by the designer, not shipped by default):
  1. Destroy is worth **two** points (it needs another player's active cooperation to fail, and costs the victim a turn and cargo, so the payoff should match the difficulty). **Adopted 15 Sept 2026** after the experiment matrix; the other levers were not.
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

Every lever above was eventually pulled or discarded; §6d is the record.

## 6c. How to test a rule before adopting it

The rules are constants in `engine/src/models/`; there are no knobs on the game state (the last of them were retired on 16 Sept 2026, once every question they held open had been answered). To measure a change before adopting it, use the simulator's experiment-only overrides with the same `--baseSeed` as the baseline so that only the rule differs:

| channel | reaches |
|---|---|
| `--tiles=ballistic_rack.damage=3` | any field of any tile: slot group, energy, passive effect |
| `--weapons=laser.sectorRange=2` | a weapon's firing stats |
| `--loadouts=hunter-tanky=railgun/...` | the bots' hull templates, per archetype |
| `--seats=bot-1=railgun/...` | a hull forced on one seat, whatever its hand asks for |
| `--hands=bot-1=1` | how many two-point cards a seat keeps — the bots price one road to four points and take it every time, so a plan they never choose is only measurable dealt |

Then `yarn balance` (exits 1 on an outlier, a stall or a slow row) and `yarn bench`
(one page describing how the rules as they stand play at 3/4/5/6 seats, stamped
with the rules it ran under, so two runs can be diffed). Keep the games and seeds
fixed between runs or the comparison is worthless.

A change that survives its experiment moves into `engine/src/models/`. The lab
notes for the changes in §6d were deleted on 18 September once the rules they
measured no longer existed — wrong numbers read as current are worse than no
numbers — and each entry there names the commit that carries them.

## 6d. Decision log, 15–18 September 2026

What changed after the redesign, why, and the number that backed it. The
measurements were lab notes in `docs/` that described rules which no longer
exist; they were removed on 18 September and live in git history (see the
commits named below). **This section, not §6b, is what is current.**

**1. Destroy is worth two points** (15 Sept, morning). The only single change that
moved behaviour: bots start keeping Destroy, gun hulls go from 57% to 91% of
seats, kills from 0.2 to 0.6 a game, length from 27 to 36 rounds. Shield changes
alone made hits hurt without making anyone seek one. Measured over 18 rows × 100
games on identical seeds.

**2. Lasers ignore shields, and lanes are one-way** (15 Sept, afternoon). Shields
are electromagnetic and stop only physical projectiles; the laser keeps its one
side, 2 damage, ±2 rings and ±1 sector. A laser seat's hull damage went up
×13, and with a laser on every hull kills and Destroy completions doubled at 99%
of games finishing. Separately, each planet got an outbound arc from the black
hole and an inbound arc back, making Alpha → Gamma → Beta → Alpha the cheap
circuit; it cost about nine rounds of length (36 → 45 median) because half the
Deliver routes now run against the circuit. The geometry behind the laser call:
on real bot movement the railgun has a target in its envelope on 16% of turns and
keeps it into the next turn 36% of the time, a single laser 4.8% and 17%, and
missiles 30% and 53% — the laser is starved by its ±1-sector window, not by its
side, because adjacent rings move at different speeds.

**3. Survey was made expensive, and then made cheap again** (15 Sept evening;
reverted 16 Sept, commit `6a4c4fe`). It briefly named a planet and asked for two
consecutive turns held on Black Hole Ring 1 with sensors powered. That worked as
written — completions fell from 94 to 38 per 100 games — and the bots simply
stopped keeping it (25% → 3% of held cards), which left hands leaning on Destroy
and three hunters standing off: 72% of games decided instead of 86%, median 56
rounds instead of 45. A card nobody keeps is not a priced card, it is a missing
one. **Current rule:** end one turn on Black Hole Ring 1, take the chit, file it
at any station, worth 1 point, no sensor needed. The two-turn hold left no trace
in the code — with a one-turn hold the counter, its event and its UI text were
all unreachable, so they were deleted rather than set to 1.

**4. Shields run hot** (15 Sept night). Every point a shield absorbs is 2 heat on
its owner (`SHIELD_HEAT_PER_POINT`). Rationale: shields felt cheap; you may still
shield up, but it has to cost the other systems. Lowering base dissipation
instead was measured and rejected — it taxes the 6-heat railgun volley more than
the 2-heat laser, which is the opposite of what was wanted. Still current.

**5. Shields buy absorption by the point** (17 Sept, commit `69cc98c`). A tile
used to absorb damage up to the cubes on it and get those cubes back, so one
powered tile was permanent immunity to every 2-damage weapon and two were
immunity to the railgun: of the shots a bot holding a Destroy declined to take at
its named target with a legal shot in hand, **66% were declined because the shot
would have been absorbed whole**. A point of absorption now costs two cubes — the
same two as the heat it makes — and a tile takes 2 cubes or 4, never one or
three. Over 150 games a row the railgun hull went 7% → 12%, the hull spread
narrowed from 26 points to 16, railgun + lasers + radiators 14% → 25%, railgun +
racks 18% → 26%; length did not move. Kept honest at the time: **a tile at four
cubes still absorbs exactly the two a tile used to**, so a 2-damage weapon still
cannot reach a hull through one full tile, and kills barely moved.

**6. Docking repairs to full, and deployment runs in reverse turn order**
(15–16 Sept). A dock restores hull, repairs tiles and reloads missiles, but only
on the turn you arrive; holding the berth afterwards buys the ride and the scoop
and nothing else. Deployment places the last seat first, which is the cheapest
answer to the first seat's advantage.

**7. Three roles, two variants; the compressor moves forward; the rack shoots**
(16 Sept, commit `6a4c4fe`). The forward slot was underused, the rack was never
built and never fired in 1,400 seats, and the hunter and the raider were the same
ship — one problem with three faces. The compressor was a tempo tile wearing a
capacity costume (+6 fuel *and* a free jump), carried by 100% of built hulls; it
lost the capacity, kept the free jump and moved to the forward slot, where it
competes with the railgun and the sensor. The rack went from 1 damage to 2, which
is what makes it the partner a railgun wants on its own ring. The four archetypes
became **three roles × two variants** (`engine/src/ai/behaviors/loadout.ts`): the
role is the forward tile and the cards choose it, the variant is the four side
slots and that is taste. Result: mats in play 3 of 4 → 4 of 6, the most-played mat
76% → 45%, the rack carried by 30% of seats at 3.1 shots a game, and every card
type finished in natural play. Also retired in that pass: the last four rule
knobs on the game state. **The rules are constants now; a game is played under
RULES.md and nothing else.**

**8. One deck for the table, two daring cards** (17 Sept, commit `6d08495`). The
deck was dealt the way a computer would deal it — a private stack per seat,
generated to fit that seat. There is one deck now, shuffled once and dealt round
the table. Rival cards count seats (“the 2nd to your left”), so no card can name
its own holder and nobody learns who is hunting whom from a card they did not
draw; setup removes the offsets the table is too small for. Deliver and Intercept
joined Destroy at **2 points**, Survey, Board and Garbage Disposal are **1**, and
four points end the round — so a hand is two primaries, or one plus both daring
cards. A brief experiment with dealing six instead of five was reverted here: six
offers raised the bar every card had to clear and Intercept fell straight through
it (kept when offered 16.7% → 1.7%) despite being the fastest-completing card on
the table. Deal 5, keep 3.

**9. Nothing can break the fuel scoop** (17 Sept, commit `69cc98c`). A critical
may name any slot but the scoop, and since a critical is the only thing that
breaks a tile, nothing breaks it. Repairs happen only at a station, a dry ship
cannot burn or jump, and a coast moves it along the ring it is already on — a
critical on the scoop of a dry ship away from a station ring ends that player's
game with no move that leads back. Bots never named it (0 of 254 breaks in 120
games), so it costs nothing at the table and closes a door a human would walk
through on purpose.

**10a. Heat is a track, and a raised screen runs hot** (18 Sept). Three changes
adopted together, because the first two do nothing apart:

- **Heat carries.** At a check, anything above **10** is hull damage and the
  track stops there; then the ship sheds its dissipation and keeps the rest.
  Heat used to reset, which made dissipation a spend limit rather than a rate:
  under it everything was free and over it a point absorbed cost more hull than
  it saved, so nobody ever crossed the line. Measured over 18,418 acting turns
  before the change: **69% of turns ended with four or more points of
  dissipation unused and 1.5% went over at all**.
- **A powered shield tile adds its cubes at every check**, absorbing or not —
  the same rule every other tile follows, applied by making *powered* mean
  *used*. A tile that did absorb has spent its cubes and gone dark, so it costs
  nothing that turn: using the wall is what stops it costing you.
- **A critical breaks the named slot even through shields.** It used to need
  `toHull > 0`, so a wall that held ate the critical aimed at it — the fattest,
  most public slot was the one best protected from being named.

What it did, at 150 games × 4 seats on fixed seeds: the wall became a decision
(mean shield cubes 3.83 → **2.75**, full wall 73% → **56%**, damage soaked 27% →
**16%**), the heat track came into use (mean unused dissipation 3.67 → **0.95**,
turns carrying heat 1.5% → **67%**), and the game got bloodier (destructions 3.2
→ **4.3**, railgun hull damage 12.0 → **18.6**, rack 2.4 → **7.0**). Shields
stopped being a tax on a hull that fights: one tile on a gun mat went 27% →
**29%** and no shields 22% → **25%**, while the weaponless turtle came down 40%
→ **34%**. `docs/shields-2026-09-18.md` §7 has the whole table, including what it
did **not** fix.

**10b. The radiator stays at +2** (18 Sept). Measured against +1 and +3 on the
same seeds after the change above: +1 widens the hull spread from 16 points to
25 and adds six rounds to a game; +3 pushes the wall back up (mean cubes 2.75 →
3.11) and flattens the rack mat. +2 gives the tightest spread and the shortest
games, so the tile that was expected to need rebalancing did not.

**10c. A face-up rack shows what is left in it** (18 Sept). Missile ammo was
private always. It is private only while the tile is: a rack reveals itself the
first time it launches, and once the tube covers are off the table can count the
tubes. One line in `view.ts` (`SlotView.ammo`, null unless the viewer can read
the tile) and one fewer thing to take on trust at the table — a rival who has
fired three of four missiles cannot bluff a full rack. Ammo behind a face-down
tile stays hidden, which is the case the leak test now checks.

Asked and answered at the same time: **a shield reveals itself when it absorbs**,
and not before. It already did, and it stays that way — a shield does not reveal
itself by running hot, so unexplained heat on a rival's track is a tell and not a
proof. Radiators are hidden too, so the arithmetic stays ambiguous in both
directions, which is what the hidden-loadout design is buying.

**11. A station you can dock at** (17 Sept, commit `0b9d7f7`). Board and model
work, no rule change: the station is built from the ships' material vocabulary so
it reads both from the table camera and close up, and a moored ship parks under
its deck instead of intersecting it.

### Open

- **The turtle still wins, at 34% against a 25% baseline.** §6d.10a closed part
  of the gap but not all of it, and the reason is arithmetic: two radiators put
  dissipation at 9, and a full single wall (4) plus the scoop (3) is 7 — under
  it forever. A mat with two radiators buys itself out of the standing cost
  entirely. Lowering the radiator makes everything else worse (§6d.10b), so the
  next lever is probably not the radiator and probably not shields: what the
  measurements keep saying is that **a ship with no weapon and good survival
  wins the card race**, because no card needs a fight. See
  `docs/shields-2026-09-18.md` §7.
- **Two players.** `hauler-tanky` takes 51% of seats there and wins 64% of the
  games it is in. The old raider did the same (66%) before any of this, so the
  legs mat inherited the skew rather than caused it. Nothing has addressed it.
- **The standing outlier.** `compressor + shields×2 + radiators×2` — a mat with
  no weapon at all that now also jumps for free — is the one hull `yarn balance`
  still flags. It deals 3.3 damage a game and takes 8.3.
- **Destroy takes about 25% of winners' cards against a 16.7% deck share** in
  every pricing tried. A kill is worth two points, so a winner who lands one needs
  fewer cards; it has never been measured against a deliberate alternative.

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
