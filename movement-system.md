# Orbital Combat: Movement System

## Overview

Players control ships orbiting within an 8-ring system around a black hole. Each ring has a **fixed stable velocity** determined by orbital mechanics. Players choose actions (COAST or BURN) to move between rings or maintain position. Burns take 1 turn to execute as the ship transfers through an elliptical orbit.

---

## The Eight Rings

| Ring | Velocity | Radius | Sectors | Sector Arc | Movement/Turn | Full Orbit |
|------|----------|--------|---------|------------|---------------|------------|
| 1 | 12 | 30mm | 24 | 7.9mm | 12 sectors (50%) | 2 turns |
| 2 | 10 | 43mm | 30 | 9.0mm | 10 sectors (33%) | 3 turns |
| 3 | 8 | 68mm | 32 | 13.4mm | 8 sectors (25%) | 4 turns |
| 4 | 6 | 100mm | 48 | 13.1mm | 6 sectors (12.5%) | 8 turns |
| 5 | 4 | 140mm | 56 | 15.7mm | 4 sectors (7%) | 14 turns |
| 6 | 3 | 172mm | 54 | 20.0mm | 3 sectors (6%) | 18 turns |
| 7 | 2 | 205mm | 58 | 22.2mm | 2 sectors (3%) | 29 turns |
| 8 | 1 | 235mm | 50 | 29.5mm | 1 sector (2%) | 50 turns |

### Key Properties

- **Stable velocity** increases toward the black hole (orbital mechanics: lower orbit = faster speed)
- **Sectors per ring** chosen so that velocity divides evenly (no ambiguous wrap-around)
- **Sector arc** ~8-30mm (all accommodate 10mm tokens with room)
- **All rings fit** on 500mm diameter board with margin

---

## Player Resources (Per Turn)

- **Energy pool:** 10 units per turn (allocated to systems, not consumed)
- **Reaction mass:** Starts at [TBD - recommend 8-12], max capacity 24
- **Energy recovery:** N/A (energy resets to 10 each turn)
- **Ship facing:** Prograde (default) or Retrograde (after rotation)

---

## Ship Systems

### Rotational Thrusters

**Function:** Flip ship 180° to change burn direction
- **Cost:** 1 energy (only when changing direction)
- **Effect:** Changes ship facing between prograde and retrograde
- **Usage:** Required before burning in a different direction than previous turn

**Sequence example:**
- Turn 1: BURN RETROGRADE → rotate (1E) + burn (1E+) = 2E+ total
- Turn 2: BURN RETROGRADE → no rotation needed, already facing retrograde (1E+)
- Turn 3: BURN PROGRADE → rotate (1E) + burn (1E+) = 2E+ total

### Fusion Torch Drive

**Function:** Propel ship to transfer orbit
- **Cost:** Energy + reaction mass (varies by burn intensity)
- **Effect:** Initiates ring transition (arrives next turn at destination)
- **Cannot execute:** If rotational thrusters didn't activate when needed (ship facing wrong way)

**Burn Intensities:**

| Intensity | Energy | Mass | Effect | Range |
|-----------|--------|------|--------|-------|
| Standard burn | 1 | 1 | Transfer 1 ring | Single adjacent ring |
| Hard burn | 2 | 2 | Transfer 2 rings | Skip intermediate ring |
| Extreme burn | 3 | 3 | Transfer 3 rings | Skip 2 intermediate rings |

**Example:**
- Standard burn: Ring 4 → Ring 3 (1 ring inward)
- Hard burn: Ring 4 → Ring 2 (skip Ring 3)
- Extreme burn: Ring 4 → Ring 1 (skip Rings 3 and 2)

**Constraints:**
- Cannot transfer beyond Ring 1 (innermost) or Ring 8 (outermost)
- Still takes 1 turn to transfer regardless of intensity
- Harder burns cost more energy AND reaction mass

### Fuel Scoop

**Function:** Harvest reaction mass from black hole radiation
- **Cost:** 5 energy (activation cost, flat)
- **Recovery:** Reaction mass = sectors moved this turn (automatic)
- **Efficiency:** Faster rings = more fuel per activation
- **Constraint:** Cannot activate while burning (engine systems are active)

---

## Burn Staging System (Elliptical Orbit Model)

### Core Mechanic

**When you BURN:**
- THIS TURN: You allocate the burn but remain in your current ring (enter transfer state)
- NEXT TURN: You ARRIVE at the destination ring (transfer resolves, cannot abort)
- The 1-turn delay models a simple elliptical orbit without complex calculations

### Action Types

**COAST**
- Energy cost: 0 (except for rotation if needed)
- Reaction mass cost: 0
- Effect: Stay in current ring at stable velocity
- Fuel scoop: Can be activated this turn (optional, costs 5E)
- Duration: Can sustain indefinitely

**BURN RETROGRADE (Soft)**
- Rotation cost: 1 energy (only if facing prograde)
- Engine cost: 1 energy
- Reaction mass cost: 1
- Effect: Initiate transfer to next inner ring (Ring N → Ring N-1)
- Transfer state: Will arrive next turn automatically
- Fuel scoop: Cannot activate while burning

**BURN RETROGRADE (Hard)**
- Rotation cost: 1 energy (only if facing prograde)
- Engine cost: 2 energy
- Reaction mass cost: 2
- Effect: Initiate transfer to inner ring 2 rings away (Ring N → Ring N-2)
- Transfer state: Will arrive next turn automatically (skipping intermediate)
- Fuel scoop: Cannot activate while burning

**BURN RETROGRADE (Extreme)**
- Rotation cost: 1 energy (only if facing prograde)
- Engine cost: 3 energy
- Reaction mass cost: 3
- Effect: Initiate transfer to inner ring 3 rings away (Ring N → Ring N-3)
- Transfer state: Will arrive next turn automatically (skipping 2 intermediates)
- Fuel scoop: Cannot activate while burning

**BURN PROGRADE (Soft)**
- Rotation cost: 1 energy (only if facing retrograde)
- Engine cost: 1 energy
- Reaction mass cost: 1
- Effect: Initiate transfer to next outer ring (Ring N → Ring N+1)
- Transfer state: Will arrive next turn automatically
- Fuel scoop: Cannot activate while burning

**BURN PROGRADE (Hard)**
- Rotation cost: 1 energy (only if facing retrograde)
- Engine cost: 2 energy
- Reaction mass cost: 2
- Effect: Initiate transfer to outer ring 2 rings away (Ring N → Ring N+2)
- Transfer state: Will arrive next turn automatically (skipping intermediate)
- Fuel scoop: Cannot activate while burning

**BURN PROGRADE (Extreme)**
- Rotation cost: 1 energy (only if facing retrograde)
- Engine cost: 3 energy
- Reaction mass cost: 3
- Effect: Initiate transfer to outer ring 3 rings away (Ring N → Ring N+3)
- Transfer state: Will arrive next turn automatically (skipping 2 intermediates)
- Fuel scoop: Cannot activate while burning

### Constraint: One Burn Per Turn

- Only 1 burn can be allocated per turn (soft, hard, or extreme)
- Prevents same-turn multi-ring jumps
- Forces sequential commitment to ring transitions
- Multi-ring retreats take multiple turns (visible to opponent)

---

## Fuel Scoop System

### Scoop Mechanics

**Activation Cost:** 5 energy (flat, one-time per turn)
**Recovery Formula:** Reaction mass recovered = sectors moved this turn
**Max Capacity:** 24 reaction mass

**When activated:**
- Costs 5 energy to activate
- Automatically recovers reaction mass equal to sectors moved
- Example: Move 12 sectors this turn → recover 12 mass
- Capped at max capacity (24)

**When NOT activated:**
- Costs 0 energy
- No reaction mass recovered

### Scoop Efficiency by Ring

| Ring | Velocity | Sectors/Turn | With Scoop Active |
|------|----------|--------------|-------------------|
| 1 | 12 | 12 | +12 mass (5E cost) |
| 2 | 10 | 10 | +10 mass (5E cost) |
| 3 | 8 | 8 | +8 mass (5E cost) |
| 4 | 6 | 6 | +6 mass (5E cost) |
| 5 | 4 | 4 | +4 mass (5E cost) |
| 6 | 3 | 3 | +3 mass (5E cost) |
| 7 | 2 | 2 | +2 mass (5E cost) |
| 8 | 1 | 1 | +1 mass (5E cost) |

**Key insight:** Faster rings provide better scoop returns for the same 5E cost.

### Strategic Implications

- **Inner rings (1-2):** Fast movement = lots of fuel recovery (12-10 mass)
- **Mid rings (4-5):** Balanced recovery (6-4 mass)
- **Outer rings (7-8):** Slow movement = minimal recovery (2-1 mass)
- **Trade-off:** Activating scoop costs 5E that could be spent on weapons/defense

---

## Power Allocation System

Each turn, player allocates 10 energy units among systems:

```
Total energy available: 10 units
Allocation options (examples):

AGGRESSIVE PURSUIT (hard burn + direction change):
- Rotation Thrusters: 1 (flip if needed)
- Engines: 2 (hard burn - skip rings!)
- Fuel Scoop: 0 (skip recovery)
- Weapons: 6
- Defense: 1
→ Rotate, hard burn to skip rings, attack hard, accept fuel loss

DESPERATE ESCAPE (extreme burn):
- Rotation Thrusters: 1 (flip if needed)
- Engines: 3 (extreme burn - maximum distance!)
- Fuel Scoop: 0
- Weapons: 2
- Defense: 4
→ Last-ditch 3-ring escape attempt

DEFENSIVE RECOVERY:
- Rotation Thrusters: 0 (maintain current facing)
- Engines: 0 (coast only)
- Fuel Scoop: 5 (activate scoop)
- Weapons: 3
- Defense: 2
→ No rotation needed, restore reaction mass, reduce threat

BALANCED OPERATION:
- Rotation Thrusters: 1 (rotate if changing direction)
- Engines: 1 (standard burn for positioning)
- Fuel Scoop: 5 (activate scoop)
- Weapons: 2
- Defense: 1
→ Maintain fuel, modest combat capability, single-ring moves
```

---

## Turn Resolution (6 Phases)

### Phase 1: Power Allocation

Player allocates 10 energy units among systems:
- Rotation Thrusters (enables direction change)
- Engines (enables burns; intensity determines cost)
- Fuel Scoop (generates reaction mass)
- Weapons [TBD]
- Defense [TBD]
- [Other systems TBD]

### Phase 2: Transfer Resolution

If ship is in transfer state from previous turn:
- Ship ARRIVES at destination ring
- Transfer state cleared (ship now stable in new ring)
- Ring change takes effect
- Cannot be cancelled or reversed

### Phase 3: Orientation & Action Execution

If burning and ship is not facing correct direction:
- Spend 1 energy on Rotation Thrusters to flip 180°
- Update ship facing (prograde ↔ retrograde)

Then choose action based on power allocated to Engines:
- If Engines power ≥ 1: Can choose SOFT burn (1E, 1M) - transfer 1 ring
- If Engines power ≥ 2: Can choose SOFT or HARD burn (2E, 2M) - transfer 2 rings
- If Engines power ≥ 3: Can choose SOFT, HARD, or EXTREME burn (3E, 3M) - transfer 3 rings
- If Engines power = 0: Must COAST

### Phase 4: Fuel Scoop (if activated)

If Fuel Scoop power allocated AND not burning:
- Scoop activation uses 5 energy
- Gain reaction mass = sectors moved this turn
- Recovery capped at max capacity (24)

### Phase 5: Sector Movement

Move around current ring by velocity:

```
new_sector = (current_sector + velocity) mod ring.sectors
```

- If coasting or stable: Move by current ring's velocity
- If arrived from transfer this turn: Move by new ring's velocity
- If burned (but haven't arrived yet): Move by current ring's velocity

### Phase 6: Other Actions

Weapons fire, defense activation, etc. [TBD]

---

## Examples

### Example 1: Hard Burn (Multi-Ring Jump)

**Setup:**
- You: Ring 5, facing Retrograde (from last turn)
- Want to: Hard burn retrograde (escape to Ring 3, skip Ring 4)
- Energy available: 10

**Power allocation:**
- Rotation Thrusters: 0 (already facing retrograde)
- Engines: 2 (hard burn)
- Fuel Scoop: 0
- Weapons: 5
- Defense: 3

**Turn execution:**
- Phase 1: Allocate power (as above)
- Phase 2: No pending transfer
- Phase 3: No rotation needed (already facing retrograde)
  - Spend 2E on Engines → HARD BURN RETROGRADE (transfer 2 rings)
  - Spend 2 reaction mass
  - Destination: Ring 3 (skipped Ring 4!)
- Phase 4: Scoop not activated (burning prevents scoop)
- Phase 5: Movement: Still in Ring 5 → move 4 sectors
- Result: In transfer to Ring 3, Reaction mass -2

**Energy used:** 2E (engines) = 8E remaining
**Reaction mass used:** 2 (one burn)
**Effect:** Dramatic 2-ring escape in 1 turn (risky, expensive)

---

### Example 2: Extreme Burn (Last Resort Escape)

**Setup:**
- You: Ring 3, in danger, need maximum distance
- Want to: Extreme burn prograde (escape 3 rings to Ring 6)
- Energy available: 10

**Power allocation:**
- Rotation Thrusters: 1 (rotate to prograde)
- Engines: 3 (extreme burn - max distance!)
- Fuel Scoop: 0
- Weapons: 2
- Defense: 4

**Turn execution:**
- Phase 1: Allocate power (as above)
- Phase 2: No pending transfer
- Phase 3: Rotate to prograde (1E), then extreme burn
  - Spend 1E on Rotation → flip to Prograde
  - Spend 3E on Engines → EXTREME BURN PROGRADE (transfer 3 rings!)
  - Spend 3 reaction mass
  - Destination: Ring 6 (skip Rings 4 and 5!)
- Phase 4: Scoop not activated (burning prevents scoop)
- Phase 5: Movement: Still in Ring 3 → move 8 sectors
- Result: In transfer to Ring 6, Reaction mass -3

**Energy used:** 1 + 3 = 4E (7E remaining)
**Reaction mass used:** 3 (one extreme burn)
**Effect:** Maximum 3-ring escape, ends up in slow Ring 6 (safe but sluggish)

---

### Example 3: Sequential Burn Intensity Advantage

**Setup:**
- You: Ring 4, facing Prograde
- Opponent: Ring 4, ahead of you
- Opponent is escaping inward

**Turn 1 - Opponent moves first:**
- Opponent allocates: Rotation 1, Engines 2, Fuel Scoop 0, Weapons 4, Defense 3
- Opponent rotates to retrograde, hard burns to Ring 2
- Opponent commits to 2-ring escape

**You see opponent:**
- Spending 1E on rotation (changing direction)
- Spending 2E on engines (HARD BURN - multi-ring!)
- Not scooping (not recovering fuel)

**Turn 1 - You move second:**
- Decision: Chase with hard burn too?
- You're Prograde facing, can burn prograde without rotating
- Allocate: Rotation 0, Engines 2, Fuel Scoop 0, Weapons 5, Defense 3
- Execute: Hard burn prograde to Ring 6 (opposite direction!)
- Result: You escape outward while opponent escapes inward

**Outcome:** Both made dramatic 2-ring jumps, but in opposite directions (escape vs. pursuit)

---

## Gameplay Implications

### Burn Intensity Creates Strategic Options

- **Soft (1E, 1M):** Conservative, single-ring positioning
- **Hard (2E, 2M):** Aggressive, skip intermediate ring
- **Extreme (3E, 3M):** Desperate, maximum distance (risky)

### Ship Facing Matters

Ships must face the correct direction to burn:
- **Prograde facing:** Can only burn prograde (escape outward)
- **Retrograde facing:** Can only burn retrograde (fall inward)
- **Changing direction:** Costs 1E via Rotation Thrusters (extra commitment)

This creates:
- Commitment to direction (turning around costs energy)
- Strategic planning (set yourself up for next burn)
- Sequential visibility (opponent sees if you're rotating)

### Sequential Turn Advantage

1. Opponent reveals power allocation (see their rotation/engine commitment)
2. You see burn intensity (soft/hard/extreme)
3. You see if they're scooping (5E scoop cost reduces other systems)
4. You see if they're changing direction (rotation cost visible)
5. Decide your response based on their visible choice

### Resource Attrition

- Conservative (soft burns): 1E + 1 mass per burn
- Aggressive (hard burns): 2E + 2 mass per turn
- Desperate (extreme burns): 3E + 3 mass per turn + rotation if changing
- Fuel recovery: 5E but can net 1-12 mass depending on ring
- Fuel starvation: Running out of mass = stuck in current ring (can't burn)

### Ring Selection Strategy

- **Inner rings (1-2):** Fast (33-50% movement), dangerous, but excellent fuel efficiency (+12, +10 mass)
- **Mid rings (4-5):** Balanced (6-4 movement), moderate fuel (+6, +4 mass)
- **Outer rings (7-8):** Slow (3-2% movement), safe, but poor fuel (+2, +1 mass)

**Trade-off:** Inner rings risky but fuel-rich. Outer rings safe but require careful fuel management.

### Power Allocation Tension

Every energy point is contested:
- Rotate (1E): Needed to change direction
- Soft burn (1E): Single-ring positioning
- Hard burn (2E): Multi-ring escape or pursuit
- Extreme burn (3E): Desperate last-resort maneuver
- Scoop (5E): Recovers mass but blocks weapons/defense power
- Weapons/Defense: Competes with all mobility and fuel systems

**Sequential visibility:** Opponent sees your choices and can exploit weakness.

---

## Cost Matrix

| Maneuver | Energy | Mass | Turns | Notes |
|----------|--------|------|-------|-------|
| Coast (same direction) | 0 | 0 | 1 | No rotation needed |
| Coast + scoop active | 5 | 0 | 1 | Recovery varies by ring |
| Coast + change direction | 1 | 0 | 1 | Rotation only, no burn |
| Soft burn (same direction) | 1 | 1 | 2 | Single ring transfer |
| Soft burn (change direction) | 2 | 1 | 2 | Rotation + soft engine |
| Hard burn (same direction) | 2 | 2 | 2 | Skip 1 intermediate ring |
| Hard burn (change direction) | 3 | 2 | 2 | Rotation + hard engine |
| Extreme burn (same direction) | 3 | 3 | 2 | Skip 2 intermediate rings |
| Extreme burn (change direction) | 4 | 3 | 2 | Rotation + extreme engine |
| Escape 3 rings (soft chain) | 3 | 3 | 3 | Three soft burns |
| Escape 4 rings (mixed chain) | 2+3 | 2+3 | 2 | Hard + soft burns |

---

## Board Layout

### Drawing the Board

1. **Center:** Mark black hole center point
2. **Concentric circles** at these radii:
   - Ring 1: 30mm
   - Ring 2: 43mm
   - Ring 3: 68mm
   - Ring 4: 100mm
   - Ring 5: 140mm
   - Ring 6: 172mm
   - Ring 7: 205mm
   - Ring 8: 235mm

3. **Sector divisions:** Draw radial lines from center to divide each ring into equal sectors
   - Ring 1: 24 sectors
   - Ring 2: 30 sectors
   - Ring 3: 32 sectors
   - Ring 4: 48 sectors
   - Ring 5: 56 sectors
   - Ring 6: 54 sectors
   - Ring 7: 58 sectors
   - Ring 8: 50 sectors

4. **Labeling:**
   - Number sectors 1, 2, 3... clockwise within each ring
   - Label velocity outside each ring
   - Mark ring number on ring itself

### Sector Arc Consistency

All sector arcs range from 7.9mm to 29.5mm, allowing 10mm tokens to fit comfortably in every sector with clear positioning.

---

## Core Mechanics Summary

### Burn Staging with Intensity
- Burn this turn → transfer state → arrive NEXT turn
- Soft (1E, 1M), Hard (2E, 2M), or Extreme (3E, 3M)
- Harder burns skip intermediate rings
- Still takes 1 turn to transfer regardless of intensity

### Ship Facing & Rotation
- Ships face either Prograde or Retrograde
- Rotating costs 1 energy when changing direction
- Facing persists until rotated again
- Sequential advantage: opponent sees rotation costs

### No Same-Turn Chaining
- Only 1 burn per turn (at any intensity)
- Multi-ring jumps take multiple turns or hard/extreme burns
- Each burn is visible to opponent

### Scoop-Based Fuel Recovery
- 5 energy to activate scoop (flat cost)
- Recovery = sectors moved this turn (automatic)
- Faster rings = more fuel per activation
- Trade-off: 5E for scoop vs weapons/defense

### Sequential Advantage
- See opponent's power allocation before responding
- Know burn intensity (soft/hard/extreme)
- Know if they're rotating, burning, or scooping
- Decide your response based on their visible commitment

### Resource Limits
- Energy: 10 per turn, resets (no spillover)
- Reaction mass: depletes with burns, recovers via scoop, max 24
- Fuel starvation: run out of mass = stuck in current ring

---

## Not Yet Defined

- Starting reaction mass pool (recommend 8-12)
- Weapon systems and combat mechanics
- Proximity/collision mechanics
- Damage and hit resolution
- Starting positions and game setup
- Win/loss conditions
- Special abilities or maneuvers

---

## Design Notes

### Why Burn Intensity?

Soft/hard/extreme burns create tactical choices:
- Conservative single-ring moves (positioning)
- Aggressive multi-ring skips (escape or pursuit)
- Desperate last-resort extreme burns (high risk, high cost)

All take 1 turn (same speed) but cost different resources. Creates risk/reward.

### Why Burn Staging?

Simulates elliptical orbits simply: burning at periapsis pushes you to apoapsis (takes 1 turn to transit), requiring commitment. Players can't instantly pop between rings, creating visible commitment, tactical interdiction opportunities, and resource tradeoffs.

### Why 8 Rings?

Provides strategic variety without overcrowding. Each ring has distinct tactical character based on velocity, space, and fuel scoop efficiency.

### Why Rotational Thrusters Cost 1E?

Small cost but meaningful. Encourages committing to a direction rather than constantly flipping. Maintains energy tension and sequential visibility.

### Why Scoop Costs 5E?

Significant energy commitment (50% of available pool) forces real trade-offs. Prevents constant fuel recovery, making fuel starvation a legitimate threat.

### Why Recovery = Sectors Moved?

Simple rule easy to remember and track. Faster rings naturally provide better scoop returns, creating reward for risky inner-ring play. Slower outer rings require more careful fuel management.

### Why One Burn Per Turn?

Prevents instant multi-ring jumps (unrealistic) while allowing tactical chains (realistic). Forces temporal commitment: opponent sees your burn direction/intensity, has 1 turn before you arrive.