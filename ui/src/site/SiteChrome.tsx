/**
 * The bar across the top of everything that is not the table, and the sheet
 * the site's pages are printed on.
 *
 * The video game takes the whole window and brings its own chrome; the pages
 * around it (the landing page, the tools, the cheatsheet) share this one. The
 * bar is black so it sits as well over the dark lobby as over the paper pages,
 * and it stays one line on a phone, because the tools are used standing over
 * a real table with one hand.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import { FONT_DISPLAY, PRESS } from '../design/press'
import type { Route } from './routes'
import { routeHref } from './routes'
import { useNavigation } from '../context/NavigationContext'
import { SiteLink } from './SiteLink'
import { Body, Display, Kicker, Mark } from './poster'

const SECTIONS: Array<{ route: Route; label: string }> = [
  { route: { kind: 'play' }, label: 'Play' },
  { route: { kind: 'tools', tool: null }, label: 'Tools' },
  { route: { kind: 'card' }, label: 'Cheatsheet' },
]

function isCurrent(here: Route, section: Route): boolean {
  if (here.kind === section.kind) return true
  // A live game, a replay and the recordings list are all the video game.
  if (section.kind === 'play') return ['game', 'replay', 'recordings'].includes(here.kind)
  return false
}

export function SiteHeader() {
  const { route } = useNavigation()

  return (
    <Box
      component="header"
      className="site-only"
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        height: { xs: 52, sm: 60 },
        pl: { xs: 2, sm: 3 },
        position: 'sticky',
        top: 0,
        zIndex: 10,
        bgcolor: PRESS.ink,
        color: PRESS.paper,
      }}
    >
      <SiteLink
        to={{ kind: 'landing' }}
        aria-label="Dangerous Inclinations, home"
        sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flexShrink: 1 }}
      >
        <Mark size={30} />
        <Box
          component="span"
          sx={{
            display: { xs: 'none', sm: 'block' },
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: '1.2rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          Dangerous Inclinations
        </Box>
      </SiteLink>

      <Box sx={{ flex: 1 }} />

      <Box component="nav" sx={{ display: 'flex', flexShrink: 0 }}>
        {SECTIONS.map(section => {
          const on = isCurrent(route, section.route)
          return (
            <SiteLink
              key={routeHref(section.route)}
              to={section.route}
              aria-current={on ? 'page' : undefined}
              sx={{
                display: 'flex',
                alignItems: 'center',
                px: { xs: 1.5, sm: 2.5 },
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: { xs: '0.95rem', sm: '1.05rem' },
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                bgcolor: on ? PRESS.red : 'transparent',
                color: PRESS.paper,
                boxShadow: 'none',
                '&:hover': { bgcolor: on ? PRESS.red : 'rgba(233,223,199,0.12)' },
              }}
            >
              {section.label}
            </SiteLink>
          )
        })}
      </Box>
    </Box>
  )
}

/** A page of the site: the bar, then paper, then a column that stops getting wider. */
export function SitePage({ children, width = 1120 }: { children: ReactNode; width?: number }) {
  return (
    // `site-page` is the hook the card's print stylesheet needs: a printed
    // page is plain white, whatever sheet it was previewed on.
    <Box className="site-page" sx={{ minHeight: '100vh', bgcolor: PRESS.paper, color: PRESS.ink }}>
      <SiteHeader />
      <Box
        component="main"
        sx={{ maxWidth: width, mx: 'auto', px: { xs: 2, sm: 4 }, pt: { xs: 4, sm: 6 }, pb: 8 }}
      >
        {children}
      </Box>
      <SiteFooter />
    </Box>
  )
}

/** The foot of every paper page. */
export function SiteFooter() {
  return (
    <Box
      component="footer"
      className="site-only"
      sx={{
        bgcolor: PRESS.ink,
        color: PRESS.paperSoft,
        px: { xs: 2, sm: 4 },
        py: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      <Mark size={20} />
      <Box
        component="span"
        sx={{
          fontFamily: FONT_DISPLAY,
          fontSize: '0.9rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        Every number on this site is read from the engine that referees the video game
      </Box>
    </Box>
  )
}

/** A page's heading: the kicker, the headline, and a sentence under it. */
export function PageTitle({
  kicker,
  title,
  blurb,
}: {
  kicker?: string
  title: string
  blurb?: ReactNode
}) {
  return (
    <Box sx={{ mb: { xs: 3, sm: 4 } }}>
      {kicker && <Kicker>{kicker}</Kicker>}
      <Display component="h1" size={{ xs: '2.6rem', sm: '3.8rem' }} sx={{ mt: 0.75 }}>
        {title}
      </Display>
      <Box sx={{ width: 96, height: 8, bgcolor: PRESS.red, mt: 2, mb: blurb ? 2 : 0 }} />
      {blurb && <Body size={{ xs: '1rem', sm: '1.08rem' }}>{blurb}</Body>}
    </Box>
  )
}
