import logger from '../src/logger';

// All Gemini calls happen on the server (see server/geminiService.js).
// The API key must never be bundled into client code.

export type EvaluationResponse = {
  mentorAnswer: string;
  feedback: string;
  classification: 'correct' | 'partially_correct' | 'incorrect';
  conceptsKnown: string[];
  conceptsToReview: string[];
};

const errorResult = (): EvaluationResponse => ({
  mentorAnswer: "Sorry, I encountered an error while generating an answer. Please try again.",
  feedback: "Could not evaluate your answer due to an error.",
  classification: 'incorrect',
  conceptsKnown: [],
  conceptsToReview: [],
});

export const evaluateAnswer = async (questionText: string, userAnswer: string): Promise<EvaluationResponse> => {
  logger.debug('Sending evaluation request to backend for question:', questionText);
  try {
    // The backend accepts guests too, so the token is optional.
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('google_id_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ questionText, userAnswer }),
    });

    if (!response.ok) {
      const message = await readErrorMessage(response, 'Failed to evaluate answer');
      throw new Error(message);
    }

    return (await response.json()) as EvaluationResponse;
  } catch (error) {
    logger.error("Error evaluating answer:", error);
    return errorResult();
  }
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
