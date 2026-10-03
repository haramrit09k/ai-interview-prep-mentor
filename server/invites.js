// Invite codes: the admin creates a code for a friend's email, the friend enters it after signing in with
// that email, and it adds bonus questions to their account.
//
// Spending is capped by design:
//   - a code is for one email and can be used once
//   - a code has a maximum number of questions (INVITE_MAX_QUESTIONS_PER_CODE)
//   - the total handed out is capped (INVITE_TOTAL_QUESTION_BUDGET). Unused codes that expire or are
//     revoked give their questions back to the budget
//   - codes expire (14 days unless the admin says otherwise)
const crypto = require('crypto');
const pool = require('./db');
const logger = require('./logger');

// 32 characters with no 0/O or 1/I, so a code is easy to read out or type from a message.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DAY_MS = 24 * 60 * 60 * 1000;

class InviteError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'InviteError';
    this.status = status;
  }
}

const readNumber = (name, fallback) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Read on every call so the numbers can be changed with environment variables (and in tests).
const settings = () => ({
  maxPerCode: readNumber('INVITE_MAX_QUESTIONS_PER_CODE', 25),
  budget: readNumber('INVITE_TOTAL_QUESTION_BUDGET', 100),
  defaultQuestions: 10,
  defaultDays: 14,
  maxDays: 60,
});

const generateCode = () => {
  let chars = '';
  for (let i = 0; i < 8; i += 1) chars += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `ACE-${chars.slice(0, 4)}-${chars.slice(4)}`;
};

/** Accepts "ace-abcd-efgh", "ACEABCDEFGH" and so on. Returns null when it cannot be a code. */
const normalizeCode = (input) => {
  const flat = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = /^ACE([A-Z0-9]{8})$/.exec(flat);
  return match ? `ACE-${match[1].slice(0, 4)}-${match[1].slice(4)}` : null;
};

/** Lower case, and for Gmail addresses ignore dots and +tags, which Google treats as the same inbox. */
const normalizeEmail = (input) => {
  const email = String(input || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  let local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.split('+')[0].replace(/\./g, '');
    return `${local}@gmail.com`;
  }
  return email;
};

const looksLikeEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

const statusOf = (row, now) => {
  if (row.redeemed_by) return 'redeemed';
  if (row.revoked_at) return 'revoked';
  if (row.expires_at <= now) return 'expired';
  return 'active';
};

const present = (row, now) => ({
  code: row.code,
  email: row.email,
  questions: Number(row.questions),
  status: statusOf(row, now),
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  redeemedAt: row.redeemed_at || null,
});

/** Questions that are spoken for: used codes, plus codes that could still be used. */
async function committedQuestions(nowIso) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(questions), 0) AS total FROM invite_codes
     WHERE revoked_at IS NULL AND (redeemed_by IS NOT NULL OR expires_at > $1)`,
    [nowIso]
  );
  return Number(rows[0].total) || 0;
}

async function budgetSummary(nowIso) {
  const { budget } = settings();
  const committed = await committedQuestions(nowIso);
  return { limit: budget, committed, remaining: Math.max(0, budget - committed) };
}

async function createInvite({ email, questions, days }) {
  const cfg = settings();
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!looksLikeEmail(cleanEmail)) throw new InviteError(400, 'Enter a valid email address.');

  const count = questions === undefined ? cfg.defaultQuestions : Number(questions);
  if (!Number.isInteger(count) || count < 1) throw new InviteError(400, 'Questions must be a whole number of at least 1.');
  if (count > cfg.maxPerCode) throw new InviteError(400, `A single code can give at most ${cfg.maxPerCode} questions.`);

  const validDays = days === undefined ? cfg.defaultDays : Number(days);
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > cfg.maxDays) {
    throw new InviteError(400, `Days must be a whole number from 1 to ${cfg.maxDays}.`);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const committed = await committedQuestions(nowIso);
  if (committed + count > cfg.budget) {
    throw new InviteError(409, `That would go over the invite budget: ${committed} of ${cfg.budget} questions are already handed out, ${Math.max(0, cfg.budget - committed)} left. Revoke an unused code or raise INVITE_TOTAL_QUESTION_BUDGET.`);
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + validDays * DAY_MS).toISOString();
  await pool.query(
    'INSERT INTO invite_codes (code, email, questions, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [code, cleanEmail, count, nowIso, expiresAt]
  );
  logger.info(`Invite created for ${cleanEmail}: ${count} questions, expires ${expiresAt}.`);
  return { ...present({ code, email: cleanEmail, questions: count, created_at: nowIso, expires_at: expiresAt }, nowIso), budget: await budgetSummary(nowIso) };
}

async function listInvites() {
  const nowIso = new Date().toISOString();
  const { rows } = await pool.query('SELECT * FROM invite_codes ORDER BY created_at DESC LIMIT 200', []);
  return { invites: rows.map((row) => present(row, nowIso)), budget: await budgetSummary(nowIso) };
}

async function revokeInvite(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) throw new InviteError(400, 'That is not a valid code.');
  const nowIso = new Date().toISOString();
  const result = await pool.query(
    'UPDATE invite_codes SET revoked_at = $1 WHERE code = $2 AND redeemed_by IS NULL AND revoked_at IS NULL',
    [nowIso, code]
  );
  if (!result.rowCount) {
    const { rows } = await pool.query('SELECT redeemed_by FROM invite_codes WHERE code = $1', [code]);
    if (rows.length === 0) throw new InviteError(404, 'No such code.');
    if (rows[0].redeemed_by) throw new InviteError(409, 'That code has already been used, so its questions cannot be taken back.');
    // Already revoked: nothing to do.
  }
  return { code, revoked: true, budget: await budgetSummary(nowIso) };
}

const startOfWeekIso = () => {
  const d = new Date();
  const diff = d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/**
 * Adds a code's questions to the signed in user's bonus balance.
 * The email on the code must match the verified email of the Google account that redeems it.
 */
async function redeemInvite({ userId, userEmail, code: rawCode }) {
  // One message for "no such code" and "someone else's code", so codes cannot be probed.
  const invalid = new InviteError(400, 'That code does not work for this account. Check it, and make sure you are signed in with the email it was sent to.');
  const code = normalizeCode(rawCode);
  if (!code || !userEmail) throw invalid;

  const { rows } = await pool.query('SELECT * FROM invite_codes WHERE code = $1', [code]);
  const invite = rows[0];
  if (!invite || normalizeEmail(invite.email) !== normalizeEmail(userEmail)) throw invalid;

  const nowIso = new Date().toISOString();
  if (invite.revoked_at) throw new InviteError(410, 'That code has been cancelled.');
  if (invite.redeemed_by) throw new InviteError(409, 'That code has already been used.');
  if (invite.expires_at <= nowIso) throw new InviteError(410, 'That code has expired. Ask for a new one.');

  // Claim first, so two quick submits cannot both be paid out.
  const claim = await pool.query(
    'UPDATE invite_codes SET redeemed_by = $1, redeemed_at = $2 WHERE code = $3 AND redeemed_by IS NULL AND revoked_at IS NULL AND expires_at > $2',
    [userId, nowIso, code]
  );
  if (!claim.rowCount) throw new InviteError(409, 'That code has already been used.');

  try {
    await pool.query(
      'INSERT INTO users (id, questions_used, last_reset_date, has_seen_welcome_modal) VALUES ($1, 0, $2, FALSE) ON CONFLICT (id) DO NOTHING',
      [userId, startOfWeekIso()]
    );
    await pool.query('UPDATE users SET bonus_questions = COALESCE(bonus_questions, 0) + $1 WHERE id = $2', [Number(invite.questions), userId]);
  } catch (err) {
    // Nothing was paid out, so give the code back rather than burn it.
    await pool.query('UPDATE invite_codes SET redeemed_by = NULL, redeemed_at = NULL WHERE code = $1', [code]).catch(() => {});
    throw err;
  }

  const { rows: userRows } = await pool.query('SELECT bonus_questions FROM users WHERE id = $1', [userId]);
  logger.info(`Invite redeemed by user ${userId}: ${invite.questions} questions.`);
  return { questionsAdded: Number(invite.questions), bonusQuestions: Number(userRows[0]?.bonus_questions) || 0 };
}

module.exports = { InviteError, createInvite, listInvites, revokeInvite, redeemInvite, normalizeCode, normalizeEmail };
