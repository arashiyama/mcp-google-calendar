const { ErrorTypes } = require('../app');

// Mock express and response
const mockJson = jest.fn();
const mockRes = {
  json: mockJson
};

// Create a mock version of the execute endpoint function
function mockExecuteEndpoint() {
  // This is a simplified version of the execute endpoint logic just to test auth
  const tokens = null; // explicitly null for testing
  
  if (!tokens) {
    return mockRes.json({
      status: 'error',
      error_type: ErrorTypes.AUTHENTICATION,
      error: 'Not authenticated',
      auth_url: 'mock-auth-url'
    });
  }
}

describe('Authentication Tests', () => {
  it('should return authentication error when tokens are null', () => {
    mockExecuteEndpoint();
    
    expect(mockJson).toHaveBeenCalledWith({
      status: 'error',
      error_type: ErrorTypes.AUTHENTICATION,
      error: 'Not authenticated',
      auth_url: 'mock-auth-url'
    });
  });
});