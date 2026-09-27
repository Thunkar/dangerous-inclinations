/**
 * The simulator's secondary-pile channel: `--secondaries=survey,piracy,tanker`.
 *
 * It replaces the kinds the secondary pile is printed with (any subset of
 * {@link SECONDARY_KINDS_PRINTED}, in any order), so the deal can be measured
 * with and without a card. Like the tile and weapon channels it mutates the
 * shared configuration of the process (or worker thread) running the games,
 * so every game of a batch is dealt from the same pile. Never used by the
 * server or the UI: a table plays the full printed pile.
 */
import { SECONDARY_KINDS_PRINTED, type SecondaryKind } from "../models/missions.ts";

/** Every kind the printed pile can hold, captured before any override. */
const ALL_KINDS: readonly SecondaryKind[] = [...SECONDARY_KINDS_PRINTED];

export function parseSecondaryOverrides(text: string): SecondaryKind[] {
  const kinds = text
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  if (kinds.length === 0) throw new Error("--secondaries needs at least one kind");
  for (const kind of kinds) {
    if (!(ALL_KINDS as readonly string[]).includes(kind))
      throw new Error(`Unknown secondary "${kind}". Known: ${ALL_KINDS.join(", ")}`);
  }
  if (new Set(kinds).size !== kinds.length)
    throw new Error(`--secondaries names a kind twice: ${kinds.join(", ")}`);
  return kinds as SecondaryKind[];
}

/** Print the pile with these kinds in this process; without a list, nothing changes. */
export function applySecondaryOverrides(kinds?: readonly SecondaryKind[]): void {
  if (!kinds) return;
  SECONDARY_KINDS_PRINTED.splice(0, SECONDARY_KINDS_PRINTED.length, ...kinds);
}

/** The kinds the pile is printed with right now, as the pages stamp them. */
export function describeSecondaryKinds(
  kinds: readonly SecondaryKind[] = SECONDARY_KINDS_PRINTED
): string {
  const label = (k: SecondaryKind) => k.charAt(0).toUpperCase() + k.slice(1);
  return kinds.map(label).join(", ");
}
