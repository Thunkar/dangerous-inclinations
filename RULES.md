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

### Energy Deallocation Constraints

- Returning power to the reactor can only be done at a rate of **3 units per turn**
- This is a global limit shared between:
  - Energy deallocation from subsystems
  - Heat venting operations
- Formula: `deallocated_energy + vented_heat ≤ 3` per turn
- **Deallocation is partial**: You can deallocate any amount up to the limit per turn
  - Example: A railgun with 5 energy can deallocate 3 on turn 1, then 2 on turn 2
  - Energy remains in the subsystem until explicitly deallocated

### Overclocking and Heat Generation

- Systems generate heat when powered **beyond their overclock threshold**
- Heat generation formula: `(allocated_energy - overclock_threshold) × heat_per_overclock`
- Example: Engines with 3 units of energy (overclock threshold: 2, heat rate: 1/unit)
  - Overclock amount: `3 - 2 = 1`
  - Heat generated per turn: `1 × 1 = 1 heat/turn`
- Heat accumulates and persists across turns until vented

### Heat and Damage

- Heat causes damage to the hull
- Damage is dealt for every turn the heat **remains on the ship** after the turn it was generated
- Heat on the turn it's first generated does NOT cause damage
- Heat in subsequent turns causes `1 damage per heat unit` per turn
- Heat must be explicitly vented to remove it

### Heat Venting

- Heat venting counts towards the global energy deallocation limit (3 per turn)
- Venting heat removes it from the ship, preventing further damage
- Strategic venting is necessary to manage heat from overclocked systems

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
  - Cannot deallocate more energy than the 3-unit limit allows
  - Cannot allocate more energy than the reactor has available
  - Cannot allocate more than a subsystem's maximum
  - Must respect the combined deallocation + venting limit
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

The game takes place in a 5-ring orbital system where all ships naturally orbit at the same angular velocity:

- **Ring 1**: 6 sectors (innermost, fastest-feeling)
- **Ring 2**: 12 sectors
- **Ring 3**: 24 sectors
- **Ring 4**: 48 sectors
- **Ring 5**: 96 sectors (outermost, slowest-feeling)

All rings have **velocity = 1**, meaning every ship moves **1 sector per turn** on their current ring. Inner rings have larger sectors (60° each on Ring 1) while outer rings have smaller sectors (3.75° each on Ring 5), creating the perception of different speeds despite uniform angular velocity.

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

- **1 sector forward** on its current ring (following orbital velocity)
- This happens for **both** coasting and burning
- Movement is always in the prograde direction (clockwise around the star)
- Cannot be prevented or modified (represents orbital momentum)

**Important**: When a ship executes a burn, the transfer is not instantaneous:

- The ship moves **1 sector orbitally** on its **current ring** during the burn turn
- The ship remains on its current ring for the duration of that turn
- The transfer to the destination ring completes at the **START of the next turn**
- Any actions during the burn turn (such as weapon firing) occur from the current ring position

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

Ships can transfer between gravity wells using elliptic Hohmann-like transfer orbits. This allows travel between the central Black Hole and the three orbiting Planets (Alpha, Beta, Gamma).

**Requirements**:
- Ship must be on the **outermost ring** of current gravity well:
  - Black Hole: Ring 4
  - Planets: Ring 3
- Ship must be at a **fixed transfer sector** (specific sectors for each planet)
- Engines must be **powered at level 3** (3+ energy allocated)

**Transfer Sectors** (Fixed):

| Planet | Outbound (BH→Planet) | Return (Planet→BH) |
|--------|---------------------|-------------------|
| **Alpha** | BH R4 S17 → Alpha R3 S7 | Alpha R3 S16 → BH R4 S6 |
| **Beta**  | BH R4 S1 → Beta R3 S7   | Beta R3 S16 → BH R4 S14 |
| **Gamma** | BH R4 S9 → Gamma R3 S7  | Gamma R3 S16 → BH R4 S22 |

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

### Sector Adjustment

During a burn, players can optionally adjust their destination sector by **±1 sector**:

- Calculated after the natural sector mapping
- Useful for fine-tuning arrival position
- Wraps around at ring boundaries (sector 0 wraps to max sector)
- Applied when transfer completes

### Sector Mapping on Transfer

When transferring between rings, sectors are mapped to preserve angular position:

**Adjacent Rings** (2× doubling relationship):

- Going outward: multiply by 2
  - R1 S3 → R2 S6
  - R2 S6 → R3 S12
- Going inward: divide by 2
  - R2 S6 → R1 S3
  - R3 S12 → R2 S6

**Non-Adjacent Rings**: Use angular fraction

- Formula: `(current_sector / current_ring_sectors) × destination_ring_sectors`
- Example: R1 S3 → R5 = (3/6) × 96 = S48

The mapping algorithm favors the **most prograde** (forward) sector when there's overlap, calculated by using the end boundary of the source sector.

### Reaction Mass Management

**Reaction Mass**:

- Required resource for executing burns
- Maximum capacity: **24 units**
- Starting amount: **10 units**
- Consumed when burn action is executed (not when energy is allocated)

**Fuel Scoop**:

- Can **only be activated during a coast action** (not while burning)
- Requires **Fuel Scoop subsystem** to be powered (minimum 1 energy)
- Subsystem becomes "used" for the turn
- Recovers reaction mass equal to the ring's velocity (**1 mass per turn**)
- Cannot exceed maximum capacity (24 units)
- Represents collecting material from the orbital environment

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

- **Transfer Completion** (if arriving this turn)
  - Ship arrives at destination ring and sector
  - Transfer state is cleared
  - Player begins their turn at the new position

**When a player executes their turn**, actions are processed in sequence order:

1. **Energy Allocation** (to subsystems)
2. **Energy Deallocation** (from subsystems, limited to 3 per turn)
3. **Heat Venting** (counts toward 3-unit limit)
4. **Tactical Sequence Execution** (actions execute in player-defined order):
   - **Rotation** (if sequenced and facing change requested)
   - **Movement** (if sequenced: coast or burn)
     - Automatic orbital movement (+1 sector)
     - Fuel scoop activation (if coasting)
     - Burn initiation (if burning)
   - **Weapon Firing** (each weapon fires at its sequence point)
5. **Heat Damage** (from heat accumulated on PREVIOUS turns)
   - Damage is calculated from heat at the START of the turn
   - Heat vented this turn reduces the damage
6. **Heat Generation** (from overclocked subsystems THIS turn)
   - Heat generated this turn does NOT cause damage until next turn
7. **Reset Subsystem Usage** (prepare for next turn)
   - All subsystems' "used this turn" flags are cleared
   - Allows subsystems to be used again on the next turn

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
- **Sector Range**: 1/4 of ring's total sectors (6 sectors on Ring 3)
- **Damage**: 4 HP
- **Energy Required**: 4 units
- **Special**: Has recoil effect, generates 1 heat when firing with 4 energy (overclock)

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
- Ship has moved **+1 sector orbitally** on its **current ring**
- **Important**: If the ship executed a burn, it is still on the original ring
  - The transfer to the destination ring completes at the START of the next turn
  - Weapons fire from the ship's position on the current ring after orbital movement

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

### Engines

- Minimum energy: 1
- Maximum energy: 2
- Overclock threshold: 2
- Heat per overclock: 1
- Function: Ship propulsion and maneuvering

### Maneuvering Thrusters (Rotation)

- Minimum energy: 1
- Maximum energy: 1
- Overclock threshold: 1
- Heat per overclock: 0 (cannot overclock)
- Function: Change ship facing

### Fuel Scoop

- Minimum energy: 1
- Maximum energy: 1
- Overclock threshold: 1
- Heat per overclock: 0 (cannot overclock)
- Function: Collect reaction mass while coasting

### Broadside Laser

- Minimum energy: 2
- Maximum energy: 2
- Overclock threshold: 2
- Heat per overclock: 0 (cannot overclock)
- Function: Multi-target weapon system

### Railgun

- Minimum energy: 4
- Maximum energy: 4
- Overclock threshold: 3
- Heat per overclock: 1
- Function: High-damage spinal weapon (generates heat when firing at 4 energy)
- Special: Has recoil effect

### Missiles

- Minimum energy: 2
- Maximum energy: 2
- Overclock threshold: 2
- Heat per overclock: 0 (cannot overclock)
- Function: Long-range turret weapon

### Shields

- Minimum energy: 2
- Maximum energy: 2
- Overclock threshold: 2
- Heat per overclock: 0 (cannot overclock)
- Function: Damage mitigation

---

_This document is a work in progress and will be updated as game mechanics are refined._
