/**
 * A number, or a word, rising off a sector.
 *
 * The same four beats the flat board uses — pop in, rise 38 board units, hold,
 * fade — turned to face whatever angle the camera is at. The tone's colour is
 * the flat board's, and so is the dark outline: a hull number has to stay
 * readable when it crosses the accretion disc.
 *
 * `offset` is the animator's nudge in board units, so the damage and the
 * shielded number of one hit do not sit on top of each other; the board's y
 * axis is the world's z, and from straight above the two numbers land exactly
 * where the flat board puts them.
 */
import { useEffect, useMemo, useRef } from 'react'
import type { Group, Mesh } from 'three'
import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { Position } from '@dangerous-inclinations/engine'
import { samePosition } from '@dangerous-inclinations/engine'
import type { FloatTone, TableEffect } from '../../../../../context/AnimationContext'
import type { BoardModel } from '../../../model'
import { positionPoint } from '../../../geometry'
import { BOARD_FONT } from '../../fonts'
import { LAYER, elevationAt, toWorld } from '../../world'
import { reportImpact, type ImpactKind } from './impacts'
import { NO_RAYCAST } from './resources'

type FloatEffect = Extract<TableEffect, { kind: 'float' }>

/** The flat board's tones, unchanged. */
const TONE_COLORS: Record<FloatTone, string> = {
  damage: '#ff5a72',
  shield: '#49c3ff',
  heat: '#ff7a45',
  miss: '#93a6bc',
  crit: '#ffb445',
  good: '#46d191',
}

/** A miss is the one tone that does not touch the hull it is written over. */
const REACTION: Partial<Record<FloatTone, ImpactKind>> = {
  damage: 'damage',
  crit: 'crit',
  heat: 'heat',
  shield: 'shield',
  good: 'good',
}

/**
 * Board units. The hull is 64 long, a sector number is 10 high: at this size a
 * float reads from the Table preset without becoming the loudest thing on the
 * table.
 */
const SIZE = 24
/** Clear of the hull, under the rise. */
const HEIGHT = 34
/** The flat board's rise, to the unit. */
const RISE = 38

/**
 * How far a second number on the same sector starts above the first. It is
 * more than the rise, so a number that has been climbing for a second is still
 * below the one that started after it.
 */
const STACK = 64

/**
 * A turn can put four of these on one sector at once — a critical, the damage,
 * what the shield soaked and the tile it broke — and the animator's nudge only
 * separates two of them. Each float takes the lowest free step over its own
 * sector and gives it back when it expires, so a pile-up reads as a list.
 */
const claims = new Map<string, { at: Position; step: number }>()

function claimStep(id: string, at: Position): number {
  const held = claims.get(id)
  if (held) return held.step
  const taken = new Set<number>()
  for (const claim of claims.values()) if (samePosition(claim.at, at)) taken.add(claim.step)
  let step = 0
  while (taken.has(step)) step++
  claims.set(id, { at, step })
  return step
}

/** Troika's text mesh: the two opacities are set per frame, never in React. */
type TextMesh = Mesh & { fillOpacity: number; outlineOpacity: number }

export function Float({
  effect,
  pointOf,
}: {
  effect: FloatEffect
  pointOf: BoardModel['pointOf']
}) {
  const group = useRef<Group>(null)
  const text = useRef<TextMesh>(null)

  const step = claimStep(effect.id, effect.at)

  // The step is claimed against the sector, so two ships crowded into one still
  // stack their numbers instead of writing over each other; only where the pile
  // stands moves, onto the hull the number is about.
  const anchor = useMemo(() => {
    const at = toWorld(
      pointOf(effect.playerId) ?? positionPoint(effect.at),
      elevationAt(effect.at) + LAYER.effect
    )
    at.x += effect.offset?.x ?? 0
    at.z += effect.offset?.y ?? 0
    at.y += HEIGHT + step * STACK
    return at
  }, [effect.at, effect.playerId, effect.offset, step, pointOf])

  useEffect(
    () => () => {
      claims.delete(effect.id)
    },
    [effect.id]
  )

  useEffect(() => {
    const kind = REACTION[effect.tone]
    if (kind) reportImpact(effect.playerId, kind, effect.start)
  }, [effect.playerId, effect.tone, effect.start])

  useFrame(() => {
    const node = group.current
    const glyphs = text.current
    if (!node || !glyphs) return
    const progress = (performance.now() - effect.start) / effect.duration
    if (progress < 0 || progress >= 1) {
      node.visible = false
      return
    }
    node.visible = true
    node.position.y = anchor.y + RISE * progress
    const opacity =
      progress < 0.1 ? progress / 0.1 : progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1
    const scale =
      progress < 0.18
        ? 0.6 + (progress / 0.18) * 0.55
        : 1.15 - Math.min(1, (progress - 0.18) / 0.2) * 0.15
    node.scale.setScalar(scale)
    glyphs.fillOpacity = Math.max(0, opacity)
    glyphs.outlineOpacity = Math.max(0, opacity)
  })

  return (
    <Billboard ref={group} position={anchor} visible={false}>
      <Text
        ref={text}
        font={BOARD_FONT}
        fontSize={SIZE}
        color={TONE_COLORS[effect.tone]}
        anchorX="center"
        anchorY="middle"
        outlineWidth={SIZE * 0.14}
        outlineColor="#05070b"
        outlineOpacity={1}
        depthOffset={-4}
        renderOrder={12}
        raycast={NO_RAYCAST}
      >
        {effect.text}
      </Text>
    </Billboard>
  )
}
