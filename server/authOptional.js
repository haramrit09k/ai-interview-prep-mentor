const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const logger = require('./logger');

async function authOptionalMiddleware(req, res, next) {
  logger.debug('authOptionalMiddleware: Received request.');
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.debug('authOptionalMiddleware: No valid Authorization header found. Proceeding as guest.');
    return next(); // Proceed without a userId
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    logger.debug('authOptionalMiddleware: Token missing from Bearer header. Proceeding as guest.');
    return next(); // Proceed without a userId
  }

  try {
    logger.debug('authOptionalMiddleware: Verifying token...');
    const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    req.userId = payload['sub']; // 'sub' is the user's unique Google ID
    logger.debug(`authOptionalMiddleware: Token verified. User ID: ${req.userId}`);
  } catch (error) {
    logger.warn('authOptionalMiddleware: Error verifying token, proceeding as guest.', error);
    // Don't block the request, just log the warning and proceed as a guest.
  }
  
  next();
}

module.exports = { authOptionalMiddleware };
