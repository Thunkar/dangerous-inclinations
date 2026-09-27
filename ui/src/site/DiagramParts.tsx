/**
 * The drawn pieces of every printed diagram: a caption in capitals, an
 * unrolled ring and the arrowheads (`diagram.ts` holds the inks and the ids).
 */
import { GUIDE_TAG, INK, RED, type ArrowHeadSet, type TagFace } from './diagram'

/** A caption in capitals. */
export function Tag({
  x,
  y,
  children,
  anchor = 'start',
  color = INK,
  face = GUIDE_TAG,
}: {
  x: number
  y: number
  children: string
  anchor?: 'start' | 'middle' | 'end'
  color?: string
  face?: TagFace
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontFamily={face.font}
      fontWeight={face.weight}
      fontSize={face.size}
      letterSpacing={face.spacing}
      fill={color}
    >
      {children.toUpperCase()}
    </text>
  )
}

/** A ring, unrolled into a line from `from` to `to`, ticked off in sectors from `first` every `step`. */
export function Ring({
  y,
  from,
  to,
  first,
  step,
  tick,
  weight,
  tickWeight,
}: {
  y: number
  from: number
  to: number
  first: number
  step: number
  /** Half a tick's height. */
  tick: number
  weight: number
  tickWeight: number
}) {
  const ticks: number[] = []
  for (let x = first; x < to; x += step) ticks.push(x)
  return (
    <>
      <line x1={from} y1={y} x2={to} y2={y} stroke={INK} strokeWidth={weight} />
      {ticks.map(x => (
        <line
          key={x}
          x1={x}
          y1={y - tick}
          x2={x}
          y2={y + tick}
          stroke={INK}
          strokeWidth={tickWeight}
        />
      ))}
    </>
  )
}

/** The arrowheads of `useArrowHeads`, drawn: they go inside the diagram's `<svg>`. */
export function ArrowHeads({ heads }: { heads: ArrowHeadSet }) {
  const head = (name: 'red' | 'ink', fill: string) => (
    <marker
      id={`${heads.id}-${name}`}
      viewBox="0 0 10 10"
      refX={heads.sizes.refX}
      refY="5"
      markerWidth={heads.sizes[name]}
      markerHeight={heads.sizes[name]}
      orient="auto"
    >
      <path d="M0 0L10 5L0 10z" fill={fill} />
    </marker>
  )
  return (
    <defs>
      {head('red', RED)}
      {head('ink', INK)}
    </defs>
  )
}
