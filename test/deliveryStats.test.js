const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeDelivery, sanitizeDelivery, countWords } = require('../server/deliveryStats');

const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

test('counts words, ignoring punctuation', () => {
  assert.equal(countWords("A closure, um, is a function. It's useful!"), 8);
  assert.equal(countWords(''), 0);
});

test('computes words per minute from duration', () => {
  const stats = analyzeDelivery(words(140), 60_000);
  assert.equal(stats.wpm, 140);
  assert.equal(stats.paceLabel, 'steady');
});

test('labels slow and fast pace', () => {
  assert.equal(analyzeDelivery(words(60), 60_000).paceLabel, 'slow');
  assert.equal(analyzeDelivery(words(200), 60_000).paceLabel, 'fast');
});

test('does not judge pace for very short answers', () => {
  const short = analyzeDelivery('too short', 3_000);
  assert.equal(short.wpm, null);
  assert.equal(short.paceLabel, null);
  assert.match(short.tips[0], /too short/);
});

test('counts hesitation sounds and filler phrases', () => {
  const stats = analyzeDelivery(
    'So um a hash map is, you know, basically uh a key value store and umm it is fast',
    20_000
  );
  const byWord = Object.fromEntries(stats.fillers.map((f) => [f.word, f.count]));
  assert.equal(byWord.um, 2); // um + umm merged
  assert.equal(byWord.uh, 1);
  assert.equal(byWord['you know'], 1);
  assert.equal(byWord.basically, 1);
  assert.equal(stats.fillerTotal, 5);
});

test('only counts "like" when it is set off by commas', () => {
  assert.equal(analyzeDelivery('I would use a tree like a trie for this problem today', 10_000).fillerTotal, 0);
  assert.equal(analyzeDelivery("It's, like, a tree that stores prefixes for fast lookup", 10_000).fillerTotal, 1);
});

test('does not match fillers inside other words', () => {
  assert.equal(analyzeDelivery('Humming and summer album literally 2 times', 10_000).fillers.some((f) => f.word === 'um'), false);
});

test('reports no fillers positively', () => {
  const stats = analyzeDelivery(words(60), 30_000);
  assert.equal(stats.fillerTotal, 0);
  assert.ok(stats.tips.some((t) => /No filler words/.test(t)));
});

test('clamps absurd durations', () => {
  assert.equal(analyzeDelivery(words(50), 99_999_999).durationSec, 180);
  assert.equal(analyzeDelivery(words(50), -5).durationSec, 0);
});

test('sanitizeDelivery rejects junk and keeps sane numbers', () => {
  assert.equal(sanitizeDelivery(null), null);
  assert.equal(sanitizeDelivery({ durationSec: 'x', wordCount: 5 }), null);
  assert.equal(sanitizeDelivery({ durationSec: 99999, wordCount: 5 }), null);
  assert.deepEqual(sanitizeDelivery({ durationSec: 30, wordCount: 70, wpm: 140, fillerTotal: 2 }), {
    durationSec: 30, wordCount: 70, wpm: 140, fillerTotal: 2,
  });
});
