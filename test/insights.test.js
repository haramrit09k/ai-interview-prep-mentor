const test = require('node:test');
const assert = require('node:assert/strict');
const { computeInsights } = require('../server/insights');

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
