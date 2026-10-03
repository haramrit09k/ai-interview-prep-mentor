import type { AnswerOutcome, ExperienceLevel, Skill, SkillHistoryEntry } from '../types';
import { updateRating } from './rating.ts'; // the .ts lets the unit tests load this file directly in Node

const OUTCOMES: AnswerOutcome[] = ['correct', 'partially_correct', 'incorrect', 'idk'];
const LEVELS: ExperienceLevel[] = ['Entry-level', 'Mid-level', 'Expert'];

/**
 * Rebuilds skills from the answers the server has on record, for a browser that has none (a new device,
 * or cleared site data). Each skill keeps its original id, so its Review sheet and progress reconnect.
 * The rating is worked out by replaying every answer with the same rules the app uses while you practise,
 * so it is a close estimate and not a saved number.
 *
 * Skills that are already there (same id, or the same name) are left alone, and at most `limit` are returned,
 * most recently practised first.
 */
export const skillsFromHistory = (history: SkillHistoryEntry[], existing: Skill[], limit: number): Skill[] => {
  const taken = new Set(existing.map((s) => s.name.trim().toLowerCase()));
  const ids = new Set(existing.map((s) => s.id));
  const restored: Skill[] = [];

  for (const entry of history) {
    if (restored.length + existing.length >= limit) break;
    if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string') continue;
    const name = entry.name.trim().slice(0, 60);
    if (!name || ids.has(entry.id) || taken.has(name.toLowerCase())) continue;

    let rating = 0;
    for (const [outcome, level] of Array.isArray(entry.answers) ? entry.answers : []) {
      if (!OUTCOMES.includes(outcome)) continue;
      rating = updateRating(rating, outcome, LEVELS.includes(level as ExperienceLevel) ? level : null);
    }
    restored.push({ id: entry.id, name, rating });
    ids.add(entry.id);
    taken.add(name.toLowerCase());
  }
  return restored;
};
