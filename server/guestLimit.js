// The free allowance for people who are not signed in.
//
// The browser also counts guest sessions, but anyone can clear site data and get them back, so the real
// limit is kept here, per IP address, in Redis. A guest gets a few question rounds and a matching number of
// graded answers per window. Signed in users are never counted here.
//
// Trade-off: people on the same network (an office, a university, a mobile carrier) share one allowance.
// That is acceptable for a free trial, and the numbers can be changed with environment variables.
const { takeUpTo, giveBack } = require('./counters');

const DAY_SECONDS = 24 * 60 * 60;
const GUEST_MAX_QUESTIONS = 5; // questions in one guest round

const readNumber = (name, fallback) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// Read on every call so the numbers can be changed without code changes (and in tests).
const limitFor = (kind) => (kind === 'sessions'
  ? readNumber('GUEST_SESSIONS_LIMIT', 2) // rounds a guest can start
  // 2 rounds of 5 answers, plus room for the "Try again" attempts that are graded but not counted
  : readNumber('GUEST_EVALUATIONS_LIMIT', 20));
const windowSeconds = () => readNumber('GUEST_WINDOW_DAYS', 30) * DAY_SECONDS;

// The counters are atomic (see counters.js): requests sent at the same moment each take their own place in
// line, so firing many at once cannot get past the limit. They use new key names (guestc:) because the first
// version of this limit stored a JSON record under guest:..., which a counter cannot be added to.
const counterKey = (req, kind) => `guestc:${kind}:${req.ip}`;

/**
 * Uses up one unit of a guest's allowance. Returns false when they have none left.
 * Signed in users always pass. If Redis is unavailable we let the request through rather than
 * lock everyone out, and log it.
 * @param {'sessions'|'evaluations'} kind
 */
async function takeGuestAllowance(req, kind) {
  if (req.userId) return true;
  // The window starts when the first unit is used and is not extended by later ones.
  return (await takeUpTo(counterKey(req, kind), 1, limitFor(kind), windowSeconds())) === 1;
}

/** Gives back one unit after the work it paid for failed (for example the AI was down), so the guest does not lose it. */
async function refundGuestAllowance(req, kind) {
  if (req.userId) return;
  await giveBack(counterKey(req, kind), 1, windowSeconds());
}

const GUEST_LIMIT_BODY = {
  error: 'You have used your free practice. Sign in with Google to keep going.',
  code: 'GUEST_LIMIT',
};

module.exports = { takeGuestAllowance, refundGuestAllowance, GUEST_LIMIT_BODY, GUEST_MAX_QUESTIONS };
