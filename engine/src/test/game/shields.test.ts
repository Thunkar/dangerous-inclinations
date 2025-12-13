import { describe, it, expect } from "vitest";
import { applyDamageWithShields, applyCriticalHit } from "../../game/damage";
import { getSubsystemConfig } from "../../models/subsystems";
import {
  createTestShip,
  createShipWithShields,
} from "../fixtures/ships";

describe("Shield System", () => {
  describe("applyDamageWithShields", () => {
    it("should absorb all damage when shields have enough capacity", () => {
      const ship = createShipWithShields(4); // 4 energy in shields
      const initialHp = ship.hitPoints;
      const initialHeat = ship.heat?.currentHeat || 0;

      const { ship: damagedShip, hitResult } = applyDamageWithShields(
        ship,
        3,
        "shields",
        5,
      ); // 3 damage, roll 5 = hit

      // No hull damage
      expect(damagedShip.hitPoints).toBe(initialHp);
      expect(hitResult.damageToHull).toBe(0);

      // All damage absorbed by shields and converted to heat
      expect(hitResult.damageToHeat).toBe(3);
      expect(damagedShip.heat?.currentHeat).toBe(initialHeat + 3);
    });

    it("should partially absorb damage when shields have less capacity than damage", () => {
      const ship = createShipWithShields(2); // 2 energy in shields
      const initialHp = ship.hitPoints;
      const initialHeat = ship.heat?.currentHeat || 0;

      const { ship: damagedShip, hitResult } = applyDamageWithShields(
        ship,
        5,
        "shields",
        5,
      ); // 5 damage, roll 5 = hit

      // 2 absorbed, 3 to hull
      expect(hitResult.damageToHeat).toBe(2);
      expect(hitResult.damageToHull).toBe(3);

      // Hull damage applied
      expect(damagedShip.hitPoints).toBe(initialHp - 3);

      // Heat from absorbed damage
      expect(damagedShip.heat?.currentHeat).toBe(initialHeat + 2);
    });

    it("should not absorb any damage when shields are unpowered", () => {
      const ship = createTestShip(); // No shields powered
      const initialHp = ship.hitPoints;
      const initialHeat = ship.heat?.currentHeat || 0;

      const { ship: damagedShip, hitResult } = applyDamageWithShields(
        ship,
        4,
        "shields",
        5,
      );

      // All damage to hull
      expect(hitResult.damageToHeat).toBe(0);
      expect(hitResult.damageToHull).toBe(4);
      expect(damagedShip.hitPoints).toBe(initialHp - 4);

      // No heat added from shields
      expect(damagedShip.heat?.currentHeat).toBe(initialHeat);
    });

    it("should not absorb damage when shields have 0 energy allocated", () => {
      const ship = createTestShip();
      // Manually set shields to powered but with 0 energy (edge case)
      const shipWithZeroShields = {
        ...ship,
        subsystems: ship.subsystems.map((s) =>
          s.type === "shields"
            ? { ...s, isPowered: true, allocatedEnergy: 0 }
            : s,
        ),
      };
      const initialHp = shipWithZeroShields.hitPoints;

      const { ship: damagedShip, hitResult } = applyDamageWithShields(
        shipWithZeroShields,
        3,
        "shields",
        5,
      );

      expect(hitResult.damageToHeat).toBe(0);
      expect(hitResult.damageToHull).toBe(3);
      expect(damagedShip.hitPoints).toBe(initialHp - 3);
    });

    it("should absorb exactly the shield capacity when damage equals capacity", () => {
      const ship = createShipWithShields(3);
      const initialHp = ship.hitPoints;
      const initialHeat = ship.heat?.currentHeat || 0;

      const { ship: damagedShip, hitResult } = applyDamageWithShields(
        ship,
        3,
        "shields",
        5,
      ); // Exact match, roll 5 = hit

      expect(hitResult.damageToHeat).toBe(3);
      expect(hitResult.damageToHull).toBe(0);
      expect(damagedShip.hitPoints).toBe(initialHp);
      expect(damagedShip.heat?.currentHeat).toBe(initialHeat + 3);
    });

    it("should handle zero damage gracefully", () => {
      const ship = createShipWithShields(4);
      const initialHp = ship.hitPoints;
      const initialHeat = ship.heat?.currentHeat || 0;

      const { ship: damagedShip, hitResult } = applyDamageWithShields(
        ship,
        0,
        "shields",
        5,
      );

      expect(hitResult.damageToHeat).toBe(0);
      expect(hitResult.damageToHull).toBe(0);
      expect(damagedShip.hitPoints).toBe(initialHp);
      expect(damagedShip.heat?.currentHeat).toBe(initialHeat);
    });

    it("should not reduce HP below 0", () => {
      const ship = createTestShip({ hitPoints: 2 }); // Only 2 HP

      const { ship: damagedShip, hitResult } = applyDamageWithShields(
        ship,
        10,
        "shields",
        5,
      ); // Overkill, roll 5 = hit

      expect(damagedShip.hitPoints).toBe(0);
      expect(hitResult.damageToHull).toBe(10); // Reports full damage even if overkill
    });
  });

  describe("Shield energy requirements", () => {
    it("should require minimum energy to activate shields", () => {
      const shieldConfig = getSubsystemConfig("shields");
      expect(shieldConfig.minEnergy).toBe(1);
    });

    it("should have maximum energy of 4", () => {
      const shieldConfig = getSubsystemConfig("shields");
      expect(shieldConfig.maxEnergy).toBe(4);
    });

    it("should absorb damage equal to allocated energy", () => {
      // Test with 1 energy
      const ship1 = createShipWithShields(1);
      const { hitResult: result1 } = applyDamageWithShields(
        ship1,
        5,
        "shields",
        5,
      );
      expect(result1.damageToHeat).toBe(1);
      expect(result1.damageToHull).toBe(4);

      // Test with 2 energy
      const ship2 = createShipWithShields(2);
      const { hitResult: result2 } = applyDamageWithShields(
        ship2,
        5,
        "shields",
        5,
      );
      expect(result2.damageToHeat).toBe(2);
      expect(result2.damageToHull).toBe(3);

      // Test with 3 energy
      const ship3 = createShipWithShields(3);
      const { hitResult: result3 } = applyDamageWithShields(
        ship3,
        5,
        "shields",
        5,
      );
      expect(result3.damageToHeat).toBe(3);
      expect(result3.damageToHull).toBe(2);

      // Test with 4 energy (max)
      const ship4 = createShipWithShields(4);
      const { hitResult: result4 } = applyDamageWithShields(
        ship4,
        5,
        "shields",
        5,
      );
      expect(result4.damageToHeat).toBe(4);
      expect(result4.damageToHull).toBe(1);
    });
  });

  describe("Critical hits with shields", () => {
    it("should apply critical hit to specified subsystem", () => {
      const ship = createShipWithShields(3);
      // Also power engines to have a target for critical
      const shipWithEngines = {
        ...ship,
        reactor: {
          ...ship.reactor,
          availableEnergy: ship.reactor.availableEnergy - 2,
        },
        subsystems: ship.subsystems.map((s) =>
          s.type === "engines"
            ? { ...s, isPowered: true, allocatedEnergy: 2 }
            : s,
        ),
      };

      const { ship: critShip, effect } = applyCriticalHit(
        shipWithEngines,
        "engines",
      );

      expect(effect).not.toBeNull();
      expect(effect?.targetSubsystem).toBe("engines");
      expect(effect?.energyLost).toBe(2);
      expect(effect?.heatAdded).toBe(2);

      // Engines should be unpowered
      const engines = critShip.subsystems.find((s) => s.type === "engines");
      expect(engines?.isPowered).toBe(false);
      expect(engines?.allocatedEnergy).toBe(0);

      // Energy returned to reactor
      expect(critShip.reactor.availableEnergy).toBe(
        shipWithEngines.reactor.availableEnergy + 2,
      );
    });

    it("should crit unpowered subsystems (breaking them with no energy loss)", () => {
      const ship = createTestShip(); // engines are unpowered

      const { ship: critShip, effect } = applyCriticalHit(ship, "engines");

      // Critical hit still breaks the subsystem, just no energy is lost
      expect(effect).not.toBeNull();
      expect(effect?.targetSubsystem).toBe("engines");
      expect(effect?.energyLost).toBe(0); // No energy to lose
      expect(effect?.heatAdded).toBe(0); // No heat from 0 energy

      // Subsystem should be marked as broken
      const engines = critShip.subsystems.find((s) => s.type === "engines");
      expect(engines?.isBroken).toBe(true);
    });

    it("should add heat from critical hit", () => {
      const ship = createShipWithShields(2);
      const initialHeat = ship.heat?.currentHeat || 0;

      // Target the shields for critical
      const { ship: critShip, effect } = applyCriticalHit(ship, "shields");

      expect(effect?.heatAdded).toBe(2);
      expect(critShip.heat?.currentHeat).toBe(initialHeat + 2);
    });
  });

  describe("Shield energy depletion", () => {
    it("should reduce shield energy when absorbing damage", () => {
      const ship = createShipWithShields(3);
      const shieldsBefore = ship.subsystems.find((s) => s.type === "shields");
      expect(shieldsBefore?.allocatedEnergy).toBe(3);

      const { ship: damagedShip } = applyDamageWithShields(
        ship,
        2,
        "shields",
        5,
      );

      // Shield energy should be reduced by damage absorbed
      const shieldsAfter = damagedShip.subsystems.find(
        (s) => s.type === "shields",
      );
      expect(shieldsAfter?.allocatedEnergy).toBe(1); // 3 - 2 = 1
      expect(shieldsAfter?.isPowered).toBe(true);
    });

    it("should deplete shields fully when absorbing full capacity", () => {
      const ship = createShipWithShields(2);
      const { ship: damagedShip } = applyDamageWithShields(
        ship,
        2,
        "shields",
        5,
      );

      const shieldsAfter = damagedShip.subsystems.find(
        (s) => s.type === "shields",
      );
      expect(shieldsAfter?.allocatedEnergy).toBe(0);
      expect(shieldsAfter?.isPowered).toBe(false);
    });

    it("should have reduced absorption on subsequent hits", () => {
      const ship = createShipWithShields(3);
      const initialHp = ship.hitPoints;

      // First hit - 3 damage, shields absorb 3
      const { ship: ship1, hitResult: result1 } = applyDamageWithShields(
        ship,
        3,
        "shields",
        5,
      );
      expect(result1.damageToHeat).toBe(3);
      expect(result1.damageToHull).toBe(0);
      expect(ship1.hitPoints).toBe(initialHp);

      // Shields now depleted
      const shieldsAfter = ship1.subsystems.find((s) => s.type === "shields");
      expect(shieldsAfter?.allocatedEnergy).toBe(0);

      // Second hit - shields depleted, all damage to hull
      const { ship: ship2, hitResult: result2 } = applyDamageWithShields(
        ship1,
        3,
        "shields",
        5,
      );
      expect(result2.damageToHeat).toBe(0);
      expect(result2.damageToHull).toBe(3);
      expect(ship2.hitPoints).toBe(initialHp - 3);
    });

    it("should partially absorb then pass remaining damage", () => {
      const ship = createShipWithShields(2);
      const initialHp = ship.hitPoints;

      // First hit - 3 damage, shields absorb 2, 1 to hull
      const { ship: ship1, hitResult: result1 } = applyDamageWithShields(
        ship,
        3,
        "shields",
        5,
      );
      expect(result1.damageToHeat).toBe(2);
      expect(result1.damageToHull).toBe(1);
      expect(ship1.hitPoints).toBe(initialHp - 1);

      // Shields now depleted
      const shieldsAfter = ship1.subsystems.find((s) => s.type === "shields");
      expect(shieldsAfter?.allocatedEnergy).toBe(0);

      // Second hit - shields depleted, all damage to hull
      const { ship: ship2, hitResult: result2 } = applyDamageWithShields(
        ship1,
        3,
        "shields",
        5,
      );
      expect(result2.damageToHeat).toBe(0);
      expect(result2.damageToHull).toBe(3);
      expect(ship2.hitPoints).toBe(initialHp - 4);
    });

    it("should return depleted shield energy to reactor", () => {
      const ship = createShipWithShields(3);
      const reactorBefore = ship.reactor.availableEnergy;

      // Absorb 2 damage - 2 energy should return to reactor
      const { ship: damagedShip } = applyDamageWithShields(
        ship,
        2,
        "shields",
        5,
      );

      expect(damagedShip.reactor.availableEnergy).toBe(reactorBefore + 2);

      // Shields should have 1 energy remaining
      const shieldsAfter = damagedShip.subsystems.find(
        (s) => s.type === "shields",
      );
      expect(shieldsAfter?.allocatedEnergy).toBe(1);
    });

    it("should not exceed reactor capacity when returning energy", () => {
      // Create ship with full reactor and shields
      const ship = createShipWithShields(2);
      // Manually set reactor to near full
      const shipNearFull = {
        ...ship,
        reactor: {
          ...ship.reactor,
          availableEnergy: ship.reactor.totalCapacity - 1, // Only 1 unit below max
        },
      };

      // Absorb 2 damage - would return 2 energy but reactor only has room for 1
      const { ship: damagedShip } = applyDamageWithShields(
        shipNearFull,
        2,
        "shields",
        5,
      );

      expect(damagedShip.reactor.availableEnergy).toBe(
        damagedShip.reactor.totalCapacity,
      );
    });
  });

  describe("Heat accumulation from shields", () => {
    it("should accumulate heat until shields deplete", () => {
      const ship = createShipWithShields(4); // 4 shield energy
      const initialHeat = ship.heat?.currentHeat || 0;

      // First hit - 2 damage absorbed = 2 heat, shields at 2
      const { ship: ship1 } = applyDamageWithShields(ship, 2, "shields", 5);
      expect(ship1.heat?.currentHeat).toBe(initialHeat + 2);
      expect(
        ship1.subsystems.find((s) => s.type === "shields")?.allocatedEnergy,
      ).toBe(2);

      // Second hit - 2 damage absorbed = 2 more heat, shields at 0
      const { ship: ship2 } = applyDamageWithShields(ship1, 2, "shields", 5);
      expect(ship2.heat?.currentHeat).toBe(initialHeat + 4);
      expect(
        ship2.subsystems.find((s) => s.type === "shields")?.allocatedEnergy,
      ).toBe(0);

      // Third hit - shields depleted, no more heat from absorption
      const { ship: ship3 } = applyDamageWithShields(ship2, 2, "shields", 5);
      expect(ship3.heat?.currentHeat).toBe(initialHeat + 4); // Unchanged - no shield absorption
    });

    it("should combine shield absorption heat with existing heat", () => {
      // Start with a ship that already has heat
      const ship = createShipWithShields(3);
      const shipWithHeat = {
        ...ship,
        heat: { currentHeat: 5 },
      };

      const { ship: damagedShip } = applyDamageWithShields(
        shipWithHeat,
        3,
        "shields",
        5,
      );

      expect(damagedShip.heat?.currentHeat).toBe(5 + 3); // Original + absorbed
    });
  });

  describe("Edge cases", () => {
    it("should handle very large damage amounts", () => {
      const ship = createShipWithShields(4);
      const initialHp = ship.hitPoints;

      const { ship: damagedShip, hitResult } = applyDamageWithShields(
        ship,
        100,
        "shields",
        5,
      );

      expect(hitResult.damageToHeat).toBe(4);
      expect(hitResult.damageToHull).toBe(96);
      expect(damagedShip.hitPoints).toBe(Math.max(0, initialHp - 96));
    });

    it("should handle ship with maximum shields", () => {
      const ship = createShipWithShields(4); // Max shields
      const initialHp = ship.hitPoints;
      const initialHeat = ship.heat?.currentHeat || 0;

      // Damage less than shields
      const { ship: ship1, hitResult: result1 } = applyDamageWithShields(
        ship,
        2,
        "shields",
        5,
      );
      expect(result1.damageToHeat).toBe(2);
      expect(result1.damageToHull).toBe(0);
      expect(ship1.hitPoints).toBe(initialHp);
      expect(ship1.heat?.currentHeat).toBe(initialHeat + 2);

      // Damage equal to shields
      const { ship: ship2, hitResult: result2 } = applyDamageWithShields(
        ship,
        4,
        "shields",
        5,
      );
      expect(result2.damageToHeat).toBe(4);
      expect(result2.damageToHull).toBe(0);
      expect(ship2.hitPoints).toBe(initialHp);

      // Damage exceeding shields
      const { ship: ship3, hitResult: result3 } = applyDamageWithShields(
        ship,
        6,
        "shields",
        5,
      );
      expect(result3.damageToHeat).toBe(4);
      expect(result3.damageToHull).toBe(2);
      expect(ship3.hitPoints).toBe(initialHp - 2);
    });
  });
});
