import logger from '../src/logger';
import type { DeliveryStats, EvaluationResponse } from '../types';

/** Extra context that lets the server record the answer for progress insights. */
export interface EvaluationMeta {
  skillId?: string;
  skillName?: string;
  isIdk?: boolean;
  delivery?: DeliveryStats | null;
}

// All Gemini calls happen on the server (see server/geminiService.js).
// The API key must never be bundled into client code.

/** Resolves with the evaluation, or throws if the backend could not produce one. */
export const evaluateAnswer = async (questionText: string, userAnswer: string, meta: EvaluationMeta = {}): Promise<EvaluationResponse> => {
  logger.debug('Sending evaluation request to backend for question:', questionText);

  // The backend accepts guests too, so the token is optional.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('google_id_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('/api/evaluate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ questionText, userAnswer, ...meta }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to evaluate answer'));
  }

  return (await response.json()) as EvaluationResponse;
};

/**
 * Extracts a human-readable error from a failed response without assuming the
 * body is JSON (proxies and platform error pages are often HTML or plain text).
 */
export const readErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  const text = await response.text().catch(() => '');
  try {
    const data = JSON.parse(text);
    return data.error || data.message || fallback;
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
};
