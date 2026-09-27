/**
 * The printable text (`ui/src/text/`) is plain strings with `{name}` slots,
 * and a word set differently inside a sentence is marked with a tag:
 * `<b>public</b>`. This sets such a string as elements: `b` is bold
 * everywhere, any other tag is named by the caller (a red span, a link, a
 * range that must not break), and tags do not nest.
 *
 * Each slot's value is a text node of its own, the way JSX writes
 * `text {value} text`, so a sentence breaks into the same runs the browser
 * shapes it in; `{_}` is a space set as a run of its own, the way JSX writes
 * `{' '}`. A string with no tags and no slots comes back as the string.
 * `fill` (from the engine) is the same substitution when one string is wanted.
 */
import { Fragment, type ReactNode } from 'react'
import type { SlotNames, SlotValue, SlotValues } from '@dangerous-inclinations/engine'

export type RichTags = Record<string, (children: ReactNode) => ReactNode>

const BOLD: RichTags = { b: children => <b>{children}</b> }

const TAG = /<(\w+)>(.*?)<\/\1>/gs
const SLOT = /\{(\w+)\}/g

/** The literal runs of `text` and the value of each slot in it, in order. */
function runs(text: string, values: Record<string, SlotValue>): string[] {
  const out: string[] = []
  let last = 0
  for (const match of text.matchAll(SLOT)) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const value = match[1] === '_' ? ' ' : values[match[1]]
    if (value !== null && value !== '') out.push(String(value))
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const single = (nodes: ReactNode[]): ReactNode => (nodes.length === 1 ? nodes[0] : nodes)

type RichArgs<S extends string> = [SlotNames<S>] extends [never]
  ? [values?: Record<string, SlotValue>, tags?: RichTags]
  : [values: SlotValues<S>, tags?: RichTags]

export function rich<S extends string>(
  template: S,
  ...[values = {}, tags = {}]: RichArgs<S>
): ReactNode {
  const set = { ...BOLD, ...tags }
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of template.matchAll(TAG)) {
    nodes.push(...runs(template.slice(last, match.index), values))
    const render = set[match[1]]
    if (!render) throw new Error(`No element for <${match[1]}> in "${template}"`)
    nodes.push(<Fragment key={match.index}>{render(single(runs(match[2], values)))}</Fragment>)
    last = match.index + match[0].length
  }
  nodes.push(...runs(template.slice(last), values))
  return single(nodes)
}
