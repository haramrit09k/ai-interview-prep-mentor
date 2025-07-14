import React, { useState } from 'react';
import { XIcon } from './Icons';
import { purchaseOptions } from '../config/purchaseOptions';

interface LimitReachedModalProps {
  onClose: () => void;
  onUpgrade: (quantity: number) => void; // Now accepts quantity
  reason: 'skills' | 'sessions' | 'quota';
}

export const LimitReachedModal: React.FC<LimitReachedModalProps> = ({ onClose, onUpgrade, reason }) => {
  const messages = {
    skills: {
      title: 'Skill Limit Reached!',
      body: 'To keep this service available for everyone, anonymous users are limited to <strong>2 skills</strong>.',
      upgrade: false,
    },
    sessions: {
      title: 'Practice Limit Reached!',
      body: 'To keep this service available for everyone, anonymous users are limited to <strong>2 practice sessions</strong>.',
      upgrade: false,
    },
    quota: {
      title: "Great work! You've hit your daily practice limit.",
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
                      className={`py-2 px-3 rounded-lg text-sm font-semibold transition-colors
                        ${selectedOption.quantity === option.quantity
                          ? 'bg-brand-primary text-white ring-2 ring-brand-light'
                          : 'bg-background-light hover:bg-gray-600 text-text-primary'
                        }`}
                    >
                      {option.quantity} Questions (${(option.priceCents / 100).toFixed(2)})
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!currentMessage.upgrade && (
              <>
                <p>
                  For unlimited access, you can run this application on your own computer. It's free and open-source!
                </p>
                <p>
                  Just clone the repository from GitHub, add your own Google Gemini API key, and you'll have your own personal, unrestricted interview mentor.
                </p>
              </>
            )}
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            {currentMessage.upgrade ? (
              <>
                <button
                  onClick={() => onUpgrade(selectedOption.quantity)}
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
                <a
                  href="https://github.com/your-username/your-repo-name" // Replace with your actual repo URL
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center py-2.5 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-light transition-colors text-sm"
                >
                  Go to GitHub
                </a>
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
