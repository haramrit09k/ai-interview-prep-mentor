// src/logger.ts

const LOG_LEVEL = import.meta.env.VITE_APP_LOG_LEVEL || 'info'; // Default to 'info'
const BACKEND_LOGGING_ENABLED = import.meta.env.VITE_APP_BACKEND_LOGGING_ENABLED === 'true';
const BACKEND_LOG_ENDPOINT = '/api/log'; // Your backend logging endpoint

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const currentLogLevel = LOG_LEVELS[LOG_LEVEL.toLowerCase()] || LOG_LEVELS.info;

const sendLogToBackend = (level: keyof typeof LOG_LEVELS, message: string, context?: any) => {
  if (!BACKEND_LOGGING_ENABLED) {
    return;
  }

  // Only send logs to backend if their level is at or above the configured console log level
  // This prevents sending debug logs to backend if only info is desired for console
  if (LOG_LEVELS[level] < currentLogLevel) {
    return;
  }

  fetch(BACKEND_LOG_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ level, message, context, timestamp: new Date().toISOString() }),
  }).catch(err => {
    console.error('Failed to send log to backend:', err);
  });
};

const logger = {
  debug: (message: string, ...args: any[]) => {
    if (currentLogLevel <= LOG_LEVELS.debug) {
      console.debug('[DEBUG]', message, ...args);
    }
    sendLogToBackend('debug', message, args);
  },
  info: (message: string, ...args: any[]) => {
    if (currentLogLevel <= LOG_LEVELS.info) {
      console.info('[INFO]', message, ...args);
    }
    sendLogToBackend('info', message, args);
  },
  warn: (message: string, ...args: any[]) => {
    if (currentLogLevel <= LOG_LEVELS.warn) {
      console.warn('[WARN]', message, ...args);
    }
    sendLogToBackend('warn', message, args);
  },
  error: (message: string, ...args: any[]) => {
    if (currentLogLevel <= LOG_LEVELS.error) {
      console.error('[ERROR]', message, ...args);
    }
    sendLogToBackend('error', message, args);
  },
};

export default logger;