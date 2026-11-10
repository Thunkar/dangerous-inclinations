/** The few words the turn column's controls build from the text file and a number. */
import { fill } from '@dangerous-inclinations/engine'
import { ACTIONS } from '../../../text/actions'

const W = ACTIONS.words

/** A small count said as a word ("three"); past the words, the figure. */
export const inWords = (n: number): string => W.numbers[n] ?? String(n)

/** A phasing figure with its sign: "+2", "0", "-1". */
export const signed = (n: number): string => (n > 0 ? fill(W.plus, { value: n }) : String(n))

/** "1 ring outward", "2 rings inward". */
export const ringsPhrase = (rings: number, direction: string): string =>
  fill(rings === 1 ? W.rings.one : W.rings.many, { rings, direction })

/** Where a step offered before or after the move goes, said on its chip. */
export const when = (before: boolean): string => (before ? W.when.before : W.when.after)
/** The same, as the sentence that opens its tooltip. */
export const whenTitle = (before: boolean): string =>
  before ? W.whenTitle.before : W.whenTitle.after
