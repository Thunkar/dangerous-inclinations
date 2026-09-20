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

/**
 * The signal bars: four thick, and every step off the dish's mouth is the same
 * 7 units, so the gap between them is the same 3 everywhere and the three read
 * as one axis rather than as three marks.
 */
const SIGNAL_BAR = 4
const SIGNAL_STEP = 7

/**
 * The black hole's spin. One bar, 24 long and 5 thick, laid tangent to a circle
 * of radius 15 — four clear units off a disc of 11 — and slid 9 along its own
 * tangent; three turns of it at 120°. Every bar is the same distance from the
 * disc and the figure is rotationally symmetric: the spin is read from the
 * offset, not from bars at different radii.
 */
const SPIN_BAR = 'M29 47h24v5H29z'
const SPIN_TURNS = [0, 120, 240]

/**
 * The incoming signal: one 13x7 bar stepped twice along the mouth's normal by
 * {@link SIGNAL_STEP}, so the three are parallel by construction and the two
 * gaps cannot differ.
 */
const SIGNAL_BARS = [0, 1, 2]
  .map(step => {
    const x = 30 + (step * SIGNAL_STEP * 7) / 14.765
    const y = 16 - (step * SIGNAL_STEP * 13) / 14.765
    return `M${x.toFixed(1)} ${y.toFixed(1)}L${(x + 13).toFixed(1)} ${(y + 7).toFixed(1)}`
  })
  .join('')

/** A bone: a 6-thick bar, 50 long, with both ends cut off at 45°. */
const BONE = 'M7 50l4-3h42l4 3-4 3H11z'
const BONE_TURNS = [18, -18]

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
  // A dish on its mast, and somebody else's traffic coming into it. The cup is
  // one trapezoid — 34 across the mouth, 18 across the back, 12 deep — turned
  // 30° so the mouth faces the signal; the three bars are the same length and
  // thickness, parallel to the mouth, and step off it by the same distance,
  // so the signal reads as one axis rather than three marks. Nothing touches
  // the dish. The alternative (a mast with three chevrons off its tip) was
  // drawn and dropped: it reads as a transmitter, and this card receives.
  intercept_transmission: (
    <>
      <path d="M13 24h34l-8 12H21z" transform="rotate(30 30 30)" />
      <path d="M24 34h7v21h-7zM17 55h20v5H17z" />
      <path d={SIGNAL_BARS} fill="none" stroke="currentColor" strokeWidth={SIGNAL_BAR} />
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
  // The flag they fly: a skull cut with straight edges — chamfered crown,
  // hexagonal sockets, a notched nose, four teeth — over crossed bones with
  // chisel ends. The bones are one bar turned ±18° about (32,50), so the two
  // are the same bone, and they clear the jaw by five units: at 24px the
  // sockets and the X are the whole read.
  piracy: (
    <>
      <path
        fillRule="evenodd"
        d="M24 2h16l10 10v13l-8 6v7H22v-7l-8-6V12zM21 11h6l3 5-3 7h-6l-3-7zM43 11h-6l-3 5 3 7h6l3-7zM32 24l5 7H27zM26 33h2.5v5H26zM31 33h2.5v5H31zM36 33h2.5v5H36z"
      />
      {BONE_TURNS.map(turn => (
        <path key={turn} d={BONE} transform={`rotate(${turn} 32 50)`} />
      ))}
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
