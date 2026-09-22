# Dangerous Inclinations: Rules

A game of orbital manoeuvre, heat management and hidden objectives for 2–6 players. Ships orbit a black hole and its three planets, jump between them along transfer lanes, trade shots and cargo, and race to three points from secret missions.

**The game ends at the end of the round in which a player reaches 3 points**, so every seat gets the same number of turns. Highest score wins; ties go to the ship with more hull, then more fuel, then the earlier seat. Destroy, Deliver and Intercept are worth **2 points** each; the three secondary cards are worth 1. So your primary and either of your secondary cards wins, and two secondary cards on their own do not.

---

## Components

- The board: a black hole with 5 rings and three planets (Alpha, Beta, Gamma) with 4 rings each. Every ring has 24 sectors. Transfer lanes are drawn between the black hole's outer ring and each planet's outer ring.
- Per player: a ship token, a Home marker, a loadout with 1 forward slot and 4 side slots, a small screen for your cards, a supply of energy cubes, a hull track (10) and a heat track (10).
- Subsystem tiles: railgun, sensor array, broadside laser, shields, radiator, fuel compressor, ballistic rack, missiles. Take as many copies of a tile as you have slots it fits: two shields, four lasers, anything goes. Tiles are double-sided: face-down shows only the slot type.
- One deck of mission cards, crate tokens, data chits, missile tokens, station tokens, one d10.

---

## The Map

### Rings and drift

Every turn a ship **drifts** forward by its ring's velocity. Inner rings are fast.

| Well       | Ring 1 | Ring 2 | Ring 3 | Ring 4 | Ring 5 |
| ---------- | ------ | ------ | ------ | ------ | ------ |
| Black Hole | 8      | 6      | 4      | 2      | 1      |
| Planet     | 6      | 4      | 2      | 1      | none   |

A planet is the black hole's own sequence without its innermost ring, so there
is only one set of numbers to learn.

Sectors are numbered 0–23 and increase in the direction of drift (prograde).

### Transfer lanes

Lanes are **one-way**. Each connects a 4-sector arc on Black Hole Ring 5 with a 4-sector arc on a planet's Ring 4 and is travelled in one direction only: every planet has an **outbound** lane (black hole → planet) and an **inbound** lane (planet → black hole). A ship in a lane's departure arc may **jump** to the matching sector of its arrival arc (1st sector to 1st sector, and so on). The arrival arc is a place you land, never a place you leave from.

| Lane    | Direction      | Black Hole Ring 5 | Planet Ring 4 |
| ------- | -------------- | ----------------- | ------------- |
| Beta A  | out, to Beta   | sectors 0–3       | Beta 4–7      |
| Alpha A | in, from Alpha | sectors 4–7       | Alpha 16–19   |
| Gamma A | out, to Gamma  | sectors 8–11      | Gamma 4–7     |
| Beta B  | in, from Beta  | sectors 12–15     | Beta 16–19    |
| Alpha B | out, to Alpha  | sectors 16–19     | Alpha 4–7     |
| Gamma B | in, from Gamma | sectors 20–23     | Gamma 16–19   |

Reading Black Hole Ring 5 clockwise: out to Beta, in from Alpha, out to Gamma, in from Beta, out to Alpha, in from Gamma. Every arrival arc is followed by the departure arc for the next planet, so Alpha → Gamma → Beta → Alpha is the cheap circuit; the other way round costs a longer drift or a dive to a faster ring.

### Stations

Each planet has a station on **Ring 2**. Stations drift like ships: 4 sectors at the end of every round. Ships dock by ending their turn on the station's sector.

**Ring 1 is how you catch one.** A ship on the station's own ring drifts exactly as fast as the station, so the gap between them never closes by waiting, and every ring outside it is slower still. Ring 1 runs at 6: drop into it, let it carry you round faster than the station, and burn back out onto the sector the station will be in. Docking is a manoeuvre you fly, not a queue you join.

**Moored.** A docked ship rides its station: it does not drift on its own, and it moves with the station when stations advance. Burn to cast off.

**A dock is a visit, not a state.** Everything docking gives you (cargo, repairs, full hull, missiles) happens the turn you **arrive**. Holding the berth afterwards is worth the ride the station gives you and whatever your scoop skims, and nothing else. Come back for more and it is a trip.

---

## Setup

1. **Missions.** Deal each player **three primary cards**, of which they keep **one**; then every player takes **one Survey, one Piracy and one Tanker** and keeps **two**. Kept cards go face-down behind the screen; the card you leave goes face-down onto one shared discard pile. Cards and loadout are chosen together: keep nothing your loadout could never complete (see Missions).
2. **Loadout.** Each player fills their loadout: 1 forward tile (railgun, sensor array, fuel compressor, shields or missiles) and 4 side tiles (laser, radiator, shields, ballistic rack or missiles); repeats are allowed. All tiles are placed **face-down**. Engines, manoeuvring thrusters and fuel scoop are printed on every loadout.
3. **Deployment.** In **reverse turn order** (the last player places first, the first player last), each player places their ship, facing prograde, on **Black Hole Ring 3 or Ring 4**, **at least three sectors from every ship already placed** (if no sector qualifies, the one farthest from them), and puts their Home marker there. Everyone starts around the hole and scatters from there; missions are secret, so pick your ring and sector with them in mind (Ring 4 drifts 2 sectors a turn and a soft burn outward lands on the same sector of the lane ring; Ring 3 drifts 4 and is two burns from the lane ring).
4. Fill the hull track to 10, reaction mass to 10 and heat to 0. All three are tracks on your loadout, in the open. Energy cubes sit in the supply until something calls for them. Only your cards and the ammo in a face-down missiles tile sit behind the screen.

---

## A Turn

If your ship was destroyed, your whole turn is: place it on your Home sector (nearest empty sector if occupied), full hull, full fuel, heat 0, everything switched off, and drift with the ring like any ship that coasts. Face-up tiles stay face-up. Play passes. **Until your next turn is over nobody can touch you**: no weapon fires at you, no missile attacks you and nobody scans you. That next turn is **a first round of your own**: you switch your standing systems on, rotate and move as usual, but no weapon of yours fires and you scan nobody. From the turn after it you are live again, and so is everyone's aim at you.

Otherwise:

1. **Standing systems.** Switch your shields, ballistic racks and sensor array on or off, in the open. They cost their cubes in heat at every check they are up, so this is the one place a turn is decided before it is flown. Everything else is powered by the action that uses it, so there is nothing else to do here. Everyone can see how many cubes sit on each of your slots; they can't see what a face-down slot is.
2. **Actions,** in any order you choose. Each tile may act once per turn (a ballistic rack also intercepts during other players' turns):
   - **Rotate.** Flip facing (prograde ↔ retrograde). Thrusters need 1 cube.
   - **Move.** Exactly one of: _coast_, _burn_ or _jump_. If you take no move, you coast.
   - **Fire.** Any number of weapons, each at its own point in the sequence (before or after your move). If a ship you meant to fire at was destroyed earlier in your turn, that shot simply isn't taken.
   - **Scan.** With a sensor array (see Hidden Information).
3. **Missiles.** Each of your missiles in flight moves and may attack.
4. **Docking.** If you **arrived** on a station's sector this turn, you are docked: cargo is loaded and delivered, broken tiles are repaired, hull is restored to full, missiles reloaded. You stay moored until you burn away, riding the station. But the dock itself only happens on arrival.
5. **Heat check.** Add every cube sitting on your loadout, whatever put it there. **If your heat is now 0**, repair one broken tile of your choice. Above **10** (the **redline**), the excess is hull damage and your heat drops to 10. Then dissipate; what is left stays on the track for next turn.
6. **Missions.** Check your cards; completed cards are turned face-up.
7. Pass play. When the last player has acted, move every station 4 sectors, carrying any ship moored to it.

**The first round reaches nobody: no weapon fires and nobody scans.** Everyone deploys around the same hole, in a sector picked while the board was still empty, so the opening round is for getting off the line rather than for shooting (or reading the loadout of) whoever you were placed next to. Everything else is allowed. From the second round on, both are live. Coming back from Home is deploying again, so a returning ship's first turn is quiet the same way (see Destruction and Respawn).

---

## Energy and Heat

**Every cube on a tile is a point of heat at your heat check.** That is the whole of energy, and there is nothing else to learn.

- **Nobody places cubes for something they are about to do.** Taking an action powers the tile it uses, to the only figure that tile has: 4 on a railgun, 2 on a laser, 1 on the thrusters, the burn's own number on the engines. They are still on the tile when your check comes, so the action costs them; then they come off.
- **Three tiles you switch on instead**, because they work while you are not acting: **shields**, a **ballistic rack** (it intercepts on everyone else's turn) and a **sensor array** (it widens your critical range while it is up). Those stay on until you switch them off, so they are carrying cubes at **every** check and pay at every one. That is the price of holding a wall, a point defence or a firing solution up between turns, and it is the only energy decision in the game.
- **There is no reactor.** Nothing caps what you may light at once: a ship can run a full wall, a hard burn and the railgun in the same turn, and the check will bill it nineteen heat and take the hull. Burn yourself to a crisp if the turn is worth it.
- A salvo is **one use of the missiles tile** and a turn of interceptions is **one use of the ballistic rack**, whatever the count: a tile holds its cubes once, so it costs them once.
- **Using a standing tile is not holding it up.** Fire a rack you never switched on, or scan with a sensor you never switched on, and it takes its cubes for that turn like any other tile and goes dark at the end of it. You pay every check only for what you left on, which is also the only way a rack is up when somebody else's missiles arrive.
- **Heat is a track. It does not reset.** At your heat check, heat above **10** is hull damage and the track drops to 10. Then **dissipate** (5, plus 2 per working radiator) and carry the rest into your next turn.
- So a hot turn is a debt, not a wound: take one, then cool off. Make more heat than you dissipate for long enough and you reach the **redline** at 10, where it costs hull every turn until you stop.
- **A cold ship repairs itself.** If your heat is **0** at your heat check (not a cube anywhere on the loadout and nothing absorbed since your last check), repair **one** broken tile of your choice. Everything is off and the crew is outside. It is the only repair away from a station, and it is slower: a station fixes everything at once, refills your hull and reloads your missiles, all on arrival.
- **Shields turn the damage they stop into heat.** Two cubes absorb one point, so a tile takes 2 cubes or 4 and never an odd one. Shields are electromagnetic: they stop railgun slugs, ballistic rack rounds and missiles, **not lasers**.
- Two tiles at four cubes absorb 4 damage. They are also **8 heat every turn** against a dissipation of 5, so a full wall costs three hull a turn once the track saturates, before the ship does anything else. Nothing forbids it; the arithmetic does.
- No action is ever refused for energy. What a turn costs you is hull, and that is your decision to make.

| Tile                       | Energy | Effect                                                                               |
| -------------------------- | ------ | ------------------------------------------------------------------------------------ |
| Engines (fixed)            | 1–3    | Burns and jumps; once per turn                                                       |
| Thrusters (fixed)          | 1      | Rotate                                                                               |
| Fuel scoop (fixed)         | 3      | While coasting, recover fuel equal to your ring's velocity                           |
| Railgun (forward)          | 4      | 4 damage, spinal, same ring, 1–5 sectors ahead; recoil                               |
| Sensor array (forward)     | 2      | Scan; while it is up, criticals on 8–10; 2 heat at every check                      |
| Fuel compressor (forward)  | none   | A jump costs 1 fuel instead of 3                                                     |
| Missiles (forward or side) | 2      | Launch any number of your guided missiles at one ship in your well (4 aboard)        |
| Broadside laser (side)     | 2      | 2 damage, ignores shields, ±2 rings, ±1 sector, fires to one side only               |
| Shields (either)           | 2 or 4 | While up: 2 cubes absorb 1 damage, as 2 heat; its cubes are heat at every check     |
| Radiator (side)            | none   | +2 dissipation                                                                       |
| Ballistic rack (side)      | 2      | 2 damage, ±1 ring/same ring, ±1 sector; while up: rolls at 4 missiles a turn; 2 heat at every check |

---

## Movement

### Coast

Drift only, or hold your berth if you are moored at a station (see Stations). You may run the scoop with it: gain fuel equal to your ring's velocity (heat 3); a berth is as good a place to skim from as any.

### Burn

Drift, then change ring. Prograde facing burns **outward**, retrograde burns **inward**. The burn powers the engines to its own number, and that number is its heat. A burn changes exactly its number of rings: if there aren't enough rings left in that direction, you can't make that burn.

| Burn   | Engines | Fuel | Rings |
| ------ | ------- | ---- | ----- |
| Soft   | 1       | 1    | 1     |
| Medium | 2       | 2    | 2     |
| Hard   | 3       | 3    | 3     |

**Phasing.** During a burn you may adjust your arrival sector for 1 fuel per sector: brake by up to (velocity − 1) sectors, or accelerate by up to 3.

### Jump

From a lane's departure arc (the black hole arc of an outbound lane, the planet arc of an inbound one), with engines at 3, pay 3 fuel (1 with a fuel compressor) and move to the matching sector of the arrival arc. Facing is kept. A jump is your whole move: no drift this turn.

**Phasing a jump.** As in a burn, you may shift where you arrive for 1 fuel per sector, never outside the arrival arc. So any departure sector can reach any of the arc's four sectors, the matching one for free. A compressor cheapens the jump, never the phasing.

### Rotation

Costs 1 energy on the thrusters and 1 heat. Rotate before your burn to choose its direction.

---

## Combat

### Hitting

Roll a d10 for each shot: **1** misses, **2–9** hits, **10** is a critical. A sensor array with cubes on it makes 8–10 critical: one the attacker has up, or one a scan powered earlier in the same turn. A critical on an 8 or a 9 does not turn the sensor over; only scanning does.

### Damage

Shields absorb first (every 2 cubes absorb 1 damage and give its owner **2 heat**); the rest is hull damage. **Laser damage skips the shields** and goes straight to the hull. At 0 hull the ship is destroyed.

### Critical hits

When you fire, name one slot on the target: forward, side 1–4, engines or thrusters. **Not the fuel scoop**: it is the one tile a critical cannot name, because a dry ship with no scoop has no move that reaches a station to repair it. If the shot is a critical, that tile is **turned face-up and broken**, **whether or not the shot got through the shields**: its cubes are dumped into their owner's heat on the spot, and it cannot be used until repaired at a station.

A wall that holds is no protection against being named. **The cubes on every slot are public**, even face-down, so a fat slot is a target you can see: four cubes on a side slot is four heat dumped onto its owner the moment a 10 comes up. A tile that is merely used has no cubes on it when anyone else shoots, so the heat a critical dumps is the heat of whatever was standing. A broken tile is repaired at a station, or one at a time by running cold (see Energy and Heat), which is how a ship whose engines were shot out still gets home. Naming a face-down slot is a gamble; naming a face-up one is a plan. A tile that has just absorbed has already spent its cubes, so breaking it dumps little or nothing, but it is gone until they dock.

### Weapons

**Point blank.** A ship in **your own sector** is in range of every weapon you carry, whatever its arc: there is no ahead, behind or side at zero range. Ending a turn on top of someone (a Piracy card does exactly that) puts you in reach of everything they have, and them in reach of everything of yours.

- **Railgun.** Spinal: same ring, 1 to 5 sectors ahead in your facing direction. Firing pushes you one ring in your facing direction unless you **compensate** with engines (1 fuel, engine heat; engines can then not burn this turn). You cannot fire if the recoil would push you off the rings.
- **Broadside laser.** Targets within 2 rings and 1 sector; **shields do not stop it** (2 damage straight to the hull). Facing prograde, port tiles (side 1–2) fire outward and starboard tiles (side 3–4) fire inward; facing retrograde swaps them.
- **Ballistic rack.** 2 damage, targets within 1 ring and 1 sector, either side, or on your own ring 1 sector away (the only broadside that can join a railgun shot on your own ring). Firing it powers it like any gun, but it intercepts only if you have it **up**, because a salvo launched after the enemy's move reaches you before your next turn comes round.

  While up it **rolls at up to 4 missiles a turn**: a d10 against each one, on 2+ that missile is destroyed, and **the rack is used once for the turn** however many it rolls at. Four is what its two cubes could have thrown as a launcher, which is the whole of the symmetry: two cubes put four missiles in the air, two cubes shoot four down, and the fifth gets through. A ship expecting more than four at once carries a second rack and pays its cubes at every check like the first.
- **Missiles.** Target **any ship in your well**, any distance, any facing: a missile is self-guided, so its own flight is its range and a launch that never catches up is simply a missile wasted. One action launches **as many of your remaining missiles as you like at one ship**, all naming the same critical slot, for **one use of the tile**: the magazine is the limit, not the heat. Place a token on your sector for each. At the end of each of your turns every missile of yours **rides its orbit, then flies up to 3 steps toward its target** (a step is one ring or one sector; close the ring gap first). If it ends on the target's sector it attacks like a weapon (2 damage) after any interception attempt. A missile that has flown three times without hitting is removed.

  _Riding the orbit:_ a missile drifts with its ring like everything else. The one exception is the turn you launch it: if you launch **after** moving, the missile has already ridden along with your ship, so it does not drift again that turn. It just flies its 3 steps from where you dropped it. Launch before moving and it drifts with the ring like your ship did. (The app draws the path either way.)

Nothing fires across gravity wells.

---

## Hidden Information

Your tiles start face-down. **A tile is turned face-up the first time it does something:**

| Tile            | Face-up when                                                                       |
| --------------- | ---------------------------------------------------------------------------------- |
| Any weapon      | it fires (or a ballistic rack rolls at a missile); a missiles tile then shows what is left |
| Shields         | they absorb damage                                                                 |
| Sensor array    | it scans                                                                           |
| Radiator        | your heat goes above 5 at a heat check (it is visibly shedding)                    |
| Fuel compressor | a jump costs 1 fuel instead of 3                                                   |
| Any tile        | it is broken by a critical                                                         |

**Switching a tile on does not turn it over.** The cubes go on the slot where
everyone can count them, and the tile stays face-down: a wall you never needed,
a rack nothing came at and a sensor you never scanned with are all still
secrets at the end of the game. What gives a tile away is doing its job.

Face-up tiles stay face-up, even after respawn.

**Public:** positions, facing, hull, heat, **fuel**, the energy cubes on every slot, Home markers, how many crates and data chits you carry, face-up tiles and **the missiles left in a face-up missiles tile**, broken fixed systems, completed missions.
**Private:** what a face-down tile is, the ammo in a face-down missiles tile, missions in hand, where your cargo is going.

Energy is the tell, and it tells you exactly one thing: what a ship is **holding up**. Only a switched-on tile carries cubes between turns, so two cubes on any face-down slot is a half shield, a ballistic rack or a sensor array, and four can only be a full shield. That is a deduction from the cubes, not a reveal: the tile is still face-down and a scan still costs you a turn to be sure. Shields go in the bow or on a side precisely so that a loaded bow is a guess and not a certain sensor array.

A gun is dark whatever it is about to do, which is why a silent slot is the dangerous one.

### Scanning

With a sensor array aboard and unbroken, target a ship on your ring within 3 sectors. The scan powers it; switching it on is for the critical range it gives every weapon aboard while it is up, and that is what puts cubes on your bow for everyone to read. The sensor is used and turned face-up, and its 2 cubes stay on for the rest of your turn: shoot after you scan and that shot has the wider critical range too, for the same 2 heat. The target shows you **one face-down tile of your choice**, privately (name one you already know and you get the next face-down one; if you know them all, the scan still counts). If you hold an Intercept mission on that player, you also take their transmission (a data chit). Being scanned is visible to everyone.

---

## Missions

**Three points trigger the final round.** Cards come in two kinds.

**Primaries score two.** Destroy, Deliver, Intercept: the kill, the cargo run, the stolen transmission, one for each way of playing. Each names what it wants: a victim, a route, a station to file at. Yours is two thirds of the win on its own.

**Secondary cards score one.** Survey, Piracy, Tanker. Each is a thing you do rather than a primary someone sets you: no tile aboard can do it for you. Survey pays a chit: take it the moment you dive, then file it at **any** station. Piracy pays in loot: the crate or chit you seize sells at **any** station. Tanker pays on arrival: the fuel you pump in is the card.

**A hand is one primary and two secondaries**: two points and one and one, five on the table for the three that win. Your primary and either secondary is the win; the other secondary is your spare, taken when the game puts it in your way. Two secondaries alone are two points and win nothing. The round is played out; highest score wins, hull breaks ties.

| Card                                                | Points | Complete when                                                                                                              |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Destroy [Nth to your left]**                      | 2      | you reduce their hull to 0                                                                                                 |
| **Deliver [A → B]**                                 | 2      | you dock at A (load the crate), then dock at B                                                                             |
| **Intercept [Nth to your left] → file at [planet]** | 2      | you scan them (take the data chit), then dock at **that planet's** station                                                 |
| **Survey the Event Horizon**                        | 1      | you end a turn on Black Hole Ring 1, take the chit, then dock at **any** station to file it                                |
| **Piracy**                                          | 1      | you end a turn in the **same sector** as an undocked ship carrying a crate or a data chit: it is yours (your hold must be empty; loot fills it), then dock at **any** station to sell it. Their card goes back to undone  |
| **Tanker**                                          | 1      | you **arrive** at **any** station with **8 or more fuel**: hand in 8, and the card is done                                  |

**The decks.** Two piles for the table, dealt separately.

The **primary pile** is two copies of every primary mission: each Destroy and Intercept offset (below), and all six Deliver routes. **Setup:** take out every Destroy and Intercept whose number is the player count or higher. At three players that leaves offsets 1 and 2. More seats leave more of it pointed at people: at six players two cards in three name a rival, and the table is a fight rather than a trade route.

The **secondaries** are six copies each of Survey, Piracy and Tanker, one set per seat. They name no rival and no route, so there is nothing to shuffle: every player is handed one of each.

**The deal.** Shuffle the primary pile and deal **three** to each player, who keeps **one**. Then every player takes **one of each secondary** and keeps **two** of the three. The card you leave goes face-down onto one shared discard pile, never back with its kind, which would tell the table exactly which secondary you kept out.

So the primary mission is the luck of the draw and the two things you do yourself are a straight choice: everyone is offered all three, and what you decide is which one to leave. Neither decision is the shape of your hand (every hand is one primary and two of your own), and what changes is which.

**Cards count seats, they do not name them.** A Destroy card reads _the 2nd player to your left_ (counting left around the table in turn order), so the same card is a different target in every hand, no card can ever name the player holding it, and holding one tells the table nothing. The count only becomes a name when you complete the card and turn it face-up.

**Your hold takes one crate.** Loot (a seized crate or a seized chit) fills the hold like a crate, so a pirate carrying its own cargo route seizes nothing until the hold is empty, which is why Piracy suits a ship with nothing else to carry, and loot can be seized in turn. A moored ship neither takes nor loses anything. Destroyed with a crate aboard, it is lost: the Deliver holder loads another at the pickup planet, the pirate seizes another.

A crate fills it, so a second Deliver waits until the first is delivered. Two routes that load at the same station are two trips, and the only pair that is one trip is a chain, where you drop at the station you collect the next one from. Data chits are numbers, not freight: a scan's transmission and a survey's readings ride free alongside whatever is in the hold, however many you carry.

**Keep only cards your loadout can fly.** Intercept opens with a scan, so it needs a **sensor array**, and Destroy needs a **weapon** (railgun, broadside laser, ballistic rack or missiles), since a ship that cooks itself on its own heat credits nobody. Your loadout is fixed for the game (a station repairs tiles, it never fits one), so a card you cannot start is a card you never score.

When you complete a mission, turn the card face-up for everyone to see.

---

## Destruction and Respawn

When your hull reaches 0:

- remove your ship; drop your cargo: crates go back to their pickup station (you must load them again), data chits are lost;
- on your next turn you respawn at Home and drift, and the turn after that is a first round of your own: untouchable until it is over, and on it no weapon of yours fires and you scan nobody (see A Turn). One turn gone.

Being destroyed never removes you from the game, but it costs you cargo, tempo and position, and hands two points to anyone holding your Destroy card. Nobody collects it twice over: a ship coming back cannot be shot at the sector everyone knows it returns to, and it does not get to fire first for the privilege.

---

## Quick Reference

|                  |                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Energy           | **every cube on a tile is a point of heat at your check**; an action powers the tile it uses and the cubes come off after, shields/racks/sensors stay on until switched off |
| Heat track       | 10 (the redline). Above it at a check: hull damage, then dissipate and carry the rest                                                                                 |
| Dissipation      | 5 (+2 per radiator), at every check. Heat does not reset                                                                                                              |
| Hull             | 10                                                                                                                                                                    |
| Fuel             | 10                                                                                                                                                                    |
| Sectors per ring | 24                                                                                                                                                                    |
| Drift            | black hole 8/6/4/2/1 · planet 6/4/2/1, innermost first                                                                                                                |
| Station ring     | planet Ring 2; Ring 1 is faster, so it is how you catch one                                                                                                           |
| Burn             | soft 1 / medium 2 / hard 3 (rings, fuel, engine energy)                                                                                                               |
| Phasing          | burn: −(velocity−1) to +3 sectors · jump: anywhere in the arrival arc · 1 fuel each, always paid                                                                      |
| Jump             | engines 3, 3 fuel (1 with a compressor), no drift                                                                                                                     |
| Hit roll         | 1 miss, 2–9 hit, 10 crit (8–10 with sensors)                                                                                                                          |
| Shields          | up at 2 or 4 cubes; 2 cubes a point absorbed, 2 heat a point; **its cubes are heat at every check it is up**; lasers ignore them                                      |
| Critical         | names any slot; breaks it through shields, and dumps its cubes as heat (which only a standing tile is carrying)                                                        |
| Repair           | a station, on arrival, fixes everything; or one tile a turn at 0 heat                                                                                                 |
| Scan             | same ring, within 3 sectors, sensor aboard and unbroken                                                                                                               |
| First round      | no weapon fires and nobody scans                                                                                                                                      |
| Respawn          | next turn: back at Home, full hull and tank, drifting. The turn after is a first round of your own: untouchable until it ends, you fire at nobody and scan nobody      |
| Point blank      | a ship in your own sector is in range of every weapon                                                                                                                 |
| Docking          | on arrival only: full hull, repair all, reload missiles, load/deliver cargo; you stay moored until you burn away                                                      |
| Survey           | a turn ended on Black Hole Ring 1, take the chit, then any station                                                                                                    |
| Keeping cards    | 3 primaries keep 1, one of each secondary keep 2, rest to a shared discard; Intercept needs a sensor array, Destroy needs a weapon                                    |
| Hold             | one crate; data chits ride free                                                                                                                                       |
| Ammo             | private while the missiles tile is face-down; public once it has fired                                                                                                |
| Salvo            | one action launches any number of your missiles at one ship, and the tile holds its 2 cubes once; a rack that is up rolls at 4 of them a turn, one rack per 4          |
| Win              | 3 points end the round (primaries 2, secondaries 1); highest score, then hull, then fuel                                                                            |
| Hand             | 1 primary of 3 dealt, 2 of the 3 secondaries. Five points held, three win: the primary and either secondary                                                           |

### Turn cheat sheet

1. Destroyed? Respawn at Home and drift. Turn over. Your next turn is a first round of your own: untouchable until it ends, no weapon of yours fires and you scan nobody.
2. Standing systems: shields, racks and sensors on or off.
3. Actions in your order: rotate · move (coast / burn / jump) · fire · scan.
4. Your missiles move.
5. Just arrived at a station? Load, deliver, repair, full hull, reload. Moored until you burn away.
6. Heat check: add every cube on your loadout; at 0 heat repair one tile; over 10 is hull damage; dissipate and carry the rest.
7. Flip completed missions. Pass. (Last player: stations move, with whoever is moored.)
