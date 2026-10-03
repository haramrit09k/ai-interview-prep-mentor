// The free allowance for people who are not signed in.
//
// The browser also counts guest sessions, but anyone can clear site data and get them back, so the real
// limit is kept here, per IP address, in Redis. A guest gets a few question rounds and a matching number of
// graded answers per window. Signed in users are never counted here.
//
// Trade-off: people on the same network (an office, a university, a mobile carrier) share one allowance.
// That is acceptable for a free trial, and the numbers can be changed with environment variables.
const redisClient = require('./redisClient');
const logger = require('./logger');

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

/**
 * Uses up one unit of a guest's allowance. Returns false when they have none left.
 * Signed in users always pass. If Redis is unavailable we let the request through rather than
 * lock everyone out, and log it.
 * @param {'sessions'|'evaluations'} kind
 */
async function takeGuestAllowance(req, kind) {
  if (req.userId) return true;
  const key = `guest:${kind}:${req.ip}`;
  try {
    const now = Date.now();
    const raw = await redisClient.get(key);
    let record = raw ? JSON.parse(raw) : null;
    if (!record || record.resetAt <= now) {
      record = { count: 0, resetAt: now + windowSeconds() * 1000 };
    }
    if (record.count >= limitFor(kind)) return false;
    record.count += 1;
    await redisClient.set(key, JSON.stringify(record), { EX: Math.max(1, Math.ceil((record.resetAt - now) / 1000)) });
    return true;
  } catch (err) {
    logger.error(`Guest allowance check failed for ${kind}:`, err.message);
    return true;
  }
}

/** Gives back one unit after the work it paid for failed (for example the AI was down), so the guest does not lose it. */
async function refundGuestAllowance(req, kind) {
  if (req.userId) return;
  const key = `guest:${kind}:${req.ip}`;
  try {
    const raw = await redisClient.get(key);
    const record = raw ? JSON.parse(raw) : null;
    if (!record || record.count <= 0 || record.resetAt <= Date.now()) return;
    record.count -= 1;
    await redisClient.set(key, JSON.stringify(record), { EX: Math.max(1, Math.ceil((record.resetAt - Date.now()) / 1000)) });
  } catch (err) {
    logger.error(`Guest allowance refund failed for ${kind}:`, err.message);
  }
}

const GUEST_LIMIT_BODY = {
  error: 'You have used your free practice. Sign in with Google to keep going.',
  code: 'GUEST_LIMIT',
};

module.exports = { takeGuestAllowance, refundGuestAllowance, GUEST_LIMIT_BODY, GUEST_MAX_QUESTIONS };
