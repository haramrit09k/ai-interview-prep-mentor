
import React, { useState } from 'react';
import type { Skill } from '../types';
import { PlusIcon, TrashIcon, BookOpenIcon, ClipboardListIcon } from './Icons';

interface SkillManagementProps {
  skills: Skill[];
  onAddSkill: (name: string) => void;
  onDeleteSkill: (id: string) => void;
  onOpenPracticeOptions: (skill: Skill) => void;
  onOpenAddQuestionModal: () => void;
  onOpenRevisionSummary: (skill: Skill) => void;
  isSkillLimitReached: boolean;
}

const SkillManagement: React.FC<SkillManagementProps> = ({
  skills,
  onAddSkill,
  onDeleteSkill,
  onOpenPracticeOptions,
  onOpenAddQuestionModal,
  onOpenRevisionSummary,
  isSkillLimitReached,
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
      <div className="bg-background-medium rounded-xl shadow-lg p-6 md:p-8 border border-background-light">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <h2 className="text-2xl font-bold text-text-primary">Your Skills</h2>
          <button
            onClick={onOpenAddQuestionModal}
            className="flex items-center gap-2 py-2 px-4 rounded-lg bg-brand-secondary text-white font-semibold hover:bg-purple-500 transition-colors"
          >
            <BookOpenIcon className="w-5 h-5" />
            Add Custom Question
          </button>
        </div>

        <form onSubmit={handleAddSkill} className="flex gap-2 mb-8">
          <input
            type="text"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            placeholder={isSkillLimitReached ? "Skill limit reached" : "e.g., Apache Spark, System Design..."}
            className="flex-grow bg-background-light border border-gray-600 text-text-primary rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition p-3 disabled:cursor-not-allowed disabled:bg-gray-700"
            disabled={isSkillLimitReached}
          />
          <button
            type="submit"
            className="flex items-center justify-center gap-2 w-36 py-3 px-5 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-light transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
            disabled={isSkillLimitReached || !newSkill.trim()}
          >
            <PlusIcon className="w-5 h-5" />
            <span className="hidden sm:inline">Add Skill</span>
          </button>
        </form>

        <div className="space-y-4">
          {skills.length === 0 ? (
            <div className="text-center py-8 px-4 border-2 border-dashed border-gray-600 rounded-lg">
                <p className="text-text-secondary">No skills added yet.</p>
                <p className="text-text-muted text-sm">Add a skill above to start your practice!</p>
            </div>
          ) : (
            skills.map(skill => (
              <div key={skill.id} className="bg-background-light p-4 rounded-lg transition-all hover:bg-gray-600 hover:scale-[1.01]">
                <div className="flex justify-between items-center">
                  <span className="text-text-primary font-medium text-lg">{skill.name}</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onOpenRevisionSummary(skill)}
                      className="flex items-center gap-2 py-2 px-4 rounded-md bg-background-light text-text-primary text-sm font-semibold hover:bg-gray-700 transition-colors"
                    >
                      <ClipboardListIcon className="w-4 h-4" /> Review
                    </button>
                    <button
                      onClick={() => onOpenPracticeOptions(skill)}
                      className="py-2 px-4 rounded-md bg-brand-primary text-white text-sm font-semibold hover:bg-brand-light transition-colors"
                    >
                      Practice
                    </button>
                    <button
                      onClick={() => onDeleteSkill(skill.id)}
                      className="p-2 rounded-md text-text-muted hover:bg-red-500 hover:text-white transition-colors"
                      aria-label={`Delete ${skill.name} skill`}
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-brand-light">Expertise</span>
                        <span className="text-xs font-medium text-text-secondary">{skill.rating}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                        <div className="bg-gradient-to-r from-brand-secondary to-brand-primary h-2.5 rounded-full" style={{width: `${skill.rating}%`}}></div>
                    </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillManagement;
