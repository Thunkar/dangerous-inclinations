/**
 * The cards behind your screen, held as a hand — at the table and at
 * deployment, where they are what the ring and sector are chosen for. They
 * overlap in a fan, each tilted a few degrees about a pivot below the table, so
 * the whole hand is one card tall however many you hold. Point at one (or tab
 * to it) and it lifts clear of its neighbours to be read; click, Enter or Space
 * pins the lift for touch and keyboard, Escape or a click elsewhere drops it.
 *
 * Which card is pointed at is the *band* of the hand the pointer is in, not the
 * element under the pointer: the hand is cut into one vertical band per card,
 * at the edges of the resting fan, and the cards take no pointer events of
 * their own. A card that is already up therefore cannot cover the slice of the
 * card beside it — crossing into the next band lifts that card at once,
 * whatever is raised.
 *
 * They are yours alone: the table sees that you hold them, not what they say.
 * A completed card is the opposite — it is the scoreboard — so it leaves the
 * hand and sits face up in the row of tabs above it. Deployment has none, so
 * there the row simply is not there.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Tooltip, Typography } from '@mui/material'
import type { Cargo, Mission } from '@dangerous-inclinations/engine'
import { describeMission } from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'
import { FAN_CARD_HEIGHT, FAN_CARD_WIDTH, MissionCard } from './MissionCard'
import { missionFamilyColor, missionPoints } from '../../utils/missions'

/**
 * The fan: the total spread in degrees, about a pivot well below the cards, so
 * the tilt is what walks them apart. At three cards that is 43px of step —
 * about 40% of each card showing — and 219px of a 234px column.
 */
const SPREAD = 15
const PIVOT_DEPTH = 2.6
const PIVOT = `50% ${PIVOT_DEPTH * 100}%`
/** Room above the cards for the lift, so a raised card never reaches the label. */
const LIFT = 14
const GROW = 1.06
const HAND_HEIGHT = Math.round(FAN_CARD_HEIGHT * GROW) + LIFT + 6
/** How far a neighbour steps aside for the card being read. */
const MAKE_WAY = 8

/** The arc a card's centre rides on: pivot to centre, in pixels. */
const FAN_RADIUS = FAN_CARD_HEIGHT * (PIVOT_DEPTH - 0.5)

const angleOf = (index: number, count: number) =>
  count > 1 ? -SPREAD / 2 + (index * SPREAD) / Math.max(count - 1, 1) : 0

/** Where a resting card's centre sits, in pixels from the middle of the hand. */
const offsetOf = (index: number, count: number) =>
  FAN_RADIUS * Math.sin((angleOf(index, count) * Math.PI) / 180)

/**
 * The bands. A card is covered on its right by the next one, so the slice of it
 * you can see runs from its own left edge to the left edge of its neighbour:
 * those edges are the cuts, and the two outer bands run off to the sides.
 */
const bandEdge = (index: number, count: number) => offsetOf(index, count) - FAN_CARD_WIDTH / 2

interface MissionHandProps {
  /** Everything the seat holds; the completed ones become the row of tabs. */
  missions: ReadonlyArray<Mission>
  /** Your own cargo, for the progress lines. */
  cargo?: ReadonlyArray<Cargo>
  /** The tank, for the Tanker card's line. */
  fuel?: number
  nameOf: (playerId: string) => string
}

export function MissionHand({ missions, cargo, fuel, nameOf }: MissionHandProps) {
  const held = missions.filter(m => !m.isCompleted)
  const faceUp = missions.filter(m => m.isCompleted)

  return (
    <>
      {faceUp.length > 0 && <FaceUpRow missions={faceUp} nameOf={nameOf} />}
      {held.length > 0 && <Fan missions={held} cargo={cargo} fuel={fuel} nameOf={nameOf} />}
    </>
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

function Fan({
  missions,
  cargo,
  fuel,
  nameOf,
}: {
  missions: ReadonlyArray<Mission>
  cargo: ReadonlyArray<Cargo> | undefined
  fuel: number | undefined
  nameOf: (playerId: string) => string
}) {
  // Pointing lifts a card; clicking, tabbing or tapping pins the lift so the
  // card can be read without a mouse held still on it.
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const lifted = pinned ?? hovered
  const hand = useRef<HTMLDivElement>(null)
  const count = missions.length

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

  /** The card the pointer is over, read off the resting fan rather than off
      whatever element happens to be on top. */
  const bandAt = useCallback(
    (clientX: number) => {
      const box = hand.current?.getBoundingClientRect()
      if (!box) return 0
      const x = clientX - (box.left + box.width / 2)
      let index = 0
      while (index + 1 < count && x >= bandEdge(index + 1, count)) index += 1
      return index
    },
    [count]
  )

  const pin = useCallback((id: string) => setPinned(now => (now === id ? null : id)), [])

  const liftedIndex = missions.findIndex(m => m.id === lifted)

  return (
    <Box
      ref={hand}
      onPointerMove={event => {
        const id = missions[bandAt(event.clientX)]?.id ?? null
        setHovered(now => (now === id ? now : id))
      }}
      onPointerLeave={() => setHovered(null)}
      onClick={event => {
        const id = missions[bandAt(event.clientX)]?.id
        if (id) pin(id)
      }}
      sx={{
        position: 'relative',
        height: HAND_HEIGHT,
        // The hand is exactly as wide as the resting fan and centred in the
        // panel, so every band is a band with a card under it.
        width: FAN_CARD_WIDTH + 2 * offsetOf(count - 1, count),
        maxWidth: '100%',
        mx: 'auto',
        cursor: 'pointer',
      }}
    >
      {missions.map((mission, index) => {
        const angle = angleOf(index, count)
        const up = mission.id === lifted
        const aside = liftedIndex < 0 || up ? 0 : index < liftedIndex ? -MAKE_WAY : MAKE_WAY
        return (
          <Box
            key={mission.id}
            role="button"
            tabIndex={0}
            aria-pressed={up}
            aria-label={describeMission(mission, nameOf)}
            onFocus={() => setHovered(mission.id)}
            onBlur={() => setHovered(now => (now === mission.id ? null : now))}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                pin(mission.id)
              }
              if (event.key === 'Escape') drop()
            }}
            sx={{
              position: 'absolute',
              bottom: 2,
              left: '50%',
              ml: `${-FAN_CARD_WIDTH / 2}px`,
              width: FAN_CARD_WIDTH,
              // The hand owns the pointer: a raised card must not shadow the
              // band of the card beside it. Focus and keys still land here.
              pointerEvents: 'none',
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
              <MissionCard
                mission={mission}
                nameOf={nameOf}
                cargo={cargo}
                fuel={fuel}
                held
                compact
              />
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
