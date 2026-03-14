# Dangerous Inclinations — Tabletop Rules

A turn-based tactical space combat game for 2–4 players. Ships orbit gravity wells in a binary star system, manage energy and heat, fire weapons, and race to complete secret missions.

---

## Win Condition

**First player to complete 3 missions wins.**

Missions are secret objectives dealt at the start of the game. During the loadout phase, each player draws 5 mission cards and keeps 3. Mission types:

| Mission | Objective | How to Complete |
|---------|-----------|-----------------|
| **Destroy Ship** | Eliminate a specific player's ship | Reduce their HP to 0 (they respawn) |
| **Deliver Cargo** | Transport cargo between two planets | Pick up at origin station, deliver to destination station |
| **Intercept Transmission** | Shadow a target and steal their data | Stay within ±3 sectors on the same ring with sensor array powered for 1 turn, then deliver scan data to any station |

---

## Setup

### The Map

The playing field consists of **gravity wells** arranged in a Venn diagram:

- **1 Black Hole** at the center — 5 concentric rings
- **3 Planets** (Alpha, Beta, Gamma) orbiting the black hole at 120° intervals — 3 rings each

Every ring has **24 sectors**. Ships orbit within these sectors.

### Ring Velocities

Velocity = how many sectors a ship drifts per turn (automatic orbital movement).

**Black Hole Rings:**

| Ring | Velocity | Description |
|------|----------|-------------|
| 1 | 8 | Innermost — blazing fast |
| 2 | 6 | Very fast |
| 3 | 4 | Fast |
| 4 | 2 | Medium — deployment ring |
| 5 | 1 | Slow — transfer ring |

**Planet Rings (each planet is identical):**

| Ring | Velocity | Description |
|------|----------|-------------|
| 1 | 4 | Innermost — fast, station ring |
| 2 | 2 | Medium |
| 3 | 1 | Slow — transfer ring |

### Space Stations

Each planet has a space station orbiting on **Ring 1**. Stations drift at Ring 1 velocity (4 sectors/round). Stations are used for cargo pickup/delivery.

### Ship Facing

Ships have two orientations:

- **Prograde** — facing forward along the orbit
- **Retrograde** — facing backward against the orbit

Facing determines burn direction and weapon arcs.

---

## Game Phases

### 1. Loadout Phase

Each player:
1. Draws **5 mission cards** from a shuffled deck
2. Selects **3 missions** to keep (the rest are discarded)
3. Chooses a **ship loadout** — filling 2 forward slots and 4 side slots with subsystems
4. Missions inform loadout choices (e.g., cargo missions favor fuel compressors, combat missions favor weapons)

### 2. Deployment Phase

Players take turns placing their ship on **Black Hole Ring 4** at an available sector. One ship per sector.

### 3. Active Phase

Players take turns. On your turn you execute actions, then play passes to the next player. The game continues until someone completes their 3rd mission.

---

## Turn Structure

### Start of Turn

1. **Heat Damage**: If your ship's heat exceeds its dissipation capacity, take damage equal to the excess. *(Example: 8 heat, 5 dissipation = 3 hull damage.)*
2. **Heat Reset**: Heat clears to 0.
3. **Respawn**: If your ship was destroyed, it respawns at Black Hole Ring 4, random sector. HP and subsystems reset; cargo is preserved.

### Planning & Execution

Your turn has two phases:

**Phase 1 — Energy Management**
- Deallocate energy from subsystems (returns to reactor) — unlimited
- Allocate energy from reactor to subsystems — up to each subsystem's max

Energy allocations persist across turns. You only need to adjust what changed.

**Phase 2 — Tactical Actions (player-chosen order)**

You choose a sequence for your actions. Actions execute in the order you set:

- **Rotate** — Change facing (prograde ↔ retrograde). Requires powered maneuvering thrusters.
- **Move** — Choose ONE: Coast, Burn, or Well Transfer.
- **Fire Weapons** — Any number of powered weapons, each at its own sequence point (before or after movement).

Weapons can fire from your pre-move OR post-move position depending on where you place them in the sequence. This is a key tactical choice.

### End of Turn

- Subsystem "used this turn" flags reset
- Missile positions update (for your missiles only)
- Mission/cargo checks run
- Play passes to next player

### End of Round

When all players have taken a turn:
- Station positions advance by their ring's velocity

---

## Energy & Heat

### Reactor

- Total capacity: **10 energy units**
- Allocate freely to subsystems up to each one's max
- Deallocate freely (unlimited, instant)
- Allocations persist across turns

### Heat-on-Use

**Heat is generated ONLY when a subsystem is USED** during a turn. The heat generated equals the subsystem's allocated energy.

| Example | Energy Allocated | Heat Generated |
|---------|-----------------|----------------|
| Fire laser | 2 | 2 |
| Execute burn | 3 (engines) | 3 |
| Activate scoop | 3 | 3 |
| Powered but unused shields | 4 | 0 |

**Unused subsystems generate zero heat**, even if fully powered. This is the core tension: power up for capability, but using power creates heat.

### Dissipation

Ships have a **dissipation capacity** (base: **5**). At the start of your next turn:

- If heat ≤ dissipation: no damage, heat resets
- If heat > dissipation: take (heat − dissipation) hull damage, then heat resets

Radiator subsystems add +2 dissipation each (passive, no energy needed).

### Shields

When your ship takes weapon damage:
1. Shields absorb up to their allocated energy in damage
2. Absorbed damage becomes **heat** instead of hull damage
3. Any remaining damage hits the hull normally
4. Shield energy is consumed and returned to reactor

Shields don't generate heat on their own — they convert incoming damage to heat.

### Critical Hits

Every weapon hit has a **10% base chance** of being a critical hit (d10 roll of 10):

1. A random **powered** subsystem on the target is broken
2. That subsystem's allocated energy converts to heat
3. The broken subsystem cannot be used until repaired

Sensor arrays increase your critical hit chance by **+20%** each when powered (passive bonus).

---

## Movement

### Orbital Movement (Automatic)

Every turn, your ship drifts forward by the ring's velocity in sectors. This is unavoidable orbital momentum.

| Ring (BH) | Drift | Ring (Planet) | Drift |
|-----------|-------|---------------|-------|
| 1 | 8 sectors | 1 | 4 sectors |
| 2 | 6 sectors | 2 | 2 sectors |
| 3 | 4 sectors | 3 | 1 sector |
| 4 | 2 sectors | | |
| 5 | 1 sector | | |

### Movement Actions (pick one)

#### Coast
- Drift with orbit only (no burn)
- No cost
- Allows fuel scoop activation (if powered)

#### Burn (Ring Transfer)

Spend reaction mass and engine energy to change rings. Transfer completes immediately.

| Intensity | Engine Energy | Mass Cost | Ring Change |
|-----------|--------------|-----------|-------------|
| Soft | 1 | 1 | ±1 ring |
| Medium | 2 | 2 | ±2 rings |
| Hard | 3 | 3 | ±3 rings |

**Direction:**
- Prograde facing → burn moves you **outward** (higher ring)
- Retrograde facing → burn moves you **inward** (lower ring)

**Sector adjustment (phasing):** During a burn, you can fine-tune your arrival sector for extra mass cost:

| Source Velocity | Adjustment Range | Cost |
|-----------------|-----------------|------|
| 8 | −7 to +3 | 1 mass per sector |
| 6 | −5 to +3 | 1 mass per sector |
| 4 | −3 to +3 | 1 mass per sector |
| 2 | −1 to +3 | 1 mass per sector |
| 1 | 0 to +3 | 1 mass per sector |

You must always move at least 1 sector forward (minimum movement).

#### Well Transfer (Gravity Well Jump)

Jump between the black hole and a planet (or vice versa).

**Requirements:**
- Must be on the **outermost ring** (BH Ring 5 or Planet Ring 3)
- Must be at a **transfer sector** (fixed positions — see transfer chart)
- Engines powered at level 3
- Costs **3 reaction mass**

**Transfer Sectors (fixed):**

| Planet | BH → Planet | Planet → BH |
|--------|-------------|-------------|
| Alpha | BH R5 S18 → Alpha R3 S5 | Alpha R3 S18 → BH R5 S5 |
| Beta | BH R5 S2 → Beta R3 S5 | Beta R3 S18 → BH R5 S13 |
| Gamma | BH R5 S10 → Gamma R3 S5 | Gamma R3 S18 → BH R5 S21 |

Transfer is instant. Ship facing is preserved. Orbital movement applies normally after landing.

### Rotation

- Requires maneuvering thrusters powered (1 energy)
- Can happen on the same turn as movement (before movement)
- Instant, no turn delay
- Generates heat = 1 (allocated energy)

### Reaction Mass

- Starting/max capacity: **10 units**
- Consumed by burns and well transfers
- Recovered by fuel scoop (coast only, generates 3 heat):
  - Recovery = ring velocity (1–8 mass depending on ring)
  - Cannot exceed max capacity

---

## Weapons & Combat

### Weapon Types

**Railgun** *(forward slot)*
| Stat | Value |
|------|-------|
| Energy | 4 |
| Damage | 4 |
| Arc | Spinal (fires in facing direction) |
| Range | Same ring, 5 sectors ahead |
| Special | Recoil effect |

**Broadside Laser** *(side slot)*
| Stat | Value |
|------|-------|
| Energy | 2 |
| Damage | 2 |
| Arc | Broadside (perpendicular, side-restricted) |
| Range | ±2 rings, ±1 sector |
| Special | Port lasers fire inward, starboard fire outward |

**Missiles** *(forward or side slot)*
| Stat | Value |
|------|-------|
| Energy | 2 |
| Damage | 2 |
| Arc | Turret (360°) |
| Range | ±2 rings, ±3 sectors |
| Ammo | 4 missiles |
| Special | Self-guided, 3-turn lifetime, can be intercepted by PDC |

**Ballistic Rack / PDC** *(side slot)*
| Stat | Value |
|------|-------|
| Energy | 2 |
| Damage | 1 |
| Arc | Broadside (not side-restricted) |
| Range | ±1 ring, ±1 sector (can target same ring) |
| Special | Intercepts incoming missiles automatically |

### Hit Resolution (d10)

For each weapon fired, roll a d10:

| Roll | Result |
|------|--------|
| 1 | Miss |
| 2–9 | Hit (normal damage) |
| 10 | Critical hit |

Sensor arrays shift the critical threshold: with one powered array, crits happen on 8–10 (30% chance).

### Missile Behavior

Missiles are autonomous projectiles that persist across turns:
1. **Launch**: Missile appears at your ship's position
2. **Each turn**: Missile moves toward target (up to 3 fuel per turn for ring+sector movement)
3. **Hit detection**: d10 roll when missile reaches target
4. **PDC intercept**: If target has a powered ballistic rack, they roll d10. On 2+, missile is destroyed.
5. **Expiry**: Missiles self-destruct after 3 turns if they don't reach the target

---

## Ship Loadout

### Fixed Subsystems (always installed)

| Subsystem | Energy | Function |
|-----------|--------|----------|
| Engines | 1–3 | Burns (soft/medium/hard) |
| Maneuvering Thrusters | 1 | Rotation |
| Fuel Scoop | 3 | Recover reaction mass while coasting |

### Loadout Slots

**2 Forward Slots** — choose from:
| Subsystem | Energy | Type |
|-----------|--------|------|
| Railgun | 4 | Weapon — high damage spinal |
| Sensor Array | 2 | Passive — +20% crit chance when powered |

**4 Side Slots** — choose from:
| Subsystem | Energy | Type |
|-----------|--------|------|
| Broadside Laser | 2 | Weapon — side-restricted broadside |
| Shields | 1–4 | Defense — absorbs damage as heat |
| Radiator | 0 (passive) | +2 dissipation capacity |
| Fuel Compressor | 0 (passive) | +6 max reaction mass, free well transfers |
| Ballistic Rack (PDC) | 2 | Weapon + missile defense |

**Either Slot** (forward or side):
| Subsystem | Energy | Type |
|-----------|--------|------|
| Missiles | 2 | Weapon — guided, 4 ammo |

### Passive Subsystems

These work without energy allocation:
- **Radiator**: +2 dissipation capacity (stacks)
- **Fuel Compressor**: +6 max reaction mass capacity. Well transfers refund their 3 mass cost (effectively free jumps).
- **Sensor Array**: +20% critical hit chance when powered (requires 2 energy)

---

## Missions

### Mission Deck

At game start, a deck is built containing all possible missions:
- **Destroy** missions (one per opponent)
- **Intercept Transmission** missions (one per opponent)
- **Deliver Cargo** missions (every planet-pair route)

The deck is shuffled. Each player draws 5 cards and keeps 3.

### Destroy Ship

- **Target**: A specific opponent
- **Complete when**: Target's HP reaches 0
- **Note**: The target respawns — this doesn't eliminate them from the game

### Deliver Cargo

- **Pickup**: Fly to the origin planet's station (Ring 1). Cargo auto-loads when you dock.
- **Delivery**: Fly to the destination planet's station. Cargo auto-delivers when you dock.
- **Note**: Cargo survives respawn. Getting destroyed doesn't lose your cargo.

### Intercept Transmission

Two-phase mission:

**Phase 1 — Scan:**
- Be on the **same ring** as the target, within **±3 sectors**
- Your **sensor array must be powered** (2 energy allocated)
- Maintain position for **1 turn**
- When conditions are met, scan data cargo automatically appears in your inventory
- **Tension**: Powering your sensor array is visible to all players, revealing your intent

**Phase 2 — Deliver:**
- Take the scan data cargo to **any station**
- Delivers automatically when you dock

---

## Respawn

When a ship is destroyed (HP reaches 0):
- Ship respawns at **Black Hole Ring 4**, random available sector
- **Reset**: Full HP, all subsystems unpowered, heat cleared, reaction mass refilled
- **Preserved**: Cargo (mission continuity)
- Respawn happens at the start of the destroyed player's next turn

---

## Quick Reference

### Key Numbers

| Stat | Value |
|------|-------|
| Reactor capacity | 10 energy |
| Base dissipation | 5 heat |
| Starting reaction mass | 10 |
| Max reaction mass | 10 (+6 per fuel compressor) |
| Starting HP | 10 |
| Sectors per ring | 24 |
| BH rings | 5 |
| Planet rings | 3 |
| Missions to win | 3 |
| Missions offered | 5 (keep 3) |

### Turn Cheat Sheet

1. **Start**: Take heat damage if over dissipation. Reset heat. Respawn if destroyed.
2. **Energy**: Adjust power to subsystems.
3. **Actions** (in your chosen order):
   - Rotate (if needed)
   - Move (coast / burn / well transfer)
   - Fire weapons (any number, before or after move)
4. **End**: Flags reset, missiles update, missions check.

---

*Dangerous Inclinations — A game of orbital chess, heat management, and hidden objectives.*
