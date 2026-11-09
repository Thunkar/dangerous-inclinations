/**
 * Every word on the printed loadout cards (`site/loadouts/`), and the block
 * above them on the cheatsheet page. One card per preset: its role over the
 * bow, the bow, the two flanks, then in the black bar the missions it is
 * recommended for. The presets' names are the engine's
 * (`PRESET_NAMES`), the subsystems' and the missions' too.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number: the words around a slot are free to change, and a slot may move or
 * be dropped but keeps its name.
 */
import type { BotRole } from '@dangerous-inclinations/engine'

export const LOADOUT_CARDS = {
  // -------------------------------------------------------------------------
  // The card, top to bottom
  // -------------------------------------------------------------------------
  /** The eyebrow over the bow. */
  roles: {
    hunter: 'Hunter',
    interceptor: 'Interceptor',
    hauler: 'Hauler',
  } satisfies Record<BotRole, string>,
  /** Under the bow subsystem's name. */
  bow: 'Bow',
  /** Over the two columns of side slots. */
  port: 'Port',
  starboard: 'Starboard',
  /** In the black bar: in place of the secondaries on a role's default, and between two. */
  any: 'Any',
  or: 'or',
  /** Over the missions in the black bar. */
  recommended: 'Recommended for',

  // -------------------------------------------------------------------------
  // The section on the cheatsheet page
  // -------------------------------------------------------------------------
  section: {
    /** The tile in the page's contents. */
    contents: 'Loadouts',
    kicker: 'For a first game',
    title: 'Loadout cards',
    lede: 'Twelve ships for a first game, four to a role. Your primary names the role and your secondaries the ship: fit it as its card shows. {width}×{height}mm, the size of a mission card.',
    /** Over each role's row of cards. */
    rows: {
      hunter: 'Hunters',
      interceptor: 'Interceptors',
      hauler: 'Haulers',
    } satisfies Record<BotRole, string>,
    /** Over the back every card shares. */
    back: 'Back',
    print: 'Print',
    flips: { long: 'Long-edge flip', short: 'Short-edge flip' },
    printNote:
      '{pages} A4 pages, nine cards to a page, fronts then backs. Print both sides in colour at actual size, flipping on the {edge} edge, and cut along the marks.',
    edges: { long: 'long', short: 'short' },
  },
} as const
