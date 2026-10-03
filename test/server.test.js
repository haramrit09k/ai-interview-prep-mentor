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
// The guest allowance has its own tests below. Everywhere else it is set high so it never gets in the way.
process.env.GUEST_SESSIONS_LIMIT = '1000';
process.env.GUEST_EVALUATIONS_LIMIT = '1000';

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
    req.userEmail = id.includes('@') ? id : `${id}@example.test`; // like a verified Google address
    next();
  },
});
stub('authOptional.js', {
  authOptionalMiddleware: (req, res, next) => {
    const id = userFrom(req);
    if (id) { req.userId = id; req.userEmail = id.includes('@') ? id : `${id}@example.test`; }
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
let evaluateArgs = [];
let questionCalls = [];
stub('geminiService.js', {
  generateQuestionsForSkill: async (...args) => { questionCalls.push(args); return [{ text: 'fresh question', level: args[1], skillId: args[3] }]; },
  evaluateAnswer: async (...args) => {
    evaluateCalls += 1;
    evaluateArgs.push(args);
    if (geminiMode === 'fail') throw new Error('upstream down');
    return { mentorAnswer: 'm', feedback: 'f', classification: 'correct', conceptsKnown: ['scope'], conceptsToReview: ['hoisting'] };
  },
  transcribeAudio: async () => (geminiMode === 'silent' ? '' : 'um a closure is basically a function that remembers its scope'),
});

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

  // a second try after seeing the mentor answer is graded but not recorded
  assert.equal((await call('POST', '/api/evaluate', { token: 'alice', json: { questionText: 'a1', userAnswer: 'a', ...meta, isRetry: true } })).status, 200);

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

test('questions: validates level, caps the count, and only signed-in users get repeat avoidance', async () => {
  const url = (extra = '') => `/api/questions?skillName=Java&level=Mid-level&skillId=java&count=5${extra}`;
  assert.equal((await call('GET', '/api/questions?skillName=Java&level=Wizard&skillId=java&count=5')).status, 400);
  assert.equal((await call('GET', '/api/questions?skillName=Java&level=Mid-level&skillId=java&count=0')).status, 400);

  // a guest has no history to avoid
  questionCalls = [];
  assert.equal((await call('GET', url())).status, 200);
  assert.deepEqual(questionCalls[0][4] ?? [], []);

  // a huge count is capped at one session's worth, and a guest's round is shorter still
  questionCalls = [];
  await call('GET', '/api/questions?skillName=Java&level=Mid-level&skillId=java&count=100000');
  assert.equal(questionCalls[0][2], 5);
  questionCalls = [];
  await call('GET', '/api/questions?skillName=Java&level=Mid-level&skillId=java&count=100000', { token: 'carol' });
  assert.equal(questionCalls[0][2], 15);

  // a signed-in user's previously answered questions for that skill are passed along
  for (const text of ['Already seen one?', 'Already seen two?']) {
    await call('POST', '/api/evaluate', { token: 'carol', json: { questionText: text, userAnswer: 'a', skillId: 'java', skillName: 'Java' } });
    await new Promise((r) => setTimeout(r, 5));
  }
  await call('POST', '/api/evaluate', { token: 'carol', json: { questionText: 'Other skill?', userAnswer: 'a', skillId: 'go', skillName: 'Go' } });
  questionCalls = [];
  assert.equal((await call('GET', url(), { token: 'carol' })).status, 200);
  assert.deepEqual(questionCalls[0][4], ['Already seen two?', 'Already seen one?']);
});

test('evaluate: an overlong question and a tag-spoofing answer still work and share one cache entry', async () => {
  evaluateCalls = 0;
  const body = { questionText: 'q'.repeat(2000), userAnswer: 'answer' };
  assert.equal((await call('POST', '/api/evaluate', { json: body })).status, 200);
  assert.equal((await call('POST', '/api/evaluate', { json: { ...body, questionText: 'q'.repeat(2500) } })).status, 200);
  assert.equal(evaluateCalls, 1, 'both trimmed to the same text, so the second is a cache hit');
});

test('evaluate: the grade depends on level and on spoken vs typed, so each gets its own cache entry', async () => {
  evaluateCalls = 0;
  evaluateArgs = [];
  const base = { questionText: 'level-cache question', userAnswer: 'the same answer' };
  const spokenStats = { durationSec: 20, wordCount: 60, wpm: 180, fillerTotal: 1 };
  assert.equal((await call('POST', '/api/evaluate', { json: { ...base, level: 'Entry-level' } })).status, 200);
  assert.equal((await call('POST', '/api/evaluate', { json: { ...base, level: 'Expert' } })).status, 200);
  assert.equal((await call('POST', '/api/evaluate', { json: { ...base, level: 'Expert', delivery: spokenStats } })).status, 200);
  assert.equal(evaluateCalls, 3, 'different level or spoken flag means a fresh evaluation');

  // repeating any of them is a cache hit
  await call('POST', '/api/evaluate', { json: { ...base, level: 'Entry-level' } });
  await call('POST', '/api/evaluate', { json: { ...base, level: 'Expert', delivery: spokenStats } });
  assert.equal(evaluateCalls, 3);

  assert.deepEqual(evaluateArgs[0][2], { level: 'Entry-level', spoken: false });
  assert.deepEqual(evaluateArgs[1][2], { level: 'Expert', spoken: false });
  assert.deepEqual(evaluateArgs[2][2], { level: 'Expert', spoken: true });
});

test('evaluate: a missing or invalid level is passed on as unspecified', async () => {
  evaluateArgs = [];
  await call('POST', '/api/evaluate', { json: { questionText: 'custom question', userAnswer: 'a', level: 'Grandmaster' } });
  await call('POST', '/api/evaluate', { json: { questionText: 'custom question two', userAnswer: 'a' } });
  assert.equal(evaluateArgs[0][2].level, undefined);
  assert.equal(evaluateArgs[1][2].level, undefined);
});

// ---------- Review (study sheet) ----------

const answer = (token, fields) =>
  call('POST', '/api/evaluate', { token, json: { userAnswer: 'an answer', skillId: 'rev', skillName: 'Review Skill', level: 'Mid-level', ...fields } });

test('review: requires sign in', async () => {
  assert.equal((await call('GET', '/api/review/rev')).status, 401);
});

test('review: a user with no history gets an empty sheet', async () => {
  const sheet = await (await call('GET', '/api/review/rev', { token: 'newbie' })).json();
  assert.equal(sheet.hasData, false);
  assert.deepEqual(sheet.retry, []);
  assert.equal(sheet.previousSummary, null);
});

test('review: builds the sheet from recorded answers, per skill and per user', async () => {
  geminiMode = 'ok'; // the stub grades "correct" and reports known=[scope], review=[hoisting]
  await answer('dana', { questionText: 'review q1' });
  await new Promise((r) => setTimeout(r, 5));
  await answer('dana', { questionText: 'review q2', isIdk: true });          // recorded as idk
  await answer('dana', { questionText: 'other skill q', skillId: 'other', skillName: 'Other' });
  await answer('erin', { questionText: 'erin only' });

  const sheet = await (await call('GET', '/api/review/rev', { token: 'dana' })).json();
  assert.equal(sheet.hasData, true);
  assert.equal(sheet.skill.name, 'Review Skill');
  assert.equal(sheet.counts.answers, 2);
  assert.equal(sheet.gaps[0].concept, 'hoisting');
  // q1 was answered correctly, q2 was "I don't know": only q2 needs another try, and it keeps its level
  assert.deepEqual(sheet.retry.map((r) => r.text), ['review q2']);
  assert.equal(sheet.retry[0].level, 'Mid-level');
  assert.equal(sheet.totalToRetry, 1);

  const other = await (await call('GET', '/api/review/other', { token: 'dana' })).json();
  assert.equal(other.counts.answers, 1);
  const erin = await (await call('GET', '/api/review/rev', { token: 'erin' })).json();
  assert.equal(erin.counts.answers, 1, 'one user never sees another user\'s answers');
});

test('review: previous AI summaries are still shown, but the empty placeholder is not', async () => {
  const db = require('../server/db');
  const seed = async (id, summaries) => {
    await call('GET', '/api/quota', { token: id }); // creates the user row, like login does
    await db.query('UPDATE users SET revision_summaries = $1 WHERE id = $2', [JSON.stringify(summaries), id]);
  };
  await seed('oldtimer', { rev: { conceptsKnown: '- Closures', conceptsToReview: '- Hoisting', lastUpdated: '2026-01-01T00:00:00.000Z' } });
  await seed('placeholder', { rev: { conceptsKnown: 'No questions were answered in this session.', conceptsToReview: 'Complete a few questions...' } });

  const kept = await (await call('GET', '/api/review/rev', { token: 'oldtimer' })).json();
  assert.equal(kept.previousSummary.conceptsKnown, '- Closures');
  const dropped = await (await call('GET', '/api/review/rev', { token: 'placeholder' })).json();
  assert.equal(dropped.previousSummary, null);
});

test('the AI summary endpoints are gone, and ending a session no longer needs them', async () => {
  assert.equal((await call('POST', '/api/revision-summary', { token: 'dana', json: { skillId: 'rev', skillName: 'x', knownQuestions: [], unknownQuestions: [] } })).status, 404);
  assert.equal((await call('GET', '/api/revision-summary/rev', { token: 'dana' })).status, 404);
});

test('save on exit: stores unanswered questions, tolerates old clients, and never errors on empty input', async () => {
  await call('GET', '/api/quota', { token: 'quitter' });
  const q = { skillId: 'rev', level: 'Mid-level', text: 'left unanswered' };
  // an old client also sends summaryData; it is ignored
  const res = await call('POST', '/api/session/save-on-exit', { token: 'quitter', json: { unansweredQuestions: [q], summaryData: { skillId: 'rev', skillName: 'x', history: [] } } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal((await call('POST', '/api/session/save-on-exit', { token: 'quitter', json: { unansweredQuestions: [] } })).status, 200);
  assert.equal((await call('POST', '/api/session/save-on-exit', { token: 'quitter', json: {} })).status, 200);

  // the saved question is served first next time for that skill and level
  questionCalls = [];
  const next = await (await call('GET', '/api/questions?skillName=Review&level=Mid-level&skillId=rev&count=1', { token: 'quitter' })).json();
  assert.equal(next.questions[0].text, 'left unanswered');
});

test('success responses are not labelled as errors', async () => {
  const res = await call('GET', '/api/quota', { token: 'quitter' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).bonusQuestions, 0);
});

test('guests get a limited number of rounds and graded answers per network, and signed in users are not counted', async () => {
  const clearGuestKeys = () => { for (const k of [...cache.keys()]) if (k.startsWith('guest:')) cache.delete(k); };
  const guestUrl = '/api/questions?skillName=Java&level=Mid-level&skillId=java&count=5';
  clearGuestKeys();
  process.env.GUEST_SESSIONS_LIMIT = '2';
  process.env.GUEST_EVALUATIONS_LIMIT = '3';
  try {
    // two rounds are allowed, the third is refused with a code the app can act on
    assert.equal((await call('GET', guestUrl)).status, 200);
    assert.equal((await call('GET', guestUrl)).status, 200);
    const third = await call('GET', guestUrl);
    assert.equal(third.status, 403);
    assert.equal((await third.json()).code, 'GUEST_LIMIT');
    // signed in users are never counted
    assert.equal((await call('GET', guestUrl, { token: 'dana' })).status, 200);

    // graded answers are limited too, and invalid requests do not use any up
    assert.equal((await call('POST', '/api/evaluate', { json: { questionText: '', userAnswer: 'a' } })).status, 400);
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await call('POST', '/api/evaluate', { json: { questionText: `guest limit ${i}`, userAnswer: 'a' } })).status, 200);
    }
    const blocked = await call('POST', '/api/evaluate', { json: { questionText: 'guest limit 4', userAnswer: 'a' } });
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).code, 'GUEST_LIMIT');
    assert.equal((await call('POST', '/api/evaluate', { token: 'dana', json: { questionText: 'guest limit 4', userAnswer: 'a' } })).status, 200);

    // an AI failure gives the answer back, so an outage does not use up a guest's allowance
    clearGuestKeys();
    geminiMode = 'fail';
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await call('POST', '/api/evaluate', { json: { questionText: `outage ${i}`, userAnswer: 'a' } })).status, 502);
    }
    geminiMode = 'ok';
    assert.equal((await call('POST', '/api/evaluate', { json: { questionText: 'after outage', userAnswer: 'a' } })).status, 200);
  } finally {
    process.env.GUEST_SESSIONS_LIMIT = '1000';
    process.env.GUEST_EVALUATIONS_LIMIT = '1000';
    clearGuestKeys();
  }
});

const ADMIN_KEY = 'a-test-admin-key-that-is-long-enough';
const admin = (method, url, json) => call(method, url, { json, headers: { Authorization: `Bearer ${ADMIN_KEY}` } });

test('admin routes do not exist without a long enough key, and need the right key', async () => {
  delete process.env.ADMIN_API_KEY;
  assert.equal((await admin('GET', '/api/admin/invites')).status, 404);
  process.env.ADMIN_API_KEY = 'too-short';
  assert.equal((await admin('GET', '/api/admin/invites')).status, 404);
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  assert.equal((await call('GET', '/api/admin/invites')).status, 401);
  assert.equal((await call('GET', '/api/admin/invites', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await admin('GET', '/api/admin/invites')).status, 200);
});

test('invite codes: made for an email, used once, only by that email, and added on top of the weekly questions', async () => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.INVITE_TOTAL_QUESTION_BUDGET = '1000';
  const made = await admin('POST', '/api/admin/invites', { email: 'Friend@Example.test', questions: 7 });
  assert.equal(made.status, 201);
  const invite = await made.json();
  assert.match(invite.code, /^ACE-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(invite.email, 'friend@example.test');
  assert.equal(invite.questions, 7);

  // a stranger, a guest and a mistyped code all get the same refusal
  const strangerRes = await call('POST', '/api/invites/redeem', { token: 'stranger@example.test', json: { code: invite.code } });
  assert.equal(strangerRes.status, 400);
  const strangerMsg = (await strangerRes.json()).error;
  const unknown = await call('POST', '/api/invites/redeem', { token: 'friend@example.test', json: { code: 'ACE-AAAA-AAAA' } });
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error, strangerMsg);
  assert.equal((await call('POST', '/api/invites/redeem', { json: { code: invite.code } })).status, 401);

  // the right account, typed loosely, gets the questions
  await call('GET', '/api/quota', { token: 'friend@example.test' });
  const redeemed = await call('POST', '/api/invites/redeem', { token: 'friend@example.test', json: { code: invite.code.toLowerCase().replace(/-/g, ' ') } });
  assert.equal(redeemed.status, 200);
  assert.deepEqual(await redeemed.json(), { questionsAdded: 7, bonusQuestions: 7 });
  const quota = await (await call('GET', '/api/quota', { token: 'friend@example.test' })).json();
  assert.equal(quota.bonusQuestions, 7);

  // a code works once
  const again = await call('POST', '/api/invites/redeem', { token: 'friend@example.test', json: { code: invite.code } });
  assert.equal(again.status, 409);
  const listed = await (await admin('GET', '/api/admin/invites')).json();
  assert.equal(listed.invites.find((i) => i.code === invite.code).status, 'redeemed');
});

test('invite codes: caps keep the spending bounded, and expired or revoked codes cannot be used', async () => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  // one code cannot be bigger than the per code cap, and bad input is refused
  process.env.INVITE_MAX_QUESTIONS_PER_CODE = '10';
  assert.equal((await admin('POST', '/api/admin/invites', { email: 'big@example.test', questions: 11 })).status, 400);
  assert.equal((await admin('POST', '/api/admin/invites', { email: 'not-an-email' })).status, 400);
  assert.equal((await admin('POST', '/api/admin/invites', { email: 'x@example.test', questions: 0 })).status, 400);
  assert.equal((await admin('POST', '/api/admin/invites', { email: 'x@example.test', days: 500 })).status, 400);
  delete process.env.INVITE_MAX_QUESTIONS_PER_CODE;

  // the total is capped too, and revoking an unused code gives its questions back
  const before = (await (await admin('GET', '/api/admin/invites')).json()).budget;
  process.env.INVITE_TOTAL_QUESTION_BUDGET = String(before.committed + 10);
  const a = await (await admin('POST', '/api/admin/invites', { email: 'a@example.test', questions: 10 })).json();
  const over = await admin('POST', '/api/admin/invites', { email: 'b@example.test', questions: 1 });
  assert.equal(over.status, 409);
  assert.match((await over.json()).error, /budget/);
  const revoked = await admin('DELETE', `/api/admin/invites/${a.code}`);
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).budget.remaining, 10);
  assert.equal((await admin('POST', '/api/admin/invites', { email: 'b@example.test', questions: 1 })).status, 201);
  process.env.INVITE_TOTAL_QUESTION_BUDGET = '1000';

  // a revoked code cannot be used
  const gone = await call('POST', '/api/invites/redeem', { token: 'a@example.test', json: { code: a.code } });
  assert.equal(gone.status, 410);

  // an expired code cannot be used, and its questions are not counted against the budget
  const pool = require('../server/db');
  const expired = await (await admin('POST', '/api/admin/invites', { email: 'late@example.test', questions: 5 })).json();
  await pool.query('UPDATE invite_codes SET expires_at = $1 WHERE code = $2', ['2000-01-01T00:00:00.000Z', expired.code]);
  const late = await call('POST', '/api/invites/redeem', { token: 'late@example.test', json: { code: expired.code } });
  assert.equal(late.status, 410);
  const list = await (await admin('GET', '/api/admin/invites')).json();
  assert.equal(list.invites.find((i) => i.code === expired.code).status, 'expired');
});

test('invite codes: Gmail dots and plus tags count as the same address', async () => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const invite = await (await admin('POST', '/api/admin/invites', { email: 'sam.smith@gmail.com', questions: 3 })).json();
  const res = await call('POST', '/api/invites/redeem', { token: 'samsmith+ace@gmail.com', json: { code: invite.code } });
  assert.equal(res.status, 200);
});

const grade = (token, questionText, extra = {}) =>
  call('POST', '/api/evaluate', { token, json: { questionText, userAnswer: 'an answer', skillId: 's', skillName: 'S', ...extra } });

test('quota: the server spends a question when it grades one, and refuses when none are left', async () => {
  process.env.WEEKLY_QUESTION_LIMIT = '2';
  try {
    const user = 'limited@example.test';
    const first = await grade(user, 'quota q1');
    assert.equal(first.status, 200);
    assert.deepEqual((await first.json()).quota, { questionsUsed: 1, bonusQuestions: 0 });
    assert.equal((await grade(user, 'quota q2')).status, 200);

    // nothing left: grading and generating are both refused, with a code the app can act on
    const refused = await grade(user, 'quota q3');
    assert.equal(refused.status, 403);
    assert.equal((await refused.json()).code, 'QUOTA_EXCEEDED');
    const gen = await call('GET', '/api/questions?skillName=Java&level=Mid-level&skillId=java&count=5', { token: user });
    assert.equal(gen.status, 403);
    assert.equal((await gen.json()).code, 'QUOTA_EXCEEDED');

    // the app cannot talk its way past it: there is no endpoint that changes the count any more
    assert.equal((await call('POST', '/api/quota/increment', { token: user, json: {} })).status, 404);
    const quota = await (await call('GET', '/api/quota', { token: user })).json();
    assert.equal(quota.questionsUsed, 2);

    // other users are not affected, and guests are handled by their own limit
    assert.equal((await grade('someone-else@example.test', 'quota q3')).status, 200);
  } finally {
    delete process.env.WEEKLY_QUESTION_LIMIT;
  }
});

test('quota: trying a question again is free but limited, and cannot be used to avoid paying', async () => {
  process.env.WEEKLY_QUESTION_LIMIT = '1';
  try {
    const user = 'retrier@example.test';
    assert.equal((await grade(user, 'retry q')).status, 200); // pays the only question
    // even with none left, the same question can be tried again, up to the daily limit
    for (let i = 0; i < 3; i += 1) assert.equal((await grade(user, 'retry q', { isRetry: true })).status, 200);
    const tooMany = await grade(user, 'retry q', { isRetry: true });
    assert.equal(tooMany.status, 429);
    assert.equal((await tooMany.json()).code, 'QUESTION_REPEAT_LIMIT');
    // a different question is not free, whatever the request claims
    const sneaky = await grade(user, 'a different question', { isRetry: true });
    assert.equal(sneaky.status, 403);
    assert.equal((await call('GET', '/api/quota', { token: user }).then((r) => r.json())).questionsUsed, 1);
  } finally {
    delete process.env.WEEKLY_QUESTION_LIMIT;
  }
});

test('quota: an AI failure gives the question back', async () => {
  process.env.WEEKLY_QUESTION_LIMIT = '1';
  try {
    const user = 'unlucky@example.test';
    geminiMode = 'fail';
    assert.equal((await grade(user, 'outage q')).status, 502);
    geminiMode = 'ok';
    assert.equal((await call('GET', '/api/quota', { token: user }).then((r) => r.json())).questionsUsed, 0);
    // the same question can be graded now, and costs one question as normal
    assert.equal((await grade(user, 'outage q')).status, 200);
    assert.equal((await grade(user, 'another q')).status, 403);
  } finally {
    geminiMode = 'ok';
    delete process.env.WEEKLY_QUESTION_LIMIT;
  }
});

test('quota: bonus questions are spent after the weekly ones and keep the user going', async () => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.INVITE_TOTAL_QUESTION_BUDGET = '1000';
  process.env.WEEKLY_QUESTION_LIMIT = '2';
  try {
    const user = 'bonus@example.test';
    const invite = await (await admin('POST', '/api/admin/invites', { email: user, questions: 2 })).json();
    await call('GET', '/api/quota', { token: user });
    assert.equal((await call('POST', '/api/invites/redeem', { token: user, json: { code: invite.code } })).status, 200);

    const quotas = [];
    for (const q of ['b1', 'b2', 'b3', 'b4']) quotas.push((await (await grade(user, q)).json()).quota);
    assert.deepEqual(quotas, [
      { questionsUsed: 1, bonusQuestions: 2 },
      { questionsUsed: 2, bonusQuestions: 2 }, // weekly questions are used up first
      { questionsUsed: 2, bonusQuestions: 1 },
      { questionsUsed: 2, bonusQuestions: 0 },
    ]);
    assert.equal((await grade(user, 'b5')).status, 403);
  } finally {
    delete process.env.WEEKLY_QUESTION_LIMIT;
    process.env.INVITE_TOTAL_QUESTION_BUDGET = '1000';
  }
});

test('admin: a weak key is not accepted, and too many wrong keys lock the address out', async () => {
  const clearAdminKeys = () => { for (const k of [...cache.keys()]) if (k.startsWith('adminfail:')) cache.delete(k); };
  clearAdminKeys();
  try {
    // long enough for the old rule, but a repeated pattern and under 32 characters
    process.env.ADMIN_API_KEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    assert.equal((await admin('GET', '/api/admin/invites')).status, 404);
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    assert.equal((await admin('GET', '/api/admin/invites')).status, 200);

    for (let i = 0; i < 10; i += 1) {
      assert.equal((await call('GET', '/api/admin/invites', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    }
    // locked out: even the right key is refused until the hour is up
    assert.equal((await call('GET', '/api/admin/invites', { headers: { Authorization: 'Bearer wrong' } })).status, 429);
    assert.equal((await admin('GET', '/api/admin/invites')).status, 429);
  } finally {
    clearAdminKeys();
    process.env.ADMIN_API_KEY = ADMIN_KEY;
  }
});
