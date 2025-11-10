# Testing Documentation

## Overview

This project uses Vitest for unit testing with a focus on testing pure game logic functions separate from React components. The test suite achieves **99.2% code coverage** across critical game mechanics.

## Test Statistics

- **112 passing tests** across 4 test suites
- **99.2% statement coverage**
- **97.14% branch coverage**
- **100% function coverage**

## Running Tests

```bash
# Run tests in watch mode (interactive)
npm test

# Run tests once
npm test -- --run

# Run tests with coverage report
npm run test:coverage

# Open coverage UI
npm run test:ui
```

## Test Structure

### Test Suites

1. **Movement System** ([game-logic/__tests__/movement.test.ts](src/game-logic/__tests__/movement.test.ts)) - 31 tests
   - Orbital movement and sector wraparound
   - Burn initiation (light, medium, heavy)
   - Transfer completion and sector mapping
   - Rotation mechanics
   - Validation for burns and rotation

2. **Energy Management** ([game-logic/__tests__/energy.test.ts](src/game-logic/__tests__/energy.test.ts)) - 28 tests
   - Energy allocation and deallocation
   - Energy return from subsystems to reactor
   - Max return rate and reactor capacity
   - Interaction with heat venting
   - Subsystem power management

3. **Heat Management** ([game-logic/__tests__/heat.test.ts](src/game-logic/__tests__/heat.test.ts)) - 24 tests
   - Heat generation from overclocked systems
   - Heat venting via radiator
   - Heat damage calculation
   - Critical heat level detection

4. **Sector Mapping** ([game-logic/__tests__/sectorMapping.test.ts](src/game-logic/__tests__/sectorMapping.test.ts)) - 29 tests
   - Adjacent ring transfers (e.g., R1→R2, R2→R3)
   - Reverse transfers (e.g., R2→R1)
   - Non-adjacent transfers (e.g., R1→R5)
   - "Most prograde" sector selection
   - Angular position preservation
   - Ring configuration validation

## Architecture

### Pure Game Logic

All game logic has been refactored into pure functions in [src/game-logic/](src/game-logic/):

- **[movement.ts](src/game-logic/movement.ts)** - Movement, transfers, and rotation
- **[energy.ts](src/game-logic/energy.ts)** - Energy allocation and management
- **[heat.ts](src/game-logic/heat.ts)** - Heat generation and venting

These modules:
- Take state as input
- Return new state (immutable updates)
- Have no side effects
- Are independent of React

### Test Fixtures

Reusable test data builders in [src/test-fixtures/](src/test-fixtures/):

- **[ships.ts](src/test-fixtures/ships.ts)** - Ship state builders (e.g., `createTestShip()`, `createShipWithEngines()`)
- **[players.ts](src/test-fixtures/players.ts)** - Player builders
- **[actions.ts](src/test-fixtures/actions.ts)** - Action builders (e.g., `createBurnAction()`)

### Test Helpers

Assertion helpers in [src/test-helpers/](src/test-helpers/):

- **[assertions.ts](src/test-helpers/assertions.ts)** - Custom assertions (e.g., `assertShipPosition()`, `assertHeatState()`)

## Example Tests

### Movement Test
```typescript
it('should initiate light prograde burn', () => {
  const ship = createShipWithEngines(1)
  const action = createBurnAction('light', 'prograde', 0)

  const result = initiateBurn(ship, action)

  assertReactionMass(result, 9) // 10 - 1
  assertInTransfer(result, 4, 0) // Ring 3 + 1
})
```

### Energy Test
```typescript
it('should respect max return rate', () => {
  const ship = createTestShip()
  ship.reactor.energyToReturn = 8
  ship.reactor.availableEnergy = 5
  ship.reactor.maxReturnRate = 5

  const result = processEnergyReturn(ship)

  assertReactorState(result, 10, 3) // 5 + 5 = 10, 3 remaining
})
```

## Server Preparation

The pure function architecture is designed for easy migration to a server-based multiplayer game:

```typescript
// Server-side game loop (future)
class GameServer {
  private state: GameState

  submitAction(playerId: string, action: PlayerAction): ValidationResult {
    const validation = validateAction(this.state, playerId, action)
    if (!validation.valid) return validation
    this.state = setPendingAction(this.state, playerId, action)
    return { valid: true }
  }

  executeTurn(): GameState {
    this.state = resolveTurn(this.state)
    return this.state
  }
}
```

## Coverage Goals

Current coverage meets the project goals:
- ✅ 90%+ statement coverage (99.2%)
- ✅ 85%+ branch coverage (97.14%)
- ✅ 90%+ function coverage (100%)

## Future Test Suites

Planned test suites (not yet implemented):
- Turn Resolution (integration tests for full turn cycle)
- Weapon Systems (firing, range calculation, damage)
- Combat Resolution (hit detection, damage application)
- Fuel Scoop mechanics
- Railgun recoil handling
