import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Slider,
  Stack,
  Typography,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import FastRewindIcon from "@mui/icons-material/FastRewind";
import FastForwardIcon from "@mui/icons-material/FastForward";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import type { GameRecording } from "@dangerous-inclinations/engine";
import { fetchRecording } from "../api/recordings.ts";
import { ReplayProvider, useReplay } from "../context/ReplayContext.tsx";
import { ReplayGameContextBridge } from "../context/ReplayGameContextBridge.tsx";
import { GameBoard } from "./GameBoard.tsx";

interface ReplayScreenProps {
  recordingId: string;
  onExit: () => void;
}

/**
 * Top-level replay page. Loads a recording from the server, then mounts the
 * ReplayProvider + GameContext bridge so the existing GameBoard can render.
 */
export function ReplayScreen({ recordingId, onExit }: ReplayScreenProps) {
  const [recording, setRecording] = useState<GameRecording | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRecording(recordingId)
      .then((r) => {
        if (!cancelled) setRecording(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [recordingId]);

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">Failed to load recording: {error}</Typography>
        <Button onClick={onExit} sx={{ mt: 2 }}>Back</Button>
      </Box>
    );
  }

  if (!recording) {
    return (
      <Box sx={{ p: 4, display: "flex", alignItems: "center", gap: 2 }}>
        <CircularProgress size={24} />
        <Typography>Loading recording {recordingId}…</Typography>
      </Box>
    );
  }

  return (
    <ReplayProvider recording={recording}>
      <ReplayGameContextBridge>
        <ReplayLayout onExit={onExit} />
      </ReplayGameContextBridge>
    </ReplayProvider>
  );
}

function ReplayLayout({ onExit }: { onExit: () => void }) {
  const { recording, turnIndex, turnCount } = useReplay();

  const currentTurn = turnIndex >= 0 ? recording.turns[turnIndex] : null;
  const winner = recording.metadata.winnerId
    ? recording.finalState?.players.find((p) => p.id === recording.metadata.winnerId)?.name
    : undefined;

  return (
    <Box sx={{ display: "flex", height: "100vh", flexDirection: "column" }}>
      {/* Header */}
      <Paper square sx={{ p: 1, display: "flex", alignItems: "center", gap: 2 }}>
        <Button onClick={onExit} variant="outlined" size="small">
          ← Back
        </Button>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Replay: {recording.metadata.label ?? recording.recordingId}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {recording.metadata.source} · {turnCount} turns
          {winner ? ` · winner: ${winner}` : ""}
        </Typography>
      </Paper>

      {/* Body: board on left, turn log on right */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Box sx={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <GameBoard />
        </Box>
        <ReplayTurnLog />
      </Box>

      {/* Footer: scrubber + transport */}
      <ReplayTransport currentTurn={currentTurn} />
    </Box>
  );
}

function ReplayTransport({
  currentTurn,
}: {
  currentTurn: ReturnType<typeof useReplay>["recording"]["turns"][number] | null;
}) {
  const { turnIndex, turnCount, setTurnIndex, step, togglePlay, playing, speed, setSpeed } =
    useReplay();

  return (
    <Paper square sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <IconButton onClick={() => setTurnIndex(-1)} title="Jump to start">
          <FastRewindIcon />
        </IconButton>
        <IconButton onClick={() => step(-1)} title="Previous turn">
          <SkipPreviousIcon />
        </IconButton>
        <IconButton onClick={togglePlay} color="primary" title={playing ? "Pause" : "Play"}>
          {playing ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
        <IconButton onClick={() => step(1)} title="Next turn">
          <SkipNextIcon />
        </IconButton>
        <IconButton onClick={() => setTurnIndex(turnCount - 1)} title="Jump to end">
          <FastForwardIcon />
        </IconButton>

        <Box sx={{ minWidth: 110 }}>
          <Typography variant="caption" color="text.secondary">
            {turnIndex < 0
              ? "Initial state"
              : `Turn ${currentTurn?.turnNumber ?? turnIndex + 1} (${currentTurn?.playerId ?? ""})`}
          </Typography>
        </Box>

        <Slider
          value={turnIndex}
          min={-1}
          max={turnCount - 1}
          step={1}
          onChange={(_, v) => setTurnIndex(v as number)}
          sx={{ flex: 1 }}
          marks={turnCount <= 40}
        />

        <Box sx={{ minWidth: 90 }}>
          <Typography variant="caption" color="text.secondary">
            Speed
          </Typography>
          <Slider
            value={speed}
            min={120}
            max={2000}
            step={60}
            onChange={(_, v) => setSpeed(v as number)}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${v}ms`}
          />
        </Box>
      </Stack>
    </Paper>
  );
}

function ReplayTurnLog() {
  const { recording, turnIndex } = useReplay();

  return (
    <Paper
      square
      sx={{
        width: 360,
        borderLeft: 1,
        borderColor: "divider",
        overflow: "auto",
        p: 2,
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Turn log
      </Typography>
      <Stack spacing={0.5}>
        {recording.turns.slice(0, Math.max(0, turnIndex + 1)).map((t, i) => (
          <Box
            key={`${t.turnNumber}-${i}`}
            sx={{
              p: 1,
              borderRadius: 1,
              bgcolor: i === turnIndex ? "action.selected" : "transparent",
              fontSize: 12,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              T{t.turnNumber} · {t.playerId}
            </Typography>
            {t.logEntries.map((e, ei) => (
              <Box key={ei} sx={{ ml: 1, color: "text.primary" }}>
                <strong>{e.action}:</strong> {e.result}
              </Box>
            ))}
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
