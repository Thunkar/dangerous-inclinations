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
