/**
 * Where each card fails: every kept card followed through the game's events,
 * from its first step to the point it scored or the game ended.
 *
 * A card is two steps, the one that starts it and the one that scores it
 * (Deliver loads a crate and delivers it, Intercept scans and files), and in
 * between the item can be lost. Read per card, these say whether a card that
 * scores rarely is hard to start, hard to carry or simply slow, which is the
 * question a completion rate cannot answer: a card the bots play badly and a
 * card that is hard read the same there.
 */
import type { Mission, MissionType } from "../models/missions.ts";
import { TANKER_FUEL } from "../models/missions.ts";
import type { GameRunResult } from "./runGame.ts";

/** One kept card, followed through one game. */
export interface CardTrack {
  type: MissionType;
  /** Round of the first step, or null if it never happened. */
  stepRound: number | null;
  /**
   * Times the item was lost to the holder's death. For Escort, the marker
   * coming back when the escort dies; the track restarts with the next mark.
   */
  lostToKill: number;
  /**
   * Escort: times the marker came back because the marked ship died before it
   * paid; the track restarts with the next mark.
   */
  lostToCarrier: number;
  /**
   * Escort: times the marked ship sold or pumped fuel with the escort out of
   * its well, so the marker stayed out and paid nothing. What says whether
   * the bots shadow their mark.
   */
  missedSales: number;
  /** Times it was taken by Piracy. */
  lostToPiracy: number;
  /** Tanker: times the ship left the planet's well, or burned under the fuel, without pumping. */
  lostToBurn: number;
  /** Round the card scored, or null. */
  completedRound: number | null;
  /** Rounds from the step that led to the score to the score. */
  stepToDone: number | null;
  /** The game ended with the step done and the card not scored. */
  openWithStep: boolean;
}

/** What each card's first step is, as the benchmark page names it. */
export const FIRST_STEP: Record<MissionType, string> = {
  destroy_ship: "target hit",
  deliver_cargo: "crate loaded",
  intercept_transmission: "target scanned",
  survey: "dive made",
  piracy: "item taken",
  tanker: `in a planet's well with ${TANKER_FUEL} fuel`,
  escort: "marker placed",
  salvage: "box taken",
};

/** The id of the item a card carries between its two steps, if it carries one. */
function itemId(m: Mission): string | null {
  switch (m.type) {
    case "deliver_cargo":
    case "piracy":
    case "salvage":
      return m.cargoId;
    case "intercept_transmission":
    case "survey":
      return m.dataCargoId;
    default:
      return null;
  }
}

export function cardTracksOf(run: GameRunResult): CardTrack[] {
  const tracks: CardTrack[] = [];

  for (const player of run.finalState.players) {
    for (const m of player.missions) {
      const track: CardTrack = {
        type: m.type,
        stepRound: null,
        lostToKill: 0,
        lostToCarrier: 0,
        missedSales: 0,
        lostToPiracy: 0,
        lostToBurn: 0,
        completedRound: null,
        stepToDone: null,
        openWithStep: false,
      };
      const item = itemId(m);
      // The step is "live" while the item is aboard, the marker is out or the
      // tank holds the fuel; `since` is the round it last went live.
      let since: number | null = null;
      const start = (round: number) => {
        track.stepRound ??= round;
        since ??= round;
      };

      // Escort: the ship the marker is on while it is out.
      let carrier: string | null = null;

      run.turns.forEach((turn, i) => {
        // Escort: the card scored on this turn, so a sale on it was not missed.
        const paidThisTurn = turn.events.some(
          (e) => e.type === "mission_completed" && e.mission.id === m.id
        );
        for (const e of turn.events) {
          if (e.type === "mission_completed" && e.mission.id === m.id) {
            track.completedRound = e.turn;
            track.stepToDone = since === null ? null : e.turn - since;
            since = null;
            continue;
          }
          if (track.completedRound !== null) continue;
          switch (m.type) {
            case "destroy_ship":
              if (
                e.type === "attack_resolved" &&
                e.attackerId === player.id &&
                e.targetId === m.targetPlayerId &&
                e.toHull > 0
              )
                start(e.turn);
              break;
            case "deliver_cargo":
              if (e.type === "cargo_picked_up" && e.playerId === player.id && e.cargoId === item)
                start(e.turn);
              break;
            case "intercept_transmission":
            case "survey":
              if (e.type === "data_acquired" && e.playerId === player.id && e.missionId === m.id)
                start(e.turn);
              break;
            case "piracy":
              if (e.type === "cargo_seized" && e.pirateId === player.id) start(e.turn);
              break;
            case "salvage":
              if (e.type === "wreck_salvaged" && e.playerId === player.id && e.cargoId === item)
                start(e.turn);
              break;
            case "escort":
              if (e.type === "escort_marked" && e.missionId === m.id) {
                start(e.turn);
                carrier = e.carrierId;
              }
              // Either ship died: the marker is back in hand and can go out again.
              if (e.type === "escort_released" && e.missionId === m.id && since !== null) {
                if (e.cause === "escort_destroyed") track.lostToKill++;
                else track.lostToCarrier++;
                since = null;
                carrier = null;
              }
              if (
                (e.type === "cargo_delivered" || e.type === "fuel_pumped") &&
                e.playerId === carrier &&
                since !== null &&
                !paidThisTurn
              )
                track.missedSales++;
              break;
            case "tanker":
              if (e.type === "fuel_pumped" && e.playerId === player.id) start(e.turn);
              break;
          }
          // Losing an item: taken by a pirate, or gone with the ship (a
          // Tanker's fuel goes with it too: the ship comes back at Home).
          if ((item !== null || m.type === "tanker") && since !== null) {
            if (e.type === "cargo_seized" && e.victimId === player.id && e.cargoId === item) {
              track.lostToPiracy++;
              since = null;
            } else if (e.type === "ship_destroyed" && e.victimId === player.id) {
              track.lostToKill++;
              since = null;
            }
          }
        }
        // A Tanker is started by ending a turn in a planet's well with the
        // fuel aboard (every tank starts full, so the fuel alone says
        // nothing), and read at the end of the holder's own turns.
        if (m.type === "tanker" && turn.playerId === player.id && track.completedRound === null) {
          // `turnStats` runs in step with `turns`, one entry per turn played.
          const stat = run.turnStats[i];
          if (stat === undefined) return;
          if (stat.endedAtPlanet && stat.fuel >= TANKER_FUEL) start(turn.turnNumber);
          else if (since !== null) {
            track.lostToBurn++;
            since = null;
          }
        }
      });
      track.openWithStep = track.completedRound === null && since !== null;
      tracks.push(track);
    }
  }
  return tracks;
}
