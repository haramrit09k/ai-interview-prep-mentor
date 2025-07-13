require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');
const { authMiddleware } = require('./auth');
const { generateQuestionsForSkill } = require('./geminiService');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Stripe with your secret key
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY);
const logger = require('./logger');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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

// --- API Routes ---
app.get('/api/quota', authMiddleware, async (req, res) => {
  logger.debug(`GET /api/quota: User ID: ${req.userId}`);
  try {
    const { rows } = await pool.query('SELECT questions_used, last_reset_date, has_seen_welcome_modal FROM users WHERE id = $1', [req.userId]);
    if (rows.length > 0) {
      logger.info(`GET /api/quota: Found user ${req.userId}. Quota: ${rows[0].questions_used}, Welcome Modal Seen: ${rows[0].has_seen_welcome_modal}`);
      res.json({
        questionsUsed: rows[0].questions_used,
        lastResetDate: typeof rows[0].last_reset_date === 'string' ? rows[0].last_reset_date : rows[0].last_reset_date.toISOString().split('T')[0],
        hasSeenWelcomeModal: rows[0].has_seen_welcome_modal
      });
    } else {
      // User not found, create them
      const today = new Date().toISOString().split('T')[0];
      logger.info(`GET /api/quota: User ${req.userId} not found, creating new entry.`);
      await pool.query('INSERT INTO users (id, questions_used, last_reset_date, has_seen_welcome_modal) VALUES ($1, 0, $2, FALSE)', [req.userId, today]);
      res.json({
        questionsUsed: 0,
        lastResetDate: today,
        hasSeenWelcomeModal: false
      });
    }
  } catch (err) {
    logger.error(`GET /api/quota: Error for user ${req.userId}:`, err.message);
    res.status(500).send('Server Error');
  }
});

app.post('/api/quota/increment', express.json(), authMiddleware, async (req, res) => {
  logger.debug(`POST /api/quota/increment: User ID: ${req.userId}`);
  try {
    await pool.query('UPDATE users SET questions_used = questions_used + 1 WHERE id = $1', [req.userId]);
    logger.info(`POST /api/quota/increment: Quota incremented for user ${req.userId}.`);
    res.status(200).send('Quota updated');
  } catch (err) {
    logger.error(`POST /api/quota/increment: Error for user ${req.userId}:`, err.message);
    res.status(500).send('Server Error');
  }
});

app.post('/api/user/seen-welcome-modal', express.json(), authMiddleware, async (req, res) => {
  logger.debug(`POST /api/user/seen-welcome-modal: User ID: ${req.userId}`);
  try {
    await pool.query('UPDATE users SET has_seen_welcome_modal = TRUE WHERE id = $1', [req.userId]);
    logger.info(`POST /api/user/seen-welcome-modal: Welcome modal status updated for user ${req.userId}.`);
    res.status(200).send('Welcome modal status updated');
  } catch (err) {
    logger.error(`POST /api/user/seen-welcome-modal: Error for user ${req.userId}:`, err.message);
    res.status(500).send('Server Error');
  }
});

app.get('/api/questions', authMiddleware, async (req, res) => {
  logger.debug(`GET /api/questions: User ID: ${req.userId}`);
  const { skillName, level, count, skillId } = req.query; // skillId is now expected
  const requestedCount = parseInt(count, 10);

  if (!skillName || !level || !skillId || isNaN(requestedCount) || requestedCount <= 0) {
    logger.warn(`GET /api/questions: Invalid request parameters for user ${req.userId}.`);
    return res.status(400).send('Missing or invalid parameters: skillName, level, count, skillId');
  }

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
      
      // Update the stored map by removing the questions that were taken
      storedQuestionMap[skillId][level] = questionsForLevel.slice(numToTake);
      logger.info(`GET /api/questions: Returning ${numToTake} questions from storage for user ${req.userId}.`);
    }

    if (remainingCount > 0) {
      logger.info(`GET /api/questions: Generating ${remainingCount} new questions for user ${req.userId}.`);
      const newQuestions = await generateQuestionsForSkill(skillName, level, remainingCount, skillId);
      questionsToReturn = [...questionsToReturn, ...newQuestions];
    }

    await pool.query('UPDATE users SET unanswered_questions = $1 WHERE id = $2', [JSON.stringify(storedQuestionMap), req.userId]);
    logger.info(`GET /api/questions: Updated unanswered questions in DB for user ${req.userId}.`);

    res.json({ questions: questionsToReturn });

  } catch (err) {
    logger.error(`GET /api/questions: Error for user ${req.userId}:`, err.message);
    res.status(500).send('Server Error');
  }
});

app.post('/api/questions/save-unanswered', express.json(), authMiddleware, async (req, res) => {
  logger.debug(`POST /api/questions/save-unanswered: User ID: ${req.userId}`);
  const { unansweredQuestions } = req.body; // Expects an array of question objects with skillId and level

  if (!unansweredQuestions || !Array.isArray(unansweredQuestions) || unansweredQuestions.length === 0) {
    return res.status(400).send('Invalid or empty unansweredQuestions array');
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

      // Avoid duplicates
      if (!storedQuestionMap[skillId][level].some(q => q.text === text)) {
        storedQuestionMap[skillId][level].push(question);
      }
    });

    await pool.query('UPDATE users SET unanswered_questions = $1 WHERE id = $2', [JSON.stringify(storedQuestionMap), req.userId]);
    logger.info(`POST /api/questions/save-unanswered: Saved unanswered questions for user ${req.userId}.`);
    res.status(200).send('Unanswered questions saved');
  } catch (err) {
    logger.error(`POST /api/questions/save-unanswered: Error for user ${req.userId}:`, err.message);
    res.status(500).send('Server Error');
  }
});

// New endpoint to create a Stripe Checkout Session
app.post('/api/create-checkout-session', express.json(), authMiddleware, async (req, res) => {
  logger.debug(`POST /api/create-checkout-session: User ID: ${req.userId}`);
  const { quantity } = req.body; // Assuming frontend sends the quantity of questions to buy

  // Define pricing tiers (in cents)
  const pricingTiers = {
    10: 20,   // 10 questions for $0.20
    50: 80,   // 50 questions for $0.80
    100: 150, // 100 questions for $1.50
  };

  const unit_amount = pricingTiers[quantity];

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
    res.status(500).json({ error: e.message });
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
    return res.status(400).send(`Webhook Error: ${err.message}`);
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
          return res.status(500).send('Database update failed');
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

// Endpoint for frontend logging
app.post('/api/log', express.json(), (req, res) => {
  const { level, message, context } = req.body;
  if (logger[level]) {
    logger[level](`[FRONTEND] ${message}`, context);
  } else {
    logger.info(`[FRONTEND] ${message}`, context); // Default to info if level is unknown
  }
  res.status(200).send('Log received');
});

app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
});
