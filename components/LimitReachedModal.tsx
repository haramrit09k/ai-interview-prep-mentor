import React, { useState } from 'react';
import { XIcon } from './Icons';
import { purchaseOptions } from '../config/purchaseOptions';

interface LimitReachedModalProps {
  onClose: () => void;
  onUpgrade: (quantity: number, priceCents: number) => void; // Now accepts quantity and priceCents
  googleLoginComponent: React.ReactNode; // New prop for rendering GoogleLogin component
  reason: 'skills' | 'sessions' | 'quota';
}

export const LimitReachedModal: React.FC<LimitReachedModalProps> = ({ onClose, onUpgrade, googleLoginComponent, reason }) => {
  const messages = {
    skills: {
      title: 'Skill Limit Reached!',
      body: 'As an anonymous user, you are limited to <strong>2 skills</strong>. Log in to add more skills and continue your practice journey!',
      upgrade: false,
    },
    sessions: {
      title: 'Practice Limit Reached!',
      body: 'As an anonymous user, you are limited to <strong>2 practice sessions</strong>. Log in to continue practicing and unlock unlimited sessions!',
      upgrade: false,
    },
    quota: {
      title: "Great work! You've hit your weekly practice limit.",
      body: 'To continue with your interview and unlock unlimited practice sessions, please upgrade.',
      upgrade: true,
    }
  };

  const currentMessage = messages[reason];

  const [selectedOption, setSelectedOption] = useState(purchaseOptions[0]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-background-medium rounded-xl shadow-2xl w-full max-w-md border border-background-light">
        <div className="p-4 relative">
          <button onClick={onClose} className="absolute top-3 right-3 text-text-muted hover:text-text-primary transition-colors" aria-label="Close">
            <XIcon className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-brand-light mb-3">{currentMessage.title}</h2>
          <div className="text-text-secondary space-y-3 text-sm">
            <p dangerouslySetInnerHTML={{ __html: currentMessage.body }} />
            {currentMessage.upgrade && (
              <div className="space-y-2">
                <p>Choose your question pack:</p>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  {purchaseOptions.map(option => (
                    <button
                      key={option.quantity}
                      type="button"
                      onClick={() => setSelectedOption(option)}
                      className={`py-2 px-3 rounded-lg text-sm font-semibold transition-colors flex justify-between items-center relative
                        ${selectedOption.quantity === option.quantity
                          ? 'bg-brand-primary text-white ring-2 ring-brand-light'
                          : 'bg-background-light hover:bg-gray-600 text-text-primary'
                        }
                        ${option.highlight ? 'border-2 border-yellow-400 shadow-lg' : ''}
                      `}
                    >
                      <span>{option.quantity} Questions</span>
                      <span className="flex items-center gap-2">
                        {option.savingsText && (
                          <span className="text-xs font-bold text-yellow-400 bg-yellow-400/20 px-2 py-1 rounded-full">
                            {option.savingsText}
                          </span>
                        )}
                        <span>${(option.priceCents / 100).toFixed(2)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            {currentMessage.upgrade ? (
              <>
                <button
                  onClick={() => onUpgrade(selectedOption.quantity, selectedOption.priceCents)}
                  className="flex-1 text-center py-2.5 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-light transition-colors text-sm"
                >
                  Buy {selectedOption.quantity} Questions (${(selectedOption.priceCents / 100).toFixed(2)}) & Continue
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none py-2.5 px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 transition-colors text-sm"
                >
                  End Session & View Summary
                </button>
              </>
            ) : (
              <>
                <div className="flex justify-center w-full">
                  {googleLoginComponent}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none py-2.5 px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 transition-colors text-sm"
                >
                  Got it
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
