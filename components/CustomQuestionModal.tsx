
import React, { useState } from 'react';
import type { Skill } from '../types';
import { XIcon } from './Icons';

interface CustomQuestionModalProps {
  skills: Skill[];
  onClose: () => void;
  onAddQuestion: (skillId: string, question: string, answer: string) => void;
}

const CustomQuestionModal: React.FC<CustomQuestionModalProps> = ({ skills, onClose, onAddQuestion }) => {
  const [selectedSkill, setSelectedSkill] = useState<string>(skills[0]?.id || '');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkill || !question.trim() || !answer.trim()) {
      alert('Please fill out all fields.');
      return;
    }
    onAddQuestion(selectedSkill, question, answer);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-background-medium rounded-xl shadow-2xl w-full max-w-md mx-auto border border-background-light">
        <div className="p-4 sm:p-6 relative">
          <button onClick={onClose} className="absolute top-3 right-3 text-text-muted hover:text-text-primary transition-colors">
            <XIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-3 sm:mb-4">Add a Custom Question</h2>
          <p className="text-text-secondary text-sm sm:text-base mb-4 sm:mb-6">Add questions you've encountered or want to practice specifically.</p>
          
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            <div>
              <label htmlFor="skill" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1 sm:mb-2">
                Skill / Topic
              </label>
              <select
                id="skill"
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
                className="w-full bg-background-light border border-gray-600 text-text-primary rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition p-2 sm:p-3 text-sm sm:text-base"
              >
                {skills.length > 0 ? (
                    skills.map(skill => (
                        <option key={skill.id} value={skill.id}>{skill.name}</option>
                    ))
                ) : (
                    <option disabled>Please add a skill first</option>
                )}
              </select>
            </div>
            
            <div>
              <label htmlFor="question" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1 sm:mb-2">
                Question
              </label>
              <textarea
                id="question"
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g., Explain the difference between useEffect and useLayoutEffect."
                className="w-full bg-background-light border border-gray-600 text-text-primary rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition p-2 sm:p-3 text-sm sm:text-base"
              />
            </div>

            <div>
              <label htmlFor="answer" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1 sm:mb-2">
                Your Ideal Answer
              </label>
              <textarea
                id="answer"
                rows={6}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Provide a detailed, well-structured answer you want to practice."
                className="w-full bg-background-light border border-gray-600 text-text-primary rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition p-2 sm:p-3 text-sm sm:text-base"
              />
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 pt-2 sm:pt-4">
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={skills.length === 0}
                className="py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-light disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
              >
                Add Question
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CustomQuestionModal;
