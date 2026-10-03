
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
