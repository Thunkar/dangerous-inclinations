/**
 * What one player is allowed to know.
 *
 * `viewFor(state, viewerId)` redacts the game state down to public
 * information plus the viewer's own ship, cards and intel. The server sends
 * each client its own view; bots decide from a view, never from the state.
 *
 * Public: positions, facing, hull, heat, energy on every slot (cubes sit on
 * the tiles in the open, even face-down ones), home markers, crates carried,
 * face-up tiles, broken fixed systems, completed missions, missiles, stations.
 * Private: face-down tile identities, fuel, ammo, missions in hand, cargo
 * destinations, mission offers, what a scan showed you.
 */
import type { GameState, Missile, Player, Position, Station, GamePhase } from "../models/game.ts";
import type { Mission } from "../models/missions.ts";
import type { SlotGroup, SubsystemId, SubsystemType } from "../models/subsystems.ts";
import {
  getDissipationCapacity,
  getEffectiveCriticalChance,
  getMaxReactionMass,
  isDestroyed,
} from "./ship.ts";
import { completedMissions } from "./missions/missionChecks.ts";

export interface PublicShipView {
  wellId: string;
  ring: number;
  sector: number;
  facing: Player["ship"]["facing"];
  hitPoints: number;
  maxHitPoints: number;
  heat: number;
  /** Energy not routed to any tile (public: 10 minus the cubes on the mat). */
  reactorAvailable: number;
  isDestroyed: boolean;
}

export type SlotKnowledge = "own" | "revealed" | "scanned" | null;

export interface SlotView {
  id: SubsystemId;
  group: SlotGroup;
  index: number;
  /** null = face-down and unknown to the viewer. */
  type: SubsystemType | null;
  isBroken: boolean | null;
  knownVia: SlotKnowledge;
  /** Energy cubes on the tile. Public: a hint about what the tile is. */
  allocatedEnergy: number;
}

export interface FixedSystemView {
  id: SubsystemId;
  type: SubsystemType;
  isBroken: boolean;
  allocatedEnergy: number;
}

export interface PlayerView {
  id: string;
  name: string;
  isMe: boolean;
  isActive: boolean;
  hasSubmittedLoadout: boolean;
  hasDeployed: boolean;
  home: Position | null;
  ship: PublicShipView | null;
  fixed: FixedSystemView[];
  slots: SlotView[];
  /** Tokens aboard (public: they sit on the ship). */
  cargoAboard: { crates: number; data: number };
  /** Total tokens aboard. */
  cargoCount: number;
  completedMissionCount: number;
  completedMissions: Mission[];
}

export interface OwnShipStats {
  dissipationCapacity: number;
  maxReactionMass: number;
  criticalChance: number;
}

export interface GameView {
  turn: number;
  phase: GamePhase;
  activePlayerIndex: number;
  activePlayerId: string;
  players: PlayerView[];
  stations: Station[];
  missiles: Missile[];
  winnerId?: string;
  /** The viewer's full player record, or null for a spectator. */
  me: Player | null;
  myStats: OwnShipStats | null;
}

function shipView(player: Player): PublicShipView | null {
  if (!player.hasDeployed) return null;
  const s = player.ship;
  return {
    wellId: s.wellId,
    ring: s.ring,
    sector: s.sector,
    facing: s.facing,
    hitPoints: s.hitPoints,
    maxHitPoints: s.maxHitPoints,
    heat: s.heat.currentHeat,
    reactorAvailable: s.reactor.availableEnergy,
    isDestroyed: isDestroyed(s),
  };
}

export function playerViewFor(state: GameState, player: Player, viewer: Player | null): PlayerView {
  const isMe = viewer?.id === player.id;
  const scanned = new Set(viewer?.intel[player.id] ?? []);
  const loadoutKnown = player.hasSubmittedLoadout;

  const slots: SlotView[] = player.ship.subsystems
    .filter((s) => s.slotGroup !== undefined)
    .map((s) => {
      const known: SlotKnowledge = isMe
        ? "own"
        : s.isRevealed
          ? "revealed"
          : scanned.has(s.id)
            ? "scanned"
            : null;
      const visible = known !== null && loadoutKnown;
      return {
        id: s.id,
        group: s.slotGroup!,
        index: s.slotIndex!,
        type: visible ? s.type : null,
        isBroken: visible ? s.isBroken : null,
        knownVia: visible ? known : null,
        allocatedEnergy: s.allocatedEnergy,
      };
    });

  return {
    id: player.id,
    name: player.name,
    isMe,
    isActive: state.players[state.activePlayerIndex]?.id === player.id,
    hasSubmittedLoadout: player.hasSubmittedLoadout,
    hasDeployed: player.hasDeployed,
    home: player.home,
    ship: shipView(player),
    fixed: player.ship.subsystems
      .filter((s) => s.slotGroup === undefined)
      .map((s) => ({
        id: s.id,
        type: s.type,
        isBroken: s.isBroken,
        allocatedEnergy: s.allocatedEnergy,
      })),
    slots,
    cargoAboard: {
      crates: player.cargo.filter((c) => c.isPickedUp && c.kind === "crate").length,
      data: player.cargo.filter((c) => c.isPickedUp && c.kind === "data").length,
    },
    cargoCount: player.cargo.filter((c) => c.isPickedUp).length,
    completedMissionCount: player.completedMissionCount,
    completedMissions: completedMissions(player),
  };
}

export function viewFor(state: GameState, viewerId: string | null): GameView {
  const me = viewerId ? (state.players.find((p) => p.id === viewerId) ?? null) : null;
  return {
    turn: state.turn,
    phase: state.phase,
    activePlayerIndex: state.activePlayerIndex,
    activePlayerId: state.players[state.activePlayerIndex]?.id ?? "",
    players: state.players.map((p) => playerViewFor(state, p, me)),
    stations: state.stations,
    missiles: state.missiles,
    winnerId: state.winnerId,
    me,
    myStats: me
      ? {
          dissipationCapacity: getDissipationCapacity(me.ship.subsystems),
          maxReactionMass: getMaxReactionMass(me.ship.subsystems),
          criticalChance: getEffectiveCriticalChance(me.ship.subsystems),
        }
      : null,
  };
}

/** Public positions of every deployed, living opponent (for range checks). */
export function opponentPositions(view: GameView): Array<{ id: string; position: Position }> {
  return view.players
    .filter((p) => !p.isMe && p.ship && !p.ship.isDestroyed)
    .map((p) => ({
      id: p.id,
      position: { wellId: p.ship!.wellId, ring: p.ship!.ring, sector: p.ship!.sector },
    }));
}
