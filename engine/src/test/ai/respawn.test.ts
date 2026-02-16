import { describe, it, expect } from "vitest";
import { botDecideActions } from "../../ai/index";
import { executeTurn } from "../../game/index";
import { createInitialShipState } from "../../utils/subsystemHelpers";
import type { GameState, Player } from "../../models/game";

function createTestPlayer(
  id: string,
  name: string,
  config: { wellId: string; ring: number; sector: number; facing: "prograde" | "retrograde" },
  shipOverrides?: Partial<ReturnType<typeof createInitialShipState>>
): Player {
  return {
    id,
    name,
    ship: createInitialShipState(config, undefined, shipOverrides),
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: true,
    hasSubmittedLoadout: true,
  };
}

describe("Bot Respawn Integration", () => {
  it("should handle dead bot coast → respawn → first real turn without errors", () => {
    const human = createTestPlayer("human1", "Human", {
      wellId: "blackhole", ring: 3, sector: 6, facing: "prograde",
    });
    const bot = createTestPlayer("bot1", "Bot", {
      wellId: "blackhole", ring: 3, sector: 0, facing: "prograde",
    });

    // Kill the bot
    bot.ship.hitPoints = 0;

    let state: GameState = {
      turn: 5,
      activePlayerIndex: 1, // bot's turn
      players: [human, bot],
      turnLog: [],
      missiles: [],
      phase: "active",
      stations: [],
    };

    // Step 1: Dead bot coasts (engine will respawn)
    const coastAction = {
      type: "coast" as const,
      playerId: "bot1",
      sequence: 1,
      data: { activateScoop: false },
    };
    const respawnResult = executeTurn(state, [coastAction]);
    expect(respawnResult.errors || []).toEqual([]);
    state = respawnResult.gameState;

    // Verify bot respawned
    const respawnedBot = state.players.find(p => p.id === "bot1")!;
    expect(respawnedBot.ship.hitPoints).toBeGreaterThan(0);

    // Step 2: Human's turn (just coast)
    const humanCoast = {
      type: "coast" as const,
      playerId: "human1",
      sequence: 1,
      data: { activateScoop: false },
    };
    const humanResult = executeTurn(state, [humanCoast]);
    expect(humanResult.errors || []).toEqual([]);
    state = humanResult.gameState;

    // Step 3: Bot's first real turn after respawn
    const decision = botDecideActions(state, "bot1");
    const botResult = executeTurn(state, decision.actions);
    expect(botResult.errors || []).toEqual([]);
  });

  it("should handle respawn when bot had powered weapons before death", () => {
    const human = createTestPlayer("human1", "Human", {
      wellId: "blackhole", ring: 3, sector: 6, facing: "prograde",
    });
    const bot = createTestPlayer("bot1", "Bot", {
      wellId: "blackhole", ring: 3, sector: 0, facing: "prograde",
    });

    // Give bot energy allocations before death (simulating mid-game state)
    const laserIdx = bot.ship.subsystems.findIndex(s => s.type === "laser");
    const railgunIdx = bot.ship.subsystems.findIndex(s => s.type === "railgun");
    const shieldsIdx = bot.ship.subsystems.findIndex(s => s.type === "shields");
    bot.ship.subsystems[laserIdx].allocatedEnergy = 2;
    bot.ship.subsystems[laserIdx].isPowered = true;
    if (railgunIdx >= 0) {
      bot.ship.subsystems[railgunIdx].allocatedEnergy = 4;
      bot.ship.subsystems[railgunIdx].isPowered = true;
    }
    if (shieldsIdx >= 0) {
      bot.ship.subsystems[shieldsIdx].allocatedEnergy = 2;
      bot.ship.subsystems[shieldsIdx].isPowered = true;
    }
    bot.ship.reactor.availableEnergy = 2; // Used 8 of 10

    // Now kill the bot
    bot.ship.hitPoints = 0;

    let state: GameState = {
      turn: 10,
      activePlayerIndex: 1,
      players: [human, bot],
      turnLog: [],
      missiles: [],
      phase: "active",
      stations: [],
    };

    // Dead bot coast → respawn
    const coastAction = {
      type: "coast" as const,
      playerId: "bot1",
      sequence: 1,
      data: { activateScoop: false },
    };
    const respawnResult = executeTurn(state, [coastAction]);
    expect(respawnResult.errors || []).toEqual([]);
    state = respawnResult.gameState;

    // Verify respawn reset subsystems
    const respawnedBot = state.players.find(p => p.id === "bot1")!;
    expect(respawnedBot.ship.hitPoints).toBeGreaterThan(0);
    for (const sub of respawnedBot.ship.subsystems) {
      expect(sub.allocatedEnergy, `${sub.type} should have 0 energy after respawn`).toBe(0);
      expect(sub.isPowered, `${sub.type} should be unpowered after respawn`).toBe(false);
    }
    expect(respawnedBot.ship.reactor.availableEnergy).toBe(10);

    // Human coast
    const humanCoast = {
      type: "coast" as const,
      playerId: "human1",
      sequence: 1,
      data: { activateScoop: false },
    };
    const humanResult = executeTurn(state, [humanCoast]);
    expect(humanResult.errors || []).toEqual([]);
    state = humanResult.gameState;

    // Bot's first real turn
    const decision = botDecideActions(state, "bot1");
    const botResult = executeTurn(state, decision.actions);
    expect(botResult.errors || []).toEqual([]);
  });

  it("should handle respawn when enemy is nearby in same well", () => {
    // Position human close to BH Ring 4 (where bot will respawn)
    const human = createTestPlayer("human1", "Human", {
      wellId: "blackhole", ring: 4, sector: 3, facing: "prograde",
    });
    const bot = createTestPlayer("bot1", "Bot", {
      wellId: "blackhole", ring: 3, sector: 0, facing: "prograde",
    });

    // Power up all bot weapons before death
    for (const sub of bot.ship.subsystems) {
      if (["laser", "railgun", "missiles", "shields"].includes(sub.type)) {
        sub.allocatedEnergy = sub.type === "railgun" ? 4 : 2;
        sub.isPowered = true;
      }
    }
    bot.ship.reactor.availableEnergy = 0;
    bot.ship.hitPoints = 0;

    let state: GameState = {
      turn: 10,
      activePlayerIndex: 1,
      players: [human, bot],
      turnLog: [],
      missiles: [],
      phase: "active",
      stations: [],
    };

    // Dead bot coast → respawn
    const coastResult = executeTurn(state, [{
      type: "coast" as const,
      playerId: "bot1",
      sequence: 1,
      data: { activateScoop: false },
    }]);
    expect(coastResult.errors || []).toEqual([]);
    state = coastResult.gameState;

    // Human coast (advancing turn to bot)
    const humanResult = executeTurn(state, [{
      type: "coast" as const,
      playerId: "human1",
      sequence: 1,
      data: { activateScoop: false },
    }]);
    expect(humanResult.errors || []).toEqual([]);
    state = humanResult.gameState;

    // Bot's first real turn with enemy nearby
    const decision = botDecideActions(state, "bot1");

    // Verify bot isn't trying to fire unpowered weapons
    const fireActions = decision.actions.filter(a => a.type === "fire_weapon");
    for (const fire of fireActions) {
      // Each weapon that fires should have had energy allocated earlier in the action sequence
      const allocAction = decision.actions.find(
        a => a.type === "allocate_energy" && a.data.subsystemType === fire.data.weaponType
      );
      expect(allocAction, `Fire ${fire.data.weaponType} should have matching energy allocation`).toBeDefined();
    }

    const botResult = executeTurn(state, decision.actions);
    expect(botResult.errors || []).toEqual([]);
  });

  it("should survive multiple death/respawn cycles", () => {
    const human = createTestPlayer("human1", "Human", {
      wellId: "blackhole", ring: 3, sector: 6, facing: "prograde",
    });
    const bot = createTestPlayer("bot1", "Bot", {
      wellId: "blackhole", ring: 3, sector: 0, facing: "prograde",
    });

    let state: GameState = {
      turn: 1,
      activePlayerIndex: 1,
      players: [human, bot],
      turnLog: [],
      missiles: [],
      phase: "active",
      stations: [],
    };

    for (let cycle = 0; cycle < 3; cycle++) {
      // Kill the bot
      const botIdx = state.players.findIndex(p => p.id === "bot1");
      state.players[botIdx].ship.hitPoints = 0;
      state.activePlayerIndex = botIdx;

      // Dead bot coast → respawn
      const coastAction = {
        type: "coast" as const,
        playerId: "bot1",
        sequence: 1,
        data: { activateScoop: false },
      };
      const respawnResult = executeTurn(state, [coastAction]);
      expect(respawnResult.errors || [], `Respawn cycle ${cycle}`).toEqual([]);
      state = respawnResult.gameState;

      // Human coast
      const humanCoast = {
        type: "coast" as const,
        playerId: "human1",
        sequence: 1,
        data: { activateScoop: false },
      };
      const humanResult = executeTurn(state, [humanCoast]);
      expect(humanResult.errors || [], `Human turn cycle ${cycle}`).toEqual([]);
      state = humanResult.gameState;

      // Bot's real turn
      const decision = botDecideActions(state, "bot1");
      const botResult = executeTurn(state, decision.actions);
      expect(botResult.errors || [], `Bot real turn cycle ${cycle}`).toEqual([]);
      state = botResult.gameState;

      // Run a few more normal turns
      for (let i = 0; i < 3; i++) {
        state.activePlayerIndex = botIdx;
        const d = botDecideActions(state, "bot1");
        const r = executeTurn(state, d.actions);
        expect(r.errors || [], `Normal turn ${i} cycle ${cycle}`).toEqual([]);
        state = r.gameState;
      }
    }
  });
});
