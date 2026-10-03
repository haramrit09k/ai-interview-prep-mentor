import React from 'react';
import type { DeliveryStats } from '../types';

const SCALE_MIN = 60;
const SCALE_MAX = 220;
const TYPICAL_LOW = 120;
const TYPICAL_HIGH = 160;
const toPercent = (wpm: number) => Math.max(0, Math.min(100, ((wpm - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));

const DeliveryCard: React.FC<{ stats: DeliveryStats }> = ({ stats }) => {
  const minutes = Math.floor(stats.durationSec / 60);
  const seconds = String(stats.durationSec % 60).padStart(2, '0');
  const paceSentence =
    stats.wpm === null
      ? 'Too short to judge your pace.'
      : `${stats.wpm} words per minute, which is ${stats.paceText}.`;
  const fillerSentence =
    stats.fillerTotal === 0
      ? 'No filler words detected.'
      : `${stats.fillerTotal} filler ${stats.fillerTotal === 1 ? 'word' : 'words'} (${stats.fillerPer100} per 100 words).`;

  return (
    <section aria-labelledby="delivery-heading" className="bg-background-dark/50 p-3 sm:p-4 rounded-lg space-y-4">
      <h3 id="delivery-heading" className="text-lg sm:text-xl font-bold text-text-primary">How you sounded</h3>
      <p className="text-sm text-text-muted">
        {minutes}:{seconds} spoken, {stats.wordCount} words. These are estimates from the transcript.
      </p>

      <div>
        <h4 className="font-semibold text-text-primary">Pace</h4>
        <p className="text-text-secondary">{paceSentence}</p>
        {stats.wpm !== null && (
          <div
            role="img"
            aria-label={`Pace scale from ${SCALE_MIN} to ${SCALE_MAX} words per minute. Typical interview range is ${TYPICAL_LOW} to ${TYPICAL_HIGH}. You spoke at ${stats.wpm}.`}
            className="mt-2"
          >
            <div className="relative h-3 rounded-full bg-background-light">
              <div
                className="absolute inset-y-0 rounded-full bg-brand-primary/50 border border-brand-light"
                style={{ left: `${toPercent(TYPICAL_LOW)}%`, width: `${toPercent(TYPICAL_HIGH) - toPercent(TYPICAL_LOW)}%` }}
              />
              <div
                className="absolute -top-1 w-1.5 h-5 rounded bg-white"
                style={{ left: `calc(${toPercent(stats.wpm)}% - 3px)` }}
              />
            </div>
            <div className="flex justify-between text-xs text-text-muted mt-1" aria-hidden="true">
              <span>{SCALE_MIN}</span>
              <span>Typical {TYPICAL_LOW} to {TYPICAL_HIGH}</span>
              <span>{SCALE_MAX}</span>
            </div>
          </div>
        )}
      </div>

      <div>
        <h4 className="font-semibold text-text-primary">Filler words</h4>
        <p className="text-text-secondary">{fillerSentence}</p>
        {stats.fillers.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-2">
            {stats.fillers.map((f) => (
              <li key={f.word} className="text-sm bg-background-light text-text-primary rounded-full px-3 py-1">
                "{f.word}" × {f.count}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="font-semibold text-text-primary">What to try next</h4>
        <ul className="list-disc pl-5 text-text-secondary space-y-1">
          {stats.tips.map((tip) => <li key={tip}>{tip}</li>)}
        </ul>
      </div>
    </section>
  );
};

export default DeliveryCard;
