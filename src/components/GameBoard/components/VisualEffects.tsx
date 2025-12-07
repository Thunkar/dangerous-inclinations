import type { FloatingNumber } from '../types/effects'
import { FLOATING_NUMBER_COLORS, FLOATING_NUMBER_OFFSETS } from '../types/effects'

interface VisualEffectsProps {
  floatingNumbers: FloatingNumber[]
  currentTime: number // performance.now() for animation progress
}

/**
 * VisualEffects - Renders floating damage numbers and other transient effects
 * Numbers float upward and fade out over their duration
 */
export function VisualEffects({ floatingNumbers, currentTime }: VisualEffectsProps) {
  return (
    <g className="visual-effects">
      {floatingNumbers.map(num => {
        const elapsed = currentTime - num.startTime
        const progress = Math.min(elapsed / num.duration, 1)

        // Animation: float upward 50px total, fade in then out
        const yOffset = -50 * progress
        const offset = FLOATING_NUMBER_OFFSETS[num.type]

        // Opacity: fade in for first 10%, stay visible, fade out last 30%
        let opacity = 1
        if (progress < 0.1) {
          opacity = progress / 0.1
        } else if (progress > 0.7) {
          opacity = 1 - (progress - 0.7) / 0.3
        }

        // Scale: start at 0.5, grow to 1.2, settle at 1.0
        let scale = 1
        if (progress < 0.15) {
          scale = 0.5 + (progress / 0.15) * 0.7 // 0.5 -> 1.2
        } else if (progress < 0.3) {
          scale = 1.2 - ((progress - 0.15) / 0.15) * 0.2 // 1.2 -> 1.0
        }

        const color = FLOATING_NUMBER_COLORS[num.type]
        const x = num.x + offset.x
        const y = num.y + offset.y + yOffset

        // Format the value with sign for positive numbers
        const displayValue = num.type === 'shield'
          ? `-${num.value}` // Shield shows absorption as negative (damage blocked)
          : num.type === 'heat'
            ? `+${num.value}` // Heat shows as positive
            : `-${num.value}` // Damage shows as negative (HP lost)

        return (
          <g key={num.id} opacity={opacity} transform={`translate(${x}, ${y}) scale(${scale})`}>
            {/* Text shadow/outline for readability */}
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={18}
              fontWeight="bold"
              fontFamily="monospace"
              fill="black"
              stroke="black"
              strokeWidth={3}
              strokeLinejoin="round"
            >
              {displayValue}
            </text>
            {/* Main text */}
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={18}
              fontWeight="bold"
              fontFamily="monospace"
              fill={color}
            >
              {displayValue}
            </text>
          </g>
        )
      })}
    </g>
  )
}
