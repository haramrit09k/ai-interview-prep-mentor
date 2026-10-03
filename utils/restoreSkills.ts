import type { AnswerOutcome, ExperienceLevel, Question, Skill, SkillHistoryEntry } from '../types';
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

const MAX_CARRIED_QUESTIONS = 200;

/**
 * The skills (and the custom questions written for them) a guest built up before signing in, ready to be
 * added to their account. Anything that is already in the account, by id or by name, is left alone, no more
 * than `limit` skills end up in total, and anything that does not look like a skill or a question is dropped.
 * The ratings come across as they are, since they were earned in this same browser.
 */
export const skillsFromGuest = (
  guestSkills: unknown,
  guestQuestions: unknown,
  existing: Skill[],
  limit: number,
): { skills: Skill[]; questions: Question[] } => {
  const taken = new Set(existing.map((s) => s.name.trim().toLowerCase()));
  const ids = new Set(existing.map((s) => s.id));
  const skills: Skill[] = [];

  for (const item of Array.isArray(guestSkills) ? guestSkills : []) {
    if (skills.length + existing.length >= limit) break;
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') continue;
    const name = item.name.trim().slice(0, 60);
    if (!name || ids.has(item.id) || taken.has(name.toLowerCase())) continue;
    const rating = typeof item.rating === 'number' && Number.isFinite(item.rating) ? Math.max(0, Math.min(100, Math.round(item.rating))) : 0;
    skills.push({ id: item.id, name, rating });
    ids.add(item.id);
    taken.add(name.toLowerCase());
  }

  const kept = new Set(skills.map((s) => s.id));
  const questions: Question[] = [];
  for (const q of Array.isArray(guestQuestions) ? guestQuestions : []) {
    if (questions.length >= MAX_CARRIED_QUESTIONS) break;
    if (!q || typeof q.id !== 'string' || typeof q.text !== 'string' || !kept.has(q.skillId)) continue;
    questions.push({
      id: q.id,
      skillId: q.skillId,
      text: q.text.slice(0, 1000),
      answer: typeof q.answer === 'string' ? q.answer.slice(0, 5000) : undefined,
      source: 'custom',
    });
  }
  return { skills, questions };
};
