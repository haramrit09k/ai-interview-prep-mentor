
const redis = require('redis');
const logger = require('./logger');

const redisClient = redis.createClient({
  // By default, it connects to redis://127.0.0.1:6379
  // Heroku will provide a REDIS_URL environment variable that the client will automatically use.
});

redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error', err);
});

// The client needs to be connected to be used.
// We'll connect here and the rest of the app can use the client.
redisClient.connect();

module.exports = redisClient;
