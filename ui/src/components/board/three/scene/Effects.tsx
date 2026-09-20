/**
 * The turn in motion: beams, bursts and the numbers that float off a hull.
 *
 * Every effect is pushed by the animator from the turn's events and carries
 * the moment it started and how long it lives, so each one reads the frame
 * clock in `useFrame` and React never hears about a frame: this component
 * renders when an effect appears or expires, a few times a turn, and not once
 * in between.
 *
 * What each mark means is the flat board's `EffectsLayer`, and the timing is
 * the animator's to the millisecond — only the drawing is new. A `tween` draws
 * nothing at all: it exists to keep the clock alive while a token slides.
 *
 * `pointOf` comes down from the model so that a mark about a ship lands on the
 * hull rather than on the middle of its sector, which is not the same place
 * once two ships stand in one cell.
 */
import { memo, useEffect } from 'react'
import { Text } from '@react-three/drei'
import type { BoardModel } from '../../model'
import { BOARD_FONT } from '../fonts'
import { Beam } from './effects/Beam'
import { Burst } from './effects/Burst'
import { Float } from './effects/Float'
import { clearImpacts } from './effects/impacts'
import { NO_RAYCAST, disposeEffectResources } from './effects/resources'
import { countRender } from './effects/renders'

/**
 * Troika draws each glyph the first time something asks for it, and it does
 * the work in a worker: a number that lives for a second can be half over
 * before its letters arrive. This string is never seen — it is here so that
 * every character a float can use is in the atlas before the first shot of the
 * game is fired.
 */
const FLOAT_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -+!'

export const Effects = memo(function Effects({
  effects,
  pointOf,
}: {
  effects: BoardModel['effects']
  pointOf: BoardModel['pointOf']
}) {
  countRender('Effects')

  // The shared buffers and the material pool belong to the board, not to any
  // one effect: they go back to the GPU when the 3D board does.
  useEffect(
    () => () => {
      disposeEffectResources()
      clearImpacts()
    },
    []
  )

  return (
    <>
      <Text font={BOARD_FONT} fontSize={0.01} visible={false} raycast={NO_RAYCAST}>
        {FLOAT_GLYPHS}
      </Text>
      {effects.map(effect => {
        if (effect.kind === 'beam')
          return <Beam key={effect.id} effect={effect} pointOf={pointOf} />
        if (effect.kind === 'burst')
          return <Burst key={effect.id} effect={effect} pointOf={pointOf} />
        if (effect.kind === 'float')
          return <Float key={effect.id} effect={effect} pointOf={pointOf} />
        return null
      })}
    </>
  )
})
