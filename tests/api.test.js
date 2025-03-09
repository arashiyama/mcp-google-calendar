const request = require('supertest');
const { app, ErrorTypes } = require('../app');

// We need to mock the module differently
// First, create a mock tokens value that we'll use in the tests
let mockTokens = null;

// Then mock the entire module
jest.mock('../app', () => {
  const originalModule = jest.requireActual('../app');
  return {
    ...originalModule,
    // Override this getter to return our mockTokens variable
    get tokens() {
      return mockTokens;
    }
  };
});

describe('API Endpoints', () => {
  
  describe('GET /mcp/definition', () => {
    it('should return the MCP definition', async () => {
      const res = await request(app).get('/mcp/definition');
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('name', 'Google Calendar MCP');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('actions');
      expect(res.body.actions).toHaveProperty('list_events');
      expect(res.body.actions).toHaveProperty('create_event');
      expect(res.body.actions).toHaveProperty('get_event');
      expect(res.body.actions).toHaveProperty('update_event');
      expect(res.body.actions).toHaveProperty('delete_event');
      expect(res.body.actions).toHaveProperty('find_duplicates');
    });
  });
  
  describe('POST /mcp/execute', () => {
    it('should return error for missing action', async () => {
      const res = await request(app)
        .post('/mcp/execute')
        .send({
          parameters: {}
        });
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('error_type', ErrorTypes.VALIDATION);
      expect(res.body.error).toContain('Missing required field: action');
    });
    
    // Authentication tests moved to auth.test.js
    
    it('should return error for unknown action', async () => {
      // Set mock tokens for this test
      mockTokens = { access_token: 'mock-token', expiry_date: Date.now() + 3600000 };
      
      const res = await request(app)
        .post('/mcp/execute')
        .send({
          action: 'non_existent_action',
          parameters: {}
        });
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('error_type', ErrorTypes.VALIDATION);
      expect(res.body.error).toContain('Unknown action');
    });
  });
});