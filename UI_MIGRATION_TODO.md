# UI Migration TODO - Fix Visual Data Usage

## Summary

The UI build is currently broken because many files are still trying to access visual properties that have been removed from the engine. These properties now live in [`ui/src/constants/visualConfig.ts`](ui/src/constants/visualConfig.ts).

## Errors to Fix

### 1. Import Fixes (16 errors)

Some files still have old relative imports that need to be updated:

```bash
# Files with old imports:
src/components/GameBoard/components/GravityWell.tsx:1
  - from '../../../types/game'
  + from '@dangerous-inclinations/engine'

src/components/GameBoard/components/Minimap.tsx:2
  - from '../../../types/game'
  + from '@dangerous-inclinations/engine'

# And 14 more similar cases...
```

### 2. Visual Property Access (25+ errors)

Files accessing removed properties (`radius`, `color`) need to use `visualConfig` instead:

#### Example Fix Pattern:

**Before** (accessing engine data directly):

```typescript
import { getGravityWell } from "@dangerous-inclinations/engine";

const well = getGravityWell("blackhole");
const color = well.color; // ❌ ERROR: Property 'color' does not exist
const ring = well.rings[0];
const radius = ring.radius; // ❌ ERROR: Property 'radius' does not exist
```

**After** (separate game logic from visual data):

```typescript
import { getGravityWell } from "@dangerous-inclinations/engine";
import { getGravityWellVisual, getRingRadius } from "@/constants/visualConfig";

const well = getGravityWell("blackhole");
const wellVisual = getGravityWellVisual(well.id);
const color = wellVisual.color; // ✅ '#18181B'

const ring = well.rings[0]; // Game logic: ring number, velocity, sectors
const radius = getRingRadius(well.id, ring.ring); // ✅ Visual data: 125
```

### 3. Files Needing Updates

**High Priority** (blocking build):

1. **`components/DeploymentBoard.tsx`** (2 errors)
   - Lines 52, 185: `ring.radius` → use `getRingRadius()`

2. **`components/GameBoard.tsx`** (1 error)
   - Line 147: `well.color` → use `getGravityWellVisual()`

3. **`components/GameBoard/components/DeploymentSectors.tsx`** (1 error)
   - Line 28: `ring.radius` → use `getRingRadius()`

4. **`components/GameBoard/components/GravityWell.tsx`** (5 errors)
   - Lines 42, 48, 54, 60: `well.color` → use `getGravityWellVisual()`
   - Line 1: Fix import

5. **`components/GameBoard/components/Minimap.tsx`** (3 errors)
   - Line 58: `well.radius` → use `getGravityWellVisual().radius`
   - Line 59: `well.color` → use `getGravityWellVisual().color`
   - Line 64: `ring.radius` → use `getRingRadius()`
   - Line 2: Fix import

6. **`components/GameBoard/components/MissileRenderer.tsx`** (2 errors)
   - Access to `radius` for ring positioning

7. **`components/GameBoard/components/ShipRenderer.tsx`** (3 errors)
   - Access to `radius` for ship positioning

8. **`components/GameBoard/components/TransferSectors.tsx`** (1 error)
   - Access to `radius` for transfer sector rendering

9. **`components/GameBoard/components/WeaponRangeIndicators.tsx`** (1 error)
   - Access to `radius` for range circles

10. **`components/GameBoard/context/BoardContext.tsx`** (3 errors)
    - Access to `radius` and `color` for display state

## Quick Fix Script

For the import fixes, run:

```bash
cd ui/src
# Fix remaining old imports
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i "s|from '\.\./\.\./\.\./types/game'|from '@dangerous-inclinations/engine'|g"
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i "s|from '\.\./\.\./types/game'|from '@dangerous-inclinations/engine'|g"
```

## Manual Fixes Required

The visual property access must be fixed manually in each file. Here's the pattern:

### Pattern 1: Well Color/Radius

```typescript
// Add import at top of file
import { getGravityWellVisual } from '@/constants/visualConfig'

// Replace direct access
- const color = well.color
- const radius = well.radius
+ const wellVisual = getGravityWellVisual(well.id)
+ const color = wellVisual?.color ?? '#FFFFFF'
+ const radius = wellVisual?.radius ?? 50
```

### Pattern 2: Ring Radius

```typescript
// Add import at top of file
import { getRingRadius } from '@/constants/visualConfig'

// Replace direct access
- const radius = ring.radius
+ const radius = getRingRadius(wellId, ring.ring) ?? 100
```

### Pattern 3: Planet Angle/Distance

```typescript
// Add import at top of file
import { getGravityWellVisual } from "@/constants/visualConfig";

// For planet positioning
const wellVisual = getGravityWellVisual(planetId);
const angle = wellVisual?.angle ?? 0;
const distance = wellVisual?.distance ?? 645;
```

## Testing After Fixes

```bash
# From project root
cd ui
yarn build

# Should show 0 errors related to missing properties
```

## Notes

- The engine now contains **only game logic** (no visual data)
- All visual/rendering data is in [`ui/src/constants/visualConfig.ts`](ui/src/constants/visualConfig.ts)
- TypeScript will catch any remaining direct access to removed properties
- The TS7006 errors (implicit 'any') can be fixed separately (type annotations needed)

## Example: Complete File Fix

**Before:**

```typescript
import { getGravityWell } from '@dangerous-inclinations/engine'

export function MyComponent({ wellId }: Props) {
  const well = getGravityWell(wellId)
  const ring = well.rings[0]

  return (
    <circle
      cx={0}
      cy={0}
      r={ring.radius}        // ❌ ERROR
      fill={well.color}      // ❌ ERROR
    />
  )
}
```

**After:**

```typescript
import { getGravityWell } from '@dangerous-inclinations/engine'
import { getGravityWellVisual, getRingRadius } from '@/constants/visualConfig'

export function MyComponent({ wellId }: Props) {
  const well = getGravityWell(wellId)
  const wellVisual = getGravityWellVisual(well.id)
  const ring = well.rings[0]
  const radius = getRingRadius(well.id, ring.ring)

  return (
    <circle
      cx={0}
      cy={0}
      r={radius ?? 100}           // ✅ From visualConfig
      fill={wellVisual?.color ?? '#FFF'}  // ✅ From visualConfig
    />
  )
}
```

## Priority

1. Fix import errors (quick, automated)
2. Fix visual property access in GameBoard components (highest impact)
3. Fix visual property access in other components
4. Fix type annotation errors (TS7006) - lower priority
