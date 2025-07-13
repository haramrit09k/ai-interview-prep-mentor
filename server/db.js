const isProduction = process.env.NODE_ENV === 'production';
const logger = require('./logger');

let db;

if (isProduction) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for Heroku
    }
  });
  db = {
    query: async (text, params) => {
      logger.debug('Executing PG query:', { text, params });
      try {
        const result = await pool.query(text, params);
        logger.debug('PG query successful:', { text, rows: result.rows.length });
        return result;
      } catch (err) {
        logger.error('PG query failed:', { text, params, error: err.message });
        throw err;
      }
    }
  };
} else {
  const sqlite3 = require('sqlite3').verbose();
  // Use a file for development, or ':memory:' for in-memory
  const sqliteDbPath = process.env.SQLITE_DB_PATH || './dev.sqlite';
  const sqlite = new sqlite3.Database(sqliteDbPath, (err) => {
    if (err) {
      logger.error('Could not connect to SQLite database', err);
    } else {
      logger.info('Connected to SQLite database');
    }
  });

  db = {
    query: (text, params) => {
      logger.debug('Executing SQLite query:', { text, params });
      return new Promise((resolve, reject) => {
        const isSelect = text.trim().toUpperCase().startsWith('SELECT');
        if (isSelect) {
          sqlite.all(text, params, (err, rows) => {
            if (err) {
              logger.error('SQLite SELECT query failed:', { text, params, error: err.message });
              reject(err);
            }
            else {
              logger.debug('SQLite SELECT query successful:', { text, rows: rows.length });
              resolve({ rows });
            }
          });
        } else {
          sqlite.run(text, params, function (err) {
            if (err) {
              logger.error('SQLite DML query failed:', { text, params, error: err.message });
              reject(err);
            }
            else {
              logger.debug('SQLite DML query successful:', { text, changes: this.changes });
              resolve({ rowCount: this.changes });
            }
          });
        }
      });
    }
  };
}

// Create the users table if it doesn't exist
// Use a more generic SQL for date type (TEXT for ISO string)
const createTableSql = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    questions_used INTEGER DEFAULT 0,
    last_reset_date TEXT NOT NULL,
    has_seen_welcome_modal BOOLEAN DEFAULT FALSE
  );
`;

db.query(createTableSql)
  .then(() => logger.info('Users table checked/created'))
  .catch(err => logger.error('Error creating users table', err));

// Add has_seen_welcome_modal column if it doesn't exist
db.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_seen_welcome_modal BOOLEAN DEFAULT FALSE;
`)
  .then(() => logger.info('Added has_seen_welcome_modal column to users table if not exists'))
  .catch(err => logger.error('Error adding has_seen_welcome_modal column', err));

module.exports = db;