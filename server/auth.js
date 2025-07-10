const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function authMiddleware(req, res, next) {
  console.log('authMiddleware: Received request.');
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.log('authMiddleware: Authorization header missing.');
    return res.status(401).send('Authorization header missing');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    console.log('authMiddleware: Token missing.');
    return res.status(401).send('Token missing');
  }

  try {
    console.log('authMiddleware: Verifying token...');
    const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    req.userId = payload['sub']; // 'sub' is the user's unique Google ID
    console.log(`authMiddleware: Token verified. User ID: ${req.userId}`);
    next();
  } catch (error) {
    console.error('authMiddleware: Error verifying token', error);
    res.status(401).send('Invalid token');
  }
}

module.exports = { authMiddleware };
