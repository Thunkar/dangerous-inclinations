/**
 * Every word the board prints (`components/board/`), on both renderers: the
 * hover text of a ship, a missile, a wreck, a Home, a station, a lane and the
 * sectors a click can pick, the caption under a ring, and the board's own
 * buttons.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number or a name, so every number comes from the engine or the view: the
 * words around a slot are free to change, and a slot may move or be dropped
 * but keeps its name. A word that only joins a list (", ") is kept here too.
 */

export const BOARD_TEXT = {
  ship: '{name} · hull {hull}/{maxHull}, heat {heat}, facing {facing}{escorted}',
  escorted: ' · escorted by {names}',
  /** A missile in flight, and one planned this turn. */
  missile:
    "{owner}'s missile → {target} · {left} flight(s) left. Rides its orbit, then flies up to {steps} steps toward the target (rings first). The turn it is launched it flies at once, from where it was launched, with no ride. {moves} flights max.",
  plannedSalvo: 'Planned salvo of {count} at {target} · each flies up to {steps} steps this turn',
  plannedMissile: 'Planned missile at {target} · flies up to {steps} steps this turn',
  wreck: 'Wreck · {place} · a Salvage holder can take its black box',
  home: "{name}'s Home · {place}",
  station: '{planet} Station · dock here to load, sell, repair and reload{soldTo}',
  soldTo: ' · has bought from {names}',
  nameJoin: ', ',
  deploy: 'Place your ship here · {place}. This sector becomes your Home.',
  routeCell: 'Route to {place}',
  lane: {
    outbound: '{planet} lane {letter} · one way: jump from Black Hole {from} to {planet} {to}',
    inbound: '{planet} lane {letter} · one way: jump from {planet} {from} to Black Hole {to}',
    /** A lane's arc on one ring: its ring and its first and last sectors. */
    span: 'R{ring} S{first}–{last}',
  },
  /** The caption a ring carries: its number and its velocity, in the board's capitals. */
  ring: 'R{ring} · V{velocity}',

  /** The buttons down the board's edge, on both renderers; the camera presets are the 3D board's. */
  controls: {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    recentre: 'Recentre the board',
    preset: {
      table: 'Table view',
      top: 'Top view',
      follow: 'Follow your ship',
      auto: 'Auto camera: films each turn, then pulls back for yours',
    },
  },
} as const
