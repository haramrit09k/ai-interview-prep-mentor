import React, { useCallback, useEffect, useState } from 'react';
import Modal from './Modal';
import MarkdownRenderer from './MarkdownRenderer';
import { SpinnerIcon } from './Icons';
import { fetchReview } from '../services/progress';
import type { ReviewQuestion, Skill, SkillReview, Trend } from '../types';

interface ReviewModalProps {
  skill: Skill;
  isAuthenticated: boolean;
  onClose: () => void;
  /** Starts a practice session made of these questions. */
  onPractice: (questions: ReviewQuestion[]) => void;
}

const SESSION_SIZE = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const OUTCOME_LABEL: Record<ReviewQuestion['outcome'], string> = {
  incorrect: 'Missed',
  idk: 'Skipped',
  partially_correct: 'Partly right',
};

const TREND_TEXT: Record<Trend, string> = {
  up: '↑ Improving',
  down: '↓ Slipping',
  steady: '→ Holding steady',
  new: 'Just getting started',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "today", "yesterday", "3 days ago", "2 weeks ago" */
export const timeAgo = (iso: string, now: number = Date.now()): string => {
  const days = Math.floor((now - Date.parse(iso)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
};

/** One plain sentence with the headline, so nobody has to read the whole sheet to get the gist. */
export const summarizeReview = (review: SkillReview, skillName: string): string => {
  if (!review.hasData || !review.skill) return `You have not answered any ${skillName} questions yet.`;
  const { skill, counts } = review;
  let sentence = `You have answered ${plural(counts.answers, 'question')} in ${skillName} with ${skill.accuracy}% accuracy, and last practised ${timeAgo(skill.lastPracticed)}.`;
  if (review.totalToRetry > 0) {
    sentence += ` ${plural(review.totalToRetry, 'question')} would benefit from another try.`;
  } else {
    sentence += ' Nothing is waiting for a retry. Nice.';
  }
  return sentence;
};

const ReviewModal: React.FC<ReviewModalProps> = ({ skill, isAuthenticated, onClose, onPractice }) => {
  const [review, setReview] = useState<SkillReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setReview(null);
    try {
      setReview(await fetchReview(skill.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your review.');
    }
  }, [skill.id]);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated, load]);

  const title = `Review: ${skill.name}`;

  if (!isAuthenticated) {
    return (
      <Modal title={title} onClose={onClose} maxWidth="max-w-xl">
        <p className="text-text-primary">Sign in to get a study sheet for {skill.name}.</p>
        <p className="text-text-secondary mt-2">
          Once you are signed in, every answer you give is remembered. Your study sheet then shows the concepts you keep missing,
          the questions worth another try, and how your accuracy is trending.
        </p>
      </Modal>
    );
  }

  const renderBody = () => {
    if (error) {
      return (
        <div role="alert" className="space-y-3">
          <p className="text-red-200 bg-red-900/40 border border-red-500/50 rounded-lg p-3">{error}</p>
          <button onClick={load} className="py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-white">Try again</button>
        </div>
      );
    }
    if (!review) {
      return (
        <div role="status" className="flex flex-col items-center justify-center min-h-[200px] text-text-secondary">
          <SpinnerIcon className="w-10 h-10 border-4 border-brand-primary" />
          <p className="mt-4">Loading your study sheet...</p>
        </div>
      );
    }

    const earlier = review.previousSummary ? (
      <details className="bg-background-dark/50 rounded-lg p-3">
        <summary className="cursor-pointer font-semibold text-text-primary focus-visible:ring-2 focus-visible:ring-brand-light rounded">
          Earlier summary{review.previousSummary.lastUpdated ? ` from ${new Date(review.previousSummary.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <h4 className="font-semibold text-brand-light">Concepts you knew</h4>
            <MarkdownRenderer content={review.previousSummary.conceptsKnown} />
          </div>
          <div>
            <h4 className="font-semibold text-yellow-400">Concepts to review</h4>
            <MarkdownRenderer content={review.previousSummary.conceptsToReview} />
          </div>
        </div>
      </details>
    ) : null;

    if (!review.hasData || !review.skill) {
      return (
        <div className="space-y-6">
          <p className="text-lg text-text-primary">{summarizeReview(review, skill.name)}</p>
          <p className="text-text-secondary">Answer a few questions and your study sheet will appear here, with the questions to retry and the concepts to focus on.</p>
          {earlier}
        </div>
      );
    }

    const startSize = Math.min(review.retry.length, SESSION_SIZE);

    return (
      <div className="space-y-8">
        <p className="text-lg text-text-primary">{summarizeReview(review, skill.name)}</p>

        <section aria-labelledby="review-retry-heading">
          <h3 id="review-retry-heading" className="text-lg font-bold text-text-primary mb-1">Questions to retry</h3>
          {review.retry.length === 0 ? (
            <p className="text-text-secondary">You have answered everything you have attempted well. Practise again to find new gaps.</p>
          ) : (
            <>
              <p className="text-sm text-text-muted mb-3">
                Questions whose latest answer was not fully right. The ones you saw longest ago come first within each group.
                {review.totalToRetry > review.retry.length ? ` Showing ${review.retry.length} of ${review.totalToRetry}.` : ''}
              </p>
              <ul className="space-y-2 mb-4">
                {review.retry.map((q) => (
                  <li key={q.text} className="bg-background-dark/50 rounded-lg p-3">
                    <p className="text-text-primary">{q.text}</p>
                    <p className="text-sm text-text-secondary mt-1">
                      {OUTCOME_LABEL[q.outcome]} · last tried {timeAgo(q.lastAnswered)}
                      {q.timesMissed > 1 ? ` · missed ${plural(q.timesMissed, 'time')}` : ''}
                      {q.level ? ` · ${q.level}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => onPractice(review.retry.slice(0, SESSION_SIZE))}
                  className="py-2.5 px-5 rounded-lg bg-brand-primary text-white font-bold hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-white transition-colors"
                >
                  Practise {startSize === 1 ? '1 missed question' : `${startSize} missed questions`}
                </button>
                {review.retry.length > SESSION_SIZE && (
                  <button
                    onClick={() => onPractice(review.retry)}
                    className="py-2.5 px-5 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 focus-visible:ring-2 focus-visible:ring-brand-light transition-colors"
                  >
                    Practise all {review.retry.length}
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        <div className="grid md:grid-cols-2 gap-6">
          <section aria-labelledby="review-gaps-heading">
            <h3 id="review-gaps-heading" className="text-lg font-bold text-yellow-400 mb-2">Worth revisiting</h3>
            {review.gaps.length === 0 ? (
              <p className="text-text-secondary">No open gaps. Nice.</p>
            ) : (
              <ul className="space-y-2">
                {review.gaps.map((g) => (
                  <li key={g.concept} className="bg-background-dark/50 rounded-lg p-3">
                    <p className="font-semibold text-text-primary">{g.concept}</p>
                    <p className="text-sm text-text-secondary">Missed {plural(g.timesMissed, 'time')} · last seen {timeAgo(g.lastSeen)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="review-mastered-heading">
            <h3 id="review-mastered-heading" className="text-lg font-bold text-green-400 mb-2">Recently mastered</h3>
            {review.mastered.length === 0 ? (
              <p className="text-text-secondary">Concepts you used to miss and now get right will show up here.</p>
            ) : (
              <ul className="space-y-2">
                {review.mastered.map((m) => (
                  <li key={m.concept} className="bg-background-dark/50 rounded-lg p-3">
                    <p className="font-semibold text-text-primary">{m.concept}</p>
                    <p className="text-sm text-text-secondary">Missed {plural(m.previouslyMissed, 'time')} before, got it {timeAgo(m.masteredAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-labelledby="review-context-heading">
          <h3 id="review-context-heading" className="text-lg font-bold text-text-primary mb-2">How it is going</h3>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-background-dark/50 rounded-lg p-3">
              <dt className="text-sm text-text-muted">Accuracy</dt>
              <dd className="text-2xl font-bold text-text-primary">{review.skill.accuracy}%</dd>
              <dd className="text-xs sm:text-sm text-text-secondary">{TREND_TEXT[review.skill.trend]}</dd>
            </div>
            <div className="bg-background-dark/50 rounded-lg p-3">
              <dt className="text-sm text-text-muted">Answers</dt>
              <dd className="text-2xl font-bold text-text-primary">{review.counts.answers}</dd>
              <dd className="text-xs sm:text-sm text-text-secondary">{review.counts.correct} correct · {review.counts.partial} partly · {review.counts.missed} missed</dd>
            </div>
            <div className="bg-background-dark/50 rounded-lg p-3">
              <dt className="text-sm text-text-muted">Last practised</dt>
              <dd className="text-2xl font-bold text-text-primary capitalize">{timeAgo(review.skill.lastPracticed)}</dd>
            </div>
            <div className="bg-background-dark/50 rounded-lg p-3">
              <dt className="text-sm text-text-muted">Started</dt>
              <dd className="text-2xl font-bold text-text-primary capitalize">{timeAgo(review.skill.firstPracticed)}</dd>
            </div>
          </dl>
        </section>

        {earlier}
      </div>
    );
  };

  return (
    <Modal title={title} onClose={onClose} maxWidth="max-w-3xl">
      {renderBody()}
    </Modal>
  );
};

export default ReviewModal;
