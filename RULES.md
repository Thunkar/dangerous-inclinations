# Dangerous Inclinations - Game Rules

This document contains the comprehensive rules for Dangerous Inclinations.

## Energy Allocation and Management

### Reactor Basics

- Ships have a reactor with a fixed amount of energy units (starting: **10 units**)
- During a turn, the user can allocate energy units to the ship's subsystems
- Each subsystem has a maximum energy allocation limit
- Energy allocated to subsystems persists across turns until explicitly deallocated

### Subsystem Activation

- Most systems remain **inactive** until their activation threshold is met
- Once the minimum energy requirement is met, the subsystem becomes available for use
- Some systems (e.g., engines) allow different actions depending on their power level
- Different power levels may unlock different capabilities or action intensities

### Energy Deallocation

- Energy can be deallocated from subsystems freely (no rate limit)
- Deallocated energy returns to the reactor immediately
- Energy remains in the subsystem until explicitly deallocated

### Heat Generation (Heat-on-Use System)

- **Heat is generated ONLY when a subsystem is USED** during a turn
- When a subsystem is used (e.g., firing a weapon, executing a burn), it generates heat equal to its **allocated energy**
- Heat generation formula: `allocated_energy` when subsystem is used
- Example: Laser with 2 energy allocated, when fired, generates 2 heat
- Example: Engines with 3 energy allocated, when burn is executed, generates 3 heat
- **Unused subsystems generate NO heat**, even if powered

### Heat Dissipation and Damage

Ships have a **dissipation capacity** (base: 5) that represents their ability to radiate heat.

**Heat Lifecycle:**

1. **During turn**: Subsystem usage generates heat (engines, rotation, weapons)
2. **Turn ends**: Heat persists on ship
3. **When your next turn begins**: Heat is evaluated
   - If heat > dissipation capacity, take damage = heat - capacity
   - Example: 8 heat with 5 dissipation = 3 damage
   - Heat is then cleared to 0
4. **Between turns**: Shields and critical hits can add heat
5. **Repeat**: Generate heat during your turn, evaluate at start of next turn

This simple model makes heat easy to track:

- Heat damage is applied BEFORE you see your turn (you see the damage immediately)
- Each turn starts fresh after heat is evaluated
- You only need to track heat generated THIS turn
- If your heat exceeds dissipation, you'll take damage at the START of your next turn

### Critical Hits

When a weapon hits a target, there is a **10% chance** of a critical hit:

- A random powered subsystem on the target is unpowered (energy returned to reactor)
- The unpowered subsystem's energy is converted to heat on the target ship
- This can cascade heat damage if the target already has high heat

### Planning Phase (Pending State)

- During their turn, users can freely allocate and deallocate energy in a "planning phase"
- Changes are shown in real-time but are NOT committed to the game state
- Users can experiment with different configurations to:
  - Understand available actions
  - Plan their turn strategy
  - See what subsystems will be powered
- **Only when "Execute Turn" is clicked** are the changes committed

### Validation

- Validation logic prevents illegal action combinations:
  - Cannot allocate more energy than the reactor has available
  - Cannot allocate more than a subsystem's maximum
  - Cannot deallocate more energy than a subsystem has allocated
  - Cannot use a subsystem that doesn't have its minimum energy requirement met
- Invalid configurations should be prevented or clearly indicated to the user

### Turn Execution

- When "Execute Turn" is clicked:
  1. The difference between committed state and pending state is computed
  2. Actions are generated based on these differences
  3. The game engine processes all actions
  4. The new committed state becomes the starting point for the next turn
- The next turn begins with the state computed by the game engine

## Movement and Navigation

### Orbital System Overview

The game takes place in a multi-gravity-well system with a central **Black Hole** and **6 orbiting Planets**.

#### Black Hole Rings (5 rings, 24 sectors each)

| Ring       | Sectors | Velocity | Description              |
| ---------- | ------- | -------- | ------------------------ |
| **Ring 1** | 24      | 8        | Innermost, fastest       |
| **Ring 2** | 24      | 6        |                          |
| **Ring 3** | 24      | 4        |                          |
| **Ring 4** | 24      | 2        |                          |
| **Ring 5** | 24      | 1        | Outermost, transfer ring |

#### Planet Rings (3 rings, 24 sectors each)

| Ring       | Sectors | Velocity | Description              |
| ---------- | ------- | -------- | ------------------------ |
| **Ring 1** | 24      | 4        | Innermost                |
| **Ring 2** | 24      | 2        |                          |
| **Ring 3** | 24      | 1        | Outermost, transfer ring |

**Velocity** determines how many sectors a ship moves per turn during orbital movement. Higher velocity rings move ships faster through space.

#### Planets

Six planets orbit the black hole at fixed positions (60° apart):

| Planet      | Angle | Description |
| ----------- | ----- | ----------- |
| **Alpha**   | 0°    | Top         |
| **Beta**    | 60°   |             |
| **Gamma**   | 120°  |             |
| **Delta**   | 180°  | Bottom      |
| **Epsilon** | 240°  |             |
| **Zeta**    | 300°  |             |

Planets have **velocity = 0** (stationary positions), simplifying gameplay. Transfer sectors remain constant.

### Ship Facing

Ships have two possible orientations:

- **Prograde**: Facing forward along the orbit (natural direction of travel)
- **Retrograde**: Facing backward against the orbit (opposite direction)

Ship facing determines:

- Which direction burns will take you (prograde = outward, retrograde = inward)
- Weapon firing arcs (railgun fires in the direction of travel)
- Rotation requirements for maneuvers

### Automatic Orbital Movement

**Every turn, during the movement phase**, the ship automatically moves:

- **Velocity sectors forward** on its current ring (following orbital velocity)
- Movement amount depends on the ring's velocity (1-8 sectors per turn)
- This happens for **both** coasting and burning
- Movement is always in the prograde direction (clockwise around the star)
- Cannot be prevented or modified (represents orbital momentum)

**Important**: When a ship executes a burn, the transfer completes immediately:

- The ship moves **velocity sectors orbitally** on its **current ring** during the burn
- The transfer to the destination ring completes in the same turn
- All movements and transfers happen during the movement phase

### Movement Actions (Mutually Exclusive)

Players must choose **one** movement action per turn:

#### 1. Coast

- Ship continues on current ring, moving 1 sector (automatic orbital movement)
- **No energy or mass cost**
- Allows use of fuel scoop (if equipped and powered)
- Can optionally change facing (requires powered rotation subsystem)

#### 2. Burn (Ring Transfer)

Initiates a transfer to a different ring. Three burn intensities available:

| Intensity  | Energy Cost | Mass Cost | Ring Change | Subsystem Requirement |
| ---------- | ----------- | --------- | ----------- | --------------------- |
| **Light**  | 1 energy    | 1 mass    | ±1 ring     | Engines: 1+ energy    |
| **Medium** | 2 energy    | 2 mass    | ±2 rings    | Engines: 2+ energy    |
| **Heavy**  | 3 energy    | 3 mass    | ±3 rings    | Engines: 3+ energy    |

**Burn Mechanics**:

1. Energy must be **pre-allocated** to engines before the turn
2. Reaction mass is consumed when the burn executes
3. **Transfer completes at the START of your NEXT turn** (one turn travel time)
4. Ship is "in transit" during the transfer turn
5. Upon arrival, ship is mapped to equivalent sector on destination ring

**Direction**:

- **Prograde burn**: Move outward (higher ring numbers)
- **Retrograde burn**: Move inward (lower ring numbers)
- Must face the correct direction before burning (may require rotation)

#### 3. Well Transfer (Gravity Well Jump)

Ships can transfer between gravity wells using elliptic Hohmann-like transfer orbits. This allows travel between the central Black Hole and the six orbiting Planets.

**Requirements**:

- Ship must be on the **outermost ring** of current gravity well:
  - Black Hole: **Ring 5**
  - Planets: **Ring 3**
- Ship must be at a **fixed transfer sector** (specific sectors for each planet)
- Engines must be **powered at level 3** (3+ energy allocated)

**Transfer Sectors** (Fixed):

| Planet      | Outbound (BH→Planet)      | Return (Planet→BH)         |
| ----------- | ------------------------- | -------------------------- |
| **Alpha**   | BH R5 S20 → Alpha R3 S5   | Alpha R3 S18 → BH R5 S3    |
| **Beta**    | BH R5 S0 → Beta R3 S5     | Beta R3 S18 → BH R5 S7     |
| **Gamma**   | BH R5 S4 → Gamma R3 S5    | Gamma R3 S18 → BH R5 S11   |
| **Delta**   | BH R5 S8 → Delta R3 S5    | Delta R3 S18 → BH R5 S15   |
| **Epsilon** | BH R5 S12 → Epsilon R3 S5 | Epsilon R3 S18 → BH R5 S19 |
| **Zeta**    | BH R5 S16 → Zeta R3 S5    | Zeta R3 S18 → BH R5 S23    |

**Transfer Mechanics**:

1. Transfer is **instantaneous** - ship arrives at destination immediately
2. Ship arrives at the **designated arrival sector** on the destination well's outermost ring
3. After transfer, orbital movement applies normally on the next coast/turn
4. Ship **facing is preserved** across the transfer
5. No reaction mass cost (different from ring burns)

**Visualization**:

- **Yellow arcs**: Outbound transfers (Black Hole → Planet)
- **Cyan arcs**: Return transfers (Planet → Black Hole)
- Arcs curve **outward** (away from Black Hole) representing elliptic trajectories
- Arrows indicate transfer direction toward the destination

**Tabletop Implementation**:

- Planets are at fixed positions (velocity = 0) so transfer sectors never change
- Players can reference a fixed transfer chart
- This simplifies gameplay while maintaining orbital mechanics flavor

### Rotation (Changing Facing)

- Requires **Maneuvering Thrusters subsystem** to be powered (minimum 1 energy)
- Can be done on the same turn as movement (rotation happens before movement)
- Subsystem becomes "used" for the turn (cannot rotate again until next turn)
- **Instant** - no turn delay
- Can rotate as part of either coast or burn action

### Sector Adjustment (Phasing Maneuvers)

During a burn, players can adjust their destination sector within a range determined by the current ring's velocity:

**Adjustment Range**: `-(velocity - 1)` to `+3` sectors

| Ring Velocity | Min Adjustment | Max Adjustment |
| ------------- | -------------- | -------------- |
| 8             | -7             | +3             |
| 6             | -5             | +3             |
| 4             | -3             | +3             |
| 2             | -1             | +3             |
| 1             | 0              | +3             |

**Adjustment Cost**: Each sector of adjustment costs **1 additional reaction mass**

**Examples**:

- Soft burn (1 mass) with +2 adjustment = 3 total mass
- Medium burn (2 mass) with -3 adjustment = 5 total mass
- Perfect Hohmann (0 adjustment) = base burn cost only

**Mechanics**:

- Adjustment is applied after orbital movement and sector mapping
- Wraps around at ring boundaries (sector 0 wraps to max sector)
- Negative adjustment slows effective movement, positive speeds it up
- Minimum movement is always 1 sector (hence velocity-1 minimum for negative)

### Sector Mapping on Transfer

All rings have **24 sectors**, so sector mapping is **1:1** (direct mapping):

- Sector number is preserved across ring transfers
- R1 S5 → R2 S5 → R3 S5 → etc.
- No calculation needed - your sector stays the same

**With Sector Adjustment**:

- After base mapping, apply your chosen sector adjustment
- Final sector = (base sector + adjustment) mod 24
- Example: Start at S5, +3 adjustment → arrive at S8

### Reaction Mass Management

**Reaction Mass**:

- Required resource for executing burns
- Maximum capacity: **10 units**
- Starting amount: **10 units**
- Consumed when burn action is executed (not when energy is allocated)

**Fuel Scoop**:

- Can **only be activated during a coast action** (not while burning)
- Requires **Fuel Scoop subsystem** to be powered (minimum 3 energy)
- Subsystem becomes "used" for the turn
- Recovers reaction mass equal to the **ring's velocity** (1-8 mass depending on ring)
- Cannot exceed maximum capacity (10 units)
- Represents collecting material from the orbital environment

**Fuel Scoop Recovery by Ring** (Black Hole):

| Ring | Velocity | Mass Recovered |
| ---- | -------- | -------------- |
| R1   | 8        | 8              |
| R2   | 6        | 6              |
| R3   | 4        | 4              |
| R4   | 2        | 2              |
| R5   | 1        | 1              |

Inner rings recover more mass due to denser orbital debris closer to the black hole.

### Tactical Action Sequencing

During the planning phase of a turn, players can sequence their actions in a specific order. The following rules apply:

**Action Categories**:

1. **Rotation** - Changing ship facing (prograde/retrograde)
2. **Movement** - Coast or burn action
3. **Weapon Firing** - Any combination of enabled weapons (laser, railgun, missiles)

**Sequencing Rules**:

- Rotation must occur **before** movement (if both are performed)
- Rotation and movement can only be performed **once per turn**
- Multiple weapons can fire in a single turn, each at different sequence points
- Weapons can fire **before** or **after** movement (player's choice)
- Actions execute in numerical sequence order (1, 2, 3, etc.)

**Post-Movement Weapon Targeting**:
When a weapon fires **after** the movement action:

- Weapon range is calculated from the ship's **post-movement position**
- For a coast action: ship has moved +1 sector on the current ring
- For a burn action: ship has moved +1 sector on the **current ring** (not destination ring)
  - Remember: transfers complete at the START of the next turn
  - During the burn turn, the ship is still on the original ring
- This allows players to move into firing position before engaging targets

**Example Sequences**:

- Sequence 1 (Rotation), Sequence 2 (Movement), Sequence 3 (Fire Laser), Sequence 4 (Fire Railgun)
  - Weapons fire from post-movement position
- Sequence 1 (Fire Missiles), Sequence 2 (Rotation), Sequence 3 (Movement)
  - Missiles fire from original position before ship moves
- Sequence 1 (Rotation), Sequence 2 (Fire Laser), Sequence 3 (Movement), Sequence 4 (Fire Railgun)
  - Laser fires from pre-movement position, railgun from post-movement position

### Turn Sequence Summary

**When a player becomes active** (at the end of the previous player's turn):

- **Heat Resolution** (applied immediately when switching to this player):
  1. **Heat Damage**: If heat > dissipation capacity, take damage = heat - capacity
  2. **Heat Reset**: Heat is cleared to 0 (damage already taken)
  - This ensures the player sees any heat damage BEFORE planning their turn

- **Transfer Completion** (if arriving this turn)
  - Ship arrives at destination ring and sector
  - Transfer state is cleared
  - Player begins their turn at the new position

**When a player executes their turn**, actions are processed in phases:

**Phase 1: Energy Management**:

1. **Energy Allocation** (to subsystems)
2. **Energy Deallocation** (from subsystems, unlimited)

**Phase 2: Tactical Sequence Execution** (actions execute in player-defined order):

- **Rotation** (if sequenced and facing change requested)
  - Generates heat = allocated energy to rotation subsystem
- **Movement** (if sequenced: coast or burn)
  - Automatic orbital movement (+1 sector)
  - Fuel scoop activation (if coasting) - generates heat = allocated energy
  - Burn initiation (if burning) - generates heat = allocated energy to engines
- **Weapon Firing** (each weapon fires at its sequence point)
  - Each fired weapon generates heat = allocated energy

**End of Turn**:

- Reset subsystem usage flags (prepare for next turn)
- All subsystems' "used this turn" flags are cleared

**After turn execution**:

- Active player switches to next player
- Next player's transfer is resolved (if arriving)

### Movement Validation

**Coast Requirements**:

- None (always valid)
- Fuel scoop requires: powered scoop subsystem, not used this turn, coasting

**Burn Requirements**:

- Sufficient reaction mass for burn intensity
- Sufficient allocated energy in engines for burn intensity
- Destination ring must be valid (1-5)

**Rotation Requirements**:

- Powered maneuvering thrusters subsystem (minimum 1 energy)
- Subsystem not already used this turn
- Target facing different from current facing

## Weapon Systems and Combat

### Weapon Types

Ships can be equipped with three types of weapons, each with distinct firing arcs and ranges:

**1. Broadside Laser**

- **Arc**: Broadside (perpendicular to ship's facing)
- **Ring Range**: ±1 ring
- **Sector Range**: ±2 sectors (on target's ring)
- **Damage**: 2 HP
- **Energy Required**: 2 units
- **Special**: Can engage multiple targets in a single firing

**2. Railgun**

- **Arc**: Spinal (fires in direction of ship's facing)
- **Ring Range**: Same ring only
- **Sector Range**: 6 sectors in facing direction
- **Damage**: 4 HP
- **Energy Required**: 4 units
- **Special**: Has recoil effect

**3. Missiles**

- **Arc**: Turret (360° coverage)
- **Ring Range**: ±2 rings
- **Sector Range**: ±3 sectors (on target's ring)
- **Damage**: 3 HP
- **Energy Required**: 2 units
- **Special**: Longest range, can hit targets in any direction

### Weapon Range Calculation

Weapon ranges are calculated based on the **ship's position at the moment of firing**:

**Pre-Movement Firing**:

- If a weapon fires before the movement action in the tactical sequence
- Range is calculated from the ship's **current position**
- Ship is at its starting ring and sector for the turn

**Post-Movement Firing**:

- If a weapon fires after the movement action in the tactical sequence
- Range is calculated from the ship's **post-movement position**
- Ship has moved **velocity sectors orbitally** on its ring (1-8 depending on ring)
- If the ship executed a burn, it has already transferred to the new ring

**Sector Projection for Cross-Ring Targeting**:

- When targeting a ship on a different ring, the attacker's sector is projected onto the target's ring
- This uses angular boundaries to determine which sectors on the target ring are within broadside or missile range
- Spinal weapons (railgun) can only target ships on the same ring

### Combat Mechanics

**Firing Requirements**:

- Weapon subsystem must have minimum energy allocated
- Weapon subsystem must not be "used" this turn
- Target must be within weapon's range (ring range AND sector range)
- Target must be within weapon's firing arc

**Damage Application**:

- Damage is applied to target's hit points
- If hit points reach 0, the ship is destroyed
- Shields (if powered) may mitigate damage (mechanics TBD)

**Multiple Weapon Firing**:

- A ship can fire multiple weapons in a single turn
- Each weapon fires at its designated sequence point
- Weapons can fire from different positions if sequenced around movement
- Each weapon can only fire once per turn

## Subsystem Configurations

All subsystems generate heat equal to their allocated energy **when used**.

### Engines

- Minimum energy: 1
- Maximum energy: 3
- Function: Ship propulsion and maneuvering
- Generates heat when burn is executed

### Maneuvering Thrusters (Rotation)

- Minimum energy: 1
- Maximum energy: 1
- Function: Change ship facing
- Generates heat when rotation is performed

### Fuel Scoop

- Minimum energy: 3
- Maximum energy: 3
- Function: Collect reaction mass while coasting
- Generates heat when scoop is activated

### Broadside Laser

- Minimum energy: 2
- Maximum energy: 4
- Damage: 2 HP
- Function: Multi-target broadside weapon
- Generates heat when fired

### Railgun

- Minimum energy: 4
- Maximum energy: 4
- Damage: 4 HP
- Function: High-damage spinal weapon
- Generates heat when fired
- Special: Has recoil effect

### Missiles

- Minimum energy: 2
- Maximum energy: 4
- Damage: 3 HP
- Function: Long-range turret weapon (launches self-propelled missile)
- Generates heat when launched

### Shields

- Minimum energy: 1
- Maximum energy: 4
- Function: Damage mitigation - converts incoming damage to heat
- **Special**: When hit, shields absorb damage up to their allocated energy (max 4)
  - Absorbed damage is converted to heat instead of hull damage
  - Remaining damage (if any) hits hull normally

---

_This document is a work in progress and will be updated as game mechanics are refined._
