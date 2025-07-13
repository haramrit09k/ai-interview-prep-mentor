const isProduction = process.env.NODE_ENV === 'production';

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
    query: (text, params) => pool.query(text, params)
  };
} else {
  const sqlite3 = require('sqlite3').verbose();
  // Use a file for development, or ':memory:' for in-memory
  const sqliteDbPath = process.env.SQLITE_DB_PATH || './dev.sqlite';
  const sqlite = new sqlite3.Database(sqliteDbPath, (err) => {
    if (err) {
      console.error('Could not connect to SQLite database', err);
    } else {
      console.log('Connected to SQLite database');
    }
  });

  db = {
    query: (text, params) => {
      return new Promise((resolve, reject) => {
        // Determine if it's a SELECT query
        const isSelect = text.trim().toUpperCase().startsWith('SELECT');
        if (isSelect) {
          sqlite.all(text, params, (err, rows) => {
            if (err) reject(err);
            else resolve({ rows }); // Emulate pg.Pool result structure
          });
        } else {
          sqlite.run(text, params, function (err) { // Use 'function' for 'this' context
            if (err) reject(err);
            else resolve({ rowCount: this.changes }); // Emulate pg.Pool result structure (approx)
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
  .then(() => console.log('Users table checked/created'))
  .catch(err => console.error('Error creating users table', err));

// Add has_seen_welcome_modal column if it doesn't exist
db.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_seen_welcome_modal BOOLEAN DEFAULT FALSE;
`)
  .then(() => console.log('Added has_seen_welcome_modal column to users table if not exists'))
  .catch(err => console.error('Error adding has_seen_welcome_modal column', err));

module.exports = db;