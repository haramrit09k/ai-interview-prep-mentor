require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');
const { authMiddleware } = require('./auth');
const { authOptionalMiddleware } = require('./authOptional');
const { generateQuestionsForSkill, evaluateAnswer, transcribeAudio } = require('./geminiService');
const { analyzeDelivery, sanitizeDelivery } = require('./deliveryStats');
const { computeInsights, computeSkillReview } = require('./insights');
const { insertAnswer, listAnswers, listAnswersForSkill, recentQuestions, deleteAnswers } = require('./answerLog');
const { LIMITS, LEVELS, cleanBlock } = require('./prompts');
const Stripe = require('stripe');
const redisClient = require('./redisClient');
const { rateLimiter } = require('./rateLimiter');
const crypto = require('crypto');

// Authoritative price list. Keep in sync with config/purchaseOptions.ts.
// The client only chooses a quantity; the price is always looked up here.
const PURCHASE_OPTIONS = { 10: 199, 50: 499, 100: 799 };

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Stripe with your secret key
const logger = require('./logger');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Behind Heroku's router, req.ip is the router unless we trust the first proxy hop
app.set('trust proxy', 1);

// Middleware
// For production, configure CORS to only allow your frontend domain
app.use(cors()); 

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`Incoming Request: ${req.method} ${req.originalUrl}`);
  const start = process.hrtime();

  res.on('finish', () => {
    const durationInMilliseconds = getDurationInMilliseconds(start);
    logger.info(`Outgoing Response: ${req.method} ${req.originalUrl} ${res.statusCode} ${durationInMilliseconds.toLocaleString()} ms`);
  });

  next();
});

// Helper function for timing
const getDurationInMilliseconds = (start) => {
  const NS_PER_SEC = 1e9;
  const NS_TO_MS = 1e6;
  const diff = process.hrtime(start);
  return (diff[0] * NS_PER_SEC + diff[1]) / NS_TO_MS;
};

// Helper function to get the start of the current week (Monday)
const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay(); // Sunday - 0, Monday - 1, ..., Saturday - 6
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// --- API Routes ---
app.get('/api/quota', authMiddleware, async (req, res) => {
  logger.debug(`GET /api/quota: User ID: ${req.userId}`);
  try {
    const { rows } = await pool.query('SELECT questions_used, last_reset_date, has_seen_welcome_modal FROM users WHERE id = $1', [req.userId]);
    const now = new Date();
    const startOfCurrentWeek = getStartOfWeek(now);

    if (rows.length > 0) {
      const user = rows[0];
      const lastResetDate = user.last_reset_date ? new Date(user.last_reset_date) : new Date(0);
      const startOfLastResetWeek = getStartOfWeek(lastResetDate);

      // Check if the last reset was in a previous week
      if (startOfCurrentWeek.getTime() > startOfLastResetWeek.getTime()) {
        logger.info(`New week detected. Resetting weekly quota for user ${req.userId}.`);
        const newResetTimestamp = startOfCurrentWeek.toISOString();
        await pool.query('UPDATE users SET questions_used = 0, last_reset_date = $1 WHERE id = $2', [newResetTimestamp, req.userId]);
        res.json({
          questionsUsed: 0,
          lastResetDate: newResetTimestamp,
          hasSeenWelcomeModal: user.has_seen_welcome_modal
        });
      } else {
        // Quota is still within the current week
        logger.info(`GET /api/quota: Found user ${req.userId}. Quota is still valid for the current week.`);
        res.json({
          questionsUsed: user.questions_used,
          lastResetDate: user.last_reset_date,
          hasSeenWelcomeModal: user.has_seen_welcome_modal
        });
      }
    } else {
      // User not found, create them with the start of the current week as reset date
      const newResetTimestamp = startOfCurrentWeek.toISOString();
      logger.info(`GET /api/quota: User ${req.userId} not found, creating new entry with weekly reset.`);
      await pool.query('INSERT INTO users (id, questions_used, last_reset_date, has_seen_welcome_modal) VALUES ($1, 0, $2, FALSE)', [req.userId, newResetTimestamp]);
      res.json({
        questionsUsed: 0,
        lastResetDate: newResetTimestamp,
        hasSeenWelcomeModal: false
      });
    }
  } catch (err) {
    logger.error(`GET /api/quota: Error for user ${req.userId}:`, err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

app.post('/api/quota/increment', express.json(), authMiddleware, async (req, res) => {
  logger.debug(`POST /api/quota/increment: User ID: ${req.userId}`);
  try {
    await pool.query('UPDATE users SET questions_used = questions_used + 1 WHERE id = $1', [req.userId]);
    logger.info(`POST /api/quota/increment: Quota incremented for user ${req.userId}.`);
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error(`POST /api/quota/increment: Error for user ${req.userId}:`, err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

app.post('/api/user/seen-welcome-modal', express.json(), authMiddleware, async (req, res) => {
  logger.debug(`POST /api/user/seen-welcome-modal: User ID: ${req.userId}`);
  try {
    await pool.query('UPDATE users SET has_seen_welcome_modal = TRUE WHERE id = $1', [req.userId]);
    logger.info(`POST /api/user/seen-welcome-modal: Welcome modal status updated for user ${req.userId}.`);
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error(`POST /api/user/seen-welcome-modal: Error for user ${req.userId}:`, err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

app.get('/api/questions', authOptionalMiddleware, rateLimiter, async (req, res) => {
  logger.debug(`GET /api/questions: User ID: ${req.userId}`);
  const { skillName, level, count, skillId } = req.query; // skillId is now expected
  // Cap the size of a session, which also caps what one request can cost.
  const requestedCount = Math.min(parseInt(count, 10), LIMITS.MAX_QUESTIONS);

  if (!skillName || !skillId || !LEVELS.includes(level) || isNaN(requestedCount) || requestedCount <= 0) {
    logger.warn(`GET /api/questions: Invalid request parameters for user ${req.userId}.`);
    return res.status(400).json({ error: 'Missing or invalid parameters: skillName, level, count, skillId' });
  }

  if (req.userId) {
    // Authenticated user logic
    try {
      const { rows } = await pool.query('SELECT unanswered_questions FROM users WHERE id = $1', [req.userId]);
      let storedQuestionMap = {};
      if (rows.length > 0 && rows[0].unanswered_questions) {
        storedQuestionMap = JSON.parse(rows[0].unanswered_questions);
        logger.info(`GET /api/questions: Found stored questions for user ${req.userId}.`);
      }

      const questionsForLevel = storedQuestionMap[skillId]?.[level] || [];
      let questionsToReturn = [];
      let remainingCount = requestedCount;

      if (questionsForLevel.length > 0) {
        const numToTake = Math.min(requestedCount, questionsForLevel.length);
        questionsToReturn = questionsForLevel.slice(0, numToTake);
        remainingCount -= numToTake;
        
        if (storedQuestionMap[skillId] && storedQuestionMap[skillId][level]) {
          delete storedQuestionMap[skillId][level];
          if (Object.keys(storedQuestionMap[skillId]).length === 0) {
            delete storedQuestionMap[skillId];
          }
        }
        logger.info(`GET /api/questions: Returning ${numToTake} questions from storage for user ${req.userId} and clearing them.`);
      }

      if (remainingCount > 0) {
        logger.info(`GET /api/questions: Generating ${remainingCount} new questions for user ${req.userId}.`);
        // Tell the model what this user has already seen for this skill so it does not repeat itself.
        // The lookup is best effort: if it fails we still generate, just without the hint.
        let avoid = questionsToReturn.map((q) => q.text);
        try {
          avoid = [...avoid, ...(await recentQuestions(req.userId, String(skillId), LIMITS.AVOID_ITEMS))];
        } catch (lookupErr) {
          logger.warn(`GET /api/questions: could not load recent questions for user ${req.userId}: ${lookupErr.message}`);
        }
        const newQuestions = await generateQuestionsForSkill(skillName, level, remainingCount, skillId, avoid);
        questionsToReturn = [...questionsToReturn, ...newQuestions];
      }

      await pool.query('UPDATE users SET unanswered_questions = $1 WHERE id = $2', [JSON.stringify(storedQuestionMap), req.userId]);
      logger.info(`GET /api/questions: Updated unanswered questions in DB for user ${req.userId}.`);

      res.json({ questions: questionsToReturn });

    } catch (err) {
      logger.error(`GET /api/questions: Error for user ${req.userId}:`, err.message);
      res.status(500).json({ error: 'Server Error' });
    }
  } else {
    // Guest user logic
    try {
      logger.info(`GET /api/questions: Generating ${requestedCount} new questions for guest user.`);
      const newQuestions = await generateQuestionsForSkill(skillName, level, requestedCount, skillId);
      res.json({ questions: newQuestions });
    } catch (err) {
      logger.error(`GET /api/questions: Error for guest user:`, err.message);
      res.status(500).json({ error: 'Server Error' });
    }
  }
});


app.post('/api/evaluate', express.json(), authOptionalMiddleware, rateLimiter, async (req, res) => {
  const { questionText, userAnswer, skillId, skillName, isIdk, delivery, isRetry } = req.body;

  if (typeof questionText !== 'string' || !questionText.trim() || typeof userAnswer !== 'string') {
    return res.status(400).json({ error: 'Missing questionText or userAnswer' });
  }

  try {
    // Create a hash of the user's answer to use in the cache key
    // Same trimming the prompt applies, so the cache key matches what the model actually sees.
    const question = cleanBlock(questionText, LIMITS.QUESTION);
    const answerHash = crypto.createHash('sha256').update(cleanBlock(userAnswer, LIMITS.ANSWER)).digest('hex');
    // The grade depends on the level and on whether the answer was spoken, so both are part of the key.
    const gradingLevel = LEVELS.includes(req.body.level) ? req.body.level : undefined;
    const cleanDelivery = sanitizeDelivery(delivery);
    const spoken = cleanDelivery !== null;
    const cacheKey = `evaluation:v2:${gradingLevel || 'unspecified'}:${spoken ? 'spoken' : 'typed'}:${question}:${answerHash}`;
    let evaluation;
    const cachedEvaluation = await redisClient.get(cacheKey);

    if (cachedEvaluation) {
      logger.info(`Cache hit for evaluation: ${cacheKey}`);
      evaluation = JSON.parse(cachedEvaluation);
    } else {
      logger.info(`Cache miss for evaluation: ${cacheKey}`);
      evaluation = await evaluateAnswer(questionText, userAnswer, { level: gradingLevel, spoken });
      await redisClient.set(cacheKey, JSON.stringify(evaluation), { EX: 604800 }); // Cache for 7 days
      logger.info(`Cached evaluation for key: ${cacheKey}`);
    }

    // Signed-in users get the answer recorded so progress insights can be built from it.
    // A retry after seeing the mentor answer is practice only, so it is not recorded.
    // A logging failure must never cost the user the evaluation they already waited for.
    if (req.userId && isRetry !== true && typeof skillId === 'string' && typeof skillName === 'string') {
      try {
        await insertAnswer({
          userId: req.userId,
          skillId,
          skillName,
          questionText,
          outcome: isIdk === true ? 'idk' : evaluation.classification,
          conceptsKnown: evaluation.conceptsKnown,
          conceptsToReview: evaluation.conceptsToReview,
          delivery: cleanDelivery,
          level: gradingLevel,
        });
      } catch (logErr) {
        logger.error(`Could not record answer for user ${req.userId}:`, logErr.message);
      }
    }

    res.json(evaluation);
  } catch (error) {
    // Nothing was cached above, so a transient Gemini failure is not remembered.
    logger.error('Error in /api/evaluate:', error);
    res.status(502).json({ error: 'The AI mentor is unavailable right now. Please try again in a moment.' });
  }
});

// Spoken answers. Audio is the most expensive request we accept, so it needs a signed-in user,
// has a small size cap, and is never stored: it is sent to Gemini for transcription and dropped.
const ALLOWED_AUDIO_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a']);

app.post('/api/transcribe', authMiddleware, rateLimiter, express.raw({ type: 'audio/*', limit: '5mb' }), async (req, res) => {
  const mimeType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_AUDIO_TYPES.has(mimeType)) {
    return res.status(415).json({ error: 'Unsupported audio format.' });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length < 1000) {
    return res.status(400).json({ error: 'The recording was empty. Please try again.' });
  }
  const durationMs = parseInt(req.headers['x-audio-duration-ms'], 10);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return res.status(400).json({ error: 'Missing recording length.' });
  }

  try {
    const transcript = await transcribeAudio(req.body, mimeType);
    if (!transcript) {
      return res.status(422).json({ error: 'We could not hear any speech. Check your microphone and try again.' });
    }
    res.json({ transcript, delivery: analyzeDelivery(transcript, durationMs) });
  } catch (error) {
    logger.error('Error in /api/transcribe:', error);
    res.status(502).json({ error: 'Transcription is unavailable right now. You can type your answer instead.' });
  }
});

app.get('/api/insights', authMiddleware, async (req, res) => {
  const offset = parseInt(req.query.tzOffset, 10);
  const tzOffsetMinutes = Number.isFinite(offset) ? Math.max(-840, Math.min(840, offset)) : 0;
  try {
    const rows = await listAnswers(req.userId);
    res.json(computeInsights(rows, { tzOffsetMinutes }));
  } catch (err) {
    logger.error(`GET /api/insights: Error for user ${req.userId}:`, err.message);
    res.status(500).json({ error: 'Could not load your progress.' });
  }
});

// Lets people erase their own practice history.
app.delete('/api/insights', authMiddleware, async (req, res) => {
  try {
    await deleteAnswers(req.userId);
    res.status(204).end();
  } catch (err) {
    logger.error(`DELETE /api/insights: Error for user ${req.userId}:`, err.message);
    res.status(500).json({ error: 'Could not delete your progress data.' });
  }
});

app.post('/api/questions/save-unanswered', express.json(), authMiddleware, async (req, res) => {
  logger.debug(`POST /api/questions/save-unanswered: User ID: ${req.userId}`);
  const { unansweredQuestions } = req.body; // Expects an array of question objects with skillId and level

  if (!unansweredQuestions || !Array.isArray(unansweredQuestions) || unansweredQuestions.length === 0) {
    return res.status(400).json({ error: 'Invalid or empty unansweredQuestions array' });
  }

  try {
    const { rows } = await pool.query('SELECT unanswered_questions FROM users WHERE id = $1', [req.userId]);
    let storedQuestionMap = {};
    if (rows.length > 0 && rows[0].unanswered_questions) {
      storedQuestionMap = JSON.parse(rows[0].unanswered_questions);
    }

    unansweredQuestions.forEach(question => {
      const { skillId, level, text } = question;
      if (!skillId || !level || !text) return; // Skip invalid questions

      if (!storedQuestionMap[skillId]) {
        storedQuestionMap[skillId] = {};
      }
      if (!storedQuestionMap[skillId][level]) {
        storedQuestionMap[skillId][level] = [];
      }

      // Avoid duplicates: check if the question text already exists for that skill and level
      if (!storedQuestionMap[skillId][level].some(q => q.text === text)) {
        storedQuestionMap[skillId][level].push(question);
        logger.debug(`Adding new unanswered question for skill ${skillId}: "${text}"`);
      } else {
        logger.debug(`Skipping duplicate unanswered question for skill ${skillId}: "${text}"`);
      }
    });

    await pool.query('UPDATE users SET unanswered_questions = $1 WHERE id = $2', [JSON.stringify(storedQuestionMap), req.userId]);
    logger.info(`POST /api/questions/save-unanswered: Saved unanswered questions for user ${req.userId}.`);
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error(`POST /api/questions/save-unanswered: Error for user ${req.userId}:`, err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

// A study sheet for one skill, built from every answer recorded for it. No model call, so it is instant.
// Summaries written by the old AI based review are still returned (as previousSummary) so nothing is lost.
app.get('/api/review/:skillId', authMiddleware, async (req, res) => {
  const skillId = String(req.params.skillId || '').slice(0, 100);
  try {
    const rows = await listAnswersForSkill(req.userId, skillId);
    const review = computeSkillReview(rows);

    let previousSummary = null;
    try {
      const { rows: userRows } = await pool.query('SELECT revision_summaries FROM users WHERE id = $1', [req.userId]);
      const stored = userRows.length > 0 && userRows[0].revision_summaries ? JSON.parse(userRows[0].revision_summaries) : {};
      const old = stored[skillId];
      // The old placeholder text for "nothing was answered" is not worth showing.
      if (old && old.conceptsKnown && !/^No questions were answered/.test(old.conceptsKnown)) previousSummary = old;
    } catch (summaryErr) {
      logger.warn(`GET /api/review: could not read the previous summary for user ${req.userId}: ${summaryErr.message}`);
    }

    res.json({ ...review, previousSummary });
  } catch (err) {
    logger.error(`GET /api/review/:skillId: Error for user ${req.userId}:`, err.message);
    res.status(500).json({ error: 'Could not load your review.' });
  }
});

// New endpoint to create a Stripe Checkout Session
app.post('/api/create-checkout-session', express.json(), authMiddleware, async (req, res) => {
  logger.debug(`POST /api/create-checkout-session: User ID: ${req.userId}`);
  const quantity = parseInt(req.body.quantity, 10);
  const unit_amount = PURCHASE_OPTIONS[quantity];

  if (unit_amount === undefined) {
    return res.status(400).json({ error: 'Invalid quantity selected.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Interview Questions Pack (${quantity} questions)`,
            },
            unit_amount: unit_amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/cancel`,
      metadata: { userId: req.userId, questionsToGrant: quantity }, // Pass userId to webhook
    });
    res.json({ url: session.url });
  } catch (e) {
    logger.error('Error creating checkout session:', e.message);
    res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
});

// Stripe Webhook endpoint
// This needs to be raw body, not JSON parsed
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error(`Webhook Error: ${err.message}`);
    logger.error(err); // Log the full error object
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      logger.info(`Checkout session completed for user ${session.metadata.userId}`);
      // Fulfill the purchase here
      const userId = session.metadata.userId;
      const questionsToGrant = parseInt(session.metadata.questionsToGrant, 10);

      if (userId && !isNaN(questionsToGrant)) {
        try {
          // Add questions to the user's quota
          await pool.query('UPDATE users SET questions_used = questions_used - $1 WHERE id = $2', [questionsToGrant, userId]);
          logger.info(`Granted ${questionsToGrant} questions to user ${userId}.`);
        } catch (dbErr) {
          logger.error(`Database error granting questions to ${userId}:`, dbErr.message);
          return res.status(500).json({ error: 'Database update failed' });
        }
      }
      break;
    // ... handle other event types
    default:
      logger.info(`Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  res.json({ received: true });
});

// Saves the questions a user did not get to when they close the page mid session. The browser sends this
// with sendBeacon, so there is no response to read. Older clients also send summary data, which is ignored.
app.post('/api/session/save-on-exit', express.json(), authMiddleware, async (req, res) => {
    logger.debug(`POST /api/session/save-on-exit: User ID: ${req.userId}`);
    const { unansweredQuestions } = req.body;

    if (!Array.isArray(unansweredQuestions) || unansweredQuestions.length === 0) {
        return res.status(200).json({ ok: true });
    }

    try {
        const { rows } = await pool.query('SELECT unanswered_questions FROM users WHERE id = $1', [req.userId]);
        let storedQuestionMap = (rows.length > 0 && rows[0].unanswered_questions) ? JSON.parse(rows[0].unanswered_questions) : {};

        unansweredQuestions.forEach(question => {
            const { skillId, level, text } = question;
            if (!skillId || !level || !text) return;
            if (!storedQuestionMap[skillId]) storedQuestionMap[skillId] = {};
            if (!storedQuestionMap[skillId][level]) storedQuestionMap[skillId][level] = [];
            if (!storedQuestionMap[skillId][level].some(q => q.text === text)) {
                storedQuestionMap[skillId][level].push(question);
            }
        });
        await pool.query('UPDATE users SET unanswered_questions = $1 WHERE id = $2', [JSON.stringify(storedQuestionMap), req.userId]);
        logger.info(`Saved unanswered questions for user ${req.userId} on exit.`);
        res.status(200).json({ ok: true });
    } catch (err) {
        logger.error(`Error in /api/session/save-on-exit for user ${req.userId}:`, err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});


// --- Serve React App in Production ---
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the React app
  app.use(express.static(path.join(__dirname, '../dist')));

  // The "catchall" handler: for any request that doesn't
  // match one above, send back React's index.html file.
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Last-resort error handler: always answer with JSON, never an HTML/plain-text stack page
app.use((err, req, res, next) => {
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Server Error' });
});

// Only start listening when run directly (npm start / Heroku). Tests import the app instead.
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
  });
}

module.exports = app;