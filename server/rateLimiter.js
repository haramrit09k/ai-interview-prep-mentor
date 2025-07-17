
const redisClient = require('./redisClient');
const logger = require('./logger');

const WINDOW_SIZE_IN_HOURS = 1;
const MAX_WINDOW_REQUEST_COUNT = 100;
const WINDOW_LOG_INTERVAL_IN_SECONDS = 3600; // 1 hour

const getIdentifier = (req) => req.userId || req.ip;

const rateLimiter = async (req, res, next) => {
  try {
    const identifier = getIdentifier(req);
    const record = await redisClient.get(identifier);
    const currentRequestTime = new Date();

    // If no record exists for this user, create one and allow the request
    if (record == null) {
      let newRecord = [];
      let requestLog = {
        requestTimeStamp: currentRequestTime.toISOString(),
        requestCount: 1,
      };
      newRecord.push(requestLog);
      await redisClient.set(identifier, JSON.stringify(newRecord));
      return next();
    }

    // If a record exists, parse it and check the window
    let data = JSON.parse(record);
    let windowStartTimestamp = new Date();
    windowStartTimestamp.setHours(windowStartTimestamp.getHours() - WINDOW_SIZE_IN_HOURS);

    let requestsWithinWindow = data.filter((entry) => {
      return new Date(entry.requestTimeStamp) > windowStartTimestamp;
    });

    let totalWindowRequestsCount = requestsWithinWindow.reduce((acc, entry) => {
      return acc + entry.requestCount;
    }, 0);

    // If the number of requests exceeds the limit, deny the request
    if (totalWindowRequestsCount >= MAX_WINDOW_REQUEST_COUNT) {
      logger.warn(`Rate limit exceeded for user ${req.userId}`);
      return res.status(429).json({ message: `You have exceeded the ${MAX_WINDOW_REQUEST_COUNT} requests in ${WINDOW_SIZE_IN_HOURS} hour limit!` });
    } else {
      // Otherwise, log the new request and allow it
      let lastRequestLog = data[data.length - 1];
      let potentialCurrentWindowIntervalStartTimeStamp = new Date();
      potentialCurrentWindowIntervalStartTimeStamp.setSeconds(potentialCurrentWindowIntervalStartTimeStamp.getSeconds() - WINDOW_LOG_INTERVAL_IN_SECONDS);

      if (new Date(lastRequestLog.requestTimeStamp) > potentialCurrentWindowIntervalStartTimeStamp) {
        lastRequestLog.requestCount++;
        requestsWithinWindow[requestsWithinWindow.length - 1] = lastRequestLog;
      } else {
        requestsWithinWindow.push({
          requestTimeStamp: currentRequestTime.toISOString(),
          requestCount: 1,
        });
      }
      await redisClient.set(identifier, JSON.stringify(requestsWithinWindow));
      return next();
    }
  } catch (error) {
    logger.error('Error in rate limiter middleware:', error);
    return next(error);
  }
};

module.exports = { rateLimiter };
