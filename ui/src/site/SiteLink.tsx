/**
 * A link between the site's places.
 *
 * It is an ordinary anchor with an ordinary `href`, so middle-click, copy link
 * and open-in-new-tab all work; only a plain left click is intercepted and
 * turned into a `pushState`. A router would give the same thing, and a
 * dependency with it.
 */
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { Box } from '@mui/material'
import type { BoxProps } from '@mui/material'
import { useNavigation } from '../context/NavigationContext'
import type { Route } from './routes'
import { routeHref } from './routes'

type SiteLinkProps = { to: Route; children: ReactNode } & Omit<
  BoxProps<'a'>,
  'href' | 'component'
> &
  Pick<AnchorHTMLAttributes<HTMLAnchorElement>, 'aria-label' | 'aria-current'>

/** An anchor that navigates in place, and is still an anchor. */
export function SiteLink({ to, children, onClick, sx, ...rest }: SiteLinkProps) {
  const { goTo } = useNavigation()
  return (
    <Box
      component="a"
      href={routeHref(to)}
      {...rest}
      // After the spread, so a caller's `sx` extends these rather than
      // replacing them: an anchor here is never a browser-blue underline. An
      // `sx` may be an array, so it is appended rather than spread.
      sx={[{ textDecoration: 'none', color: 'inherit' }, ...(Array.isArray(sx) ? sx : [sx])]}
      onClick={event => {
        onClick?.(event)
        // Leave every click that means "somewhere else" alone: a new tab, a
        // new window, a download.
        if (event.defaultPrevented) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        if (event.button !== 0) return
        event.preventDefault()
        goTo(to)
      }}
    >
      {children}
    </Box>
  )
}
