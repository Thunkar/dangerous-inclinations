/**
 * The card's pieces: a face at true size, a subsystem's mark, the small marks
 * the tiles share that `../marks` does not (damage, a missile, face up), and a
 * line set from the engine's numbers.
 */
import type { ReactNode } from 'react'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { SUBSYSTEM_PATHS } from '../../art/subsystemArt'
import { TRACED_PATHS } from '../../art/paths'
import { PRESS } from '../../design/press'
import { rich } from '../../utils/rich'
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from '../print/frame'
import { SX_BAND_MM } from './sheet'
import { NUM } from './facts'

/**
 * A card face, drawn in millimetres and scaled for the screen by `--sx-zoom`:
 * the face is the frame's ink (`print/frame.ts`), `SX_BAND_MM` of it round
 * the grid on either face, and the grid's gutters let it through, so frame
 * and lattice are one surface with no seam between them.
 */
export function Face({ children }: { children: ReactNode }) {
  return (
    <div
      className="sx-frame"
      style={{
        width: `calc(${CARD_WIDTH_MM}mm * var(--sx-zoom))`,
        height: `calc(${CARD_HEIGHT_MM}mm * var(--sx-zoom))`,
      }}
    >
      <div
        className="sx-face"
        style={{
          width: `${CARD_WIDTH_MM}mm`,
          height: `${CARD_HEIGHT_MM}mm`,
          padding: `${SX_BAND_MM}mm`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** A subsystem's stencil, in the colour of whatever holds it. */
export function Mark({ type, size }: { type: SubsystemType; size: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="currentColor"
      style={{ width: `${size}mm`, height: `${size}mm`, display: 'block', flex: 'none' }}
      aria-hidden="true"
      focusable="false"
    >
      <path fillRule="evenodd" d={SUBSYSTEM_PATHS[type]} />
    </svg>
  )
}

/** A line with the engine's numbers in its slots, its `<b>` set bold and its `<r>` red. */
export const say = (text: string) =>
  rich(text, NUM, {
    r: children => <span style={{ color: PRESS.red, fontWeight: 700 }}>{children}</span>,
  })

/** A small mark drawn in a 10 box, in the colour of whatever holds it. */
function Glyph({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="currentColor"
      style={{ width: `${size}mm`, height: `${size}mm`, display: 'block', flex: 'none' }}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Damage: the traced hull-damage mark, the same picture as the shared Hull mark. */
export const DamageIcon = ({ size }: { size: number }) => (
  <svg
    viewBox="0 0 64 64"
    fill="currentColor"
    style={{ width: `${size}mm`, height: `${size}mm`, display: 'block', flex: 'none' }}
    aria-hidden="true"
    focusable="false"
  >
    <path fillRule="evenodd" d={TRACED_PATHS.damage} />
  </svg>
)

/** A missile, nose up, in a 10 box. */
export const MISSILE_PATH =
  'M5 0 L6.3 2.6 L6.3 7 L8 9.6 L5.8 9 L5 10 L4.2 9 L2 9.6 L3.7 7 L3.7 2.6 Z'

/** A missile, nose up. */
export const MissileIcon = ({ size }: { size: number }) => (
  <Glyph size={size}>
    <path d={MISSILE_PATH} />
  </Glyph>
)

/** Face-up: a tile turned over, its back behind it. */
export const FaceUpIcon = ({ size }: { size: number }) => (
  <Glyph size={size}>
    <rect
      x={0.6}
      y={1.6}
      width={5.6}
      height={7.6}
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
    />
    <rect x={3.8} y={0.4} width={5.6} height={7.6} />
  </Glyph>
)
