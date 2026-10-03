const test = require('node:test');
const assert = require('node:assert/strict');

// Use an in-memory SQLite database. The module reads this at load time.
process.env.SQLITE_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { insertAnswer, listAnswers, deleteAnswers } = require('../server/answerLog');

const sample = (overrides = {}) => ({
  userId: 'u1',
  skillId: 's1',
  skillName: 'Java',
  questionText: 'What is a closure?',
  outcome: 'correct',
  conceptsKnown: ['scope'],
  conceptsToReview: [],
  delivery: null,
  ...overrides,
});

test('stores, lists in time order, and isolates users', async () => {
  await new Promise((r) => setTimeout(r, 200)); // let schema creation finish
  await insertAnswer(sample());
  await insertAnswer(sample({ outcome: 'incorrect', delivery: { durationSec: 30, wordCount: 70, wpm: 140, fillerTotal: 2 } }));
  await insertAnswer(sample({ userId: 'someone-else' }));

  const rows = await listAnswers('u1');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].outcome, 'correct');
  assert.equal(rows[1].wpm, 140);
  assert.deepEqual(JSON.parse(rows[0].concepts_known), ['scope']);
  assert.equal((await listAnswers('someone-else')).length, 1);
});

test('deleting removes only that users rows', async () => {
  await deleteAnswers('u1');
  assert.equal((await listAnswers('u1')).length, 0);
  assert.equal((await listAnswers('someone-else')).length, 1);
});

test('clips oversized and malformed input', async () => {
  await insertAnswer(sample({ userId: 'u2', questionText: 'x'.repeat(5000), conceptsKnown: ['a'.repeat(500), 42, null] }));
  const [row] = await listAnswers('u2');
  assert.equal(row.question_text.length, 1000);
  const known = JSON.parse(row.concepts_known);
  assert.equal(known.length, 1);
  assert.equal(known[0].length, 100);
});

const { recentQuestions } = require('../server/answerLog');

test('recentQuestions: newest first, no duplicates, per skill, bounded', async () => {
  const base = { userId: 'rq', skillName: 'Java', outcome: 'correct', conceptsKnown: [], conceptsToReview: [] };
  for (const [skillId, text] of [['java', 'q1'], ['java', 'q2'], ['go', 'go-q'], ['java', 'q1'], ['java', 'q3']]) {
    await insertAnswer({ ...base, skillId, questionText: text });
    await new Promise((r) => setTimeout(r, 5)); // distinct timestamps
  }
  assert.deepEqual(await recentQuestions('rq', 'java', 10), ['q3', 'q1', 'q2']);
  assert.deepEqual(await recentQuestions('rq', 'go', 10), ['go-q']);
  assert.deepEqual(await recentQuestions('rq', 'java', 2), ['q3', 'q1']);
  assert.deepEqual(await recentQuestions('nobody', 'java', 10), []);
});
