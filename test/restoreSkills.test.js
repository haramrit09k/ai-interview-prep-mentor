const test = require('node:test');
const assert = require('node:assert/strict');

let restore;
let rating;
test.before(async () => {
  restore = await import('../utils/restoreSkills.ts');
  rating = await import('../utils/rating.ts');
});

const entry = (id, name, answers) => ({ id, name, lastPracticed: '2026-01-01T00:00:00.000Z', answers });

test('the rating is the answers replayed with the same rules the app uses while practising', () => {
  const answers = [['correct', 'Mid-level'], ['correct', 'Mid-level'], ['partially_correct', 'Expert'], ['incorrect', 'Entry-level'], ['idk', null]];
  const [skill] = restore.skillsFromHistory([entry('s1', 'Python', answers)], [], 5);
  let expected = 0;
  for (const [outcome, level] of answers) expected = rating.updateRating(expected, outcome, level);
  assert.deepEqual(skill, { id: 's1', name: 'Python', rating: expected });
  assert.ok(skill.rating > 0);
});

test('the original id is kept, so the history and Review sheet reconnect', () => {
  const [skill] = restore.skillsFromHistory([entry('original-id-123', 'SQL', [['correct', 'Mid-level']])], [], 5);
  assert.equal(skill.id, 'original-id-123');
});

test('skills that are already there are left alone, by id or by name', () => {
  const existing = [{ id: 'a', name: 'Python', rating: 40 }];
  const history = [
    entry('a', 'Python', [['correct', 'Mid-level']]),            // same id
    entry('b', ' python ', [['correct', 'Mid-level']]),          // same name, different spelling
    entry('c', 'Java', [['correct', 'Mid-level']]),
  ];
  assert.deepEqual(restore.skillsFromHistory(history, existing, 5).map((s) => s.id), ['c']);
});

test('no more than the skill limit are brought back, most recent first', () => {
  const history = ['A', 'B', 'C', 'D'].map((n) => entry(n.toLowerCase(), n, [['correct', 'Mid-level']]));
  assert.deepEqual(restore.skillsFromHistory(history, [], 2).map((s) => s.name), ['A', 'B']);
  assert.deepEqual(restore.skillsFromHistory(history, [{ id: 'x', name: 'X', rating: 0 }], 2).map((s) => s.name), ['A']);
  assert.deepEqual(restore.skillsFromHistory(history, [{ id: 'x', name: 'X', rating: 0 }, { id: 'y', name: 'Y', rating: 0 }], 2), []);
});

test('bad data from the server is skipped rather than breaking the list', () => {
  const history = [
    null,
    { id: 5, name: 'Wrong id type', answers: [] },
    entry('ok', 'Go', [['correct', 'Mid-level'], ['wizard', 'Mid-level'], ['correct', 'Grandmaster']]),
    entry('long', 'x'.repeat(200), []),
    entry('blank', '   ', []),
  ];
  const result = restore.skillsFromHistory(history, [], 10);
  assert.deepEqual(result.map((s) => s.id), ['ok', 'long']);
  // the unknown outcome is ignored, the unknown level is treated as Mid-level
  assert.equal(result[0].rating, rating.updateRating(rating.updateRating(0, 'correct', 'Mid-level'), 'correct', 'Mid-level'));
  assert.equal(result[1].name.length, 60);
  assert.equal(result[1].rating, 0);
});

test('guest skills and their custom questions come across to the account', () => {
  const guestSkills = [{ id: 'g1', name: 'Python', rating: 35 }, { id: 'g2', name: 'SQL', rating: 12.6 }];
  const guestQuestions = [
    { id: 'q1', skillId: 'g1', text: 'What is a decorator?', answer: 'A function wrapper', source: 'custom' },
    { id: 'q2', skillId: 'g2', text: 'What is a join?', source: 'custom' },
    { id: 'q3', skillId: 'not-kept', text: 'Orphan', source: 'custom' },
  ];
  const { skills, questions } = restore.skillsFromGuest(guestSkills, guestQuestions, [], 5);
  assert.deepEqual(skills, [{ id: 'g1', name: 'Python', rating: 35 }, { id: 'g2', name: 'SQL', rating: 13 }]);
  assert.deepEqual(questions.map((q) => q.id), ['q1', 'q2']); // the question for a skill that was not carried is dropped
  assert.equal(questions[0].answer, 'A function wrapper');
  assert.equal(questions[1].answer, undefined);
});

test('guest skills respect what the account already has and the skill limit', () => {
  const existing = [{ id: 'a1', name: 'python', rating: 50 }];
  const guestSkills = [{ id: 'g1', name: 'Python', rating: 35 }, { id: 'g2', name: 'SQL', rating: 10 }, { id: 'g3', name: 'Go', rating: 10 }];
  const { skills, questions } = restore.skillsFromGuest(guestSkills, [{ id: 'q1', skillId: 'g1', text: 'x' }], existing, 2);
  assert.deepEqual(skills.map((s) => s.id), ['g2']); // same name as an existing skill is skipped, and only one slot is left
  assert.deepEqual(questions, []);
});

test('bad guest data is dropped and ratings are kept in range', () => {
  const guestSkills = [null, { id: 1, name: 'x' }, { id: 'ok', name: '  Rust ', rating: 250 }, { id: 'neg', name: 'C', rating: -5 }, { id: 'nan', name: 'D', rating: 'high' }];
  const { skills } = restore.skillsFromGuest(guestSkills, 'not an array', [], 10);
  assert.deepEqual(skills, [{ id: 'ok', name: 'Rust', rating: 100 }, { id: 'neg', name: 'C', rating: 0 }, { id: 'nan', name: 'D', rating: 0 }]);
  assert.deepEqual(restore.skillsFromGuest('nope', null, [], 5), { skills: [], questions: [] });
});
