/**
 * The front door.
 *
 * Three ways in, because the game is three things: a client that plays it
 * against bots, the tools a real table wants, and the cheatsheet that teaches
 * it and prints the player card. Whatever number is stated here is read from
 * the engine, so the page cannot promise a rule the code does not keep.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import {
  DEFAULT_POINTS_TO_WIN,
  MAX_HEAT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MISSIONS_PER_PLAYER,
  SECTORS_PER_RING,
} from '@dangerous-inclinations/engine'
import { BAND_ANGLE, FONT_DISPLAY, PRESS } from '../design/press'
import type { Route } from './routes'
import { SiteLink } from './SiteLink'
import { SiteFooter, SiteHeader } from './SiteChrome'
import { Body, Display, Kicker, Numeral, Slab } from './poster'

const COLUMN = { maxWidth: 1120, mx: 'auto', px: { xs: 2, sm: 4 } } as const

// ---------------------------------------------------------------------------
// The poster
// ---------------------------------------------------------------------------

/**
 * The hero's picture: the black hole with its rings, pierced by the red wedge
 * every printed thing carries at the cards' angle, a planet with the lane out
 * to it, and a ship riding the drift. Straight cuts and circles, flat, the way
 * the cards are drawn.
 */
function PosterArt() {
  const cx = 290
  const cy = 360
  const rings = [148, 194, 240]
  const rad = (deg: number) => (deg * Math.PI) / 180
  const at = (r: number, deg: number) =>
    [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))] as const

  // The wedge: a point low on the left, widening along the band angle through
  // the hole and off the top right.
  const dir = [Math.cos(rad(BAND_ANGLE)), -Math.sin(rad(BAND_ANGLE))] as const
  const normal = [-dir[1], dir[0]] as const
  const tip = [cx - 330 * dir[0], cy - 330 * dir[1]] as const
  const far = [cx + 420 * dir[0], cy + 420 * dir[1]] as const
  const half = 92
  const wedge = `M${tip[0]} ${tip[1]}L${far[0] + half * normal[0]} ${far[1] + half * normal[1]}L${
    far[0] - half * normal[0]
  } ${far[1] - half * normal[1]}z`

  // The ship at the foot of the middle ring, with the arc it drifted.
  const shipAt = 104
  const [sx, sy] = at(rings[1], shipAt)

  // The lane: from the hole's outer ring up to the planet's.
  const planet = [82, 92] as const
  const [lx0, ly0] = at(rings[2], 180)

  return (
    <svg
      viewBox="0 0 540 620"
      role="img"
      aria-label="A black hole with three rings pierced by a red wedge, a planet, and a ship drifting on the middle ring"
      style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
    >
      <circle cx={cx} cy={cy} r={110} fill={PRESS.ink} />
      <path d={wedge} fill={PRESS.red} />
      {rings.map(r => (
        <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={PRESS.ink} strokeWidth={3} />
      ))}

      <circle cx={planet[0]} cy={planet[1]} r={62} fill="none" stroke={PRESS.ink} strokeWidth={3} />
      <circle cx={planet[0]} cy={planet[1]} r={36} fill={PRESS.teal} />
      <path
        d={`M${lx0} ${ly0}Q${lx0 - 6} ${ly0 - 58} ${planet[0] - 59} ${planet[1] + 20}`}
        fill="none"
        stroke={PRESS.ink}
        strokeWidth={7}
        strokeDasharray="12 8"
      />

      <path
        transform={`translate(${sx} ${sy}) rotate(${shipAt + 90})`}
        d="M24 0L-15 -16L-15 16z"
        fill={PRESS.ink}
      />

      {/* The stamp: the points that end the round. */}
      <g transform="translate(468 552)">
        <circle r={52} fill={PRESS.red} />
        <circle r={44} fill="none" stroke={PRESS.paper} strokeWidth={4} />
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// The doors
// ---------------------------------------------------------------------------

type DoorTone = 'ink' | 'red' | 'paper'

const DOORS: Array<{ route: Route; tone: DoorTone; title: string; blurb: string; cta: string }> = [
  {
    route: { kind: 'play' },
    tone: 'ink',
    title: 'Play',
    blurb:
      'The video game: a live table against bots or friends, on a flat board or in 3D. It is where the rules are playtested, so it always plays them as they stand.',
    cta: 'Take a seat',
  },
  {
    route: { kind: 'tools', tool: null },
    tone: 'red',
    title: 'Table tools',
    blurb:
      'For a game with real tiles and cubes: the board as a route planner, a heat check that does the sums, and a fistful of d10s for a salvo.',
    cta: 'Open the tools',
  },
  {
    route: { kind: 'card' },
    tone: 'paper',
    title: 'Cheatsheet',
    blurb:
      'How to play, in the order a first game meets it, and the two-sided player card to print and cut for every seat.',
    cta: 'Learn the game',
  },
]

const DOOR_LOOK: Record<DoorTone, { bg: string; fg: string; soft: string; num: string }> = {
  ink: { bg: PRESS.ink, fg: PRESS.paper, soft: PRESS.paperSoft, num: PRESS.red },
  red: { bg: PRESS.red, fg: PRESS.paper, soft: PRESS.paper, num: PRESS.ink },
  paper: { bg: PRESS.paper, fg: PRESS.ink, soft: PRESS.inkSoft, num: PRESS.red },
}

function Doors() {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
        border: `4px solid ${PRESS.ink}`,
      }}
    >
      {DOORS.map((door, index) => {
        const look = DOOR_LOOK[door.tone]
        return (
          <SiteLink
            key={door.title}
            to={door.route}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              p: { xs: 2.5, sm: 3.5 },
              minHeight: { md: 330 },
              bgcolor: look.bg,
              color: look.fg,
              borderLeft: { md: index === 0 ? 'none' : `4px solid ${PRESS.ink}` },
              borderTop: { xs: index === 0 ? 'none' : `4px solid ${PRESS.ink}`, md: 'none' },
              '&:hover .door-cta': { gap: 2 },
              '&:hover .door-num': { transform: 'translateX(6px)' },
            }}
          >
            <Box className="door-num" sx={{ transition: 'transform 120ms' }}>
              <Numeral size="4.5rem" color={look.num}>
                0{index + 1}
              </Numeral>
            </Box>
            <Display size="2.4rem" color={look.fg} component="h2">
              {door.title}
            </Display>
            <Body color={look.soft} sx={{ flex: 1 }}>
              {door.blurb}
            </Body>
            <Box
              className="door-cta"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                transition: 'gap 120ms',
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: '1.1rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {door.cta}
              <Box component="span" aria-hidden>
                &rarr;
              </Box>
            </Box>
          </SiteLink>
        )
      })}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// The game in four lines
// ---------------------------------------------------------------------------

/** Four pictograms on one 64 box, ink and red only. */
const PICTOGRAMS: Record<string, ReactNode> = {
  orbit: (
    <>
      <circle cx="32" cy="32" r="11" fill={PRESS.ink} />
      <circle cx="32" cy="32" r="24" fill="none" stroke={PRESS.ink} strokeWidth="3" />
      <path d="M52 20A24 24 0 0 1 54 42" fill="none" stroke={PRESS.red} strokeWidth="7" />
      <path d="M46 40L62 40L54 52z" fill={PRESS.red} />
    </>
  ),
  heat: (
    <>
      {[0, 1, 2, 3, 4].map(i => (
        <rect
          key={i}
          x={6 + i * 11}
          y={48 - i * 9}
          width="8"
          height={10 + i * 9}
          fill={i === 4 ? PRESS.red : PRESS.ink}
        />
      ))}
    </>
  ),
  fight: (
    <>
      <rect x="8" y="8" width="48" height="48" fill={PRESS.red} />
      <text
        x="32"
        y="45"
        textAnchor="middle"
        fontFamily={FONT_DISPLAY}
        fontWeight={700}
        fontSize="34"
        fill={PRESS.paper}
      >
        10
      </text>
    </>
  ),
  score: (
    <>
      <circle cx="32" cy="32" r="26" fill={PRESS.ink} />
      <circle cx="32" cy="32" r="20" fill="none" stroke={PRESS.paper} strokeWidth="3" />
      <text
        x="32"
        y="44"
        textAnchor="middle"
        fontFamily={FONT_DISPLAY}
        fontWeight={700}
        fontSize="32"
        fill={PRESS.paper}
      >
        {DEFAULT_POINTS_TO_WIN}
      </text>
    </>
  ),
}

const LINES: Array<{ key: keyof typeof PICTOGRAMS; title: string; text: string }> = [
  {
    key: 'orbit',
    title: 'Ride the drift',
    text: 'Every ship drifts by its ring’s speed every turn. Burn to change ring, jump a one-way lane to change planet.',
  },
  {
    key: 'heat',
    title: 'Pay in heat',
    text: `Every action costs energy, and every point of energy is heat at your check. Past ${MAX_HEAT}, the hull pays.`,
  },
  {
    key: 'fight',
    title: 'Roll one d10',
    text: 'A 1 misses and a 10 breaks the slot you named. Tiles stay face-down until they do their job.',
  },
  {
    key: 'score',
    title: `${DEFAULT_POINTS_TO_WIN} points end it`,
    text: `Hold ${MISSIONS_PER_PLAYER} secret cards: a primary worth 2 and two worth 1. Reach ${DEFAULT_POINTS_TO_WIN} and the round plays out.`,
  },
]

function FourLines() {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: { xs: 3, sm: 4 },
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
      }}
    >
      {LINES.map(line => (
        <Box key={line.key} sx={{ borderTop: `6px solid ${PRESS.ink}`, pt: 2 }}>
          <svg width={56} height={56} viewBox="0 0 64 64" aria-hidden focusable="false">
            {PICTOGRAMS[line.key]}
          </svg>
          <Display size="1.7rem" component="h3" sx={{ mt: 1.5, mb: 1 }}>
            {line.title}
          </Display>
          <Body size="0.98rem">{line.text}</Body>
        </Box>
      ))}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const FACTS: Array<{ value: string; label: string }> = [
  { value: `${MIN_PLAYERS}–${MAX_PLAYERS}`, label: 'players' },
  { value: `${DEFAULT_POINTS_TO_WIN}`, label: 'points win' },
  { value: `${MISSIONS_PER_PLAYER}`, label: 'secret cards' },
  { value: `${SECTORS_PER_RING}`, label: 'sectors a ring' },
  { value: 'd10', label: 'one die' },
]

export function Landing() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: PRESS.paper, color: PRESS.ink, overflowX: 'hidden' }}>
      <SiteHeader />

      <Box
        sx={{
          ...COLUMN,
          pt: { xs: 4, sm: 7 },
          pb: { xs: 5, sm: 8 },
          display: 'grid',
          gap: { xs: 3, md: 5 },
          gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' },
          alignItems: 'center',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Kicker>
            A tabletop game for {MIN_PLAYERS}&ndash;{MAX_PLAYERS} players
          </Kicker>
          <Display
            component="h1"
            size={{ xs: '3.3rem', sm: '5.2rem', lg: '6.2rem' }}
            sx={{ mt: 1.5 }}
          >
            Dangerous
            <br />
            <Box component="span" sx={{ color: PRESS.red }}>
              Inclinations
            </Box>
          </Display>
          <Display
            size={{ xs: '1.45rem', sm: '1.9rem' }}
            weight={500}
            sx={{ mt: 2.5, letterSpacing: '0.04em' }}
          >
            Drift. Burn. Jump. Fire.
          </Display>
          <Body size={{ xs: '1.02rem', sm: '1.12rem' }} sx={{ mt: 2.5 }}>
            Ships orbit a black hole and its three planets. You ride the drift, burn between rings,
            jump the one-way lanes and fight over cargo and secrets, on the heat you can afford. The
            first to {DEFAULT_POINTS_TO_WIN} points from their secret mission cards ends the round.
          </Body>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 3.5 }}>
            <Slab to={{ kind: 'play' }} tone="red">
              Play it now
            </Slab>
            <Slab to={{ kind: 'card' }} tone="paper">
              How to play
            </Slab>
          </Box>
        </Box>
        <Box sx={{ maxWidth: { xs: 420, md: 'none' }, mx: 'auto', width: '100%' }}>
          <PosterArt />
        </Box>
      </Box>

      <Box sx={{ bgcolor: PRESS.ink, color: PRESS.paper }}>
        <Box
          sx={{
            ...COLUMN,
            py: { xs: 2.5, sm: 3 },
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: { xs: 2.5, sm: 4 },
          }}
        >
          {FACTS.map(fact => (
            <Box key={fact.label} sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Numeral size={{ xs: '2rem', sm: '2.6rem' }} color={PRESS.paper}>
                {fact.value}
              </Numeral>
              <Kicker color={PRESS.paperSoft}>{fact.label}</Kicker>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ ...COLUMN, py: { xs: 5, sm: 8 } }}>
        <Doors />
      </Box>

      <Box sx={{ ...COLUMN, pb: { xs: 6, sm: 9 } }}>
        <Kicker>The game in four lines</Kicker>
        <Display size={{ xs: '2.2rem', sm: '3rem' }} component="h2" sx={{ mt: 1, mb: 4 }}>
          Orbit, heat, dice, cards
        </Display>
        <FourLines />
        <Box sx={{ mt: 5 }}>
          <Slab to={{ kind: 'card' }} tone="ink">
            Read the cheatsheet &rarr;
          </Slab>
        </Box>
      </Box>

      <SiteFooter />
    </Box>
  )
}
