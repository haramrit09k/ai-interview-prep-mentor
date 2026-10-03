import React, { useCallback, useEffect, useState } from 'react';
import Modal from './Modal';
import { SpinnerIcon } from './Icons';
import { deleteInsights, fetchInsights } from '../services/progress';
import type { Insights, Trend } from '../types';

const TREND_TEXT: Record<Trend, string> = {
  up: '↑ Improving',
  down: '↓ Slipping',
  steady: '→ Holding steady',
  new: 'New, keep going',
};

const formatDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One plain sentence that covers the headline numbers, so no one has to read the whole dashboard to get the gist. */
export const summarize = (insights: Insights): string => {
  const { totals } = insights;
  if (totals.answers === 0) return 'You have not answered any questions yet. Your progress will appear here after your first session.';
  const week = totals.last7Days;
  if (week.answers === 0) {
    return `You have answered ${plural(totals.answers, 'question')} in total, but none in the last 7 days. A short session today would get you going again.`;
  }
  let sentence = `In the last 7 days you answered ${plural(week.answers, 'question')} with ${week.accuracy}% accuracy`;
  if (totals.accuracyChange !== null && totals.accuracyChange !== 0) {
    sentence += `, ${totals.accuracyChange > 0 ? 'up' : 'down'} ${Math.abs(totals.accuracyChange)} ${Math.abs(totals.accuracyChange) === 1 ? 'point' : 'points'} from the week before`;
  }
  sentence += '.';
  if (totals.currentStreak > 1) sentence += ` You are on a ${totals.currentStreak}-day streak.`;
  return sentence;
};

const Stat: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <div className="bg-background-dark/50 rounded-lg p-3">
    <dt className="text-sm text-text-muted">{label}</dt>
    <dd className="text-2xl font-bold text-text-primary">{value}</dd>
    {note && <dd className="text-xs sm:text-sm text-text-secondary">{note}</dd>}
  </div>
);

const ProgressModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setInsights(null);
    try {
      setInsights(await fetchInsights());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your progress.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteInsights();
      setConfirmingDelete(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your data.');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderBody = () => {
    if (error) {
      return (
        <div role="alert" className="space-y-3">
          <p className="text-red-200 bg-red-900/40 border border-red-500/50 rounded-lg p-3">{error}</p>
          <button onClick={load} className="py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-white">Try again</button>
        </div>
      );
    }
    if (!insights) {
      return (
        <div role="status" className="flex flex-col items-center justify-center min-h-[200px] text-text-secondary">
          <SpinnerIcon className="w-10 h-10 border-4 border-brand-primary" />
          <p className="mt-4">Loading your progress...</p>
        </div>
      );
    }

    const { totals, skills, gaps, mastered, delivery, nextStep } = insights;
    const hasSpoken = delivery.spokenAnswers > 0;

    return (
      <div className="space-y-8">
        <p className="text-lg text-text-primary">{summarize(insights)}</p>

        <section aria-labelledby="next-step-heading" className="rounded-lg border border-brand-light bg-brand-primary/10 p-4">
          <h3 id="next-step-heading" className="text-sm font-semibold uppercase tracking-wide text-brand-light">Best next step</h3>
          <p className="text-xl font-bold text-text-primary mt-1">{nextStep.title}</p>
          <p className="text-text-secondary mt-1">{nextStep.detail}</p>
        </section>

        <section aria-labelledby="overview-heading">
          <h3 id="overview-heading" className="text-lg font-bold text-text-primary mb-2">Overview</h3>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Practice streak" value={plural(totals.currentStreak, 'day')} note={`Longest: ${plural(totals.longestStreak, 'day')}`} />
            <Stat label="Questions answered" value={String(totals.answers)} note={`Across ${plural(totals.activeDays, 'day')}`} />
            <Stat
              label="Accuracy, last 7 days"
              value={totals.last7Days.accuracy === null ? 'No data' : `${totals.last7Days.accuracy}%`}
              note={totals.accuracyChange === null ? undefined : `${totals.accuracyChange > 0 ? '↑ Up' : totals.accuracyChange < 0 ? '↓ Down' : '→ Same'} ${totals.accuracyChange === 0 ? 'as' : Math.abs(totals.accuracyChange) + ' points vs'} the week before`}
            />
            <Stat label="Spoken answers" value={String(delivery.spokenAnswers)} note={hasSpoken ? undefined : 'Try "Answer out loud"'} />
          </dl>
        </section>

        {skills.length > 0 && (
          <section aria-labelledby="skills-heading">
            <h3 id="skills-heading" className="text-lg font-bold text-text-primary mb-2">Skills</h3>
            <p className="text-sm text-text-muted mb-2">Accuracy counts a partly correct answer as half.</p>
            <ul className="space-y-3">
              {skills.map((skill) => (
                <li key={skill.skillId} className="bg-background-dark/50 rounded-lg p-3">
                  <div className="flex flex-wrap justify-between gap-x-4 text-text-primary">
                    <span className="font-semibold">{skill.name}</span>
                    <span>{skill.accuracy ?? 0}% accuracy · {plural(skill.attempts, 'answer')} · {TREND_TEXT[skill.trend]}</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${skill.name} accuracy`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={skill.accuracy ?? 0}
                    className="mt-2 h-2 rounded-full bg-background-light"
                  >
                    <div className="h-2 rounded-full bg-brand-primary" style={{ width: `${skill.accuracy ?? 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(gaps.length > 0 || mastered.length > 0) && (
          <div className="grid md:grid-cols-2 gap-6">
            <section aria-labelledby="gaps-heading">
              <h3 id="gaps-heading" className="text-lg font-bold text-yellow-400 mb-2">Worth revisiting</h3>
              {gaps.length === 0 ? (
                <p className="text-text-secondary">Nothing outstanding. Nice.</p>
              ) : (
                <ul className="space-y-2">
                  {gaps.map((gap) => (
                    <li key={gap.concept} className="bg-background-dark/50 rounded-lg p-3">
                      <p className="font-semibold text-text-primary">{gap.concept}</p>
                      <p className="text-sm text-text-secondary">Missed {plural(gap.timesMissed, 'time')} · last in {gap.skill}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="mastered-heading">
              <h3 id="mastered-heading" className="text-lg font-bold text-green-400 mb-2">Recently mastered</h3>
              {mastered.length === 0 ? (
                <p className="text-text-secondary">Concepts you used to miss and now get right will show up here.</p>
              ) : (
                <ul className="space-y-2">
                  {mastered.map((m) => (
                    <li key={m.concept} className="bg-background-dark/50 rounded-lg p-3">
                      <p className="font-semibold text-text-primary">{m.concept}</p>
                      <p className="text-sm text-text-secondary">Missed {plural(m.previouslyMissed, 'time')} before, got it on {formatDay(m.masteredAt)} · {m.skill}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <section aria-labelledby="delivery-summary-heading">
          <h3 id="delivery-summary-heading" className="text-lg font-bold text-text-primary mb-2">Speaking delivery</h3>
          {!hasSpoken ? (
            <p className="text-text-secondary">Answer a question out loud and your pace and filler words will be tracked here.</p>
          ) : (
            <>
              <p className="text-text-secondary mb-3">
                {delivery.avgWpm
                  ? `You average ${delivery.avgWpm} words per minute (${delivery.inTypicalRange ? 'in' : 'outside'} the typical 120 to 160 range) and ${delivery.avgFillersPer100} filler words per 100 words`
                  : `You average ${delivery.avgFillersPer100} filler words per 100 words`}
                {delivery.fillerTrend === 'improving' ? ', and that is improving.' : delivery.fillerTrend === 'worsening' ? ', and that has crept up lately.' : '.'}
              </p>
              {delivery.recent && delivery.recent.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="text-left text-text-muted mb-1">Your most recent spoken answers</caption>
                    <thead>
                      <tr className="text-text-muted">
                        <th scope="col" className="py-1 pr-4 font-semibold">Date</th>
                        <th scope="col" className="py-1 pr-4 font-semibold">Words per minute</th>
                        <th scope="col" className="py-1 font-semibold">Filler words per 100</th>
                      </tr>
                    </thead>
                    <tbody className="text-text-primary">
                      {delivery.recent.map((r) => (
                        <tr key={r.at} className="border-t border-background-light">
                          <th scope="row" className="py-1 pr-4 font-normal">{formatDay(r.at)}</th>
                          <td className="py-1 pr-4">{r.wpm ?? 'Too short to judge'}</td>
                          <td className="py-1">{r.fillersPer100}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="privacy-heading" className="border-t border-background-light pt-4">
          <h3 id="privacy-heading" className="text-lg font-bold text-text-primary mb-1">Your data</h3>
          <p className="text-sm text-text-secondary mb-3">
            Progress is built from your answers and the concepts the mentor noted. Recordings are never stored. You can erase your history at any time.
          </p>
          {confirmingDelete ? (
            <div role="alertdialog" aria-label="Confirm delete" className="flex flex-wrap items-center gap-3">
              <p className="text-text-primary">Delete all your practice history? This cannot be undone.</p>
              <button onClick={handleDelete} disabled={isDeleting} className="py-2 px-4 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-500 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white">
                {isDeleting ? 'Deleting...' : 'Yes, delete it'}
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="py-2 px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 focus-visible:ring-2 focus-visible:ring-brand-light">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmingDelete(true)} className="py-2 px-4 rounded-lg bg-background-light text-text-primary font-semibold hover:bg-gray-600 focus-visible:ring-2 focus-visible:ring-brand-light">
              Delete my practice history
            </button>
          )}
        </section>
      </div>
    );
  };

  return (
    <Modal title="Your progress" onClose={onClose} maxWidth="max-w-4xl">
      {renderBody()}
    </Modal>
  );
};

export default ProgressModal;
