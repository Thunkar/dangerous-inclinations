/**
 * The face every number on the 3D board is set in.
 *
 * drei's `<Text>` asks troika for a font, and with no `font` prop troika
 * fetches one from a CDN at runtime: the wrong face (a proportional sans,
 * where the table's convention is monospace for every number) and no text at
 * all on a machine that is offline or behind a strict policy. So the board
 * carries its own: Liberation Mono, already named in the theme's monospace
 * stack, vendored here under the SIL Open Font License (see the LICENSE file
 * beside it) and bundled as a hashed asset.
 *
 * Pass it to every `<Text>` on the board — there is no other font.
 */
import boardFontUrl from './LiberationMono-Regular.ttf?url'

export const BOARD_FONT = boardFontUrl
