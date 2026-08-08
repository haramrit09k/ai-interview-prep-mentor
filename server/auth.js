const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const logger = require('./logger');

async function authMiddleware(req, res, next) {
  logger.debug('authMiddleware: Received request.');
  const token = req.cookies?.google_id_token;
  if (!token) {
    logger.warn('authMiddleware: Auth cookie missing.');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    logger.debug('authMiddleware: Verifying token...');
    const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    req.userId = payload['sub']; // 'sub' is the user's unique Google ID
    logger.debug(`authMiddleware: Token verified. User ID: ${req.userId}`);
    next();
  } catch (error) {
    logger.error('authMiddleware: Error verifying token', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authMiddleware };
