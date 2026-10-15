/**
 * Every word on the printed loadout cards (`site/loadouts/`), and the block
 * above them on the cheatsheet page. One card per preset: its role over the
 * bow, the bow, the two flanks, then the missions it is kept with and the
 * card's one line in the black bar. The presets' names are the engine's
 * (`PRESET_NAMES`), the subsystems' and the missions' too.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number: the words around a slot are free to change, and a slot may move or
 * be dropped but keeps its name.
 */
import type { BotPresetId, BotRole } from '@dangerous-inclinations/engine'

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
  /** The card's one line, preset by preset. */
  lines: {
    gunship:
      'The default hunter. Fire the railgun ahead; the rack and the shields keep you in the fight.',
    lancer: 'Close on the carrier. Two plasma cannons burn through its shields at point blank.',
    corsair: 'Missiles from range, three lasers when they close.',
    warden: 'Plasma strips the target’s shields so the disruptor gets through.',
    raider: 'The default interceptor. Scan, then break whoever chases the data.',
    watcher: 'Two shields to carry the data home.',
    picket: 'Two launchers finish a damaged ship from range.',
    sentry: 'Ride beside a carrier with laser, rack and shields.',
    freighter: 'The default hauler. Jumps cost 1 fuel; two shields guard the hold.',
    convoy: 'Two racks stop missiles; a shield guards the hold.',
    smuggler: 'Two launchers make the wrecks you salvage.',
    ghost: 'Disruptor, laser and plasma break whoever chases your fuel.',
  } satisfies Record<BotPresetId, string>,

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
    print: 'Print',
    printNote:
      '{pages} A4 pages, nine cards to a page, fronts only. Print in colour at actual size and cut along the marks.',
  },
} as const
