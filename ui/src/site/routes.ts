/**
 * Where you are, in one value.
 *
 * The site is four places and the video game is one of them, so the address
 * bar carries a path now rather than the three query flags it used to. Those
 * flags still decide everything when they are present, from any path:
 * `?game=<id>` is what a fork hands you, what `yarn seat` prints and what
 * `scripts/shot.mjs` photographs, and none of them should have to learn a new
 * shape because the site around the game grew.
 *
 * Still no router dependency: a path is a string and `history.pushState` is
 * two lines. What a router would buy here (nested layouts, loaders, params)
 * this site does not have.
 */

export type ToolName = 'route' | 'heat' | 'dice'

export const TOOL_NAMES: readonly ToolName[] = ['route', 'heat', 'dice']

export type Route =
  | { kind: 'landing' }
  | { kind: 'play' }
  | { kind: 'tools'; tool: ToolName | null }
  | { kind: 'card' }
  /** The three query flags, honoured from any path. */
  | { kind: 'recordings' }
  | { kind: 'replay'; id: string }
  | { kind: 'game'; gameId: string }

function isTool(value: string): value is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(value)
}

export function parseRoute(pathname: string, search: string): Route {
  const params = new URLSearchParams(search)
  const replay = params.get('replay')
  if (replay) return { kind: 'replay', id: replay }
  if (params.get('recordings') === '1') return { kind: 'recordings' }
  const game = params.get('game')
  if (game) return { kind: 'game', gameId: game }

  const segments = pathname.split('/').filter(Boolean)
  switch (segments[0]) {
    case undefined:
      return { kind: 'landing' }
    case 'play':
      return { kind: 'play' }
    case 'card':
      return { kind: 'card' }
    case 'tools': {
      const tool = segments[1]
      return { kind: 'tools', tool: tool && isTool(tool) ? tool : null }
    }
    default:
      return { kind: 'landing' }
  }
}

/** The address of a route: what a link's `href` is, so middle-click works. */
export function routeHref(route: Route): string {
  switch (route.kind) {
    case 'landing':
      return '/'
    case 'play':
      return '/play'
    case 'card':
      return '/card'
    case 'tools':
      return route.tool ? `/tools/${route.tool}` : '/tools'
    case 'recordings':
      return '/play?recordings=1'
    case 'replay':
      return `/play?replay=${encodeURIComponent(route.id)}`
    case 'game':
      return `/play?game=${encodeURIComponent(route.gameId)}`
  }
}
