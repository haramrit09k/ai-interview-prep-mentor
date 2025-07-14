
import React, { useState, useEffect, useCallback } from 'react';
import type { Question, AnswerOutcome } from '../types';
import { generateAnswerForQuestion, evaluateAnswer } from '../services/gemini';
import { ChevronLeftIcon, ChevronRightIcon, BrainCircuitIcon, SpinnerIcon } from './Icons';
import MarkdownRenderer from './MarkdownRenderer';
import { LimitReachedModal } from './LimitReachedModal';

interface PracticeSession {
  skill: { id: string; name: string };
  questions: Question[];
  currentQuestionIndex: number;
}
interface PracticeViewProps {
  session: PracticeSession;
  onEndSession: () => void;
  onNavigate: (direction: 'next' | 'prev') => void;
  onQuestionComplete: (args: { question: Question; classification: AnswerOutcome }) => void;
  questionsRemaining: number; // Receive quota from App.tsx
}

const PracticeView: React.FC<PracticeViewProps> = ({ session, onEndSession, onNavigate, onQuestionComplete, questionsRemaining }) => {
  const currentQuestion: Question = session.questions[session.currentQuestionIndex];

  const [userAnswer, setUserAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mentorAnswer, setMentorAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [viewedAnswer, setViewedAnswer] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);

  const handleSubmission = useCallback(async (isIdk: boolean) => {
    if (!currentQuestion) return;

    // Corrected Check: Show modal if the user has no questions left AND hasn't already seen the answer.
    // This prevents the modal from popping up again on navigation.
    if (questionsRemaining <= 0 && !viewedAnswer) {
      setShowLimitModal(true);
      return;
    }

    setIsSubmitting(true);
    setViewedAnswer(true);

    // onQuestionComplete is called, which will increment the official quota in App.tsx
    if (isIdk) {
      // When user clicks "I Don't Know", we still want to get concepts to review
      // Pass an empty string as userAnswer to evaluateAnswer
      const { mentorAnswer, feedback, classification, conceptsKnown, conceptsToReview } = await evaluateAnswer(currentQuestion.text, "");
      setMentorAnswer(mentorAnswer);
      setFeedback("That's okay! The first step to learning is identifying what you don't know. Review the mentor's answer below. " + feedback);
      onQuestionComplete({ question: currentQuestion, classification: 'idk', conceptsKnown, conceptsToReview });
    } else {
      const { mentorAnswer, feedback, classification, conceptsKnown, conceptsToReview } = await evaluateAnswer(currentQuestion.text, userAnswer);
      setMentorAnswer(mentorAnswer);
      setFeedback(feedback);
      onQuestionComplete({ question: currentQuestion, classification, conceptsKnown, conceptsToReview });
    }

    setIsSubmitting(false);
  }, [currentQuestion, userAnswer, onQuestionComplete, questionsRemaining, viewedAnswer]);

  useEffect(() => {
    setUserAnswer('');
    setMentorAnswer(null);
    setFeedback(null);
    setViewedAnswer(false);
    setIsSubmitting(false);
  }, [session.currentQuestionIndex, session.skill.id]);

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
        const errorData = await response.json();
        console.error('Failed to create checkout session:', errorData.error);
        alert(`Failed to initiate payment: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error during checkout initiation:', error);
      alert('An error occurred while trying to initiate payment.');
    }
  }, []);

  const renderContent = () => {
    if (isSubmitting) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[250px] text-text-secondary">
          <SpinnerIcon className="w-10 h-10 border-4 border-brand-primary" />
          <p className="mt-4 text-lg">Your mentor is thinking...</p>
        </div>
      );
    }
    
    if (viewedAnswer) {
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-brand-light mb-2">Feedback on Your Answer</h3>
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
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <textarea
            rows={6}
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            placeholder="Type your answer here..."
            maxLength={5000} // Limit input to approximately 1000 words
            className="w-full bg-background-light border border-gray-600 text-text-primary rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition p-3"
            aria-label="Your Answer"
        />
        <div className="text-right text-sm text-text-muted mt-1">
          {userAnswer.length}/5000 characters
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
            <button
                onClick={() => handleSubmission(false)}
                disabled={!userAnswer.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-lg bg-brand-primary text-white font-bold hover:bg-brand-light disabled:bg-gray-500 disabled:cursor-not-allowed transition-all"
            >
                <BrainCircuitIcon className="w-6 h-6" /> Submit for Feedback
            </button>
            <button
                onClick={() => handleSubmission(true)}
                className="flex-1 sm:flex-none py-3 px-6 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 transition-colors"
            >
                I Don't Know
            </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {showLimitModal && (
        <LimitReachedModal 
          reason="quota" 
          onClose={onEndSession} 
          onUpgrade={handleUpgrade} 
        />
      )}
      <div className="min-h-screen flex flex-col p-4 sm:p-8">
        <header className="w-full max-w-5xl mx-auto flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Practice: {session.skill.name}</h1>
            <p className="text-text-muted">Question {session.currentQuestionIndex + 1} of {session.questions.length}</p>
          </div>
          <button
            onClick={onEndSession}
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
              <button
                onClick={() => onNavigate('next')}
                disabled={session.currentQuestionIndex === session.questions.length - 1}
                className="flex items-center gap-2 py-2 px-4 rounded-lg bg-brand-primary text-white font-bold hover:bg-brand-light disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors w-full sm:w-auto justify-center"
              >
                Next <ChevronRightIcon />
              </button>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default PracticeView;

