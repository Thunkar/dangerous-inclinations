/**
 * Piracy as the bots play it (RULES §Missions): a pirate names the item it
 * takes, one per free Piracy card, so the choice is the one that costs the
 * victim most, and takes it at the first point of the turn it shares a
 * sector with the carrier.
 *
 * What the view says about an item is its kind, and the order follows it: a
 * Deliver crate (the victim's primary, two points sent back to the pickup
 * station), then loot (a rival pirate's card sent back to undone), then data.
 * An Intercept's transmission is a primary too, but which data is which is
 * private (the scan that takes it is announced to its taker alone, and an
 * item's id is an opaque token), so data is ranked as one kind. Ties go to
 * the order `seizableItems` lists them, which is seat order from the next
 * seat after the pirate.
 */
import type { Player, Position } from "../../models/game.ts";
import type { HoldItemKind } from "../../models/missions.ts";
import type { GameView } from "../../game/view.ts";
import { freePiracyCards, seizableItems, type SeizableItem } from "../../game/piracy.ts";

const RANK: Readonly<Record<HoldItemKind, number>> = { crate: 0, loot: 1, data: 2 };

/**
 * The items this seat seizes with its ship at `at`, one per Piracy card still
 * free once `taken` (seized earlier in the same turn) is aboard.
 */
export function seizeChoices(
  view: GameView,
  me: Player,
  at: Position,
  taken: readonly SeizableItem[] = []
): SeizableItem[] {
  const room = freePiracyCards(me.missions, me.cargo).length - taken.length;
  if (room <= 0) return [];
  const items = seizableItems(view, me.id, at).filter(
    (i) => !taken.some((t) => t.victimId === i.victimId && t.cargoId === i.cargoId)
  );
  // A stable sort: equal kinds keep the seat order they were listed in.
  return [...items].sort((a, b) => RANK[a.kind] - RANK[b.kind]).slice(0, room);
}

/**
 * A turn's seizures: whatever shares the ship's sector before it moves is
 * taken first, at the head of the sequence, so no shot of the turn can make
 * it go down with its carrier; then whatever shares the sector the move ends
 * in, right after the move. Nothing here sends the ship anywhere: a seizure
 * in passing is one the goal's own route already makes.
 */
export function turnSeizures(
  view: GameView,
  me: Player,
  start: Position,
  landing: Position
): { before: SeizableItem[]; after: SeizableItem[] } {
  const before = seizeChoices(view, me, start);
  return { before, after: seizeChoices(view, me, landing, before) };
}
