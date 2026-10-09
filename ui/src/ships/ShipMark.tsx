import { resolveShipAppearance, type ShipAppearance } from '@dangerous-inclinations/engine'
import { HULL_INFO } from './hulls'

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
      aria-label={`${HULL_INFO[a.hull].name} hull`}
    >
      <g stroke="#121417" strokeWidth="2" strokeLinejoin="round">
        {a.hull === 'shrike' ? (
          <ShrikeTop paint={a.paint} trim={a.secondaryPaint} accent={accent} />
        ) : a.hull === 'mantis' ? (
          <MantisTop paint={a.paint} trim={a.secondaryPaint} accent={accent} />
        ) : (
          <CorvetteTop paint={a.paint} trim={a.secondaryPaint} accent={accent} />
        )}
      </g>
    </svg>
  )
}

interface Inks {
  paint: string
  trim: string
  accent: string
}

function CorvetteTop({ paint, trim, accent }: Inks) {
  return (
    <>
      <path fill="#6e7174" d="M9 15h23v15H9l-5-3V18zM3 30h31v17H3zM9 47h23v15H9l-5-3V50z" />
      <path fill={paint} d="M24 12h40l7 4h66l17 10 13 3v22l-13 3-17 10H71l-7 4H24z" />
      <path fill={trim} d="M26 13h32l9 8v35l-9 10H26zM73 18h62l12 8v27l-12 9H73z" />
      <path fill={paint} d="M66 23h26v33H66zM96 23h29v33H96zM130 25l18 5v18l-18 6z" />
      <path fill="#1e2024" d="M27 30h25v19H27zM62 34h70v10H62zM151 30h13v19h-13z" />
      <path fill={trim} d="M33 34h14v11H33zM101 32h28v14h-28z" />
      <path
        fill={accent}
        d="M69 19h61v5H69zM69 55h61v5H69zM140 24l9 5v5l-9-5zM140 49l9-5v5l-9 5z"
      />
      <path stroke="#3fb0c8" d="M7 20v5M5 35v8M7 52v5" />
    </>
  )
}

/**
 * The shrike from above, bow to the right: the shroud and its cheeks round the
 * centre bell, the chassis between the flank columns, the cockpit running
 * forward over the nose, and the chin intake reaching past it.
 */
function ShrikeTop({ paint, trim, accent }: Inks) {
  return (
    <>
      <path fill={paint} d="M30 19h12v3H30zM30 54h12v3H30z" />
      <path fill="#1e2024" d="M33 30h10v16H33z" />
      <path fill={paint} d="M45 19h12l4 3h42l4 2v28l-4 2H61l-4 3H45l-3-3V22z" />
      <path fill={trim} d="M64 25h36v26H64z" />
      <path fill={paint} d="M103 22l14 3v26l-14 3z" />
      <path fill={trim} d="M134 25l12 1v24l-12 1z" />
      <path fill={paint} d="M117 24l17 1v26l-17 1z" />
      <path fill="#1e2024" d="M133 28h3v20h-3z" />
      <path fill={paint} d="M66 26h37l15 6v12l-15 6H66z" />
      <path fill="#1e2024" d="M92 30h14l10 4v8l-10 4H92z" />
      <path fill={trim} d="M47 36h44v4H47z" />
      <path fill={accent} d="M66 22h34v3H66zM66 51h34v3H66z" />
      <path stroke="#3fb0c8" d="M35 34v8" />
    </>
  )
}

/**
 * The mantis from above, bow to the right: one engine cluster at the point of
 * the V, the core and its citadel, the braces out to the slim arms that reach
 * forward, the bow mount standing on the core between them.
 */
function MantisTop({ paint, trim, accent }: Inks) {
  return (
    <>
      <path fill="#6e7174" d="M37 22h11v32H37z" />
      <path fill="#1e2024" d="M33 33h4v10h-4z" />
      <path fill={paint} d="M55 27l20-23h11v14L66 32zM55 49l20 23h11V58L66 44z" />
      <path fill={paint} d="M75 4h72l7 4v6l-7 4H75zM75 58h72l7 4v6l-7 4H75z" />
      <path fill={paint} d="M48 26h33l3 3v18l-3 3H48z" />
      <path fill={trim} d="M84 6h60v8H84zM84 62h60v8H84z" />
      <path fill={trim} d="M53 30h23l4 3v10l-4 3H53z" />
      <path fill="#1e2024" d="M76 31h2v14h-2z" />
      <path fill={accent} d="M88 4h50v2H88zM88 70h50v2H88z" />
      <path stroke="#3fb0c8" d="M35 35v6" />
    </>
  )
}
