import { resolveShipAppearance, type ShipAppearance } from '@dangerous-inclinations/engine'

/** Lightweight hull-only schematic for loadouts. Module knowledge stays on the tiles. */
export function ShipMark({
  appearance,
  accent = '#d21b33',
}: {
  appearance?: ShipAppearance
  accent?: string
}) {
  const a = resolveShipAppearance(appearance)
  return (
    <svg
      viewBox="0 0 180 76"
      width="100%"
      height="100%"
      role="img"
      aria-label="Modular corvette hull"
    >
      <g stroke="#121417" strokeWidth="2" strokeLinejoin="round">
        <path fill="#6e7174" d="M9 15h23v15H9l-5-3V18zM3 30h31v17H3zM9 47h23v15H9l-5-3V50z" />
        <path fill={a.paint} d="M24 12h40l7 4h66l17 10 13 3v22l-13 3-17 10H71l-7 4H24z" />
        <path fill={a.secondaryPaint} d="M26 13h32l9 8v35l-9 10H26zM73 18h62l12 8v27l-12 9H73z" />
        <path fill={a.paint} d="M66 23h26v33H66zM96 23h29v33H96zM130 25l18 5v18l-18 6z" />
        <path fill="#1e2024" d="M27 30h25v19H27zM62 34h70v10H62zM151 30h13v19h-13z" />
        <path fill={a.secondaryPaint} d="M33 34h14v11H33zM101 32h28v14h-28z" />
        <path
          fill={accent}
          d="M69 19h61v5H69zM69 55h61v5H69zM140 24l9 5v5l-9-5zM140 49l9-5v5l-9 5z"
        />
        <path stroke="#3fb0c8" d="M7 20v5M5 35v8M7 52v5" />
      </g>
    </svg>
  )
}
