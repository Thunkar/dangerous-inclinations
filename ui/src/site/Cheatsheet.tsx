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
 * nothing else on the page prints.
 */
import { useState } from 'react'
import { Box } from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import { FONT_MONO } from '../theme'
import { FONT_BODY, FONT_DISPLAY, PRESS } from '../design/press'
import { SiteFooter, SiteHeader } from './SiteChrome'
import { SiteLink } from './SiteLink'
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
import {
  CARD_CSS,
  CARD_HEIGHT_MM,
  CARD_PAGE_CSS,
  CARD_WIDTH_MM,
  SHEET_HEIGHT_MM,
  SHEET_WIDTH_MM,
} from './card/cardStyles'
import { cropMarks, sheetPages, type PrintMode } from './card/sheet'
import { INK } from './diagram'
import { Segments } from './tools/controls'
import { CHEATSHEET } from '../text/cheatsheet'
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
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(9, 1fr)' },
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
          gridColumn: { xs: 'span 2', sm: 'auto' },
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
          {T.contents.card}
        </Box>
      </Box>
    </Box>
  )
}

type Sides = 'sheet' | 'duplex'
type Flip = 'long' | 'short'

/**
 * The pages that print, hidden on screen: every face at scale 1 at the
 * millimetre the sheet puts it, the crop marks drawn under them.
 */
function PrintSheets({ mode }: { mode: PrintMode }) {
  return (
    <div className="di-sheets">
      {sheetPages(mode).map((faces, page) => (
        <div key={page} className="di-page">
          <svg
            className="di-marks"
            width={`${SHEET_WIDTH_MM}mm`}
            height={`${SHEET_HEIGHT_MM}mm`}
            viewBox={`0 0 ${SHEET_WIDTH_MM} ${SHEET_HEIGHT_MM}`}
            aria-hidden
          >
            {cropMarks(faces).map((m, i) => (
              <line
                key={i}
                x1={m.x1}
                y1={m.y1}
                x2={m.x2}
                y2={m.y2}
                stroke={INK}
                strokeWidth={0.2}
              />
            ))}
          </svg>
          {faces.map((face, i) => (
            <div
              key={i}
              className={face.rotated ? 'di-slot di-turned' : 'di-slot'}
              data-face={face.face}
              style={{ left: `${face.x}mm`, top: `${face.y}mm` }}
            >
              {face.face === 'front' ? <CardFront /> : <CardBack />}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** The bundled faces must be in before the sheet is laid out for the printer. */
function print() {
  void document.fonts.ready.then(() => window.print())
}

function PrintCard() {
  const [sides, setSides] = useState<Sides>('sheet')
  const [flip, setFlip] = useState<Flip>('long')
  const mode: PrintMode = sides === 'sheet' ? 'sheet' : `duplex-${flip}`
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
          <Kicker>{T.card.kicker}</Kicker>
          <Box id="card-title">
            <Display component="h2" size={{ xs: '2.4rem', sm: '3.4rem' }} sx={{ mt: 0.75 }}>
              {T.card.title}
            </Display>
          </Box>
          <Body size={{ xs: '1.02rem', sm: '1.12rem' }} sx={{ mt: 1.5 }}>
            {rich(T.card.lede, { width: CARD_WIDTH_MM, height: CARD_HEIGHT_MM })}
          </Body>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mt: 3 }}>
            <Segments
              value={sides}
              options={(['sheet', 'duplex'] as const).map(value => ({
                value,
                label: T.card.modes[value],
              }))}
              onChange={setSides}
            />
            {sides === 'duplex' && (
              <Segments
                value={flip}
                options={(['long', 'short'] as const).map(value => ({
                  value,
                  label: T.card.flips[value],
                }))}
                onChange={setFlip}
              />
            )}
            <Slab tone="red" onClick={print}>
              <PrintIcon sx={{ fontSize: 20 }} />
              {T.card.print}
            </Slab>
          </Box>
          <Body size="0.92rem" color={PRESS.inkSoft} sx={{ maxWidth: '62ch', mt: 1.5 }}>
            {T.card.printNote[mode]}
          </Body>
        </Box>

        <Box className="di-cards">
          <CardFront />
          <CardBack />
        </Box>
        <PrintSheets mode={mode} />
      </Box>
    </Box>
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
      <SiteFooter />
    </Box>
  )
}
