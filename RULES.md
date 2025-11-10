# Orbit Simulator - Game Rules

This document contains the comprehensive rules for the Orbit Simulator game.

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
**Every turn, before any player actions**, the ship automatically moves:
- **1 sector forward** on its current ring (following orbital velocity)
- This happens for **both** coasting and burning
- Movement is always in the prograde direction (clockwise around the star)
- Cannot be prevented or modified (represents orbital momentum)

### Movement Actions (Mutually Exclusive)

Players must choose **one** movement action per turn:

#### 1. Coast
- Ship continues on current ring, moving 1 sector (automatic orbital movement)
- **No energy or mass cost**
- Allows use of fuel scoop (if equipped and powered)
- Can optionally change facing (requires powered rotation subsystem)

#### 2. Burn (Ring Transfer)
Initiates a transfer to a different ring. Three burn intensities available:

| Intensity | Energy Cost | Mass Cost | Ring Change | Subsystem Requirement |
|-----------|-------------|-----------|-------------|----------------------|
| **Light** | 1 energy    | 1 mass    | ±1 ring     | Engines: 1+ energy   |
| **Medium**| 2 energy    | 2 mass    | ±2 rings    | Engines: 2+ energy   |
| **Heavy** | 3 energy    | 3 mass    | ±3 rings    | Engines: 3+ energy   |

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

### Turn Sequence Summary

**When a player becomes active** (at the end of the previous player's turn):
- **Transfer Completion** (if arriving this turn)
  - Ship arrives at destination ring and sector
  - Transfer state is cleared
  - Player sees their ship in the correct position when their turn begins

**When a player executes their turn**, actions are processed in this order:

1. **Energy Allocation** (to subsystems)
2. **Energy Deallocation** (from subsystems, limited to 3 per turn)
3. **Heat Venting** (counts toward 3-unit limit)
4. **Rotation** (if facing change requested)
5. **Movement** (coast or burn)
   - Automatic orbital movement (+1 sector)
   - Fuel scoop activation (if coasting)
   - Burn initiation (if burning)
6. **Weapon Firing** (all simultaneous)
7. **Heat Damage** (from heat accumulated on PREVIOUS turns)
   - Damage is calculated from heat at the START of the turn
   - Heat vented this turn reduces the damage
8. **Heat Generation** (from overclocked subsystems THIS turn)
   - Heat generated this turn does NOT cause damage until next turn
9. **Reset Subsystem Usage** (prepare for next turn)
   - All subsystems' "used this turn" flags are cleared
   - Allows subsystems to be used again on the next turn

**After turn execution**:
- Active player switches to next player
- Next player's transfer is resolved (if arriving), so they see their ship in the correct position

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

*This document is a work in progress and will be updated as game mechanics are refined.*
