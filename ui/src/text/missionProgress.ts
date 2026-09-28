/**
 * The line of progress a held mission card prints under its title
 * (`utils/missions.ts`), card by card in deck order. Destroy has none: their
 * hull reaches 0 or it does not.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number: the words around a slot are free to change, and a slot may move or
 * be dropped but keeps its name.
 */

export const MISSION_PROGRESS = {
  deliver_cargo: 'Crate aboard',
  intercept_transmission: 'Transmission aboard',
  survey: 'Data aboard',
  piracy: 'Loot aboard',
  /** The holder's tank, next to the card at the table. */
  tanker: 'Tank {fuel}/{max}',
  escort: 'Marker placed',
  salvage: 'Black box aboard',
} as const
