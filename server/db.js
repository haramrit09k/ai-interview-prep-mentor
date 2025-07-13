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
        const trimmedText = text.trim().toUpperCase();
        // Treat SELECT and PRAGMA queries as ones that return rows
        const isSelect = trimmedText.startsWith('SELECT') || trimmedText.startsWith('PRAGMA');
        if (isSelect) {
          sqlite.all(text, params, (err, rows) => {
            if (err) {
              logger.error('SQLite SELECT query failed:', { text, params, error: err.message });
              reject(err);
            }
            else {
              logger.debug('SQLite SELECT query successful:', { text, rows: (rows || []).length });
              resolve({ rows: rows || [] });
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
  .then(() => {
    logger.info('Users table checked/created');

    // Handle column additions based on database type
    if (isProduction) {
      // PostgreSQL: Use ALTER TABLE IF NOT EXISTS ADD COLUMN
      return Promise.all([
        db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_seen_welcome_modal BOOLEAN DEFAULT FALSE;`),
        db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS unanswered_questions TEXT;`)
      ]);
    } else {
      // SQLite: Use PRAGMA table_info check before ALTER TABLE ADD COLUMN
      return db.query("PRAGMA table_info(users);")
        .then(result => {
          const columns = result.rows;
          const promises = [];

          // Add has_seen_welcome_modal column
          const hasSeenWelcomeModalExists = columns.some(col => col.name === 'has_seen_welcome_modal');
          if (!hasSeenWelcomeModalExists) {
            logger.info('Adding has_seen_welcome_modal column to users table.');
            promises.push(db.query(`ALTER TABLE users ADD COLUMN has_seen_welcome_modal BOOLEAN DEFAULT FALSE;`));
          } else {
            logger.info('has_seen_welcome_modal column already exists.');
          }

          // Add unanswered_questions column
          const unansweredQuestionsExists = columns.some(col => col.name === 'unanswered_questions');
          if (!unansweredQuestionsExists) {
            logger.info('Adding unanswered_questions column to users table.');
            promises.push(db.query(`ALTER TABLE users ADD COLUMN unanswered_questions TEXT;`));
          } else {
            logger.info('unanswered_questions column already exists.');
          }
          return Promise.all(promises);
        });
    }
  })
  .then(() => logger.info('Database schema initialization complete.'))
  .catch(err => logger.error('Error initializing database schema', err));

module.exports = db;