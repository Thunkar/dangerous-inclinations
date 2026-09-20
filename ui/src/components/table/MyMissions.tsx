/**
 * The cards behind your screen, held as a hand: they overlap in a fan at the
 * top of the left column, each tilted a few degrees about a pivot below the
 * table, so the whole hand is one card tall however many you hold. Point at one
 * (or tab to it) and it lifts clear of its neighbours to be read; click, Enter
 * or Space pins the lift for touch and keyboard, Escape or a click elsewhere
 * drops it.
 *
 * They are yours alone: the table sees that you hold them, not what they say.
 * A completed card is the opposite — it is the scoreboard — so it leaves the
 * hand and sits face up in the row of tabs above it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Tooltip, Typography } from '@mui/material'
import type { Mission, Player } from '@dangerous-inclinations/engine'
import { describeMission } from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'
import { Panel } from '../common/Panel'
import { FAN_CARD_HEIGHT, FAN_CARD_WIDTH, MissionCard } from '../common/MissionCard'
import { missionFamilyColor, missionPoints } from '../../utils/missions'
import { useGame } from '../../context/GameContext'

/**
 * The fan: the total spread in degrees, about a pivot well below the cards, so
 * the tilt is what walks them apart. At three cards that is 43px of step —
 * about 40% of each card showing — and 219px of a 234px column.
 */
const SPREAD = 15
const PIVOT = '50% 260%'
/** Room above the cards for the lift, so a raised card never reaches the label. */
const LIFT = 14
const GROW = 1.06
const HAND_HEIGHT = Math.round(FAN_CARD_HEIGHT * GROW) + LIFT + 6
/** How far a neighbour steps aside for the card being read. */
const MAKE_WAY = 8

export function MyMissions({ me }: { me: Player }) {
  const { nameOf, view } = useGame()
  const held = me.missions.filter(m => !m.isCompleted)
  const faceUp = me.missions.filter(m => m.isCompleted)

  return (
    <Panel
      title={`Points ${me.completedMissionCount}/${view.pointsToWin}`}
      dense
      collapseId="points"
      sx={{ flexShrink: 0, minWidth: 0 }}
    >
      {faceUp.length > 0 && <FaceUpRow missions={faceUp} nameOf={nameOf} />}
      {held.length > 0 && <Hand missions={held} cargo={me.cargo} nameOf={nameOf} />}
      {me.missions.length === 0 && (
        <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
          No missions yet.
        </Typography>
      )}
    </Panel>
  )
}

/** The scoreboard: a tidy row of tabs, family colour and points, face up. */
function FaceUpRow({
  missions,
  nameOf,
}: {
  missions: ReadonlyArray<Mission>
  nameOf: (playerId: string) => string
}) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.75 }}>
      {missions.map(mission => (
        <Tooltip key={mission.id} title={describeMission(mission, nameOf)}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 30,
              height: 20,
              px: 0.5,
              bgcolor: missionFamilyColor(mission),
              border: '1px solid #14161a',
              color: '#14161a',
            }}
          >
            <Typography sx={{ fontFamily: FONT_MONO, fontWeight: 800, fontSize: '0.72rem' }}>
              {missionPoints(mission)}
            </Typography>
          </Box>
        </Tooltip>
      ))}
    </Box>
  )
}

function Hand({
  missions,
  cargo,
  nameOf,
}: {
  missions: ReadonlyArray<Mission>
  cargo: Player['cargo']
  nameOf: (playerId: string) => string
}) {
  // Pointing lifts a card; clicking, tabbing or tapping pins the lift so the
  // card can be read without a mouse held still on it.
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const lifted = pinned ?? hovered
  const hand = useRef<HTMLDivElement>(null)

  const drop = useCallback(() => {
    setPinned(null)
    setHovered(null)
  }, [])

  useEffect(() => {
    if (!pinned) return
    const away = (event: PointerEvent) => {
      if (!hand.current?.contains(event.target as Node)) drop()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') drop()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [pinned, drop])

  const last = Math.max(missions.length - 1, 1)
  const liftedIndex = missions.findIndex(m => m.id === lifted)

  return (
    <Box
      ref={hand}
      onMouseLeave={() => setHovered(null)}
      sx={{ position: 'relative', height: HAND_HEIGHT, minWidth: 0 }}
    >
      {missions.map((mission, index) => {
        const angle = missions.length > 1 ? -SPREAD / 2 + (index * SPREAD) / last : 0
        const up = mission.id === lifted
        const aside = liftedIndex < 0 || up ? 0 : index < liftedIndex ? -MAKE_WAY : MAKE_WAY
        return (
          <Box
            key={mission.id}
            role="button"
            tabIndex={0}
            aria-pressed={up}
            aria-label={describeMission(mission, nameOf)}
            onMouseEnter={() => setHovered(mission.id)}
            onFocus={() => setHovered(mission.id)}
            onBlur={() => setHovered(now => (now === mission.id ? null : now))}
            onClick={() => setPinned(now => (now === mission.id ? null : mission.id))}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setPinned(now => (now === mission.id ? null : mission.id))
              }
              if (event.key === 'Escape') drop()
            }}
            sx={{
              position: 'absolute',
              bottom: 2,
              left: '50%',
              ml: `${-FAN_CARD_WIDTH / 2}px`,
              width: FAN_CARD_WIDTH,
              cursor: 'pointer',
              // The fan is a rotation about a pivot below the table, so
              // straightening a card also walks it back to the middle.
              transformOrigin: PIVOT,
              transform: `translateX(${aside}px) rotate(${up ? 0 : angle}deg)`,
              transition: 'transform 140ms ease-out',
              zIndex: up ? 10 : index,
              '&:focus-visible': { outline: `2px solid ${TABLE.accent}`, outlineOffset: 2 },
            }}
          >
            {/* The lift is its own transform: scaling about the fan's far
                pivot would throw the card a third of the panel upwards. */}
            <Box
              sx={{
                transformOrigin: '50% 100%',
                transform: up ? `translateY(${-LIFT}px) scale(${GROW})` : 'none',
                transition: 'transform 140ms ease-out',
              }}
            >
              <MissionCard mission={mission} nameOf={nameOf} cargo={cargo} held compact />
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
