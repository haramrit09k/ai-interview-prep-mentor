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
          <div className="text-text-secondary space-y-3 text-sm">
            <p>This app is designed to help you ace your technical interviews by practicing with AI-generated questions and getting instant feedback.</p>
            <p>Here's how to get started:</p>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li><strong>Add Skills:</strong> Use the input field to add technical skills you want to practice (e.g., "JavaScript", "Data Structures", "System Design").</li>
              <li><strong>Start Practice:</strong> Click the "Practice" button next to a skill to generate interview questions at your chosen experience level.</li>
              <li><strong>Get Feedback:</strong> Answer the questions, and the AI will provide feedback and evaluate your response.</li>
              <li><strong>Track Progress:</strong> Your performance will update your skill ratings, and you can review concepts you need to work on.</li>
              <li><strong>Login for More:</strong> Log in with your Google account to save your progress and unlock more features and questions!</li>
            </ul>
            <p>Ready to begin your interview prep journey?</p>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-light transition-colors text-sm"
            >
              Let's Go!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
