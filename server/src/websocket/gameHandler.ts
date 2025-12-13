import type { FastifyInstance } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import { SubmitTurnSchema } from '../schemas/game.js'
import { getPlayer } from '../services/playerService.js'
import { getGameState, processPlayerTurn } from '../services/gameService.js'

interface GameConnection {
  gameId: string
  playerId: string
  ws: WebSocket
}

// Store active connections by gameId
const gameConnections = new Map<string, GameConnection[]>()

export async function setupGameWebSocket(fastify: FastifyInstance) {
  fastify.get(
    '/ws/game/:gameId',
    { websocket: true },
    async (connection, request) => {
      const { gameId } = request.params as { gameId: string }
      const playerId = request.headers['x-player-id'] as string

      if (!playerId) {
        connection.socket.close(1008, 'Player ID required')
        return
      }

      const player = await getPlayer(playerId)
      if (!player) {
        connection.socket.close(1008, 'Invalid player')
        return
      }

      const gameState = await getGameState(gameId)
      if (!gameState) {
        connection.socket.close(1008, 'Game not found')
        return
      }

      // Register connection
      const conn: GameConnection = {
        gameId,
        playerId,
        ws: connection.socket,
      }

      if (!gameConnections.has(gameId)) {
        gameConnections.set(gameId, [])
      }
      gameConnections.get(gameId)!.push(conn)

      // Send initial state
      connection.socket.send(
        JSON.stringify({
          type: 'GAME_STATE',
          payload: gameState,
        })
      )

      connection.socket.on('message', async (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString())

          if (data.type === 'SUBMIT_TURN') {
            const result = SubmitTurnSchema.safeParse(data.payload)

            if (!result.success) {
              connection.socket.send(
                JSON.stringify({
                  type: 'ERROR',
                  payload: {
                    message: 'Invalid turn data',
                    details: result.error.errors,
                  },
                })
              )
              return
            }

            try {
              const newState = await processPlayerTurn(
                gameId,
                playerId,
                result.data.actions
              )

              if (!newState) {
                connection.socket.send(
                  JSON.stringify({
                    type: 'ERROR',
                    payload: { message: 'Failed to process turn' },
                  })
                )
                return
              }

              // Broadcast new state to all players in this game
              broadcastToGame(gameId, {
                type: 'GAME_STATE',
                payload: newState,
              })
            } catch (error) {
              connection.socket.send(
                JSON.stringify({
                  type: 'ERROR',
                  payload: {
                    message: error instanceof Error ? error.message : 'Turn processing failed',
                  },
                })
              )
            }
          }
        } catch (error) {
          fastify.log.error('WebSocket message error:', error)
          connection.socket.send(
            JSON.stringify({
              type: 'ERROR',
              payload: { message: 'Invalid message format' },
            })
          )
        }
      })

      connection.socket.on('close', () => {
        // Remove connection
        const connections = gameConnections.get(gameId)
        if (connections) {
          const index = connections.indexOf(conn)
          if (index !== -1) {
            connections.splice(index, 1)
          }
          if (connections.length === 0) {
            gameConnections.delete(gameId)
          }
        }
      })
    }
  )
}

function broadcastToGame(gameId: string, message: any) {
  const connections = gameConnections.get(gameId)
  if (!connections) return

  const messageStr = JSON.stringify(message)
  connections.forEach((conn) => {
    if (conn.ws.readyState === 1) {
      // OPEN state
      conn.ws.send(messageStr)
    }
  })
}
