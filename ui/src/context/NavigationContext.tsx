/**
 * Where you are, and how to go somewhere else. No router dependency.
 *
 * One piece of state at the root holds the current {@link Route} and
 * `popstate` keeps it honest when the back button is used. What navigates is
 * `site/SiteLink.tsx`, which is a real anchor with a real `href`, so a link
 * can be middle-clicked, copied and opened in a new tab like any other link.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Route } from '../site/routes'
import { parseRoute, routeHref } from '../site/routes'

interface Navigation {
  route: Route
  goTo: (next: Route) => void
}

const NavigationContext = createContext<Navigation | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.pathname, window.location.search)
  )

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname, window.location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const goTo = useCallback((next: Route) => {
    window.history.pushState(null, '', routeHref(next))
    window.scrollTo(0, 0)
    setRoute(next)
  }, [])

  const value = useMemo(() => ({ route, goTo }), [route, goTo])
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useNavigation(): Navigation {
  const value = useContext(NavigationContext)
  if (!value) throw new Error('useNavigation outside a NavigationProvider')
  return value
}
