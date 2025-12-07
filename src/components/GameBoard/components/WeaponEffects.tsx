import type { WeaponEffect } from '../types/effects'
import { WEAPON_EFFECT_COLORS } from '../types/effects'

interface WeaponEffectsProps {
  weaponEffects: WeaponEffect[]
  currentTime: number // performance.now() for animation progress
}

/**
 * WeaponEffects - Renders weapon fire animations (laser beams, railgun projectiles)
 */
export function WeaponEffects({ weaponEffects, currentTime }: WeaponEffectsProps) {
  return (
    <g className="weapon-effects">
      {weaponEffects.map(effect => {
        const elapsed = currentTime - effect.startTime
        const progress = Math.min(elapsed / effect.duration, 1)
        const color = WEAPON_EFFECT_COLORS[effect.type]

        if (effect.type === 'laser') {
          return (
            <LaserBeam
              key={effect.id}
              startX={effect.startX}
              startY={effect.startY}
              endX={effect.endX}
              endY={effect.endY}
              progress={progress}
              color={color}
            />
          )
        } else {
          return (
            <RailgunProjectile
              key={effect.id}
              startX={effect.startX}
              startY={effect.startY}
              endX={effect.endX}
              endY={effect.endY}
              progress={progress}
              color={color}
            />
          )
        }
      })}
    </g>
  )
}

interface BeamProps {
  startX: number
  startY: number
  endX: number
  endY: number
  progress: number
  color: string
}

/**
 * Laser beam - a bright line that flashes and fades
 * The beam appears instantly and then fades out
 */
function LaserBeam({ startX, startY, endX, endY, progress, color }: BeamProps) {
  // Opacity: bright at start, fade out
  const opacity = progress < 0.3 ? 1 : 1 - (progress - 0.3) / 0.7

  // Line width pulses at start then settles
  const baseWidth = 3
  const pulseWidth = progress < 0.1 ? baseWidth + 4 * (1 - progress / 0.1) : baseWidth

  return (
    <g opacity={opacity}>
      {/* Glow effect - wider, more transparent */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={color}
        strokeWidth={pulseWidth * 3}
        strokeLinecap="round"
        opacity={0.3}
      />
      {/* Core beam - bright center */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={color}
        strokeWidth={pulseWidth}
        strokeLinecap="round"
      />
      {/* Hot white core */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke="#ffffff"
        strokeWidth={pulseWidth * 0.4}
        strokeLinecap="round"
        opacity={0.8}
      />
    </g>
  )
}

/**
 * Railgun projectile - a fast-moving slug that travels from start to end
 */
function RailgunProjectile({ startX, startY, endX, endY, progress, color }: BeamProps) {
  // Calculate current position along the path
  const currentX = startX + (endX - startX) * progress
  const currentY = startY + (endY - startY) * progress

  // Calculate angle for rotation
  const angle = Math.atan2(endY - startY, endX - startX)
  const angleDeg = (angle * 180) / Math.PI

  // Trail length (gets shorter near the end)
  const trailLength = Math.min(40, 40 * (1 - progress * 0.5))

  // Trail start position (behind the projectile)
  const trailStartX = currentX - Math.cos(angle) * trailLength
  const trailStartY = currentY - Math.sin(angle) * trailLength

  // Opacity: fade out at the very end
  const opacity = progress > 0.9 ? 1 - (progress - 0.9) / 0.1 : 1

  return (
    <g opacity={opacity}>
      {/* Trail - gradient from transparent to solid */}
      <defs>
        <linearGradient
          id={`railgun-trail-${startX}-${startY}`}
          x1={trailStartX}
          y1={trailStartY}
          x2={currentX}
          y2={currentY}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="100%" stopColor={color} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      <line
        x1={trailStartX}
        y1={trailStartY}
        x2={currentX}
        y2={currentY}
        stroke={`url(#railgun-trail-${startX}-${startY})`}
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* Projectile core - elongated shape */}
      <ellipse
        cx={currentX}
        cy={currentY}
        rx={8}
        ry={3}
        fill={color}
        transform={`rotate(${angleDeg}, ${currentX}, ${currentY})`}
      />
      {/* Hot center */}
      <ellipse
        cx={currentX}
        cy={currentY}
        rx={5}
        ry={2}
        fill="#ffffff"
        opacity={0.9}
        transform={`rotate(${angleDeg}, ${currentX}, ${currentY})`}
      />
      {/* Glow around projectile */}
      <ellipse
        cx={currentX}
        cy={currentY}
        rx={12}
        ry={6}
        fill={color}
        opacity={0.3}
        transform={`rotate(${angleDeg}, ${currentX}, ${currentY})`}
      />
    </g>
  )
}
