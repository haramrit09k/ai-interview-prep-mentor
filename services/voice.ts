import type { DeliveryStats } from '../types';
import { readErrorMessage } from './gemini';

export interface Transcription {
  transcript: string;
  delivery: DeliveryStats;
}

export const transcribeRecording = async (blob: Blob, durationMs: number, mimeType: string): Promise<Transcription> => {
  const token = localStorage.getItem('google_id_token');
  const response = await fetch('/api/transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      'X-Audio-Duration-Ms': String(durationMs),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not transcribe your answer'));
  }
  return (await response.json()) as Transcription;
};
