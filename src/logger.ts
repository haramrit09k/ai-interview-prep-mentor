// src/logger.ts

const LOG_LEVEL = (import.meta as any).env.VITE_APP_LOG_LEVEL || 'info'; // Default to 'info'

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const currentLogLevel = LOG_LEVELS[LOG_LEVEL.toLowerCase() as keyof typeof LOG_LEVELS] || LOG_LEVELS.info;

const logger = {
  debug: (message: string, ...args: any[]) => {
    if (currentLogLevel <= LOG_LEVELS.debug) {
      console.debug('[DEBUG]', message, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    if (currentLogLevel <= LOG_LEVELS.info) {
      console.info('[INFO]', message, ...args);
    }
  },
  warn: (message: string, ...args: any[]) => {
    if (currentLogLevel <= LOG_LEVELS.warn) {
      console.warn('[WARN]', message, ...args);
    }
  },
  error: (message: string, ...args: any[]) => {
    if (currentLogLevel <= LOG_LEVELS.error) {
      console.error('[ERROR]', message, ...args);
    }
  },
};

export default logger;