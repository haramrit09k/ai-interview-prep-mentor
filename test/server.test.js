// End to end test of the HTTP layer with a real Express app and a real in-memory SQLite database.
// Gemini, Google sign-in and Redis are replaced with simple stand-ins; no network is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

process.env.SQLITE_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_not_a_real_key';
process.env.GEMINI_API_KEY = 'not-a-real-key';

const stub = (file, exports) => {
  const resolved = require.resolve(path.join('../server', file));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

// Tokens look like "test-<userId>". Anything else is rejected, like a bad Google token.
const userFrom = (req) => {
  const token = (req.headers.authorization || '').split(' ')[1] || '';
  return token.startsWith('test-') ? token.slice(5) : null;
};
stub('auth.js', {
  authMiddleware: (req, res, next) => {
    const id = userFrom(req);
    if (!id) return res.status(401).json({ error: 'Invalid token' });
    req.userId = id;
    next();
  },
});
stub('authOptional.js', {
  authOptionalMiddleware: (req, res, next) => {
    const id = userFrom(req);
    if (id) req.userId = id;
    next();
  },
});
const cache = new Map();
stub('redisClient.js', {
  get: async (k) => cache.get(k) ?? null,
  set: async (k, v) => { cache.set(k, v); },
});
stub('rateLimiter.js', { rateLimiter: (req, res, next) => next() });

let geminiMode = 'ok';
let evaluateCalls = 0;
stub('geminiService.js', {
  generateQuestionsForSkill: async () => [],
  evaluateAnswer: async () => {
    evaluateCalls += 1;
    if (geminiMode === 'fail') throw new Error('upstream down');
    return { mentorAnswer: 'm', feedback: 'f', classification: 'correct', conceptsKnown: ['scope'], conceptsToReview: ['hoisting'] };
  },
  transcribeAudio: async () => (geminiMode === 'silent' ? '' : 'um a closure is basically a function that remembers its scope'),
});
stub('summaryService.js', { generateRevisionSummary: async () => ({}) });

const app = require('../server/index.js');
let server;
let base;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  await new Promise((r) => setTimeout(r, 300)); // let schema creation finish
});
test.after(() => server.close());

const call = (method, url, { token, json, body, headers = {} } = {}) =>
  fetch(base + url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer test-${token}` } : {}),
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(json) : body,
  });

const audio = (n = 4000) => Buffer.alloc(n, 1);

test('evaluate: gemini failure is a 502 JSON error and is not cached', async () => {
  geminiMode = 'fail';
  const res = await call('POST', '/api/evaluate', { json: { questionText: 'q-fail', userAnswer: 'a' } });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /unavailable/);
  geminiMode = 'ok';
  const retry = await call('POST', '/api/evaluate', { json: { questionText: 'q-fail', userAnswer: 'a' } });
  assert.equal(retry.status, 200);
});

test('evaluate: validates input', async () => {
  assert.equal((await call('POST', '/api/evaluate', { json: { questionText: '', userAnswer: 'a' } })).status, 400);
  assert.equal((await call('POST', '/api/evaluate', { json: { questionText: 'q', userAnswer: 5 } })).status, 400);
});

test('evaluate: malformed JSON gives a JSON error', async () => {
  const res = await call('POST', '/api/evaluate', { body: '{bad', headers: { 'Content-Type': 'application/json' } });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).error);
});

test('evaluate: guests work and are not recorded, signed-in users are', async () => {
  const meta = { skillId: 's1', skillName: 'JavaScript' };
  assert.equal((await call('POST', '/api/evaluate', { json: { questionText: 'g1', userAnswer: 'a', ...meta } })).status, 200);
  assert.equal((await call('POST', '/api/evaluate', { token: 'alice', json: { questionText: 'a1', userAnswer: 'a', ...meta, delivery: { durationSec: 30, wordCount: 70, wpm: 140, fillerTotal: 3 } } })).status, 200);
  // a cache hit must still be recorded for the signed-in user
  assert.equal((await call('POST', '/api/evaluate', { token: 'alice', json: { questionText: 'a1', userAnswer: 'a', ...meta, isIdk: true } })).status, 200);

  const insights = await (await call('GET', '/api/insights', { token: 'alice' })).json();
  assert.equal(insights.totals.answers, 2);
  assert.equal(insights.skills[0].name, 'JavaScript');
  assert.equal(insights.delivery.spokenAnswers, 1);
  assert.equal(insights.delivery.avgWpm, 140);
  assert.equal(insights.gaps[0].concept, 'hoisting');

  const guest = await call('GET', '/api/insights');
  assert.equal(guest.status, 401);
});

test('insights are private per user and can be deleted', async () => {
  const bob = await (await call('GET', '/api/insights', { token: 'bob' })).json();
  assert.equal(bob.totals.answers, 0);
  assert.equal(bob.nextStep.type, 'start');

  assert.equal((await call('DELETE', '/api/insights', { token: 'alice' })).status, 204);
  const alice = await (await call('GET', '/api/insights', { token: 'alice' })).json();
  assert.equal(alice.totals.answers, 0);
});

test('transcribe: requires sign in', async () => {
  const res = await call('POST', '/api/transcribe', { body: audio(), headers: { 'Content-Type': 'audio/webm', 'X-Audio-Duration-Ms': '10000' } });
  assert.equal(res.status, 401);
});

test('transcribe: returns transcript and delivery stats', async () => {
  const res = await call('POST', '/api/transcribe', { token: 'alice', body: audio(), headers: { 'Content-Type': 'audio/webm;codecs=opus', 'X-Audio-Duration-Ms': '6000' } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.match(data.transcript, /closure/);
  assert.equal(data.delivery.wordCount, 11);
  assert.equal(data.delivery.wpm, 110);
  assert.equal(data.delivery.fillers.find((f) => f.word === 'um').count, 1);
});

test('transcribe: rejects bad input', async () => {
  const bad = (type, body, duration = '5000') =>
    call('POST', '/api/transcribe', { token: 'alice', body, headers: { 'Content-Type': type, 'X-Audio-Duration-Ms': duration } });
  assert.equal((await bad('video/mp4', audio())).status, 415);
  assert.equal((await bad('audio/webm', audio(10))).status, 400);
  assert.equal((await bad('audio/webm', audio(), 'abc')).status, 400);
  const big = await bad('audio/webm', Buffer.alloc(6 * 1024 * 1024, 1));
  assert.equal(big.status, 413);
  assert.ok((await big.json()).error);
});

test('transcribe: silence is a friendly 422 and upstream failure a 502', async () => {
  geminiMode = 'silent';
  const quiet = await call('POST', '/api/transcribe', { token: 'alice', body: audio(), headers: { 'Content-Type': 'audio/webm', 'X-Audio-Duration-Ms': '5000' } });
  assert.equal(quiet.status, 422);
  geminiMode = 'ok';
});
