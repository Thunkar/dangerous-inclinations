import { api } from './client.ts'
import type {
  GameRecording,
  RecordingSummary,
  RecordingsResponse,
} from '@dangerous-inclinations/engine'

export async function listRecordings(): Promise<RecordingSummary[]> {
  const result = await api.get<RecordingsResponse>('/api/recordings')
  return result.recordings ?? []
}

export async function fetchRecording(id: string): Promise<GameRecording> {
  return api.get<GameRecording>(`/api/recordings/${id}`)
}
