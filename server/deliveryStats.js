// Delivery coaching for spoken answers. Everything here is plain arithmetic on the
// transcript, not a model call, so the numbers are repeatable and easy to explain.

// Rough guide for conversational speech in English. It is a guideline, not a rule.
const PACE_BANDS = [
  { max: 100, label: 'slow', text: 'on the slower side' },
  { max: 120, label: 'relaxed', text: 'relaxed' },
  { max: 160, label: 'steady', text: 'in the typical range for interviews' },
  { max: 180, label: 'brisk', text: 'a little fast' },
  { max: Infinity, label: 'fast', text: 'fast' },
];

const MIN_SECONDS_FOR_PACE = 5;
const MIN_WORDS_FOR_PACE = 10;
const MAX_SECONDS = 180;

// Sounds people make while thinking. Always counted.
const HESITATIONS = ['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'ah', 'hmm', 'hm'];
// Phrases that are often filler. "like" is handled separately because it is usually a real word.
const FILLER_PHRASES = ['you know', 'i mean', 'sort of', 'kind of', 'basically', 'literally', 'actually'];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const countWords = (text) =>
  (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

const countMatches = (text, pattern) => (text.match(pattern) || []).length;

function findFillers(transcript) {
  const text = transcript.toLowerCase();
  const found = [];

  for (const word of HESITATIONS) {
    const count = countMatches(text, new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(word)}(?![\\p{L}\\p{N}])`, 'gu'));
    if (count) found.push({ word, count });
  }
  for (const phrase of FILLER_PHRASES) {
    const count = countMatches(text, new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(phrase)}(?![\\p{L}\\p{N}])`, 'gu'));
    if (count) found.push({ word: phrase, count });
  }
  // "like" only counts when it is set off by commas, e.g. "it's, like, a hash map".
  const likeCount = countMatches(text, /,\s*like\b|\blike\s*,/gu);
  if (likeCount) found.push({ word: 'like', count: likeCount });

  // Merge spellings of the same sound so "um" and "umm" show as one line.
  const merged = new Map();
  for (const { word, count } of found) {
    const key = word.replace(/(.)\1+$/u, '$1');
    merged.set(key, (merged.get(key) || 0) + count);
  }
  return [...merged.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

function paceBand(wpm) {
  return PACE_BANDS.find((band) => wpm < band.max);
}

function buildTips({ wpm, paceLabel, fillerPer100, fillerTotal, wordCount }) {
  const tips = [];
  if (wpm === null) {
    tips.push('This answer was too short to judge your pace. Try a fuller answer of at least 20 seconds.');
  } else if (paceLabel === 'slow' || paceLabel === 'relaxed') {
    tips.push('Your pace is calm. If you pause a lot, check that you are not losing the listener, and aim for a steady flow.');
  } else if (paceLabel === 'brisk' || paceLabel === 'fast') {
    tips.push('You spoke quickly. Pause for a breath between points so the interviewer can follow.');
  } else {
    tips.push('Your pace is in a comfortable range. Keep it up.');
  }
  if (wordCount >= MIN_WORDS_FOR_PACE) {
    if (fillerTotal === 0) {
      tips.push('No filler words detected. Nicely done.');
    } else if (fillerPer100 > 4) {
      tips.push('Filler words came up often. When you feel one coming, try a short silent pause instead. Silence sounds more confident than "um".');
    } else {
      tips.push('A few filler words slipped in. That is normal, and a brief pause works as a replacement.');
    }
  }
  return tips;
}

/**
 * @param {string} transcript Verbatim transcript of the answer.
 * @param {number} durationMs How long the recording ran, in milliseconds.
 */
function analyzeDelivery(transcript, durationMs) {
  const text = typeof transcript === 'string' ? transcript : '';
  const seconds = Math.min(Math.max(Number(durationMs) || 0, 0) / 1000, MAX_SECONDS);
  const wordCount = countWords(text);

  const canJudgePace = seconds >= MIN_SECONDS_FOR_PACE && wordCount >= MIN_WORDS_FOR_PACE;
  const wpm = canJudgePace ? Math.round(wordCount / (seconds / 60)) : null;
  const band = wpm === null ? null : paceBand(wpm);

  const fillers = findFillers(text);
  const fillerTotal = fillers.reduce((sum, f) => sum + f.count, 0);
  const fillerPer100 = wordCount > 0 ? Math.round((fillerTotal / wordCount) * 1000) / 10 : 0;

  const stats = {
    durationSec: Math.round(seconds),
    wordCount,
    wpm,
    paceLabel: band ? band.label : null,
    paceText: band ? band.text : null,
    fillerTotal,
    fillerPer100,
    fillers,
  };
  stats.tips = buildTips({ ...stats });
  return stats;
}

/** Accepts delivery numbers sent back by the client and keeps only sane values. */
function sanitizeDelivery(input) {
  if (!input || typeof input !== 'object') return null;
  const num = (v, max) => (Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);
  const durationSec = num(input.durationSec, MAX_SECONDS);
  const wordCount = num(input.wordCount, 3000);
  if (durationSec === null || wordCount === null) return null;
  return {
    durationSec,
    wordCount,
    wpm: num(input.wpm, 400),
    fillerTotal: num(input.fillerTotal, 500) ?? 0,
  };
}

module.exports = { analyzeDelivery, sanitizeDelivery, countWords, MAX_SECONDS };
