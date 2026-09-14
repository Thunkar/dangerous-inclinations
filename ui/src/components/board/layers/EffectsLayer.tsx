/**
 * Transient effects: weapon beams, bursts and floating numbers. Everything is
 * pushed by AnimationContext from the turn's events and fades on its own.
 */
import { memo } from 'react'
import type { TableEffect } from '../../../context/AnimationContext'
import { FONT_MONO } from '../../../theme'

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
  now,
}: {
  effects: ReadonlyArray<TableEffect>
  now: number
}) {
  return (
    <g className="effects" pointerEvents="none">
      {effects.map((effect) => {
        const progress = Math.min(1, Math.max(0, (now - effect.start) / effect.duration))
        if (effect.kind === 'beam') {
          const fade = progress < 0.25 ? progress / 0.25 : 1 - (progress - 0.25) / 0.75
          const head = Math.min(1, progress / 0.3)
          const x = effect.from.x + (effect.to.x - effect.from.x) * head
          const y = effect.from.y + (effect.to.y - effect.from.y) * head
          const dashed = effect.weapon === 'missiles' || effect.weapon === 'ballistic_rack'
          return (
            <g key={effect.id} opacity={Math.max(0, fade)}>
              <line
                x1={effect.from.x}
                y1={effect.from.y}
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
          return (
            <circle
              key={effect.id}
              cx={effect.at.x}
              cy={effect.at.y}
              r={r}
              fill="none"
              stroke={effect.color}
              strokeWidth={3 * (1 - progress) + 1}
              opacity={1 - progress}
            />
          )
        }
        const rise = -38 * progress
        const opacity = progress < 0.1 ? progress / 0.1 : progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1
        const scale = progress < 0.18 ? 0.6 + (progress / 0.18) * 0.55 : 1.15 - Math.min(1, (progress - 0.18) / 0.2) * 0.15
        return (
          <g
            key={effect.id}
            opacity={Math.max(0, opacity)}
            transform={`translate(${effect.at.x} ${effect.at.y + rise}) scale(${scale})`}
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
