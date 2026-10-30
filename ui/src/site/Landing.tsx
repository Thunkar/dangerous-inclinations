/**
 * The front door.
 *
 * Three ways in, because the game is three things: a client that plays it
 * against bots, the tools a real table wants, and the cheatsheet that teaches
 * it and prints the player card. Whatever number is stated here is read from
 * the engine, so the page cannot promise a rule the code does not keep; the
 * words are in `text/landing.ts`.
 */
import { Box } from '@mui/material'
import {
  DEFAULT_POINTS_TO_WIN,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MISSIONS_PER_PLAYER,
  SLOT_IDS,
  fill,
} from '@dangerous-inclinations/engine'
import { FONT_DISPLAY, PRESS } from '../design/press'
import type { Route } from './routes'
import { SiteLink } from './SiteLink'
import { SiteHeader } from './SiteChrome'
import { Body, Display, Kicker, Numeral, Slab } from './poster'
import { PosterArt } from './PosterArt'
import { LANDING as T } from '../text/landing'
import { rich } from '../utils/rich'

const COLUMN = { width: '100%', maxWidth: 1120, mx: 'auto', px: { xs: 2, sm: 4 } } as const

// ---------------------------------------------------------------------------
// The doors
// ---------------------------------------------------------------------------

type DoorTone = 'ink' | 'red' | 'paper'

const DOORS: Array<{ route: Route; tone: DoorTone; title: string; blurb: string; cta: string }> = [
  { route: { kind: 'play' }, tone: 'ink', ...T.doors.play },
  { route: { kind: 'tools', tool: null }, tone: 'red', ...T.doors.tools },
  { route: { kind: 'card' }, tone: 'paper', ...T.doors.card },
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
              gap: { xs: 1.5, md: 1.25 },
              p: { xs: 2.5, sm: 3.5, md: 2.5 },
              bgcolor: look.bg,
              color: look.fg,
              borderLeft: { md: index === 0 ? 'none' : `4px solid ${PRESS.ink}` },
              borderTop: { xs: index === 0 ? 'none' : `4px solid ${PRESS.ink}`, md: 'none' },
              '&:hover .door-cta': { gap: 2 },
              '&:hover .door-num': { transform: 'translateX(6px)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <Box className="door-num" sx={{ transition: 'transform 120ms' }}>
                <Numeral size={{ xs: '3.5rem', md: '3rem' }} color={look.num}>
                  0{index + 1}
                </Numeral>
              </Box>
              <Display size={{ xs: '2.4rem', md: '2.2rem' }} color={look.fg} component="h2">
                {door.title}
              </Display>
            </Box>
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
// The page
// ---------------------------------------------------------------------------

const FACTS: Array<{ value: string; label: string }> = [
  {
    value: fill(T.facts.players.value, { min: MIN_PLAYERS, max: MAX_PLAYERS }),
    label: T.facts.players.label,
  },
  {
    value: fill(T.facts.slots.value, { slots: SLOT_IDS.length }),
    label: T.facts.slots.label,
  },
  {
    value: fill(T.facts.cards.value, { cards: MISSIONS_PER_PLAYER }),
    label: T.facts.cards.label,
  },
]

/**
 * On a desktop the page is one screen: the hero takes whatever height the
 * strip and the doors leave, the picture fills it and the type scales with
 * the window. A window too short for the text, or a phone, scrolls.
 */
export function Landing() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        bgcolor: PRESS.paper,
        color: PRESS.ink,
        overflowX: 'hidden',
      }}
    >
      <SiteHeader />

      <Box
        sx={{
          ...COLUMN,
          flex: { md: 1 },
          py: { xs: 4, sm: 7, md: '3vh' },
          display: 'grid',
          gap: { xs: 3, md: 5 },
          gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' },
          gridTemplateRows: { md: '1fr' },
          alignItems: 'center',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Kicker>{rich(T.hero.kicker, { min: MIN_PLAYERS, max: MAX_PLAYERS })}</Kicker>
          <Display
            component="h1"
            size={{ xs: '3.3rem', sm: '5.2rem', md: 'clamp(3.3rem, 7.5vh, 6.2rem)' }}
            sx={{ mt: 1.5 }}
          >
            {T.hero.title[0]}
            <br />
            <Box component="span" sx={{ color: PRESS.red }}>
              {T.hero.title[1]}
            </Box>
          </Display>
          <Display
            size={{ xs: '1.45rem', sm: '1.9rem', md: 'clamp(1.3rem, 2.8vh, 1.9rem)' }}
            weight={500}
            sx={{ mt: { xs: 2.5, md: '1.5vh' }, letterSpacing: '0.04em' }}
          >
            {T.hero.motto}
          </Display>
          <Body
            size={{ xs: '1.02rem', sm: '1.12rem', md: 'clamp(0.95rem, 1.9vh, 1.12rem)' }}
            sx={{ mt: { xs: 2.5, md: '1.5vh' } }}
          >
            {rich(T.hero.text, { points: DEFAULT_POINTS_TO_WIN })}
          </Body>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: { xs: 3.5, md: '2.5vh' } }}>
            <Slab to={{ kind: 'play' }} tone="red">
              {T.hero.play}
            </Slab>
            <Slab to={{ kind: 'card' }} tone="paper">
              {T.hero.learn}
            </Slab>
          </Box>
        </Box>
        <Box
          sx={{
            maxWidth: { xs: 420, md: 'none' },
            mx: 'auto',
            width: '100%',
            height: { md: '100%' },
            // Sized by the row, never sizing it: the text sets the hero's height.
            contain: { md: 'size' },
            '& svg': { height: { xs: 'auto', md: '100%' } },
          }}
        >
          <PosterArt label={T.hero.picture} />
        </Box>
      </Box>

      <Box sx={{ bgcolor: PRESS.ink, color: PRESS.paper }}>
        <Box
          sx={{
            ...COLUMN,
            py: { xs: 3, md: 2 },
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
            gap: { xs: 2.5, sm: 4 },
          }}
        >
          {FACTS.map(fact => (
            <Box
              key={fact.label}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                borderTop: `4px solid ${PRESS.red}`,
                pt: { xs: 1.5, md: 1.25 },
              }}
            >
              <Box sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                <Numeral size={{ xs: '2.2rem', sm: '2.6rem' }} color={PRESS.paper}>
                  {fact.value}
                </Numeral>
              </Box>
              <Kicker color={PRESS.paperSoft}>{fact.label}</Kicker>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ ...COLUMN, py: { xs: 5, sm: 6, md: '2.5vh' } }}>
        <Doors />
      </Box>
    </Box>
  )
}
