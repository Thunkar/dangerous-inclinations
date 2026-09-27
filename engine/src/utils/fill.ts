/**
 * The printable text (`engine/src/text/`, `ui/src/text/`) is plain strings
 * with `{name}` slots; this puts the caller's values in them. The slot names
 * are read off the string's type, so a slot the caller does not fill is a
 * compile error.
 */

/** The `{name}` slots of a template string. */
export type SlotNames<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | SlotNames<Rest>
  : never;

export type SlotValue = string | number | null;

/** A value for every slot of `S`; a value whose slot the text dropped is allowed. */
export type SlotValues<S extends string> = Record<SlotNames<S>, SlotValue> &
  Record<string, SlotValue>;

const SLOT = /\{(\w+)\}/g;

/** The template with every slot replaced by its value, as one string. */
export function fill<S extends string>(template: S, values: SlotValues<S>): string {
  return template.replace(SLOT, (_, name: string) => String(values[name]));
}
