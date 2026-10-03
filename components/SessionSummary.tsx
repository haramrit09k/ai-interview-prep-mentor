import React from 'react';
import type { AnswerOutcome, ExperienceLevel } from '../types';
import { LEVEL_STYLE, levelForNextRound } from '../utils/practiceDefaults';

export interface AnswerResult {
  outcome: AnswerOutcome;
  before: number;
  after: number;
}

interface SessionSummaryProps {
  skillName: string;
  level: ExperienceLevel;
  total: number;
  results: AnswerResult[]; // in the order the questions were answered
  onBack: () => void;
  onKeepGoing: () => void; // only offered while questions are left
  onPracticeAgain: (level: ExperienceLevel) => void;
}

const Tile: React.FC<{ label: string; value: number; tone: string }> = ({ label, value, tone }) => (
  <div className="bg-background-dark/50 rounded-lg p-3 text-center">
    <dd className={`text-2xl font-mono font-bold ${tone}`}>{value}</dd>
    <dt className="text-xs text-text-muted">{label}</dt>
  </div>
);

const SessionSummary: React.FC<SessionSummaryProps> = ({ skillName, level, total, results, onBack, onKeepGoing, onPracticeAgain }) => {
  const answered = results.length;
  const correct = results.filter(r => r.outcome === 'correct').length;
  const partial = results.filter(r => r.outcome === 'partially_correct').length;
  const missed = answered - correct - partial;
  const startRating = results[0]?.before ?? 0;
  const endRating = results[results.length - 1]?.after ?? startRating;
  const change = endRating - startRating;
  const nextLevel = levelForNextRound(level, endRating);
  const unanswered = total - answered;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      <section aria-labelledby="summary-heading" className="w-full max-w-xl bg-background-medium rounded-xl border border-background-light p-6 sm:p-8 shadow-2xl">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-brand-light">{skillName}</p>
        <h1 id="summary-heading" className="text-2xl font-bold text-text-primary mt-1">
          {unanswered === 0 ? 'Round complete' : 'Session paused'}
        </h1>
        <p className="text-text-secondary mt-1">
          {correct} of {answered} {answered === 1 ? 'answer' : 'answers'} fully right at <span className={`font-mono font-bold ${LEVEL_STYLE[level].text}`}>{LEVEL_STYLE[level].short}</span> level.
        </p>

        <dl className="grid grid-cols-3 gap-3 mt-5">
          <Tile label="Correct" value={correct} tone="text-level-entry" />
          <Tile label="Partly right" value={partial} tone="text-level-mid" />
          <Tile label="Missed" value={missed} tone="text-level-expert" />
        </dl>

        <div className="mt-5 bg-background-dark/50 rounded-lg p-4">
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-text-secondary">{skillName} expertise</span>
            <span className="font-mono font-bold text-text-primary">
              {startRating}% <span aria-hidden="true">→</span><span className="sr-only"> to </span> {endRating}%
              {change !== 0 && <span className={change > 0 ? 'text-level-entry' : 'text-level-expert'}> ({change > 0 ? '+' : ''}{change})</span>}
            </span>
          </div>
          <div className="w-full bg-background-light rounded-full h-2 mt-2">
            <div className="bg-gradient-to-r from-brand-secondary to-brand-light h-2 rounded-full" style={{ width: `${endRating}%` }} />
          </div>
          {nextLevel !== level && (
            <p className="text-sm text-level-mid mt-3">
              {level} questions have taken this skill as far as they can. The next round moves up to {nextLevel}.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          {unanswered > 0 && (
            <button onClick={onKeepGoing} className="flex-1 py-3 px-5 rounded-lg bg-brand-primary text-white font-bold hover:bg-brand-hover transition-colors">
              Keep going ({unanswered} left)
            </button>
          )}
          <button
            onClick={() => onPracticeAgain(nextLevel)}
            className={`flex-1 py-3 px-5 rounded-lg font-bold transition-colors ${unanswered > 0 ? 'bg-background-light text-text-primary hover:bg-gray-600' : 'bg-brand-primary text-white hover:bg-brand-hover'}`}
          >
            New round at {LEVEL_STYLE[nextLevel].short}
          </button>
          <button onClick={onBack} className="py-3 px-5 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 transition-colors">
            Back to skills
          </button>
        </div>
      </section>
    </div>
  );
};

export default SessionSummary;
