/**
 * The cheatsheet: how to play, in the order a first game meets it, and the
 * player card to print.
 *
 * Eight sections, each one thing a table has to know: what you are playing
 * for, how to set up, the turn, moving, heat, fighting, what is hidden, and
 * what death costs. Every number in them is read from the engine that
 * referees the video game; the wording compresses RULES.md, which wins
 * wherever the two seem to disagree.
 *
 * The card is drawn at its true size and previewed through a transform, so
 * what is on screen is the geometry that reaches the printer; printing lays
 * both faces on one A4 sheet to cut out, and nothing else on the page prints.
 */
import { Box } from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import { FONT_MONO, FONT_SANS } from '../theme'
import { FONT_DISPLAY, PRESS } from '../design/press'
import { SiteFooter, SiteHeader } from './SiteChrome'
import { Body, Display, Kicker, Numeral, Slab } from './poster'
import { COLUMN } from './guide/parts'
import { GoalSection } from './guide/GoalSection'
import { SetupSection } from './guide/SetupSection'
import { TurnSection } from './guide/TurnSection'
import { MoveSection } from './guide/MoveSection'
import { HeatSection } from './guide/HeatSection'
import { FightSection } from './guide/FightSection'
import { DeathSection, SecretsSection } from './guide/SecretsSection'
import { CardBack, CardFront } from './card/CardFaces'
import { CARD_CSS, CARD_HEIGHT_MM, CARD_PAGE_CSS, CARD_WIDTH_MM } from './card/cardStyles'

/**
 * The card's stylesheet, and the only `<style>` element in the app. `@page`,
 * millimetres and print media queries have no emotion equivalent, and a
 * printed card is the one thing here that must not inherit the page it is
 * previewed on (see `card/cardStyles.ts`).
 */
const STYLE = `
:root { --di-sans: ${FONT_SANS}; --di-mono: ${FONT_MONO}; --di-display: ${FONT_DISPLAY}; }
${CARD_PAGE_CSS}
${CARD_CSS}
`

const CONTENTS: Array<{ id: string; label: string }> = [
  { id: 'goal', label: 'The goal' },
  { id: 'setup', label: 'Setting up' },
  { id: 'turn', label: 'The turn' },
  { id: 'move', label: 'Moving' },
  { id: 'heat', label: 'Heat' },
  { id: 'fight', label: 'Fighting' },
  { id: 'secrets', label: 'Secrets' },
  { id: 'death', label: 'Destruction' },
]

function Contents() {
  return (
    <Box
      component="nav"
      aria-label="Sections"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)', lg: 'repeat(9, 1fr)' },
        gap: '4px',
        mt: { xs: 4, sm: 5 },
      }}
    >
      {CONTENTS.map((entry, index) => (
        <Box
          key={entry.id}
          component="a"
          href={`#${entry.id}`}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            p: 1.5,
            minHeight: 88,
            bgcolor: PRESS.ink,
            color: PRESS.paper,
            textDecoration: 'none',
            transition: 'background-color 90ms',
            '&:hover': { bgcolor: PRESS.red },
          }}
        >
          <Numeral size="1.9rem" color={PRESS.red}>
            {String(index + 1).padStart(2, '0')}
          </Numeral>
          <Box
            component="span"
            sx={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 600,
              fontSize: '1.02rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {entry.label}
          </Box>
        </Box>
      ))}
      <Box
        component="a"
        href="#card"
        sx={{
          gridColumn: { xs: 'span 2', sm: 'span 4', lg: 'span 1' },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 0.75,
          p: 1.5,
          minHeight: 88,
          bgcolor: PRESS.red,
          color: PRESS.paper,
          textDecoration: 'none',
          '&:hover': { bgcolor: PRESS.ink },
        }}
      >
        <PrintIcon sx={{ fontSize: 26 }} />
        <Box
          component="span"
          sx={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: '1.02rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          The card
        </Box>
      </Box>
    </Box>
  )
}

function PrintCard() {
  return (
    <Box
      component="section"
      id="card"
      className="di-print-area"
      aria-labelledby="card-title"
      sx={{ bgcolor: PRESS.paper, borderTop: `8px solid ${PRESS.ink}`, scrollMarginTop: 64 }}
    >
      <Box className="di-print" sx={{ ...COLUMN, py: { xs: 5, sm: 7 } }}>
        <Box className="di-screen-only" sx={{ mb: 4 }}>
          <Kicker>For the table</Kicker>
          <Box id="card-title">
            <Display component="h2" size={{ xs: '2.4rem', sm: '3.4rem' }} sx={{ mt: 0.75 }}>
              One card for every seat
            </Display>
          </Box>
          <Body size={{ xs: '1.02rem', sm: '1.12rem' }} sx={{ mt: 1.5 }}>
            Two faces of a {CARD_WIDTH_MM}&times;{CARD_HEIGHT_MM}mm card (tarot size): your turn on
            the front, the fight on the back.
          </Body>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mt: 3 }}>
            <Slab tone="red" onClick={() => window.print()}>
              <PrintIcon sx={{ fontSize: 20 }} />
              Print both faces
            </Slab>
            <Body size="0.92rem" color={PRESS.inkSoft} sx={{ maxWidth: '52ch' }}>
              One A4 sheet at true size. Cut them out and glue them back to back.
            </Body>
          </Box>
        </Box>

        <Box className="di-cards">
          <CardFront />
          <CardBack />
        </Box>
      </Box>
    </Box>
  )
}

export function Cheatsheet() {
  return (
    <Box
      className="site-page"
      sx={{ minHeight: '100vh', bgcolor: PRESS.paper, color: PRESS.ink, overflowX: 'hidden' }}
    >
      <style>{STYLE}</style>
      <SiteHeader />

      <Box className="di-screen-only">
        <Box sx={{ ...COLUMN, pt: { xs: 4, sm: 7 }, pb: { xs: 5, sm: 7 } }}>
          <Kicker>Cheatsheet</Kicker>
          <Display component="h1" size={{ xs: '3.2rem', sm: '5rem' }} sx={{ mt: 1 }}>
            How to{' '}
            <Box component="span" sx={{ color: PRESS.red }}>
              play
            </Box>
          </Display>
          <Body size={{ xs: '1.05rem', sm: '1.15rem' }} sx={{ mt: 2.5 }}>
            A first game, in order. Read 01 to 03 before you start and the rest as it comes up. The
            rulebook has the details and wins any disagreement.
          </Body>
          <Contents />
        </Box>

        <GoalSection />
        <SetupSection />
        <TurnSection />
        <MoveSection />
        <HeatSection />
        <FightSection />
        <SecretsSection />
        <DeathSection />
      </Box>

      <PrintCard />
      <SiteFooter />
    </Box>
  )
}
