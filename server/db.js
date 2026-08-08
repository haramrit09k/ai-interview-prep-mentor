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

const createQuestionsTableSql = isProduction
  ? `CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      level TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      UNIQUE(text, skill_id, level)
    );`
  : `CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      level TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      UNIQUE(text, skill_id, level)
    );`;

const createUserUnansweredTableSql = `
  CREATE TABLE IF NOT EXISTS user_unanswered_questions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, question_id)
  );
`;

async function migrateUnansweredQuestionsToNormalizedTables() {
  try {
    const { rows: users } = await db.query('SELECT id, unanswered_questions FROM users WHERE unanswered_questions IS NOT NULL');
    let migratedCount = 0;
    for (const user of users) {
      if (!user.unanswered_questions) continue;
      let questionMap;
      try {
        questionMap = JSON.parse(user.unanswered_questions);
      } catch (e) {
        logger.warn(`Migration: failed to parse unanswered_questions for user ${user.id}`);
        continue;
      }
      for (const [skillId, levelMap] of Object.entries(questionMap)) {
        for (const [level, questions] of Object.entries(levelMap)) {
          for (const question of questions) {
            if (!question.text) continue;
            try {
              if (isProduction) {
                await db.query(
                  'INSERT INTO questions (text, level, skill_id) VALUES ($1, $2, $3) ON CONFLICT (text, skill_id, level) DO NOTHING',
                  [question.text, level, skillId]
                );
              } else {
                await db.query(
                  'INSERT OR IGNORE INTO questions (text, level, skill_id) VALUES ($1, $2, $3)',
                  [question.text, level, skillId]
                );
              }
              const { rows: qRows } = await db.query(
                'SELECT id FROM questions WHERE text = $1 AND skill_id = $2 AND level = $3',
                [question.text, skillId, level]
              );
              if (qRows.length === 0) continue;
              const questionId = qRows[0].id;
              if (isProduction) {
                await db.query(
                  'INSERT INTO user_unanswered_questions (user_id, question_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                  [user.id, questionId]
                );
              } else {
                await db.query(
                  'INSERT OR IGNORE INTO user_unanswered_questions (user_id, question_id) VALUES ($1, $2)',
                  [user.id, questionId]
                );
              }
              migratedCount++;
            } catch (e) {
              logger.warn(`Migration: failed to migrate question "${question.text}" for user ${user.id}: ${e.message}`);
            }
          }
        }
      }
    }
    if (migratedCount > 0) {
      logger.info(`Migration: migrated ${migratedCount} unanswered question records to normalized tables.`);
    }
  } catch (e) {
    logger.error('Migration: error migrating unanswered_questions:', e.message);
  }
}

db.query(createTableSql)
  .then(() => {
    logger.info('Users table checked/created');

    // Handle column additions based on database type
    if (isProduction) {
      // PostgreSQL: Use ALTER TABLE IF NOT EXISTS ADD COLUMN
      return Promise.all([
        db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_seen_welcome_modal BOOLEAN DEFAULT FALSE;`),
        db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS unanswered_questions TEXT;`),
        db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS revision_summaries TEXT;`)
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

          // Add revision_summaries column
          const revisionSummariesExists = columns.some(col => col.name === 'revision_summaries');
          if (!revisionSummariesExists) {
            logger.info('Adding revision_summaries column to users table.');
            promises.push(db.query(`ALTER TABLE users ADD COLUMN revision_summaries TEXT;`));
          } else {
            logger.info('revision_summaries column already exists.');
          }
          return Promise.all(promises);
        });
    }
  })
  .then(() => db.query(createQuestionsTableSql))
  .then(() => {
    logger.info('Questions table checked/created');
    return db.query(createUserUnansweredTableSql);
  })
  .then(() => {
    logger.info('UserUnansweredQuestions table checked/created');
    return migrateUnansweredQuestionsToNormalizedTables();
  })
  .then(() => logger.info('Database schema initialization complete.'))
  .catch(err => logger.error('Error initializing database schema', err));

module.exports = db;