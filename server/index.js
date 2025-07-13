require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');
const { authMiddleware } = require('./auth');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Stripe with your secret key
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY);
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
// For production, configure CORS to only allow your frontend domain
app.use(cors()); 

// --- API Routes ---
app.get('/api/quota', authMiddleware, async (req, res) => {
  console.log(`GET /api/quota: User ID: ${req.userId}`);
  try {
    const { rows } = await pool.query('SELECT questions_used, last_reset_date, has_seen_welcome_modal FROM users WHERE id = $1', [req.userId]);
    if (rows.length > 0) {
      console.log(`GET /api/quota: Found user ${req.userId}. Quota: ${rows[0].questions_used}, Welcome Modal Seen: ${rows[0].has_seen_welcome_modal}`);
      res.json({
        questionsUsed: rows[0].questions_used,
        lastResetDate: typeof rows[0].last_reset_date === 'string' ? rows[0].last_reset_date : rows[0].last_reset_date.toISOString().split('T')[0],
        hasSeenWelcomeModal: rows[0].has_seen_welcome_modal
      });
    } else {
      // User not found, create them
      const today = new Date().toISOString().split('T')[0];
      console.log(`GET /api/quota: User ${req.userId} not found, creating new entry.`);
      await pool.query('INSERT INTO users (id, questions_used, last_reset_date, has_seen_welcome_modal) VALUES ($1, 0, $2, FALSE)', [req.userId, today]);
      res.json({
        questionsUsed: 0,
        lastResetDate: today,
        hasSeenWelcomeModal: false
      });
    }
  } catch (err) {
    console.error(`GET /api/quota: Error for user ${req.userId}:`, err.message);
    res.status(500).send('Server Error');
  }
});

app.post('/api/quota/increment', express.json(), authMiddleware, async (req, res) => {
  console.log(`POST /api/quota/increment: User ID: ${req.userId}`);
  try {
    await pool.query('UPDATE users SET questions_used = questions_used + 1 WHERE id = $1', [req.userId]);
    console.log(`POST /api/quota/increment: Quota incremented for user ${req.userId}.`);
    res.status(200).send('Quota updated');
  } catch (err) {
    console.error(`POST /api/quota/increment: Error for user ${req.userId}:`, err.message);
    res.status(500).send('Server Error');
  }
});

app.post('/api/user/seen-welcome-modal', express.json(), authMiddleware, async (req, res) => {
  console.log(`POST /api/user/seen-welcome-modal: User ID: ${req.userId}`);
  try {
    await pool.query('UPDATE users SET has_seen_welcome_modal = TRUE WHERE id = $1', [req.userId]);
    console.log(`POST /api/user/seen-welcome-modal: Welcome modal status updated for user ${req.userId}.`);
    res.status(200).send('Welcome modal status updated');
  } catch (err) {
    console.error(`POST /api/user/seen-welcome-modal: Error for user ${req.userId}:`, err.message);
    res.status(500).send('Server Error');
  }
});

// New endpoint to create a Stripe Checkout Session
app.post('/api/create-checkout-session', express.json(), authMiddleware, async (req, res) => {
  console.log(`POST /api/create-checkout-session: User ID: ${req.userId}`);
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
    console.error('Error creating checkout session:', e.message);
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
    console.error(`Webhook Error: ${err.message}`);
    console.error(err); // Log the full error object
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log(`Checkout session completed for user ${session.metadata.userId}`);
      // Fulfill the purchase here
      const userId = session.metadata.userId;
      const questionsToGrant = parseInt(session.metadata.questionsToGrant, 10);

      if (userId && !isNaN(questionsToGrant)) {
        try {
          // Add questions to the user's quota
          await pool.query('UPDATE users SET questions_used = questions_used - $1 WHERE id = $2', [questionsToGrant, userId]);
          console.log(`Granted ${questionsToGrant} questions to user ${userId}.`);
        } catch (dbErr) {
          console.error(`Database error granting questions to ${userId}:`, dbErr.message);
          return res.status(500).send('Database update failed');
        }
      }
      break;
    // ... handle other event types
    default:
      console.log(`Unhandled event type ${event.type}`);
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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
