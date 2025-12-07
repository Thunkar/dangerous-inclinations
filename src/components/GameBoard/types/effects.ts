/**
 * Visual effect types for transient animations
 * These are purely visual and don't affect game state
 */

export type FloatingNumberType = 'damage' | 'shield' | 'heat'

export interface FloatingNumber {
  id: string
  x: number              // Screen X position
  y: number              // Screen Y position (start)
  value: number          // Number to display
  type: FloatingNumberType
  startTime: number      // When animation started (performance.now())
  duration: number       // Total animation duration in ms
}

export const FLOATING_NUMBER_COLORS: Record<FloatingNumberType, string> = {
  damage: '#ff4444',   // Red for hull damage
  shield: '#4488ff',   // Blue for shield absorption
  heat: '#ff8800',     // Orange for heat generated
}

export const FLOATING_NUMBER_DURATION = 1200 // ms

/**
 * Offsets for different number types so they don't overlap
 */
export const FLOATING_NUMBER_OFFSETS: Record<FloatingNumberType, { x: number; y: number }> = {
  damage: { x: 0, y: 0 },       // Center
  shield: { x: -20, y: -10 },   // Left
  heat: { x: 20, y: -10 },      // Right
}

/**
 * Weapon visual effect types
 */
export type WeaponEffectType = 'laser' | 'railgun'

export interface WeaponEffect {
  id: string
  type: WeaponEffectType
  startX: number         // Screen X position (start - attacker)
  startY: number         // Screen Y position (start - attacker)
  endX: number           // Screen X position (end - target)
  endY: number           // Screen Y position (end - target)
  startTime: number      // When animation started (performance.now())
  duration: number       // Total animation duration in ms
}

export const WEAPON_EFFECT_COLORS: Record<WeaponEffectType, string> = {
  laser: '#ff2222',      // Bright red beam
  railgun: '#aa44ff',    // Purple projectile
}

export const WEAPON_EFFECT_DURATIONS: Record<WeaponEffectType, number> = {
  laser: 300,            // Quick beam flash
  railgun: 350,          // Slightly slower projectile
}
