import React, { useState } from 'react';
import type { Insights, Skill } from '../types';
import { PlusIcon, TrashIcon, BookOpenIcon, ClipboardListIcon } from './Icons';
import CoachCard from './CoachCard';
import { LEVEL_STYLE, defaultQuestionCount, recommendedLevel } from '../utils/practiceDefaults';

// Tapping one of these adds the skill and starts a first round, so a new visitor is practising in one tap.
const STARTER_SKILLS = ['JavaScript', 'Python', 'Java', 'SQL', 'React', 'System Design', 'Data Structures', 'Machine Learning'];

interface SkillManagementProps {
  skills: Skill[];
  onAddSkill: (name: string) => void;
  onDeleteSkill: (id: string) => void;
  onOpenPracticeOptions: (skill: Skill) => void;
  onOpenAddQuestionModal: () => void;
  onOpenReview: (skill: Skill) => void;
  onQuickStart: (skill: Skill) => void;
  onStarterSkill: (name: string) => void;
  isSkillLimitReached: boolean;
  isAuthenticated: boolean;
  questionsRemaining: number;
  insights: Insights | null;
}

const SkillManagement: React.FC<SkillManagementProps> = ({
  skills,
  onAddSkill,
  onDeleteSkill,
  onOpenPracticeOptions,
  onOpenAddQuestionModal,
  onOpenReview,
  onQuickStart,
  onStarterSkill,
  isSkillLimitReached,
  isAuthenticated,
  questionsRemaining,
  insights,
}) => {
  const [newSkill, setNewSkill] = useState('');

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSkill.trim()) {
      onAddSkill(newSkill.trim());
      setNewSkill('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <CoachCard skills={skills} insights={insights} isAuthenticated={isAuthenticated} questionsRemaining={questionsRemaining} onPractice={onQuickStart} />
      <div className="bg-background-medium rounded-xl shadow-lg p-6 md:p-8 border border-background-light">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-text-primary">Your Skills</h2>
          {skills.length > 0 && <button
            onClick={onOpenAddQuestionModal}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 border border-gray-600 transition-colors text-xs sm:text-sm w-full sm:w-auto"
          >
            <BookOpenIcon className="w-5 h-5" />
            Add Custom Question
          </button>}
        </div>

        <form onSubmit={handleAddSkill} className="flex flex-col md:flex-row gap-2 mb-8">
          <input
            type="text"
            value={newSkill}
            maxLength={60}
            onChange={(e) => setNewSkill(e.target.value)}
            placeholder={isSkillLimitReached ? "Skill limit reached" : "e.g., Apache Spark, MLOps..."}
            className="flex-grow bg-background-light border border-gray-600 text-text-primary rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition p-2.5 text-sm disabled:cursor-not-allowed disabled:bg-gray-700"
            disabled={isSkillLimitReached}
          />
          <button
            type="submit"
            className="flex items-center justify-center gap-2 w-full md:w-36 py-2.5 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-hover transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed text-sm"
            disabled={isSkillLimitReached || !newSkill.trim()}
          >
            <PlusIcon className="w-5 h-5" />
            <span>Add Skill</span>
          </button>
        </form>

        <div className="space-y-4">
          {skills.length === 0 ? (
            <div className="py-6 px-4 sm:px-6 border border-dashed border-gray-600 rounded-lg text-center">
              <h3 className="text-lg sm:text-xl font-bold text-text-primary">What are you interviewing for?</h3>
              <p className="text-text-secondary text-sm mt-1">Pick one and we will start a short practice round right away. You can change anything later.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {STARTER_SKILLS.map(name => (
                  <button
                    key={name}
                    onClick={() => onStarterSkill(name)}
                    disabled={isSkillLimitReached}
                    className="py-2 px-4 rounded-full border border-gray-600 bg-background-light text-text-primary text-sm font-semibold hover:border-brand-light hover:text-brand-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {name}
                  </button>
                ))}
              </div>
              <p className="text-text-muted text-xs mt-4">Not on the list? Type any skill in the box above.</p>
            </div>
          ) : (
            skills.map(skill => {
              const level = recommendedLevel(skill.rating);
              const count = defaultQuestionCount(isAuthenticated, questionsRemaining);
              return (
              <div key={skill.id} className="bg-background-light p-3 sm:p-4 rounded-lg border border-transparent transition-colors hover:border-gray-600">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3">
                  <div>
                    <span className="text-text-primary font-semibold text-sm sm:text-base">{skill.name}</span>
                    <p className="text-xs text-text-muted mt-0.5">
                      {isAuthenticated && count === 0 ? (
                        'No questions left this week'
                      ) : (
                        <>
                          Next round: <span className={`font-mono font-bold ${LEVEL_STYLE[level].text}`}>{LEVEL_STYLE[level].short}</span>, {count} {count === 1 ? 'question' : 'questions'}
                          <span aria-hidden="true"> · </span>
                          <button onClick={() => onOpenPracticeOptions(skill)} className="underline hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-light rounded">Change</button>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 w-full sm:w-auto">
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => onOpenReview(skill)}
                        className="flex items-center justify-center gap-2 py-2 px-3 rounded-md bg-background-medium text-text-primary text-xs sm:text-sm font-semibold hover:bg-gray-700 transition-colors w-1/2 sm:w-auto"
                      >
                        <ClipboardListIcon className="w-4 h-4" /> <span className="whitespace-nowrap">Review</span>
                      </button>
                      <button
                        onClick={() => onQuickStart(skill)}
                        className="py-2 px-3 rounded-md bg-brand-primary text-white text-xs sm:text-sm font-semibold hover:bg-brand-hover transition-colors w-1/2 sm:w-auto"
                      >
                        <span className="whitespace-nowrap">Practice</span>
                      </button>
                    </div>
                    <button
                      onClick={() => onDeleteSkill(skill.id)}
                      className="p-2 rounded-md text-text-muted hover:bg-red-500 hover:text-white transition-colors flex-shrink-0"
                      aria-label={`Delete ${skill.name} skill`}
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 sm:mt-3">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-text-muted">Expertise</span>
                        <span className="text-xs font-mono font-bold text-text-secondary">{skill.rating}%</span>
                    </div>
                    <div className="w-full bg-background-medium rounded-full h-2">
                        <div className="bg-gradient-to-r from-brand-secondary to-brand-light h-2 rounded-full" style={{width: `${skill.rating}%`}}></div>
                    </div>
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillManagement;
