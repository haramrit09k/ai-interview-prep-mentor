
const redis = require('redis');
const logger = require('./logger');

// Heroku provides the REDIS_URL environment variable.
// The node-redis client needs this URL to be passed explicitly.
const clientOptions = {
  url: process.env.REDIS_URL
};

// For Heroku Redis, which uses self-signed certificates, we need to disable the certificate check.
if (process.env.REDIS_URL && process.env.REDIS_URL.startsWith('rediss://')) {
  clientOptions.socket = {
    tls: true,
    rejectUnauthorized: false
  };
}

const redisClient = redis.createClient(clientOptions);

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
