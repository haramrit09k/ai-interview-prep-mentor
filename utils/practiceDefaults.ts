import type { ExperienceLevel } from '../types';
import { RATING_CEILING, isAtCeiling } from './rating';

export const DEFAULT_QUESTION_COUNT = 5;

// Chip colours follow the green, amber and red people know from problem difficulty tags.
export const LEVEL_STYLE: Record<ExperienceLevel, { short: string; text: string; border: string; blurb: string }> = {
  'Entry-level': { short: 'Entry', text: 'text-level-entry', border: 'border-level-entry', blurb: 'Fundamentals and syntax' },
  'Mid-level': { short: 'Mid', text: 'text-level-mid', border: 'border-level-mid', blurb: 'Trade-offs and common pitfalls' },
  'Expert': { short: 'Expert', text: 'text-level-expert', border: 'border-level-expert', blurb: 'Depth, edge cases and design' },
};

/**
 * The level to start at. Mid-level is what most interviews ask, so it is the default until Mid-level
 * questions can no longer raise the rating. After that, Expert is the only level that still moves it.
 */
export const recommendedLevel = (rating: number): ExperienceLevel =>
  rating >= RATING_CEILING['Mid-level'] ? 'Expert' : 'Mid-level';

/** How many questions a one tap start asks for, never more than the user has left. */
export const defaultQuestionCount = (isAuthenticated: boolean, questionsRemaining: number): number =>
  isAuthenticated ? Math.max(0, Math.min(DEFAULT_QUESTION_COUNT, questionsRemaining)) : DEFAULT_QUESTION_COUNT;

const LEVEL_ORDER: ExperienceLevel[] = ['Entry-level', 'Mid-level', 'Expert'];

/** The level to offer for another round: the same one, unless it can no longer raise the rating. */
export const levelForNextRound = (level: ExperienceLevel, rating: number): ExperienceLevel => {
  const index = LEVEL_ORDER.indexOf(level);
  return isAtCeiling(rating, level) && index < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[index + 1] : level;
};
