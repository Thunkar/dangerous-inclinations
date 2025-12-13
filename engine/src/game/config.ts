/**
 * Game Logic Configuration
 *
 * Global configuration for the game engine. Allows controlling
 * randomness and other settings for testing purposes.
 */

export interface GameConfig {
  /**
   * When true, all d10 rolls return a fixed value (default 5 = normal hit)
   * This eliminates random misses and critical hits for consistent testing
   */
  deterministicRolls: boolean;

  /**
   * The fixed roll value when deterministicRolls is true (1-10)
   * Default: 5 (normal hit)
   */
  fixedRollValue: number;
}

/**
 * Default configuration (production mode)
 */
const defaultConfig: GameConfig = {
  deterministicRolls: false,
  fixedRollValue: 5, // Normal hit (2-9 = hit)
};

/**
 * Current game configuration (mutable for testing)
 */
let currentConfig: GameConfig = { ...defaultConfig };

/**
 * Get the current game configuration
 */
export function getGameConfig(): Readonly<GameConfig> {
  return currentConfig;
}

/**
 * Set game configuration (for testing)
 */
export function setGameConfig(config: Partial<GameConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Reset game configuration to defaults
 */
export function resetGameConfig(): void {
  currentConfig = { ...defaultConfig };
}

/**
 * Enable deterministic mode for testing
 * All d10 rolls will return the specified value (default: 5 = normal hit)
 */
export function enableDeterministicMode(rollValue: number = 5): void {
  currentConfig = {
    deterministicRolls: true,
    fixedRollValue: rollValue,
  };
}

/**
 * Disable deterministic mode (return to random rolls)
 */
export function disableDeterministicMode(): void {
  currentConfig = {
    ...currentConfig,
    deterministicRolls: false,
  };
}
