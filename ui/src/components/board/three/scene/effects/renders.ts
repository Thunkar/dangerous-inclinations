/**
 * A development census of React renders inside the scene.
 *
 * The whole point of moving the clock out of React is that a turn animates
 * without React hearing about it: the scene's components render when the model
 * changes (a few times a turn) and never per frame. That is easy to regress
 * and impossible to see in a screenshot, so the two components that animate
 * count themselves here and the headless harness reads the tally off
 * `window.__boardRenders` before and after a turn, against the frames the
 * board drew in between.
 *
 * Development builds only; in a production build this compiles to a no-op.
 */
export function countRender(component: string): void {
  if (!import.meta.env.DEV) return
  const scope = window as unknown as { __boardRenders?: Record<string, number> }
  const census = (scope.__boardRenders ??= {})
  census[component] = (census[component] ?? 0) + 1
}
