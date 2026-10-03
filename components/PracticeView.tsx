
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Question, AnswerOutcome, DeliveryStats, ExperienceLevel, RatingResult } from '../types';
import { evaluateAnswer, readErrorMessage, GuestLimitError } from '../services/gemini';
import { ChevronLeftIcon, ChevronRightIcon, BrainCircuitIcon, SpinnerIcon } from './Icons';
import MarkdownRenderer from './MarkdownRenderer';
import { LimitReachedModal } from './LimitReachedModal';
import VoiceRecorder from './VoiceRecorder';
import DeliveryCard from './DeliveryCard';
import SessionSummary, { AnswerResult } from './SessionSummary';
import { RATING_CEILING } from '../utils/rating';
import { LEVEL_STYLE } from '../utils/practiceDefaults';

const OUTCOME_LABEL: Record<AnswerOutcome, { text: string; tone: string }> = {
  correct: { text: 'Correct', tone: 'text-level-entry border-level-entry' },
  partially_correct: { text: 'Partly right', tone: 'text-level-mid border-level-mid' },
  incorrect: { text: 'Not quite', tone: 'text-level-expert border-level-expert' },
  idk: { text: 'Skipped', tone: 'text-text-secondary border-gray-600' },
};

interface PracticeSession {
  skill: { id: string; name: string };
  questions: Question[];
  currentQuestionIndex: number;
}
interface PracticeViewProps {
  session: PracticeSession;
  onEndSession: () => void;
  onNavigate: (direction: 'next' | 'prev') => void;
  onQuestionComplete: (args: { question: Question; classification: AnswerOutcome; isRetry?: boolean }) => RatingResult;
  onPracticeAgain: (level: ExperienceLevel) => void;
  questionsRemaining: number; // Receive quota from App.tsx
  isAuthenticated: boolean; // Voice answers and progress tracking need a signed-in user
  signInButton?: React.ReactNode; // Offered to guests whose free practice is used up
}

const PracticeView: React.FC<PracticeViewProps> = ({ session, onEndSession, onNavigate, onQuestionComplete, onPracticeAgain, questionsRemaining, isAuthenticated, signInButton = null }) => {
  const currentQuestion: Question = session.questions[session.currentQuestionIndex];

  const [userAnswer, setUserAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mentorAnswer, setMentorAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [viewedAnswer, setViewedAnswer] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<DeliveryStats | null>(null);
  const [transcriptNotice, setTranscriptNotice] = useState(false);
  const feedbackHeadingRef = useRef<HTMLHeadingElement>(null);
  // What happened on the answer on screen, and across the session so far.
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);
  const [ratingResult, setRatingResult] = useState<RatingResult | null>(null);
  const [wasRetry, setWasRetry] = useState(false);
  const [isEditing, setIsEditing] = useState(false); // true while giving a second try after the feedback
  const [results, setResults] = useState<Record<string, AnswerResult>>({});
  const [showSummary, setShowSummary] = useState(false);

  const handleSubmission = useCallback(async (isIdk: boolean) => {
    if (!currentQuestion) return;

    // Show the modal if a signed-in user has no questions left AND hasn't already seen the answer.
    // This prevents the modal from popping up again on navigation.
    // Guests have no weekly allowance (their limit is on sessions, checked when a session starts),
    // and the App passes them 0 here, so they must be skipped or every guest answer would be blocked.
    if (isAuthenticated && questionsRemaining <= 0 && !viewedAnswer) {
      setShowLimitModal(true);
      return;
    }

    setEvaluationError(null);
    setIsSubmitting(true);
    // Seeing the mentor answer first makes a second go practice only: it is graded but never counted.
    const isRetry = viewedAnswer;

    try {
      // An empty answer for "I Don't Know" still gets us the mentor answer and concepts to review.
      const { mentorAnswer, feedback, classification } =
        await evaluateAnswer(currentQuestion.text, isIdk ? "" : userAnswer, {
          skillId: session.skill.id,
          skillName: session.skill.name,
          isIdk,
          isRetry,
          level: currentQuestion.level,
          delivery: isIdk ? null : delivery,
        });

      setViewedAnswer(true);
      setMentorAnswer(mentorAnswer);
      if (isIdk) {
        setFeedback("That's okay! The first step to learning is identifying what you don't know. Review the mentor's answer below. " + feedback);
      } else {
        setFeedback(feedback);
      }
      // Only count the question (quota, rating, history) once we actually got an evaluation.
      const finalOutcome: AnswerOutcome = isIdk ? 'idk' : classification;
      const rating = onQuestionComplete({ question: currentQuestion, classification: finalOutcome, isRetry });
      setOutcome(finalOutcome);
      setWasRetry(isRetry);
      setIsEditing(false);
      if (!isRetry) {
        setRatingResult(rating);
        setResults(prev => ({ ...prev, [currentQuestion.id]: { outcome: finalOutcome, ...rating } }));
      }
    } catch (error) {
      if (error instanceof GuestLimitError) {
        setShowLimitModal(true);
      } else {
        setEvaluationError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [currentQuestion, userAnswer, onQuestionComplete, isAuthenticated, questionsRemaining, viewedAnswer, delivery, session.skill.id, session.skill.name]);

  useEffect(() => {
    setUserAnswer('');
    setMentorAnswer(null);
    setFeedback(null);
    setViewedAnswer(false);
    setIsSubmitting(false);
    setEvaluationError(null);
    setDelivery(null);
    setTranscriptNotice(false);
    setOutcome(null);
    setRatingResult(null);
    setWasRetry(false);
    setIsEditing(false);
  }, [session.currentQuestionIndex, session.skill.id]);

  // Move keyboard and screen reader focus to the feedback as soon as it is ready.
  useEffect(() => {
    if (viewedAnswer && !isSubmitting && !isEditing) feedbackHeadingRef.current?.focus();
  }, [viewedAnswer, isSubmitting, isEditing]);

  const handleVoiceResult = useCallback((transcript: string, stats: DeliveryStats) => {
    setUserAnswer(transcript.slice(0, 5000));
    setDelivery(stats);
    setTranscriptNotice(true);
  }, []);

  const handleUpgrade = useCallback(async (quantity: number) => {
    
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('google_id_token')}`,
        },
        body: JSON.stringify({ quantity }),
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url; // Redirect to Stripe Checkout
      } else {
        const message = await readErrorMessage(response, 'Failed to create checkout session');
        console.error('Failed to create checkout session:', message);
        alert(`Failed to initiate payment: ${message}`);
      }
    } catch (error) {
      console.error('Error during checkout initiation:', error);
      alert('An error occurred while trying to initiate payment.');
    }
  }, []);

  const isLastQuestion = session.currentQuestionIndex === session.questions.length - 1;
  const answeredCount = Object.keys(results).length;

  const handleFinish = () => setShowSummary(true);
  // Ending with answers on the board shows the recap first, so quitting is never a trapdoor.
  const handleEnd = () => (answeredCount > 0 ? setShowSummary(true) : onEndSession());

  const renderResultChip = () => {
    if (!outcome) return null;
    const { text, tone } = OUTCOME_LABEL[outcome];
    const level = currentQuestion.level;
    let ratingNote: string | null = null;
    if (wasRetry) {
      ratingNote = 'Practice try: your rating stays as it is.';
    } else if (ratingResult) {
      const change = ratingResult.after - ratingResult.before;
      if (change !== 0) {
        ratingNote = `${change > 0 ? '+' : ''}${change} ${session.skill.name}: ${ratingResult.before}% to ${ratingResult.after}%`;
      } else if (outcome === 'correct' || outcome === 'partially_correct') {
        const cap = RATING_CEILING[level ?? 'Mid-level'];
        ratingNote = `${session.skill.name} stays at ${ratingResult.after}%. ${level ?? 'Mid-level'} questions top out at ${cap}%, so try a harder level to keep growing.`;
      } else {
        ratingNote = `${session.skill.name} stays at ${ratingResult.after}%.`;
      }
    }
    return (
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        <span className={`font-mono text-xs font-bold uppercase tracking-wide border rounded px-2 py-0.5 ${tone}`}>{text}</span>
        {ratingNote && (
          <span className={`text-sm font-mono ${ratingResult && !wasRetry && ratingResult.after > ratingResult.before ? 'text-level-entry' : 'text-text-secondary'}`}>{ratingNote}</span>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (isSubmitting) {
      return (
        <div role="status" className="flex flex-col items-center justify-center min-h-[250px] text-text-secondary">
          <SpinnerIcon className="w-10 h-10 border-4 border-brand-primary" />
          <p className="mt-4 text-lg">Your mentor is thinking...</p>
        </div>
      );
    }
    
    if (viewedAnswer && !isEditing) {
      return (
        <div className="space-y-6">
          <div>
            {outcome && renderResultChip()}
            <h3 ref={feedbackHeadingRef} tabIndex={-1} className="text-lg sm:text-xl font-bold text-brand-light mb-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-light rounded">Feedback on Your Answer</h3>
            <div className="bg-background-dark/50 p-3 sm:p-4 rounded-lg text-sm sm:text-base">
                <MarkdownRenderer content={feedback} />
            </div>
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-text-primary mb-2">Mentor's Answer</h3>
            <div className="bg-background-dark/50 p-3 sm:p-4 rounded-lg text-sm sm:text-base">
                <MarkdownRenderer content={mentorAnswer} />
            </div>
          </div>
          {delivery && <DeliveryCard stats={delivery} />}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            {outcome !== 'correct' && (
              <button
                onClick={() => setIsEditing(true)}
                className="sm:flex-none py-3 px-6 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 transition-colors"
              >
                Try again
              </button>
            )}
            <button
              onClick={isLastQuestion ? handleFinish : () => onNavigate('next')}
              className="flex-1 py-3 px-6 rounded-lg bg-brand-primary text-white font-bold hover:bg-brand-hover transition-colors"
            >
              {isLastQuestion ? 'Finish session' : 'Next question'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {evaluationError && (
          <div role="alert" className="bg-red-900/40 border border-red-500/50 text-red-200 rounded-lg p-3 text-sm sm:text-base">
            {evaluationError} Your answer is still here, so you can submit it again.
          </div>
        )}
        {isAuthenticated ? (
          <VoiceRecorder onResult={handleVoiceResult} disabled={isSubmitting} />
        ) : (
          <p className="text-sm text-text-muted">Sign in to answer out loud and get feedback on your pace and filler words.</p>
        )}
        {viewedAnswer && (
          <p className="text-sm text-text-secondary">Try it again in your own words. This one is practice, so it will not change your rating.</p>
        )}
        {transcriptNotice && (
          <p role="status" className="text-sm text-text-secondary bg-background-dark/50 rounded-lg p-3">
            This is what we heard. Fix anything we got wrong, then submit for feedback.
          </p>
        )}
        <label htmlFor="answer-box" className="sr-only">Your answer</label>
        <textarea
            id="answer-box"
            rows={6}
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            placeholder="Type your answer here..."
            maxLength={5000} // Limit input to approximately 1000 words
            className="w-full bg-background-light border border-gray-600 text-text-primary rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition p-3"
        />
        <div className="text-right text-sm text-text-muted mt-1">
          {userAnswer.length}/5000 characters
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
            <button
                onClick={() => handleSubmission(false)}
                disabled={!userAnswer.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-lg bg-brand-primary text-white font-bold hover:bg-brand-hover disabled:bg-gray-500 disabled:cursor-not-allowed transition-all"
            >
                <BrainCircuitIcon className="w-6 h-6" /> {viewedAnswer ? 'Check my new answer' : 'Submit for Feedback'}
            </button>
            {!viewedAnswer ? (
              <button
                onClick={() => handleSubmission(true)}
                className="flex-1 sm:flex-none py-3 px-4 rounded-lg text-text-muted font-medium underline underline-offset-4 hover:text-text-primary transition-colors"
              >
                I don't know, show me the answer
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 sm:flex-none py-3 px-4 rounded-lg text-text-muted font-medium underline underline-offset-4 hover:text-text-primary transition-colors"
              >
                Back to feedback
              </button>
            )}
        </div>
      </div>
    );
  };

  if (showSummary) {
    const answered = session.questions.filter(q => results[q.id]);
    const level = answered.find(q => q.level)?.level ?? 'Mid-level';
    // Object keys keep the order the questions were first answered in, which the rating start and end rely on.
    return (
      <SessionSummary
        skillName={session.skill.name}
        level={level}
        total={session.questions.length}
        results={Object.values(results)}
        onBack={onEndSession}
        onKeepGoing={() => setShowSummary(false)}
        onPracticeAgain={onPracticeAgain}
      />
    );
  }

  return (
    <>
      {showLimitModal && (
        <LimitReachedModal 
          reason={isAuthenticated ? 'quota' : 'sessions'}
          onClose={onEndSession} 
          onUpgrade={handleUpgrade}
          googleLoginComponent={signInButton}
        />
      )}
      <div className="min-h-screen flex flex-col p-4 sm:p-8">
        <header className="w-full max-w-5xl mx-auto flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Practice: {session.skill.name}</h1>
            <p className="text-text-muted">Question {session.currentQuestionIndex + 1} of {session.questions.length}</p>
            <div className="flex gap-1.5 mt-2" aria-hidden="true">
              {session.questions.map((q, i) => {
                const result = results[q.id];
                const color = !result ? 'bg-gray-600'
                  : result.outcome === 'correct' ? 'bg-level-entry'
                  : result.outcome === 'partially_correct' ? 'bg-level-mid'
                  : 'bg-level-expert';
                return <span key={q.id} className={`h-1.5 w-6 rounded-full ${color} ${i === session.currentQuestionIndex ? 'ring-2 ring-offset-2 ring-offset-background-dark ring-brand-light' : ''}`} />;
              })}
            </div>
          </div>
          <button
            onClick={handleEnd}
            className="py-2 px-4 rounded-lg bg-background-medium text-text-primary font-semibold hover:bg-background-light transition-colors"
          >
            End Session
          </button>
        </header>

        <main className="flex-grow flex items-center justify-center">
          <div className="w-full max-w-5xl bg-background-medium rounded-xl shadow-2xl p-6 sm:p-10 border border-background-light">
            <div className="mb-8">
              <p className="text-sm font-semibold text-brand-light mb-2">
                {currentQuestion.source === 'custom' ? 'Your Custom Question' : 'AI-Generated Question'}
                {currentQuestion.level && (
                  <span className={`ml-2 font-mono text-xs font-bold uppercase tracking-wide ${LEVEL_STYLE[currentQuestion.level].text}`}>{LEVEL_STYLE[currentQuestion.level].short}</span>
                )}
              </p>
              <p className="text-2xl md:text-3xl font-medium text-text-primary leading-snug">{currentQuestion.text}</p>
            </div>
            
            <div className="mb-8 min-h-[250px]">
              {renderContent()}
            </div>
            
            <div className="flex flex-col sm:flex-row justify-between items-center mt-6 pt-6 border-t border-background-light">
              <button
                onClick={() => onNavigate('prev')}
                disabled={session.currentQuestionIndex === 0}
                className="flex items-center gap-2 py-2 px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-background-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full sm:w-auto justify-center border border-transparent hover:border-gray-600"
              >
                <ChevronLeftIcon /> Previous
              </button>
              {!viewedAnswer && (
                <button
                  onClick={() => onNavigate('next')}
                  disabled={isLastQuestion}
                  className="flex items-center gap-2 py-2 px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-background-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full sm:w-auto justify-center border border-transparent hover:border-gray-600"
                >
                  Skip <ChevronRightIcon />
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default PracticeView;

