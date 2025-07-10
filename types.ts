
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
