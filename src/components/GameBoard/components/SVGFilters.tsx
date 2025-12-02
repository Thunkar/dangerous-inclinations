import React from 'react'
import { useGame } from '../../../context/GameContext'

/**
 * SVG filter definitions for ship and missile outlines
 * Creates colored outlines with black inner frames for visibility
 */
export function SVGFilters() {
  const { gameState } = useGame()

  const players = gameState.players

  return (
    <defs>
      {players.map(player => (
        <React.Fragment key={player.id}>
          {/* Ship outline filter */}
          <filter
            id={`outline-${player.id}`}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            {/* Create colored outline (outer) */}
            <feMorphology operator="dilate" radius="4" in="SourceAlpha" result="thickenColor" />
            <feFlood floodColor={player.color} result="colorFlood" />
            <feComposite in="colorFlood" in2="thickenColor" operator="in" result="colorOutline" />

            {/* Create black outline (inner, frames the ship) */}
            <feMorphology operator="dilate" radius="1" in="SourceAlpha" result="thickenBlack" />
            <feFlood floodColor="#000000" result="blackFlood" />
            <feComposite in="blackFlood" in2="thickenBlack" operator="in" result="blackOutline" />

            {/* Merge all layers: colored outline, black outline, then ship */}
            <feMerge>
              <feMergeNode in="colorOutline" />
              <feMergeNode in="blackOutline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Missile outline filter (slimmer) */}
          <filter
            id={`missile-outline-${player.id}`}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            {/* Create colored outline (outer, slimmer than ships) */}
            <feMorphology operator="dilate" radius="2" in="SourceAlpha" result="thickenColor" />
            <feFlood floodColor={player.color} result="colorFlood" />
            <feComposite in="colorFlood" in2="thickenColor" operator="in" result="colorOutline" />

            {/* Create black outline (inner, frames the missile) */}
            <feMorphology operator="dilate" radius="1" in="SourceAlpha" result="thickenBlack" />
            <feFlood floodColor="#000000" result="blackFlood" />
            <feComposite in="blackFlood" in2="thickenBlack" operator="in" result="blackOutline" />

            {/* Merge all layers: colored outline, black outline, then missile */}
            <feMerge>
              <feMergeNode in="colorOutline" />
              <feMergeNode in="blackOutline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </React.Fragment>
      ))}
    </defs>
  )
}
