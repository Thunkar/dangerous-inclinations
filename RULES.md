# Dangerous Inclinations — Rules

A game of orbital manoeuvre, heat management and hidden objectives for 2–6 players. Ships orbit a black hole and its three planets, jump between them along transfer lanes, trade shots and cargo, and race to four points from secret missions.

**The game ends at the end of the round in which a player reaches 4 points**, so every seat gets the same number of turns. Highest score wins; ties go to the ship with more hull, then more fuel, then the earlier seat. Destroy, Deliver and Intercept are worth **2 points** each; the three daring cards are worth 1 — so two primaries win, and so does one primary with both daring cards you kept.

---

## Components

- The board: a black hole with 5 rings and three planets (Alpha, Beta, Gamma) with 3 rings each. Every ring has 24 sectors. Transfer lanes are drawn between the black hole's outer ring and each planet's outer ring.
- Per player: a ship token, a Home marker, a ship mat with 1 forward slot and 4 side slots, a small screen for your cards, 10 energy cubes, a hull track (10) and a heat track (10).
- Subsystem tiles: railgun, sensor array, broadside laser, shields, radiator, fuel compressor, ballistic rack, missiles. Take as many copies of a tile as you have slots it fits: two shields, four lasers, anything goes. Tiles are double-sided: face-down shows only the slot type.
- One deck of mission cards, crate tokens, data chits, missile tokens, station tokens, one d10.

---

## The Map

### Rings and drift

Every turn a ship **drifts** forward by its ring's velocity. Inner rings are fast.

| Well       | Ring 1 | Ring 2 | Ring 3 | Ring 4 | Ring 5 |
| ---------- | ------ | ------ | ------ | ------ | ------ |
| Black Hole | 8      | 6      | 4      | 2      | 1      |
| Planet     | 4      | 2      | 1      | —      | —      |

Sectors are numbered 0–23 and increase in the direction of drift (prograde).

### Transfer lanes

Lanes are **one-way**. Each connects a 4-sector arc on Black Hole Ring 5 with a 4-sector arc on a planet's Ring 3 and is travelled in one direction only: every planet has an **outbound** lane (black hole → planet) and an **inbound** lane (planet → black hole). A ship in a lane's departure arc may **jump** to the matching sector of its arrival arc (1st sector to 1st sector, and so on). The arrival arc is a place you land, never a place you leave from.

| Lane    | Direction      | Black Hole Ring 5 | Planet Ring 3 |
| ------- | -------------- | ----------------- | ------------- |
| Beta A  | out, to Beta   | sectors 0–3       | Beta 4–7      |
| Alpha A | in, from Alpha | sectors 4–7       | Alpha 16–19   |
| Gamma A | out, to Gamma  | sectors 8–11      | Gamma 4–7     |
| Beta B  | in, from Beta  | sectors 12–15     | Beta 16–19    |
| Alpha B | out, to Alpha  | sectors 16–19     | Alpha 4–7     |
| Gamma B | in, from Gamma | sectors 20–23     | Gamma 16–19   |

Reading Black Hole Ring 5 clockwise: out to Beta, in from Alpha, out to Gamma, in from Beta, out to Alpha, in from Gamma. Every arrival arc is followed by the departure arc for the next planet, so Alpha → Gamma → Beta → Alpha is the cheap circuit; the other way round costs a longer drift or a dive to a faster ring.

### Stations

Each planet has a station on **Ring 1**. Stations drift like ships: 4 sectors at the end of every round. Ships dock by ending their turn on the station's sector.

**Moored.** A docked ship rides its station: it does not drift on its own, and it moves with the station when stations advance. Burn to cast off.

**A dock is a visit, not a state.** Everything docking gives you — cargo, repairs, full hull, missiles — happens the turn you **arrive**. Holding the berth afterwards is worth the ride the station gives you and whatever your scoop skims, and nothing else. Come back for more and it is a trip.

---

## Setup

1. **Missions.** Each player draws 5 mission cards from their deck and keeps 3, face-down behind their screen. Return the rest. Cards and mat are chosen together: keep nothing your loadout could never complete (see Missions).
2. **Loadout.** Each player fills their ship mat: 1 forward tile (railgun, sensor array, fuel compressor or missiles) and 4 side tiles (laser, shields, radiator, ballistic rack or missiles); repeats are allowed. All tiles are placed **face-down**. Engines, manoeuvring thrusters and fuel scoop are printed on every mat.
3. **Deployment.** In **reverse turn order** (the last player places first, the first player last), each player places their ship, facing prograde, on **Black Hole Ring 4** in any empty sector, and puts their Home marker there. Everyone starts together and scatters from there; missions are secret, so pick your sector with them in mind (Ring 4 drifts 2 sectors a turn and a soft burn outward lands on the same sector of the lane ring).
4. Fill the hull track to 10, reaction mass to 10 and heat to 0 — all three are tracks on your mat, in the open. Energy cubes stay in the reactor. Only your cards and the ammo in a face-down missiles tile sit behind the screen.

---

## A Turn

If your ship was destroyed, your whole turn is: place it on your Home sector (nearest empty sector if occupied), full hull, full fuel, heat 0, no energy allocated. Face-up tiles stay face-up. Play passes. **Your next turn is lost as well** (the ship is recovering): you take no actions, you just drift.

Otherwise:

1. **Energy.** Move cubes freely between the reactor and your tiles, in the open. A tile is either off (0 cubes) or on (at least its minimum). Allocations persist between turns. Everyone can see how many cubes sit on each of your slots; they can't see what a face-down slot is.
2. **Actions,** in any order you choose. Each tile may act once per turn (a ballistic rack may also intercept once during each other player's turn):
   - **Rotate** — flip facing (prograde ↔ retrograde). Thrusters need 1 cube.
   - **Move** — exactly one of: _coast_, _burn_ or _jump_. If you take no move, you coast.
   - **Fire** — any number of powered weapons, each at its own point in the sequence (before or after your move). If a ship you meant to fire at was destroyed earlier in your turn, that shot simply isn't taken.
   - **Scan** — with a powered sensor array (see Hidden Information).
3. **Missiles.** Each of your missiles in flight moves and may attack.
4. **Docking.** If you **arrived** on a station's sector this turn, you are docked: cargo is loaded and delivered, broken tiles are repaired, hull is restored to full, missiles reloaded. You stay moored until you burn away, riding the station — but the dock itself only happens on arrival.
5. **Heat check.** Add the cubes on every powered shields tile. **If your heat is now 0**, repair one broken tile of your choice. Above **10** (the **redline**), the excess is hull damage and your heat drops to 10. Then dissipate; what is left stays on the track for next turn.
6. **Missions.** Check your cards; completed cards are turned face-up.
7. Pass play. When the last player has acted, move every station 4 sectors, carrying any ship moored to it.

---

## Energy and Heat

- The reactor holds **10 energy**. Allocating and removing cubes is free and unlimited.
- **Using** a tile costs heat equal to the cubes on it: firing, burning, rotating, scooping, scanning, jumping, intercepting. Powered but unused tiles cost nothing — **except shields**.
- **Heat is a track. It does not reset.** At your heat check, heat above **10** is hull damage and the track drops to 10. Then **dissipate** — 5, plus 2 per working radiator — and carry the rest into your next turn.
- So a hot turn is a debt, not a wound: take one, then cool off. Make more heat than you dissipate for long enough and you reach the **redline** at 10, where it costs hull every turn until you stop.
- **Powered shields cost their cubes in heat at every check**, absorbing or not. A tile that *did* absorb has already spent its cubes, so it costs nothing that turn.
- **A cold ship repairs itself.** If your heat is **0** at your heat check — nothing used, no shields powered, nothing absorbed since your last check — repair **one** broken tile of your choice. Everything is off and the crew is outside. It is the only repair away from a station, and it is slower: a station fixes everything at once, refills your hull and reloads your missiles, all on arrival.
- **Shields turn the damage they stop into heat.** Two cubes absorb one point, so a tile takes 2 cubes or 4 and never an odd one, and each point absorbed is **2 heat**. Spent cubes return to the reactor and the tile goes dark until you power it again — so a tile is worth its points **between your turns, not per shot**. Shields are electromagnetic: they stop railgun slugs, ballistic rack rounds and missiles, **not lasers**.
- Two tiles at four cubes absorb 4 damage. They are also 8 of your 10 cubes and **8 heat every turn**, against a dissipation of 5. Full shields, a full burn and a scoop do not fit in one turn — and full shields do not fit three turns running.

| Tile                       | Energy | Effect                                                                 |
| -------------------------- | ------ | ---------------------------------------------------------------------- |
| Engines (fixed)            | 1–3    | Burns and jumps; once per turn                                         |
| Thrusters (fixed)          | 1      | Rotate                                                                 |
| Fuel scoop (fixed)         | 3      | While coasting, recover fuel equal to your ring's velocity             |
| Railgun (forward)          | 4      | 4 damage, spinal, same ring, 1–5 sectors ahead; recoil                 |
| Sensor array (forward)     | 2      | Scan; criticals on 8–10 while powered                                  |
| Fuel compressor (forward)  | —      | A jump's own fuel is refunded                                          |
| Missiles (forward or side) | 2      | Launch a guided missile at anyone in your well (4 aboard)              |
| Broadside laser (side)     | 2      | 2 damage, ignores shields, ±2 rings, ±1 sector, fires to one side only |
| Shields (side)             | 2 or 4 | 2 cubes absorb 1 damage, as 2 heat; costs its cubes in heat every check |
| Radiator (side)            | —      | +2 dissipation                                                         |
| Ballistic rack (side)      | 2      | 2 damage, ±1 ring or same ring, ±1 sector; intercepts missiles         |

---

## Movement

### Coast

Drift only — or, moored at a station, hold your berth (see Stations). If your scoop is powered you may activate it: gain fuel equal to your ring's velocity (heat 3); a berth is as good a place to skim from as any.

### Burn

Drift, then change ring. Prograde facing burns **outward**, retrograde burns **inward**. Engines must hold at least the burn's energy. A burn changes exactly its number of rings: if there aren't enough rings left in that direction, you can't make that burn.

| Burn   | Engines | Fuel | Rings |
| ------ | ------- | ---- | ----- |
| Soft   | 1       | 1    | 1     |
| Medium | 2       | 2    | 2     |
| Hard   | 3       | 3    | 3     |

**Phasing.** During a burn you may adjust your arrival sector for 1 fuel per sector: brake by up to (velocity − 1) sectors, or accelerate by up to 3.

### Jump

From a lane's departure arc (the black hole arc of an outbound lane, the planet arc of an inbound one), with engines at 3, pay 3 fuel (free with a fuel compressor) and move to the matching sector of the arrival arc. Facing is kept. A jump is your whole move: no drift this turn.

**Phasing a jump.** As in a burn, you may shift where you arrive for 1 fuel per sector, never outside the arrival arc — so any departure sector can reach any of the arc's four sectors, the matching one for free. A compressor pays for the jump, not for the phasing.

### Rotation

Costs 1 energy on the thrusters and 1 heat. Rotate before your burn to choose its direction.

---

## Combat

### Hitting

Roll a d10 for each shot: **1** misses, **2–9** hits, **10** is a critical. A powered sensor array on the attacker makes 8–10 critical.

### Damage

Shields absorb first (every 2 cubes absorb 1 damage and give its owner **2 heat**); the rest is hull damage. **Laser damage skips the shields** and goes straight to the hull. At 0 hull the ship is destroyed.

### Critical hits

When you fire, name one slot on the target: forward, side 1–4, engines or thrusters. **Not the fuel scoop** — it is the one tile a critical cannot name, because a dry ship with no scoop has no move that reaches a station to repair it. If the shot is a critical, that tile is **turned face-up and broken** — **whether or not the shot got through the shields**: its cubes return to the reactor **as heat**, and it cannot be used until repaired at a station.

A wall that holds is no protection against being named. **The cubes on every slot are public**, even face-down, so a fat slot is a target you can see: four cubes on a side slot is four heat dumped onto its owner the moment a 10 comes up. A broken tile is repaired at a station, or one at a time by running cold (see Energy and Heat) — which is how a ship whose engines were shot out still gets home. Naming a face-down slot is a gamble; naming a face-up one is a plan. A tile that has just absorbed has already spent its cubes, so breaking it dumps little or nothing — but it is gone until they dock.

### Weapons

- **Railgun** — spinal: same ring, 1 to 5 sectors ahead in your facing direction. Firing pushes you one ring in your facing direction unless you **compensate** with engines (1 fuel, engine heat; engines can then not burn this turn). You cannot fire if the recoil would push you off the rings.
- **Broadside laser** — targets within 2 rings and 1 sector; **shields do not stop it** (2 damage straight to the hull). Facing prograde, port tiles (side 1–2) fire outward and starboard tiles (side 3–4) fire inward; facing retrograde swaps them.
- **Ballistic rack** — 2 damage, targets within 1 ring and 1 sector, either side, or on your own ring 1 sector away — the only broadside that can join a railgun shot on your own ring. While powered it also **intercepts** missiles that reach you: roll a d10, on 2+ the missile is destroyed (the rack is used and heats up either way).
- **Missiles** — target **any ship in your well**, any distance, any facing: a missile is self-guided, so its own flight is its range and a launch that never catches up is simply a missile wasted. Place a missile token on your sector and name the critical slot. At the end of each of your turns every missile of yours **rides its orbit, then flies up to 3 steps toward its target** (a step is one ring or one sector; close the ring gap first). If it ends on the target's sector it attacks like a weapon (2 damage) after any interception attempt. A missile that has flown three times without hitting is removed.

  _Riding the orbit:_ a missile drifts with its ring like everything else. The one exception is the turn you launch it: if you launch **after** moving, the missile has already ridden along with your ship, so it does not drift again that turn — it just flies its 3 steps from where you dropped it. Launch before moving and it drifts with the ring like your ship did. (The app draws the path either way.)

Nothing fires across gravity wells.

---

## Hidden Information

Your tiles start face-down. **A tile is turned face-up the first time it does something:**

| Tile            | Face-up when                                                    |
| --------------- | --------------------------------------------------------------- |
| Any weapon      | it fires (or a ballistic rack intercepts); a missiles tile then shows what is left |
| Shields         | they absorb damage                                              |
| Sensor array    | it scans, or a critical lands on an 8 or 9                      |
| Radiator        | your heat goes above 5 at a heat check (it is visibly shedding) |
| Fuel compressor | a jump is refunded                                              |
| Any tile        | it is broken by a critical                                      |

Face-up tiles stay face-up, even after respawn.

**Public:** positions, facing, hull, heat, **fuel**, the energy cubes on every slot, Home markers, how many crates and data chits you carry, face-up tiles and **the missiles left in a face-up missiles tile**, broken fixed systems, completed missions.
**Private:** what a face-down tile is, the ammo in a face-down missiles tile, missions in hand, where your cargo is going.

Energy is the tell. Four cubes on a face-down forward slot can only be a railgun; two side slots each holding two cubes suggest lasers or a rack; a slot that never gets a cube may be a radiator or compressor. You learn about a rival from how they power up, before anything is fired.

### Scanning

With a powered sensor array, target a ship on your ring within 3 sectors. The sensor is used (2 heat) and turned face-up. The target shows you **one face-down tile of your choice**, privately (name one you already know and you get the next face-down one; if you know them all, the scan still counts). If you hold an Intercept mission on that player, you also take their transmission (a data chit). Being scanned is visible to everyone.

---

## Missions

**Four points trigger the final round.** Cards come in two kinds.

**Primaries score two.** Destroy, Deliver, Intercept — the kill, the cargo run, the stolen transmission, one for each way of playing. Each is a named errand: a victim, a route, a station to file at. Two of them win the game.

**Daring cards score one.** Survey, Board, Garbage Disposal. Each is a thing you do rather than an errand someone gives you: no tile aboard can do it for you and nobody can block it. Survey and Board pay a chit — take it the moment you do the thing, then file it at **any** station. Garbage Disposal pays nothing to carry: the load goes over the side and the card is done.

A hand is three cards, so four points is two primaries, or one primary and both daring cards. Three daring cards come to three, which is why every hand needs at least one primary. The round is played out; highest score wins, hull breaks ties.

| Card                                  | Points | Complete when                                                                                                                                                                                                                                |
| ------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Destroy [Nth to your left]**        | 2      | you reduce their hull to 0                                                                                                                                                                                                                   |
| **Deliver [A → B]**                   | 2      | you dock at A (load the crate), then dock at B                                                                                                                                                                                               |
| **Intercept [Nth to your left] → file at [planet]** | 2 | you scan them (take the data chit), then dock at **that planet's** station                                                                                                                                                     |
| **Survey the Event Horizon**          | 1      | you end a turn on Black Hole Ring 1 — take the chit — then dock at **any** station to file it                                         |
| **Board a Ship**                      | 1      | you end a turn in the **same sector** as another ship — take the chit — then dock at **any** station to file it                       |
| **Garbage Disposal**                  | 1      | you dock at **any** station to load it (it fills your hold), then end a turn on Black Hole Ring 1 to drop it into the hole            |

**The deck.** One deck for the table, two copies of every card: each Destroy and Intercept offset (below), all six Deliver routes, and each daring card. **Setup:** take out every Destroy and Intercept whose number is the player count or higher — at three players that leaves offsets 1 and 2 — then shuffle and deal **5** to each player. Keep **3**, discard the other two face-down. More seats leave more of the deck pointed at people: at six players two cards in three name a rival, and the table is a fight rather than a trade route.

**Cards count seats, they do not name them.** A Destroy card reads *the 2nd player to your left* — counting left around the table in turn order — so the same card is a different target in every hand, no card can ever name the player holding it, and holding one tells the table nothing. The count only becomes a name when you complete the card and turn it face-up.

**Your hold takes one crate.** A load of garbage is a crate like any other, so a disposal run and a cargo route cannot be flown at the same time — which is why the card suits a ship with nothing else in its hold. Destroyed with a load aboard, it is lost: collect another at any station.

 A crate fills it, so a second Deliver waits until the first is delivered — two routes that load at the same station are two trips, and the only pair that is one trip is a chain, where you drop at the station you collect the next one from. Data chits are numbers, not freight: a scan's transmission and a survey's readings ride free alongside whatever is in the hold, however many you carry.

**Keep only cards your mat can fly.** Intercept opens with a scan, so it needs a **sensor array**, and Destroy needs a **weapon** — railgun, broadside laser, ballistic rack or missiles — since a ship that cooks itself on its own heat credits nobody. Your mat is fixed for the game — a station repairs tiles, it never fits one — so a card you cannot start is a card you never score.

When you complete a mission, turn the card face-up for everyone to see.

---

## Destruction and Respawn

When your hull reaches 0:

- remove your ship; drop your cargo: crates go back to their pickup station (you must load them again), data chits are lost;
- on your next turn you only respawn at Home (see A Turn), and the turn after that is lost too. Two turns gone.

Being destroyed never removes you from the game, but it costs you cargo, tempo and position, and hands two points to anyone holding your Destroy card.

---

## Quick Reference

|                  |                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Reactor          | 10 energy                                                                                        |
| Heat track       | 10 (the redline). Above it at a check: hull damage, then dissipate and carry the rest             |
| Dissipation      | 5 (+2 per radiator), at every check. Heat does not reset                                          |
| Hull             | 10                                                                                               |
| Fuel             | 10                                                                                               |
| Sectors per ring | 24                                                                                               |
| Burn             | soft 1 / medium 2 / hard 3 (rings, fuel, engine energy)                                          |
| Phasing          | burn: −(velocity−1) to +3 sectors · jump: anywhere in the arrival arc · 1 fuel each, always paid |
| Jump             | engines 3, 3 fuel (refunded by a compressor), no drift                                           |
| Hit roll         | 1 miss, 2–9 hit, 10 crit (8–10 with sensors)                                                     |
| Shields          | 2 or 4 cubes; 2 cubes a point absorbed, 2 heat a point; **its cubes are heat every turn it is up**; lasers ignore them |
| Critical         | names any slot but the fuel scoop; breaks it through shields, and dumps its cubes as heat         |
| Repair           | a station, on arrival, fixes everything; or one tile a turn at 0 heat                             |
| Scan             | same ring, within 3 sectors, sensor powered                                                      |
| Docking          | on arrival only: full hull, repair all, reload missiles, load/deliver cargo; you stay moored until you burn away          |
| Survey           | a turn ended on Black Hole Ring 1 with sensors powered, then any station                        |
| Keeping cards    | one deck: deal 5, keep 3, discard 2; Intercept needs a sensor array, Destroy needs a weapon        |
| Hold             | one crate; data chits ride free                                                                  |
| Ammo             | private while the missiles tile is face-down; public once it has fired                           |
| Win              | 4 points end the round (primaries 2, daring 1); highest score, then hull, then fuel               |

### Turn cheat sheet

1. Destroyed? Respawn at Home, turn over. Recovering? You only drift, turn over.
2. Energy: move cubes.
3. Actions in your order: rotate · move (coast / burn / jump) · fire · scan.
4. Your missiles move.
5. Just arrived at a station? Load, deliver, repair, full hull, reload. Moored until you burn away.
6. Heat check: add your powered shields' cubes; at 0 heat repair one tile; over 10 is hull damage; dissipate and carry the rest.
7. Flip completed missions. Pass. (Last player: stations move, with whoever is moored.)
