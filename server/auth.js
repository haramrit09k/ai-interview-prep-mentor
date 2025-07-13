const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const logger = require('./logger');

async function authMiddleware(req, res, next) {
  logger.debug('authMiddleware: Received request.');
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    logger.warn('authMiddleware: Authorization header missing.');
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    logger.warn('authMiddleware: Token missing.');
    return res.status(401).json({ error: 'Token missing' });
  }

  try {
    logger.debug('authMiddleware: Verifying token...');
    const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    req.userId = payload['sub']; // 'sub' is the user's unique Google ID
    logger.info(`authMiddleware: Token verified. User ID: ${req.userId}`);
    next();
  } catch (error) {
    logger.error('authMiddleware: Error verifying token', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authMiddleware };
