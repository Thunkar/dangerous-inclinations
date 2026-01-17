import { describe, it, expect } from "vitest";
import {
  createTestGameState,
  INITIAL_REACTOR_ENERGY,
} from "../fixtures/gameState";
import {
  createAllocateEnergyAction,
  createDeallocateEnergyAction,
  createCoastAction,
} from "../fixtures/actions";
import { executeTurnWithActions } from "../testUtils";
import {
  allocateEnergyByIndex,
  deallocateEnergyByIndex,
} from "../../game/energy";
import { createInitialShipState } from "../../utils/subsystemHelpers";
import type { ShipLoadout, Player } from "../../models/game";

describe("Energy Management System", () => {
  describe("Energy Allocation/Deallocation", () => {
    it("should allocate energy to subsystems and deallocate it back to reactor", () => {
      let gameState = createTestGameState();

      // Turn 1: Allocate 3 energy to engines
      const allocateAction = createAllocateEnergyAction("engines", 3);
      let result = executeTurnWithActions(
        gameState,
        allocateAction,
        createCoastAction(),
      );
      gameState = result.gameState;

      // After turn 1, engines should have 3 energy
      const enginesSubsystem = gameState.players[0].ship.subsystems.find(
        (s) => s.type === "engines",
      );
      expect(enginesSubsystem?.allocatedEnergy).toBe(3);
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(
        INITIAL_REACTOR_ENERGY - 3,
      );

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // Turn 2: Deallocate energy (returns to reactor immediately - no rate limit)
      const deallocateAction = createDeallocateEnergyAction("engines", 3);
      result = executeTurnWithActions(
        gameState,
        deallocateAction,
        createCoastAction(),
      );
      gameState = result.gameState;

      // After turn 2, energy should be back in reactor
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(
        INITIAL_REACTOR_ENERGY,
      );
      // No heat generated - deallocation doesn't generate heat, and engines weren't used
      expect(gameState.players[0].ship.heat.currentHeat).toBe(0);
    });

    it("should deallocate energy from multiple subsystems at once", () => {
      let gameState = createTestGameState();

      // Turn 1: Allocate energy to multiple subsystems (total 5 energy)
      const allocate1 = createAllocateEnergyAction("engines", 3);
      const allocate2 = createAllocateEnergyAction("shields", 2);
      let result = executeTurnWithActions(
        gameState,
        allocate1,
        allocate2,
        createCoastAction(),
      );
      gameState = result.gameState;

      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(
        INITIAL_REACTOR_ENERGY - 5,
      );

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // Turn 2: Deallocate both subsystems at once (no rate limit now)
      const deallocate1 = createDeallocateEnergyAction("engines", 3);
      const deallocate2 = createDeallocateEnergyAction("shields", 2);
      result = executeTurnWithActions(
        gameState,
        deallocate1,
        deallocate2,
        createCoastAction(),
      );
      gameState = result.gameState;

      // All energy should return to reactor immediately
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(
        INITIAL_REACTOR_ENERGY,
      );
      // No heat - subsystems weren't used
      expect(gameState.players[0].ship.heat.currentHeat).toBe(0);
    });

    it("should allow allocating and using energy in the same turn", () => {
      let gameState = createTestGameState();

      // Turn 1: Allocate energy incrementally
      const allocate1 = createAllocateEnergyAction("engines", 2);
      const allocate2 = createAllocateEnergyAction("engines", 1);
      let result = executeTurnWithActions(
        gameState,
        allocate1,
        allocate2,
        createCoastAction(),
      );
      gameState = result.gameState;

      // After turn 1, engines should have 3 energy total
      const enginesSubsystem = gameState.players[0].ship.subsystems.find(
        (s) => s.type === "engines",
      );
      expect(enginesSubsystem?.allocatedEnergy).toBe(3);
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(
        INITIAL_REACTOR_ENERGY - 3,
      );
    });

    it("should allow unlimited deallocation (no rate limit)", () => {
      let gameState = createTestGameState();

      // Turn 1: Allocate 4 energy to railgun
      const allocateAction = createAllocateEnergyAction("railgun", 4);
      let result = executeTurnWithActions(
        gameState,
        allocateAction,
        createCoastAction(),
      );
      gameState = result.gameState;

      const railgunSubsystem = gameState.players[0].ship.subsystems.find(
        (s) => s.type === "railgun",
      );
      expect(railgunSubsystem?.allocatedEnergy).toBe(4);
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(
        INITIAL_REACTOR_ENERGY - 4,
      );

      // Advance player 2
      result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // Turn 2: Deallocate all 4 energy at once (no rate limit)
      const deallocateAction = createDeallocateEnergyAction("railgun", 4);
      result = executeTurnWithActions(
        gameState,
        deallocateAction,
        createCoastAction(),
      );
      gameState = result.gameState;

      // Should have deallocated all energy
      const railgunSubsystem2 = gameState.players[0].ship.subsystems.find(
        (s) => s.type === "railgun",
      );
      expect(railgunSubsystem2?.allocatedEnergy).toBe(0);
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(
        INITIAL_REACTOR_ENERGY,
      );
    });

    it("should reject allocation beyond subsystem absolute maximum", () => {
      let gameState = createTestGameState();

      // Engines have maxEnergy: 3 (absolute maximum)
      // Try to allocate 4 energy (beyond max)
      const allocateAction = createAllocateEnergyAction("engines", 4);
      const result = executeTurnWithActions(
        gameState,
        allocateAction,
        createCoastAction(),
      );

      // Turn should fail validation
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.errors?.[0]).toContain("maximum");

      // Game state should be unchanged
      expect(result.gameState).toBe(gameState);

      // Verify engines still have 0 energy
      const enginesSubsystem = result.gameState.players[0].ship.subsystems.find(
        (s) => s.type === "engines",
      );
      expect(enginesSubsystem?.allocatedEnergy).toBe(0);
      expect(result.gameState.players[0].ship.reactor.availableEnergy).toBe(
        INITIAL_REACTOR_ENERGY,
      );
    });

    it("should allow allocation up to absolute maximum", () => {
      let gameState = createTestGameState();

      // Engines: minEnergy=1, maxEnergy=3
      // Allocate 3 energy (at max)
      const allocateAction = createAllocateEnergyAction("engines", 3);
      let result = executeTurnWithActions(
        gameState,
        allocateAction,
        createCoastAction(),
      );
      gameState = result.gameState;

      // Should succeed
      expect(result.errors).toBeUndefined();
      const enginesSubsystem = gameState.players[0].ship.subsystems.find(
        (s) => s.type === "engines",
      );
      expect(enginesSubsystem?.allocatedEnergy).toBe(3);
      expect(gameState.players[0].ship.reactor.availableEnergy).toBe(
        INITIAL_REACTOR_ENERGY - 3,
      );

      // No heat - engines weren't used (just coasted)
      expect(gameState.players[0].ship.heat.currentHeat).toBe(0);
    });
  });

  describe("Energy allocation and firing weapons", () => {
    it("should allow firing railgun after allocating 4 energy to it", () => {
      let gameState = createTestGameState();

      // Mirror user's scenario: engines at 3, rotation at 1, railgun at 4
      const allocateEngines = createAllocateEnergyAction("engines", 3);
      const allocateRotation = createAllocateEnergyAction("rotation", 1);
      const allocateRailgun = createAllocateEnergyAction("railgun", 4);

      // Fire railgun at player 2 (need to set up targeting)
      const fireRailgun = {
        type: "fire_weapon" as const,
        playerId: "player1",
        sequence: 1,
        data: {
          weaponType: "railgun" as const,
          targetPlayerIds: ["player2"],
        },
      };

      // Move player 2 to be within railgun range (same ring, 4 sectors ahead)
      gameState = {
        ...gameState,
        players: gameState.players.map((p) =>
          p.id === "player2"
            ? {
                ...p,
                ship: {
                  ...p.ship,
                  ring: 3, // Same ring as player 1
                  sector: 4, // 4 sectors ahead (within 6 sector range)
                },
              }
            : p,
        ),
      };

      const result = executeTurnWithActions(
        gameState,
        allocateEngines,
        allocateRotation,
        allocateRailgun,
        fireRailgun,
      );

      // Should succeed without errors
      expect(result.errors).toBeUndefined();

      // Check railgun has 4 energy allocated
      const railgunSubsystem = result.gameState.players[0].ship.subsystems.find(
        (s) => s.type === "railgun",
      );
      expect(railgunSubsystem?.allocatedEnergy).toBe(4);
    });
  });

  describe("Heat Generation on Use", () => {
    it("should generate heat when using engines for burn", () => {
      let gameState = createTestGameState();

      // Allocate 3 energy to engines and use them
      const allocateAction = createAllocateEnergyAction("engines", 3);
      const burnAction = {
        type: "burn" as const,
        playerId: "player1",
        sequence: 1,
        data: { burnIntensity: "soft" as const, sectorAdjustment: 0 },
      };

      let result = executeTurnWithActions(
        gameState,
        allocateAction,
        burnAction,
      );
      gameState = result.gameState;

      // Should generate 3 heat from using engines
      expect(gameState.players[0].ship.heat.currentHeat).toBe(3);
    });

    it("should not generate heat when subsystem is powered but not used", () => {
      let gameState = createTestGameState();

      // Allocate energy to engines but coast instead
      const allocateAction = createAllocateEnergyAction("engines", 3);
      let result = executeTurnWithActions(
        gameState,
        allocateAction,
        createCoastAction(),
      );
      gameState = result.gameState;

      // No heat - engines were powered but not used
      expect(gameState.players[0].ship.heat.currentHeat).toBe(0);
    });
  });

  describe("Multiple Subsystems of Same Type", () => {
    it("should allocate energy to specific subsystem by index when duplicate types exist", () => {
      // Create a loadout with two missiles subsystems
      const loadoutWithDuplicates: ShipLoadout = {
        forwardSlots: ["missiles", "missiles"], // Two missiles in forward slots
        sideSlots: ["shields", "laser", null, null],
      };

      const ship = createInitialShipState(
        {
          wellId: "blackhole",
          ring: 3,
          sector: 0,
          facing: "prograde",
        },
        loadoutWithDuplicates
      );

      // Find indices of the two missiles subsystems
      const missileIndices = ship.subsystems
        .map((s, i) => (s.type === "missiles" ? i : -1))
        .filter((i) => i !== -1);

      expect(missileIndices.length).toBe(2);
      const [firstMissileIndex, secondMissileIndex] = missileIndices;

      // Allocate energy to FIRST missiles subsystem only
      let updatedShip = allocateEnergyByIndex(ship, firstMissileIndex, 2);

      // First missiles should have 2 energy
      expect(updatedShip.subsystems[firstMissileIndex].allocatedEnergy).toBe(2);
      expect(updatedShip.subsystems[firstMissileIndex].type).toBe("missiles");

      // Second missiles should still have 0 energy
      expect(updatedShip.subsystems[secondMissileIndex].allocatedEnergy).toBe(0);
      expect(updatedShip.subsystems[secondMissileIndex].type).toBe("missiles");

      // Reactor should have 8 available (10 - 2)
      expect(updatedShip.reactor.availableEnergy).toBe(8);

      // Now allocate energy to SECOND missiles subsystem
      updatedShip = allocateEnergyByIndex(updatedShip, secondMissileIndex, 2);

      // Both should now have 2 energy each
      expect(updatedShip.subsystems[firstMissileIndex].allocatedEnergy).toBe(2);
      expect(updatedShip.subsystems[secondMissileIndex].allocatedEnergy).toBe(2);

      // Reactor should have 6 available (10 - 2 - 2)
      expect(updatedShip.reactor.availableEnergy).toBe(6);
    });

    it("should deallocate energy from specific subsystem by index when duplicate types exist", () => {
      // Create a loadout with two missiles subsystems
      const loadoutWithDuplicates: ShipLoadout = {
        forwardSlots: ["missiles", "missiles"],
        sideSlots: ["shields", "laser", null, null],
      };

      let ship = createInitialShipState(
        {
          wellId: "blackhole",
          ring: 3,
          sector: 0,
          facing: "prograde",
        },
        loadoutWithDuplicates
      );

      // Find indices of the two missiles subsystems
      const missileIndices = ship.subsystems
        .map((s, i) => (s.type === "missiles" ? i : -1))
        .filter((i) => i !== -1);

      const [firstMissileIndex, secondMissileIndex] = missileIndices;

      // Allocate 2 energy to each missiles subsystem
      ship = allocateEnergyByIndex(ship, firstMissileIndex, 2);
      ship = allocateEnergyByIndex(ship, secondMissileIndex, 2);

      expect(ship.subsystems[firstMissileIndex].allocatedEnergy).toBe(2);
      expect(ship.subsystems[secondMissileIndex].allocatedEnergy).toBe(2);
      expect(ship.reactor.availableEnergy).toBe(6);

      // Deallocate energy from FIRST missiles only
      ship = deallocateEnergyByIndex(ship, firstMissileIndex, 2);

      // First missiles should have 0 energy now
      expect(ship.subsystems[firstMissileIndex].allocatedEnergy).toBe(0);
      // Second missiles should still have 2 energy
      expect(ship.subsystems[secondMissileIndex].allocatedEnergy).toBe(2);
      // Reactor should have 8 available (10 - 2)
      expect(ship.reactor.availableEnergy).toBe(8);
    });

    it("should correctly identify isPowered state for each subsystem independently", () => {
      // Create a loadout with two missiles subsystems
      const loadoutWithDuplicates: ShipLoadout = {
        forwardSlots: ["missiles", "missiles"],
        sideSlots: ["shields", "laser", null, null],
      };

      let ship = createInitialShipState(
        {
          wellId: "blackhole",
          ring: 3,
          sector: 0,
          facing: "prograde",
        },
        loadoutWithDuplicates
      );

      const missileIndices = ship.subsystems
        .map((s, i) => (s.type === "missiles" ? i : -1))
        .filter((i) => i !== -1);

      const [firstMissileIndex, secondMissileIndex] = missileIndices;

      // Initially both should be unpowered
      expect(ship.subsystems[firstMissileIndex].isPowered).toBe(false);
      expect(ship.subsystems[secondMissileIndex].isPowered).toBe(false);

      // Power on only the first missiles (missiles need 2 energy to function)
      ship = allocateEnergyByIndex(ship, firstMissileIndex, 2);

      // First should be powered, second should not
      expect(ship.subsystems[firstMissileIndex].isPowered).toBe(true);
      expect(ship.subsystems[secondMissileIndex].isPowered).toBe(false);

      // Power on the second missiles
      ship = allocateEnergyByIndex(ship, secondMissileIndex, 2);

      // Both should now be powered
      expect(ship.subsystems[firstMissileIndex].isPowered).toBe(true);
      expect(ship.subsystems[secondMissileIndex].isPowered).toBe(true);
    });
  });
});
