import React from 'react';
import { XIcon } from './Icons';

interface WelcomeModalProps {
  onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-background-medium rounded-xl shadow-2xl w-full max-w-md border border-background-light">
        <div className="p-4 relative">
          <button onClick={onClose} className="absolute top-3 right-3 text-text-muted hover:text-text-primary transition-colors" aria-label="Close">
            <XIcon className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-brand-light mb-3">Welcome to ACE: AI Coach for Employment!</h2>
          <div className="text-text-secondary space-y-3 text-sm max-h-[70vh] overflow-y-auto pr-2"> {/* Added max-h and overflow for scrollability */}
            <p>This app is designed to help you ace your technical interviews by practicing with AI-generated questions and getting instant feedback.</p>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li><strong>Pick a skill:</strong> Tap a suggestion or type your own, like "SQL" or "System Design".</li>
              <li><strong>Practice:</strong> One tap starts a short round at a level that fits you. Use Change on a skill to pick the level and length yourself.</li>
              <li><strong>Learn from feedback:</strong> After each answer you see what you got right, a model answer, and how your rating moved. Try again if you want a second go.</li>
              <li><strong>Sign in for more:</strong> Signing in with Google keeps a practice streak, unlocks voice answers and progress tracking, and raises your limits.</li>
            </ul>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-hover transition-colors text-sm"
            >
              Let's Go!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
