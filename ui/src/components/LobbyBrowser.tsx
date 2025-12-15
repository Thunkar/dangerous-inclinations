/**
 * LobbyBrowser - Shows list of available lobbies and allows creating/joining
 */

import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  TextField,
  Typography,
  Chip,
  Stack,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import LockIcon from "@mui/icons-material/Lock";
import PersonIcon from "@mui/icons-material/Person";
import { listLobbies, createLobby, joinLobby } from "../api/lobby";
import type { LobbyListItem } from "../api/types";
import { usePlayer } from "../context/PlayerContext";
import { useWebSocket } from "../context/WebSocketContext";

export function LobbyBrowser({
  onLobbyJoined,
}: {
  onLobbyJoined: (lobbyId: string) => void;
}) {
  const { playerName } = usePlayer();
  const { client, connect, isConnected } = useWebSocket();
  const [lobbies, setLobbies] = useState<LobbyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create lobby dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newLobbyName, setNewLobbyName] = useState("");
  const [newLobbyMaxPlayers, setNewLobbyMaxPlayers] = useState(4);
  const [newLobbyPassword, setNewLobbyPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // Join lobby dialog state
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [selectedLobby, setSelectedLobby] = useState<LobbyListItem | null>(
    null,
  );
  const [joinPassword, setJoinPassword] = useState("");
  const [joining, setJoining] = useState(false);

  /**
   * Load lobbies from server
   */
  const loadLobbies = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listLobbies();
      setLobbies(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load lobbies",
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Connect to global WebSocket room and listen for real-time updates
   */
  useEffect(() => {
    // Initial load
    loadLobbies();

    if (!client) {
      console.log("[LobbyBrowser] No WebSocket client yet");
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let isCleanedUp = false;

    // Connect to global room and set up listener
    const setupConnection = async () => {
      try {
        if (!isConnected("global")) {
          console.log("[LobbyBrowser] Connecting to global room...");
          await connect("global");
          console.log("[LobbyBrowser] Connected to global room");
        }

        // If cleanup happened while we were connecting, don't set up handler
        if (isCleanedUp) {
          console.log("[LobbyBrowser] Cleaned up before connection completed");
          return;
        }

        // Set up message handler after connection
        unsubscribe = client.onMessage("global", (message) => {
          console.log("[LobbyBrowser] Received message:", message);

          if (message.type === "LOBBY_CREATED") {
            // Add new lobby to list
            const newLobby: LobbyListItem = {
              lobbyId: message.payload.lobbyId,
              lobbyName: message.payload.lobbyName,
              hasPassword: message.payload.hasPassword,
              maxPlayers: message.payload.maxPlayers,
              currentPlayers: message.payload.currentPlayers,
              gameStarted: false,
              createdAt: message.payload.createdAt,
            };
            setLobbies((prev) => [...prev, newLobby]);
          } else if (message.type === "LOBBY_DELETED") {
            // Remove lobby from list
            setLobbies((prev) =>
              prev.filter((l) => l.lobbyId !== message.payload.lobbyId),
            );
          } else if (message.type === "LOBBY_UPDATED") {
            // Update lobby in list
            setLobbies((prev) =>
              prev.map((l) =>
                l.lobbyId === message.payload.lobbyId
                  ? {
                      ...l,
                      currentPlayers: message.payload.currentPlayers,
                      gameStarted: message.payload.gameStarted,
                    }
                  : l,
              ),
            );
          }
        });
      } catch (err) {
        console.error("[LobbyBrowser] Failed to setup WebSocket:", err);
      }
    };

    setupConnection();

    return () => {
      isCleanedUp = true;
      unsubscribe?.();
    };
  }, [client, connect, isConnected]);

  /**
   * Handle create lobby
   */
  const handleCreateLobby = async () => {
    if (!newLobbyName.trim()) return;

    try {
      setCreating(true);
      const response = await createLobby(
        newLobbyName.trim(),
        newLobbyMaxPlayers,
        newLobbyPassword || undefined,
      );

      // Close dialog and notify parent
      setCreateDialogOpen(false);
      setNewLobbyName("");
      setNewLobbyPassword("");
      setNewLobbyMaxPlayers(4);

      // Join the lobby we just created
      onLobbyJoined(response.lobbyId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create lobby",
      );
    } finally {
      setCreating(false);
    }
  };

  /**
   * Handle join lobby
   */
  const handleJoinLobby = async (lobby: LobbyListItem) => {
    if (lobby.hasPassword) {
      // Show password dialog
      setSelectedLobby(lobby);
      setJoinDialogOpen(true);
    } else {
      // Join directly
      await performJoin(lobby.lobbyId);
    }
  };

  /**
   * Perform the actual join
   */
  const performJoin = async (lobbyId: string, password?: string) => {
    try {
      setJoining(true);
      await joinLobby(lobbyId, password);

      // Close dialog and notify parent
      setJoinDialogOpen(false);
      setJoinPassword("");
      setSelectedLobby(null);

      onLobbyJoined(lobbyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join lobby");
    } finally {
      setJoining(false);
    }
  };

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
        p: 3,
      }}
    >
      {/* Header */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h4">Multiplayer Lobbies</Typography>
            <Typography variant="body2" color="text.secondary">
              Welcome, {playerName}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <IconButton onClick={loadLobbies} disabled={loading}>
              <RefreshIcon />
            </IconButton>
            <Button
              variant="contained"
              color="primary"
              onClick={() => setCreateDialogOpen(true)}
            >
              Create Lobby
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Error display */}
      {error && (
        <Paper sx={{ p: 2, mb: 2, bgcolor: "error.dark" }}>
          <Typography color="error.contrastText">{error}</Typography>
        </Paper>
      )}

      {/* Loading state */}
      {loading && lobbies.length === 0 ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CircularProgress />
        </Box>
      ) : (
        /* Lobby list */
        <Box sx={{ flex: 1, overflow: "auto" }}>
          {lobbies.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: "center" }}>
              <Typography variant="h6" color="text.secondary">
                No lobbies available
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Create one to get started!
              </Typography>
            </Paper>
          ) : (
            <Stack spacing={2}>
              {lobbies.map((lobby) => (
                <Card key={lobby.lobbyId}>
                  <CardContent>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Box sx={{ flex: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography variant="h6">{lobby.lobbyName}</Typography>
                          {lobby.hasPassword && (
                            <LockIcon fontSize="small" color="action" />
                          )}
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                          <Chip
                            icon={<PersonIcon />}
                            label={`${lobby.currentPlayers}/${lobby.maxPlayers}`}
                            size="small"
                            color={
                              lobby.currentPlayers >= lobby.maxPlayers
                                ? "error"
                                : "default"
                            }
                          />
                          {lobby.gameStarted && (
                            <Chip
                              label="In Progress"
                              size="small"
                              color="warning"
                            />
                          )}
                        </Stack>
                      </Box>
                      <Button
                        variant="contained"
                        onClick={() => handleJoinLobby(lobby)}
                        disabled={
                          lobby.gameStarted ||
                          lobby.currentPlayers >= lobby.maxPlayers
                        }
                      >
                        Join
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {/* Create Lobby Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => !creating && setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Lobby</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Lobby Name"
              value={newLobbyName}
              onChange={(e) => setNewLobbyName(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Max Players"
              type="number"
              value={newLobbyMaxPlayers}
              onChange={(e) =>
                setNewLobbyMaxPlayers(Math.max(2, parseInt(e.target.value) || 2))
              }
              inputProps={{ min: 2, max: 8 }}
              fullWidth
            />
            <TextField
              label="Password (optional)"
              type="password"
              value={newLobbyPassword}
              onChange={(e) => setNewLobbyPassword(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateLobby}
            variant="contained"
            disabled={!newLobbyName.trim() || creating}
          >
            {creating ? <CircularProgress size={24} /> : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Join Lobby (with password) Dialog */}
      <Dialog
        open={joinDialogOpen}
        onClose={() => !joining && setJoinDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Join {selectedLobby?.lobbyName}</DialogTitle>
        <DialogContent>
          <TextField
            label="Password"
            type="password"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJoinDialogOpen(false)} disabled={joining}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              selectedLobby && performJoin(selectedLobby.lobbyId, joinPassword)
            }
            variant="contained"
            disabled={!joinPassword.trim() || joining}
          >
            {joining ? <CircularProgress size={24} /> : "Join"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
