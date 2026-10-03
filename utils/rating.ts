// How a skill's expertise rating (0 to 100) moves after an answer.
//
// A flat +10 for every correct answer made the rating climb just as fast on easy questions as on hard ones,
// so a user could reach 100% on a skill by only answering Entry-level questions. Two rules fix that:
//   1. The level scales the change. Easy questions earn less and cost more when missed, hard ones the reverse.
//   2. Each level has a ceiling. Entry-level answers can take the rating to 40, Mid-level to 75, and only
//      Expert-level answers can take it all the way to 100.
// Questions with no recorded level (custom questions) are treated as Mid-level.

type Outcome = 'correct' | 'partially_correct' | 'incorrect' | 'idk';
type Level = 'Entry-level' | 'Mid-level' | 'Expert';

const BASE_CHANGE: Record<Outcome, number> = {
  correct: 10,
  partially_correct: 5,
  incorrect: -5,
  idk: -5,
};

// Gains are multiplied by the first number, losses by the second.
const LEVEL_WEIGHT: Record<Level, { gain: number; loss: number }> = {
  'Entry-level': { gain: 0.5, loss: 1.5 },
  'Mid-level': { gain: 1, loss: 1 },
  'Expert': { gain: 1.5, loss: 0.5 },
};

export const RATING_CEILING: Record<Level, number> = {
  'Entry-level': 40,
  'Mid-level': 75,
  'Expert': 100,
};

const levelOrMid = (level?: string | null): Level =>
  level === 'Entry-level' || level === 'Mid-level' || level === 'Expert' ? level : 'Mid-level';

/** The change an answer is worth before the ceiling is applied. Whole numbers, rounded away from zero on .5. */
export const ratingChange = (outcome: Outcome, level?: string | null): number => {
  const base = BASE_CHANGE[outcome] ?? 0;
  const weights = LEVEL_WEIGHT[levelOrMid(level)];
  const scaled = Math.abs(base) * (base >= 0 ? weights.gain : weights.loss);
  return Math.sign(base) * Math.round(scaled);
};

/** The new rating after an answer. Never below 0 or above 100, and a gain never takes it past the level's ceiling. */
export const updateRating = (current: number, outcome: Outcome, level?: string | null): number => {
  const change = ratingChange(outcome, level);
  if (change >= 0) {
    const ceiling = RATING_CEILING[levelOrMid(level)];
    // Already at or above this level's ceiling: easier questions cannot push it higher (and never pull it down).
    return Math.max(current, Math.min(current + change, ceiling));
  }
  return Math.max(0, current + change);
};

/** True when answering at this level can no longer raise the rating. Used to nudge the user to a harder level. */
export const isAtCeiling = (current: number, level?: string | null): boolean => current >= RATING_CEILING[levelOrMid(level)];
