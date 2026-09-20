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

/**
 * The black hole's spin. One bar, 24 long and 5 thick, laid tangent to a circle
 * of radius 15 — four clear units off a disc of 11 — and slid 9 along its own
 * tangent; three turns of it at 120°. Every bar is the same distance from the
 * disc and the figure is rotationally symmetric: the spin is read from the
 * offset, not from bars at different radii.
 */
const SPIN_BAR = 'M29 47h24v5H29z'
const SPIN_TURNS = [0, 120, 240]

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
  // The hole, and the fact that it turns: three identical bars tangent to the
  // same circle, each slid the same way round it.
  survey: (
    <>
      <circle cx="32" cy="32" r="11" />
      {SPIN_TURNS.map(turn => (
        <path key={turn} d={SPIN_BAR} transform={`rotate(${turn} 32 32)`} />
      ))}
    </>
  ),
  // Somebody else's crate, and the claw coming down on it: a cable, and two
  // angular jaws that splay out and hook back in, six clear units above the
  // box. Open arms rather than a closed frame — jaws drawn round the crate
  // read as a badge, not as a grab.
  piracy: (
    <>
      <path d="M30 2h4v10h-4z" />
      <path
        d="M32 12L14 22v10l8 6M32 12l18 10v10l-8 6"
        fill="none"
        stroke="currentColor"
        strokeWidth={BAR}
      />
      <path fillRule="evenodd" d="M11 44h42v16H11zM17 50h30v3H17z" />
    </>
  ),
  // A banded drum, and a hose pumping into the station's wall. The nozzle
  // points at the wall, so the fuel is arriving rather than leaving.
  tanker: (
    <>
      <path fillRule="evenodd" d="M4 10h24v44H4zM7 22h18v3H7zM7 39h18v3H7z" />
      <path d="M28 29h10v6H28zM38 24l9 8-9 8z" />
      <path d="M50 20h9v32h-9zM53 4h3v12h-3z" />
    </>
  ),
}

/** The three-letter code stamped in the card's corner. */
export const MISSION_CODE: Record<MissionType, string> = {
  destroy_ship: 'DSY',
  deliver_cargo: 'DLV',
  intercept_transmission: 'ICT',
  survey: 'SVY',
  piracy: 'PRC',
  tanker: 'TNK',
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
