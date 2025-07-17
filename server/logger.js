const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, align, splat } = format;

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
  return `${timestamp} ${level}: ${stack || message} ${metaString}`;
});

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : process.env.VITE_APP_LOG_LEVEL || 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    splat(), // Important for formatting metadata
    logFormat
  ),
  transports: [
    new transports.Console({
      format: combine(
        colorize(),
        align(),
        splat(), // Also add splat here for consistent console output
        logFormat
      )
    }),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' })
  ],
  exceptionHandlers: [
    new transports.File({ filename: 'logs/exceptions.log' })
  ],
  rejectionHandlers: [
    new transports.File({ filename: 'logs/rejections.log' })
  ]
});

module.exports = logger;
