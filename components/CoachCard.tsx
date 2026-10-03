import React from 'react';
import type { Insights, Skill } from '../types';
import { FlameIcon } from './Icons';
import { LEVEL_STYLE, defaultQuestionCount, recommendedLevel } from '../utils/practiceDefaults';

interface CoachCardProps {
  skills: Skill[];
  insights: Insights | null; // null for guests, and for signed-in users until progress has loaded
  isAuthenticated: boolean;
  questionsRemaining: number;
  onPractice: (skill: Skill) => void;
}

interface Suggestion {
  title: string;
  detail: string;
  skill: Skill;
}

const findSkill = (skills: Skill[], name?: string) => skills.find(s => s.name.toLowerCase() === name?.toLowerCase());

/** The skill the next step is about. Falls back to the weakest skill when the advice is not about one skill. */
const pickSkill = (skills: Skill[], insights: Insights): Skill => {
  const { nextStep } = insights;
  let named: Skill | undefined;
  if (nextStep.type === 'gap') {
    named = findSkill(skills, insights.gaps.find(g => g.timesMissed >= 2)?.skill);
  } else if (nextStep.type === 'skill') {
    const weak = insights.skills.filter(s => s.attempts >= 3 && s.accuracy !== null && s.accuracy < 60).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))[0];
    named = findSkill(skills, weak?.name);
  } else if (nextStep.type === 'level-up') {
    named = [...skills].sort((a, b) => b.rating - a.rating)[0];
  }
  return named ?? [...skills].sort((a, b) => a.rating - b.rating)[0];
};

const suggest = (skills: Skill[], insights: Insights | null): Suggestion => {
  if (insights && insights.nextStep.type !== 'start') {
    return { title: insights.nextStep.title, detail: insights.nextStep.detail, skill: pickSkill(skills, insights) };
  }
  const weakest = [...skills].sort((a, b) => a.rating - b.rating)[0];
  if (weakest.rating === 0) {
    return { title: `Answer your first ${weakest.name} question`, detail: 'A short round takes a few minutes. Your rating and progress start building from the first answer.', skill: weakest };
  }
  return { title: `Practise ${weakest.name}`, detail: `It is your lowest rated skill at ${weakest.rating}%. A short round is the quickest way to move it.`, skill: weakest };
};

const CoachCard: React.FC<CoachCardProps> = ({ skills, insights, isAuthenticated, questionsRemaining, onPractice }) => {
  if (skills.length === 0) return null;
  const { title, detail, skill } = suggest(skills, insights);
  const level = recommendedLevel(skill.rating);
  const count = defaultQuestionCount(isAuthenticated, questionsRemaining);
  const streak = insights?.totals.currentStreak ?? 0;

  return (
    <section aria-labelledby="coach-heading" className="rounded-xl border border-brand-primary/50 bg-background-medium p-5 md:p-6 mb-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-brand-light">Up next</p>
        {isAuthenticated && streak > 0 && (
          <p className="flex items-center gap-1 text-sm font-mono font-bold text-brand-light">
            <FlameIcon className="w-4 h-4" /> {streak}-day streak
          </p>
        )}
      </div>
      <h2 id="coach-heading" className="text-lg sm:text-xl font-bold text-text-primary">{title}</h2>
      <p className="text-sm text-text-secondary mt-1">{detail}</p>
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          onClick={() => onPractice(skill)}
          className="py-2.5 px-5 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-hover transition-colors text-sm"
        >
          Practise {skill.name}
        </button>
        <span className="text-xs text-text-muted">
          <span className={`font-mono font-bold ${LEVEL_STYLE[level].text}`}>{LEVEL_STYLE[level].short}</span> level, {count} {count === 1 ? 'question' : 'questions'}
        </span>
      </div>
      {!isAuthenticated && (
        <p className="mt-3 text-xs text-text-muted">Sign in to keep a practice streak and get advice based on the questions you miss.</p>
      )}
    </section>
  );
};

export default CoachCard;
