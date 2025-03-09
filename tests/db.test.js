const { initDatabase, saveTokens, loadTokens, deleteTokens } = require('../db');
const path = require('path');
const fs = require('fs');

// Use an in-memory SQLite database for testing
jest.mock('sqlite3', () => ({
  verbose: jest.fn(() => ({
    Database: jest.fn(() => ({
      serialize: jest.fn(callback => callback()),
      run: jest.fn((query, params, callback) => {
        if (callback) callback(null);
      }),
      get: jest.fn((query, params, callback) => {
        if (callback) {
          // Mock data for different queries
          if (query.includes('SELECT id FROM tokens')) {
            callback(null, { id: 1 });
          } else if (query.includes('SELECT access_token')) {
            callback(null, {
              access_token: 'mock-access-token',
              refresh_token: 'mock-refresh-token',
              expiry_date: Date.now() + 3600000
            });
          } else if (query.includes('SELECT id FROM users')) {
            callback(null, { id: 1 });
          } else {
            callback(null, null);
          }
        }
      }),
      close: jest.fn(callback => {
        if (callback) callback(null);
      })
    }))
  }))
}));

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue('{}'),
  writeFileSync: jest.fn(),
  renameSync: jest.fn()
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn((password, saltRounds, callback) => {
    callback(null, 'mock-hashed-password');
  })
}));

describe('Database Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('initDatabase should create tables and resolve', async () => {
    await expect(initDatabase()).resolves.not.toThrow();
  });

  test('saveTokens should save tokens to database', async () => {
    const tokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expiry_date: Date.now() + 3600000
    };

    await expect(saveTokens(tokens)).resolves.not.toThrow();
  });

  test('loadTokens should load tokens from database', async () => {
    const tokens = await loadTokens();
    
    expect(tokens).toHaveProperty('access_token');
    expect(tokens).toHaveProperty('refresh_token');
    expect(tokens).toHaveProperty('expiry_date');
  });

  test('deleteTokens should delete tokens from database', async () => {
    await expect(deleteTokens()).resolves.not.toThrow();
  });

  test('saveTokens should reject if no tokens provided', async () => {
    await expect(saveTokens(null)).rejects.toThrow('No tokens provided');
  });
});