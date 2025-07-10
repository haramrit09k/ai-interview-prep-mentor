
import React, { useState, useEffect } from 'react';
import type { Skill, AnswerHistory, AnswerOutcome } from '../types';
import { XIcon, SpinnerIcon } from './Icons';
import MarkdownRenderer from './MarkdownRenderer';

interface RevisionSummaryModalProps {
  skill: Skill;
  answerHistory: AnswerHistory[];
  onClose: () => void;
}

const RevisionSummaryModal: React.FC<RevisionSummaryModalProps> = ({ skill, answerHistory, onClose }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [aggregatedConcepts, setAggregatedConcepts] = useState<{ known: string[]; review: string[]; } | null>(null);

  useEffect(() => {
    console.log("RevisionSummaryModal: useEffect triggered.");
    console.log("RevisionSummaryModal: skill.id", skill.id);
    console.log("RevisionSummaryModal: answerHistory", answerHistory);

    setIsLoading(true);
    const relevantHistory = answerHistory.filter(h => h.skillId === skill.id);
    console.log("RevisionSummaryModal: relevantHistory", relevantHistory);

    const known: Set<string> = new Set();
    const review: Set<string> = new Set();

    relevantHistory.forEach(entry => {
      console.log("Processing history entry:", entry);
      entry.conceptsKnown?.forEach(concept => {
        known.add(concept);
        console.log("Added to known:", concept);
      });
      entry.conceptsToReview?.forEach(concept => {
        review.add(concept);
        console.log("Added to review:", concept);
      });
    });

    // Filter out concepts that are in both known and review (prioritize review if ambiguous)
    const finalKnown = Array.from(known).filter(concept => !review.has(concept));
    const finalReview = Array.from(review);

    console.log("RevisionSummaryModal: finalKnown", finalKnown);
    console.log("RevisionSummaryModal: finalReview", finalReview);

    setAggregatedConcepts({ known: finalKnown, review: finalReview });
    setIsLoading(false);
  }, [skill.id, answerHistory]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[250px] text-text-secondary">
          <SpinnerIcon className="w-10 h-10 border-4 border-brand-primary" />
          <p className="mt-4 text-lg">Aggregating your revision summary...</p>
        </div>
      );
    }
    
    if (aggregatedConcepts) {
      const knownContent = aggregatedConcepts.known.length > 0 
        ? aggregatedConcepts.known.map(c => `- ${c}`).join('\n')
        : 'No specific concepts identified as known yet.';

      const reviewContent = aggregatedConcepts.review.length > 0 
        ? aggregatedConcepts.review.map(c => `- ${c}`).join('\n')
        : 'No specific concepts identified for review yet.';

      return (
        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-bold text-brand-light mb-3">Concepts You Knew</h3>
            <div className="bg-background-dark/50 p-4 rounded-lg">
              <MarkdownRenderer content={knownContent} />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-yellow-400 mb-3">Concepts to Review</h3>
            <div className="bg-background-dark/50 p-4 rounded-lg">
              <MarkdownRenderer content={reviewContent} />
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-background-medium rounded-xl shadow-2xl w-full max-w-3xl border border-background-light transform transition-all duration-300 scale-95 hover:scale-100">
        <div className="p-6 md:p-8 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors" aria-label="Close">
            <XIcon className="w-6 h-6" />
          </button>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Revision Summary: {skill.name}</h2>
          <p className="text-text-secondary mb-6">Here's a summary of your performance based on your practice history.</p>
          
          <div className="max-h-[60vh] overflow-y-auto pr-4 -mr-4">
             {renderContent()}
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default RevisionSummaryModal;
