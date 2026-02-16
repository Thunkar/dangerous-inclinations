import { describe, it, expect, afterEach } from "vitest";
import { calculateFiringSolutions } from "../../utils/weaponRange";
import {
  getSubsystemSide,
  getSideFiringDirection,
  isRingDirectionValid,
  createInitialShipState,
} from "../../utils/subsystemHelpers";
import { attemptMissileInterception } from "../../game/missiles";
import { createSubsystemsFromLoadout } from "../../game/loadout";
import { enableDeterministicMode, resetGameConfig } from "../../game/config";
import type { Player, ShipLoadout } from "../../models/game";
import type { Subsystem } from "../../models/subsystems";

// Helper to create test players
function createTestPlayer(
  id: string,
  name: string,
  ring: number,
  sector: number,
  facing: "prograde" | "retrograde",
  loadout?: ShipLoadout,
): Player {
  return {
    id,
    name,
    ship: createInitialShipState(
      { wellId: "blackhole", ring, sector, facing },
      loadout,
    ),
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: true,
    hasSubmittedLoadout: true,
  };
}

// Helper to create a subsystem for testing
function createSubsystem(
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

describe("Side Derivation", () => {
  it("should return port for side slot indices 0 and 1", () => {
    expect(getSubsystemSide(createSubsystem("laser", { slotType: "side", slotIndex: 0 }))).toBe("port");
    expect(getSubsystemSide(createSubsystem("laser", { slotType: "side", slotIndex: 1 }))).toBe("port");
  });

  it("should return starboard for side slot indices 2 and 3", () => {
    expect(getSubsystemSide(createSubsystem("laser", { slotType: "side", slotIndex: 2 }))).toBe("starboard");
    expect(getSubsystemSide(createSubsystem("laser", { slotType: "side", slotIndex: 3 }))).toBe("starboard");
  });

  it("should return null for non-side subsystems", () => {
    expect(getSubsystemSide(createSubsystem("engines"))).toBeNull();
    expect(getSubsystemSide(createSubsystem("railgun", { slotType: "forward", slotIndex: 0 }))).toBeNull();
  });

  it("should map port to outward when prograde", () => {
    expect(getSideFiringDirection("port", "prograde")).toBe("outward");
  });

  it("should map starboard to inward when prograde", () => {
    expect(getSideFiringDirection("starboard", "prograde")).toBe("inward");
  });

  it("should flip sides when retrograde", () => {
    expect(getSideFiringDirection("port", "retrograde")).toBe("inward");
    expect(getSideFiringDirection("starboard", "retrograde")).toBe("outward");
  });

  it("should validate ring direction outward", () => {
    expect(isRingDirectionValid(2, 3, "outward")).toBe(true);
    expect(isRingDirectionValid(2, 1, "outward")).toBe(false);
    expect(isRingDirectionValid(2, 2, "outward")).toBe(false);
  });

  it("should validate ring direction inward", () => {
    expect(isRingDirectionValid(2, 1, "inward")).toBe(true);
    expect(isRingDirectionValid(2, 3, "inward")).toBe(false);
    expect(isRingDirectionValid(2, 2, "inward")).toBe(false);
  });
});

describe("Laser Side-Restriction", () => {
  // Port laser (slotIndex 0): outward when prograde, inward when retrograde
  const portLaser = createSubsystem("laser", { slotType: "side", slotIndex: 0 });
  // Starboard laser (slotIndex 2): inward when prograde, outward when retrograde
  const starboardLaser = createSubsystem("laser", { slotType: "side", slotIndex: 2 });

  it("port laser (prograde) should hit higher ring (outward)", () => {
    const attacker = createTestPlayer("a", "A", 2, 5, "prograde");
    const target = createTestPlayer("t", "T", 3, 5, "prograde");

    const solutions = calculateFiringSolutions(portLaser, attacker.ship, [attacker, target], "a");
    expect(solutions.find((s) => s.targetId === "t")?.inRange).toBe(true);
  });

  it("port laser (prograde) should NOT hit lower ring (wrong direction)", () => {
    const attacker = createTestPlayer("a", "A", 2, 5, "prograde");
    const target = createTestPlayer("t", "T", 1, 5, "prograde");

    const solutions = calculateFiringSolutions(portLaser, attacker.ship, [attacker, target], "a");
    expect(solutions.find((s) => s.targetId === "t")?.inRange).toBe(false);
  });

  it("starboard laser (prograde) should hit lower ring (inward)", () => {
    const attacker = createTestPlayer("a", "A", 2, 5, "prograde");
    const target = createTestPlayer("t", "T", 1, 5, "prograde");

    const solutions = calculateFiringSolutions(starboardLaser, attacker.ship, [attacker, target], "a");
    expect(solutions.find((s) => s.targetId === "t")?.inRange).toBe(true);
  });

  it("starboard laser (prograde) should NOT hit higher ring (wrong direction)", () => {
    const attacker = createTestPlayer("a", "A", 2, 5, "prograde");
    const target = createTestPlayer("t", "T", 3, 5, "prograde");

    const solutions = calculateFiringSolutions(starboardLaser, attacker.ship, [attacker, target], "a");
    expect(solutions.find((s) => s.targetId === "t")?.inRange).toBe(false);
  });

  it("after rotation to retrograde, port fires inward (sides flip)", () => {
    const attacker = createTestPlayer("a", "A", 2, 5, "retrograde");
    const target = createTestPlayer("t", "T", 1, 5, "prograde");

    const solutions = calculateFiringSolutions(portLaser, attacker.ship, [attacker, target], "a");
    expect(solutions.find((s) => s.targetId === "t")?.inRange).toBe(true);
  });

  it("laser should hit target 2 rings away (extended range)", () => {
    const attacker = createTestPlayer("a", "A", 1, 5, "prograde");
    const target = createTestPlayer("t", "T", 3, 5, "prograde");

    // Port fires outward: ring 3 > 1 → valid
    const solutions = calculateFiringSolutions(portLaser, attacker.ship, [attacker, target], "a");
    expect(solutions.find((s) => s.targetId === "t")?.inRange).toBe(true);
  });

  it("laser should NOT hit same ring (broadside requires ringDist > 0)", () => {
    const attacker = createTestPlayer("a", "A", 2, 5, "prograde");
    const target = createTestPlayer("t", "T", 2, 6, "prograde");

    const solutions = calculateFiringSolutions(portLaser, attacker.ship, [attacker, target], "a");
    expect(solutions.find((s) => s.targetId === "t")?.inRange).toBe(false);
  });
});

describe("Ballistic Rack Direct Fire", () => {
  const portRack = createSubsystem("ballistic_rack", { slotType: "side", slotIndex: 0 });
  const starboardRack = createSubsystem("ballistic_rack", { slotType: "side", slotIndex: 2 });

  it("should hit same ring ±1 sector", () => {
    const attacker = createTestPlayer("a", "A", 3, 5, "prograde");
    const target = createTestPlayer("t", "T", 3, 6, "prograde");

    const solutions = calculateFiringSolutions(portRack, attacker.ship, [attacker, target], "a");
    expect(solutions.find((s) => s.targetId === "t")?.inRange).toBe(true);
  });

  it("should NOT hit same ring same sector (distance 0)", () => {
    const attacker = createTestPlayer("a", "A", 3, 5, "prograde");
    // Same position — filtered out as same player, but also sectorDist=0 check
    const target = createTestPlayer("t", "T", 3, 5, "prograde");

    const solutions = calculateFiringSolutions(portRack, attacker.ship, [attacker, target], "a");
    const sol = solutions.find((s) => s.targetId === "t");
    // canTargetSameRing requires sectorDist > 0
    expect(sol?.inRange).toBe(false);
  });

  it("should NOT hit same ring ±2 sectors (out of sectorRange)", () => {
    const attacker = createTestPlayer("a", "A", 3, 5, "prograde");
    const target = createTestPlayer("t", "T", 3, 7, "prograde");

    const solutions = calculateFiringSolutions(portRack, attacker.ship, [attacker, target], "a");
    expect(solutions.find((s) => s.targetId === "t")?.inRange).toBe(false);
  });

  it("should hit adjacent ring ±1 sector (any direction)", () => {
    const attacker = createTestPlayer("a", "A", 2, 5, "prograde");
    const target = createTestPlayer("t", "T", 3, 6, "prograde");

    const solutions = calculateFiringSolutions(portRack, attacker.ship, [attacker, target], "a");
    expect(solutions.find((s) => s.targetId === "t")?.inRange).toBe(true);
  });

  it("should NOT be side-restricted for cross-ring fire", () => {
    const attacker = createTestPlayer("a", "A", 2, 5, "prograde");
    const target = createTestPlayer("t", "T", 1, 5, "prograde");

    // Port rack can fire inward (no side restriction)
    const solutions = calculateFiringSolutions(portRack, attacker.ship, [attacker, target], "a");
    expect(solutions.find((s) => s.targetId === "t")?.inRange).toBe(true);

    // Starboard rack can also fire inward
    const solutions2 = calculateFiringSolutions(starboardRack, attacker.ship, [attacker, target], "a");
    expect(solutions2.find((s) => s.targetId === "t")?.inRange).toBe(true);
  });

  it("should fire outward from both port and starboard", () => {
    const attacker = createTestPlayer("a", "A", 2, 5, "prograde");
    const target = createTestPlayer("t", "T", 3, 5, "prograde");

    const sol1 = calculateFiringSolutions(portRack, attacker.ship, [attacker, target], "a");
    expect(sol1.find((s) => s.targetId === "t")?.inRange).toBe(true);

    const sol2 = calculateFiringSolutions(starboardRack, attacker.ship, [attacker, target], "a");
    expect(sol2.find((s) => s.targetId === "t")?.inRange).toBe(true);
  });

  it("same-ring fire works from both port and starboard", () => {
    const attacker = createTestPlayer("a", "A", 3, 5, "prograde");
    const target = createTestPlayer("t", "T", 3, 4, "prograde");

    const sol1 = calculateFiringSolutions(portRack, attacker.ship, [attacker, target], "a");
    expect(sol1.find((s) => s.targetId === "t")?.inRange).toBe(true);

    const sol2 = calculateFiringSolutions(starboardRack, attacker.ship, [attacker, target], "a");
    expect(sol2.find((s) => s.targetId === "t")?.inRange).toBe(true);
  });
});

describe("Slot Metadata in Loadout", () => {
  it("should assign slotType and slotIndex to forward slots", () => {
    const loadout: ShipLoadout = {
      forwardSlots: ["scoop", "railgun"],
      sideSlots: [null, null, null, null],
    };
    const subsystems = createSubsystemsFromLoadout(loadout);

    const scoop = subsystems.find((s) => s.type === "scoop");
    const railgun = subsystems.find((s) => s.type === "railgun");

    expect(scoop?.slotType).toBe("forward");
    expect(scoop?.slotIndex).toBe(0);
    expect(railgun?.slotType).toBe("forward");
    expect(railgun?.slotIndex).toBe(1);
  });

  it("should assign slotType and slotIndex to side slots", () => {
    const loadout: ShipLoadout = {
      forwardSlots: [null, null],
      sideSlots: ["laser", "shields", "laser", "ballistic_rack"],
    };
    const subsystems = createSubsystemsFromLoadout(loadout);

    const lasers = subsystems.filter((s) => s.type === "laser");
    const rack = subsystems.find((s) => s.type === "ballistic_rack");

    // First laser in side slot 0 (port)
    expect(lasers[0]?.slotType).toBe("side");
    expect(lasers[0]?.slotIndex).toBe(0);

    // Second laser in side slot 2 (starboard)
    expect(lasers[1]?.slotType).toBe("side");
    expect(lasers[1]?.slotIndex).toBe(2);

    // Ballistic rack in side slot 3 (starboard)
    expect(rack?.slotType).toBe("side");
    expect(rack?.slotIndex).toBe(3);
  });

  it("should NOT assign slot metadata to fixed subsystems", () => {
    const loadout: ShipLoadout = {
      forwardSlots: [null, null],
      sideSlots: [null, null, null, null],
    };
    const subsystems = createSubsystemsFromLoadout(loadout);

    const engines = subsystems.find((s) => s.type === "engines");
    const rotation = subsystems.find((s) => s.type === "rotation");

    expect(engines?.slotType).toBeUndefined();
    expect(engines?.slotIndex).toBeUndefined();
    expect(rotation?.slotType).toBeUndefined();
    expect(rotation?.slotIndex).toBeUndefined();
  });
});

describe("PDC Missile Interception", () => {
  afterEach(() => {
    resetGameConfig();
  });

  it("should intercept missile when powered rack rolls 2-10", () => {
    enableDeterministicMode(5); // Roll 5 = intercept

    const ship = createInitialShipState(
      { wellId: "blackhole", ring: 3, sector: 5, facing: "prograde" },
      {
        forwardSlots: [null, null],
        sideSlots: ["ballistic_rack", null, null, null],
      },
    );
    // Power the rack
    const poweredShip = {
      ...ship,
      subsystems: ship.subsystems.map((s) =>
        s.type === "ballistic_rack"
          ? { ...s, allocatedEnergy: 2, isPowered: true }
          : s,
      ),
    };

    const result = attemptMissileInterception(poweredShip);
    expect(result.intercepted).toBe(true);
    expect(result.rackIndex).not.toBeNull();
    expect(result.roll).toBe(5);
  });

  it("should fail interception when rack rolls 1", () => {
    enableDeterministicMode(1); // Roll 1 = miss

    const ship = createInitialShipState(
      { wellId: "blackhole", ring: 3, sector: 5, facing: "prograde" },
      {
        forwardSlots: [null, null],
        sideSlots: ["ballistic_rack", null, null, null],
      },
    );
    const poweredShip = {
      ...ship,
      subsystems: ship.subsystems.map((s) =>
        s.type === "ballistic_rack"
          ? { ...s, allocatedEnergy: 2, isPowered: true }
          : s,
      ),
    };

    const result = attemptMissileInterception(poweredShip);
    expect(result.intercepted).toBe(false);
    expect(result.rackIndex).not.toBeNull(); // Rack was found and tried
    expect(result.roll).toBe(1);
  });

  it("should not attempt interception with unpowered rack", () => {
    const ship = createInitialShipState(
      { wellId: "blackhole", ring: 3, sector: 5, facing: "prograde" },
      {
        forwardSlots: [null, null],
        sideSlots: ["ballistic_rack", null, null, null],
      },
    );
    // Leave rack unpowered (default)

    const result = attemptMissileInterception(ship);
    expect(result.intercepted).toBe(false);
    expect(result.rackIndex).toBeNull();
    expect(result.roll).toBe(0);
  });

  it("should not attempt interception with broken rack", () => {
    const ship = createInitialShipState(
      { wellId: "blackhole", ring: 3, sector: 5, facing: "prograde" },
      {
        forwardSlots: [null, null],
        sideSlots: ["ballistic_rack", null, null, null],
      },
    );
    const brokenShip = {
      ...ship,
      subsystems: ship.subsystems.map((s) =>
        s.type === "ballistic_rack"
          ? { ...s, allocatedEnergy: 2, isPowered: true, isBroken: true }
          : s,
      ),
    };

    const result = attemptMissileInterception(brokenShip);
    expect(result.intercepted).toBe(false);
    expect(result.rackIndex).toBeNull();
  });

  it("should not attempt interception with already-used rack", () => {
    const ship = createInitialShipState(
      { wellId: "blackhole", ring: 3, sector: 5, facing: "prograde" },
      {
        forwardSlots: [null, null],
        sideSlots: ["ballistic_rack", null, null, null],
      },
    );
    const usedShip = {
      ...ship,
      subsystems: ship.subsystems.map((s) =>
        s.type === "ballistic_rack"
          ? { ...s, allocatedEnergy: 2, isPowered: true, usedThisTurn: true }
          : s,
      ),
    };

    const result = attemptMissileInterception(usedShip);
    expect(result.intercepted).toBe(false);
    expect(result.rackIndex).toBeNull();
  });

  it("should not attempt interception when no rack is installed", () => {
    const ship = createInitialShipState(
      { wellId: "blackhole", ring: 3, sector: 5, facing: "prograde" },
    );

    const result = attemptMissileInterception(ship);
    expect(result.intercepted).toBe(false);
    expect(result.rackIndex).toBeNull();
  });

  it("two racks should intercept two missiles (one each)", () => {
    enableDeterministicMode(5); // Roll 5 = intercept

    const ship = createInitialShipState(
      { wellId: "blackhole", ring: 3, sector: 5, facing: "prograde" },
      {
        forwardSlots: [null, null],
        sideSlots: ["ballistic_rack", "ballistic_rack", null, null],
      },
    );
    let poweredShip = {
      ...ship,
      subsystems: ship.subsystems.map((s) =>
        s.type === "ballistic_rack"
          ? { ...s, allocatedEnergy: 2, isPowered: true }
          : s,
      ),
    };

    // First interception
    const result1 = attemptMissileInterception(poweredShip);
    expect(result1.intercepted).toBe(true);
    expect(result1.rackIndex).not.toBeNull();

    // Mark first rack as used
    poweredShip = {
      ...poweredShip,
      subsystems: poweredShip.subsystems.map((s, i) =>
        i === result1.rackIndex! ? { ...s, usedThisTurn: true } : s,
      ),
    };

    // Second interception — should use the other rack
    const result2 = attemptMissileInterception(poweredShip);
    expect(result2.intercepted).toBe(true);
    expect(result2.rackIndex).not.toBeNull();
    expect(result2.rackIndex).not.toBe(result1.rackIndex);
  });

  it("one rack, two missiles: first intercepted, second hits", () => {
    enableDeterministicMode(5); // Roll 5 = intercept

    const ship = createInitialShipState(
      { wellId: "blackhole", ring: 3, sector: 5, facing: "prograde" },
      {
        forwardSlots: [null, null],
        sideSlots: ["ballistic_rack", null, null, null],
      },
    );
    let poweredShip = {
      ...ship,
      subsystems: ship.subsystems.map((s) =>
        s.type === "ballistic_rack"
          ? { ...s, allocatedEnergy: 2, isPowered: true }
          : s,
      ),
    };

    // First missile — intercepted
    const result1 = attemptMissileInterception(poweredShip);
    expect(result1.intercepted).toBe(true);

    // Mark rack as used
    poweredShip = {
      ...poweredShip,
      subsystems: poweredShip.subsystems.map((s, i) =>
        i === result1.rackIndex! ? { ...s, usedThisTurn: true } : s,
      ),
    };

    // Second missile — no rack available
    const result2 = attemptMissileInterception(poweredShip);
    expect(result2.intercepted).toBe(false);
    expect(result2.rackIndex).toBeNull();
  });
});
