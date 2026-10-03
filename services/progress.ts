import type { Insights } from '../types';
import { readErrorMessage } from './gemini';

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('google_id_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchInsights = async (): Promise<Insights> => {
  // getTimezoneOffset() is minutes behind UTC, which is what the server expects for day boundaries.
  const response = await fetch(`/api/insights?tzOffset=${new Date().getTimezoneOffset()}`, { headers: authHeaders() });
  if (!response.ok) {
    const error = new Error(await readErrorMessage(response, 'Could not load your progress')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return (await response.json()) as Insights;
};

export const deleteInsights = async (): Promise<void> => {
  const response = await fetch('/api/insights', { method: 'DELETE', headers: authHeaders() });
  if (!response.ok) throw new Error(await readErrorMessage(response, 'Could not delete your progress data'));
};
