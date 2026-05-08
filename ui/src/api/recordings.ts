import { api } from "./client.ts";
import type { GameRecording } from "@dangerous-inclinations/engine";

export interface RecordingSummary {
  recordingId: string;
  createdAt: string;
  source: "sim" | "live";
  turnCount: number;
  winnerId?: string;
  label?: string;
  file: string;
}

export async function listRecordings(): Promise<RecordingSummary[]> {
  const result = await api.get<{ recordings: RecordingSummary[] }>(
    "/api/recordings"
  );
  return result.recordings ?? [];
}

export async function fetchRecording(id: string): Promise<GameRecording> {
  return api.get<GameRecording>(`/api/recordings/${id}`);
}
