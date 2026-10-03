
import React, { useState, useEffect } from 'react';
import type { Skill } from '../types';
import { XIcon, SpinnerIcon } from './Icons';
import MarkdownRenderer from './MarkdownRenderer';

interface RevisionSummaryModalProps {
  skill: Skill;
  onClose: () => void;
}

const RevisionSummaryModal: React.FC<RevisionSummaryModalProps> = ({ skill, onClose }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState<{ conceptsKnown: string; conceptsToReview: string; } | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/revision-summary/${skill.id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('google_id_token')}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSummary(data);
        } else if (response.status === 404) {
          setSummary({
            conceptsKnown: 'No revision summary available yet. Complete a practice session for this skill to generate one.',
            conceptsToReview: 'No revision summary available yet. Complete a practice session for this skill to generate one.',
          });
        } else {
          console.error('Error fetching revision summary:', response.statusText);
          setSummary({
            conceptsKnown: 'Could not load summary due to an error.',
            conceptsToReview: 'Could not load summary due to an error.',
          });
        }
      } catch (error) {
        console.error('Error fetching revision summary:', error);
        setSummary({
          conceptsKnown: 'Could not load summary due to a network error.',
          conceptsToReview: 'Could not load summary due to a network error.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummary();
  }, [skill.id]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[250px] text-text-secondary">
          <SpinnerIcon className="w-10 h-10 border-4 border-brand-primary" />
          <p className="mt-4 text-lg">Generating your personalized revision summary...</p>
        </div>
      );
    }
    
    if (summary) {
      return (
        <div className="space-y-8">
          <div>
            <h3 className="text-lg font-bold text-brand-light mb-2">Concepts You Knew</h3>
            <div className="bg-background-dark/50 p-3 rounded-lg text-sm">
              <MarkdownRenderer content={summary.conceptsKnown} />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-yellow-400 mb-2">Concepts to Review</h3>
            <div className="bg-background-dark/50 p-3 rounded-lg text-sm">
              <MarkdownRenderer content={summary.conceptsToReview} />
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
        <div className="p-4 sm:p-6 md:p-8 relative">
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
