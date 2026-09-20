/**
 * Card art: one poster glyph per mission type. These are silhouettes, not
 * diagrams — filled polygons and a few heavy bars, cut with straight edges, the
 * way a stencil or a lino block cuts. A circle appears only where the game has
 * one: the black hole's disc.
 *
 * Everything is `currentColor`, so the card decides whether the mark is black
 * ink or bare paper, and the whole set lives on a 64x64 viewBox. The weight is
 * chosen so the mark still reads at 40px in a fanned hand and holds together at
 * 90px on the shipyard's card.
 */
import type { MissionType } from '@dangerous-inclinations/engine'
import type { ReactElement } from 'react'

/** A bar is a bar: heavy enough to be a shape rather than a line. */
const BAR = 5

/** The black hole's spin: same bar, three turns, each one further out. */
const SPIN = [
  { turn: 0, d: 'M18 46h28v5H18z' },
  { turn: 120, d: 'M20 49h26v5H20z' },
  { turn: 240, d: 'M22 52h24v5H22z' },
]

const ART: Record<MissionType, ReactElement> = {
  // A gunsight, and a hull sitting in it.
  destroy_ship: (
    <>
      <path d="M3 3h22v6H9v16H3zM61 3v22h-6V9H39V3zM3 61V39h6v16h16v6zM61 61H39v-6h16V39h6z" />
      <path d="M32 14l15 37-15-9-15 9z" />
    </>
  ),
  // A crate, and the wall of the station it is owed to. Crate, chevron and
  // module share the centre line y=32 with a 5 unit gap between each.
  deliver_cargo: (
    <>
      <path
        fillRule="evenodd"
        d="M18 17l14 7v16l-14 7-14-7V24zM16.7 31h2.6v15h-2.6zM17.9 29.9L6.6 24.2 5.4 26.6l11.3 5.7zM18.1 29.9l11.3-5.7 1.2 2.4-11.3 5.7z"
      />
      <path d="M37 24l11 8-11 8z" />
      <path d="M53 10h7v44h-7z" />
    </>
  ),
  // A dish, and somebody else's traffic coming into it.
  intercept_transmission: (
    <>
      <path d="M6 16L31 5l-5 25z" />
      <path d="M23 26h6v24h-6zM12 48h28v6H12z" />
      <path d="M35 20l9-9M39 30l13-13M43 40l16-16" stroke="currentColor" strokeWidth={BAR} />
    </>
  ),
  // The hole, and the fact that it turns. Three straight bars thrown round the
  // disc, each one a little further out than the last and all ending on the
  // same leading edge: a ring unwinding, which is a rotation drawn in straight
  // lines.
  survey: (
    <>
      <circle cx="32" cy="32" r="11" />
      {SPIN.map(({ turn, d }) => (
        <path key={turn} d={d} transform={`rotate(${turn} 32 32)`} />
      ))}
    </>
  ),
  // Two hulls in one sector, with a tube between them.
  board: (
    <>
      <path d="M2 20h14l10 12-10 12H2l5-12z" />
      <path d="M62 20H48L38 32l10 12h14l-5-12z" />
      <path d="M26 28h12v8H26z" />
    </>
  ),
  // A load, dropped down the hole. Four units of air above the arrow and four
  // below it: the load is falling, not resting on the disc.
  garbage_disposal: (
    <>
      <path d="M18 4h28v14H18z" />
      <path d="M29 22h6v8h-6zM32 39L22 29h20z" />
      <circle cx="32" cy="52" r="9" />
    </>
  ),
}

/** The three-letter code stamped in the card's corner. */
export const MISSION_CODE: Record<MissionType, string> = {
  destroy_ship: 'DSY',
  deliver_cargo: 'DLV',
  intercept_transmission: 'ICT',
  survey: 'SVY',
  board: 'BRD',
  garbage_disposal: 'GBG',
}

/**
 * The poster's picture, in the colour of whatever encloses it. Decorative: the
 * card says in words what the picture says in shapes.
 */
export function MissionGlyph({ type, size }: { type: MissionType; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="currentColor"
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {ART[type]}
    </svg>
  )
}
