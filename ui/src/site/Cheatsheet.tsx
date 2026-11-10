/**
 * The cheatsheet: how to play, in the order a first game meets it, and the
 * player card to print.
 *
 * Eight sections, each one thing a table has to know: what you are playing
 * for, how to set up, the turn, moving, heat, fighting, what is hidden and
 * what death costs. Every number in them is read from the engine that
 * referees the video game; the wording compresses RULES.md, which wins
 * wherever the two seem to disagree. When to travel is in the route planner
 * (`tools/OrbitalWindows.tsx`), linked from the foot of the last section.
 *
 * The card is drawn at its true size and previewed through a transform, so
 * what is on screen is the geometry that reaches the printer. Printing lays
 * four faces on each A4 page with crop marks (`card/sheet.ts`): two cards on
 * one side, or four fronts and then four backs for a duplex printer, and
 * nothing else on the page prints. The loadout cards follow it
 * (`loadouts/`), one per preset, and print nine to a page from their own
 * button; then the range cards (`ranges/`), one per weapon and one for the
 * sensor's scan, and the mission decks (`missions/`), both piles, double-sided.
 */
import { useState } from 'react'
import { Box } from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import { FONT_MONO } from '../theme'
import { FONT_BODY, FONT_DISPLAY, PRESS } from '../design/press'
import { SiteFooter, SiteHeader } from './SiteChrome'
import { SiteLink } from './SiteLink'
import { Display, Kicker, Numeral } from './poster'
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
import { sheetPages, type PrintMode } from './card/sheet'
import type { Flip } from './missions/sheet'
import { PRINT_CSS } from './print/print'
import { FlipChoice, PrintPages, PrintSection } from './print/PrintPages'
import { Segments } from './tools/controls'
import { CHEATSHEET } from '../text/cheatsheet'
import { LOADOUT_CARDS } from '../text/loadoutCards'
import { LoadoutSection } from './loadouts/LoadoutSection'
import { LOADOUT_CSS } from './loadouts/loadoutStyles'
import { MissionDeckSection } from './missions/MissionDeckSection'
import { RangeSection } from './ranges/RangeSection'
import { RANGE_CSS } from './ranges/rangeStyles'
import { MISSION_DECK_CSS } from './missions/missionDeckStyles'
import { rich } from '../utils/rich'

const T = CHEATSHEET

/**
 * The card's stylesheet, and the only `<style>` element in the app. `@page`,
 * millimetres and print media queries have no emotion equivalent, and a
 * printed card is the one thing here that must not inherit the page it is
 * previewed on (see `card/cardStyles.ts`).
 */
const STYLE = `
:root { --di-sans: ${FONT_BODY}; --di-mono: ${FONT_MONO}; --di-display: ${FONT_DISPLAY}; }
${CARD_PAGE_CSS}
${CARD_CSS}
${LOADOUT_CSS}
${RANGE_CSS}
${MISSION_DECK_CSS}
${PRINT_CSS}
`

const CONTENTS: Array<{ id: string; label: string }> = (
  ['goal', 'setup', 'turn', 'move', 'heat', 'fight', 'secrets', 'death'] as const
).map(id => ({ id, label: T.contents[id] }))

function Contents() {
  return (
    <Box
      component="nav"
      aria-label={T.contents.label}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)', lg: 'repeat(10, 1fr)' },
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
      {[
        { href: '#card', label: T.contents.card },
        { href: '#loadouts', label: LOADOUT_CARDS.section.contents },
      ].map(tile => (
        <Box
          key={tile.href}
          component="a"
          href={tile.href}
          sx={{
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
            {tile.label}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

type Sides = 'sheet' | 'duplex'

function PrintCard() {
  const [sides, setSides] = useState<Sides>('sheet')
  const [flip, setFlip] = useState<Flip>('long')
  const mode: PrintMode = sides === 'sheet' ? 'sheet' : `duplex-${flip}`
  return (
    <PrintSection
      name="card"
      kicker={T.card.kicker}
      title={T.card.title}
      lede={rich(T.card.lede, { width: CARD_WIDTH_MM, height: CARD_HEIGHT_MM })}
      controls={
        <>
          <Segments
            value={sides}
            options={(['sheet', 'duplex'] as const).map(value => ({
              value,
              label: T.card.modes[value],
            }))}
            onChange={setSides}
          />
          {sides === 'duplex' && (
            <FlipChoice flip={flip} labels={T.card.flips} onChange={setFlip} />
          )}
        </>
      }
      print={T.card.print}
      note={T.card.printNote[mode]}
    >
      <Box className="di-cards">
        <CardFront />
        <CardBack />
      </Box>
      <PrintPages pages={sheetPages(mode)}>
        {face => (face.face === 'front' ? <CardFront /> : <CardBack />)}
      </PrintPages>
    </PrintSection>
  )
}

/** The line after the last section: the orbital windows are in the route planner. */
function WindowsLink() {
  return (
    <Box sx={{ ...COLUMN, pb: { xs: 5, sm: 7 } }}>
      <SiteLink
        to={{ kind: 'tools', tool: 'route' }}
        sx={{
          display: 'inline-block',
          borderTop: `4px solid ${PRESS.ink}`,
          pt: 1,
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: { xs: '1.05rem', sm: '1.4rem' },
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: PRESS.redText,
          '&:hover': { color: PRESS.ink },
        }}
      >
        {T.windowsLink}
      </SiteLink>
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
          <Kicker>{T.page.kicker}</Kicker>
          <Display component="h1" size={{ xs: '3.2rem', sm: '5rem' }} sx={{ mt: 1 }}>
            {rich(
              T.page.title,
              {},
              {
                red: text => (
                  <Box component="span" sx={{ color: PRESS.red }}>
                    {text}
                  </Box>
                ),
              }
            )}
          </Display>
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
        <WindowsLink />
      </Box>

      <PrintCard />
      <LoadoutSection />
      <RangeSection />
      <MissionDeckSection />
      <SiteFooter />
    </Box>
  )
}
