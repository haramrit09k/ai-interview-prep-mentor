
import React, { useState } from 'react';
import type { Skill, ExperienceLevel } from '../types';
import { XIcon, SpinnerIcon } from './Icons';

interface StartPracticeModalProps {
  skill: Skill;
  isStarting: boolean;
  onClose: () => void;
  onStart: (skill: Skill, level: ExperienceLevel, count: number) => void;
  isAuthenticated: boolean;
  questionsRemaining: number;
  sessionsRemaining: number;
}

const StartPracticeModal: React.FC<StartPracticeModalProps> = ({
  skill,
  isStarting,
  onClose,
  onStart,
  isAuthenticated,
  questionsRemaining,
  sessionsRemaining,
}) => {
  const [level, setLevel] = useState<ExperienceLevel>('Mid-level');
  const [count, setCount] = useState<number>(5);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStart(skill, level, count);
  };
  
  const levels: ExperienceLevel[] = ['Entry-level', 'Mid-level', 'Expert'];
  const counts: number[] = [5, 10, 15];
  
  const getButtonClass = (isActive: boolean, isDisabled: boolean = false) => {
    if (isDisabled) {
      return 'bg-background-light text-text-muted cursor-not-allowed opacity-50';
    }
    if (isActive) {
      return 'bg-brand-primary text-white ring-2 ring-brand-light';
    }
    return 'bg-background-light hover:bg-gray-600 text-text-primary';
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-background-medium rounded-xl shadow-2xl w-full max-w-md border border-background-light">
        <div className="p-4 relative">
          <button onClick={onClose} className="absolute top-3 right-3 text-text-muted hover:text-text-primary transition-colors" aria-label="Close">
            <XIcon className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-text-primary mb-2">Practice: {skill.name}</h2>
          <p className="text-text-secondary text-sm mb-6">Customize your practice session.</p>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Experience Level
              </label>
              <div className="grid grid-cols-3 gap-2">
                {levels.map(l => (
                  <button
                    type="button"
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`py-2 px-2 rounded-lg text-sm font-semibold transition-all text-center ${getButtonClass(level === l)}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <label className="block text-sm font-medium text-text-secondary">
                  Number of Questions
                </label>
                {isAuthenticated ? (
                  <span className="text-xs text-brand-light font-medium">
                    {questionsRemaining} Questions Remaining Today
                  </span>
                ) : (
                   <span className="text-xs text-yellow-400 font-medium">
                    {sessionsRemaining} Free {sessionsRemaining === 1 ? 'Session' : 'Sessions'} Left
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                 {counts.map(c => {
                  const isDisabled = false; // Allow users to start any session length

                  return (
                    <button
                      type="button"
                      key={c}
                      onClick={() => !isDisabled && setCount(c)}
                      disabled={isDisabled}
                      className={`py-2 px-2 rounded-lg text-sm font-semibold transition-all ${getButtonClass(count === c, isDisabled)}`}
                    >
                      {c} Questions
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isStarting}
                className="w-full sm:w-48 flex justify-center items-center py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-light disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {isStarting ? (
                  <>
                    <SpinnerIcon className="w-4 h-4 mr-2 border-2" />
                    Starting...
                  </>
                ) : (
                  'Start Session'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StartPracticeModal;
