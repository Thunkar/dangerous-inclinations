/**
 * Piracy as the bots play it (RULES §Missions): a pirate names the item it
 * takes, one per free Piracy card, so the choice is the one that costs the
 * victim most.
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

/** The items this seat seizes if its turn ends at `post`, one per free Piracy card. */
export function seizeChoices(view: GameView, me: Player, post: Position): SeizableItem[] {
  const items = seizableItems(view, me.id, post);
  if (items.length === 0) return [];
  // A stable sort: equal kinds keep the seat order they were listed in.
  return [...items]
    .sort((a, b) => RANK[a.kind] - RANK[b.kind])
    .slice(0, freePiracyCards(me.missions, me.cargo).length);
}
