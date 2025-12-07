interface ShieldBubbleProps {
  x: number
  y: number
  allocation: number     // Current energy allocated (1-4)
  maxAllocation: number  // Max energy possible (4)
  shipSize: number       // Base ship size for scaling
}

/**
 * ShieldBubble - Renders a semi-transparent blue bubble around a ship
 * when shields are powered. Size scales with energy allocation.
 */
export function ShieldBubble({
  x,
  y,
  allocation,
  maxAllocation,
  shipSize,
}: ShieldBubbleProps) {
  // Base radius is 2x ship size
  const baseRadius = shipSize * 2.5
  // Scale from 60% to 100% based on allocation
  const scaleFactor = 0.6 + (allocation / maxAllocation) * 0.4
  const radius = baseRadius * scaleFactor

  // Generate unique ID for gradient
  const gradientId = `shield-gradient-${x}-${y}`

  return (
    <g>
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stopColor="#4488ff" stopOpacity="0.05" />
          <stop offset="60%" stopColor="#4488ff" stopOpacity="0.15" />
          <stop offset="85%" stopColor="#66aaff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#88ccff" stopOpacity="0.5" />
        </radialGradient>
      </defs>
      {/* Main bubble */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={`url(#${gradientId})`}
        stroke="#66aaff"
        strokeWidth={1.5}
        strokeOpacity={0.6}
        style={{
          filter: 'url(#shield-glow)',
        }}
      />
      {/* Inner highlight ring */}
      <circle
        cx={x}
        cy={y}
        r={radius * 0.85}
        fill="none"
        stroke="#88ccff"
        strokeWidth={0.5}
        strokeOpacity={0.3}
        strokeDasharray="4 4"
      />
    </g>
  )
}
