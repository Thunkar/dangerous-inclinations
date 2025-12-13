# Visual Data Separation - Completed

## Summary

Successfully separated visual-only data from the game engine, moving it to the UI layer. The engine now contains **only** game logic data, while all rendering/visual information lives in the UI package.

## What Was Changed

### ✅ Engine (`@dangerous-inclinations/engine`)

**Removed visual-only fields:**

1. **`RingConfig` interface** - Removed `radius` field
   - ✅ Kept: `ring`, `velocity`, `sectors` (game logic)
   - ❌ Removed: `radius` (visual only)

2. **`OrbitalPosition` interface** - Removed `angle` and `distance` fields
   - ✅ Kept: `velocity` (game logic for potential planet drift)
   - ❌ Removed: `angle`, `distance` (visual positioning only)

3. **`GravityWell` interface** - Removed `color` and `radius` fields
   - ✅ Kept: `id`, `name`, `type`, `rings`, `orbitalPosition` (game logic)
   - ❌ Removed: `color`, `radius` (visual styling only)

**Files Modified:**

- [`engine/src/types/game.ts`](engine/src/types/game.ts)
  - Updated `RingConfig` to remove `radius`
  - Updated `OrbitalPosition` to remove `angle` and `distance`
  - Updated `GravityWell` to remove `color` and `radius`

- [`engine/src/constants/gravityWells.ts`](engine/src/constants/gravityWells.ts)
  - Removed all visual data from ring configurations
  - Removed all visual data from gravity well definitions
  - Simplified planet definitions (no angle, distance, color, radius)

- [`engine/src/utils/transferPoints.ts`](engine/src/utils/transferPoints.ts)
  - Updated `advancePlanetaryOrbits()` to be a no-op (planets are static, transfer sectors are hardcoded)
  - Removed angle-based calculations since angle is no longer in the type

- [`engine/src/game/validation.ts`](engine/src/game/validation.ts)
  - Fixed weapon validation to use `getSubsystemConfig()` instead of non-existent `WEAPONS` constant
  - Uses `subsystemConfig.minEnergy` for energy requirements instead of `weaponConfig.energyCost`

### ✅ UI (`@dangerous-inclinations/ui`)

**Added new visual configuration file:**

- [`ui/src/constants/visualConfig.ts`](ui/src/constants/visualConfig.ts) - **NEW FILE**
  - `RingVisualConfig` interface - ring rendering data
  - `GravityWellVisualConfig` interface - well rendering data
  - `BLACKHOLE_RING_VISUALS` - visual radii for black hole rings
  - `PLANET_RING_VISUALS` - visual radii for planet rings
  - `BLACK_HOLE_VISUAL` - black hole color and size
  - `PLANET_VISUALS` - all planet visuals (angles, distances, colors, sizes)
  - Helper functions: `getGravityWellVisual()`, `getRingVisuals()`, `getRingRadius()`

## How to Use

### In the Engine (Game Logic)

```typescript
import {
  GRAVITY_WELLS,
  getRingConfigForWell,
} from "@dangerous-inclinations/engine";

// Get game logic data
const blackHole = GRAVITY_WELLS[0];
console.log(blackHole.rings); // [{ ring: 1, velocity: 8, sectors: 24 }, ...]

// No visual data available - that's in the UI!
// ❌ blackHole.color - doesn't exist
// ❌ blackHole.rings[0].radius - doesn't exist
```

### In the UI (Rendering)

```typescript
import { GRAVITY_WELLS } from "@dangerous-inclinations/engine";
import { getGravityWellVisual, getRingRadius } from "@/constants/visualConfig";

// Get game logic data from engine
const blackHole = GRAVITY_WELLS[0];

// Get visual data from UI config
const visual = getGravityWellVisual(blackHole.id);
console.log(visual.color); // '#18181B'
console.log(visual.radius); // 50

// Get ring visual radius
const ringRadius = getRingRadius(blackHole.id, 1);
console.log(ringRadius); // 125

// Combine for rendering
const ring = blackHole.rings[0];
console.log(
  `Ring ${ring.ring}: velocity=${ring.velocity}, sectors=${ring.sectors}, radius=${ringRadius}px`,
);
```

## Why This Separation?

### ✅ Benefits

1. **Clean Architecture**
   - Engine = pure game logic, no visual concerns
   - UI = rendering only, pulls logic from engine + adds visual layer

2. **Server-Side Ready**
   - Engine can run on server without any visual data
   - Server doesn't need colors, radii, or positions - only game state

3. **Flexibility**
   - UI can change visual styling without touching engine
   - Different UIs can use different visual configs (mobile vs desktop, themes, etc.)
   - Engine remains stable and testable

4. **Type Safety**
   - Clear separation prevents accidentally using visual data in game logic
   - Engine types don't include visual fields, so accidental usage causes compile errors

### ❌ What's NOT in the Engine Anymore

Visual-only data removed from engine:

- **Colors** - All well/planet colors (`#3B82F6`, etc.)
- **Rendering Radii** - Ring radii for drawing circles (125px, 185px, etc.)
- **Angles** - Planet positions in degrees (0°, 60°, 120°, etc.)
- **Distances** - Planet distances from black hole (645 units)
- **Visual Sizes** - Planet/black hole body radii for rendering

### ✅ What's STILL in the Engine

Game logic data kept in engine:

- **Ring Numbers** - Which ring (1-5 for blackhole, 1-3 for planets)
- **Velocities** - Movement speed in sectors per turn (8, 6, 4, 2, 1)
- **Sector Counts** - Number of sectors per ring (24 for all rings)
- **Well IDs** - Unique identifiers ('blackhole', 'planet-alpha', etc.)
- **Well Names** - Human-readable names ('Black Hole', 'Alpha', etc.)
- **Well Types** - 'blackhole' or 'planet'
- **Transfer Sectors** - Fixed sector numbers for well transfers (hardcoded in transferPoints.ts)
- **Orbital Velocity** - Planet movement speed (0 for static positions)

## Implementation Notes

### Transfer Points Are Hardcoded

Transfer sectors are **completely fixed** and hardcoded in `transferPoints.ts`:

```typescript
const FIXED_TRANSFER_SECTORS = {
  "planet-alpha": {
    outbound: { bhSector: 20, planetSector: 5 },
    return: { planetSector: 18, bhSector: 3 },
  },
  // ... etc
};
```

This means:

- ✅ No angle calculation needed (transfer sectors don't depend on planet positions)
- ✅ Planet angles are purely visual (UI can position planets anywhere for rendering)
- ✅ Game logic uses fixed sector numbers only

### Planets Are Static

All planets have `velocity: 0`, meaning:

- ✅ No planetary movement in game logic
- ✅ Transfer sectors never change
- ✅ `advancePlanetaryOrbits()` is a no-op placeholder
- ✅ Simplifies tabletop gameplay (fixed transfer chart)

### Visual Config is Separate Per Well

The UI maintains separate visual configs for each planet:

```typescript
export const PLANET_VISUALS: Record<GravityWellId, GravityWellVisualConfig> = {
  "planet-alpha": { angle: 0, distance: 645, color: "#3B82F6", radius: 40 },
  "planet-beta": { angle: 60, distance: 645, color: "#EF4444", radius: 35 },
  // ... etc
};
```

This allows:

- Different colors per planet (for visual distinction)
- Different sizes per planet (Alpha is slightly larger)
- Consistent positioning (all at 645 distance, 60° apart)

## Testing

Engine builds successfully:

```bash
cd engine && yarn build
# ✓ No errors
# ✓ Types are correct
# ✓ No visual data in compiled output
```

## Migration Checklist

If you're updating UI code that previously used engine visual data:

- [ ] Replace `well.color` → `getGravityWellVisual(well.id).color`
- [ ] Replace `well.radius` → `getGravityWellVisual(well.id).radius`
- [ ] Replace `ring.radius` → `getRingRadius(well.id, ring.ring)`
- [ ] Replace `well.orbitalPosition.angle` → `getGravityWellVisual(well.id).angle`
- [ ] Replace `well.orbitalPosition.distance` → `getGravityWellVisual(well.id).distance`

## Future Considerations

### Multiple Visual Themes

With this separation, you can easily add multiple visual themes:

```typescript
// ui/src/constants/themes/dark.ts
export const DARK_THEME_VISUALS = {
  /* ... */
};

// ui/src/constants/themes/light.ts
export const LIGHT_THEME_VISUALS = {
  /* ... */
};

// Switch themes without touching engine
```

### Mobile vs Desktop

Different screen sizes can use different radii:

```typescript
const isMobile = window.innerWidth < 768;
const ringVisuals = isMobile ? MOBILE_RING_VISUALS : DESKTOP_RING_VISUALS;
```

### Custom Board Layouts

UI can experiment with different layouts (hex grid, square grid, etc.) without changing engine:

```typescript
// Game logic stays the same (sectors, velocities, transfers)
// Only visual positioning changes
export const HEX_GRID_VISUALS = {
  /* ... */
};
```

## Summary

✅ **Engine** = Pure game logic (rings, velocities, sectors, transfers)
✅ **UI** = Visual layer (colors, radii, angles, distances)
✅ **Clean separation** = Server-ready, flexible, type-safe

The engine is now completely free of visual concerns and ready for server-side multiplayer! 🎉
