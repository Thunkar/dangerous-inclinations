/**
 * Transient effects: weapon beams, bursts and floating numbers. Everything is
 * pushed by AnimationContext from the turn's events and fades on its own.
 *
 * An effect is anchored to a ship where it is about one and to a sector where
 * it is about a place: the model's `pointOf` knows where a hull is actually
 * drawn, which is beside the centre of its sector whenever somebody else is
 * standing in it, and the sector is the fallback. A float may carry a small
 * nudge in board units so two of them on one ship do not sit on top of each
 * other.
 */
import { memo } from 'react'
import type { TableEffect } from '../../../../context/AnimationContext'
import { FONT_MONO } from '../../../../theme'
import { positionPoint } from '../../geometry'
import type { BoardModel } from '../../model'

const TONE_COLORS = {
  damage: '#ff5a72',
  shield: '#49c3ff',
  heat: '#ff7a45',
  miss: '#93a6bc',
  crit: '#ffb445',
  good: '#46d191',
} as const

export const EffectsLayer = memo(function EffectsLayer({
  effects,
  pointOf,
  now,
}: {
  effects: ReadonlyArray<TableEffect>
  pointOf: BoardModel['pointOf']
  now: number
}) {
  return (
    <g className="effects" pointerEvents="none">
      {effects.map(effect => {
        const progress = Math.min(1, Math.max(0, (now - effect.start) / effect.duration))
        if (effect.kind === 'beam') {
          const fade = progress < 0.25 ? progress / 0.25 : 1 - (progress - 0.25) / 0.75
          const head = Math.min(1, progress / 0.3)
          const from = (effect.fromId ? pointOf(effect.fromId) : null) ?? positionPoint(effect.from)
          const to = (effect.toId ? pointOf(effect.toId) : null) ?? positionPoint(effect.to)
          const x = from.x + (to.x - from.x) * head
          const y = from.y + (to.y - from.y) * head
          const dashed = effect.weapon === 'missiles' || effect.weapon === 'ballistic_rack'
          return (
            <g key={effect.id} opacity={Math.max(0, fade)}>
              <line
                x1={from.x}
                y1={from.y}
                x2={x}
                y2={y}
                stroke={effect.color}
                strokeWidth={effect.weapon === 'railgun' ? 5 : 3}
                strokeLinecap="round"
                strokeDasharray={dashed ? '6 5' : undefined}
              />
              <circle cx={x} cy={y} r={4} fill={effect.color} />
            </g>
          )
        }
        if (effect.kind === 'burst') {
          const r = effect.radius * (0.3 + progress * 0.9)
          const at = pointOf(effect.playerId) ?? positionPoint(effect.at)
          return (
            <circle
              key={effect.id}
              cx={at.x}
              cy={at.y}
              r={r}
              fill="none"
              stroke={effect.color}
              strokeWidth={3 * (1 - progress) + 1}
              opacity={1 - progress}
            />
          )
        }
        if (effect.kind !== 'float') return null
        const anchor = pointOf(effect.playerId) ?? positionPoint(effect.at)
        const at = {
          x: anchor.x + (effect.offset?.x ?? 0),
          y: anchor.y + (effect.offset?.y ?? 0),
        }
        const rise = -38 * progress
        const opacity =
          progress < 0.1 ? progress / 0.1 : progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1
        const scale =
          progress < 0.18
            ? 0.6 + (progress / 0.18) * 0.55
            : 1.15 - Math.min(1, (progress - 0.18) / 0.2) * 0.15
        return (
          <g
            key={effect.id}
            opacity={Math.max(0, opacity)}
            transform={`translate(${at.x} ${at.y + rise}) scale(${scale})`}
          >
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={15}
              fontWeight={800}
              fontFamily={FONT_MONO}
              stroke="#05070b"
              strokeWidth={4}
              strokeLinejoin="round"
            >
              {effect.text}
            </text>
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={15}
              fontWeight={800}
              fontFamily={FONT_MONO}
              fill={TONE_COLORS[effect.tone]}
            >
              {effect.text}
            </text>
          </g>
        )
      })}
    </g>
  )
})
