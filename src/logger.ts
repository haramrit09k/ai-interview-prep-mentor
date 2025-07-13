// src/logger.ts

const LOG_LEVEL = import.meta.env.VITE_APP_LOG_LEVEL || 'info'; // Default to 'info'

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const currentLogLevel = LOG_LEVELS[LOG_LEVEL.toLowerCase()] || LOG_LEVELS.info;

const logger = {
  debug: (...args: any[]) => {
    if (currentLogLevel <= LOG_LEVELS.debug) {
      console.debug('[DEBUG]', ...args);
    }
  },
  info: (...args: any[]) => {
    if (currentLogLevel <= LOG_LEVELS.info) {
      console.info('[INFO]', ...args);
    }
  },
  warn: (...args: any[]) => {
    if (currentLogLevel <= LOG_LEVELS.warn) {
      console.warn('[WARN]', ...args);
    }
  },
  error: (...args: any[]) => {
    if (currentLogLevel <= LOG_LEVELS.error) {
      console.error('[ERROR]', ...args);
    }
  },
};

export default logger;
