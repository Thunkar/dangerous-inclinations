/**
 * WebSocket connection registry. Three kinds of room: the global room (lobby
 * list), one room per lobby and one room per game.
 *
 * A player may hold several sockets in the same room (one per open tab). Every
 * socket of a player receives that player's messages, and the player counts as
 * connected while any of them is open, so closing one tab never tears down a
 * game another tab is still playing.
 *
 * Game rooms send per-recipient messages (`sendToPlayer`, `broadcastViews`)
 * because every game message carries the recipient's own view of the state.
 * `broadcastToRoom` sends the same string to everyone and is only for lobby
 * and global messages, which carry no game state.
 */
import type { WebSocket } from "@fastify/websocket";

export type Room = "global" | "lobby" | "game";

const OPEN = 1;

interface Connection {
  ws: WebSocket;
  /**
   * Messages held back until the socket has received its initial view; `null`
   * once they flow. A socket joins the room before its GAME_VIEW is built, so
   * a turn committed meanwhile is buffered and delivered after it, never
   * before (docs/protocol.md ordering guarantees).
   */
  buffer: unknown[] | null;
}

// roomKey -> playerId -> that player's sockets in the room
const rooms = new Map<string, Map<string, Set<Connection>>>();

function roomKey(room: Room, roomId?: string): string {
  return roomId ? `${room}:${roomId}` : room;
}

function connectionsOf(room: Room, roomId: string | undefined, playerId: string): Set<Connection> | undefined {
  return rooms.get(roomKey(room, roomId))?.get(playerId);
}

function find(room: Room, roomId: string | undefined, playerId: string, ws: WebSocket): Connection | undefined {
  for (const connection of connectionsOf(room, roomId, playerId) ?? []) {
    if (connection.ws === ws) return connection;
  }
  return undefined;
}

export function registerConnection(
  room: Room,
  roomId: string | undefined,
  playerId: string,
  ws: WebSocket,
  options: { buffered?: boolean } = {},
): void {
  const key = roomKey(room, roomId);
  let byPlayer = rooms.get(key);
  if (!byPlayer) {
    byPlayer = new Map();
    rooms.set(key, byPlayer);
  }
  let connections = byPlayer.get(playerId);
  if (!connections) {
    connections = new Set();
    byPlayer.set(playerId, connections);
  }
  if (find(room, roomId, playerId, ws)) return; // already registered
  connections.add({ ws, buffer: options.buffered ? [] : null });
}

/** Let a buffered socket start receiving: flush what was held, in order. */
export function releaseConnection(room: Room, roomId: string | undefined, playerId: string, ws: WebSocket): void {
  const connection = find(room, roomId, playerId, ws);
  if (!connection || !connection.buffer) return;
  const held = connection.buffer;
  connection.buffer = null;
  for (const message of held) send(connection, message);
}

/** Remove one socket. Other sockets of the same player keep the player connected. */
export function unregisterConnection(room: Room, roomId: string | undefined, playerId: string, ws: WebSocket): void {
  const key = roomKey(room, roomId);
  const byPlayer = rooms.get(key);
  const connections = byPlayer?.get(playerId);
  if (!byPlayer || !connections) return;
  for (const connection of connections) {
    if (connection.ws === ws) connections.delete(connection);
  }
  if (connections.size === 0) byPlayer.delete(playerId);
  if (byPlayer.size === 0) rooms.delete(key);
}

/** Players with at least one open socket in the room. */
export function getConnectedPlayers(room: Room, roomId?: string): Set<string> {
  const connected = new Set<string>();
  const byPlayer = rooms.get(roomKey(room, roomId));
  if (!byPlayer) return connected;
  for (const [playerId, connections] of byPlayer) {
    for (const connection of connections) {
      if (connection.ws.readyState === OPEN) {
        connected.add(playerId);
        break;
      }
    }
  }
  return connected;
}

function send(connection: Connection, message: unknown): void {
  if (connection.buffer) {
    connection.buffer.push(message);
    return;
  }
  if (connection.ws.readyState === OPEN) connection.ws.send(JSON.stringify(message));
}

export function sendToPlayer(room: Room, roomId: string, playerId: string, message: unknown): void {
  for (const connection of connectionsOf(room, roomId, playerId) ?? []) send(connection, message);
}

/** Build and send a message for each member of the room; every socket of a player gets it. */
export function broadcastViews(room: Room, roomId: string, build: (playerId: string) => unknown): void {
  const byPlayer = rooms.get(roomKey(room, roomId));
  if (!byPlayer) return;
  for (const [playerId, connections] of byPlayer) {
    if (connections.size === 0) continue;
    const message = build(playerId);
    for (const connection of connections) send(connection, message);
  }
}

/** Same message to everyone. Lobby and global rooms only: never carries game state. */
export function broadcastToRoom(room: "global" | "lobby", message: unknown, roomId?: string): void {
  const byPlayer = rooms.get(roomKey(room, roomId));
  if (!byPlayer) return;
  for (const connections of byPlayer.values()) {
    for (const connection of connections) send(connection, message);
  }
}
