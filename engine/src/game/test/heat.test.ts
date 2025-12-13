import { describe, it, expect } from "vitest";
import { createCoastAction } from "./fixtures/actions";
import { createTestGameState, INITIAL_HIT_POINTS } from "./fixtures/gameState";
import { executeTurnWithActions } from "./testUtils";

/**
 * Heat System Tests
 *
 * Heat lifecycle:
 * 1. During turn: subsystem usage generates heat
 * 2. When turn switches to a player: evaluate their heat, take damage from excess
 * 3. Heat resets to 0 for that player
 * 4. Player takes their turn (sees damage already applied)
 * 5. Repeat
 *
 * NOTE: Heat damage is applied when switching TO a player, not when they execute actions.
 * This means the player sees the damage BEFORE they plan their turn.
 */
describe("Heat System", () => {
  describe("Heat Damage at Start of Turn", () => {
    it("should not take damage when heat is within dissipation capacity", () => {
      let gameState = createTestGameState();

      // Set heat equal to dissipation capacity (5) on player1
      gameState.players[0].ship.heat.currentHeat = 5;

      const initialHP = gameState.players[0].ship.hitPoints;

      // Player1 executes turn - heat damage is applied to NEXT player (player2), not player1
      let result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // Player2's turn now - execute their turn to switch back to player1
      result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // Now player1's heat should have been evaluated when switching to them
      // No damage because heat (5) <= dissipation capacity (5)
      expect(gameState.players[0].ship.hitPoints).toBe(initialHP);
      // Heat resets to 0 when switching to player
      expect(gameState.players[0].ship.heat.currentHeat).toBe(0);
    });

    it("should take damage when heat exceeds dissipation capacity", () => {
      let gameState = createTestGameState();

      // Set heat above dissipation capacity on player1
      gameState.players[0].ship.heat.currentHeat = 8;

      const initialHP = gameState.players[0].ship.hitPoints;

      // Player1 executes turn - switches to player2
      let result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // Player2's turn - execute to switch back to player1
      result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // Damage = heat (8) - dissipation capacity (5) = 3
      expect(gameState.players[0].ship.hitPoints).toBe(initialHP - 3);
      // Heat resets to 0 after damage
      expect(gameState.players[0].ship.heat.currentHeat).toBe(0);
    });

    it("should apply heat damage when switching to player", () => {
      let gameState = createTestGameState();

      // Set heat above dissipation capacity on player1
      gameState.players[0].ship.heat.currentHeat = 8;

      const initialHP = INITIAL_HIT_POINTS;

      // Player1 executes turn - switches to player2
      let result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // Player1 still has full HP (damage hasn't been applied yet - it happens when switching TO them)
      // Actually NO - after player1's turn, they switch to player2, so player1's heat stays
      // Let's check player1's HP - should still be full since damage is applied when switching TO them
      expect(gameState.players[0].ship.hitPoints).toBe(initialHP);
      // Player1 still has heat (will be evaluated when switching back to them)
      expect(gameState.players[0].ship.heat.currentHeat).toBe(8);

      // Player2's turn - execute to switch back to player1
      result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // NOW damage should be applied (8 - 5 = 3)
      expect(gameState.players[0].ship.hitPoints).toBe(initialHP - 3);
      // Heat resets to 0 after evaluation
      expect(gameState.players[0].ship.heat.currentHeat).toBe(0);
    });

    it("should kill ship when heat damage exceeds remaining HP", () => {
      let gameState = createTestGameState();

      // Set ship to low HP
      gameState.players[0].ship.hitPoints = 2;

      // Set heat that will cause more damage than remaining HP
      gameState.players[0].ship.heat.currentHeat = 8; // Damage = 8 - 5 = 3

      // Player1 executes turn - switches to player2
      let result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // Player2's turn - execute to switch back to player1
      result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // Ship should be destroyed (HP <= 0)
      expect(gameState.players[0].ship.hitPoints).toBeLessThanOrEqual(0);
    });
  });

  describe("Heat Generation from Subsystem Use", () => {
    it("should generate heat when engines are used for burn", () => {
      let gameState = createTestGameState();

      // Allocate 3 energy to engines
      const allocateAction = {
        type: "allocate_energy" as const,
        playerId: "player1",
        data: { subsystemType: "engines" as const, amount: 3 },
      };

      // Burn action
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

      // Should have generated 3 heat from engines (allocated energy)
      // Heat starts at 0, burn generates 3
      expect(gameState.players[0].ship.heat.currentHeat).toBe(3);
    });

    it("should generate heat when rotation is used", () => {
      let gameState = createTestGameState();

      // Allocate 1 energy to rotation
      const allocateAction = {
        type: "allocate_energy" as const,
        playerId: "player1",
        data: { subsystemType: "rotation" as const, amount: 1 },
      };

      // Rotate action
      const rotateAction = {
        type: "rotate" as const,
        playerId: "player1",
        sequence: 1,
        data: { targetFacing: "retrograde" as const },
      };

      // Coast action to complete the turn
      const coastAction = {
        type: "coast" as const,
        playerId: "player1",
        sequence: 2,
        data: { activateScoop: false },
      };

      let result = executeTurnWithActions(
        gameState,
        allocateAction,
        rotateAction,
        coastAction,
      );
      gameState = result.gameState;

      // Should have generated 1 heat from rotation
      expect(gameState.players[0].ship.heat.currentHeat).toBe(1);
    });

    it("should not generate heat from subsystems that are not used", () => {
      let gameState = createTestGameState();

      // Allocate energy to engines but don't use them (coast instead)
      const allocateAction = {
        type: "allocate_energy" as const,
        playerId: "player1",
        data: { subsystemType: "engines" as const, amount: 3 },
      };

      let result = executeTurnWithActions(
        gameState,
        allocateAction,
        createCoastAction(),
      );
      gameState = result.gameState;

      // Should have no heat - engines were powered but not used
      expect(gameState.players[0].ship.heat.currentHeat).toBe(0);
    });

    it("should accumulate heat from multiple actions in same turn", () => {
      let gameState = createTestGameState();

      // Allocate energy to engines and rotation
      const allocateEngines = {
        type: "allocate_energy" as const,
        playerId: "player1",
        data: { subsystemType: "engines" as const, amount: 3 },
      };

      const allocateRotation = {
        type: "allocate_energy" as const,
        playerId: "player1",
        data: { subsystemType: "rotation" as const, amount: 1 },
      };

      // Rotate then burn
      const rotateAction = {
        type: "rotate" as const,
        playerId: "player1",
        sequence: 1,
        data: { targetFacing: "retrograde" as const },
      };

      const burnAction = {
        type: "burn" as const,
        playerId: "player1",
        sequence: 2,
        data: { burnIntensity: "soft" as const, sectorAdjustment: 0 },
      };

      let result = executeTurnWithActions(
        gameState,
        allocateEngines,
        allocateRotation,
        rotateAction,
        burnAction,
      );
      gameState = result.gameState;

      // Should have 1 (rotation) + 3 (engines) = 4 heat
      expect(gameState.players[0].ship.heat.currentHeat).toBe(4);
    });
  });

  describe("Heat Persistence Between Turns", () => {
    it("should carry heat to next turn for damage evaluation", () => {
      let gameState = createTestGameState();
      gameState.players[0].ship.hitPoints = 50;
      gameState.players[0].ship.maxHitPoints = 50;

      // Allocate energy to engines
      const allocateEngines = {
        type: "allocate_energy" as const,
        playerId: "player1",
        data: { subsystemType: "engines" as const, amount: 3 },
      };

      // Burn to generate 3 heat
      const burnAction = {
        type: "burn" as const,
        playerId: "player1",
        sequence: 1,
        data: { burnIntensity: "soft" as const, sectorAdjustment: 0 },
      };

      let result = executeTurnWithActions(
        gameState,
        allocateEngines,
        burnAction,
      );
      gameState = result.gameState;

      // Should have 3 heat after turn
      expect(gameState.players[0].ship.heat.currentHeat).toBe(3);
      // No damage yet (heat is evaluated at START of turn)
      expect(gameState.players[0].ship.hitPoints).toBe(50);

      // Player 2's turn
      result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // Player 1's next turn - heat should be evaluated
      // 3 heat < 5 dissipation, so no damage
      result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      expect(gameState.players[0].ship.hitPoints).toBe(50); // No damage
      expect(gameState.players[0].ship.heat.currentHeat).toBe(0); // Reset after evaluation
    });

    it("should deal damage from excess heat when switching to player", () => {
      let gameState = createTestGameState();
      gameState.players[0].ship.hitPoints = 50;
      gameState.players[0].ship.maxHitPoints = 50;

      // Generate 8 heat (above dissipation capacity of 5)
      gameState.players[0].ship.heat.currentHeat = 8;

      // Player1 executes turn - switches to player2
      let result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // Player1 still has 50 HP (damage applied when switching TO them, not when they act)
      expect(gameState.players[0].ship.hitPoints).toBe(50);

      // Player2's turn - execute to switch back to player1
      result = executeTurnWithActions(gameState, createCoastAction());
      gameState = result.gameState;

      // NOW damage is applied: 8 - 5 = 3
      expect(gameState.players[0].ship.hitPoints).toBe(47);
      // Heat resets to 0
      expect(gameState.players[0].ship.heat.currentHeat).toBe(0);
    });
  });
});
