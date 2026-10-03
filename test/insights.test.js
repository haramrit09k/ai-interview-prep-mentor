const test = require('node:test');
const assert = require('node:assert/strict');
const { computeInsights, computeSkillReview } = require('../server/insights');

const NOW = Date.parse('2026-03-18T12:00:00Z'); // a Wednesday
const daysAgo = (n, hour = 9) => new Date(NOW - n * 86_400_000 + (hour - 12) * 3_600_000).toISOString();

let id = 0;
const row = (overrides) => ({
  id: String(++id),
  skill_id: 's1',
  skill_name: 'Java',
  question_text: 'q',
  outcome: 'correct',
  concepts_known: '[]',
  concepts_to_review: '[]',
  wpm: null,
  word_count: null,
  filler_count: null,
  answered_at: daysAgo(0),
  ...overrides,
});

test('empty log suggests starting', () => {
  const result = computeInsights([], { now: NOW });
  assert.equal(result.totals.answers, 0);
  assert.equal(result.nextStep.type, 'start');
  assert.deepEqual(result.delivery, { spokenAnswers: 0 });
});

test('accuracy gives partial credit and treats idk as zero', () => {
  const rows = [row({ outcome: 'correct' }), row({ outcome: 'partially_correct' }), row({ outcome: 'idk' }), row({ outcome: 'incorrect' })];
  assert.equal(computeInsights(rows, { now: NOW }).skills[0].accuracy, 38); // (1 + .5) / 4
});

test('streak counts consecutive days and survives a missed today', () => {
  const rows = [daysAgo(1), daysAgo(2), daysAgo(3), daysAgo(6)].map((d) => row({ answered_at: d }));
  const { totals } = computeInsights(rows, { now: NOW });
  assert.equal(totals.currentStreak, 3); // yesterday back to three days ago
  assert.equal(totals.practicedToday, false);
  assert.equal(totals.longestStreak, 3);
});

test('streak breaks after a two day gap', () => {
  const rows = [daysAgo(3), daysAgo(4)].map((d) => row({ answered_at: d }));
  assert.equal(computeInsights(rows, { now: NOW }).totals.currentStreak, 0);
});

test('days are bucketed in the users time zone', () => {
  // 23:30 UTC on the 17th is already the 18th for someone at UTC+2 (offset -120).
  const rows = [row({ answered_at: '2026-03-17T23:30:00Z' })];
  const utc = computeInsights(rows, { now: NOW, tzOffsetMinutes: 0 });
  const ahead = computeInsights(rows, { now: NOW, tzOffsetMinutes: -120 });
  assert.equal(utc.totals.practicedToday, false);
  assert.equal(ahead.totals.practicedToday, true);
});

test('week over week accuracy change', () => {
  const rows = [
    row({ outcome: 'incorrect', answered_at: daysAgo(10) }),
    row({ outcome: 'incorrect', answered_at: daysAgo(9) }),
    row({ outcome: 'correct', answered_at: daysAgo(2) }),
    row({ outcome: 'correct', answered_at: daysAgo(1) }),
  ];
  const { totals, skills } = computeInsights(rows, { now: NOW });
  assert.equal(totals.last7Days.accuracy, 100);
  assert.equal(totals.previous7Days.accuracy, 0);
  assert.equal(totals.accuracyChange, 100);
  assert.equal(skills[0].trend, 'up');
});

test('recurring gaps are ranked and resolved concepts become mastered', () => {
  const rows = [
    row({ concepts_to_review: '["Garbage Collection","Generics"]', answered_at: daysAgo(5) }),
    row({ concepts_to_review: '["garbage collection"]', answered_at: daysAgo(4) }),
    row({ concepts_known: '["Generics"]', answered_at: daysAgo(2) }),
  ];
  const { gaps, mastered } = computeInsights(rows, { now: NOW });
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].concept, 'Garbage Collection');
  assert.equal(gaps[0].timesMissed, 2);
  assert.equal(mastered.length, 1);
  assert.equal(mastered[0].concept, 'Generics');
});

test('next step prefers a recurring gap', () => {
  const rows = [
    row({ concepts_to_review: '["Closures"]', answered_at: daysAgo(3) }),
    row({ concepts_to_review: '["closures"]', answered_at: daysAgo(2) }),
  ];
  const { nextStep } = computeInsights(rows, { now: NOW });
  assert.equal(nextStep.type, 'gap');
  assert.match(nextStep.title, /Closures/);
});

test('next step flags a weak skill after enough attempts', () => {
  const rows = [1, 2, 3].map((n) => row({ outcome: 'incorrect', answered_at: daysAgo(n) }));
  assert.equal(computeInsights(rows, { now: NOW }).nextStep.type, 'skill');
});

test('delivery summary and filler advice', () => {
  const rows = [1, 2, 3].map((n) =>
    row({ outcome: 'correct', answered_at: daysAgo(n), wpm: 150, word_count: 100, filler_count: 8 })
  );
  const { delivery, nextStep } = computeInsights(rows, { now: NOW });
  assert.equal(delivery.spokenAnswers, 3);
  assert.equal(delivery.avgWpm, 150);
  assert.equal(delivery.inTypicalRange, true);
  assert.equal(delivery.avgFillersPer100, 8);
  assert.equal(nextStep.type, 'delivery');
});

test('typed answers do not affect delivery stats', () => {
  const { delivery } = computeInsights([row({}), row({})], { now: NOW });
  assert.equal(delivery.spokenAnswers, 0);
});

test('tolerates malformed concept JSON', () => {
  const result = computeInsights([row({ concepts_known: 'not json', concepts_to_review: null })], { now: NOW });
  assert.deepEqual(result.gaps, []);
});

test('the same concept written differently is counted as one gap', () => {
  const variants = ['Garbage Collection', 'garbage collection (GC)', 'The Garbage-Collection!', 'Garbage  Collection.'];
  const rows = variants.map((v, i) => row({ concepts_to_review: JSON.stringify([v]), answered_at: daysAgo(4 - i) }));
  const { gaps } = computeInsights(rows, { now: NOW });
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].timesMissed, 4);
});

test('ampersands, slashes and hyphens match their spelled-out forms', () => {
  const rows = [
    row({ concepts_to_review: '["Read & Write Locks"]', answered_at: daysAgo(3) }),
    row({ concepts_to_review: '["read and write locks"]', answered_at: daysAgo(2) }),
    row({ concepts_known: '["Read-Write Locks"]', answered_at: daysAgo(1) }),
  ];
  // "Read-Write Locks" is a different concept than "read and write locks", so it does not resolve the gap
  const { gaps } = computeInsights(rows, { now: NOW });
  assert.equal(gaps[0].timesMissed, 2);
});

test('c++ and c# are not collapsed into "c"', () => {
  const rows = [
    row({ concepts_to_review: '["C++"]', answered_at: daysAgo(2) }),
    row({ concepts_known: '["C"]', answered_at: daysAgo(1) }),
  ];
  const { gaps, mastered } = computeInsights(rows, { now: NOW });
  assert.equal(gaps.length, 1);
  assert.equal(mastered.length, 0);
});

// ---------- per skill study sheet ----------

test('study sheet for no data', () => {
  const review = computeSkillReview([], { now: NOW });
  assert.equal(review.hasData, false);
  assert.deepEqual(review.retry, []);
  assert.equal(review.totalToRetry, 0);
});

test('study sheet: counts, accuracy and dates', () => {
  const rows = [
    row({ outcome: 'correct', answered_at: daysAgo(5) }),
    row({ outcome: 'partially_correct', answered_at: daysAgo(3) }),
    row({ outcome: 'incorrect', answered_at: daysAgo(1) }),
    row({ outcome: 'idk', answered_at: daysAgo(1, 10) }),
  ];
  const review = computeSkillReview(rows, { now: NOW });
  assert.deepEqual(review.counts, { answers: 4, correct: 1, partial: 1, missed: 2 });
  assert.equal(review.skill.accuracy, 38); // (1 + .5 + 0 + 0) / 4
  assert.equal(review.skill.firstPracticed, daysAgo(5));
  assert.equal(review.skill.lastPracticed, daysAgo(1, 10));
});

test('retry list: latest result per question, serious misses first, longest ago first', () => {
  const rows = [
    row({ question_text: 'fixed later', outcome: 'incorrect', answered_at: daysAgo(9) }),
    row({ question_text: 'fixed later', outcome: 'correct', answered_at: daysAgo(2) }),   // no longer a problem
    row({ question_text: 'partly', outcome: 'partially_correct', answered_at: daysAgo(8), level: 'Expert' }),
    row({ question_text: 'missed recently', outcome: 'incorrect', answered_at: daysAgo(1) }),
    row({ question_text: 'skipped long ago', outcome: 'idk', answered_at: daysAgo(7) }),
    row({ question_text: 'solid', outcome: 'correct', answered_at: daysAgo(6) }),
  ];
  const { retry, totalToRetry } = computeSkillReview(rows, { now: NOW });
  assert.deepEqual(retry.map((r) => r.text), ['skipped long ago', 'missed recently', 'partly']);
  assert.equal(totalToRetry, 3);
  assert.equal(retry[2].level, 'Expert');
  assert.equal(retry[0].level, null);
});

test('retry list counts how often a question was missed', () => {
  const rows = [
    row({ question_text: 'again and again', outcome: 'incorrect', answered_at: daysAgo(6) }),
    row({ question_text: 'again and again', outcome: 'idk', answered_at: daysAgo(4) }),
    row({ question_text: 'again and again', outcome: 'partially_correct', answered_at: daysAgo(3) }),
    row({ question_text: 'again and again', outcome: 'incorrect', answered_at: daysAgo(2) }),
  ];
  const { retry } = computeSkillReview(rows, { now: NOW });
  assert.equal(retry.length, 1);
  assert.equal(retry[0].timesMissed, 3); // the partly right attempt is not counted as a miss
});

test('retry list is capped at 10 but reports the full count', () => {
  const rows = Array.from({ length: 15 }, (_, i) => row({ question_text: `q ${i}`, outcome: 'incorrect', answered_at: daysAgo(10 - (i % 5)) }));
  const review = computeSkillReview(rows, { now: NOW });
  assert.equal(review.retry.length, 10);
  assert.equal(review.totalToRetry, 15);
});

test('study sheet shows more concepts than the overview does', () => {
  const rows = Array.from({ length: 7 }, (_, i) => row({ concepts_to_review: JSON.stringify([`Concept ${i}`]), answered_at: daysAgo(i) }));
  assert.equal(computeInsights(rows, { now: NOW }).gaps.length, 5);
  assert.equal(computeSkillReview(rows, { now: NOW }).gaps.length, 7);
});
