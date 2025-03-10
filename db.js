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
      });
      
      // Create webhooks table
      db.run(`
        CREATE TABLE IF NOT EXISTS webhooks (
          id TEXT PRIMARY KEY,
          resource_id TEXT NOT NULL,
          address TEXT NOT NULL,
          expiration INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating webhooks table:', err);
          return reject(err);
        }
      });
      
      // Create sync tokens table
      db.run(`
        CREATE TABLE IF NOT EXISTS sync_tokens (
          webhook_id TEXT PRIMARY KEY,
          sync_token TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating sync_tokens table:', err);
          return reject(err);
        }
      });
      
      // Create reminders sent table
      db.run(`
        CREATE TABLE IF NOT EXISTS reminders_sent (
          webhook_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (webhook_id, event_id)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating reminders_sent table:', err);
          return reject(err);
        }
      });
      
      // Create API keys table
      db.run(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT,
          is_active INTEGER DEFAULT 1
        )
      `, (err) => {
        if (err) {
          console.error('Error creating api_keys table:', err);
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

/**
 * Save webhook information to the database
 * @param {Object} webhook - The webhook object to save
 * @returns {Promise<void>}
 */
function saveWebhook(webhook) {
  return new Promise((resolve, reject) => {
    if (!webhook || !webhook.id || !webhook.resourceId || !webhook.address || !webhook.expiration) {
      return reject(new Error('Invalid webhook data'));
    }

    db.run(
      'INSERT OR REPLACE INTO webhooks (id, resource_id, address, expiration) VALUES (?, ?, ?, ?)',
      [webhook.id, webhook.resourceId, webhook.address, webhook.expiration],
      (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
}

/**
 * Get webhook information from the database
 * @param {string} id - The webhook ID
 * @returns {Promise<Object|null>} The webhook object or null if not found
 */
function getWebhook(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM webhooks WHERE id = ?', [id], (err, row) => {
      if (err) {
        return reject(err);
      }
      
      if (!row) {
        return resolve(null);
      }
      
      resolve({
        id: row.id,
        resourceId: row.resource_id,
        address: row.address,
        expiration: row.expiration,
        createdAt: row.created_at
      });
    });
  });
}

/**
 * Get all webhooks from the database
 * @returns {Promise<Object[]>} Array of webhook objects
 */
function getAllWebhooks() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM webhooks', (err, rows) => {
      if (err) {
        return reject(err);
      }
      
      if (!rows || rows.length === 0) {
        return resolve([]);
      }
      
      const webhooks = rows.map(row => ({
        id: row.id,
        resourceId: row.resource_id,
        address: row.address,
        expiration: row.expiration,
        createdAt: row.created_at
      }));
      
      resolve(webhooks);
    });
  });
}

/**
 * Delete a webhook from the database
 * @param {string} id - The webhook ID
 * @returns {Promise<void>}
 */
function deleteWebhook(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM webhooks WHERE id = ?', [id], (err) => {
      if (err) {
        return reject(err);
      }
      
      // Also delete associated sync tokens and reminders
      db.run('DELETE FROM sync_tokens WHERE webhook_id = ?', [id]);
      db.run('DELETE FROM reminders_sent WHERE webhook_id = ?', [id]);
      
      resolve();
    });
  });
}

/**
 * Save a sync token for a webhook
 * @param {string} webhookId - The webhook ID
 * @param {string} syncToken - The sync token
 * @returns {Promise<void>}
 */
function saveSyncToken(webhookId, syncToken) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO sync_tokens (webhook_id, sync_token, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [webhookId, syncToken],
      (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
}

/**
 * Get a sync token for a webhook
 * @param {string} webhookId - The webhook ID
 * @returns {Promise<string|null>} The sync token or null if not found
 */
function getSyncToken(webhookId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT sync_token FROM sync_tokens WHERE webhook_id = ?', [webhookId], (err, row) => {
      if (err) {
        return reject(err);
      }
      
      resolve(row ? row.sync_token : null);
    });
  });
}

/**
 * Delete a sync token for a webhook
 * @param {string} webhookId - The webhook ID
 * @returns {Promise<void>}
 */
function deleteSyncToken(webhookId) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM sync_tokens WHERE webhook_id = ?', [webhookId], (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

/**
 * Save a record that a reminder was sent
 * @param {string} webhookId - The webhook ID
 * @param {string} eventId - The event ID
 * @returns {Promise<void>}
 */
function saveReminderSent(webhookId, eventId) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO reminders_sent (webhook_id, event_id) VALUES (?, ?)',
      [webhookId, eventId],
      (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
}

/**
 * Get list of event IDs that have had reminders sent
 * @param {string} webhookId - The webhook ID
 * @returns {Promise<string[]>} Array of event IDs
 */
function getRemindersSent(webhookId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT event_id FROM reminders_sent WHERE webhook_id = ?', [webhookId], (err, rows) => {
      if (err) {
        return reject(err);
      }
      
      resolve(rows ? rows.map(row => row.event_id) : []);
    });
  });
}

/**
 * Generate and save a new API key
 * @param {string} name - Name or description for the API key
 * @param {string} expiresAt - Optional expiration date (ISO string)
 * @returns {Promise<Object>} The generated API key object
 */
function generateApiKey(name, expiresAt = null) {
  return new Promise((resolve, reject) => {
    if (!name) {
      return reject(new Error('API key name is required'));
    }

    // Generate a random API key
    const crypto = require('crypto');
    const key = `mcp_${crypto.randomBytes(24).toString('hex')}`;
    
    // Save to database
    db.run(
      'INSERT INTO api_keys (key, name, expires_at) VALUES (?, ?, ?)',
      [key, name, expiresAt],
      function(err) {
        if (err) {
          return reject(err);
        }
        
        resolve({
          id: this.lastID,
          key,
          name,
          expiresAt,
          isActive: 1,
          createdAt: new Date().toISOString()
        });
      }
    );
  });
}

/**
 * Validate an API key
 * @param {string} key - The API key to validate
 * @returns {Promise<boolean>} True if the key is valid
 */
function validateApiKey(key) {
  return new Promise((resolve, reject) => {
    if (!key) {
      return resolve(false);
    }
    
    db.get(
      'SELECT * FROM api_keys WHERE key = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime("now"))',
      [key],
      (err, row) => {
        if (err) {
          return reject(err);
        }
        
        resolve(Boolean(row));
      }
    );
  });
}

/**
 * List all API keys
 * @returns {Promise<Array>} List of API key objects
 */
function listApiKeys() {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT id, key, name, created_at, expires_at, is_active FROM api_keys',
      (err, rows) => {
        if (err) {
          return reject(err);
        }
        
        const keys = rows.map(row => ({
          id: row.id,
          key: row.key.substring(0, 10) + '...',  // Don't return full key for security
          name: row.name,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          isActive: Boolean(row.is_active)
        }));
        
        resolve(keys);
      }
    );
  });
}

/**
 * Revoke (deactivate) an API key
 * @param {number} id - The API key ID to revoke
 * @returns {Promise<boolean>} True if successful
 */
function revokeApiKey(id) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE api_keys SET is_active = 0 WHERE id = ?',
      [id],
      function(err) {
        if (err) {
          return reject(err);
        }
        
        resolve(this.changes > 0);
      }
    );
  });
}

// Export functions
module.exports = {
  initDatabase,
  saveTokens,
  loadTokens,
  deleteTokens,
  closeDatabase,
  saveWebhook,
  getWebhook,
  getAllWebhooks,
  deleteWebhook,
  saveSyncToken,
  getSyncToken,
  deleteSyncToken,
  saveReminderSent,
  getRemindersSent,
  generateApiKey,
  validateApiKey,
  listApiKeys,
  revokeApiKey
};