/**
 * WebSocket room handler - supports global, lobby, and game rooms
 */

import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { getPlayer } from "../services/playerService.js";
import { getLobby } from "../services/lobbyService.js";

type Room = "global" | "lobby" | "game";

interface RoomConnection {
  playerId: string;
  ws: WebSocket;
  roomKey: string;
}

// Store all WebSocket connections by roomKey (e.g., "global:playerId", "lobby:lobbyId:playerId")
const connections = new Map<string, RoomConnection>();

// Store room memberships (roomKey -> Set<playerId>)
const rooms = new Map<string, Set<string>>();

/**
 * Get room key
 */
function getRoomKey(room: Room, roomId?: string): string {
  return roomId ? `${room}:${roomId}` : room;
}

/**
 * Add connection to a room
 */
function addToRoom(playerId: string, room: Room, roomId?: string) {
  const roomKey = getRoomKey(room, roomId);

  // Add to room membership
  if (!rooms.has(roomKey)) {
    rooms.set(roomKey, new Set());
  }
  rooms.get(roomKey)!.add(playerId);
}

/**
 * Get connection key for storing WebSocket
 */
function getConnectionKey(playerId: string, room: Room, roomId?: string): string {
  const roomKey = getRoomKey(room, roomId);
  return `${roomKey}:${playerId}`;
}

/**
 * Remove connection from a room
 */
function removeFromRoom(playerId: string, room: Room, roomId?: string) {
  const roomKey = getRoomKey(room, roomId);

  // Remove from room membership
  const roomMembers = rooms.get(roomKey);
  if (roomMembers) {
    roomMembers.delete(playerId);
    if (roomMembers.size === 0) {
      rooms.delete(roomKey);
    }
  }

  // Remove WebSocket connection
  const connKey = getConnectionKey(playerId, room, roomId);
  connections.delete(connKey);
}

/**
 * Broadcast message to all members of a room
 */
export function broadcastToRoom(
  room: Room,
  message: any,
  roomId?: string,
  excludePlayerId?: string,
) {
  const roomKey = getRoomKey(room, roomId);
  const members = rooms.get(roomKey);

  if (!members) return;

  const messageStr = JSON.stringify(message);

  members.forEach((playerId) => {
    if (playerId === excludePlayerId) return;

    // Find connection for this player in this room
    const connKey = `${roomKey}:${playerId}`;
    const connection = connections.get(connKey);
    if (connection && connection.ws.readyState === 1) {
      // OPEN
      connection.ws.send(messageStr);
    }
  });
}

/**
 * Setup WebSocket room handlers
 */
export async function setupWebSocketRooms(fastify: FastifyInstance) {
  /**
   * Global room - for lobby list updates
   * URL: /ws/global?playerId=xxx
   */
  fastify.get("/ws/global", { websocket: true }, async (socket, request) => {
    const query = request.query as { playerId?: string };
    const playerId = query.playerId;

    if (!playerId) {
      socket.close(1008, "Player ID required");
      return;
    }

    const player = await getPlayer(playerId);
    if (!player) {
      socket.close(1008, "Invalid player");
      return;
    }

    // Register WebSocket connection
    const connKey = getConnectionKey(playerId, "global");
    connections.set(connKey, {
      playerId,
      ws: socket as WebSocket,
      roomKey: "global",
    });

    // Add to global room
    addToRoom(playerId, "global");

    fastify.log.info(
      `Player ${player.playerName} (${playerId}) connected to global room`,
    );

    // Send welcome message
    socket.send(
      JSON.stringify({
        type: "CONNECTED",
        room: "global",
      }),
    );

    socket.on("close", () => {
      removeFromRoom(playerId, "global");
      fastify.log.info(
        `Player ${player.playerName} (${playerId}) disconnected from global room`,
      );
    });
  });

  /**
   * Lobby room - for lobby-specific updates
   * URL: /ws/lobby?playerId=xxx&roomId=lobbyId
   */
  fastify.get("/ws/lobby", { websocket: true }, async (socket, request) => {
    const query = request.query as { playerId?: string; roomId?: string };
    const playerId = query.playerId;
    const lobbyId = query.roomId;

    if (!playerId) {
      socket.close(1008, "Player ID required");
      return;
    }

    if (!lobbyId) {
      socket.close(1008, "Lobby ID required");
      return;
    }

    const player = await getPlayer(playerId);
    if (!player) {
      socket.close(1008, "Invalid player");
      return;
    }

    const lobby = await getLobby(lobbyId);
    if (!lobby) {
      socket.close(1008, "Lobby not found");
      return;
    }

    // Verify player is in lobby
    if (!lobby.players.some((p) => p.playerId === playerId)) {
      socket.close(1008, "Player not in lobby");
      return;
    }

    // Register WebSocket connection
    const connKey = getConnectionKey(playerId, "lobby", lobbyId);
    connections.set(connKey, {
      playerId,
      ws: socket as WebSocket,
      roomKey: getRoomKey("lobby", lobbyId),
    });

    // Add to lobby room
    addToRoom(playerId, "lobby", lobbyId);

    fastify.log.info(
      `Player ${player.playerName} (${playerId}) connected to lobby ${lobbyId}`,
    );

    // Send welcome message
    socket.send(
      JSON.stringify({
        type: "CONNECTED",
        room: "lobby",
        roomId: lobbyId,
      }),
    );

    // Note: PLAYER_JOINED is now broadcast from lobbyService.joinLobby()
    // with full LobbyPlayer data when a player joins via API
    // This WebSocket connection notification is separate

    socket.on("close", () => {
      removeFromRoom(playerId, "lobby", lobbyId);

      // Notify others in lobby
      broadcastToRoom("lobby", {
        type: "PLAYER_LEFT",
        payload: {
          playerId,
        },
      }, lobbyId);

      fastify.log.info(
        `Player ${player.playerName} (${playerId}) disconnected from lobby ${lobbyId}`,
      );
    });
  });

  /**
   * Game room - for game state updates
   * URL: /ws/game?playerId=xxx&roomId=gameId
   */
  fastify.get("/ws/game", { websocket: true }, async (socket, request) => {
    const query = request.query as { playerId?: string; roomId?: string };
    const playerId = query.playerId;
    const gameId = query.roomId;

    if (!playerId) {
      socket.close(1008, "Player ID required");
      return;
    }

    if (!gameId) {
      socket.close(1008, "Game ID required");
      return;
    }

    const player = await getPlayer(playerId);
    if (!player) {
      socket.close(1008, "Invalid player");
      return;
    }

    // TODO: Verify player is in game

    // Register WebSocket connection
    const connKey = getConnectionKey(playerId, "game", gameId);
    connections.set(connKey, {
      playerId,
      ws: socket as WebSocket,
      roomKey: getRoomKey("game", gameId),
    });

    // Add to game room
    addToRoom(playerId, "game", gameId);

    fastify.log.info(
      `Player ${player.playerName} (${playerId}) connected to game ${gameId}`,
    );

    // Send welcome message
    socket.send(
      JSON.stringify({
        type: "CONNECTED",
        room: "game",
        roomId: gameId,
      }),
    );

    // Handle game messages (turn submission, etc.)
    socket.on("message", async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        // TODO: Handle game actions (will be done in Phase 4)
        fastify.log.info(`Game message from ${playerId}:`, data);
      } catch (error) {
        fastify.log.error({ error }, "WebSocket message error");
      }
    });

    socket.on("close", () => {
      removeFromRoom(playerId, "game", gameId);
      fastify.log.info(
        `Player ${player.playerName} (${playerId}) disconnected from game ${gameId}`,
      );
    });
  });
}

/**
 * Clean up all connections for a player
 */
export function cleanupConnection(playerId: string) {
  // Find all connections for this player
  const playerConnKeys: string[] = [];
  connections.forEach((conn, key) => {
    if (conn.playerId === playerId) {
      playerConnKeys.push(key);
    }
  });

  // Remove from all rooms and delete connections
  playerConnKeys.forEach((connKey) => {
    const connection = connections.get(connKey);
    if (connection) {
      // Remove from room membership
      const roomMembers = rooms.get(connection.roomKey);
      if (roomMembers) {
        roomMembers.delete(playerId);
        if (roomMembers.size === 0) {
          rooms.delete(connection.roomKey);
        }
      }
      connections.delete(connKey);
    }
  });
}
