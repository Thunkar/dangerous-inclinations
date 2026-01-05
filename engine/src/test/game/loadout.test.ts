import { describe, it, expect } from "vitest";
import {
  validateLoadout,
  createSubsystemsFromLoadout,
  calculateShipStatsFromLoadout,
  hasSubsystemInLoadout,
  getEffectiveCriticalChance,
} from "../../game/loadout";
import type { ShipLoadout } from "../../models/game";
import {
  DEFAULT_LOADOUT,
  BASE_CRITICAL_CHANCE,
  DEFAULT_DISSIPATION_CAPACITY,
  STARTING_REACTION_MASS,
} from "../../models/game";
import type { Subsystem } from "../../models/subsystems";
import { SUBSYSTEM_CONFIGS } from "../../models/subsystems";

describe("Loadout System", () => {
  describe("validateLoadout", () => {
    it("should accept the default loadout", () => {
      const result = validateLoadout(DEFAULT_LOADOUT);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept a valid custom loadout", () => {
      const loadout: ShipLoadout = {
        forwardSlots: ["scoop", "sensor_array"],
        sideSlots: ["laser", "shields", "radiator", "fuel_tank"],
      };
      const result = validateLoadout(loadout);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept empty slots (null)", () => {
      const loadout: ShipLoadout = {
        forwardSlots: [null, "railgun"],
        sideSlots: [null, null, "shields", "missiles"],
      };
      const result = validateLoadout(loadout);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject side-only subsystem in forward slot", () => {
      const loadout: ShipLoadout = {
        forwardSlots: ["laser", "railgun"], // laser is side-only
        sideSlots: ["shields", "shields", "missiles", "missiles"],
      };
      const result = validateLoadout(loadout);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Forward slot 1: Broadside Laser cannot be installed in a forward slot"
      );
    });

    it("should reject forward-only subsystem in side slot", () => {
      const loadout: ShipLoadout = {
        forwardSlots: ["scoop", "railgun"],
        sideSlots: ["scoop", "shields", "missiles", "missiles"], // scoop is forward-only
      };
      const result = validateLoadout(loadout);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Side slot 1: Fuel Scoop cannot be installed in a side slot"
      );
    });

    it("should reject fixed subsystems (engines, rotation) in any slot", () => {
      const loadout1: ShipLoadout = {
        forwardSlots: ["engines", "railgun"], // engines is fixed
        sideSlots: ["shields", "shields", "missiles", "missiles"],
      };
      const result1 = validateLoadout(loadout1);
      expect(result1.valid).toBe(false);
      expect(result1.errors).toContain(
        "Forward slot 1: Engines cannot be installed in a forward slot"
      );

      const loadout2: ShipLoadout = {
        forwardSlots: ["scoop", "railgun"],
        sideSlots: ["rotation", "shields", "missiles", "missiles"], // rotation is fixed
      };
      const result2 = validateLoadout(loadout2);
      expect(result2.valid).toBe(false);
      expect(result2.errors).toContain(
        "Side slot 1: Maneuvering Thrusters cannot be installed in a side slot"
      );
    });

    it("should allow 'either' slot type subsystems in both forward and side slots", () => {
      const loadout: ShipLoadout = {
        forwardSlots: ["missiles", "missiles"], // missiles can go in either slot
        sideSlots: ["missiles", "missiles", "shields", "shields"],
      };
      const result = validateLoadout(loadout);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should allow duplicate subsystems", () => {
      const loadout: ShipLoadout = {
        forwardSlots: ["railgun", "railgun"],
        sideSlots: ["laser", "laser", "laser", "laser"],
      };
      const result = validateLoadout(loadout);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should allow all radiators (passive side slot)", () => {
      const loadout: ShipLoadout = {
        forwardSlots: ["scoop", "railgun"],
        sideSlots: ["radiator", "radiator", "radiator", "radiator"],
      };
      const result = validateLoadout(loadout);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("createSubsystemsFromLoadout", () => {
    it("should always include engines and rotation", () => {
      const loadout: ShipLoadout = {
        forwardSlots: [null, null],
        sideSlots: [null, null, null, null],
      };
      const subsystems = createSubsystemsFromLoadout(loadout);

      const engines = subsystems.find((s) => s.type === "engines");
      const rotation = subsystems.find((s) => s.type === "rotation");

      expect(engines).toBeDefined();
      expect(rotation).toBeDefined();
    });

    it("should include subsystems from loadout slots", () => {
      const loadout: ShipLoadout = {
        forwardSlots: ["scoop", "railgun"],
        sideSlots: ["laser", "shields", "radiator", "missiles"],
      };
      const subsystems = createSubsystemsFromLoadout(loadout);

      expect(subsystems.find((s) => s.type === "scoop")).toBeDefined();
      expect(subsystems.find((s) => s.type === "railgun")).toBeDefined();
      expect(subsystems.find((s) => s.type === "laser")).toBeDefined();
      expect(subsystems.find((s) => s.type === "shields")).toBeDefined();
      expect(subsystems.find((s) => s.type === "radiator")).toBeDefined();
      expect(subsystems.find((s) => s.type === "missiles")).toBeDefined();
    });

    it("should not include null slots", () => {
      const loadout: ShipLoadout = {
        forwardSlots: [null, "railgun"],
        sideSlots: [null, null, "shields", null],
      };
      const subsystems = createSubsystemsFromLoadout(loadout);

      // Should have: engines, rotation, railgun, shields = 4 subsystems
      expect(subsystems).toHaveLength(4);
    });

    it("should create subsystems with proper initial state", () => {
      const loadout: ShipLoadout = {
        forwardSlots: ["scoop", null],
        sideSlots: ["missiles", null, null, null],
      };
      const subsystems = createSubsystemsFromLoadout(loadout);

      for (const subsystem of subsystems) {
        expect(subsystem.allocatedEnergy).toBe(0);
        expect(subsystem.isPowered).toBe(false);
        expect(subsystem.usedThisTurn).toBe(false);
      }
    });

    it("should initialize missiles with ammo", () => {
      const loadout: ShipLoadout = {
        forwardSlots: [null, null],
        sideSlots: ["missiles", null, null, null],
      };
      const subsystems = createSubsystemsFromLoadout(loadout);

      const missiles = subsystems.find((s) => s.type === "missiles");
      expect(missiles).toBeDefined();
      expect(missiles?.ammo).toBe(SUBSYSTEM_CONFIGS.missiles.weaponStats?.maxAmmo);
    });

    it("should create multiple instances for duplicate subsystems", () => {
      const loadout: ShipLoadout = {
        forwardSlots: [null, null],
        sideSlots: ["laser", "laser", "shields", "shields"],
      };
      const subsystems = createSubsystemsFromLoadout(loadout);

      const lasers = subsystems.filter((s) => s.type === "laser");
      const shields = subsystems.filter((s) => s.type === "shields");

      expect(lasers).toHaveLength(2);
      expect(shields).toHaveLength(2);
    });
  });

  describe("calculateShipStatsFromLoadout", () => {
    it("should return base stats for default loadout (no passive bonuses)", () => {
      const stats = calculateShipStatsFromLoadout(DEFAULT_LOADOUT);

      expect(stats.dissipationCapacity).toBe(DEFAULT_DISSIPATION_CAPACITY);
      expect(stats.reactionMass).toBe(STARTING_REACTION_MASS);
      expect(stats.criticalChance).toBe(BASE_CRITICAL_CHANCE);
    });

    it("should increase dissipation with radiator", () => {
      const loadout: ShipLoadout = {
        forwardSlots: ["scoop", "railgun"],
        sideSlots: ["radiator", "shields", "missiles", "missiles"],
      };
      const stats = calculateShipStatsFromLoadout(loadout);

      const radiatorBonus = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0;
      expect(stats.dissipationCapacity).toBe(DEFAULT_DISSIPATION_CAPACITY + radiatorBonus);
    });

    it("should stack radiator bonuses", () => {
      const loadout: ShipLoadout = {
        forwardSlots: [null, null],
        sideSlots: ["radiator", "radiator", "radiator", "radiator"],
      };
      const stats = calculateShipStatsFromLoadout(loadout);

      const radiatorBonus = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0;
      expect(stats.dissipationCapacity).toBe(DEFAULT_DISSIPATION_CAPACITY + radiatorBonus * 4);
    });

    it("should increase reaction mass with fuel tank", () => {
      const loadout: ShipLoadout = {
        forwardSlots: ["scoop", "railgun"],
        sideSlots: ["fuel_tank", "shields", "missiles", "missiles"],
      };
      const stats = calculateShipStatsFromLoadout(loadout);

      const fuelTankBonus = SUBSYSTEM_CONFIGS.fuel_tank.passiveEffect?.reactionMassBonus ?? 0;
      expect(stats.reactionMass).toBe(STARTING_REACTION_MASS + fuelTankBonus);
    });

    it("should NOT increase critical chance from loadout alone (sensor array bonus only applies when powered)", () => {
      // Critical chance bonus from sensor array only applies during combat when powered
      // The base criticalChance on the ship is just BASE_CRITICAL_CHANCE
      // The bonus is added dynamically via getEffectiveCriticalChance()
      const loadout: ShipLoadout = {
        forwardSlots: ["sensor_array", "railgun"],
        sideSlots: ["shields", "shields", "missiles", "missiles"],
      };
      const stats = calculateShipStatsFromLoadout(loadout);

      // Sensor array bonus is NOT applied here - it's applied during combat
      expect(stats.criticalChance).toBe(BASE_CRITICAL_CHANCE);
    });

    it("should stack radiator and fuel tank bonuses but not sensor array bonus", () => {
      // Sensor array critical bonus is dynamic (only when powered)
      // So it's not included in calculateShipStatsFromLoadout
      const loadout: ShipLoadout = {
        forwardSlots: ["sensor_array", "sensor_array"],
        sideSlots: ["radiator", "radiator", "fuel_tank", "fuel_tank"],
      };
      const stats = calculateShipStatsFromLoadout(loadout);

      const radiatorBonus = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0;
      const fuelTankBonus = SUBSYSTEM_CONFIGS.fuel_tank.passiveEffect?.reactionMassBonus ?? 0;

      expect(stats.dissipationCapacity).toBe(DEFAULT_DISSIPATION_CAPACITY + radiatorBonus * 2);
      expect(stats.reactionMass).toBe(STARTING_REACTION_MASS + fuelTankBonus * 2);
      // Sensor array bonus NOT applied here
      expect(stats.criticalChance).toBe(BASE_CRITICAL_CHANCE);
    });

    it("should handle empty slots", () => {
      const loadout: ShipLoadout = {
        forwardSlots: [null, null],
        sideSlots: [null, null, null, null],
      };
      const stats = calculateShipStatsFromLoadout(loadout);

      expect(stats.dissipationCapacity).toBe(DEFAULT_DISSIPATION_CAPACITY);
      expect(stats.reactionMass).toBe(STARTING_REACTION_MASS);
      expect(stats.criticalChance).toBe(BASE_CRITICAL_CHANCE);
    });
  });

  describe("hasSubsystemInLoadout", () => {
    it("should return true for subsystems in forward slots", () => {
      const loadout: ShipLoadout = {
        forwardSlots: ["scoop", "railgun"],
        sideSlots: [null, null, null, null],
      };

      expect(hasSubsystemInLoadout(loadout, "scoop")).toBe(true);
      expect(hasSubsystemInLoadout(loadout, "railgun")).toBe(true);
    });

    it("should return true for subsystems in side slots", () => {
      const loadout: ShipLoadout = {
        forwardSlots: [null, null],
        sideSlots: ["laser", "shields", "missiles", "radiator"],
      };

      expect(hasSubsystemInLoadout(loadout, "laser")).toBe(true);
      expect(hasSubsystemInLoadout(loadout, "shields")).toBe(true);
      expect(hasSubsystemInLoadout(loadout, "missiles")).toBe(true);
      expect(hasSubsystemInLoadout(loadout, "radiator")).toBe(true);
    });

    it("should return false for subsystems not in loadout", () => {
      const loadout: ShipLoadout = {
        forwardSlots: ["scoop", null],
        sideSlots: ["laser", null, null, null],
      };

      expect(hasSubsystemInLoadout(loadout, "railgun")).toBe(false);
      expect(hasSubsystemInLoadout(loadout, "shields")).toBe(false);
      expect(hasSubsystemInLoadout(loadout, "missiles")).toBe(false);
    });

    it("should always return true for fixed subsystems (engines, rotation)", () => {
      const loadout: ShipLoadout = {
        forwardSlots: [null, null],
        sideSlots: [null, null, null, null],
      };

      expect(hasSubsystemInLoadout(loadout, "engines")).toBe(true);
      expect(hasSubsystemInLoadout(loadout, "rotation")).toBe(true);
    });
  });

  describe("getEffectiveCriticalChance", () => {
    it("should return base critical chance when no sensor array is powered", () => {
      const subsystems: Subsystem[] = [
        { type: "engines", allocatedEnergy: 3, isPowered: true, usedThisTurn: false },
        { type: "rotation", allocatedEnergy: 1, isPowered: true, usedThisTurn: false },
        { type: "shields", allocatedEnergy: 2, isPowered: true, usedThisTurn: false },
      ];

      const critChance = getEffectiveCriticalChance(BASE_CRITICAL_CHANCE, subsystems);
      expect(critChance).toBe(BASE_CRITICAL_CHANCE);
    });

    it("should add bonus when sensor array is powered", () => {
      const subsystems: Subsystem[] = [
        { type: "engines", allocatedEnergy: 3, isPowered: true, usedThisTurn: false },
        { type: "sensor_array", allocatedEnergy: 2, isPowered: true, usedThisTurn: false },
      ];

      const sensorBonus = SUBSYSTEM_CONFIGS.sensor_array.passiveEffect?.criticalChanceBonus ?? 0;
      const critChance = getEffectiveCriticalChance(BASE_CRITICAL_CHANCE, subsystems);
      expect(critChance).toBe(BASE_CRITICAL_CHANCE + sensorBonus);
    });

    it("should NOT add bonus when sensor array is unpowered", () => {
      const subsystems: Subsystem[] = [
        { type: "engines", allocatedEnergy: 3, isPowered: true, usedThisTurn: false },
        { type: "sensor_array", allocatedEnergy: 0, isPowered: false, usedThisTurn: false },
      ];

      const critChance = getEffectiveCriticalChance(BASE_CRITICAL_CHANCE, subsystems);
      expect(critChance).toBe(BASE_CRITICAL_CHANCE);
    });

    it("should NOT add bonus when sensor array is broken", () => {
      const subsystems: Subsystem[] = [
        { type: "engines", allocatedEnergy: 3, isPowered: true, usedThisTurn: false },
        { type: "sensor_array", allocatedEnergy: 2, isPowered: true, usedThisTurn: false, isBroken: true },
      ];

      const critChance = getEffectiveCriticalChance(BASE_CRITICAL_CHANCE, subsystems);
      expect(critChance).toBe(BASE_CRITICAL_CHANCE);
    });

    it("should stack bonuses from multiple powered sensor arrays", () => {
      const subsystems: Subsystem[] = [
        { type: "sensor_array", allocatedEnergy: 2, isPowered: true, usedThisTurn: false },
        { type: "sensor_array", allocatedEnergy: 2, isPowered: true, usedThisTurn: false },
      ];

      const sensorBonus = SUBSYSTEM_CONFIGS.sensor_array.passiveEffect?.criticalChanceBonus ?? 0;
      const critChance = getEffectiveCriticalChance(BASE_CRITICAL_CHANCE, subsystems);
      expect(critChance).toBe(BASE_CRITICAL_CHANCE + sensorBonus * 2);
    });
  });
});
