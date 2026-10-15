/**
 * The loadout cards on the cheatsheet page: the twelve presets on screen in
 * their roles, at true size behind a transform, and the A4 pages they print
 * on (`sheet.ts`), hidden until this section's button prints them.
 *
 * The page prints the player card by default. This button marks the body
 * `data-printing="loadouts"` for the length of its print, and the stylesheet
 * (`loadoutStyles.ts`) shows only these pages while it is set.
 */
import { Box } from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import { PRESETS_BY_ROLE } from '@dangerous-inclinations/engine'
import type { BotRole } from '@dangerous-inclinations/engine'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body, Display, Kicker, Slab } from '../poster'
import { COLUMN } from '../guide/parts'
import { INK } from '../diagram'
import { SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from '../card/cardStyles'
import { cropMarks } from '../card/sheet'
import { LOADOUT_CARDS } from '../../text/loadoutCards'
import { rich } from '../../utils/rich'
import { LoadoutCard } from './LoadoutCard'
import { roleInk } from './presets'
import { LOADOUT_HEIGHT_MM, LOADOUT_WIDTH_MM, loadoutPages } from './sheet'

const T = LOADOUT_CARDS.section

/** The roles in the order a first game meets them: the hunt, the scan, the haul. */
const ROLES: BotRole[] = ['hunter', 'interceptor', 'hauler']
const PRESETS = ROLES.flatMap(role => PRESETS_BY_ROLE[role])
const PAGES = loadoutPages(PRESETS)

/** The fonts must be in before the sheets are laid out, as for the player card. */
function printLoadouts() {
  void document.fonts.ready.then(() => {
    document.body.dataset.printing = 'loadouts'
    const done = () => {
      delete document.body.dataset.printing
    }
    window.addEventListener('afterprint', done, { once: true })
    window.print()
  })
}

function LoadoutSheets() {
  return (
    <div className="di-lo-sheets">
      {PAGES.map((cards, page) => (
        <div key={page} className="di-page">
          <svg
            className="di-marks"
            width={`${SHEET_WIDTH_MM}mm`}
            height={`${SHEET_HEIGHT_MM}mm`}
            viewBox={`0 0 ${SHEET_WIDTH_MM} ${SHEET_HEIGHT_MM}`}
            aria-hidden
          >
            {cropMarks(cards).map((m, i) => (
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
          {cards.map(slot => (
            <div
              key={slot.card}
              className="di-lo-slot"
              style={{ left: `${slot.x}mm`, top: `${slot.y}mm` }}
            >
              <LoadoutCard id={slot.card} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function LoadoutSection() {
  return (
    <Box
      component="section"
      id="loadouts"
      className="di-print-area"
      aria-labelledby="loadouts-title"
      sx={{ bgcolor: PRESS.paper, borderTop: `8px solid ${PRESS.ink}`, scrollMarginTop: 64 }}
    >
      <Box className="di-print" sx={{ ...COLUMN, py: { xs: 5, sm: 7 } }}>
        <Box className="di-screen-only" sx={{ mb: 4 }}>
          <Kicker>{T.kicker}</Kicker>
          <Box id="loadouts-title">
            <Display component="h2" size={{ xs: '2.4rem', sm: '3.4rem' }} sx={{ mt: 0.75 }}>
              {T.title}
            </Display>
          </Box>
          <Body size={{ xs: '1.02rem', sm: '1.12rem' }} sx={{ mt: 1.5 }}>
            {rich(T.lede, { width: LOADOUT_WIDTH_MM, height: LOADOUT_HEIGHT_MM })}
          </Body>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mt: 3 }}>
            <Slab tone="red" onClick={printLoadouts}>
              <PrintIcon sx={{ fontSize: 20 }} />
              {T.print}
            </Slab>
          </Box>
          <Body size="0.92rem" color={PRESS.inkSoft} sx={{ maxWidth: '62ch', mt: 1.5 }}>
            {rich(T.printNote, { pages: PAGES.length })}
          </Body>
        </Box>

        <div className="di-lo-rows">
          {ROLES.map(role => (
            <Box key={role} sx={{ mt: { xs: 3, sm: 4 } }}>
              <Box
                component="h3"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  m: 0,
                  mb: 1.5,
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 600,
                  fontSize: '1.3rem',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                <Box
                  component="span"
                  sx={{ width: 14, height: 14, bgcolor: roleInk(role), flex: 'none' }}
                />
                {T.rows[role]}
              </Box>
              <div className="di-lo-row">
                {PRESETS_BY_ROLE[role].map(id => (
                  <div key={id} className="di-lo-frame">
                    <LoadoutCard id={id} />
                  </div>
                ))}
              </div>
            </Box>
          ))}
        </div>
        <LoadoutSheets />
      </Box>
    </Box>
  )
}
