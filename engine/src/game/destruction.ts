/**
 * What a destruction does, the moment it happens (RULES §Destruction and
 * Respawn): settled where the kill comes, so everything after it in the turn
 * sees the wreck, the dropped cargo and the markers back in hand. A kill among
 * the actions is settled right after the action that made it
 * (actionProcessors.ts); a kill by a missile from an earlier turn or by the
 * heat check, where it comes in the turn (turns.ts).
 */
import type { GameState, Wreck } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import { dropCargo } from "./respawn.ts";
import { positionOf } from "./geometry.ts";
import { nextEntityId } from "../utils/rng.ts";

/**
 * The one place a destruction is settled, whatever did it (a weapon, a
 * missile, the heat check): for every ship destroyed in `source` events it
 * drops its cargo, removes its missiles in flight, leaves a wreck where it
 * died, and hands back every Escort marker on it and every one of its own
 * (RULES §Destruction and Respawn). `sink` is the turn's events so far, which
 * the new ones are appended to.
 */
export function applyDestructions(
  state: GameState,
  source: EventDraft[],
  sink: EventDraft[]
): GameState {
  let next = state;
  for (const e of source) {
    if (e.type !== "ship_destroyed") continue;
    const index = next.players.findIndex((p) => p.id === e.victimId);
    if (index === -1) continue;
    const victim = next.players[index];
    const dropped = dropCargo(victim);
    const players = [...next.players];
    players[index] = dropped.player;
    sink.push(...dropped.events);
    next = { ...next, players };

    // Its missiles in flight go with it.
    const lost = next.missiles.filter((m) => m.ownerId === victim.id);
    if (lost.length > 0) {
      next = { ...next, missiles: next.missiles.filter((m) => m.ownerId !== victim.id) };
      for (const missile of lost) {
        sink.push({
          type: "missile_expired",
          missileId: missile.id,
          ownerId: victim.id,
          at: positionOf(missile),
        });
      }
    }

    // The wreck: where the ship was when it died. A destroyed ship stays on
    // its sector until it respawns, so its position is the place.
    const wreck: Wreck = { id: nextEntityId(next, "wreck"), ...positionOf(victim.ship) };
    next = { ...next, wrecks: [...next.wrecks, wreck] };
    sink.push({
      type: "wreck_left",
      wreckId: wreck.id,
      victimId: victim.id,
      at: positionOf(victim.ship),
    });

    // Escort: every marker on the dead ship comes back to its owner, and the
    // dead ship's own markers come off whatever they sit on and back to hand.
    // Nothing after the dock can destroy the ship whose turn it is, so a
    // destroyed carrier never sold this turn and no marker on it was paid.
    next = settleEscorts(next, victim.id, sink);
  }
  return next;
}

/**
 * The Escort side of a destruction (RULES §Destruction and Respawn): every
 * undone Escort marking `victimId` comes back to its owner's hand, and every
 * Escort `victimId` holds that has a marker out comes back too.
 */
export function settleEscorts(state: GameState, victimId: string, sink: EventDraft[]): GameState {
  let changed = false;
  const players = state.players.map((player) => {
    let touched = false;
    const missions = player.missions.map((m) => {
      if (m.type !== "escort" || m.isCompleted || m.markedPlayerId === null) return m;
      if (player.id === victimId) {
        touched = true;
        sink.push({
          type: "escort_released",
          escortId: player.id,
          carrierId: m.markedPlayerId,
          missionId: m.id,
          cause: "escort_destroyed",
        });
        return { ...m, markedPlayerId: null };
      }
      if (m.markedPlayerId !== victimId) return m;
      touched = true;
      sink.push({
        type: "escort_released",
        escortId: player.id,
        carrierId: victimId,
        missionId: m.id,
        cause: "carrier_destroyed",
      });
      return { ...m, markedPlayerId: null };
    });
    if (!touched) return player;
    changed = true;
    return { ...player, missions };
  });
  return changed ? { ...state, players } : state;
}
