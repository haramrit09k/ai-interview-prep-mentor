const crypto = require('crypto');
const db = require('./db');

const MAX_ROWS = 2000; // plenty for insights, and keeps the query bounded
const clip = (value, max) => String(value ?? '').slice(0, max);
const cleanConcepts = (list) =>
  JSON.stringify((Array.isArray(list) ? list : []).filter((c) => typeof c === 'string').slice(0, 10).map((c) => clip(c, 100)));

async function insertAnswer({ userId, skillId, skillName, questionText, outcome, conceptsKnown, conceptsToReview, delivery, level }) {
  await db.query(
    `INSERT INTO answer_log
      (id, user_id, skill_id, skill_name, question_text, outcome, concepts_known, concepts_to_review,
       duration_sec, word_count, wpm, filler_count, answered_at, level)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      crypto.randomUUID(),
      userId,
      clip(skillId, 100),
      clip(skillName, 100),
      clip(questionText, 1000),
      outcome,
      cleanConcepts(conceptsKnown),
      cleanConcepts(conceptsToReview),
      delivery ? delivery.durationSec : null,
      delivery ? delivery.wordCount : null,
      delivery ? delivery.wpm : null,
      delivery ? delivery.fillerTotal : null,
      new Date().toISOString(),
      level ? clip(level, 20) : null,
    ]
  );
}

/** Most recent answers for a user, returned oldest first. */
async function listAnswers(userId) {
  const { rows } = await db.query(
    'SELECT * FROM answer_log WHERE user_id = $1 ORDER BY answered_at DESC LIMIT ' + MAX_ROWS,
    [userId]
  );
  return rows.reverse();
}

const MAX_SKILL_ROWS = 1000;

/** Every recorded answer for one skill, oldest first. Uses the (user, skill, time) index. */
async function listAnswersForSkill(userId, skillId) {
  const { rows } = await db.query(
    'SELECT * FROM answer_log WHERE user_id = $1 AND skill_id = $2 ORDER BY answered_at DESC LIMIT ' + MAX_SKILL_ROWS,
    [userId, clip(skillId, 100)]
  );
  return rows.reverse();
}

/**
 * The user's most recently answered questions for one skill, newest first, without duplicates.
 * Used to tell the model what not to ask again. Kept small on purpose: a few dozen rows read,
 * at most `limit` short strings returned.
 */
async function recentQuestions(userId, skillId, limit = 10) {
  const wanted = Math.max(1, Math.min(Math.floor(Number(limit)) || 10, 50));
  const { rows } = await db.query(
    'SELECT question_text FROM answer_log WHERE user_id = $1 AND skill_id = $2 ORDER BY answered_at DESC LIMIT ' + wanted * 3,
    [userId, skillId]
  );
  return [...new Set(rows.map((r) => r.question_text))].slice(0, wanted);
}

async function deleteAnswers(userId) {
  await db.query('DELETE FROM answer_log WHERE user_id = $1', [userId]);
}

/** Removes every recorded answer for one skill, which is what deleting a skill in the app promises. */
async function deleteAnswersForSkill(userId, skillId) {
  await db.query('DELETE FROM answer_log WHERE user_id = $1 AND skill_id = $2', [userId, clip(skillId, 100)]);
}

module.exports = { insertAnswer, listAnswers, listAnswersForSkill, recentQuestions, deleteAnswers, deleteAnswersForSkill };
