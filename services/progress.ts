import type { Insights, SkillHistoryEntry, SkillReview } from '../types';
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

export const fetchReview = async (skillId: string): Promise<SkillReview> => {
  const response = await fetch(`/api/review/${encodeURIComponent(skillId)}`, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not load your review'));
  }
  return (await response.json()) as SkillReview;
};

/** Every skill the user has practised, with the outcome and level of each answer. Used to rebuild the skills list. */
export const fetchSkillHistory = async (): Promise<SkillHistoryEntry[]> => {
  const response = await fetch('/api/skills/history', { headers: authHeaders() });
  if (!response.ok) throw new Error(await readErrorMessage(response, 'Could not load your skills'));
  const data = (await response.json()) as { skills?: SkillHistoryEntry[] };
  return Array.isArray(data.skills) ? data.skills : [];
};

/** Removes a skill's recorded history on the server, so the skill is not brought back later. */
export const deleteSkillHistory = async (skillId: string): Promise<void> => {
  const response = await fetch(`/api/skills/${encodeURIComponent(skillId)}`, { method: 'DELETE', headers: authHeaders() });
  if (!response.ok) throw new Error(await readErrorMessage(response, 'Could not delete the skill history'));
};
