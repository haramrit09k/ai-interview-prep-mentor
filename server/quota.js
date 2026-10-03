// The weekly question allowance of signed in users, kept and enforced on the server.
//
// The app shows the numbers, but the server is what decides: it spends one question when a user first has
// a question graded, and it refuses to generate or grade anything for a user who has none left.
//   - the weekly questions are spent first, then bonus questions (from invite codes or purchases of the
//     weekly kind, see index.js), which the Monday reset does not touch
//   - the first grading of a question costs one question. The same question can be graded again a few more
//     times in a day for free ("Try again"), so a retry is practice and never a way to get free grading
//   - if the AI call fails, the question is given back
const crypto = require('crypto');
const pool = require('./db');
const redisClient = require('./redisClient');
const logger = require('./logger');

const DAY_SECONDS = 24 * 60 * 60;
// One paid grading plus this many free tries of the same question, per day.
const MAX_GRADINGS_PER_QUESTION = 4;

// Keep the default in sync with QUESTIONS_LIMIT_AUTH in App.tsx. Read on every call so tests can change it.
const weeklyLimit = () => {
  const n = parseInt(process.env.WEEKLY_QUESTION_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : 50;
};

const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay(); // Sunday - 0, Monday - 1, ..., Saturday - 6
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** The user's quota row, created if it is missing and reset if a new week has started. */
async function loadQuota(userId) {
  const { rows } = await pool.query('SELECT questions_used, last_reset_date, has_seen_welcome_modal, bonus_questions FROM users WHERE id = $1', [userId]);
  const startOfCurrentWeek = getStartOfWeek(new Date());

  if (rows.length === 0) {
    const resetTimestamp = startOfCurrentWeek.toISOString();
    logger.info(`Quota: user ${userId} not found, creating new entry with weekly reset.`);
    await pool.query('INSERT INTO users (id, questions_used, last_reset_date, has_seen_welcome_modal) VALUES ($1, 0, $2, FALSE) ON CONFLICT (id) DO NOTHING', [userId, resetTimestamp]);
    return { questionsUsed: 0, lastResetDate: resetTimestamp, bonusQuestions: 0, hasSeenWelcomeModal: false };
  }

  const user = rows[0];
  const lastResetDate = user.last_reset_date ? new Date(user.last_reset_date) : new Date(0);
  if (startOfCurrentWeek.getTime() > getStartOfWeek(lastResetDate).getTime()) {
    logger.info(`Quota: new week detected. Resetting weekly quota for user ${userId}.`);
    const resetTimestamp = startOfCurrentWeek.toISOString();
    // Questions bought before bonus questions existed were credited by taking them off the week's used count,
    // which left it below zero. Keep those as bonus questions instead of letting the reset wipe them.
    const carried = Math.max(0, -(user.questions_used || 0));
    const bonus = (user.bonus_questions || 0) + carried;
    await pool.query('UPDATE users SET questions_used = 0, bonus_questions = $1, last_reset_date = $2 WHERE id = $3', [bonus, resetTimestamp, userId]);
    return { questionsUsed: 0, lastResetDate: resetTimestamp, bonusQuestions: bonus, hasSeenWelcomeModal: user.has_seen_welcome_modal };
  }
  return { questionsUsed: user.questions_used, lastResetDate: user.last_reset_date, bonusQuestions: user.bonus_questions || 0, hasSeenWelcomeModal: user.has_seen_welcome_modal };
}

/** Weekly questions left (more than the limit if questions were bought) plus bonus questions. */
const remainingQuestions = (quota) => Math.max(0, weeklyLimit() - quota.questionsUsed) + quota.bonusQuestions;

/** Spends one question. Returns 'weekly' or 'bonus' (where it came from), or null when the user has none left. */
async function spendQuestion(userId) {
  await loadQuota(userId); // makes sure the row exists and the week has been reset
  // Each statement checks the balance itself, so two requests at once cannot spend the same last question.
  const weekly = await pool.query('UPDATE users SET questions_used = questions_used + 1 WHERE id = $1 AND questions_used < $2', [userId, weeklyLimit()]);
  if (weekly.rowCount) return 'weekly';
  const bonus = await pool.query('UPDATE users SET bonus_questions = bonus_questions - 1 WHERE id = $1 AND COALESCE(bonus_questions, 0) > 0', [userId]);
  if (bonus.rowCount) return 'bonus';
  return null;
}

async function refundQuestion(userId, source) {
  if (source === 'weekly') await pool.query('UPDATE users SET questions_used = questions_used - 1 WHERE id = $1 AND questions_used > 0', [userId]);
  if (source === 'bonus') await pool.query('UPDATE users SET bonus_questions = COALESCE(bonus_questions, 0) + 1 WHERE id = $1', [userId]);
}

const QUOTA_EXCEEDED_BODY = {
  error: 'You have used all your questions. Buy more questions, or wait for your weekly questions to reset.',
  code: 'QUOTA_EXCEEDED',
};

const attemptsKey = (userId, questionText) =>
  `gradings:${userId}:${crypto.createHash('sha256').update(String(questionText)).digest('hex')}`;

const readAttempts = async (key) => {
  try {
    return parseInt(await redisClient.get(key), 10) || 0;
  } catch (err) {
    logger.error('Quota: could not read grading count:', err.message);
    return 0;
  }
};
const writeAttempts = async (key, count, ttl = DAY_SECONDS) => {
  try {
    await redisClient.set(key, String(Math.max(0, count)), { EX: ttl });
  } catch (err) {
    logger.error('Quota: could not save grading count:', err.message);
  }
};

/**
 * Called before a signed in user's answer is graded.
 * Returns { ok: true, release } where release() undoes the charge if grading fails,
 * or { ok: false, status, body } when the user may not have this graded.
 */
async function chargeForGrading(userId, questionText) {
  const key = attemptsKey(userId, questionText);
  const attempts = await readAttempts(key);

  if (attempts >= MAX_GRADINGS_PER_QUESTION) {
    return { ok: false, status: 429, body: { error: 'You have tried this question several times today. Move on to the next one, and come back to it tomorrow.', code: 'QUESTION_REPEAT_LIMIT' } };
  }

  let source = null;
  if (attempts === 0) {
    source = await spendQuestion(userId);
    if (!source) return { ok: false, status: 403, body: QUOTA_EXCEEDED_BODY };
  } else {
    // A free try of a question already paid for today. Someone with no questions left can still use these.
  }
  await writeAttempts(key, attempts + 1);
  if (source) await adjustGraded(userId, 1); // answering a question frees a place for a new one

  return {
    ok: true,
    release: async () => {
      try {
        if (source) {
          await refundQuestion(userId, source);
          await adjustGraded(userId, -1);
        }
        await writeAttempts(key, attempts);
      } catch (err) {
        logger.error(`Quota: could not give back a question for user ${userId}:`, err.message);
      }
    },
  };
}

const VOICE_LIMIT_BODY = {
  error: 'You have reached today\'s limit for voice answers. You can type your answer instead, and voice is available again tomorrow.',
  code: 'VOICE_LIMIT',
};

// Voice answers are graded (and charged) like any other, so a recording is not charged a second time.
// It is still the most expensive request we accept, so each user gets a daily number of them.
const dailyKey = (kind, userId) => `daily:${kind}:${userId}:${new Date().toISOString().slice(0, 10)}`;
const dailyLimit = (name, fallback) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Uses up one of a user's daily voice recordings. Returns false when they have none left today. */
async function takeDailyVoice(userId) {
  const key = dailyKey('voice', userId);
  const used = await readAttempts(key);
  if (used >= dailyLimit('VOICE_DAILY_LIMIT', 60)) return false;
  await writeAttempts(key, used + 1, 2 * DAY_SECONDS);
  return true;
}

/** Gives a recording back after transcription failed. */
async function refundDailyVoice(userId) {
  const key = dailyKey('voice', userId);
  await writeAttempts(key, (await readAttempts(key)) - 1, 2 * DAY_SECONDS);
}

// Generating questions is what costs the most (one model call can return 15), and nothing is charged for it, so
// without a limit someone could generate questions all day, answer them somewhere else, and never spend a question.
// Instead, each user may have a limited number of questions generated for them that they have not answered yet.
// Answering one (which does cost a question) frees a place, so generation can only run so far ahead of real use.
// Unanswered questions are saved and shown again first, so normal use never gets near the limit.
const openLimit = () => dailyLimit('OPEN_QUESTIONS_LIMIT', 30);

const OPEN_QUESTIONS_BODY = {
  error: 'You have a lot of questions you have not answered yet. Answer some of them first, and you can get more. If you have already answered a lot, try again tomorrow.',
  code: 'OPEN_QUESTIONS_LIMIT',
};

/** How many new questions can be generated for this user right now. */
async function freshQuestionAllowance(userId) {
  const generated = await readAttempts(dailyKey('generated', userId));
  const graded = await readAttempts(dailyKey('graded', userId));
  const open = Math.max(0, generated - graded);
  return Math.max(0, openLimit() - open);
}

async function recordGenerated(userId, count) {
  const key = dailyKey('generated', userId);
  await writeAttempts(key, (await readAttempts(key)) + count, 2 * DAY_SECONDS);
}

const adjustGraded = async (userId, change) => {
  const key = dailyKey('graded', userId);
  await writeAttempts(key, (await readAttempts(key)) + change, 2 * DAY_SECONDS);
};

/** The numbers the app needs to stay in step with the server. */
async function quotaSnapshot(userId) {
  const quota = await loadQuota(userId);
  return { questionsUsed: quota.questionsUsed, bonusQuestions: quota.bonusQuestions };
}

module.exports = { freshQuestionAllowance, recordGenerated, OPEN_QUESTIONS_BODY, takeDailyVoice, refundDailyVoice, VOICE_LIMIT_BODY, getStartOfWeek, loadQuota, remainingQuestions, spendQuestion, refundQuestion, chargeForGrading, quotaSnapshot, QUOTA_EXCEEDED_BODY, weeklyLimit };
