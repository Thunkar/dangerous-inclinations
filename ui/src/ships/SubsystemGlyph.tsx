import { getSubsystemConfig, type SubsystemType } from '@dangerous-inclinations/engine'

export function SubsystemGlyph({
  type,
  size = 27,
  opacity = 1,
  decorative = false,
}: {
  type: SubsystemType | null
  size?: number
  opacity?: number
  decorative?: boolean
}) {
  const paths: Record<SubsystemType, string> = {
    engines: 'M6 4h12l-2 9 4 6H4l4-6zM8 22v-3m4 3v-3m4 3v-3',
    rotation: 'M9 9h6v6H9zM12 2v4m0 12v4M2 12h4m12 0h4M3 8l-2 4 2 4m18-8 2 4-2 4',
    scoop: 'M5 5h14l-3 8v6H8v-6zM2 2l3 3m17-3-3 3M8 9h8M10 22h4',
    railgun: 'M9 21V4h2v17m2 0V4h2v17M7 8h10M7 16h10',
    sensor_array:
      'M3 4h7v6H3zM14 4h7v6h-7zM3 14h7v6H3zM14 14h7v6h-7zM6 7h1m10 0h1M6 17h1m10 0h1M12 8v8',
    missiles: 'M3 10h18v11H3zM5 10V6l2-4 2 4v4M15 10V6l2-4 2 4v4M6 14h3v4H6zM15 14h3v4h-3z',
    laser: 'M9 21v-6H7V9h10v6h-2v6M10 9V4h4v5M12 1v2',
    shields: 'M5 5l7-3 7 3v7c0 5-7 9-7 9s-7-4-7-9zM8 9h8M8 13h8',
    radiator:
      'M3 3h18v7H3zM3 14h18v7H3zM6 5v3m4-3v3m4-3v3m4-3v3M6 16v3m4-3v3m4-3v3m4-3v3M7 10v4m10-4v4',
    fuel_compressor:
      'M6 4h12a3 3 0 0 1 0 6H6a3 3 0 0 1 0-6zM6 14h12a3 3 0 0 1 0 6H6a3 3 0 0 1 0-6zM8 4v6m8-6v6M8 14v6m8-6v6',
    ballistic_rack: 'M4 21h16M7 21v-4h10v4M6 16V9l4-3 7 5v5zM14 9l4-6 3 2-4 7M10 12h3v3h-3z',
  }
  return (
    <svg
      className="module-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      width={size}
      height={size}
      style={{ flexShrink: 0, opacity }}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : type ? getSubsystemConfig(type).name : 'Empty mount'}
    >
      <path d={type ? paths[type] : 'M5 5h14v14H5zM8 12h8'} />
    </svg>
  )
}
