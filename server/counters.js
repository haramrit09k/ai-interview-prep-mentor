// Counters in Redis for the usage limits.
//
// Every limit here used to read a number, decide, call the AI, and only then write the number back. Requests
// that arrive at the same moment all read the same old number and all go ahead, so firing many requests in
// parallel got around the limit. These counters add first and look at the result: Redis does INCRBY as one
// step, so each request gets its own place in line and only as many as are allowed can pass.
const redisClient = require('./redisClient');
const logger = require('./logger');

/**
 * Adds `delta` to a counter and returns the new value. The expiry is set when the counter is created, or
 * (with refresh) every time, so a counter always goes away by itself.
 */
async function bump(key, delta, ttlSeconds, { refresh = false } = {}) {
  const value = await redisClient.incrBy(key, delta);
  if (refresh || value === delta) await redisClient.expire(key, ttlSeconds);
  return value;
}

/** The current value of a counter, or 0 if there is none. */
async function readCounter(key) {
  return parseInt(await redisClient.get(key), 10) || 0;
}

/**
 * Takes up to `wanted` places from a counter that may not go over `limit`, and returns how many it got.
 * It takes them first and gives back any excess, so requests at the same time cannot all take the same places.
 * If Redis is unavailable it grants everything and logs it, so an outage does not lock every user out.
 */
async function takeUpTo(key, wanted, limit, ttlSeconds, { floor = 0 } = {}) {
  try {
    const total = await bump(key, wanted, ttlSeconds);
    const excess = total - Math.max(limit, floor);
    if (excess <= 0) return wanted;
    const giveBack = Math.min(excess, wanted);
    await bump(key, -giveBack, ttlSeconds);
    return wanted - giveBack;
  } catch (err) {
    logger.error(`Counter ${key.split(':')[0]}: could not reserve places:`, err.message);
    return wanted;
  }
}

/** Gives places back, never taking a counter below zero. */
async function giveBack(key, count, ttlSeconds) {
  if (count <= 0) return;
  try {
    const value = await bump(key, -count, ttlSeconds);
    if (value < 0) await bump(key, -value, ttlSeconds);
  } catch (err) {
    logger.error(`Counter ${key.split(':')[0]}: could not give places back:`, err.message);
  }
}

module.exports = { bump, readCounter, takeUpTo, giveBack };
