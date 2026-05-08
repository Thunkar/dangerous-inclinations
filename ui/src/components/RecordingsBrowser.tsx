import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import { listRecordings, type RecordingSummary } from "../api/recordings.ts";

interface Props {
  onOpen: (recordingId: string) => void;
  onExit: () => void;
}

/**
 * Lists archived recordings from the server. Clicking one navigates to the
 * replay screen. Use this as a landing for "watch a past game".
 */
export function RecordingsBrowser({ onOpen, onExit }: Props) {
  const [items, setItems] = useState<RecordingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRecordings()
      .then((r) => {
        if (!cancelled) setItems(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box sx={{ p: 4, maxWidth: 800, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <Button onClick={onExit} variant="outlined" sx={{ mr: 2 }}>
          ← Back
        </Button>
        <Typography variant="h5">Recordings</Typography>
      </Box>

      {error && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography color="error">{error}</Typography>
        </Paper>
      )}

      {!items && !error && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <CircularProgress size={20} />
          <Typography>Loading recordings…</Typography>
        </Box>
      )}

      {items && items.length === 0 && (
        <Typography color="text.secondary">
          No recordings yet. Play a game to completion or run the sim CLI to generate some.
        </Typography>
      )}

      {items && items.length > 0 && (
        <Paper>
          <List>
            {items.map((r) => (
              <ListItem key={r.recordingId} disablePadding>
                <ListItemButton onClick={() => onOpen(r.recordingId)}>
                  <ListItemText
                    primary={r.label ?? r.recordingId}
                    secondary={
                      <>
                        {r.source} · {r.turnCount} turns
                        {r.winnerId ? ` · winner: ${r.winnerId}` : ""}
                        {" · "}
                        {new Date(r.createdAt).toLocaleString()}
                      </>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}
