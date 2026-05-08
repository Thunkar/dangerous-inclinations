import { describe, it, expect } from "vitest";
import { calculateFiringSolutions } from "../../utils/weaponRange.ts";
import { createInitialShipState } from "../../utils/subsystemHelpers.ts";
import type { Player } from "../../models/game.ts";
import type { Subsystem } from "../../models/subsystems.ts";
import { calculatePostMovementPosition } from "../../game/movement.ts";

// Helper to create test players
function createTestPlayer(
  id: string,
  name: string,
  ring: number,
  sector: number,
  facing: "prograde" | "retrograde"
): Player {
  return {
    id,
    name,
    ship: createInitialShipState({
      wellId: "blackhole",
      ring,
      sector,
      facing,
    }),
    missionOffers: [],
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: true,
    hasSubmittedLoadout: true,
  };
}

// Helper to create a test subsystem (type determines weapon stats via config)
function createTestSubsystem(
  type: Subsystem["type"],
  overrides?: Partial<Subsystem>,
): Subsystem {
  return {
    type,
    allocatedEnergy: 0,
    isPowered: false,
    usedThisTurn: false,
    ...overrides,
  };
}

describe("Weapon Targeting", () => {
  // Laser: broadside arc, ringRange=2, sectorRange=1, sideRestricted
  const laserSubsystem = createTestSubsystem("laser", { slotType: "side", slotIndex: 0 });

  // Railgun: spinal arc, ringRange=0, sectorRange=5
  const railgunSubsystem = createTestSubsystem("railgun", { slotType: "forward", slotIndex: 0 });

  describe("Broadside Laser Targeting (±1 sector spread)", () => {
    it("should hit target at same sector on outer adjacent ring", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        2,
        5,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 3, 5, "prograde");

      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(true);
    });

    it("should hit target at sector-1 on outer adjacent ring", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        2,
        5,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 3, 4, "prograde");

      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(true);
    });

    it("should hit target at sector+1 on outer adjacent ring", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        2,
        5,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 3, 6, "prograde");

      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(true);
    });

    it("should NOT hit inner ring with port laser when prograde (port fires outward)", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        2,
        5,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 1, 5, "prograde");

      // Port laser (slotIndex 0) fires outward when prograde → inner ring is wrong direction
      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(false);
    });

    it("should hit inner ring with starboard laser when prograde (starboard fires inward)", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        2,
        5,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 1, 5, "prograde");

      // Starboard laser (slotIndex 2) fires inward when prograde
      const starboardLaser = createTestSubsystem("laser", { slotType: "side", slotIndex: 2 });
      const solutions = calculateFiringSolutions(
        starboardLaser,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(true);
    });

    it("should hit inner ring with port laser when retrograde (sides flip)", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        2,
        5,
        "retrograde"
      );
      const target = createTestPlayer("target", "Target", 1, 5, "prograde");

      // Port laser (slotIndex 0) fires inward when retrograde
      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(true);
    });

    it("should NOT hit target at sector+2 on adjacent ring", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        2,
        5,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 3, 7, "prograde");

      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(false);
    });

    it("should NOT hit target at sector-2 on adjacent ring", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        2,
        5,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 3, 3, "prograde");

      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(false);
    });

    it("should NOT hit target on same ring (broadside only hits adjacent rings)", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        2,
        5,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 2, 5, "prograde");

      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(false);
    });

    it("should hit target 2 rings away (ringRange=2, port fires outward when prograde)", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        2,
        5,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 4, 5, "prograde");

      // Port laser fires outward when prograde → ring 4 > ring 2 → valid direction
      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(true);
    });

    it("should NOT hit target 3 rings away (exceeds ringRange=2)", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        1,
        5,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 4, 5, "prograde");

      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(false);
    });

    it("should handle wrap-around at sector 0 (target at sector 23)", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        2,
        0,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 3, 23, "prograde"); // 23 is one sector before 0

      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(true);
    });

    it("should handle wrap-around at sector 23 (target at sector 0)", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        2,
        23,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 3, 0, "prograde"); // 0 is one sector after 23

      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(true);
    });
  });

  describe("Pre-movement targeting", () => {
    it("should calculate broadside weapon range from current position", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        3,
        0,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 4, 0, "prograde");

      const solutions = calculateFiringSolutions(
        laserSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(true);
    });

    it("should calculate spinal weapon range from current position", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        3,
        0,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 3, 4, "prograde");

      const solutions = calculateFiringSolutions(
        railgunSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      // Target at R3S4, attacker at R3S0 -> 4 sectors away, within range (5 sectors)
      expect(targetSolution?.inRange).toBe(true);
    });
  });

  describe("Post-movement targeting", () => {
    it("should calculate broadside weapon range after coasting", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        3,
        0,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 4, 4, "prograde"); // Same sector after movement

      // Calculate attacker position after movement (+4 sectors for Ring 3 velocity=4)
      const postMoveShip = calculatePostMovementPosition(
        attacker.ship,
        attacker.ship.facing,
        {
          actionType: "coast",
          sectorAdjustment: 0,
        }
      );

      expect(postMoveShip.sector).toBe(4); // Ring 3 has velocity=4
      expect(postMoveShip.ring).toBe(3);

      const solutions = calculateFiringSolutions(
        laserSubsystem,
        postMoveShip,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      // Attacker at R3S4, port laser fires outward when prograde
      // Target at R4S4 is within range (same sector, adjacent ring, outward direction)
      expect(targetSolution).toBeDefined();
      expect(targetSolution?.inRange).toBe(true);
    });

    it("should calculate spinal weapon range closer after orbital movement", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        3,
        0,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 3, 7, "prograde");

      // Before movement: 7 sectors away (railgun range = 5 sectors, so NOT in range)
      const beforeSolutions = calculateFiringSolutions(
        railgunSubsystem,
        attacker.ship,
        [attacker, target],
        attacker.id
      );
      const before = beforeSolutions.find((s) => s.targetId === target.id);
      expect(before?.inRange).toBe(false); // 7 sectors is out of 5 sector range

      // After movement: attacker moves to S4 (velocity=4), target still at S7 -> 3 sectors away
      const postMoveShip = calculatePostMovementPosition(
        attacker.ship,
        attacker.ship.facing,
        {
          actionType: "coast",
          sectorAdjustment: 0,
        }
      );

      expect(postMoveShip.sector).toBe(4); // Ring 3 velocity=4

      const afterSolutions = calculateFiringSolutions(
        railgunSubsystem,
        postMoveShip,
        [attacker, target],
        attacker.id
      );
      const after = afterSolutions.find((s) => s.targetId === target.id);
      expect(after?.inRange).toBe(true);
    });

    it("should calculate range from destination ring after immediate transfer", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        3,
        0,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 4, 4, "prograde"); // Adjusted for velocity

      // Attacker burns (transfer completes immediately)
      const postMoveShip = calculatePostMovementPosition(
        attacker.ship,
        attacker.ship.facing,
        {
          actionType: "burn",
          burnIntensity: "soft",
          sectorAdjustment: 0,
        }
      );

      // Ship is on ring 4 (transfer completes immediately)
      expect(postMoveShip.ring).toBe(4);
      expect(postMoveShip.sector).toBe(4); // Moved +4 sectors then transferred to R4 (1:1 mapping)

      // Calculate weapon range from destination ring (R4)
      const solutions = calculateFiringSolutions(
        railgunSubsystem,
        postMoveShip,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      // Target at R4S4, attacker at R4S4 -> same position, within range (0 sectors away)
      expect(targetSolution?.inRange).toBe(false); // Can't target self position
    });

    it("should calculate broadside range after rotation (side restriction flips)", () => {
      const attacker = createTestPlayer(
        "attacker",
        "Attacker",
        3,
        0,
        "prograde"
      );
      const target = createTestPlayer("target", "Target", 2, 4, "prograde"); // Inner ring

      // Rotate to retrograde before movement
      const postMoveShip = calculatePostMovementPosition(
        attacker.ship,
        "retrograde",
        {
          actionType: "coast",
          sectorAdjustment: 0,
        }
      );

      expect(postMoveShip.facing).toBe("retrograde");
      expect(postMoveShip.sector).toBe(4); // Ring 3 velocity=4

      // Port laser (slotIndex 0) fires inward when retrograde → inner ring R2 is valid
      const solutions = calculateFiringSolutions(
        laserSubsystem,
        postMoveShip,
        [attacker, target],
        attacker.id
      );

      const targetSolution = solutions.find((s) => s.targetId === target.id);
      expect(targetSolution?.inRange).toBe(true);
    });
  });
});
