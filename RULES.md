# Dangerous Inclinations — Rules

A game of orbital manoeuvre, heat management and hidden objectives for 2–4 players. Ships orbit a black hole and its three planets, jump between them along transfer lanes, trade shots and cargo, and race to three points from secret missions.

**First player to reach 3 points wins.** A Destroy card is worth 2 points, every other card 1.

---

## Components

- The board: a black hole with 5 rings and three planets (Alpha, Beta, Gamma) with 3 rings each. Every ring has 24 sectors. Transfer lanes are drawn between the black hole's outer ring and each planet's outer ring.
- Per player: a ship token, a Home marker, a ship mat with 1 forward slot and 4 side slots, a small screen for your cards and fuel, 10 energy cubes, a hull track (10) and a heat track.
- Subsystem tiles (one set per player, so at most one of each except two lasers): railgun, sensor array, broadside laser ×2, shields, radiator, fuel compressor, ballistic rack, missiles. Tiles are double-sided: face-down shows only the slot type.
- Mission cards, crate tokens, data chits, missile tokens, station tokens, one d10.

---

## The Map

### Rings and drift

Every turn a ship **drifts** forward by its ring's velocity. Inner rings are fast.

| Well | Ring 1 | Ring 2 | Ring 3 | Ring 4 | Ring 5 |
|------|--------|--------|--------|--------|--------|
| Black Hole | 8 | 6 | 4 | 2 | 1 |
| Planet | 4 | 2 | 1 | — | — |

Sectors are numbered 0–23 and increase in the direction of drift (prograde).

### Transfer lanes

Lanes are **one-way**. Each connects a 4-sector arc on Black Hole Ring 5 with a 4-sector arc on a planet's Ring 3 and is travelled in one direction only: every planet has an **outbound** lane (black hole → planet) and an **inbound** lane (planet → black hole). A ship in a lane's departure arc may **jump** to the matching sector of its arrival arc (1st sector to 1st sector, and so on). The arrival arc is a place you land, never a place you leave from.

| Lane | Direction | Black Hole Ring 5 | Planet Ring 3 |
|------|-----------|-------------------|---------------|
| Beta A  | out, to Beta   | sectors 0–3   | Beta 4–7 |
| Alpha A | in, from Alpha | sectors 4–7   | Alpha 16–19 |
| Gamma A | out, to Gamma  | sectors 8–11  | Gamma 4–7 |
| Beta B  | in, from Beta  | sectors 12–15 | Beta 16–19 |
| Alpha B | out, to Alpha  | sectors 16–19 | Alpha 4–7 |
| Gamma B | in, from Gamma | sectors 20–23 | Gamma 16–19 |

Reading Black Hole Ring 5 clockwise: out to Beta, in from Alpha, out to Gamma, in from Beta, out to Alpha, in from Gamma. Every arrival arc is followed by the departure arc for the next planet, so Alpha → Gamma → Beta → Alpha is the cheap circuit; the other way round costs a longer drift or a dive to a faster ring.

### Stations

Each planet has a station on **Ring 1**. Stations drift like ships: 4 sectors at the end of every round. Ships dock by ending their turn on the station's sector.

---

## Setup

1. **Missions.** Each player draws 5 mission cards from their deck and keeps 3, face-down behind their screen. Return the rest.
2. **Loadout.** Each player fills their ship mat: 1 forward tile (railgun, sensor array or missiles) and 4 side tiles (laser, shields, radiator, fuel compressor, ballistic rack or missiles). All tiles are placed **face-down**. Engines, manoeuvring thrusters and fuel scoop are printed on every mat.
3. **Deployment.** In turn order, each player places their ship, facing prograde, on **Black Hole Ring 4** in any empty sector, and puts their Home marker there. Everyone starts together and scatters from there; missions are secret, so pick your sector with them in mind (Ring 4 drifts 2 sectors a turn and a soft burn outward lands on the same sector of the lane ring).
4. Fill the hull track to 10, reaction mass to 10 (16 with a fuel compressor, kept behind your screen), heat to 0. Energy cubes stay in the reactor.

---

## A Turn

If your ship was destroyed, your whole turn is: place it on your Home sector (nearest empty sector if occupied), full hull, full fuel, heat 0, no energy allocated. Face-up tiles stay face-up. Play passes. **Your next turn is lost as well** (the ship is recovering): you take no actions, you just drift.

Otherwise:

1. **Energy.** Move cubes freely between the reactor and your tiles, in the open. A tile is either off (0 cubes) or on (at least its minimum). Allocations persist between turns. Everyone can see how many cubes sit on each of your slots; they can't see what a face-down slot is.
2. **Actions,** in any order you choose. Each tile may act once per turn (a ballistic rack may also intercept once during each other player's turn):
   - **Rotate** — flip facing (prograde ↔ retrograde). Thrusters need 1 cube.
   - **Move** — exactly one of: *coast*, *burn* or *jump*. If you take no move, you coast.
   - **Fire** — any number of powered weapons, each at its own point in the sequence (before or after your move). If a ship you meant to fire at was destroyed earlier in your turn, that shot simply isn't taken.
   - **Scan** — with a powered sensor array (see Hidden Information).
3. **Missiles.** Each of your missiles in flight moves and may attack.
4. **Docking.** If you ended on a station's sector, you are docked: cargo is loaded and delivered, broken tiles are repaired, hull +3, missiles reloaded.
5. **Heat check.** If your heat exceeds your dissipation, take the difference as hull damage. Reset heat to 0.
6. **Missions.** Check your cards; completed cards are turned face-up.
7. Pass play. When the last player has acted, move every station 4 sectors.

---

## Energy and Heat

- The reactor holds **10 energy**. Allocating and removing cubes is free and unlimited.
- **Using** a tile generates heat equal to the energy on it: firing a weapon, burning (engines), rotating (thrusters), scooping, scanning, jumping, intercepting a missile. Powered but unused tiles make no heat.
- **Dissipation** is 5, plus 2 per working radiator. Excess heat at your heat check becomes hull damage.
- **Shields** convert incoming damage into heat, up to the cubes on them; those cubes return to the reactor. Shields are electromagnetic: they stop railgun slugs, rack rounds and missiles, **not lasers**.

| Tile | Energy | Effect |
|------|--------|--------|
| Engines (fixed) | 1–3 | Burns and jumps; once per turn |
| Thrusters (fixed) | 1 | Rotate |
| Fuel scoop (fixed) | 3 | While coasting, recover fuel equal to your ring's velocity |
| Railgun (forward) | 4 | 4 damage, spinal, same ring, 1–5 sectors ahead; recoil |
| Sensor array (forward) | 2 | Scan; criticals on 8–10 while powered |
| Missiles (forward or side) | 2 | Launch a guided missile (4 aboard) |
| Broadside laser (side) | 2 | 2 damage, ignores shields, ±2 rings, ±1 sector, fires to one side only |
| Shields (side) | 1–4 | Absorb damage as heat |
| Radiator (side) | — | +2 dissipation |
| Fuel compressor (side) | — | +6 fuel capacity; jumps cost no fuel |
| Ballistic rack (side) | 2 | 1 damage, ±1 ring or same ring, ±1 sector; intercepts missiles |

---

## Movement

### Coast
Drift only. If your scoop is powered you may activate it: gain fuel equal to your ring's velocity (heat 3). Others see the scoop run, not how much you gained.

### Burn
Drift, then change ring. Prograde facing burns **outward**, retrograde burns **inward**. Engines must hold at least the burn's energy. A burn changes exactly its number of rings: if there aren't enough rings left in that direction, you can't make that burn.

| Burn | Engines | Fuel | Rings |
|------|---------|------|-------|
| Soft | 1 | 1 | 1 |
| Medium | 2 | 2 | 2 |
| Hard | 3 | 3 | 3 |

**Phasing.** During a burn you may adjust your arrival sector for 1 fuel per sector: brake by up to (velocity − 1) sectors, or accelerate by up to 3.

### Jump
From a lane's departure arc (the black hole arc of an outbound lane, the planet arc of an inbound one), with engines at 3, pay 3 fuel (free with a fuel compressor) and move to the matching sector of the arrival arc. Facing is kept. A jump is your whole move: no drift this turn.

### Rotation
Costs 1 energy on the thrusters and 1 heat. Rotate before your burn to choose its direction.

---

## Combat

### Hitting

Roll a d10 for each shot: **1** misses, **2–9** hits, **10** is a critical. A powered sensor array on the attacker makes 8–10 critical.

### Damage

Shields absorb first (each cube absorbs 1 damage and becomes 1 heat); the rest is hull damage. **Laser damage skips the shields** and goes straight to the hull. At 0 hull the ship is destroyed.

### Critical hits

When you fire, name one slot on the target: forward, side 1–4, engines, thrusters or scoop. If the shot is a critical and reaches the hull, that tile is **turned face-up and broken**: its cubes return to the reactor as heat, and it cannot be used until repaired at a station. Naming a face-down slot is a gamble; naming a face-up one is a plan.

### Weapons

- **Railgun** — spinal: same ring, 1 to 5 sectors ahead in your facing direction. Firing pushes you one ring in your facing direction unless you **compensate** with engines (1 fuel, engine heat; engines can then not burn this turn). You cannot fire if the recoil would push you off the rings.
- **Broadside laser** — targets within 2 rings and 1 sector; **shields do not stop it** (2 damage straight to the hull). Facing prograde, port tiles (side 1–2) fire outward and starboard tiles (side 3–4) fire inward; facing retrograde swaps them.
- **Ballistic rack** — targets within 1 ring and 1 sector, either side, or on your own ring 1 sector away. While powered it also **intercepts** missiles that reach you: roll a d10, on 2+ the missile is destroyed (the rack is used and heats up either way).
- **Missiles** — target within 2 rings and 3 sectors (a ship sharing your sector included), any facing. Place a missile token on your sector and name the critical slot. At the end of each of your turns every missile of yours **rides its orbit, then flies up to 3 steps toward its target** (a step is one ring or one sector; close the ring gap first). If it ends on the target's sector it attacks like a weapon (2 damage) after any interception attempt. A missile that has flown three times without hitting is removed.

  *Riding the orbit:* a missile drifts with its ring like everything else. The one exception is the turn you launch it: if you launch **after** moving, the missile has already ridden along with your ship, so it does not drift again that turn — it just flies its 3 steps from where you dropped it. Launch before moving and it drifts with the ring like your ship did. (The app draws the path either way.)

Nothing fires across gravity wells.

---

## Hidden Information

Your tiles start face-down. **A tile is turned face-up the first time it does something:**

| Tile | Face-up when |
|------|--------------|
| Any weapon | it fires (or a rack intercepts) |
| Shields | they absorb damage |
| Sensor array | it scans, or a critical lands on an 8 or 9 |
| Radiator | your heat goes above 5 at a heat check (it is visibly shedding) |
| Fuel compressor | a jump is refunded |
| Any tile | it is broken by a critical |

Face-up tiles stay face-up, even after respawn.

**Public:** positions, facing, hull, heat, the energy cubes on every slot, Home markers, how many crates and data chits you carry, face-up tiles, broken fixed systems, completed missions.
**Private:** what a face-down tile is, fuel, missile ammo, missions in hand, where your cargo is going.

Energy is the tell. Four cubes on a face-down forward slot can only be a railgun; two side slots each holding two cubes suggest lasers or a rack; a slot that never gets a cube may be a radiator or compressor. You learn about a rival from how they power up, before anything is fired.

### Scanning

With a powered sensor array, target a ship on your ring within 3 sectors. The sensor is used (2 heat) and turned face-up. The target shows you **one face-down tile of your choice**, privately (name one you already know and you get the next face-down one; if you know them all, the scan still counts). If you hold an Intercept mission on that player, you also take their transmission (a data chit). Being scanned is visible to everyone.

---

## Missions

Four kinds of card. **Destroy is worth two points, every other card one; three points win** — so a kill plus any one other card wins.

| Card | Points | Complete when |
|------|--------|---------------|
| **Destroy [player]** | 2 | you reduce their hull to 0 |
| **Deliver [A → B]** | 1 | you dock at A (load the crate), then dock at B |
| **Intercept [player]** | 1 | you scan them (take the data chit), then dock at any station |
| **Survey the Event Horizon** | 1 | you end a turn on Black Hole Ring 1 (take the data chit), then dock at any station |

Each player's deck holds one Destroy and one Intercept per opponent, all six Deliver routes and two Survey. Draw 5, keep 3.

When you complete a mission, turn the card face-up for everyone to see.

---

## Destruction and Respawn

When your hull reaches 0:

- remove your ship; drop your cargo: crates go back to their pickup station (you must load them again), data chits are lost;
- on your next turn you only respawn at Home (see A Turn), and the turn after that is lost too. Two turns gone.

Being destroyed never removes you from the game, but it costs you cargo, tempo and position, and hands two points to anyone holding your Destroy card.

---

## Quick Reference

| | |
|---|---|
| Reactor | 10 energy |
| Dissipation | 5 (+2 per radiator) |
| Hull | 10 |
| Fuel | 10 (+6 with compressor) |
| Sectors per ring | 24 |
| Burn | soft 1 / medium 2 / hard 3 (rings, fuel, engine energy) |
| Phasing | −(velocity−1) to +3 sectors, 1 fuel each |
| Jump | engines 3, 3 fuel (free with compressor), no drift |
| Hit roll | 1 miss, 2–9 hit, 10 crit (8–10 with sensors) |
| Scan | same ring, within 3 sectors, sensor powered |
| Docking | +3 hull, repair all, reload missiles, load/deliver cargo |
| Survey | end a turn on Black Hole Ring 1 |
| Win | 3 completed missions |

### Turn cheat sheet

1. Destroyed? Respawn at Home, turn over. Recovering? Turn over.
2. Energy: move cubes.
3. Actions in your order: rotate · move (coast / burn / jump) · fire · scan.
4. Your missiles move.
5. Docked? Load, deliver, repair, +3 hull, reload.
6. Heat check: excess heat → hull damage; reset heat.
7. Flip completed missions. Pass. (Last player: stations move.)
