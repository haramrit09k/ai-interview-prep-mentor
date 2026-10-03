
export type EvaluationClassification = 'correct' | 'partially_correct' | 'incorrect';
export type AnswerOutcome = EvaluationClassification | 'idk';

export type ExperienceLevel = 'Entry-level' | 'Mid-level' | 'Expert';

export interface UserProfile {
  id: string; // The user's unique Google ID (from 'sub' in the JWT)
  name: string;
  email: string;
  picture: string;
}

export interface EvaluationResponse {
  mentorAnswer: string;
  feedback: string;
  classification: EvaluationClassification;
  conceptsKnown?: string[]; // New: Concepts the user demonstrated understanding of
  conceptsToReview?: string[]; // New: Concepts the user missed or needs to improve on
}

export interface Skill {
  id: string;
  name: string;
  rating: number; // Rating from 0 to 100
}

export interface Question {
  id:string;
  skillId: string;
  text: string;
  answer?: string; // Only for custom questions
  source: 'custom' | 'gemini';
  level?: ExperienceLevel; // Set for generated questions, unknown for custom ones
}


export interface AnswerHistory {
  skillId: string;
  questionText: string;
  outcome: AnswerOutcome;
  conceptsKnown?: string[]; // New: Concepts the user demonstrated understanding of
  conceptsToReview?: string[]; // New: Concepts the user missed or needs to improve on
}

export interface Usage {
  questionsAnswered: number;
  lastResetDate: string; // ISO date string
}

export interface AuthQuota {
  questionsUsed: number;
  lastResetDate: string; // YYYY-MM-DD format
}

/** Delivery coaching for a spoken answer. Computed on the server from the transcript. */
export interface DeliveryStats {
  durationSec: number;
  wordCount: number;
  wpm: number | null; // null when the answer was too short to judge
  paceLabel: 'slow' | 'relaxed' | 'steady' | 'brisk' | 'fast' | null;
  paceText: string | null;
  fillerTotal: number;
  fillerPer100: number;
  fillers: { word: string; count: number }[];
  tips: string[];
}

export type Trend = 'up' | 'down' | 'steady' | 'new';

export interface Insights {
  totals: {
    answers: number;
    activeDays: number;
    currentStreak: number;
    longestStreak: number;
    practicedToday: boolean;
    last7Days: { answers: number; accuracy: number | null };
    previous7Days: { answers: number; accuracy: number | null };
    accuracyChange: number | null;
  };
  skills: { skillId: string; name: string; attempts: number; accuracy: number | null; trend: Trend; lastPracticed: string }[];
  gaps: { concept: string; timesMissed: number; skill: string; lastSeen: string }[];
  mastered: { concept: string; skill: string; masteredAt: string; previouslyMissed: number }[];
  delivery: {
    spokenAnswers: number;
    avgWpm?: number | null;
    inTypicalRange?: boolean | null;
    avgFillersPer100?: number;
    fillerTrend?: 'improving' | 'worsening' | 'steady' | 'new';
    recent?: { at: string; wpm: number | null; fillersPer100: number }[];
  };
  nextStep: { type: string; title: string; detail: string };
}

/** A question worth another try, taken from the user's recorded answers. */
export interface ReviewQuestion {
  text: string;
  outcome: 'incorrect' | 'idk' | 'partially_correct';
  level: ExperienceLevel | null; // null when the level was not recorded
  timesMissed: number;
  lastAnswered: string;
}

/** The per-skill study sheet returned by /api/review/:skillId. */
export interface SkillReview {
  hasData: boolean;
  skill: { skillId: string; name: string; attempts: number; accuracy: number | null; trend: Trend; lastPracticed: string; firstPracticed: string } | null;
  counts: { answers: number; correct: number; partial: number; missed: number };
  gaps: { concept: string; timesMissed: number; skill: string; lastSeen: string }[];
  mastered: { concept: string; skill: string; masteredAt: string; previouslyMissed: number }[];
  retry: ReviewQuestion[];
  totalToRetry: number;
  /** A summary written by the old AI-based review, kept so nothing is lost. */
  previousSummary: { conceptsKnown: string; conceptsToReview: string; lastUpdated?: string } | null;
}

/** What one answer did to a skill's expertise rating. Shown right after the feedback. */
export interface RatingResult {
  before: number;
  after: number;
}
