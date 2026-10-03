const test = require('node:test');
const assert = require('node:assert/strict');

let rating;
test.before(async () => {
  rating = await import('../utils/rating.ts');
});

const play = (start, outcome, level, times) => {
  let value = start;
  for (let i = 0; i < times; i++) value = rating.updateRating(value, outcome, level);
  return value;
};

test('Mid-level keeps the original +10 / +5 / -5, so nothing changes for existing habits', () => {
  assert.equal(rating.ratingChange('correct', 'Mid-level'), 10);
  assert.equal(rating.ratingChange('partially_correct', 'Mid-level'), 5);
  assert.equal(rating.ratingChange('incorrect', 'Mid-level'), -5);
  assert.equal(rating.ratingChange('idk', 'Mid-level'), -5);
});

test('easy questions earn less and cost more, hard ones the reverse', () => {
  assert.deepEqual(['correct', 'partially_correct', 'incorrect', 'idk'].map((o) => rating.ratingChange(o, 'Entry-level')), [5, 3, -8, -8]);
  assert.deepEqual(['correct', 'partially_correct', 'incorrect', 'idk'].map((o) => rating.ratingChange(o, 'Expert')), [15, 8, -3, -3]);
});

test('questions with no recorded level are treated as Mid-level', () => {
  for (const level of [undefined, null, '', 'Wizard']) {
    assert.equal(rating.ratingChange('correct', level), 10);
    assert.equal(rating.updateRating(50, 'incorrect', level), 45);
  }
});

test('the original problem: ten perfect Entry-level answers used to give 100, now they stop at the Entry ceiling', () => {
  assert.equal(play(0, 'correct', 'Entry-level', 10), 40);
  assert.equal(play(0, 'correct', 'Entry-level', 100), 40);
});

test('Mid-level answers stop at 75, and only Expert answers reach 100', () => {
  assert.equal(play(0, 'correct', 'Mid-level', 50), 75);
  assert.equal(play(75, 'correct', 'Mid-level', 5), 75);
  assert.equal(play(75, 'correct', 'Expert', 2), 100);
  assert.equal(play(0, 'correct', 'Expert', 50), 100);
});

test('a gain is capped at the ceiling, not skipped, when it would overshoot', () => {
  assert.equal(rating.updateRating(38, 'correct', 'Entry-level'), 40); // +5 would be 43
  assert.equal(rating.updateRating(72, 'correct', 'Mid-level'), 75);   // +10 would be 82
  assert.equal(rating.updateRating(95, 'correct', 'Expert'), 100);     // +15 would be 110
});

test('above a level\'s ceiling, easier answers neither raise nor lower the rating when right', () => {
  assert.equal(rating.updateRating(60, 'correct', 'Entry-level'), 60);
  assert.equal(rating.updateRating(60, 'partially_correct', 'Entry-level'), 60);
  assert.equal(rating.updateRating(90, 'correct', 'Mid-level'), 90);
});

test('misses still lower the rating, and hurt more on easy questions', () => {
  assert.equal(rating.updateRating(60, 'incorrect', 'Entry-level'), 52);
  assert.equal(rating.updateRating(60, 'incorrect', 'Mid-level'), 55);
  assert.equal(rating.updateRating(60, 'incorrect', 'Expert'), 57);
  assert.equal(rating.updateRating(60, 'idk', 'Entry-level'), 52);
});

test('the rating never goes below 0 or above 100', () => {
  assert.equal(play(3, 'incorrect', 'Entry-level', 5), 0);
  assert.equal(play(98, 'correct', 'Expert', 5), 100);
  assert.equal(rating.updateRating(0, 'idk', 'Mid-level'), 0);
});

test('ratings stay whole numbers', () => {
  for (const level of ['Entry-level', 'Mid-level', 'Expert']) {
    for (const outcome of ['correct', 'partially_correct', 'incorrect', 'idk']) {
      for (let start = 0; start <= 100; start += 7) {
        assert.ok(Number.isInteger(rating.updateRating(start, outcome, level)), `${level} ${outcome} from ${start}`);
      }
    }
  }
});

test('an honest climb: consistent Mid-level success reaches 75 in 8 answers, a first Expert answer then moves it', () => {
  assert.equal(play(0, 'correct', 'Mid-level', 8), 75);
  assert.equal(rating.updateRating(75, 'correct', 'Expert'), 90);
});

test('isAtCeiling tells the UI when a level can no longer help', () => {
  assert.equal(rating.isAtCeiling(40, 'Entry-level'), true);
  assert.equal(rating.isAtCeiling(39, 'Entry-level'), false);
  assert.equal(rating.isAtCeiling(75, 'Mid-level'), true);
  assert.equal(rating.isAtCeiling(99, 'Expert'), false);
  assert.equal(rating.isAtCeiling(100, 'Expert'), true);
  assert.equal(rating.isAtCeiling(75, undefined), true); // unknown level counts as Mid-level
});
