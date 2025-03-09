const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

// Database file path
const DB_PATH = path.join(__dirname, '.token-store.db');

// Flag to indicate if we should migrate from file-based token storage
const shouldMigrate = !fs.existsSync(DB_PATH) && fs.existsSync(path.join(__dirname, '.token-cache.json'));

// Create or open the database
const db = new sqlite3.Database(DB_PATH);

/**
 * Initialize the database schema
 * @returns {Promise<void>}
 */
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE,
          password_hash TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating users table:', err);
          return reject(err);
        }
      });

      // Create tokens table
      db.run(`
        CREATE TABLE IF NOT EXISTS tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          expiry_date INTEGER,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating tokens table:', err);
          return reject(err);
        }
        
        // Migrate tokens if needed
        if (shouldMigrate) {
          migrateTokens().then(resolve).catch(reject);
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * Migrate tokens from file-based storage to database
 * @returns {Promise<void>}
 */
function migrateTokens() {
  return new Promise((resolve, reject) => {
    try {
      // Read tokens from file
      const tokenPath = path.join(__dirname, '.token-cache.json');
      if (!fs.existsSync(tokenPath)) {
        return resolve();
      }

      const fileData = fs.readFileSync(tokenPath, { encoding: 'utf8' });
      const tokens = JSON.parse(fileData);

      // Create default user
      createDefaultUser()
        .then(userId => {
          // Save tokens to database
          saveTokens(tokens, userId)
            .then(() => {
              console.log('Tokens migrated from file to database');
              // Rename the old token file as backup
              fs.renameSync(tokenPath, `${tokenPath}.bak`);
              resolve();
            })
            .catch(error => {
              console.error('Error saving migrated tokens:', error);
              reject(error);
            });
        })
        .catch(error => {
          console.error('Error creating default user for migration:', error);
          reject(error);
        });
    } catch (error) {
      console.error('Error migrating tokens:', error);
      reject(error);
    }
  });
}

/**
 * Create a default user for token migration
 * @returns {Promise<number>} The user ID
 */
function createDefaultUser() {
  return new Promise((resolve, reject) => {
    // Generate a random password for the default user
    const randomPassword = Math.random().toString(36).substring(2, 15);
    const email = 'default@example.com';

    // Check if user already exists
    db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
      if (err) {
        return reject(err);
      }

      if (row) {
        // User already exists, return the ID
        return resolve(row.id);
      }

      // Create a new user
      bcrypt.hash(randomPassword, 10, (err, hash) => {
        if (err) {
          return reject(err);
        }

        db.run(
          'INSERT INTO users (email, password_hash) VALUES (?, ?)',
          [email, hash],
          function(err) {
            if (err) {
              return reject(err);
            }
            resolve(this.lastID);
          }
        );
      });
    });
  });
}

/**
 * Save tokens to the database
 * @param {Object} tokens - The tokens object to save
 * @param {number} userId - The user ID to associate with the tokens
 * @returns {Promise<void>}
 */
function saveTokens(tokens, userId = 1) {
  return new Promise((resolve, reject) => {
    if (!tokens) {
      return reject(new Error('No tokens provided'));
    }

    // Check if tokens already exist for this user
    db.get('SELECT id FROM tokens WHERE user_id = ?', [userId], (err, row) => {
      if (err) {
        return reject(err);
      }

      const accessToken = tokens.access_token;
      const refreshToken = tokens.refresh_token;
      const expiryDate = tokens.expiry_date;

      if (row) {
        // Update existing tokens
        db.run(
          'UPDATE tokens SET access_token = ?, refresh_token = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
          [accessToken, refreshToken, expiryDate, userId],
          (err) => {
            if (err) {
              return reject(err);
            }
            resolve();
          }
        );
      } else {
        // Insert new tokens
        db.run(
          'INSERT INTO tokens (user_id, access_token, refresh_token, expiry_date) VALUES (?, ?, ?, ?)',
          [userId, accessToken, refreshToken, expiryDate],
          (err) => {
            if (err) {
              return reject(err);
            }
            resolve();
          }
        );
      }
    });
  });
}

/**
 * Load tokens from the database
 * @param {number} userId - The user ID to load tokens for
 * @returns {Promise<Object|null>} The tokens object or null if not found
 */
function loadTokens(userId = 1) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT access_token, refresh_token, expiry_date FROM tokens WHERE user_id = ?',
      [userId],
      (err, row) => {
        if (err) {
          return reject(err);
        }

        if (!row) {
          return resolve(null);
        }

        const tokens = {
          access_token: row.access_token,
          refresh_token: row.refresh_token,
          expiry_date: row.expiry_date
        };

        resolve(tokens);
      }
    );
  });
}

/**
 * Delete tokens for a user
 * @param {number} userId - The user ID to delete tokens for
 * @returns {Promise<void>}
 */
function deleteTokens(userId = 1) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM tokens WHERE user_id = ?', [userId], (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

/**
 * Close the database connection
 */
function closeDatabase() {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    }
  });
}

// Export functions
module.exports = {
  initDatabase,
  saveTokens,
  loadTokens,
  deleteTokens,
  closeDatabase
};